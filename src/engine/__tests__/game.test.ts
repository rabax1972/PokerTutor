import { describe, it, expect } from 'vitest';
import { parseCards } from '../cards';
import {
  applyAction,
  createHand,
  getLegalActions,
  potTotal,
  type GameState,
  type HandConfig,
  type PlayerAction,
} from '../game';
import { positionNames, blindSeats, firstToActPreflop, firstToActPostflop } from '../positions';
import { createRng } from '../rng';

function config(stacks: number[], buttonSeat = 0, extra: Partial<HandConfig> = {}): HandConfig {
  return {
    players: stacks.map((stack, i) => ({ name: `P${i}`, stack })),
    buttonSeat,
    smallBlind: 50,
    bigBlind: 100,
    seed: 42,
    ...extra,
  };
}

function act(s: GameState, type: PlayerAction['type'], amount?: number): GameState {
  return applyAction(s, { type, amount });
}

const totalChips = (s: GameState) => s.players.reduce((sum, p) => sum + p.stack, 0) + (s.isComplete ? 0 : potTotal(s));

describe('posizioni da 2 a 8 giocatori', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('%i giocatori: nomi univoci con BTN e BB', (n) => {
    const names = positionNames(n);
    expect(names).toHaveLength(n);
    expect(new Set(names).size).toBe(n);
    expect(names[0]).toBe('BTN');
    expect(names).toContain('BB');
  });

  it('heads-up: il bottone è small blind', () => {
    expect(blindSeats(0, 2)).toEqual({ sb: 0, bb: 1 });
    expect(blindSeats(1, 2)).toEqual({ sb: 1, bb: 0 });
    expect(firstToActPreflop(1, 2)).toBe(1);
    expect(firstToActPostflop(1, 2)).toBe(0);
  });

  it('6 giocatori: SB e BB dopo il bottone, UTG primo preflop', () => {
    expect(blindSeats(4, 6)).toEqual({ sb: 5, bb: 0 });
    expect(firstToActPreflop(4, 6)).toBe(1);
    expect(firstToActPostflop(4, 6)).toBe(5);
  });

  it('3 giocatori: il bottone parla per primo preflop', () => {
    expect(firstToActPreflop(2, 3)).toBe(2);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])('%i giocatori: le posizioni ruotano col bottone', (n) => {
    const s = createHand(config(new Array(n).fill(10000), 1 % n));
    expect(s.players[1 % n].position).toBe('BTN');
    expect(s.players[s.bbSeat].position).toBe('BB');
  });
});

describe('blind e ordine dei turni', () => {
  it('heads-up: SB/BTN posta 50, BB 100, il bottone parla per primo preflop e per ultimo postflop', () => {
    let s = createHand(config([10000, 10000], 0));
    expect(s.players[0].streetBet).toBe(50);
    expect(s.players[1].streetBet).toBe(100);
    expect(s.toAct).toBe(0);
    s = act(s, 'call');
    expect(s.toAct).toBe(1); // opzione del BB
    expect(getLegalActions(s)!.canCheck).toBe(true);
    expect(getLegalActions(s)!.canRaise).toBe(true);
    s = act(s, 'check');
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1); // postflop parla prima il BB
    s = act(s, 'check');
    expect(s.toAct).toBe(0);
  });

  it('6 giocatori: ordine preflop UTG → … → BB e postflop dal SB', () => {
    let s = createHand(config(new Array(6).fill(10000), 0));
    const order: number[] = [];
    while (s.street === 'preflop') {
      order.push(s.toAct!);
      s = act(s, s.toAct === s.bbSeat ? 'check' : 'call');
    }
    expect(order).toEqual([3, 4, 5, 0, 1, 2]);
    expect(s.toAct).toBe(1);
  });

  it('8 giocatori: postflop salta chi ha foldato', () => {
    let s = createHand(config(new Array(8).fill(10000), 7));
    // SB = 0, BB = 1, UTG = 2
    expect(s.toAct).toBe(2);
    while (s.street === 'preflop') {
      const seat = s.toAct!;
      if (seat === 0) s = act(s, 'fold');
      else s = act(s, seat === 1 ? 'check' : 'call');
    }
    expect(s.toAct).toBe(1);
  });

  it('BB corto: posta tutto quello che ha ed è all-in', () => {
    const s = createHand(config([10000, 10000, 60], 0));
    expect(s.players[2].allIn).toBe(true);
    expect(s.players[2].committed).toBe(60);
    expect(s.currentBet).toBe(100);
  });
});

describe('rilanci', () => {
  it('rilancio minimo = puntata attuale + ultimo rilancio', () => {
    let s = createHand(config([10000, 10000, 10000, 10000], 0));
    // UTG = seat 3
    let la = getLegalActions(s)!;
    expect(la.minRaiseTo).toBe(200);
    s = act(s, 'raise', 300);
    la = getLegalActions(s)!;
    expect(la.minRaiseTo).toBe(500);
    expect(() => act(s, 'raise', 400)).toThrow();
    s = act(s, 'raise', 500);
    expect(getLegalActions(s)!.minRaiseTo).toBe(700);
  });

  it('un all-in inferiore al rilancio minimo non riapre l\'azione a chi ha già parlato', () => {
    // 3 giocatori: BTN 0 (parla per primo), SB 1, BB 2 corto.
    let s = createHand(config([10000, 10000, 450], 0));
    s = act(s, 'raise', 300); // BTN rilancia a 300 (rilancio di 200)
    s = act(s, 'call'); // SB chiama
    s = act(s, 'raise', 450); // BB all-in a 450: rilancio di 150 < 200
    expect(s.players[2].allIn).toBe(true);
    expect(s.toAct).toBe(0);
    let la = getLegalActions(s)!;
    expect(la.canCall).toBe(true);
    expect(la.canRaise).toBe(false);
    s = act(s, 'call');
    la = getLegalActions(s)!;
    expect(la.seat).toBe(1);
    expect(la.canRaise).toBe(false);
  });

  it('un all-in pari a un rilancio completo riapre l\'azione', () => {
    let s = createHand(config([10000, 10000, 500], 0));
    s = act(s, 'raise', 300);
    s = act(s, 'call');
    s = act(s, 'raise', 500); // rilancio di 200 = completo
    expect(getLegalActions(s)!.canRaise).toBe(true);
  });

  it('chi non ha ancora parlato può rilanciare anche dopo un all-in corto', () => {
    let s = createHand(config([10000, 10000, 10000, 350], 0));
    // UTG = seat 3 all-in a 350 (rilancio di 250 ≥ 100: completo)
    s = act(s, 'raise', 350);
    expect(getLegalActions(s)!.canRaise).toBe(true);
  });

  it('bet postflop: minimo un big blind', () => {
    let s = createHand(config([10000, 10000], 0));
    s = act(s, 'call');
    s = act(s, 'check');
    const la = getLegalActions(s)!;
    expect(la.raiseType).toBe('bet');
    expect(la.minRaiseTo).toBe(100);
    expect(() => act(s, 'bet', 50)).toThrow();
  });

  it('non si può rilanciare se tutti gli altri sono all-in', () => {
    let s = createHand(config([10000, 1000], 0));
    s = act(s, 'raise', 300);
    s = act(s, 'raise', 1000); // BB all-in
    const la = getLegalActions(s)!;
    expect(la.canCall).toBe(true);
    expect(la.canRaise).toBe(false);
  });
});

describe('fine mano', () => {
  it('tutti foldano: il BB vince i blind senza showdown', () => {
    let s = createHand(config([10000, 10000, 10000, 10000], 0));
    s = act(s, 'fold'); // UTG
    s = act(s, 'fold'); // BTN
    s = act(s, 'fold'); // SB
    expect(s.isComplete).toBe(true);
    expect(s.result!.showdown).toBe(false);
    expect(s.result!.net).toEqual([0, -50, 50, 0]);
  });

  it('puntata non chiamata restituita', () => {
    let s = createHand(config([10000, 10000], 0));
    s = act(s, 'call');
    s = act(s, 'check');
    s = act(s, 'bet', 500); // BB punta al flop
    s = act(s, 'fold');
    expect(s.result!.net).toEqual([-100, 100]);
    expect(s.players[1].stack).toBe(10100);
  });

  it('showdown al river con il vincitore corretto', () => {
    let s = createHand(
      config([10000, 10000], 0, {
        presetHoles: [parseCards('As Ad'), parseCards('Kh Kd')],
        presetBoard: parseCards('2c 7d 9h Js 3c'),
      }),
    );
    s = act(s, 'call');
    s = act(s, 'check');
    for (let i = 0; i < 6; i++) s = act(s, 'check');
    expect(s.isComplete).toBe(true);
    expect(s.result!.showdown).toBe(true);
    expect(s.result!.handNames[0]).toBe('Coppia di Assi');
    expect(s.result!.net).toEqual([100, -100]);
  });

  it('split pot quando il board gioca', () => {
    let s = createHand(
      config([10000, 10000, 10000], 0, {
        presetHoles: [parseCards('2c 3d'), parseCards('4c 5d'), parseCards('7h 8h')],
        presetBoard: parseCards('As Ks Qs Js Ts'),
      }),
    );
    s = act(s, 'call'); // BTN
    s = act(s, 'call'); // SB
    s = act(s, 'check'); // BB
    while (!s.isComplete) s = act(s, 'check');
    expect(s.result!.winnersPerPot[0].sort()).toEqual([0, 1, 2]);
    expect(s.result!.net).toEqual([0, 0, 0]);
  });

  it('split con fiche dispari: va al primo dopo il bottone', () => {
    // Blind 25/50: BTN limpa, SB folda (25 dead money), BB check → piatto 125 diviso tra BTN e BB.
    let s = createHand({
      players: [{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }, { name: 'C', stack: 1000 }],
      buttonSeat: 0,
      smallBlind: 25,
      bigBlind: 50,
      seed: 1,
      presetHoles: [parseCards('4c 5d'), parseCards('2c 3d'), parseCards('4h 5h')],
      presetBoard: parseCards('As Ks Qs Jd 9c'),
    });
    s = act(s, 'call'); // BTN
    s = act(s, 'fold'); // SB
    s = act(s, 'check'); // BB
    while (!s.isComplete) s = act(s, 'check');
    expect(s.result!.pots[0].amount).toBe(125);
    // Ordine dopo il bottone: SB (foldato), BB, BTN → la fiche dispari va al BB.
    expect(s.result!.net).toEqual([12, -25, 13]);
  });

  it('all-in con side pot: lo short stack vince il main, un altro il side pot', () => {
    let s = createHand(
      config([300, 1000, 1000], 0, {
        presetHoles: [parseCards('As Ad'), parseCards('Kh Kd'), parseCards('Qh Qd')],
        presetBoard: parseCards('2c 7d 9h Js 3c'),
      }),
    );
    s = act(s, 'raise', 300); // BTN all-in 300
    s = act(s, 'raise', 1000); // SB all-in 1000
    s = act(s, 'call'); // BB chiama all-in
    expect(s.isComplete).toBe(true);
    expect(s.board).toHaveLength(5);
    // Main pot 900 → AA; side pot 1400 → KK
    expect(s.result!.pots.map((p) => p.amount)).toEqual([900, 1400]);
    expect(s.result!.net).toEqual([600, 400, -1000]);
  });

  it('se tutti gli altri sono all-in non si chiede più azione e si scopre il board', () => {
    let s = createHand(config([5000, 400, 5000], 0));
    s = act(s, 'call'); // BTN
    s = act(s, 'raise', 400); // SB all-in (rilancio di 300 ≥ 100: completo)
    s = act(s, 'call'); // BB
    s = act(s, 'call'); // BTN
    expect(s.street).toBe('flop');
    expect(s.toAct).not.toBeNull(); // BTN e BB possono ancora puntare tra loro
    s = act(s, 'bet', 1000); // BB (primo attivo dopo il bottone, SB è all-in)
    s = act(s, 'fold'); // BTN folda
    expect(s.isComplete).toBe(true);
    expect(s.result!.showdown).toBe(true); // SB all-in contro BB
    expect(s.board).toHaveLength(5);
  });
});

describe('robustezza: mani casuali da 2 a 8 giocatori', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('%i giocatori: fiches conservate e mani sempre concluse', (n) => {
    const rng = createRng(1000 + n);
    for (let hand = 0; hand < 300; hand++) {
      const stacks = Array.from({ length: n }, () => 100 + Math.floor(rng() * 20000));
      let s = createHand(config(stacks, hand % n, { seed: hand * 7 + n }));
      const total = stacks.reduce((a, b) => a + b, 0);
      let steps = 0;
      while (!s.isComplete) {
        const la = getLegalActions(s)!;
        expect(la).not.toBeNull();
        const r = rng();
        let a: PlayerAction;
        if (la.canRaise && r < 0.25) {
          const to = la.minRaiseTo + Math.floor(rng() * (la.maxRaiseTo - la.minRaiseTo + 1));
          a = { type: la.raiseType, amount: to };
        } else if (la.canFold && r < 0.45) a = { type: 'fold' };
        else if (la.canCheck) a = { type: 'check' };
        else a = { type: 'call' };
        s = applyAction(s, a);
        expect(totalChips(s)).toBe(total);
        expect(++steps).toBeLessThan(500);
      }
      expect(s.players.every((p) => p.stack >= 0)).toBe(true);
      expect(s.result!.net.reduce((a, b) => a + b, 0)).toBe(0);
      const potSum = s.result!.pots.reduce((a, p) => a + p.amount, 0);
      expect(potSum).toBe(s.players.reduce((a, p) => a + p.committed, 0));
    }
  });
});
