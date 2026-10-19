import { useEffect, useState } from 'react';
import type { BankrollLevel, LiveHand } from '../game/session';
import { HERO_SEAT } from '../game/session';
import type { Grade } from '../strategy/types';
import { GRADE_LABELS_IT } from '../strategy/types';
import { reviewHand, type DecisionReview, type HandReview } from '../review/review';
import { CardRow } from './CardView';
import { RangeGrid } from './RangeGrid';
import { Table } from './Table';
import { Term } from './Term';
import { bb } from './format';

const GRADE_STYLE: Record<Grade, string> = {
  ottima: 'bg-emerald-600 text-white',
  accettabile: 'bg-sky-600 text-white',
  errore: 'bg-amber-500 text-slate-900',
  'errore-grave': 'bg-rose-600 text-white',
};

export function GradeBadge({ grade }: { grade: Grade }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_STYLE[grade]}`}>{GRADE_LABELS_IT[grade]}</span>;
}

interface Props {
  hand: LiveHand;
  bankroll: BankrollLevel;
  onReviewed?: (r: HandReview) => void;
  onOpenLesson?: (lessonId: string) => void;
  /** Review già calcolata (es. mani importate analizzate in blocco). */
  precomputed?: HandReview;
}

export function ReviewPanel({ hand, bankroll, onReviewed, onOpenLesson, precomputed }: Props) {
  const [review, setReview] = useState<HandReview | null>(precomputed ?? null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    if (precomputed) { setReview(precomputed); return; }
    setReview(null);
    // Il calcolo (Monte Carlo) richiede qualche decina di millisecondi: lo facciamo dopo il render.
    const t = setTimeout(() => {
      const r = reviewHand(hand, bankroll);
      setReview(r);
      onReviewed?.(r);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand]);

  if (!review) {
    return <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 text-center text-slate-300 animate-pulse">Analisi della mano in corso…</div>;
  }
  if (review.decisions.length === 0) {
    return (
      <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 text-slate-300 text-sm">
        Non hai dovuto prendere decisioni in questa mano (tutti hanno foldato prima di te, o eri già all-in).
      </div>
    );
  }
  const d = review.decisions[Math.min(step, review.decisions.length - 1)];

  return (
    <div className="rounded-xl bg-slate-800/95 border border-slate-600 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="font-bold text-lg text-white">Review della mano</h3>
        <span className="text-slate-300 text-sm">{review.headline}</span>
        <div className="flex gap-1 ml-auto flex-wrap">
          {(Object.keys(review.grades) as Grade[]).filter((g) => review.grades[g] > 0).map((g) => (
            <span key={g} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${GRADE_STYLE[g]}`}>{review.grades[g]} {GRADE_LABELS_IT[g].toLowerCase()}</span>
          ))}
        </div>
      </div>

      {/* Navigazione tra le decisioni */}
      <div className="flex gap-1 px-4 pt-3 overflow-x-auto">
        {review.decisions.map((x, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs border ${i === step ? 'border-sky-400 bg-slate-700' : 'border-slate-600 bg-slate-900 hover:bg-slate-700'}`}
          >
            <span className="font-semibold text-slate-100">{i + 1}. {streetIt(x.advice.street)}</span>{' '}
            <span className={`inline-block w-2 h-2 rounded-full ml-1 ${GRADE_STYLE[x.verdict.grade].split(' ')[0]}`} />
          </button>
        ))}
      </div>

      <DecisionCard d={d} />

      <div className="flex justify-between px-4 pb-3">
        <button disabled={step === 0} onClick={() => setStep(step - 1)} className="px-3 py-1.5 rounded bg-slate-700 text-sm disabled:opacity-30">← Precedente</button>
        <button disabled={step >= review.decisions.length - 1} onClick={() => setStep(step + 1)} className="px-3 py-1.5 rounded bg-slate-700 text-sm disabled:opacity-30">Successiva →</button>
      </div>

      {/* Riepilogo */}
      <div className="border-t border-slate-700 px-4 py-3 bg-slate-900/50">
        <div className="text-sm text-slate-300 mb-2">
          Risultato: <b className={review.netBB >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{review.netBB >= 0 ? '+' : ''}{review.netBB.toFixed(1).replace('.', ',')} bb</b>
          {review.totalLossBB >= 0.1 && <> · EV lasciato sul tavolo (stima): <b className="text-amber-300">{review.totalLossBB.toFixed(1).replace('.', ',')} bb</b></>}
          <span className="block text-xs text-slate-500 mt-0.5">Il risultato di una singola mano dipende dalla fortuna: conta la qualità delle decisioni.</span>
        </div>
        <h4 className="font-semibold text-amber-300 mb-2">Concetti da ripassare</h4>
        <div className="grid gap-2 sm:grid-cols-3">
          {review.concepts.map((c) => (
            <div key={c.id} className="rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm">
              <div className="font-semibold text-white mb-1">{c.glossary ? <Term k={c.glossary}>{c.title}</Term> : c.title}</div>
              <p className="text-slate-300 text-xs leading-relaxed">{c.summary}</p>
              {c.lessonId && onOpenLesson && (
                <button onClick={() => onOpenLesson(c.lessonId!)} className="mt-2 text-xs text-sky-400 underline">Allenati con la lezione →</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function streetIt(s: string) {
  return ({ preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' } as Record<string, string>)[s];
}

function DecisionCard({ d }: { d: DecisionReview }) {
  const [showTable, setShowTable] = useState(false);
  const [showData, setShowData] = useState(false);
  const a = d.advice;
  const v = d.verdict;
  const hero = d.stateBefore.players[HERO_SEAT];
  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CardRow cards={hero.hole} size="md" />
        {a.board.length > 0 && <><span className="text-slate-500 mx-1">|</span><CardRow cards={a.board} size="md" /></>}
        <span className="ml-auto"><GradeBadge grade={v.grade} /></span>
      </div>
      <p className="text-sm text-slate-300">{d.situation}</p>

      <div className="grid sm:grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-600 bg-slate-900 p-2.5">
          <div className="text-xs text-slate-400">Hai giocato</div>
          <div className="font-semibold text-white">{d.userText}</div>
        </div>
        <div className={`rounded-lg border p-2.5 ${v.grade === 'ottima' ? 'border-emerald-700 bg-emerald-950/40' : 'border-sky-700 bg-sky-950/40'}`}>
          <div className="text-xs text-slate-400">Giocata consigliata</div>
          <div className="font-semibold text-white">{d.recommendedText}</div>
          {d.alternativesText.length > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">Valide anche: {d.alternativesText.join(' · ')}</div>
          )}
        </div>
      </div>

      <div className="text-sm text-slate-100">{d.verdictText}</div>
      {v.sizingNote && <div className="text-sm text-amber-200">{v.sizingNote}</div>}

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Perché</div>
        <ul className="space-y-1.5 text-sm text-slate-200 list-disc pl-5">
          {d.explanation.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <button className="text-sky-400 underline" onClick={() => setShowData((s) => !s)}>{showData ? 'Nascondi' : 'Mostra'} i numeri</button>
        <button className="text-sky-400 underline" onClick={() => setShowTable((s) => !s)}>{showTable ? 'Nascondi' : 'Mostra'} il tavolo in quel momento</button>
      </div>

      {showData && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm space-y-1">
            {a.equity !== null && <Row k={<Term k="equity">Equity vs range</Term>} v={`${Math.round(a.equity * 100)}%`} />}
            {a.toCall > 0 && a.spot !== 'preflop-open' && <Row k={<Term k="potOdds">Equity richiesta (pot odds)</Term>} v={`${Math.round(a.potOdds * 100)}%`} />}
            <Row k="Piatto" v={bb(a.pot)} />
            <Row k={<Term k="effectiveStack">Stack effettivo</Term>} v={`${a.effStackBB.toFixed(0)} bb`} />
            {a.street !== 'preflop' && Number.isFinite(a.spr) && <Row k={<Term k="spr">SPR</Term>} v={a.spr.toFixed(1).replace('.', ',')} />}
            <div className="pt-2 text-xs text-slate-400">{a.evMode === 'absolute' ? <><Term k="ev">EV</Term> stimato per ogni giocata (fold = 0):</> : 'Perdita stimata rispetto alla giocata da range:'}</div>
            <table className="w-full text-xs">
              <tbody>
                {[...a.candidates].sort((x, y) => y.ev - x.ev).map((c, i) => (
                  <tr key={i} className={c === a.best ? 'text-emerald-300 font-semibold' : 'text-slate-300'}>
                    <td className="py-0.5">{c.label}</td>
                    <td className="text-right">{c.ev >= 0 ? '+' : ''}{(c.ev / 100).toFixed(2).replace('.', ',')} bb</td>
                    <td className="text-right text-slate-500 pl-2">{c.foldEquity !== undefined ? `FE ${Math.round(c.foldEquity * 100)}%` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 text-sm">
            {a.referenceRange ? (
              <>
                <div className="text-xs text-slate-400 mb-1">Range di riferimento: <span className="text-slate-200">{a.referenceRange.label}</span> (~{Math.round(a.referenceRange.percent)}%)</div>
                <RangeGrid codes={a.referenceRange.codes} highlight={a.heroCode} />
              </>
            ) : (
              <div className="text-xs text-slate-400 space-y-1">
                <div className="text-slate-300 font-semibold">Range stimati degli avversari</div>
                {a.villains.map((vv) => (
                  <div key={vv.seat}>
                    <b className="text-slate-200">{vv.name}</b> ({vv.position}): {vv.preflopLabel} (~{Math.round(vv.preflopPercent)}% preflop)
                    {vv.notes.map((n, i) => <div key={i} className="pl-3">· {n}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showTable && (
        <div className="rounded-lg bg-slate-900/60 p-2">
          <Table state={d.stateBefore} heroSeat={HERO_SEAT} />
        </div>
      )}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none">Assunzioni e limiti di questo consiglio</summary>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          {a.assumptions.map((x, i) => <li key={i}>{x}</li>)}
          {a.multipleLinesValid && <li>In questa situazione più linee hanno un EV simile: non esiste un'unica risposta giusta.</li>}
        </ul>
      </details>
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{k}</span>
      <span className="text-white font-semibold">{v}</span>
    </div>
  );
}
