import { applyEvent, getState, onEvent, patch } from './store';
import type { Agent, GoldenQuestion, MitosisEvent, Role, User } from './types';
import { MockEngine } from './mock/engine';

const params = new URLSearchParams(location.search);
export const MOCK = params.get('mock') === '1';
let mock: MockEngine | null = null;

// ---------- auth ----------
const TOKEN_KEY = 'mitosis.token';
const USER_KEY = 'mitosis.user';
// Passcodes typed this session live in memory only (never in storage).
const typed = new Map<string, string>();

function load<T>(k: string): T | null {
  try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function save(k: string, v: unknown) {
  try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
}
let token: string | null = MOCK ? null : load<string>(TOKEN_KEY);

export class AuthError extends Error {}

/** Query access string for a role (mock engine + legacy `user` field). */
export function accessOf(u: User | null): string {
  if (!u) return 'public';
  if (u.role === 'client') {
    const acc = Array.isArray(u.access) ? u.access : u.access ? [u.access] : [];
    return acc.find((a) => a.startsWith('client:')) ?? 'client:Brouwerij Van Dessel';
  }
  return u.role === 'public' ? 'public' : 'consultant';
}

export const DEMO_USERS: User[] = [
  { username: 'sofie', display_name: 'Sofie', role: 'consultant', access: ['public', 'internal'] },
  { username: 'jan', display_name: 'Jan Peeters', role: 'expert', access: ['public', 'internal'] },
  { username: 'vandessel', display_name: 'Van Dessel HR', role: 'client', access: ['public', 'client:Brouwerij Van Dessel'] },
  { username: 'desk', display_name: 'Knowledge desk', role: 'admin', access: ['public', 'internal'] },
  { username: 'guest', display_name: 'Guest', role: 'public', access: ['public'] },
];

export const ROLE_LABEL: Record<Role, string> = {
  consultant: 'consultant', expert: 'PC 200 expert', client: 'client', admin: 'admin', public: 'public',
};

function setAuth(t: string | null, u: User | null) {
  token = t;
  if (!MOCK) { save(TOKEN_KEY, t); save(USER_KEY, u); }
  patch({ auth: u, user: accessOf(u), view: u?.role === 'client' ? getState().view : 'lab' });
}

export function logout() {
  setAuth(null, null);
  es?.close(); es = null;
  if (!MOCK) patch({ connected: false });
}

export async function users(): Promise<User[]> {
  if (MOCK) return DEMO_USERS;
  try {
    const r = await fetch('/api/users');
    if (r.ok) {
      const j = await r.json();
      const list = (Array.isArray(j) ? j : j.users) as User[] | undefined;
      if (Array.isArray(list) && list.length) {
        const order = DEMO_USERS.map((u) => u.username);
        const rank = (u: User) => { const i = order.indexOf(u.username); return i < 0 ? 99 : i; };
        return [...list].sort((a, b) => rank(a) - rank(b));
      }
    }
  } catch { /* fall through */ }
  return DEMO_USERS;
}

export function knowsPasscode(username: string) { return typed.has(username); }

export async function login(username: string, passcode?: string): Promise<User> {
  const pc = passcode ?? typed.get(username);
  if (pc == null) throw new AuthError('Passcode needed');
  if (MOCK) {
    const u = DEMO_USERS.find((x) => x.username === username);
    if (!u) throw new AuthError('Unknown user');
    typed.set(username, pc);
    setAuth(`mock.${username}`, u);
    return u;
  }
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, passcode: pc }) });
  if (r.status === 401 || r.status === 403) { typed.delete(username); throw new AuthError('Wrong passcode'); }
  if (r.status === 429) throw new AuthError('Too many attempts, wait a moment');
  if (!r.ok) throw new AuthError(`Login failed (${r.status})`);
  const j = (await r.json()) as { token: string; user: User };
  typed.set(username, pc);
  setAuth(j.token, j.user);
  openStream(); // events are filtered per user: reconnect with the new identity
  return j.user;
}

async function authFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const r = await fetch(`/api${path}`, { ...init, headers });
  if (r.status === 401) { logout(); throw new AuthError('Session expired'); }
  return r;
}

async function post(path: string, body?: unknown) {
  const r = await authFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json().catch(() => ({}));
}

// ---------- event stream ----------
let es: EventSource | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;

function openStream() {
  if (retry) { clearTimeout(retry); retry = null; }
  es?.close(); es = null;
  if (!token) return;
  const mine = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  es = mine;
  mine.onopen = () => patch({ connected: true });
  mine.onmessage = (m) => {
    try { applyEvent(JSON.parse(m.data) as MitosisEvent); } catch (err) { console.warn('bad event', err); }
  };
  mine.onerror = () => {
    if (es !== mine) return;
    patch({ connected: false });
    mine.close(); es = null;
    retry = setTimeout(() => { if (token) openStream(); }, 1500);
  };
  // In case the server does not push a snapshot on connect, pull the (access-filtered) state once.
  authFetch('/state').then((r) => (r.ok ? r.json() : null)).then((st) => {
    if (st) applyEvent({ type: 'snapshot', ts: Date.now() / 1000, state: st });
  }).catch(() => {});
}

export function connect() {
  if (MOCK) {
    mock = new MockEngine((e) => applyEvent(e));
    patch({ connected: true });
    mock.snapshot();
    // Mock: signed in as ?as=<username> (default Sofie) so the demo runs without a login step.
    if (params.get('login') !== '1') void login(params.get('as') ?? 'sofie', 'mock');
    if (params.get('view') === 'portal') patch({ view: 'portal' });
    if (params.get('lens') === 'debt') patch({ lens: 'debt' });
    if (params.get('autostart') !== '0') void mock.ingest();
    const sel = params.get('select');
    if (sel) onEvent((e) => { if (e.type === 'ingest_done') patch({ selectedAgent: sel }); });
    const aq = params.get('autoquery');
    if (aq != null) {
      const m = mock;
      onEvent((e) => {
        if (e.type !== 'ingest_done') return;
        const st = getState();
        const list = m.golden(st.user);
        const g = list[Number(aq) || 0] ?? list[0];
        m.query(g.question, st.user).then(({ query_id }) => patch({ activeQueryId: query_id }));
      });
    }
    return;
  }
  const u = load<User>(USER_KEY);
  if (token && u) { patch({ auth: u, user: accessOf(u) }); openStream(); }
}

export const api = {
  ingest: () => (mock ? void mock.ingest() : post('/ingest', { corpus: 'demo' })),
  reset: () => (mock ? mock.reset() : post('/reset')),
  replay: () => (mock ? void mock.ingest(2.2) : post('/replay', {})),
  /** Hold the (mock) stream during a story-beat pause; the live backend keeps streaming. */
  pause: () => { mock?.pause(); },
  resume: () => { mock?.resume(); },
  async query(question: string, user: string): Promise<{ query_id: string }> {
    if (mock) return mock.query(question, user);
    const res = await post('/query', { question, user });
    // Baseline side-by-side; attach to this query id.
    post('/baseline', { question }).then((b) => {
      if (b && typeof b.answer === 'string') {
        applyEvent({ type: 'baseline_answer', ts: Date.now() / 1000, query_id: res.query_id, answer: b.answer, retrieved: b.retrieved ?? [] });
      }
    }).catch(() => {});
    return res;
  },
  // The verifier is taken from the token server-side; `by` only feeds the mock.
  verify: (conflict_id: string, winning_claim_id: string, by: string) =>
    (mock ? mock.verify(conflict_id, winning_claim_id, by) : post('/verify', { conflict_id, winning_claim_id })),
  async agent(id: string): Promise<Agent | null> {
    if (mock) return mock.agent(id, getState().user) as Agent | null;
    const r = await authFetch(`/agents/${encodeURIComponent(id)}`);
    return r.ok ? r.json() : null;
  },
  async golden(): Promise<GoldenQuestion[]> {
    if (mock) return mock.golden(getState().user);
    try {
      const r = await authFetch('/golden');
      if (r.ok) {
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.questions;
        if (Array.isArray(list) && list.length) return list;
      }
    } catch { /* fall through */ }
    return FALLBACK_GOLDEN;
  },
};

const FALLBACK_GOLDEN: GoldenQuestion[] = [
  { question: 'I just inherited Brouwerij Van Dessel. What indexation do I apply in the January run, and to which pay components?', user: 'consultant', wow: 'Inherited portfolio' },
  { question: 'What indexation applies to PC 200 salaries on 1 January 2026?', user: 'consultant', wow: 'Forecast vs final' },
  { question: 'Which PC 200 clients have open tickets about the January indexation, and what should we apply for each?', user: 'consultant', wow: 'Cross-source' },
  { question: 'Is the maximum telework allowance still EUR 148.73 per month?', user: 'consultant', wow: 'Supersession' },
  { question: 'How much are eco-cheques in construction compared to PC 200?', user: 'consultant', wow: 'Scope difference' },
  { question: 'What indexation base does Brouwerij Van Dessel use?', user: 'public', wow: 'Access control' },
];
