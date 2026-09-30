// Phone mockup (neutral chat UI) that slides in bottom-right when a message for the logged-in user arrives.
import { useEffect, useState } from 'react';
import { getState, patch, useStore } from '../store';
import type { AppNotification } from '../types';
import { verifyCell } from './Stage';

export async function runAction(n: AppNotification, a: { label: string; url: string }) {
  const s = getState();
  if (/verify|confirm/i.test(a.url + a.label)) {
    const c = s.conflicts.get(n.conflict_id);
    if (c && c.status === 'open') await verifyCell(c.agent_id, [c.conflict_id]);
    patch({ phone: null });
    return;
  }
  patch({ phone: null, mode: 'explore', selectedConflict: n.conflict_id, activeQueryId: n.query_id ?? null });
}

export function Phone() {
  const n = useStore((x) => x.phone);
  const me = useStore((x) => x.auth);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(false); if (!n) return; const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, [n?.id]);
  if (!n) return null;
  const canAct = (a: { label: string; url: string }) => !/verify|confirm/i.test(a.url + a.label) || me?.username === 'jan' || me?.role === 'admin';
  const time = new Date(n.ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`phone ${shown ? 'in' : ''}`} role="dialog" aria-label={`Message for ${n.to_name}`}>
      <div className="phone-notch" />
      <div className="phone-h"><b>Mitosis</b><span>to {n.to_name}</span><button aria-label="Dismiss" onClick={() => patch({ phone: null })}>×</button></div>
      <div className="phone-body">
        <div className="bubble">
          <b>{n.title}</b>
          <p>{n.text}</p>
          <div className="bubble-acts">
            {n.actions.filter(canAct).map((a) => (
              <button key={a.label} disabled={busy} className={/confirm|verify/i.test(a.label) ? 'primary' : ''}
                onClick={async () => { setBusy(true); try { await runAction(n, a); } finally { setBusy(false); } }}>{a.label}</button>
            ))}
          </div>
          <span className="bubble-t">{time}</span>
        </div>
        {n.delivered_slack && <div className="phone-slack">also sent to Slack</div>}
      </div>
    </div>
  );
}
