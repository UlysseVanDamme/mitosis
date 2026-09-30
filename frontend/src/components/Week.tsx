// "This week": the buyer's calm summary. All numbers come from the
// access-filtered state already in the store (GET /api/state + the event stream).
import { useEffect } from 'react';
import { patch, useStore, type AppState } from '../store';

export function weekNumbers(s: AppState) {
  const cs = [...s.conflicts.values()];
  const open = cs.filter((c) => c.status === 'open');
  const verified = cs.filter((c) => c.status === 'verified').length;
  const auto = cs.filter((c) => c.status === 'auto_resolved').length;
  const per = new Map<string, number>();
  for (const c of open) {
    const a = s.agents.get(c.agent_id);
    const who = a?.owner || a?.scope.description || c.agent_id;
    per.set(who, (per.get(who) ?? 0) + 1);
  }
  const debt = [...per.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  const imps = [...s.impacts.values()];
  const stale = imps.reduce((n, i) => n + (i.affected?.length ?? 0), 0);
  const r = s.routing;
  const total = r.rule + r.s1 + r.s2;
  const noLlm = total ? Math.round(((r.rule + r.s1) / total) * 100) : null;
  return { caught: cs.length, verified, auto, open: open.length, debt, stale, impacts: imps.length, noLlm, routed: total };
}

export function Week() {
  const s = useStore((x) => x);
  const show = s.week;
  useEffect(() => {
    if (!show) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') patch({ week: false }); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [show]);
  if (!show) return null;
  const n = weekNumbers(s);
  const max = Math.max(1, ...n.debt.map((d) => d[1]));
  return (
    <div className="week" role="dialog" aria-label="This week">
      <div className="week-card">
        <button className="x" aria-label="Close" onClick={() => patch({ week: false })}>×</button>
        <div className="week-h">This week</div>
        <div className="week-grid">
          <div><b>{n.caught}</b><span>contradictions caught</span></div>
          <div className="ok"><b>{n.verified + n.auto}</b><span>resolved ({n.verified} verified by an owner, {n.auto} by rule)</span></div>
          <div className={n.open ? 'warn' : 'ok'}><b>{n.open}</b><span>still open (knowledge debt)</span></div>
          <div><b>{n.stale}</b><span>stale values caught by impact detection{n.impacts ? ` (${n.impacts} change${n.impacts > 1 ? 's' : ''})` : ''}</span></div>
          <div><b>{n.noLlm == null ? '–' : `${n.noLlm}%`}</b><span>of routing without an LLM{n.routed ? ` (${n.routed} decisions)` : ''}</span></div>
        </div>
        {n.debt.length > 0 && (
          <div className="week-debt">
            <div className="week-sub">Open, per specialist</div>
            {n.debt.map(([who, k]) => (
              <div className="week-row" key={who}>
                <span className="week-who">{who}</span>
                <span className="week-bar"><i style={{ width: `${(k / max) * 100}%` }} /></span>
                <span className="mono">{k}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
