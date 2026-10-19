// Genera src/strategy/data/preflopEquity.ts: equity di ciascuna delle 169 mani contro una mano casuale.
import { writeFileSync } from 'node:fs';
import { ALL_HAND_CODES, combosOf } from '../src/strategy/handNotation';
import { equityVsRanges, anyTwo } from '../src/strategy/equity';

const out: Record<string, number> = {};
for (const code of ALL_HAND_CODES) {
  const hero = combosOf(code)[0];
  const r = equityVsRanges(hero, [], [anyTwo()], 40000, 99);
  out[code] = Math.round(r.equity * 1000) / 1000;
}
const body = Object.entries(out).map(([k, v]) => `  "${k}": ${v},`).join('\n');
writeFileSync(
  'src/strategy/data/preflopEquity.ts',
  `// File generato da scripts/genPreflopEquity.ts — equity preflop contro una mano casuale (Monte Carlo, 40k iterazioni).\nexport const PREFLOP_EQUITY_VS_RANDOM: Record<string, number> = {\n${body}\n};\n`,
);
console.log('ok', Object.keys(out).length, out.AA, out.KK, out['72o'], out.AKs);
