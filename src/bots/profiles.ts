/**
 * Stili di gioco dei bot. I parametri modulano range e frequenze:
 * - looseness: moltiplica la larghezza dei range preflop (1 = range standard)
 * - aggression: probabilità di scegliere puntata/rilancio invece di check/call
 * - bluff: frequenza dei bluff quando non c'è niente
 * - stickiness: tendenza a chiamare postflop con mani medie/deboli
 */
export type BotStyle = 'tight' | 'loose' | 'aggressive' | 'passive' | 'regular';

export interface BotProfile {
  style: BotStyle;
  label: string;
  description: string;
  looseness: number;
  aggression: number;
  bluff: number;
  stickiness: number;
}

export const BOT_PROFILES: Record<BotStyle, BotProfile> = {
  tight: {
    style: 'tight',
    label: 'Tight',
    description: 'Gioca poche mani e solo quelle buone. Quando punta forte di solito ha una mano.',
    looseness: 0.7, aggression: 0.55, bluff: 0.08, stickiness: 0.3,
  },
  loose: {
    style: 'loose',
    label: 'Loose',
    description: 'Entra in tanti piatti e chiama spesso: bluffarlo è difficile, fare value bet rende.',
    looseness: 1.6, aggression: 0.45, bluff: 0.15, stickiness: 0.75,
  },
  aggressive: {
    style: 'aggressive',
    label: 'Aggressivo',
    description: 'Punta e rilancia molto, anche in bluff. Lascia che si impicchi con le mani forti.',
    looseness: 1.25, aggression: 0.8, bluff: 0.35, stickiness: 0.45,
  },
  passive: {
    style: 'passive',
    label: 'Passivo',
    description: 'Chiama molto e rilancia poco: se rilancia, rispettalo.',
    looseness: 1.3, aggression: 0.2, bluff: 0.05, stickiness: 0.7,
  },
  regular: {
    style: 'regular',
    label: 'Regolare',
    description: 'Gioca range standard con un buon equilibrio tra valore e bluff.',
    looseness: 1, aggression: 0.6, bluff: 0.18, stickiness: 0.45,
  },
};

export const BOT_NAMES = ['Marco', 'Giulia', 'Luca', 'Sara', 'Paolo', 'Elena', 'Davide', 'Chiara', 'Andrea'];
