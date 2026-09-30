import { useEffect, useRef, useState } from 'react';
import { AuthError, MOCK, ROLE_LABEL, knowsPasscode, login, logout, users } from '../api';
import { patch, useStore } from '../store';
import type { User } from '../types';

function initials(n: string) { return n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }

export function RoleBadge({ role }: { role: User['role'] }) {
  return <span className={`role r-${role}`}>{ROLE_LABEL[role] ?? role}</span>;
}

const BLURB: Record<string, string> = {
  sofie: 'Payroll consultant. Just inherited the Brouwerij Van Dessel portfolio.',
  jan: 'Owns the PC 200 knowledge. Can verify conflicts.',
  vandessel: 'HR admin at Brouwerij Van Dessel. Sees public + own client data.',
  desk: 'Runs ingest, reset and replay.',
  guest: 'Public sources only.',
};

/** Full-screen sign-in when nobody is signed in; a dialog when switching user. */
export function Login() {
  const auth = useStore((x) => x.auth);
  const loginFor = useStore((x) => x.loginFor);
  const [list, setList] = useState<User[]>([]);
  const [pick, setPick] = useState<string>('');
  const [pc, setPc] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const open = !auth || loginFor != null;

  useEffect(() => { if (open && !list.length) users().then((u) => { setList(u); }); }, [open, list.length]);
  useEffect(() => {
    if (!open) return;
    setPick(loginFor || (list[0]?.username ?? ''));
    setPc(''); setErr('');
  }, [open, loginFor, list]);
  useEffect(() => { if (open && pick) input.current?.focus(); }, [open, pick]);

  if (!open) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pick || !pc) return;
    setBusy(true); setErr('');
    try { await login(pick, pc); patch({ loginFor: null }); }
    catch (x) { setErr(x instanceof AuthError ? x.message : 'Could not reach the server'); }
    finally { setBusy(false); }
  };
  const chosen = list.find((u) => u.username === pick);
  return (
    <div className="login-veil" role="dialog" aria-modal="true" aria-label="Sign in">
      <form className="login" onSubmit={submit}>
        <div className="login-h">
          <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden>
            <circle cx="10" cy="11" r="8.5" className="glyph-a" />
            <circle cx="20" cy="11" r="8.5" className="glyph-b" />
          </svg>
          <div>
            <b>Sign in to Mitosis</b>
            <span>Find it. Understand it. Trust it. What you see depends on who you are.</span>
          </div>
          {auth && <button type="button" className="x" aria-label="Cancel" onClick={() => patch({ loginFor: null })}>×</button>}
        </div>
        <div className="who" role="radiogroup" aria-label="Demo user">
          {list.map((u) => (
            <button type="button" role="radio" aria-checked={pick === u.username} key={u.username} className={`who-row ${pick === u.username ? 'on' : ''}`} onClick={() => { setPick(u.username); setErr(''); }}>
              <i className={`av r-${u.role}`}>{initials(u.display_name)}</i>
              <span className="who-n"><b>{u.display_name}</b><span>{BLURB[u.username] ?? u.username}</span></span>
              <RoleBadge role={u.role} />
            </button>
          ))}
        </div>
        <label className="pc">
          <span>Passcode for {chosen?.display_name ?? '…'}</span>
          <input ref={input} type="password" autoComplete="current-password" value={pc} onChange={(e) => setPc(e.target.value)} placeholder={MOCK ? 'mock mode: any passcode' : 'from the demo desk'} />
        </label>
        {err && <p className="login-err" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy || !pc || !pick}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="login-foot">Passcodes are remembered in this tab's memory only, so switching back needs no retyping.</p>
      </form>
    </div>
  );
}

export function UserSwitcher() {
  const auth = useStore((x) => x.auth);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<User[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { users().then(setList); }, []);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [open]);
  if (!auth) return null;
  const choose = async (u: User) => {
    setOpen(false);
    if (u.username === auth.username) return;
    if (knowsPasscode(u.username)) {
      try { await login(u.username); return; } catch { /* fall through to the dialog */ }
    }
    patch({ loginFor: u.username });
  };
  return (
    <div className="switcher" ref={ref}>
      <button className="me" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i className={`av r-${auth.role}`}>{initials(auth.display_name)}</i>
        <span className="me-n">{auth.display_name}</span>
        <RoleBadge role={auth.role} />
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-h">Switch user</div>
          {list.map((u) => (
            <button role="menuitem" key={u.username} className={u.username === auth.username ? 'cur' : ''} onClick={() => void choose(u)}>
              <i className={`av r-${u.role}`}>{initials(u.display_name)}</i>
              <span>{u.display_name}</span>
              <RoleBadge role={u.role} />
              {u.username !== auth.username && !knowsPasscode(u.username) && <span className="lock" title="Passcode needed">passcode</span>}
            </button>
          ))}
          <button role="menuitem" className="signout" onClick={() => { setOpen(false); logout(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
