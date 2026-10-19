import type { Street } from '../../engine/game';
import { emptyHand, type ParsedHand } from '../types';
import { detectCurrency, lines, parseAmount, parseCardList } from '../text';
import { checkGame, matchName, parseActionText, sortedNames, streetHeader } from './common';

/**
 * Parser per Winamax:
 *
 *   Winamax Poker - CashGame - HandId: #12345-123-1680000000 - Holdem no limit (0.01€/0.02€) - 2023/04/01 12:34:56 UTC
 *   Table: 'Nice 05' 6-max (real money) Seat #2 is the button
 *   Seat 1: player1 (2€)
 *   *** ANTE/BLINDS ***
 *   player3 posts small blind 0.01€
 *   Dealt to Hero [Ah Kd]
 *   *** PRE-FLOP ***
 *   Hero raises 0.04€ to 0.06€
 *
 * Nei tornei i blind sono "(ante/sb/bb)", es. "(10/50/100)".
 */
export function parseWinamax(raw: string): ParsedHand {
  const ls = lines(raw).filter((l) => l.trim() !== '');
  const header = ls[0] ?? '';
  const h = emptyHand('Winamax', raw);
  h.handId = header.match(/HandId: #([\w-]+)/)?.[1] ?? '';
  h.tournament = /Tournament|Sit&Go|Expresso/i.test(header);
  h.date = header.match(/(\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2})/)?.[1];
  h.currency = h.tournament ? undefined : detectCurrency(header);
  const game = header.match(/- ([^-]*?(?:hold'?em|omaha)[^(]*)\(([^)]+)\)/i);
  checkGame(h, game?.[1] ?? header);
  if (game) {
    const parts = game[2].split('/').map(parseAmount);
    if (parts.length >= 3) { h.sb = parts[parts.length - 2]; h.bb = parts[parts.length - 1]; }
    else { h.sb = parts[0]; h.bb = parts[1]; }
  } else h.unsupported.push('Blind non trovati nell\'intestazione.');

  let i = 1;
  const table = ls[i]?.match(/^Table: '(.+?)'\s+(\d+)-max.*?Seat #(\d+) is the button/);
  if (table) {
    h.tableName = table[1];
    h.maxSeats = Number(table[2]);
    h.buttonSeatNo = Number(table[3]);
    i++;
  }
  for (; i < ls.length; i++) {
    const m = ls[i].match(/^Seat (\d+): (.+) \(([^()]+)\)(.*)$/);
    if (!m) break;
    if (/sitting out|out of hand/i.test(m[4])) continue;
    h.seats.push({ seatNo: Number(m[1]), name: m[2], stack: parseAmount(m[3].split(/,\s/)[0]) });
  }
  const names = sortedNames(h);

  let street: Street | 'showdown' | 'summary' = 'preflop';
  let boardFromStreets: number[] = [];
  for (; i < ls.length; i++) {
    const line = ls[i];
    if (/^\*\*\* ANTE\/BLINDS/.test(line)) continue;
    const sh = streetHeader(line);
    if (sh) {
      street = sh.street;
      if (sh.cards.length && (street === 'flop' || street === 'turn' || street === 'river')) {
        boardFromStreets = street === 'flop' ? sh.cards.slice(0, 3) : [...boardFromStreets, ...sh.cards.slice(-1)];
      }
      continue;
    }
    if (street === 'summary') {
      const b = line.match(/^Board: ?\[(.+)\]/);
      if (b) h.board = parseCardList(b[1]);
      continue;
    }
    let m = line.match(/^Dealt to (.+?) \[(.+)\]$/);
    if (m) { h.hero = m[1]; h.heroCards = parseCardList(m[2]); continue; }

    const who = matchName(line, names, ' ');
    if (!who) continue;
    const rest = who.rest;
    if ((m = rest.match(/^collected (.+?) from/))) { h.collected[who.name] = (h.collected[who.name] ?? 0) + parseAmount(m[1]); continue; }
    if ((m = rest.match(/^posts small blind (\S+)/))) h.posts.push({ name: who.name, type: 'sb', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^posts big blind (\S+)/))) h.posts.push({ name: who.name, type: 'bb', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^posts ante (\S+)/))) h.posts.push({ name: who.name, type: 'ante', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^posts straddle (\S+)/))) h.posts.push({ name: who.name, type: 'straddle', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^shows \[(.+?)\]/))) h.shown[who.name] = parseCardList(m[1]);
    else if (street !== 'showdown') {
      const a = parseActionText(rest, street, who.name);
      if (a) h.actions.push(a);
    }
  }
  if (h.board.length === 0) h.board = boardFromStreets;
  if (!h.handId) h.unsupported.push('Identificativo della mano non trovato.');
  return h;
}
