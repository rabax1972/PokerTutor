import { cardsToString } from '../engine/cards';
import { isForcedPost, type GameState, type PlayerAction } from '../engine/game';
import { POSITION_LABELS_IT } from '../engine/positions';
import { BUCKET_LABEL_IT, type Bucket } from '../strategy/handClass';
import { describeHandCode } from '../strategy/handNotation';
import { GRADE_LABELS_IT, type Advice, type Reason, type Verdict } from '../strategy/types';
import { BIG_BLIND } from '../game/session';

const STREET_NAMES = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' } as const;

export function fbb(chips: number): string {
  const v = chips / BIG_BLIND;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  return `${s.replace('.', ',')} bb`;
}

export function fpct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Descrizione della situazione al momento della decisione. */
export function situationText(state: GameState, advice: Advice): string {
  const me = state.players.find((p) => p.isHero)!;
  const parts: string[] = [];
  parts.push(
    `${STREET_NAMES[advice.street]} · ${advice.numPlayers} giocatori. Hai ${cardsToString(me.hole)} (${describeHandCode(advice.heroCode)}) da ${POSITION_LABELS_IT[advice.position]}.`,
  );
  if (advice.board.length) parts.push(`Board: ${cardsToString(advice.board)}${advice.handInfo ? ` → ${advice.handInfo.description}` : ''}.`);
  const effBB = advice.effStackBB.toFixed(0);
  parts.push(
    `Piatto ${fbb(advice.pot)}${advice.toCall > 0 && advice.spot !== 'preflop-open' ? `, devi chiamare ${fbb(advice.toCall)}` : ''}. Stack effettivo ${effBB} bb${Number.isFinite(advice.spr) && advice.street !== 'preflop' ? `, SPR ${advice.spr.toFixed(1).replace('.', ',')}` : ''}.`,
  );
  const prior = state.log.filter(
    (a) => a.street === advice.street && !isForcedPost(a) && a.seat !== me.seat,
  );
  const relevant = prior.filter((a) => a.type !== 'fold');
  if (relevant.length) {
    parts.push(
      `Prima di te: ${relevant
        .map((a) => `${state.players[a.seat].name} (${state.players[a.seat].position}) ${shortAction(a.type, a.amount)}`)
        .join(', ')}.`,
    );
  } else if (advice.street === 'preflop' && prior.length) {
    parts.push('Tutti quelli prima di te hanno foldato.');
  }
  return parts.join(' ');
}

function shortAction(type: string, amount: number): string {
  switch (type) {
    case 'check': return 'check';
    case 'call': return 'call';
    case 'bet': return `punta ${fbb(amount)}`;
    case 'raise': return `rilancia a ${fbb(amount)}`;
    default: return type;
  }
}

export function userActionText(a: PlayerAction, state: GameState): string {
  const p = state.players[state.toAct!];
  const all = (a.amount ?? 0) >= p.stack + p.streetBet;
  switch (a.type) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return `Call ${fbb(Math.min(state.currentBet - p.streetBet, p.stack))}`;
    case 'bet': return all ? `All-in (${fbb(a.amount ?? 0)})` : `Punta ${fbb(a.amount ?? 0)}`;
    case 'raise': return all ? `All-in (${fbb(a.amount ?? 0)})` : `Rilancia a ${fbb(a.amount ?? 0)}`;
  }
}

const STYLE_TIPS: Record<string, (name: string) => string> = {
  tight: (n) => `${n} gioca tight: quando punta forte ha spesso una mano vera. I suoi bluff sono rari, i tuoi funzionano un po' di più.`,
  loose: (n) => `${n} gioca loose e chiama spesso: contro questo avversario conviene puntare per valore anche con mani medie e bluffare poco.`,
  aggressive: (n) => `${n} è aggressivo e bluffa spesso: le tue mani medie valgono di più come "bluff catcher".`,
  passive: (n) => `${n} è passivo: se punta o rilancia di solito ha una mano forte. Fai value bet, ma rispetta la sua aggressività.`,
  regular: (n) => `${n} gioca range standard: il consiglio vale così com'è.`,
};

/** Converte un motivo strutturato in una frase in italiano. */
export function reasonText(r: Reason, advice: Advice): string | null {
  switch (r.code) {
    case 'range':
      return r.inRange
        ? `${r.hand} rientra nel range di riferimento (${r.rangeLabel}: circa il ${Math.round(r.rangePercent)}% delle mani). È tra il ${Math.max(1, Math.round(r.handPercentile))}% di mani più forti.`
        : `${r.hand} è fuori dal range di riferimento per l'${r.action} (${r.rangeLabel}: circa il ${Math.round(r.rangePercent)}% delle mani). ${r.handPercentile >= 99 ? 'È una delle mani più deboli in assoluto.' : `Solo il ${Math.max(1, Math.round(100 - r.handPercentile))}% delle mani è peggiore.`}`;
    case 'position':
      if (advice.spot === 'preflop-open') {
        return r.behind <= 2
          ? `Da ${r.position} hai solo ${r.behind} ${r.behind === 1 ? 'giocatore' : 'giocatori'} dietro, e giocherai quasi sempre in posizione: puoi aprire molte mani.`
          : `Da ${r.position} restano ${r.behind} giocatori a parlare dopo di te: più avversari dietro significa più probabilità che qualcuno abbia una mano forte, e più piatti giocati fuori posizione. Per questo dalle prime posizioni si apre stretto.`;
      }
      if (r.inPosition !== undefined) {
        return r.inPosition
          ? 'Dopo il flop giocherai in posizione (parli per ultimo): realizzi meglio la tua equity e puoi difenderti più largo.'
          : 'Dopo il flop giocherai fuori posizione: realizzi meno la tua equity, quindi servono mani un po\' migliori per entrare.';
      }
      return null;
    case 'table-size':
      return r.numPlayers <= 4
        ? `Con soli ${r.numPlayers} giocatori i blind girano in fretta: aspettare solo mani premium costa troppo, i range si allargano.`
        : `A un tavolo pieno (${r.numPlayers} giocatori) è più probabile che qualcuno abbia una mano forte: serve più disciplina, soprattutto dalle prime posizioni.`;
    case 'pot-odds': {
      const eff = r.equity * r.realization;
      const ok = eff >= r.required;
      const real = r.realization < 0.99
        ? ` Giocando ${advice.inPosition ? 'multiway' : 'fuori posizione'} ne realizzi solo una parte (circa ${fpct(eff)} effettivo).`
        : '';
      return `Pot odds: devi chiamare ${fbb(r.toCall)} per vincere un piatto di ${fbb(r.pot + r.toCall)}, quindi ti serve almeno il ${fpct(r.required)} di equity. Contro il range stimato ne hai circa il ${fpct(r.equity)}.${real} ${ok ? 'Il prezzo è giusto per continuare.' : 'Il prezzo è troppo alto per chiamare.'}`;
    }
    case 'implied-odds':
      if (r.extraNeeded <= 0) return null;
      return r.worthIt
        ? `Odds implicite: ti servono circa ${fbb(r.extraNeeded)} extra nelle street successive per rendere il call profittevole. Con uno stack effettivo di ${fbb(r.effStack)} è realistico ottenerli quando chiudi il progetto.`
        : `Odds implicite: ti servirebbero circa ${fbb(r.extraNeeded)} extra nelle street successive. Con lo stack effettivo di ${fbb(r.effStack)} è difficile recuperarli.`;
    case 'outs': {
      const detail = [r.flushOuts ? `${r.flushOuts} per il colore` : '', r.straightOuts ? `${r.straightOuts} per la scala` : ''].filter(Boolean).join(' e ');
      return `Hai ${r.outs} outs${detail ? ` (${detail})` : ''}. Regola del ${r.streetsToCome === 2 ? '4' : '2'}: ${r.outs} × ${r.streetsToCome === 2 ? 4 : 2} ≈ ${fpct(r.ruleEstimate)} di chiudere ${r.streetsToCome === 2 ? 'entro il river' : 'alla prossima carta'} (valore esatto ${fpct(r.exact)}).`;
    }
    case 'spr':
      return r.strongHand
        ? `SPR basso (${r.spr.toFixed(1).replace('.', ',')}): con una mano forte sei già "impegnato". Mettere i soldi dentro è corretto: non c'è spazio per giocare in modo sofisticato.`
        : `SPR alto (${r.spr.toFixed(1).replace('.', ',')}): con una sola coppia rischiare tutto lo stack è pericoloso, perché chi mette tanti soldi dentro di solito batte una coppia.`;
    case 'value':
      return `Value bet: con ${r.handDesc} sei avanti a molte mani che possono pagarti (quando vieni chiamato hai circa il ${fpct(r.equityWhenCalled)} di equity). Punta circa il ${Math.round(r.size * 100)}% del piatto.`;
    case 'bluff':
      return `Bluff: la tua mano vince raramente allo showdown, ma una puntata di circa il ${Math.round(r.size * 100)}% del piatto è in pari se l'avversario folda almeno il ${fpct(r.breakEven)} delle volte. Stimiamo che foldi il ${fpct(r.foldEquity)}.`;
    case 'semi-bluff':
      return `Semi-bluff: puntando vinci subito se l'avversario folda (fold equity stimata ${fpct(r.foldEquity)}). Se chiama, hai ancora ${r.outs} outs per migliorare.`;
    case 'pot-control':
      return `Con ${r.handDesc} batti i bluff ma perdi contro le mani forti: un check controlla il piatto e ti porta allo showdown spendendo poco.`;
    case 'give-up':
      return `Con ${r.handDesc} un bluff qui non rende: per andare in pari l'avversario dovrebbe foldare il ${fpct(r.breakEven)} delle volte, ma ne stimiamo il ${fpct(r.foldEquity)}. Meglio rinunciare.`;
    case 'push-fold':
      return `Con circa ${Math.round(r.stackBB)} bb effettivi conviene il push/fold: un rilancio normale ti impegnerebbe già buona parte dello stack. Da questa posizione si va all-in con circa il ${Math.round(r.rangePercent)}% delle mani.`;
    case 'bankroll':
      return `Bankroll ${r.level.toLowerCase()}: questa giocata rende in media solo il ${(r.evPerRisk * 100).toFixed(1).replace('.', ',')}% di quanto rischi. Con un bankroll corto un all-in per un vantaggio così piccolo aumenta troppo il rischio di rovina: scegli la linea prudente.`;
    case 'villain-style':
      return STYLE_TIPS[r.style]?.(r.name) ?? null;
    case 'multiway':
      return `Sei contro ${r.opponents} avversari: in un piatto multiway servono mani più forti per puntare per valore, e i bluff funzionano molto meno.`;
    case 'board':
      return `Board ${r.description}.`;
    case 'hand':
      return `La tua mano: ${r.description} (${BUCKET_LABEL_IT[r.bucket as Bucket]}).`;
    case 'equity-vs-range':
      return `Contro il range stimato (${r.villainLabel}) la tua equity è circa il ${fpct(r.equity)}.`;
    case 'premium':
      return `${r.hand} è una delle mani più forti in assoluto: va giocata in modo aggressivo per costruire il piatto.`;
    case 'sizing-preflop':
      return r.limpers > 0
        ? `Contro ${r.limpers} limper il rilancio standard è più grande: circa ${r.recommendedBB.toFixed(1).replace('.0', '').replace('.', ',')} bb (3bb più 1bb per ogni limper).`
        : null;
    case 'three-bet-value':
      return `3-bet: con ${r.hand} vuoi far crescere il piatto o vincerlo subito. Stimiamo che l'apritore foldi circa il ${fpct(r.foldEquity)} delle volte.`;
    case 'limp-bad':
      return 'Il limp (entrare chiamando il big blind) di solito è debole: non vinci il piatto subito e inviti altri giocatori.';
  }
}

/** Spiegazione completa: prima la sintesi, poi i motivi principali. */
export function explanation(advice: Advice): string[] {
  const order: Reason['code'][] = [
    'premium', 'range', 'push-fold', 'position', 'table-size', 'sizing-preflop', 'three-bet-value',
    'hand', 'board', 'equity-vs-range', 'pot-odds', 'outs', 'implied-odds',
    'value', 'semi-bluff', 'bluff', 'give-up', 'pot-control', 'spr', 'multiway', 'bankroll', 'villain-style',
  ];
  const sorted = [...advice.reasons].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const texts = sorted.map((r) => reasonText(r, advice)).filter((t): t is string => !!t);
  return [...new Set(texts)];
}

export function verdictText(v: Verdict, advice: Advice, evMode: 'absolute' | 'relative'): string {
  const g = GRADE_LABELS_IT[v.grade];
  if (v.grade === 'ottima') return `${g}: hai fatto la giocata consigliata.`;
  const loss = v.evLossBB >= 0.05 ? ` Perdita stimata: circa ${v.evLossBB.toFixed(1).replace('.', ',')} bb${evMode === 'relative' ? ' rispetto alla giocata da range' : ''}.` : '';
  const alt = v.grade === 'accettabile'
    ? advice.multipleLinesValid ? ' Qui più linee sono valide.' : ' La differenza è piccola.'
    : '';
  const unc = v.uncertain ? ' (Stima incerta: dipende da quanto spesso l\'avversario folda.)' : '';
  return `${g}.${alt}${loss}${unc}`;
}
