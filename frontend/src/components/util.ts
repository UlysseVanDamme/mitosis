import type { AppState } from '../store';
import type { Claim, Conflict } from '../types';
import { DIM_HUE, SOURCE_HUE, oklch } from '../canvas/color';

export const KIND_LABEL: Record<string, string> = {
  forecast_vs_final: 'Forecast vs final',
  temporal_supersession: 'Superseded',
  scope_difference: 'Scope difference',
  true_contradiction: 'Contradiction',
};

export function dimColor(dim: string, l = 0.8, a = 1) {
  const [h, c] = DIM_HUE[dim] ?? DIM_HUE.root;
  return oklch(l, c, h, a);
}
export function srcColor(st: string, l = 0.8, a = 1) {
  const [h, c] = SOURCE_HUE[st] ?? [210, 0.05];
  return oklch(l, c, h, a);
}

export function claimsOf(c: Conflict, s: AppState): Claim[] {
  return c.claim_ids.map((id) => s.claims.get(id) ?? c.claims?.find((x) => x.claim_id === id)).filter(Boolean) as Claim[];
}

/** Best guess at the winning claim from the resolution text (schema has no winner field). */
export function winnerOf(c: Conflict, claims: Claim[], s: AppState): string | null {
  if (c.kind === 'scope_difference') return null;
  if (c.status === 'verified') {
    const f = s.facts.find((x) => claims.some((cl) => x.sources.includes(cl.doc_id)) && x.agent_id === c.agent_id)
      ?? s.facts.find((x) => claims.some((cl) => x.sources.includes(cl.doc_id)));
    const w = f && claims.find((cl) => f.sources.includes(cl.doc_id));
    if (w) return w.claim_id;
  }
  const res = (c.resolution || '').toLowerCase();
  if (/unresolved|needs verification|needs an owner/.test(res)) return null;
  let best: string | null = null, bestScore = -1, bestDate = '';
  for (const cl of claims) {
    const d = s.docs.get(cl.doc_id);
    let score = 0;
    if (cl.value && res.includes(cl.value.toLowerCase())) score += 2;
    if (d?.source && res.includes(d.source.toLowerCase().split(':')[0])) score += 1;
    if (d?.source_type && res.includes(d.source_type.toLowerCase())) score += 1;
    if (res.includes(cl.claim_id.toLowerCase()) || res.includes(cl.doc_id.toLowerCase())) score += 3;
    const date = d?.date ?? '';
    if (score > bestScore || (score === bestScore && date > bestDate)) { best = cl.claim_id; bestScore = score; bestDate = date; }
  }
  return best;
}

export function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function renderBold(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? { b: true, t: p.slice(2, -2), i } : { b: false, t: p, i }));
}
