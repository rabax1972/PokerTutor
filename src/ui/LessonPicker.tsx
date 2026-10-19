import { LESSONS } from '../lessons/lessons';
import { CONCEPTS } from '../review/concepts';

export function LessonPicker({ onPick, onBack }: { onPick: (id: string) => void; onBack: () => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-slate-100">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm">← Indietro</button>
        <h2 className="text-xl font-bold">Lezioni a tema</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {LESSONS.map((l) => (
          <button
            key={l.id}
            onClick={() => onPick(l.id)}
            className="text-left rounded-xl bg-slate-800 border border-slate-700 hover:border-sky-500 hover:bg-slate-700 p-4 transition"
          >
            <div className="font-semibold text-white">{l.title}</div>
            <div className="text-sm text-slate-300 mt-1">{l.description}</div>
            <div className="text-xs text-sky-300 mt-2">Concetto: {CONCEPTS[l.concept].title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
