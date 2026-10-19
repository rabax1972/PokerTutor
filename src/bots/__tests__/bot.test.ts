import { describe, it, expect } from 'vitest';
import { applyAction } from '../../engine/game';
import { decideBot } from '../bot';
import { freeHandSetup, startHand, HERO_SEAT } from '../../game/session';
import type { BotStyle } from '../profiles';

function playOut(n: number, handNumber: number, stackBB = 100) {
  const setup = freeHandSetup({ numPlayers: n, mode: 'free', stackBB, bankroll: 'adequate' }, handNumber, 5000 + handNumber * 31 + n);
  let s = startHand(setup).state;
  let guard = 0;
  while (!s.isComplete) {
    s = applyAction(s, decideBot(s)); // anche l'eroe gioca come bot "regolare"
    if (++guard > 300) throw new Error('mano infinita');
  }
  return s;
}

describe('bot', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('%i giocatori: i bot giocano sempre azioni legali e le fiches si conservano', (n) => {
    for (let h = 0; h < 120; h++) {
      const s = playOut(n, h, h % 3 === 0 ? 12 : 100);
      expect(s.result!.net.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('gli stili si distinguono: il tight entra in meno piatti del loose', () => {
    const vpip: Record<string, { hands: number; played: number }> = {};
    for (let h = 0; h < 600; h++) {
      const s = playOut(6, h);
      for (const p of s.players) {
        if (p.seat === HERO_SEAT || !p.botStyle) continue;
        const style = p.botStyle as BotStyle;
        vpip[style] ??= { hands: 0, played: 0 };
        vpip[style].hands++;
        const vol = s.log.some((a) => a.seat === p.seat && a.street === 'preflop' && (a.type === 'call' || a.type === 'raise'));
        if (vol) vpip[style].played++;
      }
    }
    const rate = (st: string) => vpip[st].played / vpip[st].hands;
    expect(rate('tight')).toBeLessThan(rate('loose'));
    expect(rate('tight')).toBeGreaterThan(0.08);
    expect(rate('loose')).toBeLessThan(0.6);
  });
});
