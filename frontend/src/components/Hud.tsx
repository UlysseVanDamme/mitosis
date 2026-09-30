import { useEffect, useRef, useState } from 'react';
import { fmtMs, patch, scrubStep, scrubTo, timelineLength, useStore } from '../store';

/** Live System 1 / System 2 routing gauge. */
export function RoutingHud() {
  const r = useStore((x) => x.routing);
  const busy = useStore((x) => !!x.activeQueryId);
  const n = r.rule + r.s1 + r.s2;
  if (!n || busy) return null;
  const pct = (v: number) => Math.round((v / n) * 100);
  return (
    <div className="hud" aria-label="Routing">
      <div className="hud-bar" aria-hidden>
        <i className="b-rule" style={{ flexGrow: r.rule }} />
        <i className="b-s1" style={{ flexGrow: r.s1 }} />
        <i className="b-s2" style={{ flexGrow: r.s2 }} />
      </div>
      <div className="hud-row">
        <span className="h-s1"><i />System 1 <b>{pct(r.s1)}%</b> <em>{fmtMs(r.s1_ms_avg)}</em></span>
        <span className="h-s2"><i />System 2 <b>{pct(r.s2)}%</b> <em>{fmtMs(r.s2_ms_avg)}</em></span>
        <span className="h-rule"><i />rule <b>{pct(r.rule)}%</b></span>
      </div>
    </div>
  );
}

/** Bottom-right: colour lens + time-lapse scrubber over the event log. */
export function StageTools() {
  const lens = useStore((x) => x.lens);
  const scrub = useStore((x) => x.scrub);
  const ingesting = useStore((x) => x.ingesting);
  const n = timelineLength();
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setPlaying(false); };
  useEffect(() => stop, []);
  useEffect(() => { if (ingesting && playing) stop(); }, [ingesting, playing]);

  const play = () => {
    if (playing) { stop(); return; }
    if (!scrub) scrubTo(0);
    setPlaying(true);
    const per = Math.max(1, Math.round(timelineLength() / 450)); // ~16 s for the whole run
    timer.current = setInterval(() => {
      for (let k = 0; k < per; k++) if (!scrubStep()) { stop(); return; }
    }, 34);
  };

  const i = scrub ? scrub.i : n;
  return (
    <div className="tools">
      <div className="seg lens" role="radiogroup" aria-label="Cell colour">
        <button role="radio" aria-checked={lens === 'scope'} className={lens === 'scope' ? 'on' : ''} onClick={() => patch({ lens: 'scope' })}>Scope</button>
        <button role="radio" aria-checked={lens === 'debt'} className={lens === 'debt' ? 'on' : ''} onClick={() => patch({ lens: 'debt' })}>Knowledge debt</button>
      </div>
      <div className={`lapse ${scrub ? 'on' : ''}`}>
        <button className="play" disabled={ingesting || n < 2} onClick={play} aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}>
          {playing
            ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.5v9l7.5-4.5z" /></svg>}
        </button>
        <input type="range" min={0} max={Math.max(1, n)} value={i} disabled={ingesting || n < 2}
          aria-label="Time-lapse position" onChange={(e) => { stop(); scrubTo(Number(e.target.value)); }} />
        <span className="lapse-l mono">{ingesting ? 'live' : scrub ? `${scrub.i}/${scrub.n}` : 'time-lapse'}</span>
      </div>
    </div>
  );
}
