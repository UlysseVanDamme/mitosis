import { deriveAssessment } from '../assess';
import { patch, type AppState, type QueryState } from '../store';
import type { Assessment, Citation } from '../types';

type Tone = 'ok' | 'mid' | 'bad' | 'unk';

export function toneOf(key: string, verdict: string): Tone {
  const v = (verdict || '').toLowerCase().trim();
  if (!v || /unknown|not checked/.test(v)) return 'unk';
  if (key === 'trust') return v === 'trust' ? 'ok' : v.startsWith('verify') ? 'mid' : 'bad';
  if (key === 'gaps') return /^(none|no gaps|0)/.test(v) ? 'ok' : /^([3-9]|\d\d)/.test(v) ? 'bad' : 'mid';
  if (/^(yes|current|reliable|applies|ok|verified|newest)/.test(v)) return 'ok';
  if (/^(no\b|stale|contested|unreliable|wrong|outdated|conflict)/.test(v)) return 'bad';
  return 'mid';
}

const ROWS: { key: keyof Omit<Assessment, 'experts' | 'trust'>; label: string }[] = [
  { key: 'reliable', label: 'Reliable' },
  { key: 'current', label: 'Current' },
  { key: 'applies', label: 'Applies here' },
  { key: 'gaps', label: 'Gaps' },
];

/** The assessment for an answer: the server's, or derived from what the client can see. */
export function assessmentFor(q: QueryState, s: AppState): Assessment | null {
  const a = q.answer;
  if (!a) return null;
  if (a.assessment) return a.assessment;
  const docs = (a.citations ?? []).map((c) => ({ ...c, ...s.docs.get(c.doc_id) , doc_id: c.doc_id, source_type: s.docs.get(c.doc_id)?.source_type ?? '' }));
  const experts = (a.leaves ?? []).map((l, i) => ({ name: a.owners?.[i] ?? s.agents.get(l)?.owner ?? 'owner', role: `owner of ${s.agents.get(l)?.scope.description ?? l}`, agent_id: l }));
  return deriveAssessment({
    docs, conflicts: a.conflicts ?? [], trust: a.trust, experts,
    claimDoc: (id) => s.claims.get(id)?.doc_id ?? id.split('#')[0],
    blocked: !a.citations?.length,
  });
}

/** Evidence text with inline [doc_id] refs turned into numbered source links. */
function Evidence({ text: raw, cites }: { text: string | string[]; cites: Citation[] }) {
  // The live backend sends evidence as a list of lines; the mock sends one string.
  const text = Array.isArray(raw) ? raw.join(' · ') : String(raw ?? '');
  const out: React.ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(/\[([A-Za-z0-9_\-.:#]+)\]/g)) {
    out.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    const i = cites.findIndex((c) => c.doc_id === m[1]);
    const c = cites[i];
    if (c) {
      const label = `${c.source}${c.date ? `, ${c.date}` : ''}`;
      out.push(c.url
        ? <a key={k++} className="ev-cite" href={c.url} target="_blank" rel="noreferrer" title={`${c.title} (${label})`}>{i + 1}</a>
        : <span key={k++} className="ev-cite" title={`${c.title} (${label})`}>{i + 1}</span>);
    }
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(<span key={k++}>{text.slice(last)}</span>);
  return <>{out}</>;
}

export function Ledger({ a, cites, portal }: { a: Assessment; cites: Citation[]; portal?: boolean }) {
  const tt = toneOf('trust', a.trust.verdict);
  return (
    <dl className={`ledger ${portal ? 'portal-ledger' : ''}`} aria-label="Can I trust this answer?">
      {ROWS.map((r) => {
        const c = a[r.key];
        if (!c) return null;
        const t = toneOf(r.key, c.verdict);
        return (
          <div className="lrow" key={r.key}>
            <dt>{r.label}</dt>
            <dd className="lv"><span className={`vchip v-${t}`}>{c.verdict}</span></dd>
            <dd className="le"><Evidence text={c.evidence} cites={cites} /></dd>
          </div>
        );
      })}
      <div className="lrow">
        <dt>Who knows</dt>
        <dd className="lv"><span className={`vchip v-${a.experts.length ? 'ok' : 'mid'}`}>{a.experts.length ? `${a.experts.length} owner${a.experts.length > 1 ? 's' : ''}` : 'nobody'}</span></dd>
        <dd className="le">
          {a.experts.length ? a.experts.slice(0, 3).map((x, i) => (
            <span key={x.agent_id + i} className="expert">
              {portal ? <b>{x.name}</b> : <button className="link" onClick={() => patch({ selectedAgent: x.agent_id })}>{x.name}</button>}
              <span className="dim"> {x.role}</span>{i < Math.min(3, a.experts.length) - 1 ? '; ' : ''}
            </span>
          )) : 'No owner covers this scope yet.'}
        </dd>
      </div>
      <div className={`lrow ltrust t-${tt}`}>
        <dt>Trust this answer</dt>
        <dd className="lv"><span className={`vchip v-${tt} strong`}>{a.trust.verdict}</span></dd>
        <dd className="le"><b className="mono">{a.trust.score}</b><span className="dim">/100 </span> {a.trust.reason}</dd>
      </div>
    </dl>
  );
}

/** What plain RAG can tell you about the same six questions: nothing. */
export function BlankLedger() {
  return (
    <dl className="ledger compact" aria-label="Plain RAG trust checks">
      {[...ROWS.map((r) => r.label), 'Who knows', 'Trust this answer'].map((l) => (
        <div className="lrow" key={l}><dt>{l}</dt><dd className="lv"><span className="vchip v-unk">not checked</span></dd></div>
      ))}
    </dl>
  );
}
