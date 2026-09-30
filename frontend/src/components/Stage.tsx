// Stage mode (docs/STAGE_MODE.md): the default presentation view.
// "The swarm reads, divides, and catches contradictions by itself, before anyone asks."
// Three colours, three numbers, scope names only, one spotlight at a time.
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Scene } from '../canvas/Scene';
import { accessOf, api, knowsPasscode, login, MOCK } from '../api';
import { getState, inboxOf, onEvent, patch, stats, useStore, type AppState, type QueryState } from '../store';
import type { Agent, Conflict, Side } from '../types';
import { UserSwitcher } from './Auth';
import { assessmentFor, Ledger, toneOf } from './Trust';
import { claimsOf, renderBold, winnerOf } from './util';

type SceneRef = MutableRefObject<Scene | null>;

const PLAIN_DIM: Record<string, string> = {
  pc: 'joint committee', country: 'country', client: 'client', period: 'time period', topic: 'topic', source_type: 'kind of source',
};
const TYPE_LABEL: Record<string, string> = {
  official: 'Official', law: 'Law', news: 'News', forecast: 'Forecast', policy: 'Policy', ticket: 'Ticket', slack: 'Slack',
  cao: 'Company CAO', email: 'Email', faq: 'FAQ', teams: 'Teams', config: 'Payroll config',
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;
const niceDate = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(+x) ? d : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ---------- story beats (space bar) ----------
const story = { armed: false, held: null as string | null, reask: false, heldSeen: false };
const holdListeners = new Set<() => void>();
function setHeld(id: string | null) { story.held = id; holdListeners.forEach((l) => l()); }

async function as(username: string): Promise<boolean> {
  const s = getState();
  if (s.auth?.username === username) return true;
  if (MOCK || knowsPasscode(username)) {
    try { await login(username, MOCK ? 'mock' : undefined); return true; } catch { /* fall through */ }
  }
  patch({ loginFor: username });
  return false;
}

async function askHandover() {
  if (!(await as('sofie'))) return;
  const list = await api.golden();
  const g = list.find((x) => /inherit|Van Dessel/i.test(x.question) && !/base does/i.test(x.question)) ?? list[0];
  const { query_id } = await api.query(g.question, accessOf(getState().auth));
  patch({ activeQueryId: query_id });
}

function sideClaim(c: Conflict, s: AppState): string {
  const w = c.sides?.find((x) => x.wins);
  if (w) {
    const id = c.claim_ids.find((cid) => (s.claims.get(cid)?.doc_id ?? cid.split('#')[0]) === w.doc_id);
    if (id) return id;
  }
  return winnerOf(c, claimsOf(c, s), s) ?? c.claim_ids[0];
}

/** Verify every open conflict in a cell (the owner decides the whole inbox). */
export async function verifyCell(agentId: string, only?: string[]) {
  const s = getState();
  const me = s.auth;
  const open = [...s.conflicts.values()].filter((c) => c.status === 'open' && (only ? only.includes(c.conflict_id) : c.agent_id === agentId));
  for (const c of open) {
    try { await api.verify(c.conflict_id, sideClaim(c, s), me?.display_name ?? 'Jan Peeters'); } catch (e) { console.warn(e); }
  }
  story.reask = true;
}

export async function advance() {
  const s = getState();
  if (story.held) { setHeld(null); api.resume(); return; }
  if (!s.ingesting && !s.ingestDone && s.docsAbsorbed.size === 0) {
    story.armed = true; story.heldSeen = false;
    if (s.auth?.role !== 'admin' && !MOCK) { if (!(await as('desk'))) return; }
    try { await api.replay(); } catch { await api.ingest(); }
    return;
  }
  if (s.ingesting) return;
  const q = s.activeQueryId ? s.queries.get(s.activeQueryId) : undefined;
  if (!q) { await askHandover(); return; }
  if (!q.answer) return;
  const open = q.answer.conflicts.map((c) => s.conflicts.get(c.conflict_id) ?? c).filter((c) => c.status === 'open');
  if (open.length) {
    if (!(await as('jan'))) return;
    await verifyCell(open[0].agent_id, open.map((c) => c.conflict_id));
    return;
  }
  if (story.reask) { story.reask = false; await askHandover(); return; }
  patch({ activeQueryId: null });
}

function nextBeat(s: AppState): string {
  if (story.held) return 'continue';
  if (!s.ingesting && !s.ingestDone && s.docsAbsorbed.size === 0) return 'start reading';
  if (s.ingesting) return '';
  const q = s.activeQueryId ? s.queries.get(s.activeQueryId) : undefined;
  if (!q) return 'ask as Sofie';
  if (!q.answer) return '';
  if (q.answer.conflicts.some((c) => (s.conflicts.get(c.conflict_id) ?? c).status === 'open')) return 'verify as Jan Peeters';
  if (story.reask) return 'ask again';
  return 'close answer';
}

// ---------- screen tracking ----------
function useCellPos(sceneRef: SceneRef, id: string | null) {
  const [p, setP] = useState<{ x: number; y: number; r: number } | null>(null);
  useEffect(() => {
    if (!id) { setP(null); return; }
    let raf = 0;
    const tick = () => {
      const q = sceneRef.current?.screenOf(id) ?? null;
      setP((o) => (q && o && Math.abs(o.x - q.x) < 0.5 && Math.abs(o.y - q.y) < 0.5 && Math.abs(o.r - q.r) < 0.5 ? o : q));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [id, sceneRef]);
  return p;
}

// ---------- the view ----------
export function Stage({ sceneRef }: { sceneRef: SceneRef }) {
  const mode = useStore((x) => x.mode);
  const s = useStore((x) => x);
  const [queue, setQueue] = useState<string[]>([]);
  const [spot, setSpot] = useState<{ id: string; phase: 'out' | 'hold' | 'back' } | null>(null);
  const [divide, setDivide] = useState<{ text: string; k: number } | null>(null);
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); holdListeners.add(l); return () => { holdListeners.delete(l); }; }, []);

  // Collect beats from the event stream.
  useEffect(() => onEvent((e, st) => {
    if (st.mode !== 'stage') return;
    if (e.type === 'agent_split') {
      setDivide({ text: `divided by ${PLAIN_DIM[e.split.dimension] ?? e.split.dimension}`, k: Date.now() });
    } else if (e.type === 'conflict_detected' && e.conflict.hero) {
      setQueue((q) => (q.includes(e.conflict.conflict_id) ? q : [...q, e.conflict.conflict_id]));
    } else if (e.type === 'reset' || (e.type === 'snapshot' && !e.keepLayout)) {
      setQueue([]); setSpot(null); setHeld(null);
    }
  }), []);
  useEffect(() => { if (!divide) return; const t = setTimeout(() => setDivide(null), 3000); return () => clearTimeout(t); }, [divide]);

  // Spotlight sequencer: one at a time, never overlapping.
  useEffect(() => {
    if (spot || !queue.length) return;
    const t = setTimeout(() => { setSpot({ id: queue[0], phase: 'out' }); setQueue((q) => q.slice(1)); }, 350);
    return () => clearTimeout(t);
  }, [spot, queue]);
  useEffect(() => {
    if (!spot) return;
    if (spot.phase === 'out') {
      const t = setTimeout(() => {
        if (story.armed && !story.heldSeen) { story.heldSeen = true; setHeld(spot.id); api.pause(); }
        setSpot({ ...spot, phase: 'hold' });
      }, 700);
      return () => clearTimeout(t);
    }
    if (spot.phase === 'hold') {
      if (story.held === spot.id) return; // wait for the space bar
      const t = setTimeout(() => setSpot({ ...spot, phase: 'back' }), 3800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSpot(null), 650);
    return () => clearTimeout(t);
  }, [spot, story.held]);

  const spotConflict = spot ? s.conflicts.get(spot.id) : undefined;
  const qOpen = !!s.activeQueryId;
  const ownerCell = !spot && !qOpen && !s.ingesting ? focusCell(s)?.a.agent_id ?? null : null;
  const catchCell = spotConflict && spot?.phase !== 'back' ? spotConflict.agent_id : null;
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc) return;
    sc.spotlight = mode === 'stage' ? catchCell ?? ownerCell : null;
    sc.spotRed = !!catchCell;
  }, [mode, catchCell, ownerCell, sceneRef]);

  // Keys: space = next beat.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space' && getState().auth && getState().loginFor == null) { e.preventDefault(); void advance(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (mode !== 'stage') return null;
  const st = stats(s);
  const pending = queue.length + (spot && spot.phase !== 'back' ? 1 : 0);
  const caught = Math.max(0, st.conflicts - pending);
  const q = s.activeQueryId ? s.queries.get(s.activeQueryId) : undefined;
  const beat = nextBeat(s);

  return (
    <div className="st" aria-live="polite">
      <header className="st-top">
        <div className="st-brand">
          <svg width="26" height="19" viewBox="0 0 30 22" aria-hidden><circle cx="10" cy="11" r="8.5" className="glyph-a" /><circle cx="20" cy="11" r="8.5" className="glyph-b" /></svg>
          Mitosis
        </div>
        <div className="st-nums">
          <Num v={st.docs} l="documents read" />
          <Num v={st.leaves} l="specialists" />
          <Num v={caught} l="contradictions caught" tone={caught ? 'red' : ''} />
        </div>
        <div className="st-me"><UserSwitcher /></div>
      </header>
      {divide && !spot && <div key={divide.k} className="st-divide">{divide.text}</div>}
      {spot && spotConflict && <Catch sceneRef={sceneRef} c={spotConflict} phase={spot.phase} held={story.held === spot.id} />}
      {!spot && !q && <Owner sceneRef={sceneRef} />}
      {q && <StageAnswer q={q} sceneRef={sceneRef} />}
      <div className="st-foot">
        {beat && <span><kbd>space</kbd> {beat}</span>}
        <span><kbd>E</kbd> explore</span>
      </div>
    </div>
  );
}

function Num({ v, l, tone }: { v: number; l: string; tone?: string }) {
  const [bump, setBump] = useState(false);
  const prev = useRef(v);
  useEffect(() => {
    if (v === prev.current) return;
    prev.current = v; setBump(true);
    const t = setTimeout(() => setBump(false), 500);
    return () => clearTimeout(t);
  }, [v]);
  return (
    <div className={`st-num ${tone ?? ''}`}>
      <b className={bump ? 'bump' : ''}>{v}</b>
      <span>{l}</span>
    </div>
  );
}

// ---------- frame 2: CATCH ----------
function sidesOf(c: Conflict, s: AppState): Side[] {
  if (c.sides?.length) return c.sides.slice(0, 2);
  const cl = claimsOf(c, s);
  const w = winnerOf(c, cl, s);
  return cl.slice(0, 2).map((x) => {
    const d = s.docs.get(x.doc_id);
    return { value: x.value, source: d?.source ?? x.doc_id, source_type: d?.source_type ?? '', date: d?.date, doc_id: x.doc_id, wins: x.claim_id === w };
  });
}

function Catch({ sceneRef, c, phase, held }: { sceneRef: SceneRef; c: Conflict; phase: 'out' | 'hold' | 'back'; held: boolean }) {
  const s = getState();
  const p = useCellPos(sceneRef, c.agent_id);
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  if (!p) return null;
  const W = Math.min(window.innerWidth - 32, 700);
  const above = p.y - p.r - 250 > 150;
  const ax = Math.max(W / 2 + 16, Math.min(window.innerWidth - W / 2 - 16, p.x));
  const ay = above ? p.y - p.r - 30 : Math.min(window.innerHeight - 250, p.y + p.r + 30);
  const out = shown && phase !== 'back';
  const sides = sidesOf(c, s);
  const decided = sides.some((x) => x.wins);
  return (
    <div className={`catch ${out ? 'out' : ''} ${above ? 'above' : 'below'}`} style={{ left: ax, top: ay, width: W, ['--dx' as string]: `${p.x - ax}px` }}>
      <div className="catch-cards">
        {sides.map((x, i) => (
          <div key={x.doc_id + i} className={`src ${decided ? (x.wins ? 'win' : 'lose') : ''}`} style={{ transitionDelay: `${i * 70}ms` }}>
            <div className="src-v">{x.value}</div>
            <div className="src-s">{x.source}</div>
            <div className="src-m">{typeLabel(x.source_type)}{x.date ? ` · ${niceDate(x.date)}` : ''}</div>
            {decided && <div className="src-tag">{x.wins ? 'wins' : 'replaced'}</div>}
          </div>
        ))}
      </div>
      <div className="catch-verdict">{c.plain_summary || c.summary}</div>
      {c.cross_agent && <div className="catch-sub">caught across two specialists</div>}
      {held && <div className="catch-sub"><kbd>space</kbd> continue</div>}
    </div>
  );
}

// ---------- frame 3: TELL THE RIGHT PERSON ----------
function focusCell(s: AppState): { a: Agent; n: number } | null {
  let best: { a: Agent; n: number } | null = null;
  for (const a of s.agents.values()) {
    if (a.status !== 'active') continue;
    const n = inboxOf(a, s);
    if (!n) continue;
    const score = n + (a.owner === 'Jan Peeters' ? 0.5 : 0);
    if (!best || score > best.n + (best.a.owner === 'Jan Peeters' ? 0.5 : 0)) best = { a, n };
  }
  return best;
}

function Owner({ sceneRef }: { sceneRef: SceneRef }) {
  const s = useStore((x) => x);
  const f = focusCell(s);
  const [done, setDone] = useState<{ id: string; by: string } | null>(null);
  useEffect(() => onEvent((e) => {
    if (e.type === 'conflict_verified') setDone({ id: e.conflict.agent_id, by: e.fact.verified_by });
  }), []);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(null), 3200); return () => clearTimeout(t); }, [done]);
  const id = f?.a.agent_id ?? done?.id ?? null;
  const p = useCellPos(sceneRef, id);
  if (!p || !id || s.ingesting) return null;
  const ag = s.agents.get(id)!;
  const impact = [...s.impacts.values()].pop();
  const me = s.auth;
  const can = me?.role === 'admin' || me?.username === 'jan' || me?.role === 'expert';
  // Callout in the free margin beside the colony, tied to its cell by a leader line.
  const W = 360;
  const vw = window.innerWidth;
  const left = p.x < vw / 2;
  const bx = left ? 40 : vw - 40 - W;
  const by = Math.max(170, Math.min(window.innerHeight - 220, p.y - 44));
  const ex = left ? bx + W : bx; // box edge the line leaves from
  const ang = Math.atan2(by + 24 - p.y, ex - p.x);
  const cx = p.x + Math.cos(ang) * (p.r + 6), cy = p.y + Math.sin(ang) * (p.r + 6);
  return (
    <>
      <svg className="owner-line" width="100%" height="100%" aria-hidden>
        <line x1={ex} y1={by + 24} x2={cx} y2={cy} className={f ? '' : 'ok'} />
        <circle cx={cx} cy={cy} r={3.5} className={f ? '' : 'ok'} />
      </svg>
      <div className={`owner ${f ? '' : 'ok'} ${left ? 'l' : 'r'}`} style={{ left: bx, top: by, width: W }}>
        {f ? (
          <>
            <div className="owner-h"><b>{ag.owner || 'No owner'}</b> · {f.n} to decide</div>
            {impact && <div className="owner-impact">{impact.summary}</div>}
            {s.ingestDone && (can
              ? <button className="st-btn" onClick={() => void verifyCell(id)}>Verify</button>
              : <div className="owner-note">Only Jan Peeters (owner) can verify</div>)}
          </>
        ) : (
          <div className="owner-h">Verified by <b>{done?.by}</b></div>
        )}
      </div>
    </>
  );
}

// ---------- frame 4: ANSWER ----------
function headline(t: string) {
  const parts = t.split(/(?<=[.!?])\s+/);
  let out = parts[0] ?? t;
  if (out.length < 70 && parts[1]) out += ' ' + parts[1];
  return out;
}

function StageAnswer({ q, sceneRef }: { q: QueryState; sceneRef: SceneRef }) {
  const s = useStore((x) => x);
  const [details, setDetails] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current, sc = sceneRef.current;
    if (!el || !sc) return;
    const ro = new ResizeObserver(() => { sc.insetBottom = el.offsetHeight + 24; });
    ro.observe(el);
    return () => { ro.disconnect(); sc.insetBottom = 0; };
  }, [sceneRef]);
  const a = q.answer;
  const as = a ? assessmentFor(q, s) : null;
  const conflicts = a ? a.conflicts.map((c) => s.conflicts.get(c.conflict_id) ?? c) : [];
  const open = conflicts.filter((c) => c.status === 'open');
  const verified = conflicts.filter((c) => c.status === 'verified');
  const owner = as?.experts[0]?.name ?? a?.owners[0] ?? 'the owner';
  const top = a?.citations.map((c) => ({ c, d: s.docs.get(c.doc_id) })).find((x) => ['official', 'law', 'cao'].includes(x.d?.source_type ?? ''));
  // The warning names what was ignored: prefer a hero conflict a human had to (or has to) decide.
  const rank = (c: Conflict) => (c.hero ? 2 : 0) + (c.status !== 'auto_resolved' ? 1 : 0);
  const hero = [...conflicts].sort((x, y) => rank(y) - rank(x))[0];
  const lose = hero ? sidesOf(hero, s).find((x) => !x.wins && sidesOf(hero, s).some((y) => y.wins)) : undefined;
  const tone = !a ? '' : open.length ? 'warn' : as && toneOf('trust', as.trust.verdict) === 'ok' ? 'good' : verified.length ? 'good' : '';
  const ticks: { ok: 'ok' | 'mid' | 'bad'; label: string; text: string }[] = as ? [
    { ok: toneOf('reliable', as.reliable.verdict) === 'ok' || top ? 'ok' : 'mid', label: 'Reliable source', text: top ? `${top.c.source}, ${typeLabel(top.d?.source_type ?? '').toLowerCase()}` : as.reliable.verdict },
    { ok: toneOf('applies', as.applies.verdict) === 'bad' ? 'bad' : toneOf('applies', as.applies.verdict) === 'ok' ? 'ok' : 'mid', label: 'Applies here', text: short(as.applies.verdict) },
    { ok: open.length ? 'mid' : 'ok', label: 'Owner', text: open.length ? `${owner} must confirm` : verified.length ? `verified by ${verified[0].verified_by ?? owner}` : owner },
  ] : [];
  return (
    <section ref={ref} className={`st-ans ${tone}`} aria-label="Answer">
      <div className="st-ans-q">{q.question}</div>
      {!a ? (
        <div className="st-ans-wait">Asking the specialists that hold this, each with its whole domain in context…</div>
      ) : (
        <>
          <p className="st-ans-h">{renderBold(headline(a.answer)).map((x) => (x.b ? <b key={x.i}>{x.t}</b> : <span key={x.i}>{x.t}</span>))}</p>
          <ul className="st-ticks">
            {ticks.map((t) => (
              <li key={t.label} className={`tk-${t.ok}`}>
                <i aria-hidden>{t.ok === 'ok' ? '✓' : t.ok === 'bad' ? '✕' : '!'}</i>
                <span><b>{t.label}</b>{t.text}</span>
              </li>
            ))}
          </ul>
          {hero && (
            <p className="st-warn">
              {lose ? <>Ignored <b>{lose.value}</b> ({typeLabel(lose.source_type).toLowerCase()}, {lose.source}): {lowerFirst(hero.plain_summary || hero.resolution)}.</> : <>{hero.plain_summary || hero.summary}</>}
            </p>
          )}
          {q.baseline && <p className="st-plain">Plain AI said: <s>{headline(q.baseline.answer.replace(/\[[^\]]+\]/g, ''))}</s></p>}
          <button className="st-details" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'hide details' : 'details'}</button>
          {details && as && <div className="st-ledger"><Ledger a={as} cites={a.citations} /></div>}
        </>
      )}
      <button className="st-x" aria-label="Close answer" onClick={() => patch({ activeQueryId: null })}>×</button>
    </section>
  );
}

function short(t: string) { const x = t.split(/[.;:(]/)[0]; return x.length > 60 ? x.slice(0, 58) + '…' : x; }
function lowerFirst(t: string) { const x = t.replace(/[.]\s*$/, ''); return x.charAt(0).toLowerCase() + x.slice(1); }
