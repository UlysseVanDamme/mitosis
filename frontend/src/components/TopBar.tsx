import { useEffect, useRef, useState } from 'react';
import { api, MOCK } from '../api';
import { patch, stats, useStore } from '../store';
import { UserSwitcher } from './Auth';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current) { setBump(true); prev.current = value; const t = setTimeout(() => setBump(false), 450); return () => clearTimeout(t); }
  }, [value]);
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className={`stat-v ${bump ? 'bump' : ''}`}>{value}</span>
      <span className="stat-l">{label}</span>
    </div>
  );
}

export function TopBar() {
  const s = useStore((x) => x);
  const st = stats(s);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => unknown) => { setBusy(true); try { await f(); } catch (e) { console.error(e); } finally { setBusy(false); } };

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden>
          <circle cx="10" cy="11" r="8.5" className="glyph-a" />
          <circle cx="20" cy="11" r="8.5" className="glyph-b" />
        </svg>
        <span className="brand-name">Mitosis</span>
      </div>

      <div className="stats">
        <Stat label="documents read" value={st.docs} />
        <Stat label="specialists" value={st.leaves} />
        <Stat label="contradictions caught" value={st.conflicts} tone={st.open ? 'warn' : ''} />
      </div>

      <div className="controls">
        {s.auth?.role === 'client' && (
          <button className="btn ghost" onClick={() => patch({ view: 'portal', activeQueryId: null })}>Client portal view</button>
        )}
        <UserSwitcher />
      </div>
    </header>
  );
}
