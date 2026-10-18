import { describe, it, expect } from 'vitest';
import { evaluate, categoryOf, HandCategory } from '../evaluator';
import { createRng } from '../rng';
import { shuffledDeck } from '../deck';

describe('valutatore: verifica esaustiva', () => {
  it('le frequenze delle categorie su tutte le 2.598.960 mani da 5 carte coincidono con quelle teoriche', () => {
    const counts = new Array(9).fill(0);
    const hand = [0, 0, 0, 0, 0];
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = a; hand[1] = b; hand[2] = c; hand[3] = d; hand[4] = e;
              counts[categoryOf(evaluate(hand))]++;
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
    expect(counts[HandCategory.StraightFlush]).toBe(40);
  }, 60000);

  it('con 7 carte il punteggio è il massimo tra le 21 combinazioni da 5', () => {
    const rng = createRng(7);
    for (let t = 0; t < 3000; t++) {
      const cards = shuffledDeck(rng).slice(0, 7);
      let best = 0;
      for (let i = 0; i < 7; i++)
        for (let j = i + 1; j < 7; j++) {
          const five = cards.filter((_, k) => k !== i && k !== j);
          best = Math.max(best, evaluate(five));
        }
      expect(evaluate(cards)).toBe(best);
    }
  });
});
