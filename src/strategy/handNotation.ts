import { type Card, makeCard, rankOf, suitOf, rankChar, rankFromChar } from '../engine/cards';

/**
 * Notazione standard delle 169 mani di partenza: "AA", "AKs" (suited), "AKo" (offsuit).
 */
export type HandCode = string;
export type Combo = [Card, Card];

export function handCode(c1: Card, c2: Card): HandCode {
  let r1 = rankOf(c1);
  let r2 = rankOf(c2);
  if (r2 > r1) [r1, r2] = [r2, r1];
  if (r1 === r2) return rankChar(r1) + rankChar(r2);
  return rankChar(r1) + rankChar(r2) + (suitOf(c1) === suitOf(c2) ? 's' : 'o');
}

/** Tutte le 169 mani, ordinate come una griglia 13x13 (riga = primo rank decrescente). */
export const ALL_HAND_CODES: HandCode[] = (() => {
  const out: HandCode[] = [];
  for (let r1 = 14; r1 >= 2; r1--)
    for (let r2 = 14; r2 >= 2; r2--) {
      if (r1 === r2) out.push(rankChar(r1) + rankChar(r2));
      else if (r2 < r1) out.push(rankChar(r1) + rankChar(r2) + 's');
      else out.push(rankChar(r2) + rankChar(r1) + 'o');
    }
  return [...new Set(out)];
})();

/** Cella della griglia 13x13: suited sopra la diagonale, offsuit sotto. */
export function gridCode(row: number, col: number): HandCode {
  const r1 = 14 - row;
  const r2 = 14 - col;
  if (r1 === r2) return rankChar(r1) + rankChar(r2);
  if (col > row) return rankChar(r1) + rankChar(r2) + 's';
  return rankChar(r2) + rankChar(r1) + 'o';
}

export function combosOf(code: HandCode): Combo[] {
  const r1 = rankFromChar(code[0]);
  const r2 = rankFromChar(code[1]);
  const out: Combo[] = [];
  if (r1 === r2) {
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = s1 + 1; s2 < 4; s2++) out.push([makeCard(r1, s1), makeCard(r2, s2)]);
  } else if (code[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([makeCard(r1, s), makeCard(r2, s)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([makeCard(r1, s1), makeCard(r2, s2)]);
  }
  return out;
}

export function comboCount(code: HandCode): number {
  if (code[0] === code[1]) return 6;
  return code[2] === 's' ? 4 : 12;
}

/**
 * Interpreta una stringa di range in notazione classica:
 * "22+, A2s+, KTs+, ATo+, KQo, 76s, A5s-A2s, 99-66".
 */
export function parseRange(text: string): Set<HandCode> {
  const out = new Set<HandCode>();
  for (const raw of text.split(',')) {
    const tok = raw.trim();
    if (!tok) continue;
    if (tok.includes('-')) {
      const [a, b] = tok.split('-').map((t) => t.trim());
      expandDash(a, b).forEach((h) => out.add(h));
    } else if (tok.endsWith('+')) {
      expandPlus(tok.slice(0, -1)).forEach((h) => out.add(h));
    } else {
      out.add(normalize(tok));
    }
  }
  return out;
}

function normalize(tok: string): HandCode {
  const r1 = rankFromChar(tok[0]);
  const r2 = rankFromChar(tok[1]);
  if (r1 === r2) return rankChar(r1) + rankChar(r2);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const suf = tok[2];
  if (suf !== 's' && suf !== 'o') throw new Error(`Mano non valida nel range: ${tok}`);
  return rankChar(hi) + rankChar(lo) + suf;
}

function expandPlus(tok: string): HandCode[] {
  const r1 = rankFromChar(tok[0]);
  const r2 = rankFromChar(tok[1]);
  const out: HandCode[] = [];
  if (r1 === r2) {
    for (let r = r1; r <= 14; r++) out.push(rankChar(r) + rankChar(r));
  } else {
    // "K9s+" = K9s, KTs, KJs, KQs (il secondo rank sale fino a sotto il primo)
    for (let r = r2; r < r1; r++) out.push(rankChar(r1) + rankChar(r) + tok[2]);
  }
  return out;
}

function expandDash(a: string, b: string): HandCode[] {
  const a1 = rankFromChar(a[0]);
  const a2 = rankFromChar(a[1]);
  const b1 = rankFromChar(b[0]);
  const b2 = rankFromChar(b[1]);
  const out: HandCode[] = [];
  if (a1 === a2 && b1 === b2) {
    for (let r = Math.min(a1, b1); r <= Math.max(a1, b1); r++) out.push(rankChar(r) + rankChar(r));
  } else {
    if (a1 !== b1) throw new Error(`Intervallo non valido: ${a}-${b}`);
    for (let r = Math.min(a2, b2); r <= Math.max(a2, b2); r++) out.push(rankChar(a1) + rankChar(r) + a[2]);
  }
  return out;
}

export function rangeComboCount(range: Iterable<HandCode>): number {
  let n = 0;
  for (const h of range) n += comboCount(h);
  return n;
}

export function rangePercent(range: Iterable<HandCode>): number {
  return (rangeComboCount(range) / 1326) * 100;
}

/** Descrizione italiana di una mano di partenza, es. "Asso-Re suited". */
export function describeHandCode(code: HandCode): string {
  const names: Record<string, string> = {
    A: 'Asso', K: 'Re', Q: 'Donna', J: 'Jack', T: 'Dieci', '9': 'Nove', '8': 'Otto',
    '7': 'Sette', '6': 'Sei', '5': 'Cinque', '4': 'Quattro', '3': 'Tre', '2': 'Due',
  };
  const plural: Record<string, string> = {
    A: 'Assi', K: 'Re', Q: 'Donne', J: 'Jack', T: 'Dieci', '9': 'Nove', '8': 'Otto',
    '7': 'Sette', '6': 'Sei', '5': 'Cinque', '4': 'Quattro', '3': 'Tre', '2': 'Due',
  };
  if (code[0] === code[1]) return `coppia di ${plural[code[0]]}`;
  return `${names[code[0]]}-${names[code[1]]} ${code[2] === 's' ? 'suited' : 'offsuit'}`;
}
