import React, { useCallback, useState } from "react";
import axios from "axios";
import FileDropzone from "./FileDropzone";

const ZONES = [
  { key: "mahavir", title: "Mahavir File", staggerMs: 250 },
  { key: "techno", title: "Techno File", staggerMs: 380 },
  { key: "branch", title: "Branch File", staggerMs: 510 },
];

export default function Home() {
  const [files, setFiles] = useState({ mahavir: [], techno: [], branch: [] });
  const [loading, setLoading] = useState(false);
  const [dragTarget, setDragTarget] = useState(null);

  const setZoneFile = useCallback((key, nextFiles) => {
    setFiles((prev) => ({ ...prev, [key]: nextFiles }));
  }, []);

  const handleDragOverZone = useCallback((key) => setDragTarget(key), []);
  const handleDragLeaveZone = useCallback((key) => {
    setDragTarget((cur) => (cur === key ? null : cur));
  }, []);

  const handleUpload = async () => {
    if (!files.mahavir.length || !files.techno.length || !files.branch.length) {
      alert("Please upload at least one file for each category.");
      return;
    }

    const formData = new FormData();
    files.mahavir.forEach((file) => formData.append("mahavir", file));
    files.techno.forEach((file) => formData.append("techno", file));
    files.branch.forEach((file) => formData.append("branch", file));

    try {
      setLoading(true);

      const res = await axios.post("http://localhost:5000/process", formData, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: "application/zip",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "updated_branches.zip";
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error processing files");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-7 px-5 pb-12 pt-12 mx-auto max-w-[960px]">
      <h2
        className="relative m-0 inline-block animate-[home-title-in_0.7s_ease_forwards] after:pointer-events-none after:absolute after:inset-[-6px_-10px] after:rounded-xl after:border-2 after:border-[var(--accent-border)] after:opacity-0 after:animate-[home-pulse-ring_2.5s_ease-in-out_infinite] after:content-['']"
        style={{ animationDelay: "0ms" }}
      >
        Costing
      </h2>
      <p className="-mt-3 mx-0 text-[0.95rem] animate-[home-fade-in_0.6s_ease_both]" style={{ animationDelay: "150ms" }}>
        Upload the three spreadsheets, then process and download.
      </p>

      <div className="flex w-full flex-row flex-wrap justify-center gap-4 items-stretch">
        {ZONES.map(({ key, title, staggerMs }) => (
          <FileDropzone
            key={key}
            zoneKey={key}
            label={title}
            files={files[key]}
            dragOver={dragTarget === key}
            staggerDelayMs={staggerMs}
            onDragOver={handleDragOverZone}
            onDragLeave={handleDragLeaveZone}
            onFileInput={setZoneFile}
          />
        ))}
      </div>

      <div className="animate-[home-fade-in_0.5s_ease_both]" style={{ animationDelay: "650ms" }}>
        <button
          type="button"
          className="cursor-pointer rounded-[10px] border-0 bg-gradient-to-br from-[var(--accent)] to-indigo-500 px-7 py-3 font-[inherit] text-white shadow-[var(--shadow)] transition-[transform,filter,opacity] duration-200 hover:-translate-y-0.5 hover:brightness-[1.06] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
          onClick={handleUpload}
          disabled={loading}
        >
          {loading ? "Processing…" : "Process & Download"}
        </button>
      </div>
    </div>
  );
}
