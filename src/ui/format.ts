import type { ActionRecord, Street } from '../engine/game';
import { BIG_BLIND } from '../game/session';

export function bb(chips: number, digits = 2): string {
  const v = chips / BIG_BLIND;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return `${s.replace('.', ',')} bb`;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits).replace('.', ',')}%`;
}

export const STREET_IT: Record<Street, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

export function actionText(a: Pick<ActionRecord, 'type' | 'amount' | 'added' | 'allIn'>): string {
  switch (a.type) {
    case 'post-sb':
      return `posta lo small blind (${bb(a.added)})`;
    case 'post-bb':
      return `posta il big blind (${bb(a.added)})`;
    case 'post-ante':
      return `posta l'ante (${bb(a.added)})`;
    case 'post-dead':
      return `posta un blind morto (${bb(a.added)})`;
    case 'fold':
      return 'folda';
    case 'check':
      return 'fa check';
    case 'call':
      return a.allIn ? `chiama all-in (${bb(a.added)})` : `chiama ${bb(a.added)}`;
    case 'bet':
      return a.allIn ? `punta all-in ${bb(a.amount)}` : `punta ${bb(a.amount)}`;
    case 'raise':
      return a.allIn ? `rilancia all-in a ${bb(a.amount)}` : `rilancia a ${bb(a.amount)}`;
  }
}

export function shortActionText(a: Pick<ActionRecord, 'type' | 'amount' | 'allIn'>): string {
  if (a.allIn && a.type !== 'fold' && a.type !== 'check') return 'ALL-IN';
  switch (a.type) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return 'Call';
    case 'bet': return `Bet ${bb(a.amount)}`;
    case 'raise': return `Raise ${bb(a.amount)}`;
    default: return '';
  }
}
