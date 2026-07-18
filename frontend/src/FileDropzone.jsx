import React, { useCallback, useRef } from "react";

/**
 * FileDropzone — multi-file, backend-compatible
 *
 * Props
 * ─────
 * zoneKey        string        identifier passed back in every callback
 * label          string        heading shown inside the zone
 * files          File[]        controlled array owned by the parent
 * dragOver       boolean       true while a drag is active over this zone
 * staggerDelayMs number        CSS animation delay
 * onDragOver     (key) => void
 * onDragLeave    (key) => void
 * onFileInput    (key, File[]) => void   always receives the FULL new array
 *
 * The component owns merge + dedupe internally so the parent only needs to
 * replace its slice of state with whatever array arrives here:
 *
 *   function handleFileInput(zoneKey, nextFiles) {
 *     setFiles(prev => ({ ...prev, [zoneKey]: nextFiles }));
 *   }
 *
 * Building FormData for the backend (Flask getlist):
 *
 *   const fd = new FormData();
 *   files.branch.forEach(f  => fd.append("branch",  f));
 *   files.mahavir.forEach(f => fd.append("mahavir", f));
 *   files.techno.forEach(f  => fd.append("techno",  f));
 */
export default function FileDropzone({
  zoneKey,
  label,
  files = [],
  dragOver,
  staggerDelayMs = 0,
  onDragOver,
  onDragLeave,
  onFileInput,
}) {
  const inputRef = useRef(null);

  // Merge incoming FileList with existing files; dedupe by filename.
  const mergeAndEmit = useCallback(
    (incomingList) => {
      if (!incomingList?.length) return;
      const incoming = Array.from(incomingList);
      const existingNames = new Set(files.map((f) => f.name));
      const merged = [...files, ...incoming.filter((f) => !existingNames.has(f.name))];
      onFileInput(zoneKey, merged);
    },
    [files, onFileInput, zoneKey]
  );

  const removeFile = useCallback(
    (idx, e) => {
      e.stopPropagation();
      onFileInput(zoneKey, files.filter((_, i) => i !== idx));
    },
    [files, onFileInput, zoneKey]
  );

  return (
    <div
      className="flex-[1_1_200px] min-w-[180px] max-w-[320px] opacity-0 animate-[home-rise-in_0.55s_ease_both]"
      style={{ animationDelay: `${staggerDelayMs}ms` }}
    >
      <div
        className={[
          "relative flex min-h-[148px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--code-bg)_65%,transparent)] px-4 py-5 transition-[border-color,background-color,transform,box-shadow] duration-[250ms] ease-in-out hover:-translate-y-0.5 hover:border-[var(--accent-border)] hover:bg-[var(--accent-bg)] hover:shadow-[var(--shadow)]",
          dragOver
            ? "scale-[1.02] border-solid border-[var(--accent)] bg-[var(--accent-bg)] shadow-[var(--shadow)]"
            : "",
        ].join(" ")}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(zoneKey); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); onDragLeave(zoneKey); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragLeave(zoneKey);
          mergeAndEmit(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <span className="text-[0.9rem] font-medium text-[var(--text-h)]">{label}</span>

        {files.length === 0 ? (
          <span className="text-center text-[0.8rem] leading-[135%] text-[var(--text)]">
            Drag & drop or click to browse
          </span>
        ) : (
          <ul className="w-full max-h-[96px] overflow-y-auto flex flex-col gap-1 mt-1 px-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 group">
                <span
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[0.78rem] text-[var(--accent)]"
                  title={f.name}
                >
                  {f.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="z-20 shrink-0 rounded-full p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text)] transition-opacity"
                  onClick={(e) => removeFile(i, e)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <span className="text-center text-[0.75rem] text-[var(--text-muted)] mt-0.5">
            Click or drop to add more
          </span>
        )}

        <input
          ref={inputRef}
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          type="file"
          multiple
          accept=".xlsx,.xls"
          aria-label={label}
          onChange={(e) => {
            mergeAndEmit(e.target.files);
            e.target.value = ""; // reset so same file can be re-added after removal
          }}
        />
      </div>
    </div>
  );
}