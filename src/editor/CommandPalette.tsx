import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteAction = {
  id: string;
  label: string;
  section: string;
  hint?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette({ open, actions, onClose }: { open: boolean; actions: CommandPaletteAction[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return actions.filter((action) => !needle || `${action.label} ${action.section} ${action.keywords ?? ""}`.toLowerCase().includes(needle));
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1))), [filtered.length]);
  if (!open) return null;

  function execute(action: CommandPaletteAction | undefined) {
    if (!action || action.disabled) return;
    onClose();
    action.run();
  }

  return <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="command-palette-search"><span>⌘</span><input ref={inputRef} value={query} placeholder="Search commands…" onChange={(event) => { setQuery(event.currentTarget.value); setActiveIndex(0); }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => filtered.length ? (index + 1) % filtered.length : 0); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => filtered.length ? (index - 1 + filtered.length) % filtered.length : 0); }
        if (event.key === "Enter") { event.preventDefault(); execute(filtered[activeIndex]); }
      }} /><kbd>Esc</kbd></div>
      <div className="command-palette-results">
        {filtered.length ? filtered.map((action, index) => <button key={action.id} type="button" className={index === activeIndex ? "is-active" : ""} disabled={action.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(action)}>
          <span><small>{action.section}</small><strong>{action.label}</strong></span>{action.hint ? <kbd>{action.hint}</kbd> : null}
        </button>) : <div className="command-palette-empty">No matching command</div>}
      </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Run</span></footer>
    </section>
  </div>;
}
