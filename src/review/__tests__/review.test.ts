import { describe, it, expect } from 'vitest';
import { decideBot } from '../../bots/bot';
import { botStep, freeHandSetup, heroAct, isHeroTurn, startHand, type LiveHand } from '../../game/session';
import { reviewHand } from '../review';

function playHand(n: number, h: number, stackBB = 100): LiveHand {
  let hand = startHand(freeHandSetup({ numPlayers: n, mode: 'free', stackBB, bankroll: 'adequate' }, h, 900 + h * 7 + n));
  let guard = 0;
  while (!hand.state.isComplete && guard++ < 300) {
    hand = isHeroTurn(hand) ? heroAct(hand, decideBot(hand.state)) : botStep(hand);
  }
  return hand;
}

describe('review della mano', () => {
  it('produce testi completi e senza valori mancanti per mani da 2 a 8 giocatori', () => {
    let decisions = 0;
    for (let h = 0; h < 140; h++) {
      const hand = playHand(2 + (h % 7), h, h % 5 === 0 ? 12 : 100);
      const review = reviewHand(hand, h % 3 === 0 ? 'short' : 'adequate');
      expect(review.decisions).toHaveLength(hand.decisions.length);
      expect(review.headline.length).toBeGreaterThan(5);
      if (review.decisions.length) expect(review.concepts.length).toBeGreaterThanOrEqual(1);
      expect(review.concepts.length).toBeLessThanOrEqual(3);
      for (const d of review.decisions) {
        decisions++;
        const all = [d.situation, d.userText, d.recommendedText, d.verdictText, ...d.explanation, ...d.advice.assumptions].join(' ');
        expect(all).not.toMatch(/undefined|NaN|Infinity|\[object/);
        expect(d.explanation.length).toBeGreaterThan(0);
        expect(d.verdict.evLossBB).toBeGreaterThanOrEqual(0);
      }
    }
    expect(decisions).toBeGreaterThan(100);
  }, 120000);
});
