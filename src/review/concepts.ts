import type { ConceptId } from '../strategy/types';

export interface Concept {
  id: ConceptId;
  title: string;
  /** Spiegazione breve da ripassare. */
  summary: string;
  /** Chiave del glossario collegata. */
  glossary?: string;
  /** Lezione a tema collegata (per il ripasso). */
  lessonId?: string;
}

export const CONCEPTS: Record<ConceptId, Concept> = {
  'range-position': {
    id: 'range-position',
    title: 'Range di apertura per posizione',
    summary:
      'Più giocatori devono ancora parlare dopo di te, più stretto deve essere il tuo range: da UTG si apre circa il 12-18% delle mani, dal bottone il 40-45%. Le mani "carine" come K9o o Q8s si giocano solo dalle posizioni avanzate.',
    glossary: 'rfi',
    lessonId: 'open-button',
  },
  position: {
    id: 'position',
    title: 'Il valore della posizione',
    summary:
      'Chi parla per ultimo vede cosa fanno gli altri prima di decidere: può controllare il piatto, bluffare meglio e prendere valore più facilmente. Per questo si giocano più mani in posizione e meno dai blind.',
    glossary: 'position',
    lessonId: 'open-button',
  },
  'pot-odds': {
    id: 'pot-odds',
    title: 'Pot odds contro equity',
    summary:
      'Prima di chiamare, confronta il prezzo con le tue probabilità: equity richiesta = da chiamare ÷ (piatto + da chiamare). Se la tua equity contro il range avversario è più alta, il call guadagna nel lungo periodo.',
    glossary: 'potOdds',
    lessonId: 'pot-odds-flop',
  },
  'implied-odds': {
    id: 'implied-odds',
    title: 'Odds implicite',
    summary:
      'Con un progetto puoi chiamare anche se le pot odds non bastano, se gli stack sono profondi e quando chiudi la mano vieni pagato. Con stack corti o progetti "ovvi" le odds implicite sono poche.',
    glossary: 'impliedOdds',
    lessonId: 'pot-odds-flop',
  },
  outs: {
    id: 'outs',
    title: 'Contare gli outs (regola del 2 e del 4)',
    summary:
      'Colore: 9 outs, scala bilaterale: 8, gutshot: 4. Moltiplica per 4 al flop (se vedrai turn e river) o per 2 al turn per stimare la probabilità di chiudere.',
    glossary: 'rule24',
    lessonId: 'pot-odds-flop',
  },
  sizing: {
    id: 'sizing',
    title: 'Dimensionare le puntate',
    summary:
      'Su board bagnati e con mani forti punta più grande (2/3-pieno piatto) per far pagare i progetti; su board asciutti bastano puntate piccole. Preflop: apertura ~2,5bb, +1bb per ogni limper; 3-bet ~3x in posizione, ~4x fuori posizione.',
    lessonId: 'value-bet',
  },
  spr: {
    id: 'spr',
    title: 'SPR e impegno dello stack',
    summary:
      'SPR = stack effettivo ÷ piatto. Con SPR sotto 3-4 una top pair forte è sufficiente per andare all-in; con SPR sopra 10 servono mani molto più forti per mettere dentro tutto lo stack.',
    glossary: 'spr',
    lessonId: 'push-fold',
  },
  'value-bet': {
    id: 'value-bet',
    title: 'Value bet',
    summary:
      'Se la tua mano è spesso migliore di quelle che possono chiamarti, punta: un check con una mano forte regala street gratis e soldi persi. Contro avversari che chiamano molto, fai value bet anche più sottili.',
    glossary: 'valueBet',
    lessonId: 'value-bet',
  },
  bluff: {
    id: 'bluff',
    title: 'Quando bluffare',
    summary:
      'Un bluff deve far foldare l\'avversario abbastanza spesso: con una puntata di metà piatto serve almeno il 33% di fold, a piatto pieno il 50%. Bluffa contro range deboli (chi ha fatto check), non contro chi ha mostrato forza.',
    glossary: 'bluff',
    lessonId: 'river-bluff',
  },
  'semi-bluff': {
    id: 'semi-bluff',
    title: 'Semi-bluff',
    summary:
      'Puntare con un progetto ti dà due modi per vincere: l\'avversario folda subito, oppure chiudi la mano. È spesso meglio che chiamare passivamente.',
    glossary: 'semiBluff',
    lessonId: 'pot-odds-flop',
  },
  'fold-equity': {
    id: 'fold-equity',
    title: 'Fold equity',
    summary:
      'Quando punti o vai all-in, una parte del tuo profitto viene dai fold dell\'avversario. Più la mano avversaria è debole (o più è stretto il suo range di call), più fold equity hai.',
    glossary: 'foldEquity',
    lessonId: 'push-fold',
  },
  bankroll: {
    id: 'bankroll',
    title: 'Gestione del bankroll',
    summary:
      'Il bankroll deve reggere la varianza: per il cash game almeno 20-30 buy-in. Con un bankroll corto evita i coin flip per tutto lo stack quando il vantaggio è minimo, e valuta di scendere di limite.',
    glossary: 'bankroll',
  },
  'table-size': {
    id: 'table-size',
    title: 'Tavoli corti e tavoli pieni',
    summary:
      'Con 2-4 giocatori i blind girano spesso: si gioca largo e aggressivo, le coppie e gli assi deboli valgono di più. Con 7-8 giocatori serve più pazienza dalle prime posizioni perché è più probabile che qualcuno abbia una mano forte.',
    lessonId: 'open-button',
  },
  'push-fold': {
    id: 'push-fold',
    title: 'Push/fold con stack corto',
    summary:
      'Con circa 12bb o meno, un rilancio normale ti impegna già: meglio scegliere tra all-in e fold. Il range di all-in si allarga più lo stack è corto e più sei vicino al bottone.',
    glossary: 'pushFold',
    lessonId: 'push-fold',
  },
  'three-bet': {
    id: 'three-bet',
    title: '3-bet e risposta alle aperture',
    summary:
      'Contro un\'apertura hai tre opzioni: 3-bet con le mani migliori (e qualche bluff con blocker come A5s), call con mani giocabili in posizione, fold con il resto. Più l\'apritore è in posizione avanzata, più puoi difenderti largo.',
    glossary: 'threeBet',
    lessonId: 'bb-defense',
  },
  'bb-defense': {
    id: 'bb-defense',
    title: 'Difendere il big blind',
    summary:
      'Nel BB hai già investito 1bb: chiudi l\'azione e ricevi ottime pot odds, quindi puoi difenderti con molte mani, soprattutto contro aperture dal bottone e piccole. Contro aperture da UTG serve più selezione.',
    glossary: 'potOdds',
    lessonId: 'bb-defense',
  },
  equity: {
    id: 'equity',
    title: 'Ragionare contro un range',
    summary:
      'Non sai che carte ha l\'avversario, ma puoi stimare il suo range dalle azioni: chi apre da UTG ha mani forti, chi fa check al flop raramente ha un mostro. La tua equity va calcolata contro tutto il range.',
    glossary: 'range',
  },
};
