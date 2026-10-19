import { applyAction } from '../src/engine/game';
import { decideBot } from '../src/bots/bot';
import { freeHandSetup, startHand, HERO_SEAT } from '../src/game/session';
import { analyzeDecision } from '../src/strategy/advisor';
const grades: Record<string, number> = {};
const bySpot: Record<string, Record<string, number>> = {};
const examples: string[] = [];
let n = 0, t0 = Date.now(), maxMs = 0;
for (let h = 0; h < 400; h++) {
  const setup = freeHandSetup({ numPlayers: 2 + (h % 7), mode: 'free', stackBB: h % 4 === 0 ? 15 : 100, bankroll: 'adequate' }, h, h * 17 + 3);
  let s = startHand(setup).state;
  while (!s.isComplete) {
    const a = decideBot(s);
    if (s.toAct === HERO_SEAT) {
      const t = Date.now();
      const r = analyzeDecision(s, a, 'adequate');
      maxMs = Math.max(maxMs, Date.now() - t);
      n++;
      grades[r.verdict.grade] = (grades[r.verdict.grade] ?? 0) + 1;
      bySpot[r.advice.spot] ??= {};
      bySpot[r.advice.spot][r.verdict.grade] = (bySpot[r.advice.spot][r.verdict.grade] ?? 0) + 1;
      if (r.verdict.grade === 'errore-grave' && examples.length < 12)
        examples.push(`${r.advice.spot} ${r.advice.heroCode} board=${r.advice.board.length} bot=${a.type}${a.amount ?? ''} best=${r.advice.best.label} loss=${r.verdict.evLossBB.toFixed(2)} eq=${r.advice.equity?.toFixed(2)} pot=${r.advice.pot / 100}`);
    }
    s = applyAction(s, a);
  }
}
console.log('decisioni', n, 'ms medi', ((Date.now() - t0) / n).toFixed(1), 'max', maxMs);
console.log(grades);
for (const [k, v] of Object.entries(bySpot)) console.log(k.padEnd(18), JSON.stringify(v));
console.log(examples.join('\n'));
