import type { Card } from '../engine/cards';
import { positionNames, type Position } from '../engine/positions';
import { createRng, randomSeed, shuffleInPlace, type Rng } from '../engine/rng';
import { fullDeck } from '../engine/deck';
import { classifyHand, type Bucket } from '../strategy/handClass';
import { combosOf, handCode } from '../strategy/handNotation';
import { HAND_RANKING, handPercentile, rfiRange } from '../strategy/ranges';
import type { ConceptId, SpotTag } from '../strategy/types';
import {
  buttonSeatForHeroPosition,
  randomBotStyles,
  type HandSetup,
  type ScriptedAction,
  type SessionConfig,
} from '../game/session';

export interface Lesson {
  id: string;
  title: string;
  description: string;
  concept: ConceptId;
  /** Tipi di situazione che la lezione allena (usati dal ripasso errori). */
  spots: SpotTag[];
  generate: (cfg: SessionConfig, seed: number) => HandSetup;
}

// --- utilità -----------------------------------------------------------------

/** Ordine preflop delle posizioni (chi parla per primo → BB). */
function preflopOrder(n: number): Position[] {
  const names = positionNames(n);
  if (n === 2) return ['BTN', 'BB'];
  return [...names.slice(3), names[0], names[1], names[2]];
}

/** Fold scriptati per tutti i giocatori che parlano prima di `hero` preflop, tranne quelli in `except`. */
function foldsBefore(hero: Position, n: number, except: Position[] = []): ScriptedAction[] {
  const order = preflopOrder(n);
  return order
    .slice(0, order.indexOf(hero))
    .filter((p) => !except.includes(p))
    .map((position) => ({ position, street: 'preflop', type: 'fold' }));
}

/** Fold di tutti tranne `keep` (per lasciare un testa a testa). */
function foldsAllExcept(keep: Position[], n: number): ScriptedAction[] {
  return positionNames(n)
    .filter((p) => !keep.includes(p))
    .map((position) => ({ position, street: 'preflop' as const, type: 'fold' as const }));
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Mano casuale con percentile (classifica preflop) compreso tra lo e hi. */
function handInPercentile(rng: Rng, lo: number, hi: number): Card[] {
  const codes = HAND_RANKING.filter((h) => {
    const p = handPercentile(h);
    return p >= lo && p <= hi;
  });
  const combo = pick(rng, combosOf(pick(rng, codes.length ? codes : HAND_RANKING)));
  return [combo[0], combo[1]];
}

/** Genera carte dell'eroe + board finché il predicato è soddisfatto. */
function dealUntil(
  rng: Rng,
  pred: (hole: Card[], board: Card[]) => boolean,
  holeGen?: () => Card[],
): { hole: Card[]; board: Card[] } {
  for (let i = 0; i < 4000; i++) {
    const hole = holeGen ? holeGen() : [];
    const deck = shuffleInPlace(fullDeck().filter((c) => !hole.includes(c)), rng);
    const h = hole.length ? hole : [deck.pop()!, deck.pop()!];
    const board = deck.slice(0, 5);
    if (pred(h, board)) return { hole: h, board };
  }
  throw new Error('Impossibile generare lo scenario');
}

const bucketIs = (hole: Card[], board: Card[], buckets: Bucket[]) => buckets.includes(classifyHand(hole, board).bucket);

function baseSetup(cfg: SessionConfig, n: number, heroPos: Position, seed: number, rng: Rng, stackBB = 100): HandSetup {
  return {
    numPlayers: n,
    buttonSeat: buttonSeatForHeroPosition(heroPos, n),
    stacksBB: Array.from({ length: n }, () => (cfg.stackBB >= 40 ? cfg.stackBB : stackBB)),
    botStyles: randomBotStyles(n, rng),
    seed,
  };
}

function holes(n: number, hero: Card[]): (Card[] | undefined)[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? hero : undefined));
}

const tableSize = (cfg: SessionConfig, min = 3) => Math.max(min, cfg.numPlayers);

// --- lezioni -----------------------------------------------------------------

export const LESSONS: Lesson[] = [
  {
    id: 'open-button',
    title: 'Aprire dal bottone',
    description: 'Tutti foldano fino a te sul bottone: la posizione migliore. Quali mani aprire e di quanto?',
    concept: 'range-position',
    spots: ['preflop-open'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const btnPct = rfiRange('BTN', n).percent;
      const hole = rng() < 0.75 ? handInPercentile(rng, btnPct * 0.55, Math.min(100, btnPct * 1.45)) : handInPercentile(rng, 0, 100);
      return {
        ...baseSetup(cfg, n, 'BTN', seed, rng),
        presetHoles: holes(n, hole),
        script: foldsBefore('BTN', n),
        title: 'Lezione: aprire dal bottone',
        goal: 'Tutti hanno foldato fino a te. Dal bottone si apre circa il 40-45% delle mani (molto di più in heads-up): decidi se aprire e con che taglia.',
        lessonId: 'open-button',
      };
    },
  },
  {
    id: 'open-position',
    title: 'Range di apertura per posizione',
    description: 'Stessa mano, posizioni diverse: impara quanto cambia il range da UTG al cutoff.',
    concept: 'range-position',
    spots: ['preflop-open'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = tableSize(cfg, 4);
      const options = positionNames(n).filter((p) => p !== 'BB' && p !== 'SB' && p !== 'BTN');
      const pos = pick(rng, options);
      const pct = rfiRange(pos, n).percent;
      const hole = handInPercentile(rng, pct * 0.5, Math.min(100, pct * 1.8));
      return {
        ...baseSetup(cfg, n, pos, seed, rng),
        presetHoles: holes(n, hole),
        script: foldsBefore(pos, n),
        title: `Lezione: apertura da ${pos}`,
        goal: `Sei ${pos} con ${n} giocatori e nessuno è entrato nel piatto. Ricorda: più giocatori ci sono dietro di te, più stretto è il range (da qui circa il ${Math.round(pct)}%).`,
        lessonId: 'open-position',
      };
    },
  },
  {
    id: 'bb-defense',
    title: 'Difendere il big blind',
    description: 'Un avversario apre e tutti foldano: dal BB hai un ottimo prezzo. Quando difendere, quando 3-bet, quando foldare?',
    concept: 'bb-defense',
    spots: ['bb-defense'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const openers: Position[] = n === 2 ? ['BTN'] : (['BTN', 'CO', 'SB', 'UTG'] as Position[]).filter((p) => positionNames(n).includes(p));
      const opener = pick(rng, openers);
      const size = pick(rng, [2, 2.5, 2.5, 3]);
      const hole = handInPercentile(rng, 10, 85);
      return {
        ...baseSetup(cfg, n, 'BB', seed, rng),
        presetHoles: holes(n, hole),
        script: [
          ...foldsBefore(opener, n),
          { position: opener, street: 'preflop', type: 'raise', amountBB: size },
          ...foldsBefore('BB', n).filter((f) => preflopOrder(n).indexOf(f.position) > preflopOrder(n).indexOf(opener)),
        ],
        title: 'Lezione: difesa del big blind',
        goal: `${opener} apre a ${String(size).replace('.', ',')}bb e gli altri foldano. Nel BB hai già messo 1bb e chiudi l'azione: confronta il prezzo (pot odds) con la forza della tua mano.`,
        lessonId: 'bb-defense',
      };
    },
  },
  {
    id: 'vs-open',
    title: 'Rispondere a un\'apertura in posizione',
    description: 'Il cutoff o l\'hijack apre e tu sei sul bottone: 3-bet, call o fold?',
    concept: 'three-bet',
    spots: ['preflop-vs-open'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = tableSize(cfg, 4);
      const opener = pick(rng, (['CO', 'HJ'] as Position[]).filter((p) => positionNames(n).includes(p)));
      const hole = handInPercentile(rng, 0, 45);
      return {
        ...baseSetup(cfg, n, 'BTN', seed, rng),
        presetHoles: holes(n, hole),
        script: [...foldsBefore(opener, n), { position: opener, street: 'preflop', type: 'raise', amountBB: 2.5 }, ...foldsBefore('BTN', n, [opener]).filter((f) => preflopOrder(n).indexOf(f.position) > preflopOrder(n).indexOf(opener))],
        title: 'Lezione: rispondere a un\'apertura',
        goal: `${opener} apre a 2,5bb. Sei sul bottone: in posizione per il resto della mano. Scegli tra 3-bet (mani migliori e qualche bluff), call (mani giocabili) e fold.`,
        lessonId: 'vs-open',
      };
    },
  },
  {
    id: 'vs-3bet',
    title: 'Affrontare un 3-bet',
    description: 'Hai aperto e un avversario rilancia: 4-bet, call o fold?',
    concept: 'three-bet',
    spots: ['preflop-vs-3bet'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = tableSize(cfg, 3);
      const heroPos = pick(rng, (['CO', 'BTN'] as Position[]).filter((p) => positionNames(n).includes(p)));
      const threeBettor = pick(rng, ['SB', 'BB'] as Position[]);
      const pct = rfiRange(heroPos, n).percent;
      const hole = handInPercentile(rng, 0, pct);
      return {
        ...baseSetup(cfg, n, heroPos, seed, rng),
        presetHoles: holes(n, hole),
        heroScript: [{ position: heroPos, street: 'preflop', type: 'raise', amountBB: 2.5 }],
        script: [
          ...foldsAllExcept([heroPos, threeBettor], n),
          { position: threeBettor, street: 'preflop', type: 'raise', amountBB: 10 },
        ],
        title: 'Lezione: affrontare un 3-bet',
        goal: `Hai aperto da ${heroPos} (azione automatica) e ${threeBettor} rilancia a 10bb. Le mani più forti fanno 4-bet, quelle buone e giocabili chiamano, il resto folda.`,
        lessonId: 'vs-3bet',
      };
    },
  },
  {
    id: 'push-fold',
    title: 'Short stack: push/fold',
    description: 'Con pochi big blind: all-in o fold. Impara quanto si allarga il range con lo stack corto.',
    concept: 'push-fold',
    spots: ['push-fold'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const pos = pick(rng, positionNames(n).filter((p) => p !== 'BB'));
      const stack = pick(rng, [5, 7, 8, 10, 12]);
      const hole = handInPercentile(rng, 5, 80);
      const setup = baseSetup(cfg, n, pos, seed, rng);
      setup.stacksBB = setup.stacksBB.map((s, i) => (i === 0 ? stack : Math.max(20, s * (0.3 + rng() * 0.5))));
      return {
        ...setup,
        presetHoles: holes(n, hole),
        script: foldsBefore(pos, n),
        title: `Lezione: push/fold con ${stack}bb`,
        goal: `Hai solo ${stack}bb e tutti hanno foldato fino a te. Con uno stack così corto un rilancio normale ti impegna già: scegli tra all-in e fold.`,
        lessonId: 'push-fold',
      };
    },
  },
  {
    id: 'call-allin',
    title: 'Chiamare un all-in',
    description: 'Uno short stack va all-in: calcola le pot odds e confrontale con la tua equity contro il suo range.',
    concept: 'pot-odds',
    spots: ['call-allin'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const shover: Position = n === 2 ? 'BTN' : pick(rng, ['BTN', 'SB', 'CO'].filter((p) => positionNames(n).includes(p as Position)) as Position[]);
      const shoveBB = pick(rng, [6, 8, 10, 12, 15]);
      const setup = baseSetup(cfg, n, 'BB', seed, rng);
      const shoverSeat = (setup.buttonSeat + positionNames(n).indexOf(shover)) % n;
      setup.stacksBB = setup.stacksBB.map((s, i) => (i === shoverSeat ? shoveBB : s));
      return {
        ...setup,
        presetHoles: holes(n, handInPercentile(rng, 3, 60)),
        script: [
          ...foldsBefore(shover, n),
          { position: shover, street: 'preflop', type: 'raise', amountBB: shoveBB },
          ...foldsBefore('BB', n).filter((f) => preflopOrder(n).indexOf(f.position) > preflopOrder(n).indexOf(shover)),
        ],
        title: 'Lezione: chiamare un all-in',
        goal: `${shover} va all-in con ${shoveBB}bb. Calcola quanto devi chiamare rispetto al piatto (pot odds) e chiediti: che mani ha un giocatore che va all-in da ${shover}?`,
        lessonId: 'call-allin',
      };
    },
  },
  {
    id: 'pot-odds-flop',
    title: 'Pot odds con un progetto al flop',
    description: 'Hai un progetto e l\'avversario punta: conta gli outs, usa la regola del 2 e del 4 e confronta con le pot odds.',
    concept: 'pot-odds',
    spots: ['postflop-draw', 'postflop-call'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const { hole, board } = dealUntil(rng, (h, b) => bucketIs(h, b.slice(0, 3), ['draw', 'strongDraw']) && classifyHand(h, b.slice(0, 3)).draws.outs >= 8);
      const frac = pick(rng, [0.33, 0.5, 0.75, 1]);
      return {
        ...baseSetup(cfg, n, 'BB', seed, rng),
        presetHoles: holes(n, hole),
        presetBoard: board,
        heroScript: [
          { position: 'BB', street: 'preflop', type: 'call' },
          { position: 'BB', street: 'flop', type: 'check' },
        ],
        script: [
          ...foldsAllExcept(['BTN', 'BB'], n),
          { position: 'BTN', street: 'preflop', type: 'raise', amountBB: 2.5 },
          { position: 'BTN', street: 'flop', type: 'bet', potFraction: frac },
        ],
        title: 'Lezione: pot odds al flop',
        goal: `Hai difeso il BB e al flop hai un progetto. Il bottone punta circa ${Math.round(frac * 100)}% del piatto: conta gli outs (×4 o ×2), calcola le pot odds e decidi tra fold, call e semi-bluff.`,
        lessonId: 'pot-odds-flop',
      };
    },
  },
  {
    id: 'value-bet',
    title: 'Value bet al flop',
    description: 'Hai una mano forte e l\'avversario fa check: quanto puntare per farti pagare?',
    concept: 'value-bet',
    spots: ['postflop-value', 'postflop-medium'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const btn = rfiRange('BTN', n).codes;
      const { hole, board } = dealUntil(
        rng,
        (h, b) => btn.has(handCode(h[0], h[1])) && bucketIs(h, b.slice(0, 3), rng() < 0.7 ? ['strong', 'monster'] : ['medium']),
      );
      return {
        ...baseSetup(cfg, n, 'BTN', seed, rng),
        presetHoles: holes(n, hole),
        presetBoard: board,
        heroScript: [{ position: 'BTN', street: 'preflop', type: 'raise', amountBB: 2.5 }],
        script: [
          ...foldsAllExcept(['BTN', 'BB'], n),
          { position: 'BB', street: 'preflop', type: 'call' },
          { position: 'BB', street: 'flop', type: 'check' },
        ],
        title: 'Lezione: value bet',
        goal: 'Hai aperto dal bottone (azione automatica), il BB ha chiamato e al flop fa check. Valuta la tua mano: punta per valore? Di quanto? O conviene controllare il piatto?',
        lessonId: 'value-bet',
      };
    },
  },
  {
    id: 'river-bluff',
    title: 'Bluff al river',
    description: 'Il tuo progetto non è arrivato e l\'avversario fa check: bluffare o rinunciare?',
    concept: 'bluff',
    spots: ['postflop-bluff'],
    generate: (cfg, seed) => {
      const rng = createRng(seed);
      const n = Math.max(2, cfg.numPlayers);
      const btn = rfiRange('BTN', n).codes;
      const { hole, board } = dealUntil(
        rng,
        (h, b) =>
          btn.has(handCode(h[0], h[1])) &&
          bucketIs(h, b.slice(0, 3), ['draw', 'strongDraw']) &&
          bucketIs(h, b, ['air', 'weak']),
      );
      return {
        ...baseSetup(cfg, n, 'BTN', seed, rng),
        presetHoles: holes(n, hole),
        presetBoard: board,
        heroScript: [
          { position: 'BTN', street: 'preflop', type: 'raise', amountBB: 2.5 },
          { position: 'BTN', street: 'flop', type: 'bet', potFraction: 0.5 },
          { position: 'BTN', street: 'turn', type: 'check' },
        ],
        script: [
          ...foldsAllExcept(['BTN', 'BB'], n),
          { position: 'BB', street: 'preflop', type: 'call' },
          { position: 'BB', street: 'flop', type: 'check' },
          { position: 'BB', street: 'flop', type: 'call' },
          { position: 'BB', street: 'turn', type: 'check' },
          { position: 'BB', street: 'river', type: 'check' },
        ],
        title: 'Lezione: bluff al river',
        goal: 'Avevi un progetto, hai puntato al flop e fatto check al turn (azioni automatiche). Il progetto non è arrivato e il BB fa check al river: un bluff ha abbastanza fold equity?',
        lessonId: 'river-bluff',
      };
    },
  },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** Lezione più adatta per ripassare un certo tipo di errore. */
export function lessonForSpot(spot: SpotTag): Lesson {
  return LESSONS.find((l) => l.spots.includes(spot)) ?? LESSONS[0];
}

/** Mano per il ripasso errori: sceglie un tipo di situazione in proporzione agli errori commessi. */
export function reviewSetup(cfg: SessionConfig, weights: Partial<Record<SpotTag, number>>, seed = randomSeed()): HandSetup {
  const rng = createRng(seed);
  const entries = Object.entries(weights).filter(([, w]) => (w ?? 0) > 0) as [SpotTag, number][];
  if (entries.length === 0) return { ...LESSONS[0].generate(cfg, seed), reviewTag: 'preflop-open' };
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  let spot = entries[0][0];
  for (const [s, w] of entries) {
    x -= w;
    if (x <= 0) { spot = s; break; }
  }
  const lesson = lessonForSpot(spot);
  const setup = lesson.generate(cfg, seed);
  return { ...setup, reviewTag: spot, title: `Ripasso: ${setup.title?.replace(/^Lezione: /, '') ?? lesson.title}` };
}
