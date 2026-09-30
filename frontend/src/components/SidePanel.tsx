import { useState } from 'react';
import { api } from '../api';
import { dimLabel, getState, patch, useStore } from '../store';
import type { Conflict } from '../types';
import { KIND_LABEL, claimsOf, dimColor, fmtTime, srcColor, winnerOf } from './util';

export function ConflictCard({ c, compact }: { c: Conflict; compact?: boolean }) {
  const s = useStore((x) => x);
  const claims = claimsOf(c, s);
  const win = winnerOf(c, claims, s);
  const owner = s.agents.get(c.agent_id)?.owner ?? 'owner';
  const [pending, setPending] = useState<string | null>(null);
  const verify = async (claimId: string) => {
    setPending(claimId);
    try { await api.verify(c.conflict_id, claimId, owner); } finally { setPending(null); }
  };
  return (
    <div className={`conflict ${c.status}`}>
      <div className="conflict-head">
        <span className={`kind k-${c.kind}`}>{KIND_LABEL[c.kind] ?? c.kind}</span>
        <span className="mono dim">{c.conflict_id} · <button className="link" onClick={() => patch({ selectedAgent: c.agent_id })}>{c.agent_id}</button></span>
        <span className={`status s-${c.status}`}>{c.status === 'verified' ? `verified by ${c.verified_by ?? owner}` : c.status === 'auto_resolved' ? 'auto-resolved' : 'open'}</span>
      </div>
      {!compact && <p className="conflict-sum">{c.summary}</p>}
      {claims.length >= 2 && (
        <div className="claims">
          {claims.slice(0, 2).map((cl) => {
            const d = s.docs.get(cl.doc_id);
            const isWin = win === cl.claim_id;
            const isLose = !!win && !isWin;
            return (
              <div key={cl.claim_id} className={`claim ${isWin ? 'win' : ''} ${isLose ? 'lose' : ''}`}>
                <div className="claim-val">{cl.value}</div>
                <div className="claim-src">
                  <i style={{ background: srcColor(d?.source_type ?? '') }} />
                  <span>{d?.source ?? cl.doc_id}</span>
                  {d?.date && <span className="mono dim">{d.date}</span>}
                </div>
                {isWin && <span className="tag win-tag">wins</span>}
                {c.status !== 'verified' && (
                  <button className="btn tiny" disabled={!!pending} onClick={() => verify(cl.claim_id)}>
                    {pending === cl.claim_id ? '…' : 'Verify this'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="resolution">{c.resolution}</p>
      {c.status !== 'verified' && <p className="owner-line">Ask <b>{owner}</b>, owner of {c.agent_id}</p>}
    </div>
  );
}

export function SidePanel() {
  const [tab, setTab] = useState<'splits' | 'conflicts' | 'log'>('splits');
  const s = useStore((x) => x);
  const conflicts = [...s.conflicts.values()].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1));
  const open = conflicts.filter((c) => c.status === 'open').length;
  return (
    <aside className="panel">
      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'splits'} className={tab === 'splits' ? 'on' : ''} onClick={() => setTab('splits')}>Split table <em>{s.splits.length}</em></button>
        <button role="tab" aria-selected={tab === 'conflicts'} className={tab === 'conflicts' ? 'on' : ''} onClick={() => setTab('conflicts')}>Conflicts <em className={open ? 'hot' : ''}>{conflicts.length}</em></button>
        <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Event log</button>
      </nav>
      <div className="panel-body">
        {tab === 'splits' && (
          s.splits.length === 0 ? (
            <Empty title="No divisions yet" body={`A0 reads everything until it passes ${s.budget.toLocaleString()} tokens of context. Then it divides and writes down why.`} />
          ) : (
            [...s.splits].reverse().map((sp) => (
              <div className="split-row" key={sp.split_id}>
                <div className="split-top">
                  <span className="mono sid">{sp.split_id}</span>
                  <button className="link mono" onClick={() => patch({ selectedAgent: sp.parent_id })}>{sp.parent_id}</button>
                  <span className="arrow">→</span>
                  <span className="kids">{sp.children.map((c) => <button key={c} className="link mono" onClick={() => patch({ selectedAgent: c })}>{c}</button>)}</span>
                  <span className="dimchip" style={{ color: dimColor(sp.dimension, 0.85), borderColor: dimColor(sp.dimension, 0.7, 0.4), background: dimColor(sp.dimension, 0.5, 0.12) }}>{dimLabel(sp.dimension)}</span>
                </div>
                <div className="rule mono">{sp.rule.replace(/->/g, '→')}</div>
                <p className="reason">{sp.reason}</p>
                <div className="split-meta mono">{sp.tokens_before.toLocaleString()} tokens before · {fmtTime(sp.ts)}</div>
              </div>
            ))
          )
        )}
        {tab === 'conflicts' && (
          conflicts.length === 0 ? <Empty title="No conflicts found" body="Each leaf checks new documents against everything it already knows. Contradictions land here with both sides." />
            : conflicts.map((c) => <ConflictCard key={c.conflict_id} c={c} />)
        )}
        {tab === 'log' && (
          <ol className="log">
            {s.log.map((l) => (
              <li key={l.id} className={`t-${l.tone}`}><span className="mono dim">{fmtTime(l.ts)}</span><i /> <span>{l.text}</span></li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="empty"><b>{title}</b><p>{body}</p></div>;
}

export function Ticker() {
  const s = useStore((x) => x);
  if (!s.recent.length || s.activeQueryId || !s.ingesting) return null;
  return (
    <div className="ticker" aria-live="polite">
      <div className="ticker-h">Reading</div>
      {s.recent.slice(0, 4).map((id, i) => {
        const d = getState().docs.get(id);
        return (
          <div key={id} className="tick" style={{ opacity: 1 - i * 0.22 }}>
            <i style={{ background: srcColor(d?.source_type ?? '') }} />
            <span className="tick-src">{d?.source_type}</span>
            <span className="tick-t">{d?.title ?? id}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((x) => x.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <b>{t.title}</b><span>{t.body}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend() {
  const dims = ['country', 'pc', 'client', 'topic', 'period'];
  const srcs = ['official', 'news', 'forecast', 'policy', 'ticket', 'slack', 'cao'];
  return (
    <div className="legend">
      <div><span className="lg-h">Cell colour</span>{dims.map((d) => <span key={d}><i style={{ background: dimColor(d, 0.72) }} />{dimLabel(d)}</span>)}</div>
      <div><span className="lg-h">Particles</span>{srcs.map((d) => <span key={d}><i className="dot" style={{ background: srcColor(d, 0.82) }} />{d}</span>)}</div>
      <div><span className="lg-h">Ring</span><span>context used / budget</span></div>
    </div>
  );
}
