import type { GameState, PlayerAction } from '../engine/game';
import { createRng, type Rng } from '../engine/rng';
import { handCode } from '../strategy/handNotation';
import { handPercentile, rfiRange, vsOpenRanges, pushPercent, ALLIN_RANKING } from '../strategy/ranges';
import { classifyHand, BUCKET_SCORE } from '../strategy/handClass';
import {
  buildContext,
  preflopRaiseTo,
  sizeToAmount,
  standardPreflopSize,
  type DecisionContext,
} from '../strategy/situation';
import { BOT_PROFILES, type BotProfile, type BotStyle } from './profiles';

/** Decisione di un bot. Deterministica dato lo stato (RNG derivato dal seed della mano). */
export function decideBot(state: GameState): PlayerAction {
  const ctx = buildContext(state);
  if (!ctx) throw new Error('Nessun bot deve agire');
  const profile = BOT_PROFILES[(ctx.me.botStyle as BotStyle) ?? 'regular'] ?? BOT_PROFILES.regular;
  const rng = createRng((state.seed ^ (state.log.length * 2654435761)) >>> 0);
  const action = ctx.street === 'preflop' ? preflop(ctx, profile, rng) : postflop(ctx, profile, rng);
  return sanitize(ctx, action);
}

function sanitize(ctx: DecisionContext, a: PlayerAction): PlayerAction {
  const { legal } = ctx;
  if ((a.type === 'bet' || a.type === 'raise') && !legal.canRaise) {
    return legal.canCheck ? { type: 'check' } : { type: 'call' };
  }
  if (a.type === 'bet' || a.type === 'raise') {
    const amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, a.amount ?? legal.minRaiseTo));
    return { type: legal.raiseType, amount };
  }
  if (a.type === 'fold' && legal.canCheck) return { type: 'check' };
  if (a.type === 'check' && !legal.canCheck) return { type: 'fold' };
  if (a.type === 'call' && !legal.canCall) return { type: 'check' };
  return a;
}

const raise = (amount: number): PlayerAction => ({ type: 'raise', amount });
const call: PlayerAction = { type: 'call' };
const fold: PlayerAction = { type: 'fold' };
const check: PlayerAction = { type: 'check' };

function preflop(ctx: DecisionContext, prof: BotProfile, rng: Rng): PlayerAction {
  const { me, preflop: pf, numPlayers, legal, bb } = ctx;
  const code = handCode(me.hole[0], me.hole[1]);
  const pct = handPercentile(code);
  const effBB = ctx.effectiveStackBB + me.streetBet / bb;
  const jitter = 0.85 + rng() * 0.3;

  // Stack corti: push/fold.
  if (effBB <= 12 && (pf.kind === 'unopened' || pf.kind === 'limped')) {
    const pushPct = pushPercent(me.position, numPlayers, effBB) * prof.looseness * jitter;
    if (handPercentile(code, ALLIN_RANKING) <= pushPct) return raise(legal.maxRaiseTo);
    return legal.canCheck ? check : fold;
  }

  // Davanti a un all-in o a una puntata che impegna quasi tutto lo stack.
  const committing = ctx.toCall >= 0.5 * (me.stack + me.streetBet) && ctx.toCall > 2 * bb;
  if (committing) {
    const threshold = (ctx.potOdds < 0.35 ? 14 : ctx.potOdds < 0.42 ? 9 : 6) * prof.looseness * jitter;
    return handPercentile(code, ALLIN_RANKING) <= threshold ? call : fold;
  }

  switch (pf.kind) {
    case 'unopened': {
      if (me.position === 'BB') return check;
      const openPct = rfiRange(me.position, numPlayers).percent * prof.looseness * jitter;
      if (pct <= openPct) {
        // I passivi a volte entrano di limp.
        if (rng() > prof.aggression + 0.25 && me.position !== 'SB') return call;
        return raise(preflopRaiseTo(ctx, standardPreflopSize(ctx) + (prof.aggression > 0.7 ? 0.5 : 0)));
      }
      // Lo SB a volte completa con mani giocabili.
      if (me.position === 'SB' && pct <= openPct * 1.5 && rng() < 0.3) return call;
      return fold;
    }
    case 'limped': {
      const isoPct = rfiRange(me.position === 'BB' ? 'CO' : me.position, numPlayers).percent * 0.7 * prof.looseness;
      if (pct <= isoPct * prof.aggression * 1.4) return raise(preflopRaiseTo(ctx, standardPreflopSize(ctx)));
      if (legal.canCheck) return check;
      if (pct <= isoPct * 1.6 * prof.looseness) return call;
      return fold;
    }
    case 'vsOpen': {
      const ranges = vsOpenRanges(me.position, pf.openerPos ?? 'CO', numPlayers);
      const sizeFactor = Math.min(1.3, Math.max(0.5, 2.5 / Math.max(2, ctx.state.currentBet / bb)));
      const threeBetPct = ranges.threeBet.percent * (0.6 + prof.aggression * 0.8) * jitter;
      const continuePct = (ranges.threeBet.percent + ranges.call.percent) * prof.looseness * sizeFactor * jitter;
      if (pct <= threeBetPct) return raise(preflopRaiseTo(ctx, standardPreflopSize(ctx)));
      if (pct <= continuePct) return call;
      return fold;
    }
    case 'vs3bet': {
      if (pct <= 2.6 * (0.6 + prof.aggression)) return raise(preflopRaiseTo(ctx, standardPreflopSize(ctx)));
      if (pct <= 8 * prof.looseness * jitter) return call;
      return fold;
    }
    default: {
      if (pct <= 1.2 * (0.7 + prof.aggression)) return raise(legal.maxRaiseTo);
      if (pct <= 3 * prof.looseness) return call;
      return fold;
    }
  }
}

function postflop(ctx: DecisionContext, prof: BotProfile, rng: Rng): PlayerAction {
  const { me, board, toCall, pot, legal } = ctx;
  const info = classifyHand(me.hole, board);
  const score = BUCKET_SCORE[info.bucket];
  const r = rng();
  const multiway = ctx.opponents.length >= 2;
  const isRiver = board.length === 5;

  if (toCall === 0) {
    // Nessuna puntata da affrontare: bet o check.
    if (score >= 4) {
      if (r < 0.15 * (1 - prof.aggression)) return check; // slowplay occasionale
      return raise(sizeToAmount(ctx, score >= 5 ? 0.75 : 0.6));
    }
    if (score >= 3) {
      return r < prof.aggression * (multiway ? 0.3 : 0.6) ? raise(sizeToAmount(ctx, 0.45)) : check;
    }
    if (info.bucket === 'strongDraw' || info.bucket === 'draw') {
      return r < prof.aggression * 0.7 ? raise(sizeToAmount(ctx, 0.6)) : check;
    }
    // Aria: c-bet o bluff, meno frequente multiway.
    const wasAggressor = ctx.previousStreetAggressor === me.seat;
    const bluffFreq = prof.bluff * (wasAggressor ? 1.8 : 1) * (multiway ? 0.4 : 1) * (isRiver ? 0.8 : 1);
    return r < bluffFreq ? raise(sizeToAmount(ctx, wasAggressor ? 0.4 : 0.6)) : check;
  }

  // C'è una puntata da pareggiare.
  const betFraction = toCall / Math.max(1, pot - toCall);
  if (score >= 5) {
    return r < prof.aggression * 0.75 ? raise(sizeToAmount(ctx, 0.8)) : call;
  }
  if (score >= 4) {
    if (r < prof.aggression * 0.2 && !isRiver) return raise(sizeToAmount(ctx, 0.7));
    return betFraction <= 1.2 || r < prof.stickiness ? call : fold;
  }
  if (info.bucket === 'strongDraw' || info.bucket === 'draw') {
    const outs = info.draws.outs;
    const equity = board.length === 3 ? outs * 0.04 : outs * 0.02;
    // Considera un po' di odds implicite.
    if (r < prof.aggression * 0.3 && info.bucket === 'strongDraw') return raise(sizeToAmount(ctx, 0.8));
    return equity + 0.08 + prof.stickiness * 0.05 >= ctx.potOdds ? call : fold;
  }
  if (score >= 3) {
    const limit = 0.4 + prof.stickiness * 0.6;
    return betFraction <= limit || r < prof.stickiness * 0.4 ? call : fold;
  }
  if (score >= 1.5) {
    return betFraction <= 0.35 && r < prof.stickiness ? call : fold;
  }
  if (!isRiver && r < prof.bluff * 0.25 && legal.canRaise && !multiway) return raise(sizeToAmount(ctx, 1));
  return fold;
}
