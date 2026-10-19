import { type Card, rankOf, suitOf, rankChar, SUIT_SYMBOLS } from '../engine/cards';

interface Props {
  card?: Card;
  hidden?: boolean;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
  highlight?: boolean;
}

const SIZES = {
  sm: 'w-7 h-10 text-xs sm:w-8 sm:h-11 sm:text-sm',
  md: 'w-9 h-[3.25rem] text-sm sm:w-11 sm:h-16 sm:text-base',
  lg: 'w-11 h-16 text-base sm:w-14 sm:h-20 sm:text-xl',
};

/** Carta da gioco. Colori a 4 semi per distinguere meglio i semi a colpo d'occhio. */
export function CardView({ card, hidden, size = 'md', dim, highlight }: Props) {
  const base = `${SIZES[size]} rounded-md shadow-md flex flex-col items-center justify-center font-bold select-none shrink-0`;
  if (card === undefined) {
    return <div className={`${base} border-2 border-dashed border-white/20 bg-transparent shadow-none`} />;
  }
  if (hidden) {
    return (
      <div
        className={`${base} border border-white/30 bg-gradient-to-br from-rose-700 to-rose-900`}
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 4px, transparent 4px 8px)' }}
        aria-label="carta coperta"
      />
    );
  }
  const suit = suitOf(card);
  const color = ['text-slate-900', 'text-red-600', 'text-blue-600', 'text-emerald-700'][suit];
  const r = rankChar(rankOf(card));
  return (
    <div
      className={`${base} bg-white ${color} ${dim ? 'opacity-40' : ''} ${highlight ? 'ring-2 ring-amber-400' : ''}`}
      aria-label={`${r}${SUIT_SYMBOLS[suit]}`}
    >
      <span className="leading-none">{r === 'T' ? '10' : r}</span>
      <span className="leading-none">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}

export function CardRow({ cards, size = 'sm' }: { cards: readonly Card[]; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {cards.map((c) => <CardView key={c} card={c} size={size} />)}
    </span>
  );
}
