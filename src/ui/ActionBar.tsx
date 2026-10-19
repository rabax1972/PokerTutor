import { useEffect, useMemo, useState } from 'react';
import type { GameState, LegalActions, PlayerAction } from '../engine/game';
import { potTotal } from '../engine/game';
import { BIG_BLIND } from '../game/session';
import { bb } from './format';

interface Props {
  state: GameState;
  legal: LegalActions;
  onAct: (a: PlayerAction) => void;
}

interface Preset {
  label: string;
  to: number;
}

function presets(state: GameState, legal: LegalActions): Preset[] {
  const out: Preset[] = [];
  const pot = potTotal(state);
  const add = (label: string, to: number) => {
    const v = Math.round(Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to)) / 50) * 50;
    const clamped = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, v));
    if (!out.some((p) => p.to === clamped)) out.push({ label, to: clamped });
  };
  if (state.street === 'preflop') {
    const raises = state.log.filter((a) => a.street === 'preflop' && a.type === 'raise').length;
    if (raises === 0) {
      const limpers = state.log.filter((a) => a.street === 'preflop' && a.type === 'call').length;
      add('2,5 bb', 2.5 * BIG_BLIND + limpers * BIG_BLIND);
      add('3 bb', 3 * BIG_BLIND + limpers * BIG_BLIND);
      add('4 bb', 4 * BIG_BLIND + limpers * BIG_BLIND);
    } else {
      add('×3', state.currentBet * 3);
      add('×4', state.currentBet * 4);
    }
  } else {
    const potAfterCall = pot + legal.toCall;
    for (const [label, f] of [['⅓ piatto', 1 / 3], ['½ piatto', 0.5], ['¾ piatto', 0.75], ['Piatto', 1]] as const) {
      add(label, state.currentBet + potAfterCall * f);
    }
  }
  return out.filter((p) => p.to < legal.maxRaiseTo);
}

export function ActionBar({ state, legal, onAct }: Props) {
  const ps = useMemo(() => presets(state, legal), [state, legal]);
  const [amount, setAmount] = useState(legal.minRaiseTo);
  useEffect(() => setAmount(ps[0]?.to ?? legal.minRaiseTo), [legal, ps]);

  const isAllIn = amount >= legal.maxRaiseTo;
  const raiseLabel = legal.raiseType === 'bet' ? 'Punta' : 'Rilancia a';

  return (
    <div className="w-full max-w-3xl mx-auto bg-slate-800/95 border border-slate-600 rounded-xl p-2 sm:p-3 shadow-xl">
      {legal.canRaise && (
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex flex-wrap gap-1.5">
            {ps.map((p) => (
              <button
                key={p.label}
                onClick={() => setAmount(p.to)}
                className={`px-2 py-1 rounded text-xs sm:text-sm border ${amount === p.to ? 'bg-sky-600 border-sky-400 text-white' : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setAmount(legal.maxRaiseTo)}
              className={`px-2 py-1 rounded text-xs sm:text-sm border ${isAllIn ? 'bg-rose-600 border-rose-400 text-white' : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'}`}
            >
              All-in
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={50}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 accent-sky-500"
              aria-label="Importo della puntata"
            />
            <input
              type="number"
              min={legal.minRaiseTo / BIG_BLIND}
              max={legal.maxRaiseTo / BIG_BLIND}
              step={0.5}
              value={amount / BIG_BLIND}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value) * BIG_BLIND);
                if (!Number.isNaN(v)) setAmount(Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, v)));
              }}
              className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              aria-label="Importo in big blind"
            />
            <span className="text-slate-400 text-xs">bb</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <button
          disabled={!legal.canFold}
          onClick={() => onAct({ type: 'fold' })}
          className="py-2.5 rounded-lg font-semibold bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Fold
        </button>
        {legal.canCheck ? (
          <button onClick={() => onAct({ type: 'check' })} className="py-2.5 rounded-lg font-semibold bg-slate-600 hover:bg-slate-500 text-white">
            Check
          </button>
        ) : (
          <button onClick={() => onAct({ type: 'call' })} className="py-2.5 rounded-lg font-semibold bg-emerald-700 hover:bg-emerald-600 text-white">
            Call {bb(legal.toCall)}
          </button>
        )}
        <button
          disabled={!legal.canRaise}
          onClick={() => onAct({ type: legal.raiseType, amount })}
          className="py-2.5 rounded-lg font-semibold bg-sky-700 hover:bg-sky-600 text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm sm:text-base"
        >
          {isAllIn ? 'All-in' : `${raiseLabel} ${bb(amount)}`}
        </button>
      </div>
    </div>
  );
}
