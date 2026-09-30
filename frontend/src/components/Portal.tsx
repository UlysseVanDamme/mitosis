import { useEffect, useState } from 'react';
import { api } from '../api';
import { patch, useStore } from '../store';
import type { GoldenQuestion } from '../types';
import { Ledger, assessmentFor, toneOf } from './Trust';
import { UserSwitcher } from './Auth';
import { renderBold } from './util';

const BADGE: Record<string, string> = { ok: 'Trusted answer', mid: 'Check with your consultant', bad: 'Do not rely on this yet', unk: 'Not enough information' };

/** Client-facing self-service view: neutral portal styling, same trusted-answer card. */
export function Portal() {
  const s = useStore((x) => x);
  const client = s.user.startsWith('client:') ? s.user.slice(7) : 'your company';
  const [q, setQ] = useState('');
  const [golden, setGolden] = useState<GoldenQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.golden().then(setGolden); }, [s.user]);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    try { const { query_id } = await api.query(question.trim(), s.user); patch({ activeQueryId: query_id }); } finally { setBusy(false); }
  };
  const cur = s.activeQueryId ? s.queries.get(s.activeQueryId) : undefined;
  const a = cur?.answer;
  const as = cur ? assessmentFor(cur, s) : null;
  const tone = as ? toneOf('trust', as.trust.verdict) : 'unk';
  return (
    <div className="portal">
      <header className="p-top">
        <div className="p-brand"><span className="p-mark" aria-hidden />HR self-service</div>
        <nav className="p-nav" aria-label="Portal"><span>Payroll</span><span className="on">Ask payroll</span><span>Documents</span><span>People</span></nav>
        <div className="p-right">
          <button className="p-lab" onClick={() => patch({ view: 'lab' })}>Open lab view</button>
          <UserSwitcher />
        </div>
      </header>
      <main className="p-main">
        <div className="p-intro">
          <span className="p-client">{client}</span>
          <h1>Ask payroll</h1>
          <p>Answers come from the sources that apply to your company, with who is accountable for them. Other clients' data is never used.</p>
        </div>
        <form className="p-ask" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Is our shift premium indexed in January?" aria-label="Question" />
          <button className="p-btn" disabled={busy || !q.trim()}>Ask</button>
        </form>
        <div className="p-chips">
          {golden.map((g) => <button key={g.question} onClick={() => { setQ(g.question); void ask(g.question); }}>{g.question}</button>)}
        </div>
        {cur && (
          <section className="p-card" aria-live="polite">
            <div className="p-q">{cur.question}</div>
            {!a || !as ? <div className="p-wait"><i /><i /><i /> Checking sources, dates and owners…</div> : (
              <>
                <div className={`p-badge b-${tone}`}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>{tone === 'ok' ? <path d="M3 7.2 5.8 10 11 4" fill="none" stroke="currentColor" strokeWidth="1.8" /> : <path d="M7 3v5M7 10.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</svg>
                  {BADGE[tone]}<span>trust {as.trust.score}/100</span>
                </div>
                <p className="p-answer">{renderBold(a.answer.replace(/\s*\[[^\]]+\]/g, '')).map((p) => (p.b ? <b key={p.i}>{p.t}</b> : <span key={p.i}>{p.t}</span>))}</p>
                <Ledger a={as} cites={a.citations} portal />
                {a.citations.length > 0 && (
                  <ol className="p-sources">
                    {a.citations.map((c, i) => (
                      <li key={c.doc_id}><span className="n">{i + 1}</span>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}<span className="d">{c.source}{c.date ? ` · ${c.date}` : ''}</span></li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
