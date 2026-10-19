import type { PlayerAction } from '../engine/game';
import type { BankrollInfo } from './bankroll';
import { equityVsRanges, type WeightedRange } from './equity';
import { bluffBreakEven, callEV, checkEV, raiseEV, realizationFactor } from './evModel';
import { boardTexture, classifyHand, exactHitProbability, ruleOf2and4, type HandInfo } from './handClass';
import { roundChips, type DecisionContext } from './situation';
import type { AdviceAction, Candidate, ConceptId, Reason, SpotTag } from './types';
import { estimateVillainRange, splitByContinuation, type VillainRange } from './villainRange';
import type { PartialAdvice } from './preflopAdvisor';

const BET_SIZES = [0.33, 0.5, 0.75, 1];

function fmtBB(chips: number, bb: number): string {
  return `${(chips / bb).toFixed(1).replace('.0', '').replace('.', ',')} bb`;
}

export function postflopAdvice(ctx: DecisionContext, br: BankrollInfo): PartialAdvice & { handInfo: HandInfo } {
  const { me, bb, pot: P, toCall, board, state } = ctx;
  const river = board.length === 5;
  const info = classifyHand(me.hole, board);
  const tex = boardTexture(board);
  const villains: VillainRange[] = ctx.opponents.map((o) => estimateVillainRange(state, o.seat, me.hole));
  const ranges = villains.map((v) => v.range);
  const eq = equityVsRanges(me.hole, board, ranges, 3000, 61).equity;
  const R = river ? 1 : realizationFactor(ctx.inPosition, villains.length, 'postflop');
  const reasons: Reason[] = [];
  const assumptions: string[] = [];
  const concepts: ConceptId[] = [];
  const candidates: Candidate[] = [];
  const heroBehind = me.stack;

  // --- valutazione di una puntata/rilancio a un importo qualsiasi ---
  const cache = new Map<number, Candidate>();
  const evalRaise = (to: number): Candidate => {
    to = Math.max(ctx.legal.minRaiseTo, Math.min(ctx.legal.maxRaiseTo, to));
    const hit = cache.get(to);
    if (hit) return hit;
    const H = to - me.streetBet;
    const vsRaise = toCall > 0;
    // Dimensione percepita dal punto di vista di chi deve rispondere.
    const f = H / Math.max(1, P);
    let fe = 1;
    const continuing: WeightedRange[] = [];
    let expectedCallChips = 0;
    villains.forEach((v) => {
      const opp = state.players[v.seat];
      const split = splitByContinuation(v.range, board, f, vsRaise);
      fe *= split.foldEquity;
      if (split.continuing.length) continuing.push(split.continuing);
      const add = Math.max(0, Math.min(to, opp.stack + opp.streetBet) - opp.streetBet);
      expectedCallChips += (1 - split.foldEquity) * add;
    });
    const pCall = 1 - fe;
    const V = pCall > 0.001 ? expectedCallChips / pCall / Math.max(1, villains.length > 1 ? 1.4 : 1) : 0;
    const eqc = continuing.length ? equityVsRanges(me.hole, board, continuing, 1500, 62 + to).equity : eq;
    const allIn = to >= ctx.legal.maxRaiseTo;
    const ev = raiseEV(P, H, V, fe, eqc, allIn || river ? 1 : Math.min(1, R + 0.05));
    const action: AdviceAction = allIn ? 'allin' : ctx.legal.raiseType;
    const sizeFrac = toCall > 0 ? (to - state.currentBet) / (P + toCall) : H / P;
    const c: Candidate = {
      action,
      amount: to,
      size: sizeFrac,
      label: allIn
        ? `All-in (${fmtBB(to, bb)})`
        : `${action === 'bet' ? 'Punta' : 'Rilancia a'} ${fmtBB(to, bb)} (${Math.round(sizeFrac * 100)}% del piatto)`,
      ev,
      foldEquity: fe,
      equityWhenCalled: eqc,
    };
    cache.set(to, c);
    return c;
  };

  // --- candidati ---
  let callCandidate: Candidate | null = null;
  let impliedBonus = 0;
  if (toCall === 0) {
    candidates.push({ action: 'check', label: 'Check', ev: checkEV(eq, P, R) });
    if (ctx.legal.canRaise) {
      for (const f of BET_SIZES) candidates.push(evalRaise(roundChips(P * f, bb)));
      if (heroBehind <= 2.5 * P) candidates.push(evalRaise(ctx.legal.maxRaiseTo));
    }
  } else {
    candidates.push({ action: 'fold', label: 'Fold', ev: 0 });
    const allInCall = toCall >= me.stack || ctx.opponents.every((o) => o.allIn || o.stack === 0);
    const Rc = river || allInCall ? 1 : R;
    let evC = callEV(eq, P, toCall, Rc);
    // Odds implicite: con un progetto e stack profondi si può vincere di più quando si chiude.
    if (!river && !allInCall && info.draws.outs >= 4) {
      const unseen = 52 - 2 - board.length;
      const hit = exactHitProbability(info.draws.outs, unseen, 1);
      const remaining = Math.min(me.stack - toCall, Math.max(...ctx.opponents.map((o) => o.stack)));
      impliedBonus = hit * Math.min(remaining, P + toCall) * 0.3;
      evC += impliedBonus;
    }
    callCandidate = { action: 'call', label: `Call ${fmtBB(toCall, bb)}`, ev: evC };
    candidates.push(callCandidate);
    if (ctx.legal.canRaise) {
      candidates.push(evalRaise(roundChips(ctx.state.currentBet * 3, bb)));
      // L'all-in è una linea standard solo se non è un overbet enorme rispetto al piatto.
      if (ctx.legal.maxRaiseTo - me.streetBet <= 3 * (P + toCall)) candidates.push(evalRaise(ctx.legal.maxRaiseTo));
    }
  }

  // --- bankroll corto: prudenza sulle giocate che mettono a rischio lo stack ---
  let best = candidates.reduce((a, b) => (b.ev > a.ev ? b : a));
  // Robustezza: un bluff puro (quasi zero equity se chiamato) si consiglia solo se batte con margine
  // la miglior linea passiva, perché il suo valore dipende tutto dalla fold equity stimata.
  const passive = candidates.filter((c) => c.action === 'fold' || c.action === 'check' || c.action === 'call');
  if (passive.length && (best.equityWhenCalled ?? 1) < 0.3) {
    const passiveBest = passive.reduce((a, b) => (b.ev > a.ev ? b : a));
    if (best.ev - passiveBest.ev < Math.max(0.5 * bb, 0.08 * P)) best = passiveBest;
  }
  if (br.varianceMargin > 0 && (best.action === 'allin' || (best.action === 'call' && toCall >= 0.5 * (me.stack + me.streetBet)))) {
    const risk = best.action === 'call' ? toCall : (best.amount ?? 0) - me.streetBet;
    const evPerRisk = best.ev / Math.max(1, risk);
    if (evPerRisk < br.varianceMargin) {
      const safer = candidates.filter((c) => c !== best && c.action !== 'allin' && !(c.action === 'call' && toCall >= 0.5 * me.stack));
      if (safer.length) {
        reasons.push({ code: 'bankroll', level: br.label, margin: br.varianceMargin, evPerRisk });
        concepts.push('bankroll');
        best = safer.reduce((a, b) => (b.ev > a.ev ? b : a));
      }
    }
  }

  // --- spot e motivazioni ---
  const isDraw = info.bucket === 'draw' || info.bucket === 'strongDraw';
  let spot: SpotTag;
  if (toCall > 0) spot = isDraw ? 'postflop-draw' : 'postflop-call';
  else if (info.bucket === 'monster' || info.bucket === 'strong') spot = 'postflop-value';
  else if (isDraw) spot = 'postflop-draw';
  else if (info.bucket === 'medium') spot = 'postflop-medium';
  else spot = 'postflop-bluff';

  reasons.push({ code: 'hand', description: info.description, bucket: info.bucket });
  reasons.push({ code: 'board', description: tex.description });
  reasons.push({
    code: 'equity-vs-range',
    equity: eq,
    villainLabel: villains.map((v) => v.preflopLabel).join(' + '),
  });
  concepts.push('equity');

  if (toCall > 0) {
    reasons.push({ code: 'pot-odds', toCall, pot: P, required: toCall / (P + toCall), equity: eq, realization: river ? 1 : R });
    concepts.push('pot-odds');
  }
  if (!river && info.draws.outs >= 4) {
    const streetsToCome: 1 | 2 = board.length === 3 && toCall === 0 ? 2 : 1;
    const unseen = 52 - 2 - board.length;
    reasons.push({
      code: 'outs',
      outs: info.draws.outs,
      flushOuts: info.draws.flushOuts,
      straightOuts: info.draws.straightOuts,
      ruleEstimate: ruleOf2and4(info.draws.outs, streetsToCome) / 100,
      exact: exactHitProbability(info.draws.outs, unseen, streetsToCome),
      streetsToCome,
    });
    concepts.push('outs');
    if (toCall > 0) {
      const extraNeeded = Math.max(0, toCall / Math.max(0.01, eq) - (P + toCall));
      reasons.push({ code: 'implied-odds', extraNeeded, effStack: ctx.effectiveStack, worthIt: impliedBonus > 0 && extraNeeded < 0.5 * ctx.effectiveStack });
      concepts.push('implied-odds');
    }
  }
  if (best.action === 'bet' || best.action === 'raise' || best.action === 'allin') {
    if (info.bucket === 'monster' || info.bucket === 'strong' || (!isDraw && (best.equityWhenCalled ?? 0) > 0.5)) {
      reasons.push({ code: 'value', handDesc: info.description, equityWhenCalled: best.equityWhenCalled ?? eq, size: best.size ?? 0 });
      concepts.push('value-bet', 'sizing');
    } else if (isDraw) {
      reasons.push({ code: 'semi-bluff', foldEquity: best.foldEquity ?? 0, outs: info.draws.outs });
      concepts.push('semi-bluff', 'fold-equity');
    } else {
      const H = (best.amount ?? 0) - me.streetBet;
      reasons.push({ code: 'bluff', foldEquity: best.foldEquity ?? 0, breakEven: bluffBreakEven(H, P), size: best.size ?? 0 });
      concepts.push('bluff', 'fold-equity');
    }
  } else if (best.action === 'check') {
    if (info.bucket === 'medium' || info.bucket === 'weak') {
      reasons.push({ code: 'pot-control', handDesc: info.description });
    } else if (info.bucket === 'air') {
      const b = candidates.find((c) => c.action === 'bet' && Math.abs((c.size ?? 0) - 0.5) < 0.1) ?? candidates[1];
      if (b) {
        reasons.push({ code: 'give-up', handDesc: info.description, foldEquity: b.foldEquity ?? 0, breakEven: bluffBreakEven((b.amount ?? 0) - me.streetBet, P) });
        concepts.push('fold-equity');
      }
    } else if (info.bucket === 'monster' || info.bucket === 'strong') {
      reasons.push({ code: 'pot-control', handDesc: info.description });
    }
  }
  if (ctx.spr < 4 && (info.bucket === 'monster' || info.bucket === 'strong')) {
    reasons.push({ code: 'spr', spr: ctx.spr, strongHand: true });
    concepts.push('spr');
  } else if (ctx.spr > 10 && info.category === 1 && info.usesHole && (best.action === 'allin' || toCall > 0.5 * me.stack)) {
    reasons.push({ code: 'spr', spr: ctx.spr, strongHand: false });
    concepts.push('spr');
  }
  if (villains.length > 1) reasons.push({ code: 'multiway', opponents: villains.length });
  const mainVillain = ctx.opponents.find((o) => o.seat === ctx.streetLog.filter((a) => a.type === 'bet' || a.type === 'raise').pop()?.seat) ?? ctx.opponents[0];
  if (mainVillain?.botStyle) reasons.push({ code: 'villain-style', style: mainVillain.botStyle, name: mainVillain.name });

  assumptions.push(
    `Range stimato: ${villains.map((v) => `${state.players[v.seat].name} → ${v.preflopLabel}${v.notes.length ? `; ${v.notes.join('; ')}` : ''}`).join(' | ')}.`,
  );
  assumptions.push('EV calcolato con un modello a una street (fold equity stimata + equity contro le mani che continuano): è un\'approssimazione.');

  const evaluate = (a: PlayerAction): Candidate => {
    if (a.type === 'fold') return candidates.find((c) => c.action === 'fold') ?? { action: 'fold', label: 'Fold', ev: 0 };
    if (a.type === 'check') return candidates.find((c) => c.action === 'check')!;
    if (a.type === 'call') return callCandidate ?? candidates.find((c) => c.action === 'check')!;
    return evalRaise(a.amount ?? ctx.legal.minRaiseTo);
  };

  return {
    spot, candidates, best, equity: eq, villains, reasons, assumptions, concepts,
    evMode: 'absolute', evaluate, handInfo: info,
  };
}
