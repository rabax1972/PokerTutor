import type { ActionRecord, GameState, PlayerState } from '../engine/game';
import { isForcedPost, potTotal } from '../engine/game';
import { shortLabel } from '../engine/positions';
import { BOT_PROFILES, type BotStyle } from '../bots/profiles';
import { CardView } from './CardView';
import { bb, shortActionText } from './format';

interface Props {
  state: GameState;
  heroSeat: number;
  /** Mostra le carte degli avversari (showdown o review). */
  revealAll?: boolean;
}

/** Coordinate del posto k-esimo (eroe in basso al centro, poi in senso orario). */
function seatXY(k: number, n: number) {
  const angle = ((90 + (k * 360) / n) * Math.PI) / 180;
  return { x: 50 + 44 * Math.cos(angle), y: 50 + 41 * Math.sin(angle) };
}

function lastActionOf(state: GameState, seat: number): ActionRecord | undefined {
  const acts = state.log.filter((a) => a.seat === seat && (a.street === state.street || state.isComplete));
  return acts[acts.length - 1];
}

export function Table({ state, heroSeat, revealAll }: Props) {
  const n = state.numPlayers;
  const pot = potTotal(state);
  const winners = new Set(state.result?.winnersPerPot.flat() ?? []);
  return (
    <div className="relative w-full max-w-4xl mx-auto aspect-[4/5] sm:aspect-[16/10]">
      {/* Feltro */}
      <div className="absolute inset-[9%] sm:inset-x-[7%] sm:inset-y-[10%] rounded-[50%] bg-gradient-to-b from-felt-light to-felt-dark border-[10px] border-amber-950 shadow-[inset_0_0_40px_rgba(0,0,0,.6),0_10px_30px_rgba(0,0,0,.5)]" />

      {/* Centro: board e piatto */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
        <div className="text-amber-200 text-xs sm:text-sm font-semibold bg-black/30 rounded-full px-3 py-0.5">
          Piatto: {bb(state.isComplete ? state.result!.pots.reduce((s, p) => s + p.amount, 0) : pot)}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <CardView key={i} card={state.board[i]} size="md" />
          ))}
        </div>
      </div>

      {state.players.map((p) => {
        const k = (p.seat - heroSeat + n) % n;
        const { x, y } = seatXY(k, n);
        const bx = 50 + (x - 50) * 0.58;
        const by = 50 + (y - 50) * 0.55;
        return (
          <div key={p.seat}>
            <Seat
              p={p}
              state={state}
              isHero={p.seat === heroSeat}
              reveal={!!revealAll || p.seat === heroSeat || (state.isComplete && !!state.result?.showdown && !p.folded)}
              toAct={state.toAct === p.seat}
              winner={state.isComplete && winners.has(p.seat) && (state.result?.payouts[p.seat] ?? 0) > 0}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
            {p.streetBet > 0 && !state.isComplete && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-white"
                style={{ left: `${bx}%`, top: `${by}%` }}
              >
                <span className="inline-block w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-amber-400 border-2 border-dashed border-amber-700" />
                {bb(p.streetBet)}
              </div>
            )}
            {state.buttonSeat === p.seat && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white text-slate-900 text-[10px] sm:text-xs font-black flex items-center justify-center shadow border border-slate-400"
                style={{ left: `${50 + (x - 50) * 0.72 + (k === 0 ? 9 : 0)}%`, top: `${50 + (y - 50) * 0.72}%` }}
                title="Dealer button"
              >
                D
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SeatProps {
  p: PlayerState;
  state: GameState;
  isHero: boolean;
  reveal: boolean;
  toAct: boolean;
  winner: boolean;
  style: React.CSSProperties;
}

function Seat({ p, state, isHero, reveal, toAct, winner, style }: SeatProps) {
  const last = lastActionOf(state, p.seat);
  const profile = p.botStyle ? BOT_PROFILES[p.botStyle as BotStyle] : undefined;
  const net = state.result?.net[p.seat] ?? 0;
  const handName = state.result?.handNames[p.seat];
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${p.folded ? 'opacity-45' : ''}`}
      style={style}
    >
      <div className="flex -space-x-2 sm:-space-x-3 mb-[-6px] z-0">
        {p.hole.map((c, i) => (
          <CardView key={i} card={c} hidden={!reveal} size={isHero ? 'md' : 'sm'} />
        ))}
      </div>
      <div
        className={`relative z-10 min-w-[4.6rem] sm:min-w-[6.5rem] rounded-lg px-1.5 py-1 text-center border-2 transition-all
          ${toAct ? 'border-amber-400 shadow-[0_0_14px_rgba(251,191,36,.7)]' : winner ? 'border-emerald-400' : 'border-slate-600'}
          ${isHero ? 'bg-sky-950/95' : 'bg-slate-900/95'}`}
      >
        <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs leading-tight">
          <span className="font-bold text-amber-300">{shortLabel(p.position, state.numPlayers)}</span>
          <span className="text-slate-200 truncate max-w-[3.5rem] sm:max-w-none">{p.name}</span>
        </div>
        {profile && (
          <div className="text-[9px] sm:text-[10px] text-slate-400 leading-tight" title={profile.description}>
            {profile.label}
          </div>
        )}
        <div className="text-[11px] sm:text-sm font-semibold text-white leading-tight">
          {p.allIn && !state.isComplete ? 'ALL-IN' : bb(p.stack)}
        </div>
        {state.isComplete && net !== 0 && (
          <div className={`text-[10px] sm:text-xs font-bold ${net > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {net > 0 ? '+' : ''}{bb(net)}
          </div>
        )}
        {!state.isComplete && last && !isForcedPost(last) && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] sm:text-[10px] font-semibold bg-slate-700 text-slate-100 rounded px-1.5">
            {shortActionText(last)}
          </div>
        )}
      </div>
      {state.isComplete && handName && !p.folded && (
        <div className={`mt-1 text-[9px] sm:text-[11px] font-semibold rounded px-1.5 whitespace-nowrap ${winner ? 'bg-emerald-600 text-white' : 'bg-black/50 text-slate-200'}`}>
          {handName}
        </div>
      )}
    </div>
  );
}
