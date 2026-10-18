import type { Card } from './cards';
import { shuffleInPlace, type Rng } from './rng';

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** Mazzo mescolato, escludendo eventuali carte già note. */
export function shuffledDeck(rng: Rng, exclude: readonly Card[] = []): Card[] {
  const ex = new Set(exclude);
  return shuffleInPlace(fullDeck().filter((c) => !ex.has(c)), rng);
}
