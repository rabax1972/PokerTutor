import { gridCode } from '../strategy/handNotation';

/** Griglia 13×13 delle mani di partenza: suited sopra la diagonale, offsuit sotto. */
export function RangeGrid({ codes, highlight }: { codes: readonly string[]; highlight?: string }) {
  const set = new Set(codes);
  return (
    <div className="inline-grid gap-px bg-slate-700 p-px rounded" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
      {Array.from({ length: 169 }, (_, i) => {
        const code = gridCode(Math.floor(i / 13), i % 13);
        const inRange = set.has(code);
        const isHero = code === highlight;
        return (
          <div
            key={code}
            title={code}
            className={`w-[1.35rem] h-[1.1rem] sm:w-7 sm:h-5 text-[7px] sm:text-[9px] leading-none flex items-center justify-center font-mono
              ${inRange ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'}
              ${isHero ? 'outline outline-2 outline-amber-400 z-10 relative font-bold text-amber-100' : ''}`}
          >
            {code}
          </div>
        );
      })}
    </div>
  );
}
