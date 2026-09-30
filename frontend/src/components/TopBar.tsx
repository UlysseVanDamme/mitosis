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
        <span className={`conn ${s.connected ? 'on' : ''}`} title={s.connected ? 'Live' : 'Disconnected'}>
          {MOCK ? 'mock stream' : s.connected ? 'live' : 'offline'}
        </span>
      </div>

      <div className="stats">
        <Stat label="docs read" value={st.docs} />
        <Stat label="agents" value={st.leaves} />
        <Stat label="splits" value={st.splits} tone="split" />
        <Stat label="conflicts" value={st.conflicts} tone={st.open ? 'warn' : ''} />
        <Stat label="verified" value={st.verified} tone="ok" />
        {st.redacted > 0 && <Stat label="PII redacted" value={st.redacted} tone="muted" />}
        {st.quarantined > 0 && <Stat label="quarantined" value={st.quarantined} tone="muted" />}
        {s.ingesting && <div className="ingesting"><i /> reading</div>}
      </div>

      <div className="controls">
        {s.auth?.role === 'client' && (
          <button className="btn ghost" onClick={() => patch({ view: 'portal', activeQueryId: null })}>Client portal view</button>
        )}
        {s.auth?.role === 'admin' && (
          <>
            <button className="btn primary" disabled={busy || s.ingesting} onClick={() => run(api.ingest)}>
              {s.ingesting ? 'Ingesting…' : 'Start ingest'}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => run(api.reset)}>Reset</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(api.replay)}>Replay</button>
          </>
        )}
        <UserSwitcher />
      </div>
    </header>
  );
}
