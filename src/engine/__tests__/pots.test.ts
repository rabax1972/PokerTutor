import { describe, it, expect } from 'vitest';
import { computePots, distributePots } from '../pots';

describe('side pot', () => {
  it('piatto unico se tutti mettono uguale', () => {
    const pots = computePots([
      { committed: 100, folded: false },
      { committed: 100, folded: false },
      { committed: 100, folded: true },
    ]);
    expect(pots).toEqual([{ amount: 300, eligible: [0, 1] }]);
  });

  it("tre all-in con stack diversi: main + side pot (l'ultimo è un rimborso)", () => {
    const pots = computePots([
      { committed: 50, folded: false },
      { committed: 200, folded: false },
      { committed: 500, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 300, eligible: [1, 2] },
      { amount: 300, eligible: [2] },
    ]);
  });

  it('le fiches di chi folda restano nei piatti ma non è eleggibile', () => {
    const pots = computePots([
      { committed: 100, folded: false },
      { committed: 300, folded: true },
      { committed: 300, folded: false },
      { committed: 300, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 400, eligible: [0, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ]);
  });

  it("foldato che ha messo più dei rimasti: l'eccedenza va all'ultimo piatto", () => {
    const pots = computePots([
      { committed: 400, folded: true },
      { committed: 100, folded: false },
      { committed: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 600, eligible: [1, 2] }]);
  });
});

describe('distribuzione dei piatti', () => {
  it('lo short stack vince solo il main pot', () => {
    const pots = computePots([
      { committed: 50, folded: false },
      { committed: 200, folded: false },
      { committed: 200, folded: false },
    ]);
    const { payouts } = distributePots(pots, [900, 100, 500], [1, 2, 0]);
    expect(payouts).toEqual([150, 0, 300]);
  });

  it('split pot: la fiche dispari va al primo vincitore dopo il bottone', () => {
    const { payouts, winnersPerPot } = distributePots(
      [{ amount: 301, eligible: [0, 1, 2] }],
      [500, 500, 100],
      [1, 2, 0],
    );
    expect(winnersPerPot[0]).toEqual([1, 0]);
    expect(payouts).toEqual([150, 151, 0]);
  });

  it('split a tre', () => {
    const { payouts } = distributePots([{ amount: 300, eligible: [0, 1, 2] }], [7, 7, 7], [0, 1, 2]);
    expect(payouts).toEqual([100, 100, 100]);
  });

  it('side pot vinto da un giocatore diverso dal main pot', () => {
    const pots = computePots([
      { committed: 100, folded: false },
      { committed: 400, folded: false },
      { committed: 400, folded: false },
    ]);
    const { payouts } = distributePots(pots, [900, 300, 600], [0, 1, 2]);
    expect(payouts).toEqual([300, 0, 600]);
  });
});
