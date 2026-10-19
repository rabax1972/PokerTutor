import { useCallback, useState } from 'react';
import { HERO_SEAT, freeHandSetup, type LiveHand, type SessionConfig } from './game/session';
import { lessonById, reviewSetup } from './lessons/lessons';
import type { HandReview } from './review/review';
import { handCode } from './strategy/handNotation';
import { hasMistakes, loadHands, reviewWeights, saveHand } from './storage/storage';
import { GlossaryPage } from './ui/GlossaryPage';
import { ImportPage } from './ui/ImportPage';
import { LessonPicker } from './ui/LessonPicker';
import { ReviewPanel } from './ui/ReviewPanel';
import { SetupScreen } from './ui/SetupScreen';
import { StatsPage } from './ui/StatsPage';
import { TablePage } from './ui/TablePage';

type View =
  | { name: 'home' }
  | { name: 'lessons'; config: SessionConfig }
  | { name: 'table'; config: SessionConfig; key: number }
  | { name: 'stats' }
  | { name: 'import' }
  | { name: 'glossary' };

const DEFAULT_CONFIG: SessionConfig = { numPlayers: 6, mode: 'free', stackBB: 100, bankroll: 'adequate' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [lastConfig, setLastConfig] = useState<SessionConfig | undefined>();
  const [, refresh] = useState(0);

  const start = (cfg: SessionConfig) => {
    setLastConfig(cfg);
    if (cfg.mode === 'lesson' && !cfg.lessonId) setView({ name: 'lessons', config: cfg });
    else setView({ name: 'table', config: cfg, key: Date.now() });
  };

  const openLesson = (lessonId: string) => {
    const cfg = { ...(lastConfig ?? DEFAULT_CONFIG), mode: 'lesson' as const, lessonId };
    setLastConfig(cfg);
    setView({ name: 'table', config: cfg, key: Date.now() });
  };

  const config = view.name === 'table' ? view.config : null;
  const makeSetup = useCallback(
    (n: number) => {
      if (!config) throw new Error('Nessuna sessione');
      const seed = (Date.now() + n * 7919) >>> 0;
      if (config.mode === 'lesson' && config.lessonId) return lessonById(config.lessonId)!.generate(config, seed);
      if (config.mode === 'review') return reviewSetup(config, reviewWeights(loadHands()), seed);
      return freeHandSetup(config, n, seed);
    },
    [config],
  );

  const onReviewed = useCallback(
    (review: HandReview, hand: LiveHand) => {
      if (!config) return;
      const hero = hand.state.players[HERO_SEAT];
      saveHand({
        id: `${hand.state.seed}-${hand.setup.buttonSeat}-${hand.decisions.length}-${hero.hole.join('.')}`,
        ts: Date.now(),
        mode: config.mode,
        lessonId: hand.setup.lessonId,
        numPlayers: hand.state.numPlayers,
        position: hero.position,
        heroCode: handCode(hero.hole[0], hero.hole[1]),
        netBB: review.netBB,
        decisions: review.decisions.map((d) => ({
          street: d.advice.street,
          spot: d.advice.spot,
          grade: d.verdict.grade,
          lossBB: Math.round(d.verdict.evLossBB * 100) / 100,
        })),
        concepts: review.concepts.map((c) => c.id),
      });
    },
    [config],
  );

  const nav = (name: 'home' | 'stats' | 'import' | 'glossary', label: string) => (
    <button
      onClick={() => { refresh((x) => x + 1); setView({ name } as View); }}
      className={`px-2.5 py-1 rounded text-sm ${view.name === name ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'}`}
    >
      {label}
    </button>
  );

  const subtitle = config
    ? `${config.mode === 'free' ? 'Mano libera' : config.mode === 'review' ? 'Ripasso errori' : 'Lezione'} · ${config.numPlayers} giocatori · stack ${config.stackBB}bb`
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2">
          <button onClick={() => setView({ name: 'home' })} className="flex items-center gap-2 font-bold text-lg mr-auto">
            <span className="text-2xl">♠</span> <span className="hidden sm:inline">Poker Tutor</span>
          </button>
          {nav('home', 'Gioca')}
          {nav('stats', 'Statistiche')}
          {nav('import', 'Importa')}
          {nav('glossary', 'Glossario')}
        </div>
      </header>
      <main>
        {view.name === 'home' && (
          <SetupScreen initial={lastConfig} onStart={start} reviewAvailable={hasMistakes(loadHands())} />
        )}
        {view.name === 'lessons' && (
          <LessonPicker
            onBack={() => setView({ name: 'home' })}
            onPick={(id) => {
              const cfg = { ...view.config, lessonId: id };
              setLastConfig({ ...view.config, lessonId: undefined });
              setView({ name: 'table', config: cfg, key: Date.now() });
            }}
          />
        )}
        {view.name === 'table' && (
          <TablePage
            key={view.key}
            makeSetup={makeSetup}
            onExit={() => setView(view.config.mode === 'lesson' ? { name: 'lessons', config: { ...view.config, lessonId: undefined } } : { name: 'home' })}
            subtitle={subtitle}
            renderAfterHand={(hand) => (
              <ReviewPanel
                hand={hand}
                bankroll={view.config.bankroll}
                onReviewed={(r) => onReviewed(r, hand)}
                onOpenLesson={openLesson}
              />
            )}
          />
        )}
        {view.name === 'stats' && <StatsPage onOpenLesson={openLesson} />}
        {view.name === 'import' && <ImportPage onOpenLesson={openLesson} />}
        {view.name === 'glossary' && <GlossaryPage />}
      </main>
      <footer className="text-center text-[11px] text-slate-600 py-6 px-4">
        I consigli sono approssimazioni didattiche (range standard + equity Monte Carlo), non soluzioni GTO.
      </footer>
    </div>
  );
}
