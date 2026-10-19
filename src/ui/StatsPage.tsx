import { useMemo, useState } from 'react';
import { clearHands, computeStats, loadHands, type StoredHand, type TrendPoint } from '../storage/storage';
import { GRADE_LABELS_IT, SPOT_LABELS_IT, type Grade } from '../strategy/types';
import { lessonForSpot } from '../lessons/lessons';

const GRADE_COLOR: Record<Grade, string> = {
  ottima: '#10b981',
  accettabile: '#38bdf8',
  errore: '#f59e0b',
  'errore-grave': '#f43f5e',
};

function fmt(x: number, d = 1) {
  return x.toFixed(d).replace('.', ',');
}

export function StatsPage({ onOpenLesson }: { onOpenLesson: (id: string) => void }) {
  const [hands, setHands] = useState<StoredHand[]>(() => loadHands());
  const stats = useMemo(() => computeStats(hands), [hands]);
  const [showTable, setShowTable] = useState(false);

  if (hands.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center text-slate-300">
        <h2 className="text-xl font-bold text-white mb-2">Statistiche</h2>
        Nessuna mano registrata. Gioca qualche mano: dopo ogni review le tue decisioni vengono salvate qui (solo su questo dispositivo).
      </div>
    );
  }
  const maxErr = Math.max(1, ...stats.bySpot.map((s) => s.errors));
  const gradeTotal = Object.values(stats.byGrade).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <h2 className="text-xl font-bold">Statistiche</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Mani giocate" value={String(stats.hands)} />
        <Tile label="Decisioni corrette" value={`${Math.round(stats.correctPct)}%`} hint={`${stats.decisions} decisioni (ottime + accettabili)`} />
        <Tile label="Risultato" value={`${stats.netBB >= 0 ? '+' : ''}${fmt(stats.netBB)} bb`} hint="dipende anche dalla fortuna" />
        <Tile label="EV perso (stima)" value={`${fmt(stats.totalLossBB)} bb`} hint={`${fmt(stats.totalLossBB / Math.max(1, stats.hands) * 100, 0)} bb ogni 100 mani`} />
      </div>

      <section className="rounded-xl bg-slate-800 border border-slate-700 p-4">
        <h3 className="font-semibold mb-3">Qualità delle decisioni</h3>
        <div className="flex h-4 w-full rounded overflow-hidden gap-[2px] bg-slate-800">
          {(Object.keys(stats.byGrade) as Grade[]).map((g) =>
            stats.byGrade[g] > 0 ? (
              <div key={g} style={{ width: `${(stats.byGrade[g] / gradeTotal) * 100}%`, background: GRADE_COLOR[g] }} title={`${GRADE_LABELS_IT[g]}: ${stats.byGrade[g]}`} />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-300">
          {(Object.keys(stats.byGrade) as Grade[]).map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GRADE_COLOR[g] }} />
              {GRADE_LABELS_IT[g]}: <b className="text-white">{stats.byGrade[g]}</b> ({gradeTotal ? Math.round((stats.byGrade[g] / gradeTotal) * 100) : 0}%)
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-slate-800 border border-slate-700 p-4">
        <h3 className="font-semibold mb-1">Errori più frequenti per categoria</h3>
        <p className="text-xs text-slate-400 mb-3">Errori e errori gravi; tra parentesi l'EV perso stimato.</p>
        <div className="space-y-2">
          {stats.bySpot.map((s) => (
            <div key={s.spot} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] sm:grid-cols-[14rem_1fr_auto] items-center gap-2 text-sm">
              <span className="text-slate-200 truncate" title={SPOT_LABELS_IT[s.spot]}>{SPOT_LABELS_IT[s.spot]}</span>
              <div className="h-3 bg-slate-900 rounded">
                <div className="h-3 rounded-r" style={{ width: `${(s.errors / maxErr) * 100}%`, background: '#38bdf8', minWidth: s.errors ? 4 : 0 }} />
              </div>
              <span className="text-slate-300 text-xs whitespace-nowrap">
                {s.errors}/{s.total} ({fmt(s.lossBB)} bb)
                {s.errors > 0 && (
                  <button onClick={() => onOpenLesson(lessonForSpot(s.spot).id)} className="ml-2 text-sky-400 underline">allenati</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <LineChart
          title="Decisioni corrette (media mobile su 20 mani)"
          points={stats.trend}
          value={(p) => p.correctPct}
          format={(v) => `${Math.round(v)}%`}
          yMin={0}
          yMax={100}
        />
        <LineChart
          title="Risultato cumulato (bb)"
          points={stats.trend}
          value={(p) => p.cumNetBB}
          format={(v) => `${v >= 0 ? '+' : ''}${fmt(v)} bb`}
          zeroLine
        />
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <button onClick={() => setShowTable((s) => !s)} className="text-sky-400 underline">{showTable ? 'Nascondi' : 'Mostra'} lo storico in tabella</button>
        <button
          onClick={() => {
            if (confirm('Cancellare tutto lo storico delle mani e le statistiche?')) {
              clearHands();
              setHands([]);
            }
          }}
          className="text-rose-400 underline ml-auto"
        >
          Azzera statistiche
        </button>
      </div>
      {showTable && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-xs text-slate-300">
            <thead className="bg-slate-800 text-slate-400">
              <tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Data</th><th className="p-2 text-left">Modalità</th><th className="p-2">Pos.</th><th className="p-2">Mano</th><th className="p-2 text-right">Risultato</th><th className="p-2 text-left">Decisioni</th></tr>
            </thead>
            <tbody>
              {[...hands].reverse().slice(0, 200).map((h, i) => (
                <tr key={h.id} className="border-t border-slate-800">
                  <td className="p-2">{hands.length - i}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(h.ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-2">{h.mode === 'free' ? 'Libera' : h.mode === 'lesson' ? 'Lezione' : h.mode === 'import' ? `Importata${h.site ? ` (${h.site})` : ''}` : 'Ripasso'}</td>
                  <td className="p-2 text-center">{h.position}</td>
                  <td className="p-2 text-center font-mono">{h.heroCode}</td>
                  <td className="p-2 text-right">{h.netBB >= 0 ? '+' : ''}{fmt(h.netBB)}</td>
                  <td className="p-2">{h.decisions.map((d) => GRADE_LABELS_IT[d.grade]).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

interface LineProps {
  title: string;
  points: TrendPoint[];
  value: (p: TrendPoint) => number | null;
  format: (v: number) => string;
  yMin?: number;
  yMax?: number;
  zeroLine?: boolean;
}

/** Grafico a linea a una serie, con crosshair e tooltip al passaggio. */
function LineChart({ title, points, value, format, yMin, yMax, zeroLine }: LineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 400, H = 180, L = 44, R = 10, T = 10, B = 24;
  const data = points.map((p) => ({ x: p.hand, y: value(p) })).filter((d): d is { x: number; y: number } => d.y !== null);
  if (data.length < 2) {
    return (
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
        <h3 className="font-semibold text-sm mb-2">{title}</h3>
        <p className="text-xs text-slate-400">Servono almeno 2 mani con decisioni.</p>
      </div>
    );
  }
  const ys = data.map((d) => d.y);
  let lo = yMin ?? Math.min(0, ...ys);
  let hi = yMax ?? Math.max(0, ...ys);
  if (hi === lo) { hi += 1; lo -= 1; }
  const xMax = data[data.length - 1].x;
  const xMin = data[0].x;
  const sx = (x: number) => L + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto touch-none"
          onMouseLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * W;
            let best = 0;
            data.forEach((d, i) => { if (Math.abs(sx(d.x) - x) < Math.abs(sx(data[best].x) - x)) best = i; });
            setHover(best);
          }}
          role="img"
          aria-label={title}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="#334155" strokeWidth={1} />
              <text x={L - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{format(t)}</text>
            </g>
          ))}
          {zeroLine && lo < 0 && hi > 0 && <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} stroke="#64748b" strokeWidth={1} />}
          <text x={L} y={H - 6} fontSize={10} fill="#94a3b8">mano {xMin}</text>
          <text x={W - R} y={H - 6} fontSize={10} fill="#94a3b8" textAnchor="end">mano {xMax}</text>
          <path d={path} fill="none" stroke="#38bdf8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {h && (
            <g>
              <line x1={sx(h.x)} x2={sx(h.x)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />
              <circle cx={sx(h.x)} cy={sy(h.y)} r={4.5} fill="#38bdf8" stroke="#1e293b" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && (
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-full rounded bg-slate-900 border border-slate-600 px-2 py-1 text-xs text-slate-100 whitespace-nowrap"
            style={{ left: `${(sx(h.x) / W) * 100}%`, top: `${(sy(h.y) / H) * 100}%`, marginTop: -8 }}
          >
            Mano {h.x}: <b>{format(h.y)}</b>
          </div>
        )}
      </div>
    </div>
  );
}
