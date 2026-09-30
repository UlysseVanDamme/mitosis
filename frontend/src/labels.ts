// Display clean-up for backend labels: a missing client is sector-wide ("all clients (sector rules)"),
// and owners display as the person ("Jan Peeters"), not "Jan Peeters (account lead no client)".

export const ALL_CLIENTS = 'all clients (sector rules)';
const NO_CLIENT = /\bno client\b/gi;
const OWNER_ROLE = /([A-Z][\p{L}'-]+(?: [A-Z][\p{L}'-]+)+) \([^()]*\b(?:lead|expert|specialist|owner)\b[^()]*\)/gu;

export function tidyText(s: string): string {
  return s.replace(OWNER_ROLE, '$1').replace(NO_CLIENT, ALL_CLIENTS);
}

/** Deep-cleans every string in an API payload or event. Null client scopes become sector-wide. */
export function tidy<T>(v: T): T {
  if (typeof v === 'string') return tidyText(v) as T;
  if (Array.isArray(v)) return v.map(tidy) as T;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k in o) out[k] = tidy(o[k]);
    const sc = out.scope as { dimension?: string; value?: unknown } | undefined;
    if (sc && typeof sc === 'object' && sc.dimension === 'client' && (sc.value == null || sc.value === 'none' || sc.value === '')) {
      out.scope = { ...sc, value: ALL_CLIENTS };
    }
    return out as T;
  }
  return v;
}
