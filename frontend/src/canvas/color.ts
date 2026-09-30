// OKLCH -> sRGB string, cached. Canvas colour parsing of oklch() is not
// universal, so we convert ourselves.
const cache = new Map<string, string>();

export function oklch(l: number, c: number, h: number, a = 1): string {
  const key = `${l.toFixed(3)}|${c.toFixed(3)}|${h.toFixed(1)}|${a.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr), B = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const b = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  const f = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  const out = `rgba(${f(r)},${f(g)},${f(b)},${a})`;
  if (cache.size > 20000) cache.clear();
  cache.set(key, out);
  return out;
}

export const DIM_HUE: Record<string, [number, number]> = {
  root: [215, 0.05],
  country: [268, 0.13],
  pc: [178, 0.12],
  client: [338, 0.14],
  topic: [140, 0.12],
  period: [75, 0.12],
  source_type: [30, 0.13],
};

export const SOURCE_HUE: Record<string, [number, number]> = {
  law: [230, 0.08], official: [225, 0.1], news: [95, 0.14], forecast: [60, 0.16],
  policy: [178, 0.12], ticket: [345, 0.16], slack: [300, 0.15], cao: [145, 0.14],
  email: [255, 0.12], faq: [200, 0.1],
};

export function sourceColor(st: string, l = 0.82, a = 1) {
  const [h, c] = SOURCE_HUE[st] ?? [210, 0.05];
  return oklch(l, c, h, a);
}
