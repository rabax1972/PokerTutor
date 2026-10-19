import { useState, type ReactNode } from 'react';
import { GLOSSARY } from '../content/glossary';

/** Termine tecnico con definizione a comparsa (hover su desktop, tap su mobile). */
export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  if (!entry) return <>{children}</>;
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="underline decoration-dotted decoration-sky-400 underline-offset-2 cursor-help"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 max-w-[80vw] rounded-lg bg-slate-800 border border-slate-600 p-3 text-left text-xs font-normal text-slate-100 shadow-xl normal-case"
        >
          <span className="block font-semibold text-sky-300 mb-1">{entry.term}</span>
          {entry.short}
        </span>
      )}
    </span>
  );
}
