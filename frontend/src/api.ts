import { applyEvent, patch } from './store';
import type { Agent, GoldenQuestion, MitosisEvent } from './types';
import { MockEngine } from './mock/engine';

const params = new URLSearchParams(location.search);
export const MOCK = params.get('mock') === '1';
let mock: MockEngine | null = null;

export function connect() {
  if (MOCK) {
    mock = new MockEngine((e) => applyEvent(e));
    patch({ connected: true });
    mock.snapshot();
    if (params.get('autostart') === '1') void mock.ingest();
    return;
  }
  let es: EventSource | null = null;
  const open = () => {
    es = new EventSource('/api/events');
    es.onopen = () => patch({ connected: true });
    es.onmessage = (m) => {
      try { applyEvent(JSON.parse(m.data) as MitosisEvent); } catch (err) { console.warn('bad event', err); }
    };
    es.onerror = () => {
      patch({ connected: false });
      es?.close();
      setTimeout(open, 1500);
    };
  };
  open();
  // In case the server does not push a snapshot on connect, pull state once.
  fetch('/api/state').then((r) => (r.ok ? r.json() : null)).then((st) => {
    if (st) applyEvent({ type: 'snapshot', ts: Date.now() / 1000, state: st });
  }).catch(() => {});
}

async function post(path: string, body?: unknown) {
  const r = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json().catch(() => ({}));
}

export const api = {
  ingest: () => (mock ? void mock.ingest() : post('/ingest', { corpus: 'demo' })),
  reset: () => (mock ? mock.reset() : post('/reset')),
  replay: () => (mock ? void mock.ingest(2.2) : post('/replay', {})),
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
  verify: (conflict_id: string, winning_claim_id: string, by: string) =>
    (mock ? mock.verify(conflict_id, winning_claim_id, by) : post('/verify', { conflict_id, winning_claim_id, by })),
  async agent(id: string): Promise<Agent | null> {
    if (mock) return mock.agent(id) as Agent | null;
    const r = await fetch(`/api/agents/${id}`);
    return r.ok ? r.json() : null;
  },
  async golden(): Promise<GoldenQuestion[]> {
    if (mock) return mock.golden();
    try {
      const r = await fetch('/api/golden');
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
  { question: 'What indexation applies to PC 200 salaries on 1 January 2026?', user: 'consultant', wow: 'Forecast vs final' },
  { question: 'Which PC 200 clients have open tickets about the January indexation, and what should we apply for each?', user: 'consultant', wow: 'Cross-source' },
  { question: 'Is the maximum telework allowance still EUR 148.73 per month?', user: 'consultant', wow: 'Supersession' },
  { question: 'How much are eco-cheques in construction compared to PC 200?', user: 'consultant', wow: 'Scope difference' },
  { question: 'What indexation base does Brouwerij Van Dessel use?', user: 'public', wow: 'Access control' },
];
