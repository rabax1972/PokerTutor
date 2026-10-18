/**
 * Nomi delle posizioni in funzione del numero di giocatori.
 * L'array è ordinato partendo dal bottone e proseguendo in senso orario (BTN, SB, BB, ...).
 *
 * Heads-up (2 giocatori): il bottone è anche small blind, agisce per primo preflop e per ultimo postflop.
 */
export type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'UTG+1' | 'MP' | 'HJ' | 'CO';

const BY_COUNT: Record<number, Position[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'CO'],
  5: ['BTN', 'SB', 'BB', 'HJ', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export function positionNames(numPlayers: number): Position[] {
  const p = BY_COUNT[numPlayers];
  if (!p) throw new Error(`Numero di giocatori non supportato: ${numPlayers}`);
  return p;
}

/** Posizione del posto `seat`, dato il posto del bottone. */
export function positionOfSeat(seat: number, buttonSeat: number, numPlayers: number): Position {
  const offset = (seat - buttonSeat + numPlayers) % numPlayers;
  return positionNames(numPlayers)[offset];
}

export function blindSeats(buttonSeat: number, numPlayers: number): { sb: number; bb: number } {
  if (numPlayers === 2) return { sb: buttonSeat, bb: (buttonSeat + 1) % 2 };
  return { sb: (buttonSeat + 1) % numPlayers, bb: (buttonSeat + 2) % numPlayers };
}

/** Primo a parlare preflop: heads-up il bottone/SB, altrimenti il giocatore dopo il BB. */
export function firstToActPreflop(buttonSeat: number, numPlayers: number): number {
  if (numPlayers === 2) return buttonSeat;
  return (buttonSeat + 3) % numPlayers;
}

/** Primo a parlare postflop: il primo giocatore dopo il bottone (heads-up: il BB). */
export function firstToActPostflop(buttonSeat: number, numPlayers: number): number {
  return (buttonSeat + 1) % numPlayers;
}

export const POSITION_LABELS_IT: Record<Position, string> = {
  BTN: 'Bottone (BTN)',
  SB: 'Small blind (SB)',
  BB: 'Big blind (BB)',
  UTG: 'Under the gun (UTG)',
  'UTG+1': 'UTG+1',
  MP: 'Middle position (MP)',
  HJ: 'Hijack (HJ)',
  CO: 'Cutoff (CO)',
};

/** Etichetta corta da mostrare al tavolo (in heads-up il bottone è anche SB). */
export function shortLabel(pos: Position, numPlayers: number): string {
  if (numPlayers === 2 && pos === 'BTN') return 'BTN/SB';
  return pos;
}
