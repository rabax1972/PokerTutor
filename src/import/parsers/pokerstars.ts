import type { Street } from '../../engine/game';
import { emptyHand, type ParsedHand } from '../types';
import { detectCurrency, lines, parseAmount, parseCardList } from '../text';
import { checkGame, matchName, parseActionText, sortedNames, streetHeader } from './common';

/**
 * Parser per il formato PokerStars (anche .it/.es/.fr, Zoom, tornei) e GGPoker,
 * che usa una variante quasi identica ("Poker Hand #RC…").
 *
 *   PokerStars Hand #2435…:  Hold'em No Limit ($0.01/$0.02 USD) - 2023/04/01 12:34:56 CET
 *   Table 'Aase III' 6-max Seat #4 is the button
 *   Seat 1: player1 ($2.13 in chips)
 *   player5: posts small blind $0.01
 *   *** HOLE CARDS ***
 *   Dealt to Hero [Ah Kd]
 *   Hero: raises $0.04 to $0.06
 */
export function parseStarsLike(raw: string): ParsedHand {
  const ls = lines(raw).filter((l) => l.trim() !== '');
  const header = ls[0] ?? '';
  const h = emptyHand(/^Poker Hand #/.test(header) ? 'GGPoker' : 'PokerStars', raw);
  h.handId = header.match(/#\s*([A-Z]*\d+)/)?.[1] ?? '';
  h.tournament = /Tournament #|Torneo #/i.test(header);
  h.date = header.match(/(\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2})/)?.[1];
  h.currency = h.tournament ? undefined : detectCurrency(header);
  checkGame(h, header);
  const stakes = header.match(/\(\s*([^\s/()]+)\s*\/\s*([^\s/()]+)/);
  if (stakes) {
    h.sb = parseAmount(stakes[1]);
    h.bb = parseAmount(stakes[2]);
  } else h.unsupported.push('Blind non trovati nell\'intestazione.');

  let i = 1;
  const table = ls[i]?.match(/^Table '(.+?)'\s+(\d+)-max.*?Seat #(\d+) is the button/);
  if (table) {
    h.tableName = table[1];
    h.maxSeats = Number(table[2]);
    h.buttonSeatNo = Number(table[3]);
    i++;
  } else {
    const btn = ls[i]?.match(/Seat #(\d+) is the button/);
    if (btn) { h.buttonSeatNo = Number(btn[1]); i++; }
  }

  // Posti: fino alla prima riga che non è "Seat N: …".
  for (; i < ls.length; i++) {
    const m = ls[i].match(/^Seat (\d+): (.+) \(([^()]*?) in chips[^)]*\)(.*)$/);
    if (!m) break;
    if (/sitting out|out of hand/i.test(m[4])) continue;
    h.seats.push({ seatNo: Number(m[1]), name: m[2], stack: parseAmount(m[3]) });
  }
  const names = sortedNames(h);

  let street: Street | 'showdown' | 'summary' = 'preflop';
  let boardFromStreets: number[] = [];
  let firstBoardDone = false;
  for (; i < ls.length; i++) {
    const line = ls[i];
    const sh = streetHeader(line);
    if (sh) {
      if (/SECOND (FLOP|TURN|RIVER)/i.test(line)) { firstBoardDone = true; continue; }
      if (/FIRST (FLOP|TURN|RIVER)/i.test(line) && !h.warnings.some((w) => w.includes('run it twice'))) {
        h.warnings.push('Mano giocata con run it twice: si considera solo il primo board.');
      }
      street = sh.street;
      if (!firstBoardDone && sh.cards.length && (street === 'flop' || street === 'turn' || street === 'river')) {
        boardFromStreets = street === 'flop' ? sh.cards.slice(0, 3) : [...boardFromStreets, ...sh.cards.slice(-1)];
      }
      continue;
    }
    if (street === 'summary') {
      const b = line.match(/^Board(?: 1)? \[(.+)\]/);
      if (b) h.board = parseCardList(b[1]);
      continue;
    }
    let m = line.match(/^Dealt to (.+?) \[(.+)\]$/);
    if (m) { h.hero = m[1]; h.heroCards = parseCardList(m[2]); continue; }
    m = line.match(/^Uncalled bet \((.+)\) returned to (.+)$/);
    if (m) { h.uncalled[m[2]] = (h.uncalled[m[2]] ?? 0) + parseAmount(m[1]); continue; }
    m = line.match(/^(.+?) collected (.+?) from /);
    if (m && names.includes(m[1])) { h.collected[m[1]] = (h.collected[m[1]] ?? 0) + parseAmount(m[2]); continue; }

    const who = matchName(line, names, ': ');
    if (!who) continue;
    const rest = who.rest;
    let p: RegExpMatchArray | null;
    if ((p = rest.match(/^posts small & big blinds? (.+?)(?: and is all-in)?$/))) h.posts.push({ name: who.name, type: 'sbbb', amount: parseAmount(p[1]) });
    else if ((p = rest.match(/^posts (?:the )?small blind (.+?)(?: and is all-in)?$/))) h.posts.push({ name: who.name, type: 'sb', amount: parseAmount(p[1]) });
    else if ((p = rest.match(/^posts (?:the )?big blind (.+?)(?: and is all-in)?$/))) h.posts.push({ name: who.name, type: 'bb', amount: parseAmount(p[1]) });
    else if ((p = rest.match(/^posts (?:the )?ante (.+?)(?: and is all-in)?$/))) h.posts.push({ name: who.name, type: 'ante', amount: parseAmount(p[1]) });
    else if ((p = rest.match(/^posts straddle (.+?)(?: and is all-in)?$/))) h.posts.push({ name: who.name, type: 'straddle', amount: parseAmount(p[1]) });
    else if ((p = rest.match(/^shows \[(.+?)\]/))) h.shown[who.name] = parseCardList(p[1]);
    else if (street !== 'showdown') {
      const a = parseActionText(rest, street, who.name);
      if (a) h.actions.push(a);
    }
  }
  if (h.board.length === 0) h.board = boardFromStreets;
  if (!h.handId) h.unsupported.push('Identificativo della mano non trovato.');
  return h;
}
