import { type Card, rankOf, suitOf, RANK_NAMES_IT } from '../engine/cards';
import { evaluate, categoryOf, HandCategory, describeScore } from '../engine/evaluator';

/**
 * Fasce di forza di una mano su un board, dal punto di vista di chi la gioca.
 * - monster: set, doppia coppia con entrambe le carte, scala/colore/full o meglio
 * - strong: overpair, top pair con buon kicker, tris con una carta
 * - medium: top pair kicker debole, seconda coppia
 * - strongDraw / draw: progetti con molti/abbastanza outs (≥12 / 8-11)
 * - weak: coppie basse, asso alto, gutshot
 * - air: niente
 */
export type Bucket = 'monster' | 'strong' | 'medium' | 'strongDraw' | 'draw' | 'weak' | 'air';

export const BUCKET_SCORE: Record<Bucket, number> = {
  monster: 5,
  strong: 4,
  medium: 3,
  strongDraw: 2.8,
  draw: 2.2,
  weak: 1.5,
  air: 0.5,
};

export const BUCKET_LABEL_IT: Record<Bucket, string> = {
  monster: 'mano molto forte',
  strong: 'mano forte',
  medium: 'mano media',
  strongDraw: 'progetto forte',
  draw: 'progetto',
  weak: 'mano debole',
  air: 'niente (aria)',
};

export interface Draws {
  flushDraw: boolean;
  nutFlushDraw: boolean;
  oesd: boolean;
  gutshot: boolean;
  backdoorFlush: boolean;
  flushOuts: number;
  straightOuts: number;
  overcardOuts: number;
  /** Outs "pulite" totali stimate (colore + scala, senza doppi conteggi). */
  outs: number;
}

export interface HandInfo {
  category: HandCategory;
  madeName: string;
  bucket: Bucket;
  /** Descrizione didattica, es. "top pair con kicker debole". */
  description: string;
  draws: Draws;
  /** True se le carte coperte migliorano il board (altrimenti "gioca il board"). */
  usesHole: boolean;
}

export interface BoardTexture {
  paired: boolean;
  monotone: boolean;
  twoTone: boolean;
  /** Il board offre molti progetti di scala o colore. */
  wet: boolean;
  highCard: number;
  description: string;
}

export function boardTexture(board: readonly Card[]): BoardTexture {
  const ranks = board.map(rankOf).sort((a, b) => b - a);
  const suits = [0, 0, 0, 0];
  board.forEach((c) => suits[suitOf(c)]++);
  const maxSuit = Math.max(...suits);
  const paired = new Set(ranks).size < ranks.length;
  const uniq = [...new Set(ranks)];
  let connected = 0;
  for (let i = 0; i < uniq.length; i++)
    for (let j = i + 1; j < uniq.length; j++) if (Math.abs(uniq[i] - uniq[j]) <= 2) connected++;
  const monotone = board.length >= 3 && maxSuit >= 3;
  const twoTone = maxSuit === 2;
  const wet = monotone || (twoTone && connected >= 1) || connected >= 2;
  const parts: string[] = [];
  if (paired) parts.push('accoppiato');
  if (monotone) parts.push(board.length === 3 ? 'monocolore' : `con ${maxSuit} carte dello stesso seme`);
  else if (twoTone) parts.push('con due carte dello stesso seme');
  if (connected >= 2) parts.push('molto connesso');
  else if (connected === 1) parts.push('abbastanza connesso');
  const description = `${wet ? 'bagnato' : 'asciutto'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  return { paired, monotone, twoTone, wet, highCard: ranks[0] ?? 0, description };
}

function straightMaskTop(mask: number): number {
  const m = mask | (((mask >> 14) & 1) << 1);
  for (let top = 14; top >= 5; top--) {
    const need = 0b11111 << (top - 4);
    if ((m & need) === need) return top;
  }
  return 0;
}

function analyzeDraws(hole: readonly Card[], board: readonly Card[]): Draws {
  const res: Draws = {
    flushDraw: false, nutFlushDraw: false, oesd: false, gutshot: false, backdoorFlush: false,
    flushOuts: 0, straightOuts: 0, overcardOuts: 0, outs: 0,
  };
  if (board.length >= 5 || board.length < 3) return res;
  const all = [...hole, ...board];
  const known = new Set(all);
  const current = evaluate(all);
  const curCat = categoryOf(current);

  // Colore: 4 carte di un seme con almeno una carta coperta.
  for (let s = 0; s < 4; s++) {
    const heroSuited = hole.filter((c) => suitOf(c) === s).length;
    const total = all.filter((c) => suitOf(c) === s).length;
    if (heroSuited > 0 && total === 4 && curCat < HandCategory.Flush) {
      res.flushDraw = true;
      res.flushOuts = 13 - 4;
      const top = Math.max(...hole.filter((c) => suitOf(c) === s).map(rankOf));
      const boardRanks = board.filter((c) => suitOf(c) === s).map(rankOf);
      let nut = 14;
      while (boardRanks.includes(nut)) nut--;
      res.nutFlushDraw = top === nut;
    }
    if (board.length === 3 && heroSuited === 2 && total === 3) res.backdoorFlush = true;
  }

  // Scala: carte non viste che completano una scala usando almeno una carta coperta.
  if (curCat < HandCategory.Straight) {
    const boardMask = board.reduce((m, c) => m | (1 << rankOf(c)), 0);
    const allMask = all.reduce((m, c) => m | (1 << rankOf(c)), 0);
    const makingRanks: number[] = [];
    for (let r = 2; r <= 14; r++) {
      if (allMask & (1 << r)) continue;
      const withCard = allMask | (1 << r);
      const top = straightMaskTop(withCard);
      if (top && straightMaskTop(boardMask | (1 << r)) !== top) makingRanks.push(r);
    }
    let straightOuts = 0;
    for (const r of makingRanks)
      for (let s = 0; s < 4; s++) {
        const c = ((r - 2) << 2) | s;
        if (known.has(c)) continue;
        // Non contiamo due volte le carte che danno anche colore.
        if (res.flushDraw && hole.some((h) => suitOf(h) === s) && all.filter((x) => suitOf(x) === s).length === 4) continue;
        straightOuts++;
      }
    res.straightOuts = straightOuts;
    if (makingRanks.length >= 2) res.oesd = true;
    else if (makingRanks.length === 1) res.gutshot = true;
  }

  // Overcard: carte coperte più alte del board quando non abbiamo ancora una coppia.
  if (curCat === HandCategory.HighCard) {
    const boardTop = Math.max(...board.map(rankOf));
    res.overcardOuts = hole.filter((c) => rankOf(c) > boardTop).length * 3;
  }

  res.outs = res.flushOuts + res.straightOuts;
  return res;
}

const kickerOk = (k: number) => k >= 10;

/** Classifica la mano dell'eroe sul board (preflop restituisce una fascia neutra). */
export function classifyHand(hole: readonly Card[], board: readonly Card[]): HandInfo {
  const draws = analyzeDraws(hole, board);
  if (board.length < 3) {
    return {
      category: rankOf(hole[0]) === rankOf(hole[1]) ? HandCategory.Pair : HandCategory.HighCard,
      madeName: '', bucket: 'medium', description: 'preflop', draws, usesHole: true,
    };
  }
  const all = [...hole, ...board];
  const score = evaluate(all);
  const cat = categoryOf(score);
  const boardScore = evaluate(board);
  const boardCat = categoryOf(boardScore);
  // Le carte coperte contano se migliorano la categoria del board (o, al river, una scala/colore del board).
  const usesHole = cat > boardCat || (cat >= HandCategory.Straight && score > boardScore);
  const boardRanks = board.map(rankOf).sort((a, b) => b - a);
  const uniqBoard = [...new Set(boardRanks)];
  const [h1, h2] = hole.map(rankOf).sort((a, b) => b - a);
  const pocketPair = h1 === h2;
  const tex = boardTexture(board);

  let bucket: Bucket = 'air';
  let description = '';

  if (!usesHole) {
    bucket = h1 === 14 && boardCat <= HandCategory.Pair ? 'weak' : 'air';
    description = boardCat >= HandCategory.Pair
      ? `la combinazione (${describeScore(boardScore).toLowerCase()}) è sul board: giochi solo il kicker`
      : 'le tue carte non migliorano il board';
  } else if (cat >= HandCategory.Straight) {
    bucket = 'monster';
    description = describeScore(score).toLowerCase();
    // Scala su board con 4 carte dello stesso seme o colore basso su board monocolore: più vulnerabile.
    if (cat === HandCategory.Straight && tex.monotone) { bucket = 'strong'; description += ' (ma il board è monocolore)'; }
    if (cat === HandCategory.FullHouse && boardCat === HandCategory.Trips) {
      bucket = 'strong'; description += ' (il tris è sul board)';
    }
  } else if (cat === HandCategory.Trips) {
    if (pocketPair) { bucket = 'monster'; description = `set di ${RANK_NAMES_IT[h1]}`; }
    else { bucket = 'strong'; description = 'tris con una carta coperta (board accoppiato)'; }
  } else if (cat === HandCategory.TwoPair) {
    const holeInPairs = hole.filter((c) => boardRanks.includes(rankOf(c))).length;
    if (holeInPairs === 2 && h1 !== h2) {
      const topTwo = h1 === uniqBoard[0] && h2 === uniqBoard[1];
      bucket = topTwo || !tex.wet ? 'monster' : 'strong';
      description = topTwo ? 'doppia coppia (le due carte più alte)' : 'doppia coppia con entrambe le carte';
    } else if (pocketPair && boardCat === HandCategory.Pair) {
      // Coppia servita + board accoppiato: si valuta come la coppia in mano.
      bucket = h1 > uniqBoard[0] ? 'strong' : 'medium';
      description = h1 > uniqBoard[0] ? 'overpair (con board accoppiato)' : 'coppia in mano con board accoppiato';
    } else {
      // Una carta accoppia il board, l'altra coppia è sul board.
      const paired = hole.map(rankOf).find((r) => boardRanks.includes(r)) ?? 0;
      const kicker = hole.map(rankOf).find((r) => r !== paired) ?? 0;
      if (paired === uniqBoard[0]) {
        bucket = kickerOk(kicker) ? 'strong' : 'medium';
        description = `top pair (con board accoppiato), kicker ${kickerOk(kicker) ? 'buono' : 'debole'}`;
      } else { bucket = 'medium'; description = 'coppia media con board accoppiato'; }
    }
  } else if (cat === HandCategory.Pair) {
    if (pocketPair) {
      if (h1 > uniqBoard[0]) { bucket = 'strong'; description = `overpair (${RANK_NAMES_IT[h1]})`; }
      else if (uniqBoard.length > 1 && h1 > uniqBoard[1]) { bucket = 'medium'; description = 'coppia in mano tra la prima e la seconda carta del board'; }
      else { bucket = 'weak'; description = 'coppia in mano sotto il board (underpair)'; }
    } else {
      const paired = hole.map(rankOf).find((r) => boardRanks.includes(r)) ?? 0;
      const kicker = hole.map(rankOf).find((r) => r !== paired) ?? 0;
      if (paired === uniqBoard[0]) {
        const good = kickerOk(kicker) || kicker === 14;
        bucket = good ? 'strong' : 'medium';
        description = `top pair con kicker ${good ? 'buono' : 'debole'}`;
      } else if (paired === uniqBoard[1]) { bucket = 'medium'; description = 'seconda coppia'; }
      else { bucket = 'weak'; description = 'coppia bassa'; }
    }
  } else {
    bucket = h1 === 14 ? 'weak' : 'air';
    description = h1 === 14 ? 'solo asso alto' : 'carta alta';
  }

  // Sovrapposizione dei progetti (non al river).
  if (board.length < 5) {
    const outs = draws.outs;
    if (outs >= 12 && BUCKET_SCORE[bucket] < BUCKET_SCORE.strongDraw) {
      const d = draws.flushDraw && draws.straightOuts > 0 ? 'progetto di colore e di scala' : 'progetto forte';
      description = cat === HandCategory.Pair && usesHole ? `${description} + ${d}` : `${d} (${draws.outs} outs)`;
      bucket = 'strongDraw';
    } else if (outs >= 8 && BUCKET_SCORE[bucket] < BUCKET_SCORE.draw) {
      const d = draws.flushDraw ? 'progetto di colore' : 'progetto di scala bilaterale';
      description = bucket === 'weak' && cat === HandCategory.Pair ? `${description} + ${d}` : d;
      bucket = 'draw';
    } else if (outs >= 8 && (bucket === 'medium' || bucket === 'strong')) {
      description += draws.flushDraw ? ' + progetto di colore' : ' + progetto di scala';
    } else if (draws.gutshot && bucket === 'air') {
      bucket = 'weak';
      description = 'scala a incastro (gutshot)';
    }
  }

  return { category: cat, madeName: describeScore(score), bucket, description, draws, usesHole };
}

/** Regola del 2 e del 4: stima rapida della probabilità di chiudere il progetto. */
export function ruleOf2and4(outs: number, streetsToCome: 1 | 2): number {
  return Math.min(100, outs * (streetsToCome === 2 ? 4 : 2));
}

/** Probabilità esatta di colpire almeno uno degli outs. */
export function exactHitProbability(outs: number, unseen: number, streetsToCome: 1 | 2): number {
  if (streetsToCome === 1) return outs / unseen;
  return 1 - ((unseen - outs) / unseen) * ((unseen - 1 - outs) / (unseen - 1));
}
