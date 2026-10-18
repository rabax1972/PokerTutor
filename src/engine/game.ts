import type { Card } from './cards';
import { evaluate, evaluateDetailed } from './evaluator';
import { shuffledDeck } from './deck';
import { createRng, randomSeed } from './rng';
import {
  type Position,
  blindSeats,
  firstToActPostflop,
  firstToActPreflop,
  positionOfSeat,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from './positions';
import { computePots, distributePots, type Pot } from './pots';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

/** Azione di un giocatore. Per bet/raise `amount` è il totale puntato nella street ("raise to"). */
export interface PlayerAction {
  type: ActionType;
  amount?: number;
}

export interface PlayerConfig {
  name: string;
  stack: number;
  isHero?: boolean;
  botStyle?: string;
}

export interface HandConfig {
  players: PlayerConfig[];
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  seed?: number;
  /** Carte preimpostate per posto (lezioni a tema). */
  presetHoles?: (Card[] | undefined)[];
  /** Board preimpostato (anche parziale): le carte mancanti vengono pescate dal mazzo. */
  presetBoard?: Card[];
}

export interface PlayerState {
  seat: number;
  name: string;
  isHero: boolean;
  botStyle?: string;
  position: Position;
  stackStart: number;
  stack: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  /** Fiches messe nella street corrente. */
  streetBet: number;
  /** Fiches messe in totale nella mano (inclusa la street corrente). */
  committed: number;
  /** Ha già fatto un'azione volontaria in questa street (postare il blind non conta). */
  hasActed: boolean;
  /** Valore di `fullRaiseCount` al momento della sua ultima azione: serve per sapere se l'azione è stata riaperta. */
  actedAtRaiseLevel: number;
}

export interface ActionRecord {
  seat: number;
  street: Street;
  type: ActionType | 'post-sb' | 'post-bb';
  /** Totale puntato dal giocatore nella street dopo l'azione. */
  amount: number;
  /** Fiches aggiunte con questa azione. */
  added: number;
  potBefore: number;
  toCallBefore: number;
  stackBefore: number;
  allIn: boolean;
  board: Card[];
}

export interface HandResult {
  pots: Pot[];
  winnersPerPot: number[][];
  payouts: number[];
  showdown: boolean;
  /** Nome della mano per chi è arrivato allo showdown (null se ha foldato o non c'è showdown). */
  handNames: (string | null)[];
  bestCards: (Card[] | null)[];
  /** Variazione dello stack di ciascun giocatore. */
  net: number[];
}

export interface GameState {
  numPlayers: number;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  smallBlind: number;
  bigBlind: number;
  players: PlayerState[];
  /** Le 5 carte comuni già decise; `board` è la parte scoperta. */
  runout: Card[];
  board: Card[];
  street: Street;
  currentBet: number;
  lastRaiseSize: number;
  fullRaiseCount: number;
  toAct: number | null;
  log: ActionRecord[];
  isComplete: boolean;
  result?: HandResult;
  seed: number;
}

export interface LegalActions {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  /** Fiches da aggiungere per chiamare (0 se si può fare check). */
  toCall: number;
  canCall: boolean;
  canRaise: boolean;
  /** 'bet' se nessuno ha ancora puntato in questa street, altrimenti 'raise'. */
  raiseType: 'bet' | 'raise';
  minRaiseTo: number;
  maxRaiseTo: number;
}

// ---------------------------------------------------------------------------

export function potTotal(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.committed, 0);
}

const isActive = (p: PlayerState) => !p.folded && !p.allIn;
const inHand = (p: PlayerState) => !p.folded;

export function createHand(config: HandConfig): GameState {
  const n = config.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Giocatori: da ${MIN_PLAYERS} a ${MAX_PLAYERS}`);
  const seed = config.seed ?? randomSeed();
  const rng = createRng(seed);

  const preset: Card[] = [];
  config.presetHoles?.forEach((h) => h && preset.push(...h));
  if (config.presetBoard) preset.push(...config.presetBoard);
  if (new Set(preset).size !== preset.length) throw new Error('Carte preimpostate duplicate');
  const deck = shuffledDeck(rng, preset);

  const { sb, bb } = blindSeats(config.buttonSeat, n);
  const players: PlayerState[] = config.players.map((pc, seat) => ({
    seat,
    name: pc.name,
    isHero: !!pc.isHero,
    botStyle: pc.botStyle,
    position: positionOfSeat(seat, config.buttonSeat, n),
    stackStart: pc.stack,
    stack: pc.stack,
    hole: config.presetHoles?.[seat]?.slice() ?? [deck.pop()!, deck.pop()!],
    folded: false,
    allIn: false,
    streetBet: 0,
    committed: 0,
    hasActed: false,
    actedAtRaiseLevel: -1,
  }));
  const runout = (config.presetBoard ?? []).slice(0, 5);
  while (runout.length < 5) runout.push(deck.pop()!);

  const s: GameState = {
    numPlayers: n,
    buttonSeat: config.buttonSeat,
    sbSeat: sb,
    bbSeat: bb,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    players,
    runout,
    board: [],
    street: 'preflop',
    currentBet: 0,
    lastRaiseSize: config.bigBlind,
    fullRaiseCount: 0,
    toAct: null,
    log: [],
    isComplete: false,
    seed,
  };

  postBlind(s, sb, config.smallBlind, 'post-sb');
  postBlind(s, bb, config.bigBlind, 'post-bb');
  // Anche se il BB è corto, per restare in mano bisogna pareggiare il big blind intero.
  s.currentBet = config.bigBlind;
  s.toAct = findNextToAct(s, firstToActPreflop(config.buttonSeat, n), true);
  progress(s);
  return s;
}

function postBlind(s: GameState, seat: number, amount: number, type: 'post-sb' | 'post-bb') {
  const p = s.players[seat];
  const potBefore = potTotal(s);
  const put = Math.min(amount, p.stack);
  const stackBefore = p.stack;
  p.stack -= put;
  p.streetBet += put;
  p.committed += put;
  if (p.stack === 0) p.allIn = true;
  s.log.push({
    seat, street: 'preflop', type, amount: p.streetBet, added: put, potBefore,
    toCallBefore: 0, stackBefore, allIn: p.allIn, board: [],
  });
}

function needsToAct(s: GameState, p: PlayerState): boolean {
  if (!isActive(p)) return false;
  // Se è l'unico che può ancora puntare e ha già pareggiato, non c'è nulla da decidere.
  const actives = s.players.filter(isActive).length;
  if (actives === 1 && p.streetBet >= s.currentBet) return false;
  return !p.hasActed || p.streetBet < s.currentBet;
}

/** Prossimo giocatore che deve agire partendo da `from` (incluso se inclusive). */
function findNextToAct(s: GameState, from: number, inclusive: boolean): number | null {
  for (let k = inclusive ? 0 : 1; k <= s.numPlayers; k++) {
    const seat = (from + k) % s.numPlayers;
    if (needsToAct(s, s.players[seat])) return seat;
  }
  return null;
}

export function getLegalActions(s: GameState): LegalActions | null {
  if (s.isComplete || s.toAct === null) return null;
  const p = s.players[s.toAct];
  const owed = s.currentBet - p.streetBet;
  const toCall = Math.min(owed, p.stack);
  const othersCanRespond = s.players.some((o) => o.seat !== p.seat && isActive(o));
  const reopened = !p.hasActed || p.actedAtRaiseLevel < s.fullRaiseCount;
  const canRaise = p.stack > owed && reopened && othersCanRespond;
  const maxRaiseTo = p.streetBet + p.stack;
  const baseMin = s.currentBet === 0 ? s.bigBlind : s.currentBet + s.lastRaiseSize;
  return {
    seat: p.seat,
    canFold: owed > 0,
    canCheck: owed <= 0,
    toCall: Math.max(0, toCall),
    canCall: owed > 0,
    canRaise,
    raiseType: s.currentBet === 0 ? 'bet' : 'raise',
    minRaiseTo: Math.min(baseMin, maxRaiseTo),
    maxRaiseTo,
  };
}

/** Applica un'azione e restituisce un nuovo stato (lo stato di partenza non viene modificato). */
export function applyAction(state: GameState, action: PlayerAction): GameState {
  const legal = getLegalActions(state);
  if (!legal) throw new Error('Nessuna azione possibile: mano terminata');
  const s: GameState = structuredClone(state);
  const p = s.players[legal.seat];
  const potBefore = potTotal(s);
  const stackBefore = p.stack;
  const toCallBefore = legal.toCall;
  let type: ActionType = action.type;

  switch (action.type) {
    case 'fold':
      // Fold quando si potrebbe fare check è legale ma inutile: lo trattiamo come fold comunque.
      p.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw new Error('Check non consentito: c\'è una puntata da pareggiare');
      break;
    case 'call': {
      if (!legal.canCall) {
        if (legal.canCheck) { type = 'check'; break; }
        throw new Error('Call non consentito');
      }
      put(p, legal.toCall);
      break;
    }
    case 'bet':
    case 'raise': {
      if (!legal.canRaise) throw new Error('Rilancio non consentito');
      const to = Math.round(action.amount ?? legal.minRaiseTo);
      if (to > legal.maxRaiseTo) throw new Error(`Importo oltre lo stack (max ${legal.maxRaiseTo})`);
      if (to < legal.minRaiseTo && to !== legal.maxRaiseTo) {
        throw new Error(`Rilancio minimo: ${legal.minRaiseTo}`);
      }
      if (to <= s.currentBet) throw new Error('Il rilancio deve superare la puntata attuale');
      type = legal.raiseType;
      const raiseSize = to - s.currentBet;
      const isFull = s.currentBet === 0 ? to >= s.bigBlind : raiseSize >= s.lastRaiseSize;
      put(p, to - p.streetBet);
      s.currentBet = to;
      if (isFull) {
        s.lastRaiseSize = Math.max(raiseSize, s.bigBlind);
        s.fullRaiseCount++;
      }
      break;
    }
    default:
      throw new Error(`Azione sconosciuta: ${(action as PlayerAction).type}`);
  }

  p.hasActed = true;
  p.actedAtRaiseLevel = s.fullRaiseCount;
  s.log.push({
    seat: p.seat, street: s.street, type, amount: p.streetBet, added: stackBefore - p.stack,
    potBefore, toCallBefore, stackBefore, allIn: p.allIn, board: s.board.slice(),
  });
  s.toAct = findNextToAct(s, p.seat, false);
  progress(s);
  return s;
}

function put(p: PlayerState, amount: number) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.streetBet += a;
  p.committed += a;
  if (p.stack === 0) p.allIn = true;
}

/** Fa avanzare la mano: fine per fold, chiusura del giro di puntate, nuove street, showdown. */
function progress(s: GameState) {
  for (;;) {
    const live = s.players.filter(inHand);
    if (live.length === 1) {
      finish(s, false);
      return;
    }
    if (s.toAct !== null) return; // qualcuno deve ancora parlare

    // Giro di puntate concluso.
    const actives = live.filter(isActive);
    if (s.street === 'river') {
      finish(s, true);
      return;
    }
    nextStreet(s);
    if (actives.length <= 1) {
      // Nessuno può più puntare: si scoprono le carte rimanenti.
      s.toAct = null;
      continue;
    }
    s.toAct = findNextToAct(s, firstToActPostflop(s.buttonSeat, s.numPlayers), true);
  }
}

function nextStreet(s: GameState) {
  const idx = STREETS.indexOf(s.street);
  s.street = STREETS[idx + 1];
  s.board = s.runout.slice(0, s.street === 'flop' ? 3 : s.street === 'turn' ? 4 : 5);
  s.currentBet = 0;
  s.lastRaiseSize = s.bigBlind;
  s.fullRaiseCount = 0;
  for (const p of s.players) {
    p.streetBet = 0;
    p.hasActed = false;
    p.actedAtRaiseLevel = -1;
  }
}

function finish(s: GameState, showdown: boolean) {
  const n = s.numPlayers;
  if (showdown) s.board = s.runout.slice(0, 5);
  const pots = computePots(s.players.map((p) => ({ committed: p.committed, folded: p.folded })));
  const scores: (number | null)[] = s.players.map((p) =>
    showdown && !p.folded ? evaluate([...p.hole, ...s.board]) : null,
  );
  const oddChipOrder = Array.from({ length: n }, (_, k) => (s.buttonSeat + 1 + k) % n);
  const { payouts, winnersPerPot } = distributePots(pots, scores, oddChipOrder);
  const details = s.players.map((p) =>
    showdown && !p.folded ? evaluateDetailed([...p.hole, ...s.board]) : null,
  );
  s.players.forEach((p, i) => {
    p.stack += payouts[i];
    p.streetBet = 0;
  });
  s.toAct = null;
  s.isComplete = true;
  s.result = {
    pots,
    winnersPerPot,
    payouts,
    showdown,
    handNames: details.map((d) => d?.name ?? null),
    bestCards: details.map((d) => d?.best ?? null),
    net: s.players.map((p) => p.stack - p.stackStart),
  };
}

/** Utilità: azioni volontarie (escluse le blind) di una street. */
export function streetActions(s: GameState, street: Street): ActionRecord[] {
  return s.log.filter((a) => a.street === street && a.type !== 'post-sb' && a.type !== 'post-bb');
}
