# Poker Tutor – Texas Hold'em

Un tutor di Texas Hold'em No Limit in italiano. Giochi mani simulate contro bot (da 2 a 8 giocatori). A fine mano l'app analizza ogni tua decisione: la confronta con la giocata consigliata e spiega perché, con equity, pot odds, range di riferimento e una stima dell'EV perso.

## Avvio

```bash
npm install
npm run dev        # apre l'app su http://localhost:5173
npm test           # test unitari (vitest)
npm run build      # build di produzione in dist/
```

Non serve un backend: storico e statistiche sono salvati nel `localStorage` del browser.

## Modalità

- **Mano libera**: mani casuali contro bot di stili diversi (tight, loose, aggressivo, passivo, regolare). Il bottone ruota a ogni mano.
- **Lezioni a tema**: aprire dal bottone, range per posizione, difesa del BB, risposta a un'apertura, affrontare un 3-bet, push/fold, chiamare un all-in, pot odds al flop, value bet, bluff al river.
- **Ripasso errori**: propone situazioni del tipo in cui hai sbagliato di più (gli errori recenti e gravi pesano di più).

## Importare le proprie mani

Dalla pagina **Importa** puoi caricare le hand history esportate dal tuo client, trascinando i file `.txt`, scegliendoli dal disco o incollando il testo. Il tutor ricostruisce ogni mano e analizza tutte le tue decisioni. Puoi poi aggiungere i risultati alle statistiche e al ripasso errori.

- Portali supportati: PokerStars (anche .it, Zoom e tornei), GGPoker, Winamax, 888poker.
- Solo Texas Hold'em No Limit, cash e tornei (ante inclusi), da 2 a 10 giocatori.
- Le hand history devono essere in inglese.
- Non ancora supportate: Omaha e altre varianti, Pot/Fixed Limit, straddle, mani con dead button. Vengono elencate con il motivo.
- Le carte avversarie non mostrate non sono note. L'analisi usa solo le tue carte, il board e i range stimati; il risultato indicato è quello reale del file.
- I file vengono letti solo nel browser, senza invio a server.

`scripts/genSampleFile.ts <file>` genera un file di prova con circa 300 mani.

## Struttura

```
src/
  engine/    carte, RNG con seed, mazzo, valutatore (5 migliori su 7), posizioni 2-8, side pot, macchina a stati della mano
  strategy/  range preflop, classificazione della mano sul board, equity Monte Carlo contro range pesati,
             stima dei range avversari, modello EV, advisor preflop/postflop, bankroll
  bots/      profili e logica dei bot
  game/      sessione: creazione mani, turni dei bot, azioni scriptate delle lezioni
  review/    giudizio, testi delle spiegazioni, concetti da ripassare
  lessons/   generatori delle lezioni e del ripasso errori
  import/    parser delle hand history (PokerStars/GGPoker, Winamax, 888poker) e ricostruzione delle mani nell'engine
  storage/   storico mani e statistiche (localStorage)
  ui/        tavolo, carte, barra azioni, review, statistiche, glossario
scripts/     genPreflopEquity.ts (rigenera la tabella di equity preflop), calibrate.ts (controllo di calibrazione dell'advisor)
```

## Come vengono prodotti i consigli (e i loro limiti)

- **Preflop (situazioni normali)**: confronto con range di riferimento semplificati per posizione e numero di giocatori (cash game, ~100bb). L'errore si stima in base alla distanza della mano dal range.
- **All-in e push/fold**: calcolo dell'EV con equity Monte Carlo contro il range stimato e pot odds. Qui il modello è più affidabile, perché non ci sono street future.
- **Postflop**: modello EV a una street. La fold equity viene stimata dal range avversario, ristretto in base alle sue azioni. L'equity è calcolata contro le mani che continuano, con un fattore di realizzazione per posizione e multiway.
- I bluff sono consigliati solo se battono con margine la linea passiva. Quando l'errore dipende soprattutto dalla stima della fold equity, il giudizio è attenuato e segnalato come "stima incerta".
- Con un bankroll corto le giocate ad alta varianza e con vantaggio minimo vengono sconsigliate.

Sono approssimazioni didattiche, **non soluzioni GTO**. Nella review, la sezione "Assunzioni e limiti" indica i range stimati usati e quando più linee sono valide.
