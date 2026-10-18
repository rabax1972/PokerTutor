/**
 * Calcolo di piatto principale e side pot a partire dai contributi totali di ciascun giocatore.
 * I giocatori che hanno foldato lasciano "dead money" nei piatti ma non possono vincerli.
 */
export interface Pot {
  amount: number;
  /** Indici dei giocatori che possono vincere questo piatto. */
  eligible: number[];
}

export interface Contribution {
  committed: number;
  folded: boolean;
}

export function computePots(players: readonly Contribution[]): Pot[] {
  const live = players
    .map((p, i) => ({ ...p, i }))
    .filter((p) => !p.folded && p.committed > 0);
  const levels = [...new Set(live.map((p) => p.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  levels.forEach((cap, idx) => {
    let amount = 0;
    for (const p of players) amount += Math.min(p.committed, cap) - Math.min(p.committed, prev);
    if (idx === levels.length - 1) {
      // Eventuali fiches di giocatori foldati oltre il livello massimo dei giocatori ancora in mano.
      for (const p of players) if (p.folded && p.committed > cap) amount += p.committed - cap;
    }
    const eligible = live.filter((p) => p.committed >= cap).map((p) => p.i);
    if (amount > 0) {
      // Unisce piatti consecutivi con gli stessi aventi diritto (es. livelli creati da foldati).
      const last = pots[pots.length - 1];
      if (last && sameSet(last.eligible, eligible)) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = cap;
  });
  if (levels.length === 0) {
    // Tutti hanno foldato (caso degenere): nessun piatto assegnabile.
    const total = players.reduce((s, p) => s + p.committed, 0);
    if (total > 0) pots.push({ amount: total, eligible: [] });
  }
  return pots;
}

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Divide i piatti tra i vincitori. `scores[i]` è il punteggio della mano del giocatore i.
 * `oddChipOrder` è l'ordine dei posti a partire dal primo dopo il bottone: le fiches dispari
 * vanno al primo vincitore in quell'ordine (regola standard).
 */
export function distributePots(
  pots: readonly Pot[],
  scores: readonly (number | null)[],
  oddChipOrder: readonly number[],
): { payouts: number[]; winnersPerPot: number[][] } {
  const payouts = new Array<number>(scores.length).fill(0);
  const winnersPerPot: number[][] = [];
  for (const pot of pots) {
    if (pot.eligible.length === 0) { winnersPerPot.push([]); continue; }
    let best = -1;
    for (const i of pot.eligible) best = Math.max(best, scores[i] ?? -1);
    const winners = oddChipOrder.filter((i) => pot.eligible.includes(i) && (scores[i] ?? -1) === best);
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const w of winners) {
      payouts[w] += share;
      if (remainder > 0) { payouts[w] += 1; remainder--; }
    }
    winnersPerPot.push(winners);
  }
  return { payouts, winnersPerPot };
}
