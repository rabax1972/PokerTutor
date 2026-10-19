import type { Card } from '../engine/cards';
import { applyAction, createHand, getLegalActions, type GameState, type PlayerAction } from '../engine/game';
import type { Position } from '../engine/positions';
import { BIG_BLIND, type HeroDecision, type LiveHand } from '../game/session';
import { handCode } from '../strategy/handNotation';
import type { ParsedAction, ParsedHand } from './types';

export type ImportStatus = 'ok' | 'unsupported' | 'error';

export interface ImportedHand {
  key: string;
  parsed: ParsedHand;
  status: ImportStatus;
  reason?: string;
  warnings: string[];
  /** Mano ricostruita nell'engine, con le decisioni dell'utente pronte per la review. */
  live?: LiveHand;
  /** Risultato reale della mano per l'utente, in big blind (al netto del rake). */
  netBB?: number;
  position?: Position;
  heroCode?: string;
  stakesLabel: string;
}

function stakesLabel(p: ParsedHand): string {
  const n = (x: number) => String(Number.isInteger(x) ? x : Number(x.toFixed(2))).replace('.', ',');
  if (p.tournament) return `Torneo ${n(p.sb)}/${n(p.bb)}`;
  const c = p.currency ?? '';
  return `${c}${n(p.sb)}/${c}${n(p.bb)}`;
}

class ReplayError extends Error {}

/**
 * Ricostruisce una mano importata nell'engine del tutor, azione per azione.
 * Gli importi vengono riscalati in modo che 1 big blind = 100 fiches dell'engine.
 * Le carte coperte degli avversari non mostrate sono casuali: non influiscono sull'analisi,
 * che usa solo le carte dell'utente, il board e i range stimati.
 */
export function replayHand(p: ParsedHand): ImportedHand {
  const base: ImportedHand = {
    key: `${p.site}-${p.handId}`,
    parsed: p,
    status: 'ok',
    warnings: [...p.warnings],
    stakesLabel: stakesLabel(p),
  };
  const unsupported = (reason: string): ImportedHand => ({ ...base, status: 'unsupported', reason });
  if (p.unsupported.length) return unsupported(p.unsupported[0]);
  if (!p.hero || !p.heroCards || p.heroCards.length !== 2) {
    return unsupported('Mancano le tue carte (mano osservata o formato non riconosciuto).');
  }
  if (p.seats.length < 2 || p.seats.length > 10) return unsupported(`Numero di giocatori non supportato (${p.seats.length}).`);
  if (!(p.bb > 0) || !(p.sb > 0)) return unsupported('Blind non validi.');
  if (p.posts.some((x) => x.type === 'straddle')) return unsupported('Mani con straddle non ancora supportate.');

  try {
    return { ...base, ...rebuild(p, base.warnings) };
  } catch (e) {
    return { ...base, status: 'error', reason: e instanceof ReplayError ? e.message : `Errore nella ricostruzione: ${(e as Error).message}` };
  }
}

function rebuild(p: ParsedHand, warnings: string[]): Partial<ImportedHand> {
  // Posti in ordine orario, ruotati in modo che l'utente sia il posto 0.
  const sorted = [...p.seats].sort((a, b) => a.seatNo - b.seatNo);
  const heroIdx = sorted.findIndex((s) => s.name === p.hero);
  if (heroIdx < 0) throw new ReplayError('Il tuo nome non compare tra i posti al tavolo.');
  const seats = [...sorted.slice(heroIdx), ...sorted.slice(0, heroIdx)];
  const n = seats.length;
  const seatOf = new Map(seats.map((s, i) => [s.name, i]));
  const scale = BIG_BLIND / p.bb;
  const chips = (x: number) => Math.round(x * scale);

  // Blind: il bottone dell'engine si ricava dallo small blind, così le posizioni coincidono con chi ha postato.
  const sbPost = p.posts.find((x) => x.type === 'sb');
  const bbPost = p.posts.find((x) => x.type === 'bb' || x.type === 'sbbb');
  if (!sbPost) throw new ReplayError('Small blind assente (dead button): situazione non ancora supportata.');
  if (!bbPost) throw new ReplayError('Big blind assente.');
  const sbSeat = seatOf.get(sbPost.name);
  const bbSeat = seatOf.get(bbPost.name);
  if (sbSeat === undefined || bbSeat === undefined) throw new ReplayError('Blind postati da giocatori non presenti al tavolo.');
  const buttonSeat = n === 2 ? sbSeat : (sbSeat - 1 + n) % n;
  if (bbSeat !== (sbSeat + 1) % n) throw new ReplayError('Ordine dei blind non standard: mano non ricostruibile.');

  const antes = new Array<number>(n).fill(0);
  const extraPosts: { seat: number; amount: number; live: boolean }[] = [];
  for (const post of p.posts) {
    const seat = seatOf.get(post.name);
    if (seat === undefined) continue;
    if (post === sbPost || post === bbPost) {
      if (post.type === 'sbbb') extraPosts.push({ seat, amount: chips(post.amount - p.bb), live: false });
      continue;
    }
    if (post.type === 'ante') antes[seat] += chips(post.amount);
    else if (post.type === 'bb') extraPosts.push({ seat, amount: chips(post.amount), live: true });
    else if (post.type === 'sbbb') {
      extraPosts.push({ seat, amount: BIG_BLIND, live: true });
      extraPosts.push({ seat, amount: chips(post.amount - p.bb), live: false });
    } else extraPosts.push({ seat, amount: chips(post.amount), live: false });
  }

  // Carte note: le tue, quelle mostrate allo showdown e il board.
  const used = new Set<Card>([...p.heroCards!, ...p.board]);
  const presetHoles: (Card[] | undefined)[] = seats.map((s, i) => {
    if (i === 0) return p.heroCards!;
    const shown = p.shown[s.name];
    if (shown?.length === 2 && !shown.some((c) => used.has(c))) {
      shown.forEach((c) => used.add(c));
      return shown;
    }
    return undefined;
  });
  if (new Set(p.board).size !== p.board.length || p.board.some((c) => p.heroCards!.includes(c))) {
    throw new ReplayError('Carte duplicate tra board e mano: file probabilmente corrotto.');
  }

  let state = createHand({
    players: seats.map((s, i) => ({ name: i === 0 ? `${s.name} (tu)` : s.name, stack: Math.max(1, chips(s.stack)), isHero: i === 0 })),
    buttonSeat,
    smallBlind: chips(p.sb),
    bigBlind: BIG_BLIND,
    presetHoles,
    presetBoard: p.board.slice(0, 5),
    antes,
    extraPosts,
  });

  const decisions: HeroDecision[] = [];
  const acts = p.actions;
  for (let k = 0; k < acts.length; k++) {
    const a = acts[k];
    const seat = seatOf.get(a.name);
    if (seat === undefined) throw new ReplayError(`Azione di un giocatore sconosciuto: ${a.name}.`);
    if (state.isComplete) {
      warnings.push('Alcune azioni dopo la fine della mano sono state ignorate.');
      break;
    }
    if (state.street !== a.street && STREET_ORDER[a.street] < STREET_ORDER[state.street]) {
      throw new ReplayError(`Azione fuori ordine (${a.name} al ${a.street}).`);
    }
    if (state.toAct !== seat) {
      const expected = state.toAct !== null ? state.players[state.toAct].name : 'nessuno';
      throw new ReplayError(`Ordine di azione non coerente: toccava a ${expected}, nel file agisce ${a.name}.`);
    }
    const action = toEngineAction(state, a, acts, k, scale, warnings);
    if (seat === 0) decisions.push({ stateBefore: state, action });
    try {
      state = applyAction(state, action);
    } catch (e) {
      throw new ReplayError(`Azione non valida per l'engine (${a.name} ${a.type}): ${(e as Error).message}`);
    }
  }
  if (!state.isComplete) warnings.push('La mano nel file risulta incompleta: analizzate solo le decisioni presenti.');

  // Risultato reale: vinto (dal file) + eventuale puntata non chiamata restituita − fiches messe.
  const hero = state.players[0];
  const maxOther = Math.max(0, ...state.players.slice(1).map((x) => x.committed));
  const refund = Math.max(0, hero.committed - maxOther);
  const won = chips(p.collected[p.hero!] ?? 0);
  const netBB = (won + refund - hero.committed) / BIG_BLIND;

  const live: LiveHand = {
    setup: {
      numPlayers: n,
      buttonSeat,
      stacksBB: seats.map((s) => s.stack / p.bb),
      botStyles: [],
      title: `${p.site} · mano #${p.handId}`,
    },
    state,
    decisions,
    usedScript: [],
  };
  return {
    status: 'ok',
    live,
    netBB,
    position: state.players[0].position,
    heroCode: handCode(p.heroCards![0], p.heroCards![1]),
  };
}

const STREET_ORDER = { preflop: 0, flop: 1, turn: 2, river: 3 } as const;

function toEngineAction(
  state: GameState,
  a: ParsedAction,
  all: ParsedAction[],
  k: number,
  scale: number,
  warnings: string[],
): PlayerAction {
  const legal = getLegalActions(state)!;
  switch (a.type) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return legal.canCheck ? { type: 'check' } : { type: 'call' };
    case 'call':
      return legal.canCall ? { type: 'call' } : { type: 'check' };
  }
  // bet / raise
  if (!legal.canRaise) {
    if (legal.canCall) {
      warnings.push(`Rilancio di ${a.name} trattato come call (importo non valido dopo l'arrotondamento).`);
      return { type: 'call' };
    }
    throw new ReplayError(`${a.name} rilancia ma il rilancio non è consentito.`);
  }
  let to: number;
  if (a.amount === undefined || Number.isNaN(a.amount)) to = legal.maxRaiseTo;
  else if (a.amountIsAdded) to = resolveAddedAmbiguity(state, a, all, k, scale, warnings);
  else to = Math.round(a.amount * scale);

  if (a.allIn || to >= legal.maxRaiseTo - 1) to = legal.maxRaiseTo;
  if (to < legal.minRaiseTo) {
    // Piccole differenze dovute all'arrotondamento: si porta al minimo legale.
    if (to >= legal.minRaiseTo * 0.95 || legal.minRaiseTo - to <= 2) to = legal.minRaiseTo;
    else throw new ReplayError(`Rilancio di ${a.name} sotto il minimo consentito.`);
  }
  if (to <= state.currentBet) to = Math.min(legal.maxRaiseTo, legal.minRaiseTo);
  return { type: legal.raiseType, amount: Math.min(to, legal.maxRaiseTo) };
}

/**
 * 888poker: "raises [$X]" può indicare il totale o le fiche aggiunte. Se il giocatore aveva già fiches
 * nella street le due letture differiscono: si sceglie quella coerente con il call successivo.
 */
function resolveAddedAmbiguity(
  state: GameState,
  a: ParsedAction,
  all: ParsedAction[],
  k: number,
  scale: number,
  warnings: string[],
): number {
  const p = state.players[state.toAct!];
  const x = Math.round(a.amount! * scale);
  const asAdded = p.streetBet + x;
  const asTotal = x;
  if (p.streetBet === 0 || asAdded === asTotal) return x;
  const legal = getLegalActions(state)!;
  const totalLegal = asTotal >= legal.minRaiseTo || asTotal >= legal.maxRaiseTo;
  if (!totalLegal) return asAdded;
  // Cerca un call successivo nella stessa street, prima di altri rilanci.
  for (let j = k + 1; j < all.length && all[j].street === a.street; j++) {
    const b = all[j];
    if (b.type === 'raise' || b.type === 'bet') break;
    if (b.type === 'call' && b.amount !== undefined) {
      const caller = state.players.find((pl) => pl.name === b.name || pl.name === `${b.name} (tu)`);
      if (!caller) break;
      const callTo = caller.streetBet + Math.round(b.amount * scale);
      if (Math.abs(callTo - asAdded) <= 1) return asAdded;
      if (Math.abs(callTo - asTotal) <= 1) return asTotal;
      break;
    }
  }
  warnings.push('Importo di un rilancio ambiguo: interpretato come fiche aggiunte.');
  return asAdded;
}
