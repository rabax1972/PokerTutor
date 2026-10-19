import { describe, it, expect } from 'vitest';
import { parseCards } from '../../engine/cards';
import { parseRange, rangePercent, handCode, ALL_HAND_CODES, combosOf } from '../handNotation';
import { rfiRange, vsOpenRanges, playersBehind, HAND_RANKING, topPercent, pushRange } from '../ranges';
import { classifyHand, boardTexture, ruleOf2and4, exactHitProbability } from '../handClass';
import { equityVsRanges, weightedFromCodes, anyTwo } from '../equity';

describe('notazione delle mani', () => {
  it('169 mani e 1326 combinazioni', () => {
    expect(ALL_HAND_CODES).toHaveLength(169);
    expect(ALL_HAND_CODES.reduce((s, h) => s + combosOf(h).length, 0)).toBe(1326);
  });
  it('handCode', () => {
    const [a, b] = parseCards('Kd As');
    expect(handCode(a, b)).toBe('AKo');
    const [c, d] = parseCards('7h 8h');
    expect(handCode(c, d)).toBe('87s');
  });
  it('parseRange con +, intervalli e singole mani', () => {
    expect([...parseRange('TT+')].sort()).toEqual(['AA', 'JJ', 'KK', 'QQ', 'TT']);
    expect([...parseRange('A5s-A2s')].sort()).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
    expect([...parseRange('KTs+')].sort()).toEqual(['KJs', 'KQs', 'KTs']);
    expect([...parseRange('99-66')].sort()).toEqual(['66', '77', '88', '99']);
    expect(rangePercent(parseRange('22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, A2o+, K2o+, Q2o+, J2o+, T2o+, 92o+, 82o+, 72o+, 62o+, 52o+, 42o+, 32o'))).toBeCloseTo(100);
  });
});

describe('range preflop', () => {
  it('i range di apertura si allargano avvicinandosi al bottone', () => {
    const utg = rfiRange('UTG', 8).percent;
    const hj = rfiRange('HJ', 8).percent;
    const co = rfiRange('CO', 8).percent;
    const btn = rfiRange('BTN', 8).percent;
    expect(utg).toBeLessThan(hj);
    expect(hj).toBeLessThan(co);
    expect(co).toBeLessThan(btn);
    expect(utg).toBeGreaterThan(8);
    expect(utg).toBeLessThan(16);
    expect(btn).toBeGreaterThan(35);
  });
  it('heads-up il bottone apre molto largo', () => {
    expect(rfiRange('BTN', 2).percent).toBeGreaterThan(65);
  });
  it('giocatori dietro', () => {
    expect(playersBehind('UTG', 6)).toBe(5);
    expect(playersBehind('CO', 6)).toBe(3);
    expect(playersBehind('BTN', 6)).toBe(2);
    expect(playersBehind('SB', 6)).toBe(1);
    expect(playersBehind('UTG', 8)).toBe(7);
    expect(playersBehind('CO', 4)).toBe(3);
  });
  it('il BB difende più largo contro il bottone che contro UTG, e 3-bet e call non si sovrappongono', () => {
    const vsBtn = vsOpenRanges('BB', 'BTN', 6);
    const vsUtg = vsOpenRanges('BB', 'UTG', 6);
    expect(vsBtn.call.percent + vsBtn.threeBet.percent).toBeGreaterThan(vsUtg.call.percent + vsUtg.threeBet.percent);
    for (const h of vsBtn.threeBet.codes) expect(vsBtn.call.codes.has(h)).toBe(false);
  });
  it('classifica: AA in testa, 72o in fondo', () => {
    expect(HAND_RANKING[0]).toBe('AA');
    expect(HAND_RANKING.indexOf('72o')).toBeGreaterThan(150);
    expect(topPercent(5).has('AA')).toBe(true);
    expect(topPercent(5).has('72o')).toBe(false);
  });
  it('push/fold: più corto lo stack, più largo il range', () => {
    expect(pushRange('BTN', 6, 5).percent).toBeGreaterThan(pushRange('BTN', 6, 15).percent);
  });
});

describe('classificazione della mano sul board', () => {
  const cls = (hole: string, board: string) => classifyHand(parseCards(hole), parseCards(board));
  it('set', () => expect(cls('7c 7d', 'Kh 7s 2d').bucket).toBe('monster'));
  it('top pair buon kicker', () => {
    const r = cls('Ah Kd', 'Kh 7s 2d');
    expect(r.bucket).toBe('strong');
    expect(r.description).toContain('top pair');
  });
  it('top pair kicker debole', () => expect(cls('Kc 4d', 'Kh 7s 2d').bucket).toBe('medium'));
  it('overpair', () => expect(cls('Qc Qd', 'Jh 7s 2d').bucket).toBe('strong'));
  it('underpair', () => expect(cls('3c 3d', 'Jh 7s 5d').bucket).toBe('weak'));
  it('progetto di colore: 9 outs', () => {
    const r = cls('Ah 5h', 'Kh 7h 2d');
    expect(r.draws.flushDraw).toBe(true);
    expect(r.draws.nutFlushDraw).toBe(true);
    expect(r.draws.flushOuts).toBe(9);
    expect(r.bucket).toBe('draw');
  });
  it('scala bilaterale: 8 outs', () => {
    const r = cls('9c 8d', '7h 6s 2d');
    expect(r.draws.oesd).toBe(true);
    expect(r.draws.straightOuts).toBe(8);
  });
  it('gutshot: 4 outs', () => {
    const r = cls('9c 8d', 'Jh 7s 2d');
    expect(r.draws.gutshot).toBe(true);
    expect(r.draws.straightOuts).toBe(4);
  });
  it('colore + scala: progetto forte (15 outs)', () => {
    const r = cls('9h 8h', '7h 6h Kd');
    expect(r.draws.outs).toBe(15);
    expect(r.bucket).toBe('strongDraw');
  });
  it('board che gioca da solo', () => {
    const r = cls('3c 2d', 'Ah Ad Kc Ks Qh');
    expect(r.usesHole).toBe(false);
    expect(r.bucket).toBe('air');
  });
  it('texture del board', () => {
    expect(boardTexture(parseCards('Kh 7s 2d')).wet).toBe(false);
    expect(boardTexture(parseCards('Jh Th 9d')).wet).toBe(true);
  });
  it('regola del 2 e del 4', () => {
    expect(ruleOf2and4(9, 2)).toBe(36);
    expect(ruleOf2and4(9, 1)).toBe(18);
    expect(exactHitProbability(9, 47, 2)).toBeCloseTo(0.35, 2);
  });
});

describe('equity Monte Carlo', () => {
  it('AA contro KK ~ 82%', () => {
    const r = equityVsRanges(parseCards('As Ah'), [], [weightedFromCodes(['KK'], parseCards('As Ah'))], 8000);
    expect(r.equity).toBeGreaterThan(0.79);
    expect(r.equity).toBeLessThan(0.85);
  });
  it('progetto di colore al nut + asso contro top pair: 45,9% (valore esatto per enumerazione)', () => {
    const hero = parseCards('Ah 5h');
    const board = parseCards('Kh 7h 2d');
    const villain = [{ cards: parseCards('Kc Qd') as [number, number], weight: 1 }];
    const r = equityVsRanges(hero, board, [villain], 8000);
    expect(Math.abs(r.equity - 0.4586)).toBeLessThan(0.02);
  });
  it('multiway: AA contro due mani casuali ~ 73%', () => {
    const r = equityVsRanges(parseCards('As Ah'), [], [anyTwo(), anyTwo()], 8000);
    expect(r.equity).toBeGreaterThan(0.7);
    expect(r.equity).toBeLessThan(0.77);
  });
  it('mano sul river: risultato deterministico', () => {
    const r = equityVsRanges(parseCards('As Ah'), parseCards('Ad 7c 2h 9s Jd'), [weightedFromCodes(['KK'])], 500);
    expect(r.equity).toBe(1);
  });
});
