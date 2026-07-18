import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import MultiFileDropzone from "./MultiFileDropzone";

const API_COMPILE = "http://localhost:5000/compile";
const API_SHEET_NAMES = "http://localhost:5000/sheet_names";

// Stable-ish identity for a File object so we don't re-fetch sheet names
// for files that are already in the list.
function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export default function Compilation() {
  const [files, setFiles] = useState([]);
  // key -> { sheets: string[], selected: string, error?: string }
  const [sheetMeta, setSheetMeta] = useState({});
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState(null);

  // Whenever the file list changes: drop meta for removed files, and fetch
  // sheet names for any newly added files.
  useEffect(() => {
    const validKeys = new Set(files.map(fileKey));

    setSheetMeta((prev) => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) {
        if (validKeys.has(k)) next[k] = v;
      }
      return next;
    });

    const newFiles = files.filter((f) => !(fileKey(f) in sheetMeta));
    if (newFiles.length === 0) return;

    let cancelled = false;

    (async () => {
      setLoadingSheets(true);
      setError(null);
      try {
        const formData = new FormData();
        newFiles.forEach((f) => formData.append("files", f));

        const res = await axios.post(API_SHEET_NAMES, formData, {
          validateStatus: () => true,
        });

        if (cancelled) return;

        if (res.status >= 400) {
          setError(res.data?.error || "Could not read sheet names from the uploaded files.");
          return;
        }

        const results = res.data?.files || [];
        setSheetMeta((prev) => {
          const next = { ...prev };
          newFiles.forEach((f, i) => {
            const info = results[i] || { sheets: [] };
            next[fileKey(f)] = {
              sheets: info.sheets || [],
              selected: (info.sheets && info.sheets[0]) || "",
              error: info.error || null,
            };
          });
          return next;
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not reach the server to read sheet names.");
      } finally {
        if (!cancelled) setLoadingSheets(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const updateSelection = (key, sheetName) => {
    setSheetMeta((prev) => ({
      ...prev,
      [key]: { ...prev[key], selected: sheetName },
    }));
  };

  const allSelected = useMemo(
    () => files.length > 0 && files.every((f) => sheetMeta[fileKey(f)]?.selected),
    [files, sheetMeta]
  );

  const runCompile = useCallback(async () => {
    if (files.length < 1) {
      setError("Add at least one spreadsheet.");
      return;
    }
    if (!allSelected) {
      setError("Select a sheet for every uploaded file before compiling.");
      return;
    }

    const selections = files.map((f) => sheetMeta[fileKey(f)]?.selected || "");

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("sheet_selections", JSON.stringify(selections));

    setError(null);
    setCompiling(true);
    try {
      const res = await axios.post(API_COMPILE, formData, {
        responseType: "blob",
        validateStatus: () => true,
      });

      if (res.status >= 400) {
        let parsed = {};
        try {
          const text = typeof res.data === "string" ? res.data : await res.data?.text?.();
          if (text) parsed = JSON.parse(text);
        } catch {
          parsed = {};
        }
        const msg = parsed?.error || "Compile failed.";
        setError(msg);
        return;
      }

      const blob =
        res.data instanceof Blob
          ? res.data
          : new Blob([res.data], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "compiled_output.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Could not reach the server or compile the workbooks.");
    } finally {
      setCompiling(false);
    }
  }, [files, sheetMeta, allSelected]);

  return (
    <div className="flex w-full flex-col items-center gap-7 px-5 pb-12 pt-12 mx-auto max-w-[960px]">
      <h2
        className="relative m-0 inline-block animate-[home-title-in_0.7s_ease_forwards] after:pointer-events-none after:absolute after:inset-[-6px_-10px] after:rounded-xl after:border-2 after:border-[var(--accent-border)] after:opacity-0 after:animate-[home-pulse-ring_2.5s_ease-in-out_infinite] after:content-['']"
        style={{ animationDelay: "0ms" }}
      >
        Compilation
      </h2>
      <p
        className="-mt-3 mx-0 max-w-[40rem] text-[0.95rem] animate-[home-fade-in_0.6s_ease_both]"
        style={{ animationDelay: "150ms" }}
      >
        Upload the Files which are need to be compiled and select the sheet from each file which you want to compile.
      </p>

      {error ? (
        <div
          className="w-full max-w-[40rem] rounded-xl border border-red-600/40 bg-red-500/15 px-4 py-3 text-left text-sm text-red-800 dark:border-red-500/55 dark:bg-red-500/10 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <MultiFileDropzone files={files} onFilesChange={setFiles} />

      {files.length > 0 ? (
  <div
  className="w-full max-w-350 mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-[home-fade-in_0.6s_ease_both]"
  style={{ animationDelay: "220ms" }}
>
    {files.map((f) => {
      const key = fileKey(f);
      const meta = sheetMeta[key];
      return (
        <div
          key={key}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 shadow-sm"
        >
          <div className="truncate text-sm font-medium text-[var(--text-h)]">
            {f.name}
          </div>

          {!meta ? (
            <div className="mt-2 text-xs text-[var(--text-muted,#888)]">
              Reading sheets…
            </div>
          ) : meta.error ? (
            <div className="mt-2 text-xs text-red-600 dark:text-red-300">
              {meta.error}
            </div>
          ) : meta.sheets.length === 0 ? (
            <div className="mt-2 text-xs text-red-600 dark:text-red-300">
              No sheets found.
            </div>
          ) : (
            <>
              <label className="mb-1 mt-2 block text-xs font-medium text-[var(--text-h)]">
                Sheet to compile
              </label>

              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-h)] outline-none transition focus:border-[var(--accent)]"
                value={meta.selected}
                onChange={(e) => updateSelection(key, e.target.value)}
              >
                {meta.sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      );
    })}
  </div>
) : null}

      <div className="animate-[home-fade-in_0.5s_ease_both]" style={{ animationDelay: "650ms" }}>
        <button
          type="button"
          className="cursor-pointer rounded-[10px] border-0 bg-gradient-to-br from-[var(--accent)] to-indigo-500 px-7 py-3 font-[inherit] text-white shadow-[var(--shadow)] transition-[transform,filter,opacity] duration-200 hover:-translate-y-0.5 hover:brightness-[1.06] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
          onClick={runCompile}
          disabled={compiling || loadingSheets || files.length < 1 || !allSelected}
        >
          {compiling ? "Compiling…" : loadingSheets ? "Reading sheets…" : "Compile & download"}
        </button>
      </div>
    </div>
  );
}