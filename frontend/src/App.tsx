import { useEffect, useRef } from 'react';
import { Scene } from './canvas/Scene';
import { getState, patch, useStore } from './store';
import { TopBar } from './components/TopBar';
import { Legend, SidePanel, Ticker, Toasts } from './components/SidePanel';
import { AnswerSheet, Drawer, QueryDock } from './components/Query';
import { Login } from './components/Auth';
import { RoutingHud, StageTools } from './components/Hud';
import { Portal } from './components/Portal';
import { Stage } from './components/Stage';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const active = useStore((s) => s.activeQueryId);
  const ingesting = useStore((s) => s.ingesting);
  const view = useStore((s) => s.view);
  const role = useStore((s) => s.auth?.role);
  const portal = view === 'portal' && role === 'client';
  const mode = useStore((s) => s.mode);
  const stage = mode === 'stage';

  useEffect(() => {
    const c = canvasRef.current!;
    const scene = new Scene(c);
    sceneRef.current = scene;
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(c);
    const click = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      const id = scene.hit(e.clientX - r.left, e.clientY - r.top);
      patch({ selectedAgent: id });
    };
    const move = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      scene.hover = scene.hit(e.clientX - r.left, e.clientY - r.top);
      c.style.cursor = scene.hover ? 'pointer' : 'default';
    };
    c.addEventListener('click', click);
    c.addEventListener('mousemove', move);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'e' || e.key === 'E') { if (!e.metaKey && !e.ctrlKey && !e.altKey) patch({ mode: getState().mode === 'stage' ? 'explore' : 'stage' }); return; }
      if (e.key === 'Escape') { if (getState().mode === 'stage' && !getState().activeQueryId) patch({ mode: 'explore' }); else patch({ selectedAgent: null }); }
    };
    window.addEventListener('keydown', key);
    return () => { ro.disconnect(); scene.destroy(); c.removeEventListener('click', click); c.removeEventListener('mousemove', move); window.removeEventListener('keydown', key); };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.stage = stage;
    scene.insetTop = stage ? 150 : 0;
    if (!stage) scene.spotlight = null;
    scene.insetBottom = 0;
  }, [stage]);

  // Keep the colony framed above the answer sheet.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || stage) return;
    if (!active) { scene.insetBottom = 0; scene.clearQuery(); return; }
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { scene.insetBottom = el.offsetHeight + 12; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, stage]);

  return (
    <>
    {portal && <Portal />}
    <div className={`app ${stage ? 'mode-stage' : ''}`} hidden={portal}>
      {!stage && <TopBar />}
      <main className="stage">
        <canvas ref={canvasRef} className="dish" />
        {stage ? <Stage sceneRef={sceneRef} /> : (
          <>
            <RoutingHud />
            <Ticker />
            <Toasts />
            {!active && !ingesting && <Legend />}
            <AnswerSheet key={active ?? "none"} ref={sheetRef} />
            {!active && <StageTools />}
            <Hint />
          </>
        )}
      </main>
      {!stage && <SidePanel />}
      {!stage && <QueryDock />}
      {!stage && <Drawer />}
    </div>
    <Login />
    </>
  );
}

function Hint() {
  const s = useStore((x) => x);
  if (s.docsAbsorbed.size > 0 || s.ingesting || getState().agents.size > 1) return null;
  return (
    <div className="hint">
      <b>One cell. Zero documents.</b>
      <span>{getState().auth?.role === 'admin' ? 'Start ingest and watch it divide when its knowledge outgrows its context.' : 'Waiting for the knowledge desk to start ingest. The cell divides when its knowledge outgrows its context.'}</span>
    </div>
  );
}
