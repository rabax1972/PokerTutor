import { describe, it, expect } from 'vitest';
import { parseCards, type Card } from '../../engine/cards';
import { applyAction, createHand, type GameState, type PlayerAction } from '../../engine/game';
import { analyzeDecision } from '../advisor';
import type { BankrollLevel } from '../../game/session';

/**
 * Crea una mano con l'eroe al posto 0 e carte note, poi applica le azioni indicate
 * (in ordine di turno) fino al punto di decisione dell'eroe.
 */
function spot(opts: {
  n: number;
  button: number;
  hero: string;
  board?: string;
  stacks?: number[];
  villainCards?: Record<number, string>;
  actions: PlayerAction[];
}): GameState {
  const holes: (Card[] | undefined)[] = Array.from({ length: opts.n }, () => undefined);
  holes[0] = parseCards(opts.hero);
  for (const [seat, c] of Object.entries(opts.villainCards ?? {})) holes[Number(seat)] = parseCards(c);
  let s = createHand({
    players: Array.from({ length: opts.n }, (_, i) => ({
      name: i === 0 ? 'Tu' : `B${i}`,
      stack: opts.stacks?.[i] ?? 10000,
      isHero: i === 0,
      botStyle: i === 0 ? undefined : 'regular',
    })),
    buttonSeat: opts.button,
    smallBlind: 50,
    bigBlind: 100,
    seed: 3,
    presetHoles: holes,
    presetBoard: opts.board ? parseCards(opts.board) : undefined,
  });
  for (const a of opts.actions) s = applyAction(s, a);
  expect(s.toAct).toBe(0);
  return s;
}

const fold: PlayerAction = { type: 'fold' };
const call: PlayerAction = { type: 'call' };
const check: PlayerAction = { type: 'check' };
const raise = (amount: number): PlayerAction => ({ type: 'raise', amount });
const bet = (amount: number): PlayerAction => ({ type: 'bet', amount });

const analyze = (s: GameState, a: PlayerAction, br: BankrollLevel = 'adequate') => analyzeDecision(s, a, br);

describe('advisor preflop', () => {
  // 6 giocatori, bottone al posto 3 → posto 0 = UTG (bottone+3).
  it('UTG con AA: aprire; foldare è un errore grave', () => {
    const s = spot({ n: 6, button: 3, hero: 'As Ah', actions: [] });
    expect(s.players[0].position).toBe('UTG');
    const r = analyze(s, fold);
    expect(r.advice.best.action).toBe('raise');
    expect(r.advice.spot).toBe('preflop-open');
    expect(r.verdict.grade).toBe('errore-grave');
    expect(r.advice.referenceRange?.contains).toBe(true);
  });

  it('UTG con 72o: fold; aprire è un errore', () => {
    const s = spot({ n: 6, button: 3, hero: '7c 2d', actions: [] });
    const r = analyze(s, raise(250));
    expect(r.advice.best.action).toBe('fold');
    expect(['errore', 'errore-grave']).toContain(r.verdict.grade);
    expect(analyze(s, fold).verdict.grade).toBe('ottima');
  });

  it('bottone con K9s: aprire', () => {
    // bottone al posto 0: UTG(3) HJ(4) CO(5) foldano
    const s = spot({ n: 6, button: 0, hero: 'Ks 9s', actions: [fold, fold, fold] });
    expect(s.players[0].position).toBe('BTN');
    const r = analyze(s, raise(250));
    expect(r.advice.best.action).toBe('raise');
    expect(r.verdict.grade).toBe('ottima');
  });

  it('apertura enorme con una mano normale: problema di sizing', () => {
    const s = spot({ n: 6, button: 0, hero: 'Ks 9s', actions: [fold, fold, fold] });
    const r = analyze(s, raise(10000));
    expect(r.verdict.grade).not.toBe('ottima');
    expect(r.verdict.evLossBB).toBeGreaterThan(1);
  });

  it('BB contro apertura dal bottone con J9o: difendere (call)', () => {
    // bottone al posto 4 → SB 5, BB 0. UTG 1, HJ 2, CO 3 foldano, BTN apre, SB folda.
    const s = spot({ n: 6, button: 4, hero: 'Jc 9d', actions: [fold, fold, fold, raise(250), fold] });
    expect(s.players[0].position).toBe('BB');
    const r = analyze(s, fold);
    expect(r.advice.spot).toBe('bb-defense');
    expect(r.advice.best.action).toBe('call');
    expect(r.verdict.grade).not.toBe('ottima');
    expect(r.advice.equity).toBeGreaterThan(0.3);
  });

  it('contro un all-in corto con AKo: call (equity > pot odds)', () => {
    // heads-up: eroe BB (bottone al posto 1), il bottone va all-in con 10bb
    const s = spot({ n: 2, button: 1, hero: 'Ad Kc', stacks: [10000, 1000], actions: [raise(1000)] });
    const r = analyze(s, call);
    expect(r.advice.spot).toBe('call-allin');
    expect(r.advice.best.action).toBe('call');
    expect(r.verdict.grade).toBe('ottima');
    expect(r.advice.equity!).toBeGreaterThan(r.advice.potOdds);
  });

  it('contro un all-in profondo di UTG con 72o: fold', () => {
    const s = spot({ n: 6, button: 4, hero: '7c 2d', actions: [raise(10000), fold, fold, fold, fold] });
    const r = analyze(s, call);
    expect(r.advice.best.action).toBe('fold');
    expect(r.verdict.grade).toBe('errore-grave');
  });

  it('push/fold: SB con 8bb e A7o, tutti foldano → all-in', () => {
    // 4 giocatori, bottone 3 → SB 0, BB 1, CO 2. CO folda, BTN folda.
    const s = spot({ n: 4, button: 3, hero: 'Ah 7c', stacks: [800, 3000, 3000, 3000], actions: [fold, fold] });
    expect(s.players[0].position).toBe('SB');
    const r = analyze(s, fold);
    expect(r.advice.spot).toBe('push-fold');
    expect(r.advice.best.action).toBe('allin');
    expect(r.verdict.grade).not.toBe('ottima');
  });

  it('bankroll corto: un all-in con vantaggio minimo viene sconsigliato, con bankroll ampio no', () => {
    // 88 contro un all-in di 100bb (range stretto ~8%): call di poco positivo o in pari.
    const s = spot({ n: 2, button: 1, hero: '8c 8d', actions: [raise(10000)] });
    const large = analyze(s, call, 'large');
    const short = analyze(s, call, 'short');
    const callC = large.advice.candidates.find((c) => c.action === 'call')!;
    const evPerRisk = callC.ev / 9900;
    expect(Math.abs(evPerRisk)).toBeLessThan(0.1);
    if (evPerRisk > 0 && evPerRisk < 0.06) {
      expect(large.advice.best.action).toBe('call');
      expect(short.advice.best.action).toBe('fold');
      expect(short.advice.reasons.some((r) => r.code === 'bankroll')).toBe(true);
    } else {
      expect(short.advice.best.action).toBe('fold');
    }
    expect(large.advice.reasons.some((r) => r.code === 'bankroll')).toBe(false);
  });
});

describe('advisor postflop', () => {
  it('set su board asciutto, avversario fa check: puntare per valore', () => {
    // heads-up: eroe al bottone (posto 0). Preflop: eroe apre, BB chiama. Flop: BB check.
    const s = spot({
      n: 2, button: 0, hero: '7c 7d', board: 'Kh 7s 2d 9c 3h',
      actions: [raise(250), call, check],
    });
    expect(s.street).toBe('flop');
    const r = analyze(s, check);
    expect(['bet', 'allin']).toContain(r.advice.best.action);
    expect(r.advice.spot).toBe('postflop-value');
    expect(r.advice.reasons.some((x) => x.code === 'value')).toBe(true);
  });

  it('river senza nulla contro una puntata grande: fold', () => {
    const s = spot({
      n: 2, button: 0, hero: '5c 4d', board: 'Kh Qs 9d 2c 8h',
      actions: [raise(250), call, check, check, check, check, bet(500)],
    });
    expect(s.street).toBe('river');
    const r = analyze(s, call);
    expect(r.advice.best.action).toBe('fold');
    expect(r.verdict.grade).not.toBe('ottima');
  });

  it('progetto di colore al nut contro una puntata piccola al flop: continuare (non fold)', () => {
    const s = spot({
      n: 2, button: 0, hero: 'Ah 5h', board: 'Kh 7h 2d 9c 3s',
      actions: [raise(250), call, bet(170)],
    });
    const r = analyze(s, fold);
    expect(r.advice.best.action).not.toBe('fold');
    expect(r.advice.reasons.some((x) => x.code === 'outs')).toBe(true);
    expect(r.verdict.grade).not.toBe('ottima');
  });

  it('regressione: con stack profondi non consiglia un all-in enorme con un progetto contro una puntata piccola', () => {
    // BTN apre, eroe nel BB chiama; flop 4s 9s 3c, eroe check, BTN punta 3bb.
    const s = spot({
      n: 2, button: 1, hero: '8s Js', board: '4s 9s 3c 4h 2c',
      actions: [raise(250), call, check, bet(300)],
    });
    const { advice } = analyze(s, call);
    expect(advice.best.action).not.toBe('allin');
    expect(advice.candidates.some((c) => c.action === 'allin')).toBe(false);
  });

  it('i consigli includono dati strutturati: equity, pot odds, range e assunzioni', () => {
    const s = spot({
      n: 2, button: 0, hero: 'Ah 5h', board: 'Kh 7h 2d 9c 3s',
      actions: [raise(250), call, bet(170)],
    });
    const { advice } = analyze(s, call);
    expect(advice.equity).toBeGreaterThan(0);
    expect(advice.potOdds).toBeCloseTo(170 / (500 + 170 + 170), 2);
    expect(advice.villains[0].preflopLabel).toContain('BB');
    expect(advice.assumptions.length).toBeGreaterThan(0);
    expect(advice.candidates.length).toBeGreaterThan(2);
  });
});
