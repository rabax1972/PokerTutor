import { describe, it, expect } from 'vitest';
import { botStep, hasHeroAutoAction, heroAutoStep, isHeroTurn, startHand, type LiveHand } from '../../game/session';
import { analyzeDecision } from '../../strategy/advisor';
import { LESSONS, reviewSetup } from '../lessons';

/** Avanza finché l'utente deve prendere una decisione vera (o la mano finisce). */
function toFirstDecision(hand: LiveHand): LiveHand {
  let h = hand;
  for (let i = 0; i < 200 && !h.state.isComplete; i++) {
    if (isHeroTurn(h)) {
      if (!hasHeroAutoAction(h)) return h;
      h = heroAutoStep(h);
    } else h = botStep(h);
  }
  return h;
}

describe('lezioni a tema', () => {
  for (const lesson of LESSONS) {
    it(`${lesson.id}: porta l'utente alla situazione giusta`, () => {
      let hits = 0;
      let total = 0;
      for (const n of [2, 3, 6, 8]) {
        for (let k = 0; k < 6; k++) {
          const setup = lesson.generate({ numPlayers: n, mode: 'lesson', stackBB: 100, bankroll: 'adequate' }, 1000 + k * 13 + n);
          const hand = toFirstDecision(startHand(setup));
          total++;
          if (hand.state.isComplete) continue;
          const { advice } = analyzeDecision(hand.state, { type: 'fold' }, 'adequate');
          if (lesson.spots.includes(advice.spot)) hits++;
        }
      }
      expect(hits / total).toBeGreaterThanOrEqual(0.85);
    }, 60000);
  }

  it('il ripasso sceglie lezioni in base agli errori', () => {
    const s = reviewSetup({ numPlayers: 6, mode: 'review', stackBB: 100, bankroll: 'adequate' }, { 'bb-defense': 5 }, 7);
    expect(s.reviewTag).toBe('bb-defense');
    expect(s.lessonId).toBe('bb-defense');
  });
});
