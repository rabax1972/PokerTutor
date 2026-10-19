import { useState } from 'react';
import { GLOSSARY } from '../content/glossary';

export function GlossaryPage() {
  const [q, setQ] = useState('');
  const entries = Object.entries(GLOSSARY)
    .filter(([, e]) => `${e.term} ${e.short} ${e.long ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a[1].term.localeCompare(b[1].term, 'it'));
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-slate-100">
      <h2 className="text-xl font-bold mb-3">Glossario</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca un termine…"
        className="w-full mb-4 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
      />
      <dl className="space-y-3">
        {entries.map(([k, e]) => (
          <div key={k} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
            <dt className="font-semibold text-sky-300">{e.term}</dt>
            <dd className="text-sm text-slate-200 mt-1">{e.short}</dd>
            {e.long && <dd className="text-sm text-slate-400 mt-1">{e.long}</dd>}
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-500 mt-6">
        Nota: i consigli del tutor sono approssimazioni basate su range standard e calcoli di equity (Monte Carlo),
        non soluzioni GTO esatte. Quando un consiglio dipende da assunzioni (es. il range stimato dell'avversario) lo trovi indicato nella review.
      </p>
    </div>
  );
}
