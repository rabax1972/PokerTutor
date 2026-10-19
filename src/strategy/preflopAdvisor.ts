import { isForcedPost, type PlayerAction } from '../engine/game';
import type { BankrollInfo } from './bankroll';
import { equityVsRanges, weightedFromCodes } from './equity';
import { callEV, checkEV, raiseEV, realizationFactor } from './evModel';
import { handCode, type HandCode } from './handNotation';
import {
  ALLIN_RANKING,
  handPercentile,
  isoRaiseRange,
  openerClass,
  playersBehind,
  pushRange,
  rfiRange,
  topPercent,
  vsFourBetRanges,
  vsOpenRanges,
  vsThreeBetRanges,
  type NamedRange,
} from './ranges';
import { preflopRaiseTo, standardPreflopSize, type DecisionContext } from './situation';
import type { AdviceAction, Candidate, ConceptId, Reason, SpotTag } from './types';
import { estimateVillainRange, preflopContinuing, type VillainRange } from './villainRange';

export interface PartialAdvice {
  spot: SpotTag;
  candidates: Candidate[];
  best: Candidate;
  equity: number | null;
  villains: VillainRange[];
  referenceRange?: { label: string; text: string; percent: number; contains: boolean; codes: HandCode[] };
  reasons: Reason[];
  assumptions: string[];
  concepts: ConceptId[];
  /** 'absolute': EV calcolati; 'relative': perdite stimate rispetto alla giocata da range. */
  evMode: 'absolute' | 'relative';
  /** Valuta una giocata qualsiasi (anche con importi non standard). */
  evaluate: (a: PlayerAction) => Candidate;
}

const PREMIUM: HandCode[] = ['AA', 'KK', 'QQ', 'AKs', 'AKo'];

function label(action: AdviceAction, amount: number | undefined, bb: number): string {
  const x = amount !== undefined ? `${(amount / bb).toFixed(1).replace('.0', '').replace('.', ',')} bb` : '';
  switch (action) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return 'Call';
    case 'bet': return `Punta ${x}`;
    case 'raise': return `Rilancia a ${x}`;
    case 'allin': return `All-in (${x})`;
  }
}

function toAdviceAction(ctx: DecisionContext, a: PlayerAction): AdviceAction {
  if ((a.type === 'bet' || a.type === 'raise') && (a.amount ?? 0) >= ctx.legal.maxRaiseTo) return 'allin';
  if (a.type === 'call' && ctx.toCall >= ctx.me.stack) return 'call';
  return a.type;
}

export function preflopAdvice(ctx: DecisionContext, br: BankrollInfo): PartialAdvice {
  const { me, bb, preflop: pf, state } = ctx;
  const code = handCode(me.hole[0], me.hole[1]);
  const pctl = handPercentile(code);
  const startBB = (me.stack + me.streetBet) / bb;
  const effBB = Math.min(startBB, Math.max(...ctx.opponents.map((o) => (o.stack + o.streetBet) / bb)));
  const reasons: Reason[] = [];
  const assumptions: string[] = [];
  const concepts: ConceptId[] = [];

  // Avversari coinvolti: chi ha già messo fiches volontariamente (o è all-in).
  const involved = ctx.opponents.filter((o) =>
    state.log.some((a) => a.seat === o.seat && a.street === 'preflop' && (a.type === 'raise' || a.type === 'call')),
  );
  const villains = involved.map((o) => estimateVillainRange(state, o.seat, me.hole));
  const facingAllIn = ctx.opponents.some((o) => o.allIn && o.streetBet > me.streetBet);
  const committing = ctx.toCall > 0 && ctx.toCall >= 0.4 * me.stack;

  if (ctx.toCall > 0 && (facingAllIn || committing) && villains.length > 0) {
    return allInSpot(ctx, br, code, villains, reasons, assumptions, concepts);
  }
  if (effBB <= 12 && (pf.kind === 'unopened' || pf.kind === 'limped')) {
    return pushFoldSpot(ctx, br, code, effBB, villains, reasons, assumptions, concepts);
  }
  return chartSpot(ctx, code, pctl, villains, reasons, assumptions, concepts);
}

// ---------------------------------------------------------------------------
// All-in: decisione puramente matematica (equity contro range vs pot odds).

function allInSpot(
  ctx: DecisionContext, br: BankrollInfo, code: HandCode, villains: VillainRange[],
  reasons: Reason[], assumptions: string[], concepts: ConceptId[],
): PartialAdvice {
  const { me, bb, pot, toCall } = ctx;
  const eq = equityVsRanges(me.hole, [], villains.map((v) => v.range), 4000, 31).equity;
  const allInCall = toCall >= me.stack || ctx.opponents.every((o) => o.allIn || o.folded || o.stack === 0);
  const R = allInCall ? 1 : 0.92;
  const evCall = callEV(eq, pot, toCall, R);
  const candidates: Candidate[] = [
    { action: 'fold', label: 'Fold', ev: 0 },
    { action: 'call', label: `Call ${(toCall / bb).toFixed(1).replace('.', ',')} bb`, ev: evCall },
  ];
  let jamCandidate: Candidate | undefined;
  if (ctx.legal.canRaise) {
    const to = ctx.legal.maxRaiseTo;
    const H = to - me.streetBet;
    const main = ctx.opponents.find((o) => o.seat === ctx.preflop.lastRaiserSeat) ?? ctx.opponents[0];
    const V = Math.min(to, main.stack + main.streetBet) - main.streetBet;
    // Chi ha già investito molto rispetto al piatto finale chiama quasi sempre: la quota di range che
    // continua dipende dall'equity che gli serve per chiamare.
    const required = V / Math.max(1, pot + H + V);
    const keep = Math.max(0.3, Math.min(0.95, 1.2 - 1.6 * required));
    const cont = preflopContinuing(villains[0].range, keep);
    const eqc = equityVsRanges(me.hole, [], [cont.continuing], 2500, 32).equity;
    jamCandidate = { action: 'allin', amount: to, label: label('allin', to, bb), ev: raiseEV(pot, H, V, cont.foldEquity, eqc, 1), foldEquity: cont.foldEquity, equityWhenCalled: eqc };
    candidates.push(jamCandidate);
  }
  let best = candidates.reduce((a, b) => (b.ev > a.ev ? b : a));
  reasons.push({ code: 'equity-vs-range', equity: eq, villainLabel: villains.map((v) => v.preflopLabel).join(' + ') });
  reasons.push({ code: 'pot-odds', toCall, pot, required: toCall / (pot + toCall), equity: eq, realization: R });
  concepts.push('pot-odds', 'equity');

  // Bankroll corto: evita di rischiare lo stack per un vantaggio minimo.
  if (best.action !== 'fold' && br.varianceMargin > 0) {
    const risk = best.action === 'call' ? toCall : (best.amount ?? 0) - me.streetBet;
    const evPerRisk = best.ev / Math.max(1, risk);
    if (risk >= 0.5 * (me.stack + me.streetBet) && evPerRisk < br.varianceMargin) {
      reasons.push({ code: 'bankroll', level: br.label, margin: br.varianceMargin, evPerRisk });
      concepts.push('bankroll');
      best = candidates[0];
    }
  }
  if (PREMIUM.includes(code)) reasons.push({ code: 'premium', hand: code });
  assumptions.push(`Range dell'avversario stimato: ${villains.map((v) => v.preflopLabel).join('; ')}.`);
  if (!allInCall) assumptions.push('Il calcolo considera solo la mano attuale: con fiches ancora dietro, il gioco postflop può cambiare un po\' i numeri.');

  const evaluate = (a: PlayerAction): Candidate => {
    const kind = toAdviceAction(ctx, a);
    if (kind === 'fold' || kind === 'check') return candidates[0];
    if (kind === 'call') return candidates[1];
    if (jamCandidate) return jamCandidate;
    return candidates[1];
  };
  return {
    spot: 'call-allin', candidates, best, equity: eq, villains, reasons, assumptions, concepts,
    evMode: 'absolute', evaluate,
  };
}

// ---------------------------------------------------------------------------
// Push/fold con stack corto.

function pushFoldSpot(
  ctx: DecisionContext, br: BankrollInfo, code: HandCode, effBB: number, villains: VillainRange[],
  reasons: Reason[], assumptions: string[], concepts: ConceptId[],
): PartialAdvice {
  const { me, bb, pot, state, numPlayers: n } = ctx;
  const range = pushRange(me.position, n, effBB);
  const inRange = range.codes.has(code);
  // Chi può ancora chiamare: giocatori dopo di noi non ancora intervenuti + limper.
  const acted = new Set(state.log.filter((a) => a.street === 'preflop' && !isForcedPost(a)).map((a) => a.seat));
  const potentialCallers = ctx.opponents.filter((o) => !acted.has(o.seat) || villains.some((v) => v.seat === o.seat));
  const callPct = (pos: string) => Math.min(40, Math.max(8, 8 + 110 / effBB)) * (pos === 'BB' ? 1.25 : 1);
  let fe = 1;
  let maxPct = 8;
  for (const o of potentialCallers) {
    const pc = callPct(o.position);
    fe *= 1 - pc / 100;
    maxPct = Math.max(maxPct, pc);
  }
  const callRange = weightedFromCodes(topPercent(maxPct, ALLIN_RANKING), me.hole);
  const eqc = equityVsRanges(me.hole, [], [callRange], 3000, 41).equity;
  const to = ctx.legal.maxRaiseTo;
  const H = to - me.streetBet;
  const V = Math.max(0, Math.min(to, Math.max(...potentialCallers.map((o) => o.stack + o.streetBet), 0)) - bb);
  const evPush = raiseEV(pot, H, V, fe, eqc, 1);
  const candidates: Candidate[] = [];
  if (ctx.legal.canCheck) {
    const eqCheck = villains.length ? equityVsRanges(me.hole, [], villains.map((v) => v.range), 2000, 42).equity : 0.5;
    candidates.push({ action: 'check', label: 'Check', ev: checkEV(eqCheck, pot, 0.8) });
  } else candidates.push({ action: 'fold', label: 'Fold', ev: 0 });
  const pushC: Candidate = { action: 'allin', amount: to, label: label('allin', to, bb), ev: evPush, foldEquity: fe, equityWhenCalled: eqc };
  candidates.push(pushC);
  // La decisione segue il range push/fold di riferimento; l'EV serve a misurare l'errore.
  let best = inRange ? pushC : candidates[0];
  if (inRange && evPush < candidates[0].ev - 0.3 * bb) best = candidates[0];
  if (!inRange && evPush > candidates[0].ev + 0.3 * bb) best = pushC;

  reasons.push({ code: 'push-fold', stackBB: effBB, inRange, rangePercent: range.percent });
  reasons.push({ code: 'range', inRange, rangeLabel: range.label, rangeText: range.text, rangePercent: range.percent, hand: code, handPercentile: handPercentile(code, ALLIN_RANKING), action: 'all-in' });
  concepts.push('push-fold', 'fold-equity', 'spr');
  assumptions.push(`Si assume che gli avversari chiamino l'all-in con circa il ${Math.round(maxPct)}% migliore delle mani.`);
  void br;

  const evaluate = (a: PlayerAction): Candidate => {
    const kind = toAdviceAction(ctx, a);
    if (kind === 'allin') return pushC;
    if (kind === 'fold' || kind === 'check') return candidates[0];
    if (kind === 'call') {
      // Limp con stack corto: in genere peggio di push o fold.
      return { action: 'call', label: 'Limp (call)', ev: Math.max(candidates[0].ev, evPush) - 0.35 * bb };
    }
    const amt = a.amount ?? 0;
    return { action: 'raise', amount: amt, label: label('raise', amt, bb), ev: Math.max(evPush, candidates[0].ev) - 0.3 * bb };
  };
  return {
    spot: 'push-fold', candidates, best, equity: eqc, villains,
    referenceRange: { label: range.label, text: range.text, percent: range.percent, contains: inRange, codes: [...range.codes] },
    reasons, assumptions, concepts, evMode: 'absolute', evaluate,
  };
}

// ---------------------------------------------------------------------------
// Situazioni "da range": apertura, limp, risposta a rilanci.

type ChartAction = 'fold' | 'check' | 'call' | 'raise';

function chartSpot(
  ctx: DecisionContext, code: HandCode, pctl: number, villains: VillainRange[],
  reasons: Reason[], assumptions: string[], concepts: ConceptId[],
): PartialAdvice {
  const { me, bb, pot, toCall, preflop: pf, numPlayers: n } = ctx;
  let spot: SpotTag;
  let raiseRange: NamedRange;
  let callRange: NamedRange | null = null;
  let chart: ChartAction;

  const stdTo = preflopRaiseTo(ctx, standardPreflopSize(ctx));
  const behind = playersBehind(me.position, n);

  switch (pf.kind) {
    case 'unopened': {
      spot = 'preflop-open';
      raiseRange = rfiRange(me.position, n);
      chart = raiseRange.codes.has(code) ? 'raise' : 'fold';
      reasons.push({ code: 'position', position: me.position, behind, numPlayers: n });
      concepts.push('range-position', 'position');
      if (n <= 4 || n >= 7) { reasons.push({ code: 'table-size', numPlayers: n }); concepts.push('table-size'); }
      break;
    }
    case 'limped': {
      spot = 'preflop-vs-limp';
      raiseRange = isoRaiseRange(me.position, n);
      chart = raiseRange.codes.has(code) ? 'raise' : ctx.legal.canCheck ? 'check' : 'fold';
      reasons.push({ code: 'sizing-preflop', recommendedBB: stdTo / bb, limpers: pf.limpers });
      concepts.push('range-position', 'sizing');
      break;
    }
    case 'vsOpen': {
      const opener = pf.openerPos ?? 'CO';
      const r = vsOpenRanges(me.position, opener, n);
      raiseRange = r.threeBet;
      callRange = r.call;
      spot = me.position === 'BB' ? 'bb-defense' : 'preflop-vs-open';
      chart = r.threeBet.codes.has(code) ? 'raise' : r.call.codes.has(code) ? 'call' : 'fold';
      concepts.push(me.position === 'BB' ? 'bb-defense' : 'three-bet', 'pot-odds');
      reasons.push({ code: 'position', position: me.position, behind, numPlayers: n, inPosition: ctx.inPosition });
      break;
    }
    case 'vs3bet': {
      const tbLate = pf.lastRaiserPos ? ['BTN', 'SB', 'BB', 'CO'].includes(pf.lastRaiserPos) : true;
      const r = vsThreeBetRanges(tbLate);
      raiseRange = r.fourBet;
      callRange = r.call;
      spot = 'preflop-vs-3bet';
      chart = r.fourBet.codes.has(code) ? 'raise' : r.call.codes.has(code) ? 'call' : 'fold';
      concepts.push('three-bet', 'pot-odds');
      break;
    }
    default: {
      const r = vsFourBetRanges();
      raiseRange = r.jam;
      callRange = ctx.effectiveStackBB > 60 ? r.call : null;
      spot = 'preflop-vs-4bet';
      chart = r.jam.codes.has(code) ? 'raise' : callRange?.codes.has(code) ? 'call' : 'fold';
      concepts.push('three-bet', 'spr');
      break;
    }
  }
  if (chart === 'fold' && ctx.legal.canCheck) chart = 'check';

  // Equity contro il range di chi ha già messo fiches (per spiegare call e 3-bet).
  let eq: number | null = null;
  let evCall: number | null = null;
  if (villains.length > 0) {
    eq = equityVsRanges(me.hole, [], villains.map((v) => v.range), 2500, 51).equity;
    if (toCall > 0) {
      const R = realizationFactor(ctx.inPosition, villains.length, 'preflop');
      evCall = callEV(eq, pot, toCall, R);
      reasons.push({ code: 'pot-odds', toCall, pot, required: toCall / (pot + toCall), equity: eq, realization: R });
    }
    reasons.push({ code: 'equity-vs-range', equity: eq, villainLabel: villains.map((v) => v.preflopLabel).join(' + ') });
    assumptions.push(`Range stimato: ${villains.map((v) => `${ctx.state.players[v.seat].name} → ${v.preflopLabel}`).join('; ')}.`);
  }

  reasons.unshift({
    code: 'range',
    inRange: chart === 'raise' || chart === 'call',
    rangeLabel: chart === 'call' && callRange ? callRange.label : raiseRange.label,
    rangeText: chart === 'call' && callRange ? callRange.text : raiseRange.text,
    rangePercent: chart === 'call' && callRange ? callRange.percent : raiseRange.percent,
    hand: code,
    handPercentile: pctl,
    action: pf.kind === 'unopened' ? 'apertura' : pf.kind === 'limped' ? 'rilancio di isolamento' : pf.kind === 'vsOpen' ? '3-bet' : pf.kind === 'vs3bet' ? '4-bet' : 'all-in',
  });
  if (PREMIUM.includes(code)) reasons.push({ code: 'premium', hand: code });
  if (chart === 'raise' && pf.kind === 'vsOpen') {
    const keep = { early: 0.6, middle: 0.5, late: 0.45, headsup: 0.45 }[openerClass(pf.openerPos ?? 'CO', n)];
    reasons.push({ code: 'three-bet-value', hand: code, foldEquity: 1 - keep });
  }
  assumptions.push('Range di riferimento semplificati per cash game (~100bb, apertura a 2,5bb): non sono soluzioni GTO.');

  // --- Valutazione delle giocate: perdita stimata rispetto al range (in bb) ---
  const threshold = raiseRange.percent;
  const callThreshold = callRange ? callRange.percent + threshold : threshold;
  const margin = (t: number) => Math.max(0, Math.min(1, (t - pctl) / Math.max(t, 1)));
  const excess = (t: number) => Math.max(0, Math.min(1, (pctl - t) / Math.max(t, 8)));
  const isPremium = PREMIUM.includes(code);

  /** Perdita (in bb) di una giocata rispetto a quella del range. */
  const lossOf = (act: ChartAction, userTo?: number): number => {
    if (act === chart) {
      if (act === 'raise' && userTo !== undefined) return sizingLoss(userTo);
      return 0;
    }
    const foldLike = act === 'fold' || act === 'check';
    switch (chart) {
      case 'raise':
        if (foldLike) return isPremium ? 3 + 2 * margin(threshold) : 0.15 + 1.6 * margin(threshold);
        if (act === 'call') return isPremium ? 1 : 0.15 + 0.9 * margin(threshold);
        return 0;
      case 'call':
        if (foldLike) return Math.max(0.1, evCall !== null ? evCall / bb : 0.3 * margin(callThreshold) + 0.1);
        // Rilanciare una mano da call: accettabile se vicina al range di rilancio.
        return pctl <= threshold * 1.8 ? 0.15 : 0.3 + 0.8 * excess(callThreshold);
      default: {
        // Il range dice fold/check.
        if (act === 'call') {
          if (pf.kind === 'unopened') return 0.25 + 0.6 * excess(threshold); // limp
          if (evCall !== null) return Math.max(0.1, -evCall / bb);
          return 0.3;
        }
        if (act === 'raise') {
          if (pctl <= threshold * 1.3) return 0.1;
          return 0.2 + 1.2 * excess(threshold) + (userTo !== undefined ? sizingLoss(userTo) : 0);
        }
        return 0;
      }
    }
  };

  const sizingLoss = (to: number): number => {
    const sizeBB = to / bb;
    const std = stdTo / bb;
    const stackBB = (me.stack + me.streetBet) / bb;
    if (sizeBB >= stackBB * 0.95 && stackBB > 25 && !isPremium) return 2.5; // all-in enorme senza motivo
    if (sizeBB > std * 1.7) return Math.min(1.5, 0.12 * (sizeBB - std * 1.7) + 0.2);
    if (sizeBB < std * 0.7 && pf.kind !== 'unopened') return 0.15;
    return 0;
  };

  const mk = (act: ChartAction, amount?: number): Candidate => {
    const action: AdviceAction = act === 'raise' ? (amount !== undefined && amount >= ctx.legal.maxRaiseTo ? 'allin' : 'raise') : act;
    return {
      action,
      amount: act === 'raise' ? amount : undefined,
      label: act === 'call' && pf.kind === 'unopened' ? 'Limp (call)' : act === 'call' ? 'Call' : label(action, amount, bb),
      ev: -lossOf(act, act === 'raise' ? amount : undefined) * bb,
    };
  };

  const candidates: Candidate[] = [];
  candidates.push(mk(ctx.legal.canCheck ? 'check' : 'fold'));
  if (toCall > 0 || pf.kind === 'unopened') candidates.push(mk('call'));
  if (ctx.legal.canRaise) candidates.push(mk('raise', stdTo));
  const best = candidates.find((c) => c.ev === 0 && (chart === 'raise' ? c.action === 'raise' || c.action === 'allin' : chart === 'call' ? c.action === 'call' : c.action === 'fold' || c.action === 'check')) ?? candidates[0];

  const evaluate = (a: PlayerAction): Candidate => {
    if (a.type === 'fold') return mk('fold');
    if (a.type === 'check') return mk('check');
    if (a.type === 'call') return mk('call');
    return mk('raise', a.amount);
  };

  return {
    spot, candidates, best, equity: eq, villains,
    referenceRange: {
      label: chart === 'call' && callRange ? callRange.label : raiseRange.label,
      text: chart === 'call' && callRange ? callRange.text : raiseRange.text,
      percent: chart === 'call' && callRange ? callRange.percent : raiseRange.percent,
      contains: chart === 'raise' || chart === 'call',
      codes: [...(chart === 'call' && callRange ? callRange.codes : raiseRange.codes)],
    },
    reasons, assumptions, concepts, evMode: 'relative', evaluate,
  };
}
