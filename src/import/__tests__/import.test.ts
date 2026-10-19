import { describe, it, expect } from 'vitest';
import { cardsToString } from '../../engine/cards';
import { parseHandHistory, splitHands, decodeHistoryFile } from '../index';
import { replayHand } from '../replay';
import { parseAmount } from '../text';
import { reviewHand } from '../../review/review';
import { GG_CASH, P888_CASH, STARS_CASH, STARS_OBSERVED, STARS_OMAHA, STARS_TOURNEY_9MAX, WINAMAX_CASH } from './fixtures';

const one = (text: string) => {
  const { hands } = parseHandHistory(text);
  expect(hands).toHaveLength(1);
  return hands[0];
};

describe('importi', () => {
  it.each([
    ['$0.02', 0.02], ['0.05€', 0.05], ['€0,05', 0.05], ['1,500', 1500], ['12,345.50', 12345.5],
    ['[$0.30]', 0.3], ['2€', 2], ['1500', 1500], ['$2', 2],
  ])('%s → %d', (raw, v) => expect(parseAmount(raw)).toBeCloseTo(v));
});

describe('suddivisione e riconoscimento', () => {
  it('divide un file con più mani di portali diversi', () => {
    const text = [STARS_CASH, WINAMAX_CASH, P888_CASH, GG_CASH].join('\n\n\n');
    expect(splitHands(text)).toHaveLength(4);
    const { hands, unknownBlocks } = parseHandHistory(text);
    expect(hands.map((h) => h.site)).toEqual(['PokerStars', 'Winamax', '888poker', 'GGPoker']);
    expect(unknownBlocks).toBe(0);
  });

  it('decodifica UTF-16 con BOM', () => {
    const s = '﻿' + STARS_CASH;
    const buf = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) { buf[2 * i] = s.charCodeAt(i) & 0xff; buf[2 * i + 1] = s.charCodeAt(i) >> 8; }
    const text = decodeHistoryFile(new Uint8Array([0xff, 0xfe, ...buf.slice(2)]).buffer);
    expect(parseHandHistory(text).hands[0].handId).toBe('243516513412');
  });
});

describe('PokerStars cash', () => {
  const h = one(STARS_CASH);
  it('legge intestazione, posti (escludendo chi è seduto fuori) e carte', () => {
    expect(h.site).toBe('PokerStars');
    expect(h.handId).toBe('243516513412');
    expect(h.sb).toBe(0.01);
    expect(h.bb).toBe(0.02);
    expect(h.currency).toBe('$');
    expect(h.seats.map((s) => s.name)).toEqual(['Villain One', 'Hero', 'btnGuy', 'sbGuy', 'bbGuy']);
    expect(h.hero).toBe('Hero');
    expect(cardsToString(h.heroCards!)).toBe('Ah Kd');
    expect(cardsToString(h.board)).toBe('Kc 7h 2d 5s 9c');
    expect(h.actions.filter((a) => a.name === 'Hero')).toHaveLength(7);
    expect(h.actions.find((a) => a.type === 'raise' && a.name === 'btnGuy')?.amount).toBe(0.28);
    expect(h.uncalled.btnGuy).toBe(2.26);
  });
  it('ricostruisce la mano: posizioni, decisioni e risultato reale', () => {
    const r = replayHand(h);
    expect(r.status).toBe('ok');
    expect(r.position).toBe('CO');
    expect(r.heroCode).toBe('AKo');
    expect(r.live!.decisions).toHaveLength(7);
    expect(r.live!.state.isComplete).toBe(true);
    expect(r.netBB).toBeCloseTo(-42);
    expect(r.stakesLabel).toBe('$0,01/$0,02');
  });
  it('la review funziona sulla mano importata', () => {
    const r = replayHand(h);
    const review = reviewHand(r.live!, 'adequate', { netBB: r.netBB });
    expect(review.decisions).toHaveLength(7);
    expect(review.netBB).toBeCloseTo(-42);
    expect(review.decisions[0].advice.spot).toBe('preflop-open');
    expect(review.decisions[0].verdict.grade).toBe('ottima');
  });
});

describe('GGPoker', () => {
  it('3-bet, all-in al turn e showdown', () => {
    const h = one(GG_CASH);
    expect(h.site).toBe('GGPoker');
    expect(h.handId).toBe('RC1234567890');
    expect(h.hero).toBe('Hero');
    expect(cardsToString(h.shown['4f6a2b'])).toBe('Jh Js');
    const r = replayHand(h);
    expect(r.status).toBe('ok');
    expect(r.position).toBe('SB');
    expect(r.live!.decisions).toHaveLength(3);
    expect(r.netBB).toBeCloseTo(-100);
    expect(r.live!.state.result!.showdown).toBe(true);
  });
});

describe('PokerStars torneo 9-max con ante', () => {
  it('gestisce 9 giocatori, ante e all-in preflop', () => {
    const h = one(STARS_TOURNEY_9MAX);
    expect(h.tournament).toBe(true);
    expect(h.sb).toBe(50);
    expect(h.bb).toBe(100);
    expect(h.posts.filter((p) => p.type === 'ante')).toHaveLength(9);
    const r = replayHand(h);
    expect(r.status).toBe('ok');
    expect(r.position).toBe('UTG');
    expect(r.live!.state.numPlayers).toBe(9);
    expect(r.netBB).toBeCloseTo(11.2);
    expect(r.stakesLabel).toBe('Torneo 50/100');
    const review = reviewHand(r.live!, 'adequate', { netBB: r.netBB });
    expect(review.decisions[0].advice.spot).toBe('push-fold');
    // Le ante entrano nel piatto: 9 × 0,1bb + 1,5bb di blind.
    expect(review.decisions[0].advice.pot).toBe(240);
  });
});

describe('Winamax', () => {
  it('nomi con spazi, importi in euro, puntata non chiamata', () => {
    const h = one(WINAMAX_CASH);
    expect(h.site).toBe('Winamax');
    expect(h.handId).toBe('12345678-123-1680000000');
    expect(h.currency).toBe('€');
    expect(h.seats.map((s) => s.name)).toContain('Jean Paul');
    expect(h.posts[0]).toEqual({ name: 'Jean Paul', type: 'sb', amount: 0.01 });
    const r = replayHand(h);
    expect(r.status).toBe('ok');
    expect(r.position).toBe('BTN');
    expect(r.live!.decisions).toHaveLength(2);
    expect(r.netBB).toBeCloseTo(3);
  });
});

describe('888poker', () => {
  it('carte "10h", importi tra parentesi e rilancio ambiguo risolto col call successivo', () => {
    const h = one(P888_CASH);
    expect(h.site).toBe('888poker');
    expect(h.handId).toBe('987654321');
    expect(cardsToString(h.heroCards!)).toBe('Th Ts');
    expect(cardsToString(h.board)).toBe('4c 9h 2s');
    const r = replayHand(h);
    expect(r.status).toBe('ok');
    expect(r.position).toBe('SB');
    const raise = r.live!.decisions[0].action;
    expect(raise).toEqual({ type: 'raise', amount: 1000 }); // 10bb totali, coerente con il call di Bob
    expect(r.netBB).toBeCloseTo(10);
  });
});

describe('mani non analizzabili', () => {
  it('Omaha viene segnalata come non supportata', () => {
    const r = replayHand(one(STARS_OMAHA));
    expect(r.status).toBe('unsupported');
    expect(r.reason).toMatch(/Hold'em No Limit/);
  });
  it('una mano osservata (senza le tue carte) non è analizzabile', () => {
    const r = replayHand(one(STARS_OBSERVED));
    expect(r.status).toBe('unsupported');
    expect(r.reason).toMatch(/carte/);
  });
  it('testo non riconosciuto', () => {
    expect(parseHandHistory('ciao, questo non è un file di poker').unknownBlocks).toBe(1);
  });
  it('un ordine di azione impossibile dà un errore chiaro, senza eccezioni', () => {
    const broken = STARS_CASH.replace('Villain One: folds\nHero: raises', 'Hero: raises').replace('bbGuy: folds', 'bbGuy: folds\nVillain One: folds');
    const r = replayHand(one(broken));
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/Ordine di azione/);
  });
});
