// Explore mode (docs/STAGE_MODE.md, "Explore mode (inspector, not dashboard)"):
// one right panel that shows the thing you just clicked; everything else is one click away.
import { Component, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { dimLabel, getState, patch, useStore, type AppState, type QueryState } from '../store';
import type { Conflict, GoldenQuestion, Handover, Side } from '../types';
import { verifyCell } from './Stage';
import { assessmentFor, Ledger, toneOf } from './Trust';
import { RoutingHud } from './Hud';
import { claimsOf, fmtTime, renderBold, winnerOf } from './util';

/** Keeps one malformed answer from blanking the whole Explore view. */
class Safe extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: unknown) { console.error('answer card', e); }
  render() { return this.state.err ? <p className="muted">This answer could not be shown. Ask again.</p> : this.props.children; }
}

const TYPE: Record<string, string> = {
  official: 'official', law: 'law', news: 'news', forecast: 'forecast', policy: 'policy', ticket: 'ticket', slack: 'Slack',
  cao: 'company CAO', email: 'email', faq: 'FAQ', teams: 'Teams', config: 'payroll config',
};
const KIND_RANK: Record<string, number> = { forecast_vs_final: 0, true_contradiction: 1, temporal_supersession: 2, scope_difference: 3 };

export function sidesOf(c: Conflict, s: AppState): Side[] {
  if (c.sides?.length) return c.sides.slice(0, 2);
  const cl = claimsOf(c, s);
  const w = winnerOf(c, cl, s);
  return cl.slice(0, 2).map((x) => {
    const d = s.docs.get(x.doc_id);
    return { value: x.value, source: d?.source ?? x.doc_id, source_type: d?.source_type ?? '', date: d?.date, doc_id: x.doc_id, wins: x.claim_id === w };
  });
}

function rank(cs: Conflict[]) {
  return [...cs].sort((a, b) => Number(!!b.hero) - Number(!!a.hero) || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9));
}

function back() {
  const s = getState();
  if (s.activeQueryId) patch({ activeQueryId: null });
  else if (s.selectedConflict) patch({ selectedConflict: null });
  else patch({ selectedAgent: null });
}

export function Inspector() {
  const s = useStore((x) => x);
  const q = s.activeQueryId ? s.queries.get(s.activeQueryId) : undefined;
  const c = s.selectedConflict ? s.conflicts.get(s.selectedConflict) : undefined;
  const a = s.selectedAgent ? s.agents.get(s.selectedAgent) : undefined;
  let body: React.ReactNode;
  if (q) body = <Safe key={q.query_id}><AnswerCard q={q} /></Safe>;
  else if (c) body = <ConflictView c={c} />;
  else if (a) body = <AgentView id={a.agent_id} />;
  else body = s.auth?.username === 'sofie' ? <HandoverView /> : <Attention />;
  return (
    <aside className="insp">
      {(q || c || a) && <button className="insp-back" onClick={back}>← Back</button>}
      <div className="insp-body">{body}</div>
    </aside>
  );
}

function Row({ c, onClick }: { c: Conflict; onClick: () => void }) {
  const s = getState();
  return (
    <button className={`row ${c.status}`} onClick={onClick}>
      <i className={`dot ${c.status === 'verified' ? 'g' : c.status === 'open' ? 'r' : ''}`} />
      <span className="row-t">{c.plain_summary || c.summary}</span>
      <span className="row-m">{s.agents.get(c.agent_id)?.scope.value ?? c.agent_id}</span>
    </button>
  );
}

function Attention() {
  const s = useStore((x) => x);
  const open = rank([...s.conflicts.values()].filter((c) => c.status === 'open'));
  return (
    <>
      <h2>Needs attention</h2>
      {!open.length
        ? <p className="muted">{s.docsAbsorbed.size ? 'Nothing open. Every contradiction is decided.' : 'Nothing read yet.'}</p>
        : open.slice(0, 12).map((c) => <Row key={c.conflict_id} c={c} onClick={() => patch({ selectedConflict: c.conflict_id })} />)}
      {open.length > 12 && <p className="muted">+{open.length - 12} more, lower impact</p>}
    </>
  );
}

export function useHandover() {
  const n = useStore((x) => [...x.conflicts.values()].filter((c) => c.status !== 'open').length + x.conflicts.size * 100);
  const who = useStore((x) => x.auth?.username);
  const [h, setH] = useState<Handover | null>(null);
  useEffect(() => { api.handover().then(setH).catch(() => setH(null)); }, [n, who]);
  return h;
}

export function HandoverList({ h }: { h: Handover }) {
  const s = useStore((x) => x);
  return (
    <>
      <h2>{h.items.length === 3 ? '3' : h.items.length} things you should know about {h.client}</h2>
      {h.items.map((it, i) => {
        const c = s.conflicts.get(it.conflict_id);
        const status = c?.status ?? it.status;
        const win = it.sides.find((x) => x.wins);
        const imp = Array.isArray(it.impacts) ? it.impacts.map((x) => (typeof x === 'string' ? x : x.summary))[0] : it.impacts;
        return (
          <button key={it.conflict_id} className={`ho ${status}`} onClick={() => patch({ selectedConflict: it.conflict_id })}>
            <span className="ho-n">{i + 1}</span>
            <span className="ho-b">
              <span className="row-t">{it.plain_summary}{win ? <>: <b>{win.value}</b></> : null}</span>
              <span className="row-m">{imp ? `${imp} · ` : ''}{status === 'verified' ? `verified by ${c?.verified_by ?? it.owner}` : `owner ${it.owner}`}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}

function HandoverView() {
  const h = useHandover();
  if (!h || !h.items.length) return <Attention />;
  return <HandoverList h={h} />;
}

function ConflictView({ c }: { c: Conflict }) {
  const s = useStore((x) => x);
  const sides = sidesOf(c, s);
  const decided = sides.some((x) => x.wins);
  const impact = s.impacts.get(c.conflict_id);
  const owner = s.agents.get(c.agent_id)?.owner ?? 'the owner';
  const me = s.auth;
  const can = me?.role === 'expert' || me?.role === 'admin';
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h2>{c.plain_summary || c.summary}</h2>
      <div className="sides">
        {sides.map((x, i) => (
          <div key={x.doc_id + i} className={`side ${decided ? (x.wins ? 'win' : 'lose') : ''}`}>
            <b className="side-v">{x.value}</b>
            <span>{x.source}</span>
            <span className="muted">{TYPE[x.source_type] ?? x.source_type}{x.date ? ` · ${x.date}` : ''}</span>
            {decided && <span className="side-tag">{x.wins ? 'wins' : 'replaced'}</span>}
          </div>
        ))}
      </div>
      <p>{c.resolution}</p>
      {impact && <p className="impact">{impact.summary}</p>}
      {c.status === 'verified'
        ? <p className="ok-line">Verified by {c.verified_by ?? owner}</p>
        : c.status === 'auto_resolved' ? <p className="muted">Resolved by rule. Owner: {owner}</p>
          : can
            ? <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await verifyCell(c.agent_id, [c.conflict_id]); } finally { setBusy(false); } }}>{busy ? 'Verifying…' : 'Verify'}</button>
            : <p className="muted">Only {owner} (owner) can verify</p>}
      <button className="link" onClick={() => patch({ selectedConflict: null, selectedAgent: c.agent_id })}>Open the specialist that holds this</button>
    </>
  );
}

function AgentView({ id }: { id: string }) {
  const s = useStore((x) => x);
  const a = s.agents.get(id)!;
  const docs = a.doc_ids.map((d) => s.docs.get(d)).filter(Boolean);
  const cs = rank([...s.conflicts.values()].filter((c) => c.agent_id === id || c.agent_ids?.includes(id)));
  return (
    <>
      <h2>{a.scope.description}</h2>
      <p className="muted">Owner <b>{a.owner || 'nobody'}</b> · {a.status === 'split' ? `hub, divided by ${dimLabel(s.splits.find((x) => x.parent_id === id)?.dimension ?? '')}` : `${docs.length} documents`}</p>
      {cs.length > 0 && <><h3>Contradictions</h3>{cs.map((c) => <Row key={c.conflict_id} c={c} onClick={() => patch({ selectedConflict: c.conflict_id })} />)}</>}
      <h3>What it knows</h3>
      <ul className="know">
        {docs.slice(0, 12).map((d) => <li key={d!.doc_id}>{d!.title} <span className="muted">· {TYPE[d!.source_type] ?? d!.source_type}</span></li>)}
        {docs.length > 12 && <li className="muted">+{docs.length - 12} more</li>}
        {a.status === 'split' && a.children.map((c) => (
          <li key={c}><button className="link" onClick={() => patch({ selectedAgent: c })}>{s.agents.get(c)?.scope.value ?? c}</button></li>
        ))}
      </ul>
    </>
  );
}

// ---------- answer card: three levels ----------
function headline(t: string) {
  const clean = t.replace(/^\(fake\)\s*/, '').replace(/\s*\[[^\]]+\]/g, '');
  const parts = clean.split(/(?<=[.!?])\s+/);
  let out = parts[0] ?? clean;
  if (out.length < 70 && parts[1]) out += ' ' + parts[1];
  return out;
}

function AnswerCard({ q }: { q: QueryState }) {
  const s = useStore((x) => x);
  const [lvl, setLvl] = useState<'' | 'why' | 'sources'>('');
  const a = q.answer;
  if (!a) return <><div className="q">{q.question}</div><p className="muted">Asking the specialists that hold this…</p></>;
  const as = assessmentFor(q, s);
  const cs = a.conflicts.map((c) => s.conflicts.get(c.conflict_id) ?? c);
  const hero = [...cs].sort((x, y) => Number(!!y.hero) - Number(!!x.hero) || Number(y.status !== 'auto_resolved') - Number(x.status !== 'auto_resolved'))[0];
  const hs = hero ? sidesOf(hero, s) : [];
  const lose = hs.some((x) => x.wins) ? hs.find((x) => !x.wins) : undefined;
  const tt = as?.trust ? toneOf('trust', as.trust.verdict) : 'unk';
  const checks = as ? [
    ['Reliable', as.reliable?.verdict ?? '', toneOf('reliable', as.reliable.verdict)],
    ['Current', as.current?.verdict ?? '', toneOf('current', as.current.verdict)],
    ['Applies here', as.applies?.verdict ?? '', toneOf('applies', as.applies.verdict)],
  ] as const : [];
  return (
    <>
      <div className="q">{q.question}</div>
      <p className="ans">{renderBold(headline(a.answer)).map((x) => (x.b ? <b key={x.i}>{x.t}</b> : <span key={x.i}>{x.t}</span>))}</p>
      {as?.trust && (
        <div className={`verdict t-${tt}`}>
          <b>{as.trust.verdict}</b> <span className="muted">{as.trust.score}/100</span>
          {!!as.trust.factors?.length && <div className="why-chips">{as.trust.factors.map((f) => <span key={f.label} className={f.delta >= 0 ? 'up' : 'down'}>{f.delta >= 0 ? '+' : ''}{f.delta} {f.label}</span>)}</div>}
        </div>
      )}
      <ul className="checks">
        {checks.map(([l, v, t]) => <li key={l} className={`tk-${t}`}><i>{t === 'ok' ? '✓' : t === 'bad' ? '✕' : '!'}</i><b>{l}</b> {String(v ?? '').split(/[.;(]/)[0]}</li>)}
      </ul>
      {hero && <p className="warn">{lose ? <>Ignored <b>{lose.value}</b> ({TYPE[lose.source_type] ?? lose.source_type}, {lose.source}): {hero.plain_summary || hero.resolution}.</> : hero.plain_summary || hero.summary}</p>}
      {q.baseline && <p className="plain">Plain AI said: <s>{headline(q.baseline.answer)}</s></p>}
      <div className="lvl">
        <button className={lvl === 'why' ? 'on' : ''} onClick={() => setLvl(lvl === 'why' ? '' : 'why')}>why</button>
        <button className={lvl === 'sources' ? 'on' : ''} onClick={() => setLvl(lvl === 'sources' ? '' : 'sources')}>sources</button>
      </div>
      {lvl === 'why' && as && <Ledger a={as} cites={a.citations} />}
      {lvl === 'sources' && (
        <ol className="cites">
          {a.citations.map((c) => <li key={c.doc_id}>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title} <span className="muted">· {c.source}{c.date ? ` · ${c.date}` : ''}</span></li>)}
        </ol>
      )}
    </>
  );
}

// ---------- question bar: chips only while focused ----------
export function AskBar() {
  const user = useStore((x) => x.user);
  const who = useStore((x) => x.auth);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [golden, setGolden] = useState<GoldenQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.golden().then(setGolden); }, [user]);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    try { const { query_id } = await api.query(question.trim(), user); patch({ activeQueryId: query_id }); } catch (e) { console.error(e); } finally { setBusy(false); }
  };
  return (
    <div className="askbar" onFocus={() => setFocus(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false); }}>
      {focus && golden.length > 0 && (
        <div className="chips">
          {golden.slice(0, 5).map((g) => <button key={g.question} className="chip" onClick={() => { setQ(g.question); void ask(g.question); }}>{g.question}</button>)}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask as ${who?.display_name ?? 'guest'}…`} aria-label="Question" />
        <button className="btn primary" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </div>
  );
}

// ---------- under the hood ----------
export function Hood() {
  const s = useStore((x) => x);
  const [tab, setTab] = useState<'splits' | 'log'>('splits');
  if (!s.hood) return <button className="hood-open" onClick={() => patch({ hood: true })}>Under the hood</button>;
  return (
    <section className="hood">
      <header>
        <button className={tab === 'splits' ? 'on' : ''} onClick={() => setTab('splits')}>Split table</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Event log</button>
        <span className="lens">
          <button className={s.lens === 'scope' ? 'on' : ''} onClick={() => patch({ lens: 'scope' })}>scope</button>
          <button className={s.lens === 'debt' ? 'on' : ''} onClick={() => patch({ lens: 'debt' })}>knowledge debt</button>
        </span>
        {s.auth?.role === 'admin' && <>
          <button onClick={() => void api.ingest()} disabled={s.ingesting}>ingest</button>
          <button onClick={() => void api.reset()}>reset</button>
        </>}
        <button className="x" aria-label="Close" onClick={() => patch({ hood: false })}>×</button>
      </header>
      <RoutingHud />
      <div className="hood-body">
        {tab === 'splits' ? [...s.splits].reverse().map((sp) => (
          <div key={sp.split_id} className={`sp ${sp.kind === 'bud' ? 'bud' : ''}`}>
            <b>{sp.split_id}</b> {sp.parent_id} → {sp.children.join(', ')} · {sp.kind === 'bud' ? 'bud' : dimLabel(sp.dimension)}
            <div className="muted">{sp.reason}</div>
          </div>
        )) : s.log.slice(0, 120).map((l) => <div key={l.id} className="lg"><span className="muted">{fmtTime(l.ts)}</span> {l.text}</div>)}
      </div>
    </section>
  );
}
