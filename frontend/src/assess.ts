// Six-question assessment (contract C), derived in code from sources, conflicts,
// dates, scopes and owners. The mock engine emits it; the UI also uses it as a
// fallback when a backend answer arrives without one.
import type { Assessment, Conflict, Doc } from './types';

const STRONG = new Set(['official', 'law', 'cao']);
const WEAK = new Set(['forecast', 'slack', 'teams', 'email', 'ticket']);
const WEAK_LABEL: Record<string, string> = { forecast: 'forecast', slack: 'Slack', teams: 'Teams', email: 'email', ticket: 'ticket' };

export interface AssessInput {
  docs: Doc[]; // cited docs, with metadata
  conflicts: Conflict[];
  trust: number;
  experts: { name: string; role: string; agent_id: string }[];
  claimDoc: (claimId: string) => string | undefined;
  blocked?: boolean;
}

const ref = (d: Doc) => `[${d.doc_id}]`;
const mode = <T,>(xs: T[]) => {
  const m = new Map<T, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export function trustVerdict(score: number) {
  return score >= 75 ? 'trust' : score >= 45 ? 'verify first' : 'do not rely';
}

export function deriveAssessment(inp: AssessInput): Assessment {
  const { docs, conflicts, trust } = inp;
  if (inp.blocked || !docs.length) {
    const u = { verdict: 'unknown', evidence: inp.blocked ? 'Sources exist but are outside your access.' : 'No sources found.' };
    return { reliable: u, current: u, applies: u, gaps: { verdict: 'gap', evidence: u.evidence }, experts: inp.experts, trust: { score: trust, verdict: 'do not rely', reason: u.evidence } };
  }

  // Which docs lose a conflict (superseded / contradicted by a stronger source)?
  const loserDocs = new Set<string>();
  for (const c of conflicts) {
    if (c.kind === 'scope_difference') continue;
    const ds = c.claim_ids.map(inp.claimDoc).map((id) => docs.find((d) => d.doc_id === id)).filter(Boolean) as Doc[];
    if (ds.length < 2) continue;
    const sorted = [...ds].sort((a, b) => score(b) - score(a) || (b.date ?? '').localeCompare(a.date ?? ''));
    sorted.slice(1).forEach((d) => loserDocs.add(d.doc_id));
  }

  // Reliable
  const strong = docs.filter((d) => STRONG.has(d.source_type));
  const weak = docs.filter((d) => WEAK.has(d.source_type));
  const openC = conflicts.filter((c) => c.status === 'open');
  const verified = conflicts.filter((c) => c.status === 'verified');
  const reliable = {
    verdict: openC.some((c) => c.kind === 'true_contradiction') ? 'contested' : strong.length ? 'yes' : weak.length ? 'weak' : 'partly',
    evidence: [
      strong.length ? `${strong.length} authoritative ${strong.slice(0, 3).map(ref).join('')}` : 'No official or CAO source',
      weak.length ? `${weak.length} informal (${uniq(weak.map((d) => WEAK_LABEL[d.source_type] ?? d.source_type)).join(', ')}) ${weak.slice(0, 3).map(ref).join('')}${weak.every((d) => loserDocs.has(d.doc_id)) ? ', all overruled' : ''}` : '',
      verified.length ? `${verified.length} verified by an owner` : '',
    ].filter(Boolean).join('; ') + '.',
  };

  // Current
  const dated = docs.filter((d) => d.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const newest = dated[0];
  const superseded = conflicts.filter((c) => c.kind === 'temporal_supersession' || c.kind === 'forecast_vs_final');
  const staleCited = dated.filter((d) => loserDocs.has(d.doc_id) && (d.source_type === 'forecast' || superseded.some((c) => c.claim_ids.some((id) => inp.claimDoc(id) === d.doc_id))));
  const current = {
    verdict: newest ? (staleCited.length ? 'newest wins' : 'yes') : 'unknown',
    evidence: newest
      ? `Newest source ${fmtDate(newest.date)} ${ref(newest)}${staleCited.length ? `; ${staleCited.length} older or forecast source${staleCited.length > 1 ? 's' : ''} superseded ${staleCited.slice(0, 2).map(ref).join('')}` : ''}.`
      : 'Sources carry no dates.',
  };

  // Applies here
  const country = mode(docs.map((d) => d.country ?? 'BE'));
  const otherCountry = docs.filter((d) => (d.country ?? 'BE') !== country);
  const scopeDiff = conflicts.filter((c) => c.kind === 'scope_difference');
  const pcs = uniq(docs.map((d) => d.pc).filter(Boolean) as string[]);
  const clients = uniq(docs.map((d) => d.client).filter(Boolean) as string[]);
  const langs = uniq(docs.map((d) => d.language).filter(Boolean) as string[]);
  const applies = {
    verdict: otherCountry.length || scopeDiff.length ? 'depends on scope' : 'yes',
    evidence: [
      `${country}${pcs.length ? ` · ${pcs.join(', ')}` : ''}${clients.length ? ` · ${clients.join(', ')}` : ''}`,
      otherCountry.length ? `${otherCountry.length} source from ${uniq(otherCountry.map((d) => d.country ?? '?')).join('/')} set aside ${otherCountry.map(ref).join('')}` : '',
      scopeDiff.length ? `${scopeDiff.length} rule differs by joint committee` : '',
      langs.length > 1 ? `read across ${langs.map((l) => l.toUpperCase()).join('/')}` : '',
    ].filter(Boolean).join('; ') + '.',
  };

  // Gaps
  const ownerless = docs.filter((d) => d.owner === null);
  const gapsN = openC.length + ownerless.length;
  const gaps = {
    verdict: gapsN ? `${gapsN} gap${gapsN > 1 ? 's' : ''}` : 'none found',
    evidence: [
      openC.length ? `${openC.length} open conflict${openC.length > 1 ? 's' : ''}: ${openC[0].summary}` : '',
      ownerless.length ? `${ownerless.length} source without an owner ${ownerless.map(ref).join('')}` : '',
    ].filter(Boolean).join('; ') + (gapsN ? '.' : 'No open conflicts, every source has an owner.'),
  };

  const tv = trustVerdict(trust);
  const reason = tv === 'trust'
    ? `Backed by ${strong.length || docs.length} authoritative source${(strong.length || docs.length) > 1 ? 's' : ''}${verified.length ? ' and an owner verification' : ''}; ${openC.length ? `${openC.length} open item${openC.length > 1 ? 's' : ''}` : 'nothing open'}.`
    : tv === 'verify first'
      ? `Ask ${inp.experts[0]?.name ?? 'the owner'} before sending: ${openC.length ? `${openC.length} open conflict${openC.length > 1 ? 's' : ''}` : ''}${openC.length && ownerless.length ? ' and ' : ''}${ownerless.length ? 'an ownerless source' : ''}${!openC.length && !ownerless.length ? 'weak sourcing' : ''}.`
      : `Sources disagree and nobody has verified yet.`;
  return { reliable, current, applies, gaps, experts: inp.experts, trust: { score: trust, verdict: tv, reason } };
}

function score(d: Doc) { return STRONG.has(d.source_type) ? 3 : d.source_type === 'news' || d.source_type === 'policy' || d.source_type === 'faq' ? 2 : 1; }
function uniq<T>(xs: T[]) { return [...new Set(xs)]; }
function fmtDate(d?: string) {
  if (!d) return '';
  const t = new Date(d);
  return isNaN(+t) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
