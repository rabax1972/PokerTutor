import type { Street } from '../../engine/game';
import { emptyHand, type ParsedHand } from '../types';
import { detectCurrency, lines, parseAmount, parseCardList } from '../text';
import { checkGame, matchName, parseActionText, sortedNames, streetHeader } from './common';

/**
 * Parser per 888poker:
 *
 *   #Game No : 123456789
 *   ***** 888poker Hand History for Game 123456789 *****
 *   $0.01/$0.02 Blinds No Limit Holdem - *** 01 04 2023 12:34:56
 *   Table Oslo 6 Max (Real Money)
 *   Seat 3 is the button
 *   Total number of players : 6
 *   Seat 1: player1 ( $2.13 )
 *   player5 posts small blind [$0.01]
 *   ** Dealing down cards **
 *   Dealt to Hero [ Ah, Kd ]
 *   Hero raises [$0.06]
 *
 * Nei rilanci l'importo tra parentesi può indicare le fiche aggiunte invece del totale:
 * l'ambiguità viene risolta durante la ricostruzione della mano (replay).
 */
export function parse888(raw: string): ParsedHand {
  const ls = lines(raw).filter((l) => l.trim() !== '');
  const h = emptyHand('888poker', raw);
  h.handId = raw.match(/#Game No\s*:\s*(\d+)/)?.[1] ?? raw.match(/for Game (\d+)/)?.[1] ?? '';
  h.tournament = /Tournament #/i.test(raw.slice(0, 600));
  const gameLine = ls.find((l) => /Blinds .*(Holdem|Omaha|Hold'em)/i.test(l)) ?? '';
  checkGame(h, gameLine);
  const stakes = gameLine.match(/^(\S+?)\/(\S+?) Blinds/);
  if (stakes) {
    h.sb = parseAmount(stakes[1]);
    h.bb = parseAmount(stakes[2]);
  } else h.unsupported.push('Blind non trovati nell\'intestazione.');
  h.currency = h.tournament ? undefined : detectCurrency(gameLine);
  h.date = gameLine.match(/\*\*\* (.+)$/)?.[1]?.trim();

  let i = ls.findIndex((l) => /^Table /.test(l));
  if (i >= 0) {
    const t = ls[i].match(/^Table (.+?) (\d+) Max/);
    if (t) { h.tableName = t[1]; h.maxSeats = Number(t[2]); }
  }
  const btn = raw.match(/Seat (\d+) is the button/);
  if (btn) h.buttonSeatNo = Number(btn[1]);
  i = ls.findIndex((l) => /^Seat \d+: /.test(l));
  for (; i >= 0 && i < ls.length; i++) {
    const m = ls[i].match(/^Seat (\d+): (.+?) \( ?([^()]+?) ?\)\s*$/);
    if (!m) break;
    h.seats.push({ seatNo: Number(m[1]), name: m[2], stack: parseAmount(m[3]) });
  }
  const names = sortedNames(h);

  let street: Street | 'showdown' | 'summary' = 'preflop';
  for (; i >= 0 && i < ls.length; i++) {
    const line = ls[i];
    const sh = streetHeader(line);
    if (sh) {
      street = sh.street;
      if (street === 'flop') h.board = sh.cards.slice(0, 3);
      else if ((street === 'turn' || street === 'river') && sh.cards.length) h.board.push(sh.cards[sh.cards.length - 1]);
      continue;
    }
    let m = line.match(/^Dealt to (.+?) \[(.+)\]$/);
    if (m) { h.hero = m[1]; h.heroCards = parseCardList(m[2]); continue; }
    const who = matchName(line, names, ' ');
    if (!who) continue;
    const rest = who.rest;
    if ((m = rest.match(/^collected \[?(.+?)\]?$/))) { h.collected[who.name] = (h.collected[who.name] ?? 0) + parseAmount(m[1]); continue; }
    if ((m = rest.match(/^posts small blind \[(.+?)\]/))) h.posts.push({ name: who.name, type: 'sb', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^posts big blind \[(.+?)\]/))) h.posts.push({ name: who.name, type: 'bb', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^posts dead big blind \[(.+?)\]/))) h.posts.push({ name: who.name, type: 'bb', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^posts ante \[(.+?)\]/))) h.posts.push({ name: who.name, type: 'ante', amount: parseAmount(m[1]) });
    else if ((m = rest.match(/^shows \[(.+?)\]/))) h.shown[who.name] = parseCardList(m[1]);
    else if (street !== 'showdown' && street !== 'summary') {
      const a = parseActionText(rest.replace(/\[(.+?)\]/g, '$1'), street, who.name);
      if (a) h.actions.push(a);
    }
  }
  if (!h.handId) h.unsupported.push('Identificativo della mano non trovato.');
  return h;
}
