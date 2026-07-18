import React from "react";
import { NavLink } from "react-router-dom";

const linkCls = ({ isActive }) =>
  [
    "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-[var(--accent-bg)] text-[var(--text-h)] shadow-[var(--shadow)]" : "text-[var(--text)] hover:bg-[var(--social-bg)]",
  ].join(" ");

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-sm">
      <nav className="mx-auto flex max-w-[1126px] flex-wrap items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-medium text-[var(--text-h)]">Costing tool</span>
        <div className="flex items-center gap-1">
          <NavLink to="/" end className={linkCls}>
            Costing
          </NavLink>
          <NavLink to="/compilation" className={linkCls}>
            Compilation
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
