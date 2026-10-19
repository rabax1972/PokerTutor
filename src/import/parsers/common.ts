import type { Street } from '../../engine/game';
import type { ParsedAction, ParsedHand } from '../types';
import { parseAmount, parseCardList } from '../text';

/** Trova il giocatore con cui inizia la riga (nome più lungo prima), seguito dal separatore. */
export function matchName(line: string, names: string[], sep: string): { name: string; rest: string } | null {
  for (const n of names) if (line.startsWith(n + sep)) return { name: n, rest: line.slice(n.length + sep.length) };
  return null;
}

export function sortedNames(h: ParsedHand): string[] {
  return h.seats.map((s) => s.name).sort((a, b) => b.length - a.length);
}

/**
 * Interpreta il testo di un'azione dopo il nome: "folds", "checks", "calls $0.04",
 * "bets $0.10", "raises $0.20 to $0.30 [and is all-in]".
 * Restituisce null se non è un'azione di gioco (chat, disconnessioni, ecc.).
 */
export function parseActionText(rest: string, street: Street, name: string): ParsedAction | null {
  const allIn = /all-in/i.test(rest);
  let m: RegExpMatchArray | null;
  if (/^folds\b/.test(rest)) return { street, name, type: 'fold' };
  if (/^checks\b/.test(rest)) return { street, name, type: 'check' };
  if ((m = rest.match(/^calls\s+(.+?)(?:\s+and is all-in.*)?$/))) return { street, name, type: 'call', amount: parseAmount(m[1]), allIn };
  if ((m = rest.match(/^bets\s+(.+?)(?:\s+and is all-in.*)?$/))) return { street, name, type: 'bet', amount: parseAmount(m[1]), allIn };
  if ((m = rest.match(/^raises\s+(.+?)\s+to\s+(.+?)(?:\s+and is all-in.*)?$/))) {
    return { street, name, type: 'raise', amount: parseAmount(m[2]), allIn };
  }
  if ((m = rest.match(/^raises\s+(.+?)(?:\s+and is all-in.*)?$/))) {
    return { street, name, type: 'raise', amount: parseAmount(m[1]), amountIsAdded: true, allIn };
  }
  if (/^(goes )?all-in/i.test(rest)) return { street, name, type: 'raise', allIn: true };
  return null;
}

/** Riconosce l'intestazione di una street e restituisce le carte nuove (se presenti). */
export function streetHeader(line: string): { street: Street | 'showdown' | 'summary'; cards: number[] } | null {
  const up = line.toUpperCase();
  if (/^\*{2,3} ?(HOLE CARDS|PRE-?FLOP|DEALING DOWN CARDS)/.test(up)) return { street: 'preflop', cards: [] };
  if (/^\*{2,3} ?(FIRST |SECOND )?(FLOP|DEALING FLOP)/.test(up)) return { street: 'flop', cards: lastBracket(line) };
  if (/^\*{2,3} ?(FIRST |SECOND )?(TURN|DEALING TURN)/.test(up)) return { street: 'turn', cards: lastBracket(line) };
  if (/^\*{2,3} ?(FIRST |SECOND )?(RIVER|DEALING RIVER)/.test(up)) return { street: 'river', cards: lastBracket(line) };
  if (/^\*{2,3} ?(SHOW ?DOWN|FIRST SHOW ?DOWN|SECOND SHOW ?DOWN)/.test(up)) return { street: 'showdown', cards: [] };
  if (/^\*{2,3} ?SUMMARY/.test(up)) return { street: 'summary', cards: [] };
  return null;
}

/** Carte nell'ultima coppia di parentesi quadre della riga ("[2c 7h Td] [Qs]" → Qs). */
function lastBracket(line: string): number[] {
  const all = [...line.matchAll(/\[([^\]]*)\]/g)];
  if (!all.length) return [];
  // Al flop la riga contiene solo il flop; a turn/river l'ultima parentesi contiene la carta nuova.
  return parseCardList(all[all.length - 1][1]);
}

export function checkGame(h: ParsedHand, gameText: string) {
  const g = gameText.toLowerCase();
  if (/omaha|plo|stud|razz|draw|courchevel|short ?deck|6\+|six plus/.test(g)) {
    h.unsupported.push(`Variante non supportata: il tutor analizza solo Texas Hold'em No Limit.`);
  } else if (/pot[ -]?limit/.test(g) || (/limit/.test(g) && !/no[ -]?limit/.test(g))) {
    h.unsupported.push('Struttura non supportata: il tutor analizza solo il No Limit.');
  }
}
