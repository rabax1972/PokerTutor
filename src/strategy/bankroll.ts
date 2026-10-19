import type { BankrollLevel } from '../game/session';

export interface BankrollInfo {
  level: BankrollLevel;
  label: string;
  buyIns: number;
  /** Rischio di rovina stimato (0..1) per un giocatore vincente "tipico". */
  riskOfRuin: number;
  /** Quanto margine di EV chiediamo prima di consigliare una giocata ad alta varianza (in % dello stack rischiato). */
  varianceMargin: number;
  advice: string;
}

/** Ipotesi standard per il cash game: winrate 5bb/100 mani, deviazione standard 90bb/100 mani. */
export const ASSUMED_WINRATE = 5;
export const ASSUMED_STDDEV = 90;

/**
 * Rischio di rovina (formula classica): RoR = exp(-2 · winrate · bankroll / σ²),
 * con winrate e σ espressi per 100 mani e bankroll in big blind.
 */
export function riskOfRuin(bankrollBB: number, winrate = ASSUMED_WINRATE, stddev = ASSUMED_STDDEV): number {
  if (winrate <= 0) return 1;
  return Math.exp((-2 * winrate * bankrollBB) / (stddev * stddev));
}

const LEVELS: Record<BankrollLevel, { label: string; buyIns: number; margin: number; advice: string }> = {
  short: {
    label: 'Corto (10 buy-in)',
    buyIns: 10,
    margin: 0.06,
    advice:
      'Con soli 10 buy-in una normale serie negativa può azzerarti. Evita i coin flip per tutto lo stack quando il vantaggio è minimo, e valuta di scendere di limite.',
  },
  adequate: {
    label: 'Adeguato (30 buy-in)',
    buyIns: 30,
    margin: 0.02,
    advice: 'Bankroll sufficiente per assorbire la varianza: puoi prendere tutte le giocate con EV positivo.',
  },
  large: {
    label: 'Ampio (100 buy-in)',
    buyIns: 100,
    margin: 0,
    advice: 'Bankroll molto solido: la varianza non è un problema, conta solo massimizzare l\'EV.',
  },
};

export function bankrollInfo(level: BankrollLevel): BankrollInfo {
  const l = LEVELS[level];
  return {
    level,
    label: l.label,
    buyIns: l.buyIns,
    riskOfRuin: riskOfRuin(l.buyIns * 100),
    varianceMargin: l.margin,
    advice: l.advice,
  };
}
