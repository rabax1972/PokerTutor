import { describe, it, expect } from 'vitest';
import { applyAction, createHand, isForcedPost, potTotal } from '../../engine/game';
import { exportStars } from './exportStars';
import { decideBot } from '../../bots/bot';
import { freeHandSetup, startHand } from '../../game/session';
import { parseHandHistory } from '../index';
import { replayHand } from '../replay';

describe('andata e ritorno: engine → hand history PokerStars → import', () => {
  it.each([2, 3, 4, 6, 8, 9])('%i giocatori: decisioni, importi e risultato identici', (n) => {
    let checked = 0;
    for (let h = 0; h < 60; h++) {
      const setup = freeHandSetup({ numPlayers: n, mode: 'free', stackBB: h % 4 === 0 ? 12 : 100, bankroll: 'adequate' }, h, 4242 + h * 11 + n);
      let s = startHand(setup).state;
      while (!s.isComplete) {
        s = applyAction(s, decideBot(s));
      }
      const text = exportStars(s, 900000 + h);
      const { hands } = parseHandHistory(text);
      expect(hands).toHaveLength(1);
      const imp = replayHand(hands[0]);
      expect(imp.status, `${imp.reason}\n${text}`).toBe('ok');
      const replayed = imp.live!.decisions.map((d) => d.action);
      const original = s.log.filter((a) => a.seat === 0 && !isForcedPost(a));
      expect(replayed.map((a) => a.type)).toEqual(original.map((a) => a.type));
      original.forEach((o, k) => {
        if (o.type === 'bet' || o.type === 'raise') expect(replayed[k].amount).toBe(o.amount);
      });
      expect(imp.netBB).toBeCloseTo(s.result!.net[0] / 100, 5);
      expect(imp.position).toBe(s.players[0].position);
      checked++;
    }
    expect(checked).toBe(60);
  });
});

describe('engine: ante e puntate forzate extra', () => {
  it('le ante vanno nel piatto ma non nella puntata da pareggiare', () => {
    const s = createHand({
      players: [{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }, { name: 'C', stack: 1000 }],
      buttonSeat: 0, smallBlind: 50, bigBlind: 100, seed: 1, antes: [10, 10, 10],
    });
    expect(potTotal(s)).toBe(180);
    expect(s.currentBet).toBe(100);
    expect(s.players[1].streetBet).toBe(50);
    expect(s.log.filter((a) => a.type === 'post-ante')).toHaveLength(3);
  });
  it('un BB extra "vivo" conta come puntata, un blind morto no', () => {
    let s = createHand({
      players: [{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }, { name: 'C', stack: 1000 }, { name: 'D', stack: 1000 }],
      buttonSeat: 0, smallBlind: 50, bigBlind: 100, seed: 1,
      extraPosts: [{ seat: 3, amount: 100, live: true }, { seat: 0, amount: 50, live: false }],
    });
    expect(s.players[3].streetBet).toBe(100);
    expect(s.players[0].streetBet).toBe(0);
    expect(s.players[0].committed).toBe(50);
    expect(potTotal(s)).toBe(300);
    // D (UTG) ha già 100 dentro: può fare check? No, ha ancora diritto di parola ma nulla da chiamare.
    expect(s.toAct).toBe(3);
    s = applyAction(s, { type: 'check' });
    expect(s.toAct).toBe(0);
  });
});
