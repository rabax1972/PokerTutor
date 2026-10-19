import type { Card } from '../engine/cards';
import {
  getLegalActions,
  isForcedPost,
  potTotal,
  type ActionRecord,
  type GameState,
  type LegalActions,
  type PlayerState,
  type Street,
} from '../engine/game';
import type { Position } from '../engine/positions';

export type PreflopKind = 'unopened' | 'limped' | 'vsOpen' | 'vs3bet' | 'vs4bet';

export interface PreflopSituation {
  kind: PreflopKind;
  /** Numero di rilanci (l'apertura conta come 1). */
  raises: number;
  limpers: number;
  openerSeat?: number;
  openerPos?: Position;
  lastRaiserSeat?: number;
  lastRaiserPos?: Position;
  /** Seat che hanno chiamato l'ultimo rilancio. */
  callers: number[];
}

/** Tutto ciò che serve per decidere (bot) o per consigliare (tutor) in un dato momento. */
export interface DecisionContext {
  state: GameState;
  seat: number;
  me: PlayerState;
  street: Street;
  board: Card[];
  numPlayers: number;
  bb: number;
  /** Piatto complessivo, comprese le puntate della street in corso. */
  pot: number;
  toCall: number;
  /** Quota di equity necessaria per chiamare: toCall / (pot + toCall). */
  potOdds: number;
  /** Stack effettivo (fiches ancora dietro) contro l'avversario più grande ancora in mano. */
  effectiveStack: number;
  effectiveStackBB: number;
  /** Stack-to-pot ratio a inizio street. */
  spr: number;
  opponents: PlayerState[];
  /** Agisce per ultimo tra chi è ancora in mano (postflop). */
  inPosition: boolean;
  preflop: PreflopSituation;
  legal: LegalActions;
  /** Azioni già fatte nella street corrente (escluse le blind). */
  streetLog: ActionRecord[];
  /** Ultimo aggressore della street precedente (per c-bet/donk). */
  previousStreetAggressor?: number;
}

export function analyzePreflop(state: GameState, upToIndex = state.log.length): PreflopSituation {
  const log = state.log.slice(0, upToIndex).filter((a) => a.street === 'preflop');
  let raises = 0;
  let limpers = 0;
  let openerSeat: number | undefined;
  let lastRaiserSeat: number | undefined;
  let callers: number[] = [];
  for (const a of log) {
    if (a.type === 'raise' || a.type === 'bet') {
      raises++;
      if (raises === 1) openerSeat = a.seat;
      lastRaiserSeat = a.seat;
      callers = [];
    } else if (a.type === 'call') {
      if (raises === 0) limpers++;
      else callers.push(a.seat);
    }
  }
  const kind: PreflopKind =
    raises === 0 ? (limpers > 0 ? 'limped' : 'unopened') : raises === 1 ? 'vsOpen' : raises === 2 ? 'vs3bet' : 'vs4bet';
  return {
    kind,
    raises,
    limpers,
    openerSeat,
    openerPos: openerSeat !== undefined ? state.players[openerSeat].position : undefined,
    lastRaiserSeat,
    lastRaiserPos: lastRaiserSeat !== undefined ? state.players[lastRaiserSeat].position : undefined,
    callers,
  };
}

/** Ordine di azione postflop: posti a partire dal primo dopo il bottone. */
export function postflopOrder(state: GameState): number[] {
  const n = state.numPlayers;
  return Array.from({ length: n }, (_, k) => (state.buttonSeat + 1 + k) % n);
}

export function buildContext(state: GameState, seat?: number): DecisionContext | null {
  const legal = getLegalActions(state);
  if (!legal) return null;
  const s = seat ?? legal.seat;
  const me = state.players[s];
  const opponents = state.players.filter((p) => p.seat !== s && !p.folded);
  const pot = potTotal(state);
  const toCall = legal.toCall;
  const myBehind = me.stack;
  const maxOpp = Math.max(0, ...opponents.map((p) => p.stack + p.streetBet - me.streetBet));
  const effectiveStack = Math.min(myBehind, maxOpp);
  const startOfStreetPot = pot - state.players.reduce((sum, p) => sum + p.streetBet, 0);
  const startStacks = Math.min(
    me.stack + me.streetBet,
    Math.max(0, ...opponents.map((p) => p.stack + p.streetBet)),
  );
  const order = postflopOrder(state).filter((x) => !state.players[x].folded);
  const inPosition = order[order.length - 1] === s;
  const streetLog = state.log.filter(
    (a) => a.street === state.street && !isForcedPost(a),
  );
  let previousStreetAggressor: number | undefined;
  const streets: Street[] = ['preflop', 'flop', 'turn', 'river'];
  const prev = streets[streets.indexOf(state.street) - 1];
  if (prev) {
    const aggr = state.log.filter((a) => a.street === prev && (a.type === 'bet' || a.type === 'raise'));
    previousStreetAggressor = aggr[aggr.length - 1]?.seat;
  }
  return {
    state,
    seat: s,
    me,
    street: state.street,
    board: state.board,
    numPlayers: state.numPlayers,
    bb: state.bigBlind,
    pot,
    toCall,
    potOdds: toCall > 0 ? toCall / (pot + toCall) : 0,
    effectiveStack,
    effectiveStackBB: effectiveStack / state.bigBlind,
    spr: startOfStreetPot > 0 ? startStacks / startOfStreetPot : Infinity,
    opponents,
    inPosition,
    preflop: analyzePreflop(state),
    legal,
    streetLog,
    previousStreetAggressor,
  };
}

/** Converte una puntata espressa come frazione del piatto in un importo "raise to" legale. */
export function sizeToAmount(ctx: DecisionContext, potFraction: number): number {
  const { legal, me, state } = ctx;
  // Su un rilancio il piatto si conta dopo aver chiamato (regola del "pot-size raise").
  const potAfterCall = ctx.pot + ctx.toCall;
  const raiseBy = potAfterCall * potFraction;
  let to = Math.round(state.currentBet + raiseBy);
  to = roundChips(to, state.bigBlind);
  to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
  // Se resterebbe dietro meno del 20% dello stack, meglio andare all-in.
  if (legal.maxRaiseTo - to < 0.2 * (me.stack + me.streetBet)) to = legal.maxRaiseTo;
  return to;
}

/** Arrotonda agli step "naturali" (mezzo big blind se possibile). */
export function roundChips(amount: number, bb: number): number {
  const step = Math.max(1, Math.round(bb / 2));
  return Math.round(amount / step) * step;
}

/** Importo di un rilancio preflop espresso in big blind (es. apertura a 2.5bb). */
export function preflopRaiseTo(ctx: DecisionContext, bbMultiple: number): number {
  const { legal, bb } = ctx;
  let to = roundChips(bbMultiple * bb, bb);
  to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
  if (legal.maxRaiseTo - to < 0.25 * legal.maxRaiseTo) to = legal.maxRaiseTo;
  return to;
}

/** Taglia standard di un'apertura / 3-bet / 4-bet, in big blind. */
export function standardPreflopSize(ctx: DecisionContext): number {
  const { preflop, state, bb, me } = ctx;
  const inPos = me.position === 'BTN' || (!['SB', 'BB'].includes(me.position) && ctx.numPlayers > 2);
  if (preflop.kind === 'unopened') return me.position === 'SB' && ctx.numPlayers > 2 ? 3 : 2.5;
  if (preflop.kind === 'limped') return 3 + preflop.limpers;
  const current = state.currentBet / bb;
  if (preflop.kind === 'vsOpen') return current * (inPos ? 3 : 3.8) + preflop.callers.length * current;
  if (preflop.kind === 'vs3bet') return current * 2.3;
  return Math.max(current * 2.2, me.stack / bb + me.streetBet / bb);
}
