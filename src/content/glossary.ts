export interface GlossaryEntry {
  term: string;
  short: string;
  long?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  equity: {
    term: 'Equity',
    short: 'La percentuale di piatto che "ti spetta" in media: la probabilità di vincere la mano se si arrivasse allo showdown.',
    long: 'Si calcola contro il range stimato dell\'avversario, non contro la sua mano esatta (che non conosci). Il tutor la stima con una simulazione Monte Carlo.',
  },
  potOdds: {
    term: 'Pot odds',
    short: 'Il rapporto tra quanto devi pagare e il piatto finale. Ti dicono l\'equity minima per rendere il call profittevole.',
    long: 'Formula: da chiamare ÷ (piatto + da chiamare). Es. chiamare 50 in un piatto di 100: 50 / 150 = 33%. Se la tua equity supera il 33%, il call guadagna nel lungo periodo.',
  },
  impliedOdds: {
    term: 'Odds implicite',
    short: 'Le fiches extra che pensi di vincere nelle street successive se chiudi il progetto.',
    long: 'Permettono di chiamare con un po\' meno equity di quella richiesta dalle pot odds, ma solo se gli stack sono profondi e la tua mano, una volta chiusa, viene pagata.',
  },
  outs: {
    term: 'Outs',
    short: 'Le carte ancora nel mazzo che migliorano la tua mano a una probabilmente vincente.',
    long: 'Progetto di colore: 9 outs. Scala bilaterale: 8. Scala a incastro (gutshot): 4.',
  },
  rule24: {
    term: 'Regola del 2 e del 4',
    short: 'Stima rapida: outs × 4 al flop (due carte da vedere), outs × 2 al turn (una carta).',
    long: 'Con 9 outs al flop: circa 36% di chiudere entro il river; al turn circa 18%. Attenzione: ×4 vale solo se vedrai davvero entrambe le carte (cioè se nessuno punta forte al turn).',
  },
  spr: {
    term: 'SPR',
    short: 'Stack-to-pot ratio: stack effettivo diviso il piatto all\'inizio della street.',
    long: 'Con SPR basso (sotto 3) una top pair è spesso sufficiente per andare all-in. Con SPR alto (oltre 10) servono mani molto più forti per mettere dentro tutto lo stack.',
  },
  effectiveStack: {
    term: 'Stack effettivo',
    short: 'Lo stack più piccolo tra te e l\'avversario: è il massimo che puoi vincere o perdere contro di lui.',
  },
  range: {
    term: 'Range',
    short: 'L\'insieme di mani con cui un giocatore può trovarsi in una certa situazione.',
    long: 'Non si gioca contro una mano, ma contro tutte le mani plausibili date le azioni dell\'avversario. Il tutor usa range standard stimati: sono un\'assunzione, non una certezza.',
  },
  rfi: {
    term: 'Apertura (RFI)',
    short: 'Raise first in: essere il primo a rilanciare in un piatto in cui tutti hanno foldato.',
  },
  threeBet: {
    term: '3-bet',
    short: 'Il primo rilancio sopra un\'apertura (il blind conta come prima "puntata", l\'apertura come seconda).',
  },
  fourBet: {
    term: '4-bet',
    short: 'Un rilancio sopra un 3-bet.',
  },
  limp: {
    term: 'Limp',
    short: 'Entrare nel piatto preflop chiamando il big blind invece di rilanciare. Di solito è una giocata debole.',
  },
  cbet: {
    term: 'Continuation bet (c-bet)',
    short: 'Puntata al flop di chi ha rilanciato preflop, sfruttando l\'iniziativa.',
  },
  valueBet: {
    term: 'Value bet',
    short: 'Puntare con una mano forte sperando di essere chiamati da mani peggiori.',
  },
  bluff: {
    term: 'Bluff',
    short: 'Puntare con una mano debole per far foldare mani migliori.',
  },
  semiBluff: {
    term: 'Semi-bluff',
    short: 'Bluff con un progetto: puoi vincere subito (fold) oppure chiudere la mano dopo.',
  },
  foldEquity: {
    term: 'Fold equity',
    short: 'Il valore che ottieni dalla probabilità che l\'avversario foldi alla tua puntata.',
  },
  position: {
    term: 'Posizione',
    short: 'Parlare dopo l\'avversario (in posizione, IP) dà più informazioni e controllo del piatto.',
    long: 'Il bottone è la posizione migliore postflop. I blind sono le peggiori: per questo si aprono più mani avvicinandosi al bottone.',
  },
  ev: {
    term: 'EV',
    short: 'Valore atteso: quanto guadagni o perdi in media con una giocata, ripetuta molte volte.',
    long: 'Nel tutor l\'EV è stimato con un modello semplificato (una street alla volta) ed espresso in big blind.',
  },
  bankroll: {
    term: 'Bankroll',
    short: 'Il capitale dedicato al poker. Si misura in buy-in (stack da 100bb) del limite a cui giochi.',
    long: 'Regola tipica per il cash game: almeno 20-30 buy-in. Con meno, la varianza può azzerarti anche se giochi bene (rischio di rovina).',
  },
  riskOfRuin: {
    term: 'Rischio di rovina',
    short: 'La probabilità di perdere l\'intero bankroll a causa della varianza, anche giocando con profitto.',
  },
  pushFold: {
    term: 'Push/fold',
    short: 'Con stack corti (circa 15bb o meno) si gioca preflop solo all-in o fold.',
  },
  bb: {
    term: 'bb (big blind)',
    short: 'Unità di misura del poker: tutte le cifre del tutor sono espresse in big blind.',
  },
  gto: {
    term: 'GTO',
    short: 'Strategia teoricamente inattaccabile. I consigli del tutor sono approssimazioni didattiche, non soluzioni GTO esatte.',
  },
  ip: {
    term: 'In posizione (IP)',
    short: 'Agisci dopo l\'avversario nelle street postflop.',
  },
  oop: {
    term: 'Fuori posizione (OOP)',
    short: 'Agisci prima dell\'avversario nelle street postflop: è uno svantaggio.',
  },
};
