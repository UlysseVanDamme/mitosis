import { useEffect, useRef } from 'react';
import { Scene } from './canvas/Scene';
import { getState, patch, useStore } from './store';
import { TopBar } from './components/TopBar';
import { Legend, SidePanel, Ticker, Toasts } from './components/SidePanel';
import { AnswerSheet, Drawer, QueryDock } from './components/Query';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const active = useStore((s) => s.activeQueryId);
  const ingesting = useStore((s) => s.ingesting);

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
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') patch({ selectedAgent: null }); };
    window.addEventListener('keydown', key);
    return () => { ro.disconnect(); scene.destroy(); c.removeEventListener('click', click); c.removeEventListener('mousemove', move); window.removeEventListener('keydown', key); };
  }, []);

  // Keep the colony framed above the answer sheet.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!active) { scene.insetBottom = 0; scene.clearQuery(); return; }
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { scene.insetBottom = el.offsetHeight + 12; });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return (
    <div className="app">
      <TopBar />
      <main className="stage">
        <canvas ref={canvasRef} className="dish" />
        <Ticker />
        <Toasts />
        {!active && !ingesting && <Legend />}
        <AnswerSheet ref={sheetRef} />
        <Hint />
      </main>
      <SidePanel />
      <QueryDock />
      <Drawer />
    </div>
  );
}

function Hint() {
  const s = useStore((x) => x);
  if (s.docsAbsorbed.size > 0 || s.ingesting || getState().agents.size > 1) return null;
  return (
    <div className="hint">
      <b>One cell. Zero documents.</b>
      <span>Start ingest and watch it divide when its knowledge outgrows its context.</span>
    </div>
  );
}
