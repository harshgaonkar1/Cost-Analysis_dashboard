import React, { useCallback, useRef, useState } from "react";

function isSpreadsheet(filename) {
  const n = (filename || "").toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls");
}

export default function MultiFileDropzone({ files, onFilesChange }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const mergeNewFiles = useCallback(
    (fileList) => {
      const fromList = [...fileList];
      const accepted = fromList.filter((f) => isSpreadsheet(f.name));
      if (accepted.length === 0) return;
      onFilesChange([...files, ...accepted]);
    },
    [files, onFilesChange]
  );

  const removeAt = useCallback(
    (index) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange]
  );

  const clearAll = useCallback(() => {
    onFilesChange([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [onFilesChange]);

  return (
    <div className="w-full opacity-0 animate-[home-rise-in_0.55s_ease_both]" style={{ animationDelay: "250ms" }}>
      <div
        className={[
          "relative flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--code-bg)_65%,transparent)] px-4 py-6 transition-[border-color,background-color,transform,box-shadow] duration-[250ms] ease-in-out hover:-translate-y-0.5 hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] hover:shadow-[var(--shadow)]",
          dragOver ? "scale-[1.01] border-solid border-[var(--accent)] bg-[var(--accent-bg)] shadow-[var(--shadow)]" : "",
        ].join(" ")}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          mergeNewFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <span className="text-[0.95rem] font-medium text-[var(--text-h)]">Drop Your Files</span>
        <span className="max-w-[32rem] text-center text-[0.82rem] leading-[145%] text-[var(--text)]">
          Drop many .xlsx / .xls files here or click to add. The selected sheet will be compiled in upload order, and
          its columns must exactly match the first file.
        </span>
        <span className="font-mono text-[0.8rem] text-[var(--accent)]">{files.length} file(s) queued</span>
        <input
          ref={inputRef}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          multiple
          aria-label="Upload spreadsheets"
          onChange={(e) => {
            mergeNewFiles(e.target.files || []);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className="mt-4 w-full rounded-[14px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--code-bg)_40%,transparent)] p-4 text-left">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--text-h)]">Queue</span>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--text-h)] transition hover:bg-[var(--accent-bg)]"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
          <ul className="max-h-[min(40vh,22rem)] list-none overflow-y-auto overflow-x-hidden p-0">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}-${f.size}`}
                className="flex items-center gap-3 border-b border-[var(--border)] py-2 text-sm last:border-b-0"
              >
                <span className="min-w-[1.5rem] shrink-0 text-[var(--text)]">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[0.82rem] text-[var(--text-h)]" title={f.name}>
                  {f.name}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                  onClick={() => removeAt(i)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
