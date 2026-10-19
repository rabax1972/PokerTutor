import { useState } from 'react';
import type { BankrollLevel, GameMode, SessionConfig } from '../game/session';
import { bankrollInfo } from '../strategy/bankroll';
import { pct } from './format';
import { Term } from './Term';

interface Props {
  initial?: Partial<SessionConfig>;
  onStart: (cfg: SessionConfig) => void;
  /** Modalità disponibili (le altre sono mostrate come "in arrivo"). */
  modes?: GameMode[];
  reviewAvailable?: boolean;
}

const STACKS = [
  { bb: 15, label: '15 bb', note: 'Short stack: push/fold' },
  { bb: 40, label: '40 bb', note: 'Stack medio-corto' },
  { bb: 100, label: '100 bb', note: 'Standard cash game' },
  { bb: 200, label: '200 bb', note: 'Stack profondi' },
];

const MODES: { id: GameMode; label: string; desc: string }[] = [
  { id: 'free', label: 'Mano libera', desc: 'Mani casuali contro bot di stili diversi.' },
  { id: 'lesson', label: 'Lezioni a tema', desc: 'Scenari guidati su un concetto preciso.' },
  { id: 'review', label: 'Ripasso errori', desc: 'Situazioni simili a quelle in cui hai sbagliato di più.' },
];

function Choice({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'bg-sky-700 border-sky-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

export function SetupScreen({ initial, onStart, modes = ['free', 'lesson', 'review'], reviewAvailable = true }: Props) {
  const [numPlayers, setNumPlayers] = useState(initial?.numPlayers ?? 6);
  const [mode, setMode] = useState<GameMode>(initial?.mode ?? 'free');
  const [stackBB, setStackBB] = useState(initial?.stackBB ?? 100);
  const [bankroll, setBankroll] = useState<BankrollLevel>(initial?.bankroll ?? 'adequate');
  const br = bankrollInfo(bankroll);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 text-slate-100">
      <section>
        <h2 className="text-lg font-bold mb-2">1. Giocatori al tavolo</h2>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Choice key={n} active={numPlayers === n} onClick={() => setNumPlayers(n)}>
              <span className="font-bold">{n}</span>
              <span className="text-xs text-slate-300 ml-1">{n === 2 ? 'heads-up' : n <= 4 ? 'corto' : n <= 6 ? '6-max' : 'pieno'}</span>
            </Choice>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {numPlayers <= 4
            ? 'Tavolo corto: i blind arrivano spesso, quindi si gioca più largo e più aggressivo. Le mani medie valgono di più.'
            : 'Tavolo pieno: più avversari significa più probabilità che qualcuno abbia una mano forte. Si apre più stretto, soprattutto dalle prime posizioni.'}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">2. Modalità</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {MODES.map((m) => (
            <Choice
              key={m.id}
              active={mode === m.id}
              onClick={() => setMode(m.id)}
              disabled={!modes.includes(m.id) || (m.id === 'review' && !reviewAvailable)}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-xs text-slate-300">
                {!modes.includes(m.id) ? 'In arrivo' : m.id === 'review' && !reviewAvailable ? 'Gioca qualche mano prima: nessun errore da ripassare' : m.desc}
              </div>
            </Choice>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">3. Stack e bankroll</h2>
        <div className="text-sm text-slate-300 mb-1">Stack al tavolo (in <Term k="bb">big blind</Term>)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {STACKS.map((s) => (
            <Choice key={s.bb} active={stackBB === s.bb} onClick={() => setStackBB(s.bb)}>
              <div className="font-semibold">{s.label}</div>
              <div className="text-xs text-slate-300">{s.note}</div>
            </Choice>
          ))}
        </div>
        <div className="text-sm text-slate-300 mb-1"><Term k="bankroll">Bankroll</Term> complessivo</div>
        <div className="grid sm:grid-cols-3 gap-2">
          {(['short', 'adequate', 'large'] as BankrollLevel[]).map((l) => (
            <Choice key={l} active={bankroll === l} onClick={() => setBankroll(l)}>
              <div className="font-semibold">{bankrollInfo(l).label}</div>
            </Choice>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm">
          <div>
            <Term k="riskOfRuin">Rischio di rovina</Term> stimato: <b className={br.riskOfRuin > 0.1 ? 'text-rose-400' : 'text-emerald-400'}>{pct(br.riskOfRuin, br.riskOfRuin < 0.01 ? 2 : 0)}</b>
            <span className="text-slate-400 text-xs"> (ipotesi: giocatore vincente a 5bb/100 mani, deviazione standard 90bb/100)</span>
          </div>
          <p className="text-slate-300 mt-1">{br.advice}</p>
        </div>
      </section>

      <button
        onClick={() => onStart({ numPlayers, mode, stackBB, bankroll })}
        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold shadow-lg"
      >
        {mode === 'lesson' ? 'Scegli la lezione' : 'Siediti al tavolo'}
      </button>
    </div>
  );
}
