import { parse888 } from './parsers/poker888';
import { parseStarsLike } from './parsers/pokerstars';
import { parseWinamax } from './parsers/winamax';
import type { ParsedHand } from './types';

/** Righe con cui inizia una mano nei formati supportati. */
const HAND_START = /^(?:﻿)?(?:PokerStars (?:Zoom |Home Game )?(?:Hand|Game) #|Poker Hand #|Winamax Poker - |#Game No\s*:|\*{5} 888poker Hand History)/;

/** Divide un file di hand history nelle singole mani. */
export function splitHands(text: string): string[] {
  const ls = text.replace(/^﻿/, '').split(/\r?\n/);
  const starts: number[] = [];
  ls.forEach((l, i) => {
    if (!HAND_START.test(l)) return;
    // 888poker: "#Game No" e "***** 888poker Hand History" fanno parte della stessa mano.
    if (/^\*{5} 888poker/.test(l) && starts.length && i - starts[starts.length - 1] <= 2 && /^#Game No/.test(ls[starts[starts.length - 1]])) return;
    starts.push(i);
  });
  return starts.map((s, k) => ls.slice(s, starts[k + 1] ?? ls.length).join('\n').trim()).filter(Boolean);
}

export function parseHand(raw: string): ParsedHand | null {
  const first = raw.split(/\r?\n/, 1)[0];
  if (/^(PokerStars|Poker Hand #)/.test(first)) return parseStarsLike(raw);
  if (/^Winamax Poker/.test(first)) return parseWinamax(raw);
  if (/^#Game No|888poker/.test(first)) return parse888(raw);
  return null;
}

export interface ParseResult {
  hands: ParsedHand[];
  /** Blocchi di testo non riconosciuti. */
  unknownBlocks: number;
}

export function parseHandHistory(text: string): ParseResult {
  const blocks = splitHands(text);
  const hands: ParsedHand[] = [];
  let unknownBlocks = 0;
  for (const b of blocks) {
    try {
      const h = parseHand(b);
      if (h) hands.push(h);
      else unknownBlocks++;
    } catch {
      unknownBlocks++;
    }
  }
  if (blocks.length === 0 && text.trim()) unknownBlocks = 1;
  return { hands, unknownBlocks };
}

/** Decodifica un file di testo: gestisce UTF-8 (con o senza BOM) e UTF-16 (usato da alcuni client). */
export function decodeHistoryFile(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  // UTF-16 senza BOM: molti byte nulli nelle posizioni dispari.
  let zeros = 0;
  for (let i = 1; i < Math.min(bytes.length, 400); i += 2) if (bytes[i] === 0) zeros++;
  if (zeros > 50) return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

export type { ParsedHand } from './types';
