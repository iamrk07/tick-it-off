import { useMemo, useState } from 'react';
import { uid, now } from '../lib/store.js';
import { todayLocal, last14, calcStreak, mondayStr, prettyDate } from '../lib/growth.js';

const COLORS = ['#10b981', '#8b5cf6', '#f59e0b', '#3b82f6', '#ec4899', '#ef4444', '#0ea5e9', '#64748b'];
const TICONS = ['🏋️', '📖', '🏃', '🧘', '💧', '😴', '📝', '🎸', '💰', '🌱', '🚭', '🎯'];

const blankTracker = () => ({ name: '', unit: 'times', target: '', color: COLORS[0], icon: TICONS[0] });

// Props: data, setData (same store interface), gtab/setGtab for mobile panes
export default function Growth({ data, setData, gtab, setGtab }) {
  const me = data.user?.id ?? 'local-user';
  const trackers = useMemo(
    () => [...(data.trackers || [])].sort((a, b) => a.sort_order - b.sort_order),
    [data.trackers]
  );
  const logs = data.tracker_logs || [];

  const [selId, setSelId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(blankTracker());
  const [editing, setEditing] = useState(false);
  const [logForm, setLogForm] = useState({ value: '1', note: '', date: todayLocal() });

  const sel = trackers.find((t) => t.id === (selId ?? trackers[0]?.id)) ?? null;

  // Per-tracker mini stats for the list
  const statMap = useMemo(() => {
    const m = {};
    const monday = mondayStr();
    trackers.forEach((t) => {
      const ls = logs.filter((l) => l.tracker_id === t.id);
      const byDate = {};
      ls.forEach((l) => {
        byDate[l.log_date] = (byDate[l.log_date] ?? 0) + Number(l.value || 0);
      });
      const week = Object.entries(byDate)
        .filter(([d]) => d >= monday)
        .reduce((s, [, v]) => s + v, 0);
      m[t.id] = { streak: calcStreak(new Set(Object.keys(byDate))), week, sessions: ls.length };
    });
    return m;
  }, [trackers, logs]);

  // Selected tracker detail stats
  const selLogs = useMemo(
    () =>
      logs
        .filter((l) => l.tracker_id === sel?.id)
        .sort((a, b) => b.log_date.localeCompare(a.log_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [logs, sel?.id]
  );
  const byDate = useMemo(() => {
    const m = {};
    selLogs.forEach((l) => {
      m[l.log_date] = (m[l.log_date] ?? 0) + Number(l.value || 0);
    });
    return m;
  }, [selLogs]);
  const days = useMemo(last14, []);
  const maxDay = Math.max(1, ...days.map((d) => byDate[d.date] ?? 0));
  const selStats = sel ? statMap[sel.id] ?? { streak: 0, week: 0, sessions: 0 } : null;
  const weekPct = sel?.target_per_week
    ? Math.min(100, Math.round(((selStats?.week ?? 0) / sel.target_per_week) * 100))
    : null;

  // ---------- actions ----------
  const addTracker = () => {
    if (!draft.name.trim()) return alert('Name your tracker (e.g. Gym, Atomic Habits).');
    const max = trackers.reduce((m, t) => Math.max(m, t.sort_order), -1);
    const id = uid();
    const row = {
      id, user_id: me, name: draft.name.trim(), icon: draft.icon, color: draft.color,
      unit: draft.unit.trim() || 'times',
      target_per_week: draft.target === '' ? null : Number(draft.target),
      sort_order: max + 1, created_at: now(),
    };
    setData((d) => ({ ...d, trackers: [...(d.trackers || []), row] }));
    setDraft(blankTracker());
    setShowNew(false);
    setSelId(id);
    setGtab('progress');
  };

  const saveTracker = () => {
    if (!sel || !draft.name.trim()) return alert('Name is required.');
    const patch = {
      name: draft.name.trim(), icon: draft.icon, color: draft.color,
      unit: draft.unit.trim() || 'times',
      target_per_week: draft.target === '' ? null : Number(draft.target),
    };
    setData((d) => ({ ...d, trackers: d.trackers.map((t) => (t.id === sel.id ? { ...t, ...patch } : t)) }));
    setEditing(false);
  };

  const deleteTracker = (id) => {
    if (!confirm('Delete this tracker and all its logged activity?')) return;
    setData((d) => ({
      ...d,
      trackers: d.trackers.filter((t) => t.id !== id),
      tracker_logs: d.tracker_logs.filter((l) => l.tracker_id !== id),
    }));
    if (selId === id) setSelId(null);
  };

  const addLog = () => {
    if (!sel) return;
    const v = Number(logForm.value);
    if (!(v > 0)) return alert('Enter a value above 0.');
    if (!logForm.date) return alert('Pick a date.');
    setData((d) => ({
      ...d,
      tracker_logs: [...(d.tracker_logs || []), {
        id: uid(), tracker_id: sel.id, user_id: me,
        log_date: logForm.date, value: v, note: logForm.note.trim(), created_at: now(),
      }],
    }));
    setLogForm({ value: '1', note: '', date: todayLocal() });
  };

  const quickLog = () => {
    if (!sel) return;
    setData((d) => ({
      ...d,
      tracker_logs: [...(d.tracker_logs || []), {
        id: uid(), tracker_id: sel.id, user_id: me,
        log_date: todayLocal(), value: 1, note: '', created_at: now(),
      }],
    }));
  };

  const deleteLog = (id) => {
    if (!confirm('Delete this log entry?')) return;
    setData((d) => ({ ...d, tracker_logs: d.tracker_logs.filter((l) => l.id !== id) }));
  };

  const pick = (id) => {
    setSelId(id);
    setEditing(false);
    setGtab('progress');
  };

  const startEdit = () => {
    if (!sel) return;
    setDraft({
      name: sel.name, unit: sel.unit ?? 'times',
      target: sel.target_per_week ?? '', color: sel.color, icon: sel.icon,
    });
    setEditing(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
      {/* LEFT: trackers */}
      <section className={`card p-4 ${gtab === 'trackers' ? '' : 'hidden lg:block'}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">📈 Growth</h2>
          <button onClick={() => setShowNew((v) => !v)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white">
            {showNew ? 'Close' : '＋ New'}
          </button>
        </div>

        {showNew && (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-3 grid gap-1.5">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Gym, Atomic Habits…" className="input !text-sm" />
            <div className="flex gap-1.5">
              <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="Unit: workouts, pages…" className="input !text-sm flex-1" />
              <input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="/week" inputMode="numeric" type="number" min="0" className="input !text-sm w-24" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setDraft({ ...draft, color: c })} className={`w-6 h-6 rounded-full border-2 ${draft.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {TICONS.map((e) => (
                <button key={e} onClick={() => setDraft({ ...draft, icon: e })} className={`w-7 h-7 rounded-lg border ${draft.icon === e ? 'border-slate-900 bg-slate-100' : ''}`}>{e}</button>
              ))}
            </div>
            <button onClick={addTracker} className="btn-primary py-2 text-sm">Create tracker</button>
          </div>
        )}

        <div className="mt-3 grid gap-1.5">
          {trackers.length === 0 && !showNew && (
            <div className="text-center py-8">
              <div className="text-4xl">🌱</div>
              <p className="font-bold mt-2 text-sm">No trackers yet</p>
              <p className="text-xs text-slate-500">Track gym, books, anything — hit ＋ New.</p>
            </div>
          )}
          {trackers.map((t) => {
            const st = statMap[t.id] ?? { streak: 0, week: 0, sessions: 0 };
            const active = sel?.id === t.id;
            return (
              <button key={t.id} onClick={() => pick(t.id)}
                className={`w-full text-left rounded-2xl border p-3 transition overflow-hidden ${active ? 'border-transparent shadow-md' : 'border-slate-100 hover:border-slate-200'}`}
                style={active ? { background: `linear-gradient(135deg, ${t.color}22, #ffffff)`, borderLeft: `5px solid ${t.color}` } : { borderLeft: `5px solid ${t.color}` }}>
                <span className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${t.color}1e` }}>{t.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-sm truncate">{t.name}</span>
                    <span className="block text-[11px] text-slate-400">🔥 {st.streak} day streak · {st.sessions} logs</span>
                  </span>
                </span>
                <span className="block h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: t.target_per_week ? `${Math.min(100, Math.round((st.week / t.target_per_week) * 100))}%` : '0%',
                      background: t.color,
                    }}
                  />
                </span>
                <span className="block text-[11px] text-slate-500 mt-1">
                  This week: <b>{st.week} {t.unit}</b>{t.target_per_week ? ` / ${t.target_per_week}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* RIGHT: detail + log + chart + history */}
      <div className={`grid gap-4 ${gtab === 'progress' ? '' : 'hidden lg:grid'}`}>
        {!sel ? (
          <section className="card p-8 text-center">
            <div className="text-5xl">📈</div>
            <p className="font-bold mt-2">Pick a tracker to see progress</p>
            <p className="text-sm text-slate-500">Or create one with ＋ New.</p>
          </section>
        ) : (
          <>
            <section className="card card-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${sel.color}1e` }}>{sel.icon}</span>
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-xl truncate">{sel.name}</h2>
                    <p className="text-xs text-slate-500">Measured in {sel.unit}{sel.target_per_week ? ` · goal ${sel.target_per_week}/week` : ''}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 text-xs font-bold">
                  <button onClick={startEdit} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Edit</button>
                  <button onClick={() => deleteTracker(sel.id)} className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-100">Del</button>
                </div>
              </div>

              {editing ? (
                <div className="mt-3 rounded-2xl bg-slate-50 border p-3 grid gap-1.5">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input !text-sm" />
                  <div className="flex gap-1.5">
                    <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="Unit" className="input !text-sm flex-1" />
                    <input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="/week" type="number" min="0" inputMode="numeric" className="input !text-sm w-24" />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => setDraft({ ...draft, color: c })} className={`w-6 h-6 rounded-full border-2 ${draft.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {TICONS.map((e) => (
                      <button key={e} onClick={() => setDraft({ ...draft, icon: e })} className={`w-7 h-7 rounded-lg border ${draft.icon === e ? 'border-slate-900 bg-white' : ''}`}>{e}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveTracker} className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Save</button>
                    <button onClick={() => setEditing(false)} className="px-4 rounded-xl border text-sm font-bold">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3">
                      <div className="text-2xl font-extrabold">🔥{selStats?.streak ?? 0}</div>
                      <div className="text-[11px] font-bold text-slate-500 uppercase">day streak</div>
                    </div>
                    <div className="rounded-2xl bg-violet-50 border border-violet-100 p-3">
                      <div className="text-2xl font-extrabold">{selStats?.week ?? 0}</div>
                      <div className="text-[11px] font-bold text-slate-500 uppercase">this week</div>
                    </div>
                    <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                      <div className="text-2xl font-extrabold">{selStats?.sessions ?? 0}</div>
                      <div className="text-[11px] font-bold text-slate-500 uppercase">total logs</div>
                    </div>
                  </div>
                  {weekPct !== null && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[11px] font-bold text-slate-500">
                        <span>Weekly goal</span>
                        <span>{selStats?.week ?? 0} / {sel.target_per_week} {sel.unit} · {weekPct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${weekPct}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="card p-4">
              <h3 className="font-display font-bold text-base">✅ Log activity</h3>
              <button onClick={quickLog} className="btn-primary w-full py-2.5 text-sm mt-2 shadow-lg shadow-violet-200">
                ＋ Log 1 {sel.unit} today
              </button>
              <div className="grid grid-cols-[1fr_1fr] gap-2 mt-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">Value
                  <input value={logForm.value} onChange={(e) => setLogForm({ ...logForm, value: e.target.value })} type="number" min="0" step="any" inputMode="decimal" className="input mt-1" />
                </label>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Date
                  <input value={logForm.date} onChange={(e) => setLogForm({ ...logForm, date: e.target.value })} type="date" className="input mt-1" />
                </label>
              </div>
              <input value={logForm.note} onChange={(e) => setLogForm({ ...logForm, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLog()} placeholder="Note (optional) — e.g. Chest day, Ch. 4…" className="input mt-2" />
              <button onClick={addLog} className="w-full py-2.5 rounded-xl border mt-2 text-sm font-bold hover:bg-slate-50">Save log</button>
            </section>

            <section className="card p-4">
              <h3 className="font-display font-bold text-base">Last 14 days</h3>
              <div className="flex items-end gap-1 h-24 mt-3">
                {days.map((d) => {
                  const v = byDate[d.date] ?? 0;
                  const isToday = d.date === todayLocal();
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date}: ${v} ${sel.unit}`}>
                      <div className="w-full flex items-end justify-center h-16">
                        <div
                          className="w-full max-w-6 rounded-t-md"
                          style={{ height: `${Math.max(v > 0 ? 8 : 3, (v / maxDay) * 100)}%`, background: v > 0 ? sel.color : '#e2e8f0', outline: isToday ? `2px solid ${sel.color}` : 'none' }}
                        />
                      </div>
                      <span className={`text-[9px] font-bold ${isToday ? 'text-slate-900' : 'text-slate-400'}`}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card p-4">
              <h3 className="font-display font-bold text-base">History</h3>
              {selLogs.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">Nothing logged yet — hit “Log 1 {sel.unit} today” above. 💪</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {selLogs.map((l) => (
                    <li key={l.id} className="py-2 flex items-center gap-2 text-sm">
                      <span className="font-extrabold whitespace-nowrap" style={{ color: sel.color }}>+{Number(l.value)} {sel.unit}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-slate-700">{prettyDate(l.log_date)}</span>
                        {l.note && <span className="block text-xs text-slate-500 truncate">{l.note}</span>}
                      </span>
                      <button onClick={() => deleteLog(l.id)} className="text-slate-300 hover:text-red-500 px-1" aria-label="delete log">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
