import type { GameState, Street } from '../engine/game';
import { STREETS } from '../engine/game';
import { CardRow } from './CardView';
import { STREET_IT, actionText, bb } from './format';

export function HandLog({ state, heroSeat }: { state: GameState; heroSeat: number }) {
  const streets = STREETS.filter((st) => state.log.some((a) => a.street === st));
  const boardFor = (st: Street) => state.runout.slice(0, st === 'flop' ? 3 : st === 'turn' ? 4 : st === 'river' ? 5 : 0);
  return (
    <div className="text-xs sm:text-sm text-slate-200 space-y-2">
      {streets.map((st) => (
        <div key={st}>
          <div className="flex items-center gap-2 font-semibold text-amber-300 mb-0.5">
            {STREET_IT[st]}
            {st !== 'preflop' && <CardRow cards={boardFor(st)} />}
          </div>
          <ul className="space-y-0.5">
            {state.log
              .filter((a) => a.street === st)
              .map((a, i) => {
                const p = state.players[a.seat];
                return (
                  <li key={i} className={a.seat === heroSeat ? 'text-sky-300 font-semibold' : ''}>
                    <span className="text-slate-400">{p.position}</span> {p.name} {actionText(a)}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {state.isComplete && state.result && (
        <div className="border-t border-slate-700 pt-2">
          <div className="font-semibold text-amber-300 mb-0.5">Risultato</div>
          {!state.result.showdown && (
            <div>
              {state.players.find((p) => !p.folded)?.name} vince {bb(state.result.pots.reduce((s, p) => s + p.amount, 0))} senza showdown
            </div>
          )}
          {state.result.showdown && state.result.pots.map((pot, i) => {
            const winners = state.result!.winnersPerPot[i];
            if (pot.eligible.length === 1) {
              return (
                <div key={i}>{state.players[pot.eligible[0]].name} riprende {bb(pot.amount)} non chiamati</div>
              );
            }
            return (
              <div key={i}>
                {i === 0 ? 'Piatto principale' : `Side pot ${i}`} ({bb(pot.amount)}):{' '}
                {winners.map((w) => state.players[w].name).join(' e ')}
                {winners.length > 1 ? ' (diviso)' : ''}
                {state.result!.showdown && winners[0] !== undefined && ` con ${state.result!.handNames[winners[0]]?.toLowerCase()}`}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
