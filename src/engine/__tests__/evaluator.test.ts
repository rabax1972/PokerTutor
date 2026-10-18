import { describe, it, expect } from 'vitest';
import { parseCards } from '../cards';
import { evaluate, evaluateDetailed, categoryOf, HandCategory, compareHands } from '../evaluator';

const ev = (s: string) => evaluate(parseCards(s));
const cat = (s: string) => categoryOf(ev(s));

describe('valutatore: categorie', () => {
  const cases: [string, HandCategory][] = [
    ['As Ks Qs Js Ts 2d 3c', HandCategory.StraightFlush],
    ['5h 4h 3h 2h Ah Kd Kc', HandCategory.StraightFlush],
    ['9c 9d 9h 9s 2d 3c 4h', HandCategory.Quads],
    ['Kc Kd Kh 7s 7d 2c 3h', HandCategory.FullHouse],
    ['Ah 9h 6h 4h 2h Kd Qc', HandCategory.Flush],
    ['Td 9c 8h 7s 6d 2c 2h', HandCategory.Straight],
    ['Ad 2c 3h 4s 5d Kc Kh', HandCategory.Straight],
    ['7d 7c 7h As Kd 2c 4h', HandCategory.Trips],
    ['Jd Jc 4h 4s Ad 2c 8h', HandCategory.TwoPair],
    ['Qd Qc 9h 5s Ad 2c 8h', HandCategory.Pair],
    ['Ad Jc 9h 5s 3d 2c 8h', HandCategory.HighCard],
  ];
  it.each(cases)('%s → categoria %i', (cards, expected) => {
    expect(cat(cards)).toBe(expected);
  });

  it("l'ordine delle categorie è rispettato", () => {
    const ordered = cases.map(([c]) => ev(c));
    for (let i = 1; i < ordered.length; i++) expect(ordered[i - 1]).toBeGreaterThanOrEqual(ordered[i]);
  });

  it('funziona con 5 e 6 carte', () => {
    expect(cat('As Ks Qs Js Ts')).toBe(HandCategory.StraightFlush);
    expect(cat('2c 2d 5h 5s 9d 9c')).toBe(HandCategory.TwoPair);
  });
});

describe('valutatore: kicker e spareggi', () => {
  it('coppia: decide il kicker', () => {
    expect(ev('Ah Ad Kc 7s 4d 3c 2h')).toBeGreaterThan(ev('As Ac Qc 7d 4h 3s 2d'));
  });
  it('coppia: decide il terzo kicker', () => {
    expect(ev('Ah Ad Kc Qs 9d 3c 2h')).toBeGreaterThan(ev('As Ac Kd Qh 8h 3s 2d'));
  });
  it('un kicker oltre la quinta carta non conta: parità', () => {
    expect(ev('Ah Ad Kc Qs Jd 3c 2h')).toBe(ev('As Ac Kd Qh Jh 4s 2d'));
  });
  it('doppia coppia con tre coppie: usa le due più alte e il miglior kicker', () => {
    // KK 99 44 2 → KK 99 4 ; KK 99 33 2 → KK 99 3
    expect(ev('Kc Kd 9h 9s 4d 4c 2h')).toBeGreaterThan(ev('Kh Ks 9c 9d 3h 3s 2d'));
  });
  it('doppia coppia: kicker decisivo', () => {
    expect(ev('Jd Jc 4h 4s Ad 2c 8h')).toBeGreaterThan(ev('Jh Js 4c 4d Kd 2s 8c'));
  });
  it('full con due tris sceglie il tris più alto', () => {
    const r = evaluateDetailed(parseCards('8c 8d 8h 5s 5d 5c Ah'));
    expect(r.category).toBe(HandCategory.FullHouse);
    expect(r.name).toBe('Full di Otto e Cinque');
  });
  it('full: conta prima il tris, poi la coppia', () => {
    expect(ev('3c 3d 3h 2s 2d Kc Qh')).toBeGreaterThan(ev('2c 2d 2h As Ad Kc Qh'));
    expect(ev('Kc Kd Kh 7s 7d 2c 3h')).toBeGreaterThan(ev('Kc Kd Kh 6s 6d 2c 3h'));
  });
  it('poker: decide il kicker', () => {
    expect(ev('9c 9d 9h 9s Ad 3c 4h')).toBeGreaterThan(ev('9c 9d 9h 9s Kd 3c 4h'));
  });
  it('scala: la ruota (A-5) è la scala più bassa', () => {
    expect(ev('Ad 2c 3h 4s 5d Kc 9h')).toBeLessThan(ev('2d 3c 4h 5s 6d Kc 9h'));
  });
  it('scala: con 6 carte consecutive vale la più alta', () => {
    expect(evaluateDetailed(parseCards('4d 5c 6h 7s 8d 9c 2h')).name).toBe('Scala al Nove');
  });
  it('colore: confronto carta per carta', () => {
    expect(ev('Ah Th 8h 4h 2h Kd Qc')).toBeGreaterThan(ev('Ah Th 8h 3h 2h Kd Qc'));
  });
  it('colore con 6 carte dello stesso seme usa le 5 più alte', () => {
    expect(ev('Ah Kh 9h 6h 4h 2h Qc')).toBe(ev('Ah Kh 9h 6h 4h 3d Qc'));
  });
  it('colore batte scala, full batte colore', () => {
    expect(ev('Ah 9h 6h 4h 2h Kd Qc')).toBeGreaterThan(ev('Td 9c 8h 7s 6d 2c 2h'));
    expect(ev('Kc Kd Kh 7s 7d 2c 3h')).toBeGreaterThan(ev('Ah 9h 6h 4h 2h Kd Qc'));
  });
  it('colore + scala separati non fanno scala colore', () => {
    expect(cat('2h 3h 4h 5h 9h 6c Kd')).toBe(HandCategory.Flush);
  });
  it('tris: kicker', () => {
    expect(ev('7d 7c 7h As Qd 2c 4h')).toBeGreaterThan(ev('7d 7c 7h Ks Qd 2c 4h'));
  });
  it('board che gioca: parità esatta', () => {
    expect(compareHands(parseCards('2c 3d As Ks Qs Js Ts'), parseCards('4c 5d As Ks Qs Js Ts'))).toBe(0);
  });
  it('scala colore alta batte scala colore bassa', () => {
    expect(ev('9s 8s 7s 6s 5s')).toBeGreaterThan(ev('5h 4h 3h 2h Ah'));
  });
});

describe('valutatore: nomi in italiano', () => {
  it.each([
    ['As Ks Qs Js Ts 2d 3c', 'Scala reale'],
    ['9s 8s 7s 6s 5s 2d 3c', 'Scala colore al Nove'],
    ['9c 9d 9h 9s 2d 3c 4h', 'Poker di Nove'],
    ['Ac Ad Ah Ks Kd 2c 3h', 'Full di Assi e Re'],
    ['Jd Jc 4h 4s Ad 2c 8h', 'Doppia coppia: Jack e Quattro'],
    ['Qd Qc 9h 5s Ad 2c 8h', 'Coppia di Donne'],
  ])('%s → %s', (cards, name) => {
    expect(evaluateDetailed(parseCards(cards)).name).toBe(name);
  });
  it('restituisce le 5 carte migliori', () => {
    const r = evaluateDetailed(parseCards('Kc Kd Kh 7s 7d 2c 3h'));
    expect(r.best).toHaveLength(5);
    expect(evaluate(r.best)).toBe(r.score);
  });
});
