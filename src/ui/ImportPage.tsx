import { useMemo, useRef, useState } from 'react';
import { decodeHistoryFile, parseHandHistory } from '../import';
import { replayHand, type ImportedHand } from '../import/replay';
import type { BankrollLevel } from '../game/session';
import { HERO_SEAT } from '../game/session';
import { reviewHand, type HandReview } from '../review/review';
import { bankrollInfo } from '../strategy/bankroll';
import { GRADE_LABELS_IT, SPOT_LABELS_IT, type Grade, type SpotTag } from '../strategy/types';
import { saveHand, type StoredHand } from '../storage/storage';
import { CardRow } from './CardView';
import { HandLog } from './HandLog';
import { ReviewPanel } from './ReviewPanel';

const GRADE_DOT: Record<Grade, string> = {
  ottima: 'bg-emerald-500',
  accettabile: 'bg-sky-500',
  errore: 'bg-amber-500',
  'errore-grave': 'bg-rose-500',
};

type Filter = 'all' | 'errors' | 'unsupported';
const PAGE = 40;

function fmt(x: number, d = 1) {
  return x.toFixed(d).replace('.', ',');
}

export function ImportPage({ onOpenLesson }: { onOpenLesson: (id: string) => void }) {
  const [text, setText] = useState('');
  const [bankroll, setBankroll] = useState<BankrollLevel>('adequate');
  const [imported, setImported] = useState<ImportedHand[] | null>(null);
  const [unknown, setUnknown] = useState(0);
  const [reviews, setReviews] = useState<Map<string, HandReview>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sortByLoss, setSortByLoss] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [saved, setSaved] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  /** Identificativo dell'analisi in corso: una nuova analisi (o "interrompi") invalida quella precedente. */
  const runId = useRef(0);

  const load = (content: string) => {
    const { hands, unknownBlocks } = parseHandHistory(content);
    const reps = hands.map(replayHand);
    // Mani duplicate (stesso file caricato due volte): si tiene la prima.
    const seen = new Set<string>();
    const unique = reps.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
    setImported(unique);
    setUnknown(unknownBlocks);
    setReviews(new Map());
    setOpen(null);
    setSaved(null);
    setShown(PAGE);
    analyze(unique);
  };

  const readFiles = async (files: FileList | File[]) => {
    const texts = await Promise.all([...files].map(async (f) => decodeHistoryFile(await f.arrayBuffer())));
    const all = texts.join('\n\n');
    setText('');
    load(all);
  };

  /** Analisi a blocchi per non bloccare l'interfaccia (ogni decisione richiede un Monte Carlo). */
  const analyze = (hands: ImportedHand[], br: BankrollLevel = bankroll) => {
    const ok = hands.filter((h) => h.status === 'ok');
    const run = ++runId.current;
    setProgress({ done: 0, total: ok.length });
    const out = new Map<string, HandReview>();
    let i = 0;
    const step = () => {
      if (run !== runId.current) return;
      const t0 = performance.now();
      while (i < ok.length && performance.now() - t0 < 40) {
        const h = ok[i++];
        try {
          out.set(h.key, reviewHand(h.live!, br, { netBB: h.netBB }));
        } catch {
          h.status = 'error';
          h.reason = 'Errore durante l\'analisi della mano.';
        }
      }
      setReviews(new Map(out));
      setProgress({ done: i, total: ok.length });
      if (i < ok.length) setTimeout(step, 0);
      else setProgress(null);
    };
    setTimeout(step, 0);
  };

  const summary = useMemo(() => {
    if (!imported) return null;
    const ok = imported.filter((h) => h.status === 'ok');
    const grades: Record<Grade, number> = { ottima: 0, accettabile: 0, errore: 0, 'errore-grave': 0 };
    const spots = new Map<SpotTag, { total: number; errors: number; loss: number }>();
    let loss = 0;
    let net = 0;
    for (const h of ok) {
      net += h.netBB ?? 0;
      const r = reviews.get(h.key);
      if (!r) continue;
      for (const d of r.decisions) {
        grades[d.verdict.grade]++;
        loss += d.verdict.evLossBB;
        const s = spots.get(d.advice.spot) ?? { total: 0, errors: 0, loss: 0 };
        s.total++;
        if (d.verdict.grade === 'errore' || d.verdict.grade === 'errore-grave') { s.errors++; s.loss += d.verdict.evLossBB; }
        spots.set(d.advice.spot, s);
      }
    }
    const decisions = Object.values(grades).reduce((a, b) => a + b, 0);
    const reasons = new Map<string, number>();
    for (const h of imported) if (h.status !== 'ok') reasons.set(h.reason ?? 'Sconosciuto', (reasons.get(h.reason ?? 'Sconosciuto') ?? 0) + 1);
    const sites = new Map<string, number>();
    for (const h of imported) sites.set(h.parsed.site, (sites.get(h.parsed.site) ?? 0) + 1);
    return {
      ok: ok.length, total: imported.length, grades, decisions, loss, net,
      correct: decisions ? ((grades.ottima + grades.accettabile) / decisions) * 100 : 0,
      spots: [...spots.entries()].sort((a, b) => b[1].errors - a[1].errors || b[1].loss - a[1].loss),
      reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
      sites: [...sites.entries()],
    };
  }, [imported, reviews]);

  const list = useMemo(() => {
    if (!imported) return [];
    let l = imported.filter((h) => {
      if (filter === 'unsupported') return h.status !== 'ok';
      if (filter === 'errors') {
        const r = reviews.get(h.key);
        return !!r && r.decisions.some((d) => d.verdict.grade === 'errore' || d.verdict.grade === 'errore-grave');
      }
      return true;
    });
    if (sortByLoss) l = [...l].sort((a, b) => (reviews.get(b.key)?.totalLossBB ?? -1) - (reviews.get(a.key)?.totalLossBB ?? -1));
    return l;
  }, [imported, reviews, filter, sortByLoss]);

  const saveAll = () => {
    if (!imported) return;
    let n = 0;
    for (const h of imported) {
      const r = reviews.get(h.key);
      if (h.status !== 'ok' || !r) continue;
      const stored: StoredHand = {
        id: `import-${h.key}`,
        ts: parseDate(h.parsed.date) ?? Date.now(),
        mode: 'import',
        site: h.parsed.site,
        numPlayers: h.live!.state.numPlayers,
        position: h.position!,
        heroCode: h.heroCode!,
        netBB: Math.round((h.netBB ?? 0) * 100) / 100,
        decisions: r.decisions.map((d) => ({ street: d.advice.street, spot: d.advice.spot, grade: d.verdict.grade, lossBB: Math.round(d.verdict.evLossBB * 100) / 100 })),
        concepts: r.concepts.map((c) => c.id),
      };
      saveHand(stored);
      n++;
    }
    setSaved(n);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5 text-slate-100">
      <div>
        <h2 className="text-xl font-bold">Importa hand history</h2>
        <p className="text-sm text-slate-300 mt-1">
          Carica le cronologie delle mani esportate dal tuo client per rianalizzarle con il tutor.
          Supportati: <b>PokerStars</b> (anche .it, Zoom e tornei), <b>GGPoker</b>, <b>Winamax</b>, <b>888poker</b>.
          Solo Texas Hold'em No Limit (cash e tornei). Le hand history devono essere in inglese.
        </p>
        <p className="text-xs text-slate-500 mt-1">I file vengono letti solo nel tuo browser: nulla viene inviato a un server.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void readFiles(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed p-4 space-y-3 ${drag ? 'border-sky-400 bg-sky-950/30' : 'border-slate-600 bg-slate-800/60'}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 cursor-pointer font-semibold text-sm">
            Scegli file .txt
            <input type="file" accept=".txt,text/plain" multiple className="hidden" onChange={(e) => e.target.files && void readFiles(e.target.files)} />
          </label>
          <span className="text-sm text-slate-400">oppure trascinali qui, oppure incolla il testo qui sotto</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'PokerStars Hand #...: Hold\'em No Limit ($0.01/$0.02 USD) - ...'}
          className="w-full h-32 rounded-lg bg-slate-900 border border-slate-700 p-2 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!text.trim()}
            onClick={() => load(text)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm disabled:opacity-40"
          >
            Analizza il testo incollato
          </button>
          <label className="text-sm text-slate-300 flex items-center gap-2">
            Bankroll:
            <select value={bankroll} onChange={(e) => { const br = e.target.value as BankrollLevel; setBankroll(br); if (imported) analyze(imported, br); }} className="bg-slate-900 border border-slate-600 rounded px-2 py-1">
              {(['short', 'adequate', 'large'] as BankrollLevel[]).map((l) => <option key={l} value={l}>{bankrollInfo(l).label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {imported && summary && (
        <>
          <section className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h3 className="font-semibold">Riepilogo</h3>
              <span className="text-sm text-slate-300">
                {summary.total} mani trovate ({summary.sites.map(([s, n]) => `${s}: ${n}`).join(', ')}), {summary.ok} analizzabili
                {unknown > 0 && `, ${unknown} blocchi di testo non riconosciuti`}
              </span>
            </div>
            {progress && (
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Analisi in corso… {progress.done}/{progress.total}</span>
                  <button className="underline" onClick={() => { runId.current++; setProgress(null); }}>interrompi</button>
                </div>
                <div className="h-2 rounded bg-slate-900"><div className="h-2 rounded bg-sky-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
              </div>
            )}
            {summary.decisions > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MiniTile label="Decisioni analizzate" value={String(summary.decisions)} />
                <MiniTile label="Corrette" value={`${Math.round(summary.correct)}%`} />
                <MiniTile label="EV perso (stima)" value={`${fmt(summary.loss)} bb`} />
                <MiniTile label="Risultato reale" value={`${summary.net >= 0 ? '+' : ''}${fmt(summary.net)} bb`} />
              </div>
            )}
            {summary.spots.some(([, s]) => s.errors > 0) && (
              <div>
                <div className="text-xs text-slate-400 mb-1">Dove sbagli di più</div>
                <ul className="text-sm space-y-0.5">
                  {summary.spots.filter(([, s]) => s.errors > 0).slice(0, 5).map(([spot, s]) => (
                    <li key={spot} className="flex justify-between gap-2">
                      <span>{SPOT_LABELS_IT[spot]}</span>
                      <span className="text-slate-400 text-xs">{s.errors}/{s.total} errori · {fmt(s.loss)} bb</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.reasons.length > 0 && (
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer">{summary.total - summary.ok} mani non analizzabili: perché?</summary>
                <ul className="list-disc pl-5 mt-1">
                  {summary.reasons.map(([r, n]) => <li key={r}>{r} ({n})</li>)}
                </ul>
              </details>
            )}
            {!progress && summary.ok > 0 && (
              <div className="flex items-center gap-3">
                <button onClick={saveAll} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">Aggiungi alle mie statistiche</button>
                {saved !== null && <span className="text-xs text-emerald-400">{saved} mani salvate (le mani già presenti non vengono duplicate). Il ripasso errori ne terrà conto.</span>}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {([['all', 'Tutte'], ['errors', 'Con errori'], ['unsupported', 'Non analizzabili']] as [Filter, string][]).map(([f, l]) => (
                <button key={f} onClick={() => { setFilter(f); setShown(PAGE); }} className={`px-2.5 py-1 rounded border ${filter === f ? 'bg-sky-700 border-sky-500' : 'bg-slate-800 border-slate-600'}`}>{l}</button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-300">
                <input type="checkbox" checked={sortByLoss} onChange={(e) => setSortByLoss(e.target.checked)} /> ordina per EV perso
              </label>
            </div>
            {list.length === 0 && <p className="text-sm text-slate-400">Nessuna mano in questa vista.</p>}
            {list.slice(0, shown).map((h) => (
              <HandRow
                key={h.key}
                h={h}
                review={reviews.get(h.key)}
                open={open === h.key}
                onToggle={() => setOpen(open === h.key ? null : h.key)}
                bankroll={bankroll}
                onOpenLesson={onOpenLesson}
              />
            ))}
            {list.length > shown && (
              <button onClick={() => setShown(shown + PAGE)} className="w-full py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm">
                Mostra altre {Math.min(PAGE, list.length - shown)} mani ({list.length - shown} rimanenti)
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-700 p-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function HandRow({ h, review, open, onToggle, bankroll, onOpenLesson }: {
  h: ImportedHand;
  review?: HandReview;
  open: boolean;
  onToggle: () => void;
  bankroll: BankrollLevel;
  onOpenLesson: (id: string) => void;
}) {
  const p = h.parsed;
  const net = h.netBB ?? 0;
  return (
    <div className={`rounded-lg border ${open ? 'border-sky-600' : 'border-slate-700'} bg-slate-800/80`}>
      <button onClick={onToggle} disabled={h.status !== 'ok'} className="w-full text-left px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm disabled:cursor-default">
        <span className="text-xs text-slate-400 w-28 shrink-0">{p.site}<br />{p.date?.slice(0, 16) ?? `#${p.handId}`}</span>
        <span className="text-xs text-slate-300 w-24 shrink-0">{h.stakesLabel}</span>
        {p.heroCards && <CardRow cards={p.heroCards} />}
        {h.position && <span className="font-semibold text-amber-300 w-12">{h.position}</span>}
        {h.status === 'ok' ? (
          <>
            <span className="flex gap-1">
              {review ? review.decisions.map((d, i) => <span key={i} title={`${d.advice.street}: ${GRADE_LABELS_IT[d.verdict.grade]}`} className={`inline-block w-2.5 h-2.5 rounded-full ${GRADE_DOT[d.verdict.grade]}`} />) : <span className="text-xs text-slate-500">in analisi…</span>}
            </span>
            <span className="ml-auto flex items-center gap-3 text-xs">
              {review && review.totalLossBB >= 0.1 && <span className="text-amber-300">−{fmt(review.totalLossBB)} bb EV</span>}
              <span className={`font-semibold ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-300'}`}>{net > 0 ? '+' : ''}{fmt(net)} bb</span>
              <span className="text-slate-400">{open ? '▲' : '▼'}</span>
            </span>
          </>
        ) : (
          <span className={`ml-auto text-xs ${h.status === 'error' ? 'text-rose-300' : 'text-slate-400'}`}>{h.reason}</span>
        )}
      </button>
      {open && h.live && (
        <div className="border-t border-slate-700 p-2 sm:p-3 space-y-3">
          {h.warnings.length > 0 && <div className="text-xs text-amber-300">{h.warnings.join(' ')}</div>}
          {h.live.decisions.length === 0 ? (
            <p className="text-sm text-slate-400">In questa mano non hai preso decisioni (hai solo postato i blind, o tutti hanno foldato).</p>
          ) : (
            <ReviewPanel hand={h.live} bankroll={bankroll} precomputed={review} onOpenLesson={onOpenLesson} />
          )}
          <details className="rounded-lg bg-slate-900/70 p-3">
            <summary className="cursor-pointer text-sm text-slate-300">Cronologia ricostruita</summary>
            <div className="mt-2"><HandLog state={h.live.state} heroSeat={HERO_SEAT} /></div>
            <p className="text-[11px] text-slate-500 mt-2">Le carte degli avversari non mostrate nel file non sono note: nella ricostruzione sono casuali e il risultato indicato è quello reale.</p>
          </details>
          <details className="rounded-lg bg-slate-900/70 p-3">
            <summary className="cursor-pointer text-sm text-slate-300">Testo originale</summary>
            <pre className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap break-words">{p.raw}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function parseDate(d?: string): number | undefined {
  if (!d) return undefined;
  const m = d.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})/) ?? d.match(/(\d{2}) (\d{2}) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [y, mo, da] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const t = new Date(Number(y), Number(mo) - 1, Number(da), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
  return Number.isNaN(t) ? undefined : t;
}
