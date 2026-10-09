import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

function syncText(sync) {
  if (!sync) return '';
  if (sync.state === 'loading') return 'Loading…';
  if (sync.state === 'syncing' || sync.state === 'pending') return 'Syncing…';
  if (sync.state === 'error') return `Sync failed (${sync.error || 'unknown'}) — retrying on next change`;
  if (sync.state === 'synced' && sync.at) {
    const t = sync.at instanceof Date ? sync.at : new Date(sync.at);
    return `Synced ${t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return 'Cloud on';
}

// Login / signup button + modal, and the logged-in user chip.
// Props: session, sync (from useCloudStore), onRefresh
export default function AuthArea({ session, sync, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !pw) return setMsg('Enter email and password.');
    if (pw.length < 6) return setMsg('Password needs at least 6 characters.');
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
        setOpen(false);
        setEmail('');
        setPw('');
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
        if (error) throw error;
        if (data.session) {
          setOpen(false);
          setEmail('');
          setPw('');
        } else {
          setMsg('Account created! Check your inbox to confirm, then log in. (Or ask to turn off email confirmation.)');
        }
      }
    } catch (err) {
      setMsg(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!confirm('Log out? This device switches back to its own offline data. Your cloud data stays safe.')) return;
    await supabase.auth.signOut();
    window.location.reload(); // fresh start in offline (this-device) mode
  };

  if (!session) {
    return (
      <>
        <button
          onClick={() => { setOpen(true); setMsg(''); setMode('signin'); }}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow whitespace-nowrap"
        >
          Log in / Sign up
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 backdrop-blur-sm p-0 sm:p-4" onClick={() => setOpen(false)}>
            <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 text-slate-900" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-xl">{mode === 'signin' ? 'Welcome back' : 'Create account'}</h2>
                <button onClick={() => setOpen(false)} aria-label="close" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold">✕</button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'signin'
                  ? 'Log in to sync your entries across phone & laptop.'
                  : 'One account = your private space on every device.'}
              </p>
              <div className="flex gap-1.5 mt-3 text-xs font-bold">
                {(['signin', 'signup']).map((m) => (
                  <button key={m} onClick={() => { setMode(m); setMsg(''); }}
                    className={`flex-1 py-2 rounded-xl ${mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {m === 'signin' ? 'Log in' : 'Sign up'}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 mt-3">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" inputMode="email" autoComplete="email" className="input" />
                <input value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Password (min 6 characters)" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} className="input" />
                {msg && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{msg}</p>}
                <button onClick={submit} disabled={busy} className="btn-primary py-2.5 text-sm disabled:opacity-60">
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Create account'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">Logged out = private data on this device only.</p>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const initial = (session.user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="flex items-center gap-1.5 bg-white text-slate-900 font-bold rounded-xl pl-1.5 pr-2 py-1 max-w-[180px]" title={session.user.email}>
        <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center text-[11px] shrink-0">{initial}</span>
        <span className="truncate">{session.user.email}</span>
      </span>
      <button onClick={onRefresh} title="Reload from cloud" className="px-2 py-1.5 rounded-xl bg-white/15 border border-white/30 font-bold">↻</button>
      <button onClick={logout} title="Log out" className="px-2 py-1.5 rounded-xl bg-white/15 border border-white/30 font-bold">⏻</button>
      {sync.state === 'error' ? (
        <button onClick={() => alert(`Sync failed:\n\n${sync.error || 'unknown error'}\n\nSend these exact words for a fix. Tap reload to retry.`)} className="text-red-200 font-bold whitespace-nowrap underline" title="Tap to see the full error">
          Sync failed — tap for details
        </button>
      ) : (
        <span className="text-white/80 font-semibold hidden md:inline whitespace-nowrap">{syncText(sync)}</span>
      )}
    </div>
  );
}
