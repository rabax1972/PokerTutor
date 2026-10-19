// Genera un file di hand history di prova (mani giocate dai bot, esportate in formato PokerStars + esempi degli altri portali).
import { writeFileSync } from 'node:fs';
import { applyAction } from '../src/engine/game';
import { decideBot } from '../src/bots/bot';
import { freeHandSetup, startHand } from '../src/game/session';
import { exportStars } from '../src/import/__tests__/exportStars';
import * as F from '../src/import/__tests__/fixtures';
const parts: string[] = [F.GG_CASH, F.WINAMAX_CASH, F.P888_CASH, F.STARS_TOURNEY_9MAX, F.STARS_OMAHA];
for (let h = 0; h < 300; h++) {
  let s = startHand(freeHandSetup({ numPlayers: 6, mode: 'free', stackBB: 100, bankroll: 'adequate' }, h, 777 + h)).state;
  while (!s.isComplete) s = applyAction(s, decideBot(s));
  parts.push(exportStars(s, 800000 + h));
}
writeFileSync(process.argv[2], parts.join('\n\n\n'));
console.log('mani:', parts.length);
