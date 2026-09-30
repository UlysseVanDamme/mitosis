import { forwardRef, useEffect, useState } from 'react';
import { api } from '../api';
import { patch, useStore } from '../store';
import type { GoldenQuestion } from '../types';
import { ConflictCard } from './SidePanel';
import { USERS, renderBold, srcColor } from './util';

export function QueryDock() {
  const user = useStore((x) => x.user);
  const [q, setQ] = useState('');
  const [golden, setGolden] = useState<GoldenQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.golden().then(setGolden); }, []);

  const ask = async (question: string, asUser?: string) => {
    if (!question.trim()) return;
    if (asUser && asUser !== user) patch({ user: asUser });
    setBusy(true);
    try {
      const { query_id } = await api.query(question.trim(), asUser ?? user);
      patch({ activeQueryId: query_id });
    } catch (e) { console.error(e); } finally { setBusy(false); }
  };

  return (
    <div className="dock">
      <form className="ask" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <span className="ask-as">as {USERS.find((u) => u.id === user)?.label ?? user}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the swarm anything about payroll…" aria-label="Question" />
        <button className="btn primary" disabled={busy || !q.trim()}>Ask</button>
      </form>
      <div className="chips">
        {golden.map((g) => (
          <button key={g.question} className="chip" onClick={() => { setQ(g.question); void ask(g.question, g.user); }} title={g.wow || g.question}>
            {g.user && g.user !== 'consultant' && <em>{g.user.replace('client:', '')}</em>}{g.question}
          </button>
        ))}
      </div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 34, c = Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const hue = v >= 75 ? 'ok' : v >= 45 ? 'mid' : 'low';
  return (
    <div className={`gauge g-${hue}`}>
      <svg viewBox="0 0 84 48" width="96" height="55" aria-hidden>
        <path d="M8 44 A34 34 0 0 1 76 44" className="g-track" />
        <path d="M8 44 A34 34 0 0 1 76 44" className="g-val" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - v / 100) }} />
      </svg>
      <div className="g-num">{v}</div>
      <div className="g-l">trust</div>
    </div>
  );
}

export const AnswerSheet = forwardRef<HTMLDivElement>(function AnswerSheet(_, ref) {
  const s = useStore((x) => x);
  const q = s.activeQueryId ? s.queries.get(s.activeQueryId) : undefined;
  if (!q) return null;
  const leaves = q.routed?.leaves ?? [];
  const a = q.answer;
  return (
    <section className="sheet" ref={ref} aria-label="Answer">
      <header className="sheet-h">
        <div className="sheet-q">{q.question}</div>
        <button className="x" aria-label="Close answer" onClick={() => patch({ activeQueryId: null })}>×</button>
      </header>
      <div className="sheet-cols">
        <div className="col-mitosis">
          <div className="col-label">Mitosis <span>routed to {leaves.length || '…'} {leaves.length === 1 ? 'leaf' : 'leaves'}, each with its whole domain in context</span></div>
          <div className="leafrow">
            {!q.routed && <span className="leaf wait">routing…</span>}
            {leaves.map((l) => {
              const ag = s.agents.get(l);
              const done = !!q.leafAnswers[l] || !!a;
              return (
                <button key={l} className={`leaf ${done ? 'done' : 'wait'}`} onClick={() => patch({ selectedAgent: l })}>
                  <b className="mono">{l}</b> {ag?.scope.description ?? ''}
                  {q.routed?.confidences[l] != null && <span className="mono dim"> {(q.routed.confidences[l] * 100).toFixed(0)}%</span>}
                </button>
              );
            })}
          </div>
          {!a ? (
            <div className="thinking"><i /><i /><i /> leaves are reading their full context</div>
          ) : (
            <div className="answer-grid">
              <div className="answer-main">
                <p className="answer">{renderBold(a.answer).map((p) => (p.b ? <b key={p.i}>{p.t}</b> : <span key={p.i}>{p.t}</span>))}</p>
                {a.conflicts.length > 0 && (
                  <div className="ans-conflicts">
                    {a.conflicts.map((c) => <ConflictCard key={c.conflict_id} c={s.conflicts.get(c.conflict_id) ?? c} compact />)}
                  </div>
                )}
              </div>
              <div className="answer-side">
                <Gauge value={a.trust} />
                {a.owners.length > 0 && <div className="owners">Ask <b>{[...new Set(a.owners)].join(', ')}</b></div>}
                <ol className="cites">
                  {a.citations.map((c) => (
                    <li key={c.doc_id}>
                      <i style={{ background: srcColor(s.docs.get(c.doc_id)?.source_type ?? '') }} />
                      <div>
                        {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : <span>{c.title}</span>}
                        <span className="mono dim">{c.source}{c.date ? ` · ${c.date}` : ''}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
        <div className="col-rag">
          <div className="col-label">Plain RAG <span>top chunks, one call</span></div>
          {q.baseline ? (
            <>
              <p className="answer rag">{q.baseline.answer}</p>
              <div className="rag-meta">
                <span className="tag warn-tag">no conflict check</span>
                <span className="tag">no owner</span>
              </div>
              <div className="retrieved mono dim">retrieved: {q.baseline.retrieved.join(', ') || 'n/a'}</div>
            </>
          ) : <div className="thinking"><i /><i /><i /> retrieving</div>}
        </div>
      </div>
    </section>
  );
});

export function Drawer() {
  const s = useStore((x) => x);
  const id = s.selectedAgent;
  const [detail, setDetail] = useState<import('../types').Agent | null>(null);
  useEffect(() => {
    setDetail(null);
    if (id) api.agent(id).then(setDetail).catch(() => setDetail(null));
  }, [id, s.agents.get(id ?? '')?.doc_ids.length]);
  if (!id) return null;
  const a = detail ?? s.agents.get(id);
  if (!a) return null;
  const docs = detail?.documents ?? a.doc_ids.map((d) => s.docs.get(d)).filter(Boolean) as NonNullable<ReturnType<typeof s.docs.get>>[];
  const conflicts = [...s.conflicts.values()].filter((c) => c.agent_id === id);
  const facts = s.facts.filter((f) => f.agent_id === id);
  const fill = Math.min(1, a.tokens / s.budget);
  return (
    <div className="drawer" role="dialog" aria-label={`Agent ${id}`}>
      <header className="drawer-h">
        <div>
          <div className="mono dim">{a.agent_id} · depth {a.depth} · {a.status === 'split' ? 'divided' : 'leaf'}</div>
          <h2>{a.scope.description}</h2>
        </div>
        <button className="x" aria-label="Close" onClick={() => patch({ selectedAgent: null })}>×</button>
      </header>
      <div className="drawer-body">
        <div className="kv"><span>Owner</span><b>{a.owner}</b></div>
        <div className="kv"><span>Context</span><b className="mono">{a.tokens.toLocaleString()} / {s.budget.toLocaleString()} tokens</b></div>
        <div className="bar"><i style={{ width: `${fill * 100}%` }} /></div>
        {a.parent_id && <div className="kv"><span>Parent</span><button className="link mono" onClick={() => patch({ selectedAgent: a.parent_id })}>{a.parent_id}</button></div>}
        {a.children.length > 0 && <div className="kv"><span>Daughters</span><span>{a.children.map((c) => <button key={c} className="link mono" onClick={() => patch({ selectedAgent: c })}>{c} </button>)}</span></div>}
        {facts.length > 0 && <><h3>Verified facts</h3>{facts.map((f) => <div key={f.fact_id} className="fact">{f.statement} <span className="dim">· {f.verified_by}</span></div>)}</>}
        {conflicts.length > 0 && <><h3>Conflicts</h3>{conflicts.map((c) => <ConflictCard key={c.conflict_id} c={c} />)}</>}
        <h3>Documents <span className="dim">{docs.length}</span></h3>
        <ul className="docs">
          {docs.map((d) => (
            <li key={d.doc_id}>
              <i style={{ background: srcColor(d.source_type) }} />
              <div>
                <div className="doc-t">{d.title}</div>
                <div className="mono dim">{d.source} · {d.source_type}{d.date ? ` · ${d.date}` : ''}{d.access_group && d.access_group !== 'public' ? ` · ${d.access_group}` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
