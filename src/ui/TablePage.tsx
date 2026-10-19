import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLegalActions, type PlayerAction } from '../engine/game';
import { botStep, hasHeroAutoAction, heroAct, heroAutoStep, HERO_SEAT, isHeroTurn, needsHeroDecision, startHand, type HandSetup, type LiveHand } from '../game/session';
import { ActionBar } from './ActionBar';
import { HandLog } from './HandLog';
import { Table } from './Table';
import { bb } from './format';

interface Props {
  makeSetup: (handNumber: number) => HandSetup;
  onExit: () => void;
  onHandComplete?: (hand: LiveHand) => void;
  /** Contenuto mostrato a fine mano (es. pannello di review). */
  renderAfterHand?: (hand: LiveHand) => ReactNode;
  subtitle?: string;
}

const BOT_DELAY_MS = 650;

export function TablePage({ makeSetup, onExit, onHandComplete, renderAfterHand, subtitle }: Props) {
  const [handNumber, setHandNumber] = useState(0);
  const [hand, setHand] = useState<LiveHand>(() => startHand(makeSetup(0)));
  const [sessionNet, setSessionNet] = useState(0);
  const [hands, setHands] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // I bot agiscono con un piccolo ritardo, per seguire l'azione.
  useEffect(() => {
    if (hand.state.isComplete) return;
    if (isHeroTurn(hand)) {
      if (!hasHeroAutoAction(hand)) return;
      const t = setTimeout(() => setHand((h) => heroAutoStep(h)), BOT_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setHand((h) => botStep(h)), BOT_DELAY_MS);
    return () => clearTimeout(t);
  }, [hand]);

  // Fine mano: aggiorna il risultato della sessione e notifica (una sola volta per mano).
  const [reported, setReported] = useState(-1);
  useEffect(() => {
    if (hand.state.isComplete && reported !== handNumber) {
      setReported(handNumber);
      setSessionNet((n) => n + (hand.state.result?.net[HERO_SEAT] ?? 0));
      setHands((h) => h + 1);
      onHandComplete?.(hand);
    }
  }, [hand, handNumber, reported, onHandComplete]);

  const legal = useMemo(() => (needsHeroDecision(hand) ? getLegalActions(hand.state) : null), [hand]);

  const act = useCallback((a: PlayerAction) => {
    try {
      setError(null);
      setHand(heroAct(hand, a));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [hand]);

  const next = () => {
    const n = handNumber + 1;
    setHandNumber(n);
    setHand(startHand(makeSetup(n)));
    setShowLog(false);
  };

  const done = hand.state.isComplete;
  const heroNet = hand.state.result?.net[HERO_SEAT] ?? 0;

  return (
    <div className="px-2 sm:px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto text-slate-200 text-sm">
        <button onClick={onExit} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600">← Esci</button>
        <div className="text-center">
          <div className="font-semibold">{hand.setup.title ?? `Mano #${handNumber + 1}`}</div>
          {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
        </div>
        <div className="text-right text-xs">
          <div>Mani: {hands}</div>
          <div className={sessionNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            Sessione: {sessionNet >= 0 ? '+' : ''}{bb(sessionNet)}
          </div>
        </div>
      </div>

      {hand.setup.goal && (
        <div className="max-w-4xl mx-auto rounded-lg bg-indigo-950/70 border border-indigo-700 px-3 py-2 text-sm text-indigo-100">
          🎯 {hand.setup.goal}
        </div>
      )}

      <Table state={hand.state} heroSeat={HERO_SEAT} />

      <div className="max-w-4xl mx-auto min-h-[7rem]">
        {legal && <ActionBar state={hand.state} legal={legal} onAct={act} />}
        {!legal && !done && (
          <div className="text-center text-slate-400 text-sm py-6 animate-pulse">
            {hand.state.toAct === HERO_SEAT ? 'Azione automatica della lezione…' : `${hand.state.players[hand.state.toAct ?? 0]?.name} sta pensando…`}
          </div>
        )}
        {error && <div className="text-rose-400 text-sm text-center mt-1">{error}</div>}
        {done && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-2">
            <div className={`text-lg font-bold ${heroNet > 0 ? 'text-emerald-400' : heroNet < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {heroNet > 0 ? `Hai vinto ${bb(heroNet)}` : heroNet < 0 ? `Hai perso ${bb(-heroNet)}` : 'Pareggio'}
            </div>
            <button onClick={next} className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
              Mano successiva →
            </button>
          </div>
        )}
      </div>

      {done && renderAfterHand && <div className="max-w-4xl mx-auto">{renderAfterHand(hand)}</div>}

      <div className="max-w-4xl mx-auto">
        <button onClick={() => setShowLog((s) => !s)} className="text-xs text-slate-400 underline">
          {showLog ? 'Nascondi' : 'Mostra'} la cronologia della mano
        </button>
        {(showLog || done) && (
          <div className="mt-2 rounded-lg bg-slate-800/80 border border-slate-700 p-3">
            <HandLog state={hand.state} heroSeat={HERO_SEAT} />
          </div>
        )}
      </div>
    </div>
  );
}
