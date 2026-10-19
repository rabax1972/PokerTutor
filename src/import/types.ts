import type { Card } from '../engine/cards';
import type { Street } from '../engine/game';

export type Site = 'PokerStars' | 'GGPoker' | 'Winamax' | '888poker';

export interface ParsedSeat {
  seatNo: number;
  name: string;
  /** Stack a inizio mano, nell'unità della hand history (valuta o fiches). */
  stack: number;
}

export interface ParsedPost {
  name: string;
  /** 'sbbb' = "posts small & big blinds": BB vivo + SB morto. */
  type: 'sb' | 'bb' | 'ante' | 'dead' | 'sbbb' | 'straddle';
  amount: number;
}

export interface ParsedAction {
  street: Street;
  name: string;
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  /**
   * bet: importo puntato; raise: totale "rilancia a" (se noto) oppure importo aggiunto
   * (vedi `amountIsAdded`); call: importo aggiunto.
   */
  amount?: number;
  /** Per i formati in cui il rilancio indica le fiche aggiunte invece del totale (888poker). */
  amountIsAdded?: boolean;
  allIn?: boolean;
}

/** Mano importata in forma normalizzata, indipendente dal portale. */
export interface ParsedHand {
  site: Site;
  handId: string;
  date?: string;
  tournament: boolean;
  currency?: string;
  sb: number;
  bb: number;
  tableName?: string;
  maxSeats?: number;
  buttonSeatNo: number;
  /** Solo i giocatori a cui sono state distribuite le carte, in ordine di posto. */
  seats: ParsedSeat[];
  hero?: string;
  heroCards?: Card[];
  posts: ParsedPost[];
  actions: ParsedAction[];
  board: Card[];
  shown: Record<string, Card[]>;
  collected: Record<string, number>;
  uncalled: Record<string, number>;
  /** Motivi per cui la mano non è analizzabile (Omaha, straddle, ecc.). */
  unsupported: string[];
  /** Avvisi non bloccanti (es. run it twice: si usa il primo board). */
  warnings: string[];
  raw: string;
}

export function emptyHand(site: Site, raw: string): ParsedHand {
  return {
    site, handId: '', tournament: false, sb: 0, bb: 0, buttonSeatNo: 0, seats: [], posts: [], actions: [],
    board: [], shown: {}, collected: {}, uncalled: {}, unsupported: [], warnings: [], raw,
  };
}
