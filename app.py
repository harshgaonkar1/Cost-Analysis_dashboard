from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import pandas as pd
import io
import re
import json
import zipfile
import traceback

app = Flask(__name__)
CORS(app)


class AppError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def check_file(file, label):
    if not file or not file.filename:
        raise AppError(f"'{label}' file is missing.")
    if not file.filename.endswith((".xlsx", ".xls")):
        raise AppError(f"'{label}': wrong file type. Upload .xlsx or .xls.")
    data = file.read()
    if len(data) / 1024 / 1024 > 20:
        raise AppError(f"'{label}' exceeds 20 MB limit.")
    return io.BytesIO(data)


def read_sheets(buf, label):
    try:
        sheets = pd.read_excel(buf, sheet_name=None, engine="openpyxl")
    except Exception:
        raise AppError(f"Can't read '{label}' — corrupt or password-protected?")
    frames = [df for df in sheets.values() if not df.empty]
    if not frames:
        raise AppError(f"All sheets in '{label}' are empty.")
    df = pd.concat(frames, ignore_index=True)
    df.columns = df.columns.str.strip()
    return df


def read_named_sheet(buf, label, sheet_name):
    try:
        sheets = pd.read_excel(buf, sheet_name=None, engine="openpyxl")
    except Exception:
        raise AppError(f"Can't read '{label}' — corrupt or password-protected?")
    normalized = {str(name).strip().lower(): name for name in sheets.keys()}
    selected_key = normalized.get(str(sheet_name).strip().lower())
    if selected_key is None:
        raise AppError(f"'{label}' does not contain the sheet '{sheet_name}'.")
    df = sheets[selected_key]
    if df.empty:
        raise AppError(f"Sheet '{sheet_name}' in '{label}' is empty.")
    df.columns = df.columns.str.strip()
    return df


def _is_blank(value):
    if pd.isna(value):
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def _is_number(value):
    if isinstance(value, (int, float)):
        return not pd.isna(value)
    if isinstance(value, str):
        text = value.strip().replace(",", "")
        if not text:
            return False
        try:
            float(text)
            return True
        except ValueError:
            return False
    return False


def drop_numeric_only_rows(df):
    keep_mask = []
    for _, row in df.iterrows():
        non_blank_values = [v for v in row.tolist() if not _is_blank(v)]
        remove_row = len(non_blank_values) == 1 and _is_number(non_blank_values[0])
        keep_mask.append(not remove_row)
    return df.loc[keep_mask].reset_index(drop=True)


def need_cols(df, cols, label):
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise AppError(f"'{label}' missing column(s): {missing}. Found: {list(df.columns)}")


def apply_suspension_logic(df: pd.DataFrame) -> pd.DataFrame:
    if 'FQC VERIFICATION' not in df.columns:
        df['FQC VERIFICATION'] = ''

    def _resolve(row):
        part_cat = str(row.get('PART CAT', '') or '').strip().lower()
        supplier = str(row.get('SUPPLIER', '') or '').strip().lower()

        if part_cat == 'suspension rod' and supplier == 'samco':
            serial   = str(row.get('M/C  SL.NO.', '') or '').strip()
            year_str = serial[6:8] if len(serial) >= 8 else ''
            if year_str.isdigit():
                return 'APPROVED' if int(year_str) <= 22 else "Samco stopped in Feb'22.cannot be used"
            return "Samco stopped in Feb'22.cannot be used"

        return row.get('FQC VERIFICATION', '')

    df['FQC VERIFICATION'] = df.apply(_resolve, axis=1)
    return df


def is_approved(row) -> bool:
    return str(row.get("FQC VERIFICATION", "")).strip().lower() == "approved"


def get_sheet_name(part_code: str) -> str:
    code = str(part_code or '').strip().upper()
    if code.startswith('FL') or code.startswith('UF'):
        return 'FL & UF'
    if code.startswith('TL'):
        return 'TL'
    if code.startswith('DV'):
        return 'DV'
    if code.startswith('MW') or code.startswith('MD'):
        return 'MW & MD'
    return 'Others'


# ---------------------------------------------------------------------------
# Location prefix extraction
# ---------------------------------------------------------------------------

# Known suffixes to strip when extracting the location word
_VENDOR_SUFFIXES = re.compile(
    r'\s+(branch|mahavir|techno)\s*$', re.IGNORECASE
)


def extract_location(filename: str) -> str:
    """
    'Punjab Branch.xlsx'  -> 'punjab'
    'Patna Mahavir.xlsx'  -> 'patna'
    'Goa Techno.xlsx'     -> 'goa'
    Multi-word: 'New Delhi Branch.xlsx' -> 'new delhi'
    """
    name = re.sub(r'\.(xlsx?|xls)$', '', filename, flags=re.IGNORECASE).strip()
    location = _VENDOR_SUFFIXES.sub('', name).strip().lower()
    return location


def group_files_by_location(files, vendor_suffix: str) -> dict[str, list]:
    """
    Given a list of uploaded FileStorage objects for one vendor,
    return {location_key: [FileStorage, ...]}
    """
    groups: dict[str, list] = {}
    for f in files:
        if not f or not f.filename:
            continue
        loc = extract_location(f.filename)
        groups.setdefault(loc, []).append(f)
    return groups


# ---------------------------------------------------------------------------
# Core processing for one branch set
# ---------------------------------------------------------------------------

def process_one_branch(
    branch_files: list,
    mahavir_files: list,
    techno_files: list,
    location_label: str,
) -> io.BytesIO:
    """
    Process one location's worth of files and return an in-memory Excel workbook.
    """

    def read_file_list(file_list, vendor_label):
        frames = []
        for f in file_list:
            data = f.read()
            buf = io.BytesIO(data)
            df = read_sheets(buf, f"{vendor_label} ({f.filename})")
            frames.append(df)
        if not frames:
            raise AppError(f"No readable files for {vendor_label} in location '{location_label}'.")
        combined = pd.concat(frames, ignore_index=True)
        combined.columns = combined.columns.str.strip()
        return combined

    branch  = read_file_list(branch_files,  'branch')
    mahavir = read_file_list(mahavir_files, 'mahavir')
    techno  = read_file_list(techno_files,  'techno')

    # Column checks
    need_cols(branch,  ['comp', 'TRF. PRICE'], f'branch ({location_label})')
    need_cols(mahavir, ['comp'],                f'mahavir ({location_label})')
    need_cols(techno,  ['comp'],                f'techno ({location_label})')

    # Combine mahavir + techno, deduplicate by comp
    combined = pd.concat([mahavir, techno], ignore_index=True)
    combined = combined.drop_duplicates(subset=['comp'], keep='first')
    combined = combined.drop(columns=['TP Price'], errors='ignore')

    FQC_MAP = {
        'dg':           'DAMAGED',
        'mp':           'MISSING PART',
        'ng':           'NON GENUINE',
        'non-genuine':  'NON GENUINE',
        'og':           'OUT OF WARRANTY',
        'out warranty': 'OUT OF WARRANTY',
    }
    if 'FQC VERIFICATION' in combined.columns:
        def normalize_fqc(val):
            if pd.isna(val):
                return val
            stripped = str(val).strip()
            return FQC_MAP.get(stripped.lower(), stripped)
        combined['FQC VERIFICATION'] = combined['FQC VERIFICATION'].apply(normalize_fqc)

    branch_cols_normalized = {c.strip().lower() for c in branch.columns}
    new_cols_from_combined = [
        c for c in combined.columns
        if c != 'comp' and c.strip().lower() not in branch_cols_normalized
    ]
    combined_slim = combined[['comp'] + new_cols_from_combined]

    merged = branch.merge(combined_slim, on='comp', how='left')

    if merged['comp'].isna().all():
        raise AppError(
            f"No matching 'comp' values found for '{location_label}' — "
            "check column values match across files."
        )

    # Suspension logic
    merged = apply_suspension_logic(merged)

    # Credit / Debit
    need_cols(merged, ['TRF. PRICE'], f'merged result ({location_label})')
    merged['TRF. PRICE'] = pd.to_numeric(merged['TRF. PRICE'], errors='coerce').fillna(0)
    merged['Credit'] = merged.apply(lambda r: r['TRF. PRICE'] if is_approved(r) else 0, axis=1)
    merged['Debit']  = merged.apply(lambda r: r['TRF. PRICE'] if not is_approved(r) else 0, axis=1)

    # Split by PART CODE prefix
    SHEET_ORDER = ['FL & UF', 'TL', 'DV', 'MW & MD', 'Others']
    if 'PART CODE' in merged.columns:
        merged['_sheet'] = merged['PART CODE'].apply(get_sheet_name)
    else:
        merged['_sheet'] = 'Others'

    merged['_approved'] = merged.apply(is_approved, axis=1)

    out = io.BytesIO()
    with pd.ExcelWriter(out, engine='openpyxl') as writer:
        sheets_written = []
        for sheet_name in SHEET_ORDER:
            subset = merged[merged['_sheet'] == sheet_name].drop(columns=['_sheet', '_approved'])
            if not subset.empty:
                subset.to_excel(writer, sheet_name=sheet_name, index=False)
                sheets_written.append(sheet_name)

        if not sheets_written:
            merged.drop(columns=['_sheet', '_approved']).to_excel(
                writer, sheet_name='Sheet1', index=False
            )

        non_approved = merged[~merged['_approved']].drop(columns=['_sheet', '_approved'])
        if not non_approved.empty:
            non_approved.to_excel(writer, sheet_name='Deduction', index=False)

    out.seek(0)
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/process', methods=['POST'])
def process_files():
    try:
        branch_files  = request.files.getlist('branch')
        mahavir_files = request.files.getlist('mahavir')
        techno_files  = request.files.getlist('techno')

        if not branch_files or all(not f.filename for f in branch_files):
            raise AppError("No branch files uploaded.")
        if not mahavir_files or all(not f.filename for f in mahavir_files):
            raise AppError("No mahavir files uploaded.")
        if not techno_files or all(not f.filename for f in techno_files):
            raise AppError("No techno files uploaded.")

        branch_groups  = group_files_by_location(branch_files,  'branch')
        mahavir_groups = group_files_by_location(mahavir_files, 'mahavir')
        techno_groups  = group_files_by_location(techno_files,  'techno')

        locations = sorted(branch_groups.keys())
        if not locations:
            raise AppError("Could not detect any location prefixes from branch filenames.")

        results: dict[str, io.BytesIO] = {}
        errors:  list[str] = []

        for loc in locations:
            m_files = mahavir_groups.get(loc)
            t_files = techno_groups.get(loc)

            if not m_files:
                errors.append(f"'{loc.title()}': no matching Mahavir file found — skipped.")
                continue
            if not t_files:
                errors.append(f"'{loc.title()}': no matching Techno file found — skipped.")
                continue

            try:
                wb = process_one_branch(
                    branch_groups[loc], m_files, t_files, loc.title()
                )
                results[loc] = wb
            except AppError as e:
                errors.append(f"'{loc.title()}': {e}")
            except Exception:
                traceback.print_exc()
                errors.append(f"'{loc.title()}': unexpected error — check terminal.")

        if not results:
            raise AppError(
                "No branches could be processed. " +
                (" | ".join(errors) if errors else "")
            )

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for loc, wb in results.items():
                zf.writestr(f"updated_{loc}.xlsx", wb.read())

            # Include a small errors log if any branches were skipped
            if errors:
                zf.writestr("errors.txt", "\n".join(errors))

        zip_buf.seek(0)
        return send_file(
            zip_buf,
            download_name='updated_branches.zip',
            as_attachment=True,
            mimetype='application/zip'
        )

    except AppError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Unexpected server error — check the terminal."}), 500


@app.route("/sheet_names", methods=["POST"])
def sheet_names():
    """
    Given a list of uploaded files, return the sheet names found in each one,
    in the same order the files were uploaded:

        { "files": [ { "filename": "a.xlsx", "sheets": ["FL", "TL"] }, ... ] }

    If a file can't be read, its entry gets "sheets": [] and an "error" message
    instead of failing the whole request.
    """
    try:
        raw_files = request.files.getlist("files")
        uploads = [f for f in raw_files if f and f.filename]
        if not uploads:
            raise AppError("No files uploaded.")

        results = []
        for f in uploads:
            try:
                data = f.read()
                if not data:
                    results.append({"filename": f.filename, "sheets": [], "error": "File is empty."})
                    continue
                buf = io.BytesIO(data)
                xls = pd.ExcelFile(buf, engine="openpyxl")
                results.append({"filename": f.filename, "sheets": xls.sheet_names})
            except Exception:
                results.append({
                    "filename": f.filename,
                    "sheets": [],
                    "error": "Could not read this file — corrupt or password-protected?",
                })

        return jsonify({"files": results})

    except AppError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Unexpected server error — check the terminal."}), 500


@app.route("/compile", methods=["POST"])
def compile_spreadsheets():
    try:
        raw_files = request.files.getlist("files")
        uploads = [f for f in raw_files if f and f.filename]
        if not uploads:
            raise AppError("No files uploaded.")

        # sheet_selections is a JSON array of sheet names, one per uploaded file,
        # in the SAME order as the "files" list (per-file selection, not global).
        selections_raw = request.form.get("sheet_selections")
        if not selections_raw:
            raise AppError("No sheet selections received.")
        try:
            selections = json.loads(selections_raw)
        except Exception:
            raise AppError("Sheet selections payload is malformed.")

        if not isinstance(selections, list) or len(selections) != len(uploads):
            raise AppError("Sheet selections do not match the number of uploaded files.")

        frames = []
        skipped = []
        for f, sel_sheet in zip(uploads, selections):
            sel_sheet = (sel_sheet or "").strip()
            if not sel_sheet:
                skipped.append(f"'{f.filename}': no sheet selected — skipped.")
                continue
            try:
                data = f.read()
                if not data:
                    skipped.append(f"'{f.filename}': empty file — skipped.")
                    continue
                buf = io.BytesIO(data)
                df = pd.read_excel(buf, sheet_name=sel_sheet, engine="openpyxl")
                if df is None or df.empty:
                    skipped.append(f"'{f.filename}': sheet '{sel_sheet}' is empty — skipped.")
                    continue
                df.columns = df.columns.str.strip()
                frames.append(drop_numeric_only_rows(df))
            except Exception:
                skipped.append(f"'{f.filename}': could not read sheet '{sel_sheet}' — skipped.")
                continue

        if not frames:
            raise AppError(
                "Could not compile: none of the selected sheets were readable. " +
                (" | ".join(skipped) if skipped else "")
            )

        out_df = pd.concat(frames, ignore_index=True)
        out = io.BytesIO()
        out_df.to_excel(out, index=False, engine="openpyxl")
        out.seek(0)
        return send_file(
            out,
            download_name="compiled_output.xlsx",
            as_attachment=True,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    except AppError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Unexpected server error — check the terminal."}), 500


if __name__ == '__main__':
    app.run(debug=True)

# & d:/Cost-Analysis_dashboard/.venv/Scripts/Activate.ps1
