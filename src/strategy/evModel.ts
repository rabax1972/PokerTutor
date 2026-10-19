/**
 * Modello di EV semplificato "a una street": tutte le cifre sono in fiches e relative al fold (EV fold = 0).
 * È un'approssimazione didattica: non modella le street future se non tramite il fattore di realizzazione R.
 */

/**
 * Call: vinci la tua quota di piatto finale, paghi la chiamata.
 * EV = R · equity · (piatto + call) − call
 * `pot` include già la puntata dell'avversario.
 */
export function callEV(equity: number, pot: number, toCall: number, realization = 1): number {
  return realization * equity * (pot + toCall) - toCall;
}

/**
 * Bet/raise: con probabilità FE tutti foldano e vinci il piatto; altrimenti si va avanti con la tua equity
 * contro le mani che continuano.
 * EV = FE · piatto + (1 − FE) · (R · eqC · (piatto + H + V) − H)
 * H = fiches che aggiungi tu, V = fiches che aggiunge chi chiama.
 */
export function raiseEV(
  pot: number,
  heroAdds: number,
  villainAdds: number,
  foldEquity: number,
  equityWhenCalled: number,
  realization = 1,
): number {
  return foldEquity * pot + (1 - foldEquity) * (realization * equityWhenCalled * (pot + heroAdds + villainAdds) - heroAdds);
}

/** Check: realizzi (in parte) la tua equity sul piatto attuale. */
export function checkEV(equity: number, pot: number, realization = 1): number {
  return realization * equity * pot;
}

/** Fold equity minima perché un bluff puro (equity 0) sia in pari: puntata / (piatto + puntata). */
export function bluffBreakEven(bet: number, pot: number): number {
  return bet / (pot + bet);
}

/** Fattore di realizzazione dell'equity: in posizione si realizza di più, multiway di meno. */
export function realizationFactor(inPosition: boolean, opponents: number, street: 'preflop' | 'postflop'): number {
  let r = street === 'preflop' ? (inPosition ? 0.95 : 0.78) : inPosition ? 1 : 0.9;
  if (opponents > 1) r *= Math.pow(0.93, opponents - 1);
  return r;
}
