import type { Card } from '../engine/cards';
import { applyAction, createHand, type GameState, type PlayerAction } from '../engine/game';
import { positionNames, type Position } from '../engine/positions';
import { createRng, randomSeed, type Rng } from '../engine/rng';
import { decideBot } from '../bots/bot';
import { BOT_NAMES, type BotStyle } from '../bots/profiles';

export const SMALL_BLIND = 50;
export const BIG_BLIND = 100;
export const HERO_SEAT = 0;

export type BankrollLevel = 'short' | 'adequate' | 'large';
export type GameMode = 'free' | 'lesson' | 'review';

export interface SessionConfig {
  numPlayers: number;
  mode: GameMode;
  /** Stack iniziale dell'utente in big blind. */
  stackBB: number;
  bankroll: BankrollLevel;
  lessonId?: string;
}

/** Azione predefinita di un bot (lezioni a tema), identificato dalla posizione. */
export interface ScriptedAction {
  position: Position;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  type: PlayerAction['type'];
  /** Importo "raise to" in big blind, oppure frazione del piatto se `potFraction`. */
  amountBB?: number;
  potFraction?: number;
}

export interface HandSetup {
  numPlayers: number;
  buttonSeat: number;
  stacksBB: number[];
  botStyles: (BotStyle | undefined)[];
  presetHoles?: (Card[] | undefined)[];
  presetBoard?: Card[];
  script?: ScriptedAction[];
  /** Azioni dell'eroe giocate automaticamente (lezioni): non vengono valutate nella review. */
  heroScript?: ScriptedAction[];
  seed?: number;
  /** Titolo/obiettivo mostrato all'utente (lezioni). */
  title?: string;
  goal?: string;
  lessonId?: string;
  /** Categoria dell'errore che questa mano ripassa (modalità ripasso). */
  reviewTag?: string;
}

export interface HeroDecision {
  stateBefore: GameState;
  action: PlayerAction;
}

export interface LiveHand {
  setup: HandSetup;
  state: GameState;
  decisions: HeroDecision[];
  /** Indici delle azioni scriptate già consumate. */
  usedScript: number[];
  usedHeroScript?: number[];
}

const STYLES: BotStyle[] = ['tight', 'loose', 'aggressive', 'passive', 'regular'];

export function randomBotStyles(n: number, rng: Rng): (BotStyle | undefined)[] {
  return Array.from({ length: n }, (_, seat) =>
    seat === HERO_SEAT ? undefined : STYLES[Math.floor(rng() * STYLES.length)],
  );
}

/** Mano casuale per la modalità libera. Il bottone ruota a ogni mano. */
export function freeHandSetup(cfg: SessionConfig, handNumber: number, seed = randomSeed()): HandSetup {
  const rng = createRng(seed);
  const n = cfg.numPlayers;
  const stacksBB = Array.from({ length: n }, (_, seat) => {
    if (seat === HERO_SEAT) return cfg.stackBB;
    // Avversari con stack simili, un po' variabili.
    const f = 0.7 + rng() * 0.8;
    return Math.max(8, Math.round(cfg.stackBB * f));
  });
  return {
    numPlayers: n,
    buttonSeat: handNumber % n,
    stacksBB,
    botStyles: randomBotStyles(n, rng),
    seed,
  };
}

/** Posto del bottone che mette l'eroe nella posizione richiesta. */
export function buttonSeatForHeroPosition(pos: Position, numPlayers: number): number {
  const offset = positionNames(numPlayers).indexOf(pos);
  if (offset < 0) throw new Error(`Posizione ${pos} non disponibile con ${numPlayers} giocatori`);
  return (HERO_SEAT - offset + numPlayers) % numPlayers;
}

export function startHand(setup: HandSetup): LiveHand {
  const state = createHand({
    players: setup.stacksBB.map((bb, seat) => ({
      name: seat === HERO_SEAT ? 'Tu' : BOT_NAMES[(seat - 1 + BOT_NAMES.length) % BOT_NAMES.length],
      stack: Math.round(bb * BIG_BLIND),
      isHero: seat === HERO_SEAT,
      botStyle: setup.botStyles[seat],
    })),
    buttonSeat: setup.buttonSeat,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    seed: setup.seed,
    presetHoles: setup.presetHoles,
    presetBoard: setup.presetBoard,
  });
  return { setup, state, decisions: [], usedScript: [] };
}

export function isHeroTurn(hand: LiveHand): boolean {
  return !hand.state.isComplete && hand.state.toAct === HERO_SEAT;
}

function pendingHeroScript(hand: LiveHand): number {
  if (!isHeroTurn(hand)) return -1;
  const used = hand.usedHeroScript ?? [];
  return (hand.setup.heroScript ?? []).findIndex((a, i) => !used.includes(i) && a.street === hand.state.street);
}

/** True se tocca all'eroe e la lezione prevede un'azione automatica. */
export function hasHeroAutoAction(hand: LiveHand): boolean {
  return pendingHeroScript(hand) >= 0;
}

/** Gioca l'azione automatica dell'eroe prevista dalla lezione (non registrata come decisione). */
export function heroAutoStep(hand: LiveHand): LiveHand {
  const idx = pendingHeroScript(hand);
  if (idx < 0) return hand;
  const usedHeroScript = [...(hand.usedHeroScript ?? []), idx];
  try {
    const state = applyAction(hand.state, scriptedToAction(hand.state, hand.setup.heroScript![idx]));
    return { ...hand, state, usedHeroScript };
  } catch {
    return { ...hand, usedHeroScript };
  }
}

/** Turno dell'eroe che richiede una decisione vera dell'utente. */
export function needsHeroDecision(hand: LiveHand): boolean {
  return isHeroTurn(hand) && !hasHeroAutoAction(hand);
}

export function heroAct(hand: LiveHand, action: PlayerAction): LiveHand {
  if (!isHeroTurn(hand)) throw new Error('Non è il tuo turno');
  const state = applyAction(hand.state, action);
  return { ...hand, state, decisions: [...hand.decisions, { stateBefore: hand.state, action }] };
}

/** Esegue l'azione del bot di turno (scriptata se prevista dalla lezione). */
export function botStep(hand: LiveHand): LiveHand {
  const s = hand.state;
  if (s.isComplete || s.toAct === null || s.toAct === HERO_SEAT) return hand;
  const p = s.players[s.toAct];
  const scriptIdx = (hand.setup.script ?? []).findIndex(
    (a, i) => !hand.usedScript.includes(i) && a.position === p.position && a.street === s.street,
  );
  let action: PlayerAction;
  let usedScript = hand.usedScript;
  if (scriptIdx >= 0) {
    action = scriptedToAction(s, hand.setup.script![scriptIdx]);
    usedScript = [...usedScript, scriptIdx];
  } else {
    action = decideBot(s);
  }
  try {
    return { ...hand, state: applyAction(s, action), usedScript };
  } catch {
    // Azione scriptata non più legale: lascia decidere al bot.
    return { ...hand, state: applyAction(s, decideBot(s)), usedScript };
  }
}

function scriptedToAction(s: GameState, a: ScriptedAction): PlayerAction {
  if (a.type !== 'bet' && a.type !== 'raise') {
    if (a.type === 'call' && s.currentBet === s.players[s.toAct!].streetBet) return { type: 'check' };
    return { type: a.type };
  }
  let amount: number;
  if (a.potFraction !== undefined) {
    const pot = s.players.reduce((sum, p) => sum + p.committed, 0);
    amount = Math.round((s.currentBet + pot * a.potFraction) / 50) * 50;
  } else amount = Math.round((a.amountBB ?? 2.5) * s.bigBlind);
  const p = s.players[s.toAct!];
  amount = Math.min(amount, p.stack + p.streetBet);
  return { type: s.currentBet === 0 ? 'bet' : 'raise', amount };
}

/** Fa giocare i bot finché non tocca all'eroe o la mano finisce (utile nei test e nelle simulazioni). */
export function runBots(hand: LiveHand): LiveHand {
  let h = hand;
  let guard = 0;
  while (!h.state.isComplete && h.state.toAct !== HERO_SEAT && guard++ < 500) h = botStep(h);
  return h;
}
