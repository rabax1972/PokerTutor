import { cardsToString } from '../../engine/cards';
import type { GameState } from '../../engine/game';

/** Esporta una mano dell'engine nel formato PokerStars (1 fiche = $0,01, BB = $1). */
export function exportStars(s: GameState, id: number): string {
  const $ = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, '')}`;
  const name = (seat: number) => (s.players[seat].isHero ? 'Hero' : `Player ${seat}`);
  const out: string[] = [];
  out.push(`PokerStars Hand #${id}:  Hold'em No Limit (${$(s.smallBlind)}/${$(s.bigBlind)} USD) - 2024/01/01 10:00:00 ET`);
  out.push(`Table 'Test' ${Math.max(6, s.numPlayers)}-max Seat #${s.buttonSeat + 1} is the button`);
  for (const p of s.players) out.push(`Seat ${p.seat + 1}: ${name(p.seat)} (${$(p.stackStart)} in chips)`);
  let street = 'preflop';
  let current = 0;
  let headerDone = false;
  for (const a of s.log) {
    if (a.type === 'post-ante') { out.push(`${name(a.seat)}: posts the ante ${$(a.added)}`); continue; }
    if (a.type === 'post-sb') { out.push(`${name(a.seat)}: posts small blind ${$(a.added)}`); continue; }
    if (a.type === 'post-bb') { out.push(`${name(a.seat)}: posts big blind ${$(a.added)}`); current = Math.max(current, a.amount); continue; }
    if (!headerDone) {
      out.push('*** HOLE CARDS ***');
      const hero = s.players.find((p) => p.isHero)!;
      out.push(`Dealt to Hero [${cardsToString(hero.hole)}]`);
      headerDone = true;
    }
    if (a.street !== street) {
      street = a.street;
      current = 0;
      const b = s.runout;
      if (street === 'flop') out.push(`*** FLOP *** [${cardsToString(b.slice(0, 3))}]`);
      if (street === 'turn') out.push(`*** TURN *** [${cardsToString(b.slice(0, 3))}] [${cardsToString([b[3]])}]`);
      if (street === 'river') out.push(`*** RIVER *** [${cardsToString(b.slice(0, 4))}] [${cardsToString([b[4]])}]`);
    }
    const ai = a.allIn ? ' and is all-in' : '';
    switch (a.type) {
      case 'fold': out.push(`${name(a.seat)}: folds`); break;
      case 'check': out.push(`${name(a.seat)}: checks`); break;
      case 'call': out.push(`${name(a.seat)}: calls ${$(a.added)}${ai}`); break;
      case 'bet': out.push(`${name(a.seat)}: bets ${$(a.amount)}${ai}`); current = a.amount; break;
      case 'raise': out.push(`${name(a.seat)}: raises ${$(a.amount - current)} to ${$(a.amount)}${ai}`); current = a.amount; break;
    }
  }
  const r = s.result!;
  const maxCommitted = (except: number) => Math.max(0, ...s.players.filter((p) => p.seat !== except).map((p) => p.committed));
  for (const p of s.players) {
    const refund = Math.max(0, p.committed - maxCommitted(p.seat));
    if (refund > 0) out.push(`Uncalled bet (${$(refund)}) returned to ${name(p.seat)}`);
    const collected = r.payouts[p.seat] - refund;
    if (r.showdown && !p.folded) out.push(`${name(p.seat)}: shows [${cardsToString(p.hole)}]`);
    if (collected > 0) out.push(`${name(p.seat)} collected ${$(collected)} from pot`);
  }
  out.push('*** SUMMARY ***');
  if (s.board.length) out.push(`Board [${cardsToString(s.board)}]`);
  return out.join('\n');
}

