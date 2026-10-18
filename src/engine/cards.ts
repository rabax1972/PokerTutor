/**
 * Rappresentazione compatta delle carte: un intero 0..51.
 *   rank = (card >> 2) + 2   → 2..14 (14 = Asso)
 *   suit = card & 3          → 0 picche, 1 cuori, 2 quadri, 3 fiori
 */
export type Card = number;
export type Suit = 0 | 1 | 2 | 3;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];

export function makeCard(rank: number, suit: number): Card {
  if (rank < 2 || rank > 14) throw new Error(`Rank non valido: ${rank}`);
  if (suit < 0 || suit > 3) throw new Error(`Seme non valido: ${suit}`);
  return ((rank - 2) << 2) | suit;
}

export const rankOf = (c: Card): number => (c >> 2) + 2;
export const suitOf = (c: Card): Suit => (c & 3) as Suit;

export function rankChar(rank: number): string {
  return RANK_CHARS[rank - 2];
}

export function rankFromChar(ch: string): number {
  const i = RANK_CHARS.indexOf(ch.toUpperCase());
  if (i < 0) throw new Error(`Rank non valido: ${ch}`);
  return i + 2;
}

/** "As" → Card */
export function parseCard(s: string): Card {
  if (s.length !== 2) throw new Error(`Carta non valida: ${s}`);
  const rank = rankFromChar(s[0]);
  const suit = SUIT_CHARS.indexOf(s[1].toLowerCase());
  if (suit < 0) throw new Error(`Seme non valido: ${s}`);
  return makeCard(rank, suit);
}

/** "As Kd 7c" o "AsKd7c" → Card[] */
export function parseCards(s: string): Card[] {
  const clean = s.replace(/[\s,]+/g, '');
  const out: Card[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseCard(clean.slice(i, i + 2)));
  return out;
}

export function cardToString(c: Card): string {
  return rankChar(rankOf(c)) + SUIT_CHARS[suitOf(c)];
}

export function cardsToString(cs: readonly Card[]): string {
  return cs.map(cardToString).join(' ');
}

export const RANK_NAMES_IT: Record<number, string> = {
  2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette', 8: 'Otto',
  9: 'Nove', 10: 'Dieci', 11: 'Jack', 12: 'Donna', 13: 'Re', 14: 'Asso',
};
export const RANK_PLURAL_IT: Record<number, string> = {
  2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette', 8: 'Otto',
  9: 'Nove', 10: 'Dieci', 11: 'Jack', 12: 'Donne', 13: 'Re', 14: 'Assi',
};
