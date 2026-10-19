import { parseCard, type Card } from '../engine/cards';

/**
 * Interpreta un importo come appare nelle hand history: "$1.25", "1.25€", "€0,05", "1,500", "[$0.30]".
 * Restituisce NaN se non c'è un numero.
 */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[[\]\s$€£¥]|USD|EUR|GBP|CAD|INR|CNY|chips?/gi, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) {
    // "1,500" = migliaia; "0,05" = decimali
    s = /,\d{3}$/.test(s) && !/^0,/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

/** Simbolo di valuta presente nell'header (vuoto per i tornei a fiches). */
export function detectCurrency(text: string): string | undefined {
  if (text.includes('€')) return '€';
  if (text.includes('$')) return '$';
  if (text.includes('£')) return '£';
  return undefined;
}

/** "[Ah Kd]", "[ Ah, Kd ]", "[10h Jd]" → carte. Ignora token non validi. */
export function parseCardList(raw: string): Card[] {
  const out: Card[] = [];
  for (const tok of raw.replace(/[[\]]/g, ' ').split(/[\s,]+/)) {
    if (!tok) continue;
    const t = tok.replace(/^10/, 'T');
    if (!/^[2-9TJQKA][shdc]$/i.test(t)) continue;
    out.push(parseCard(t[0].toUpperCase() + t[1].toLowerCase()));
  }
  return out;
}

export function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
