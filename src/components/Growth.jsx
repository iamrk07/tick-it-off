import { useMemo, useState } from 'react';
import { uid, now, defaultTrackers } from '../lib/store.js';
import { todayLocal, calcStreak, mondayStr, monthGrid, monthLabel, fmtDateLong, plural } from '../lib/growth.js';

const COLORS = ['#10b981', '#8b5cf6', '#f59e0b', '#3b82f6', '#ec4899', '#ef4444', '#0ea5e9', '#64748b'];
const TICONS = ['🏋️', '📖', '🏃', '🧘', '🏊', '🚴', '💧', '😴', '📝', '🎸', '💰', '🌱', '🚭', '🎯'];

// One-tap column sets for common activities
const PRESETS = {
  gym: [
    { label: 'Weight (kg)', type: 'number' },
    { label: 'Exercises', type: 'text' },
  ],
  reading: [
    { label: 'Book', type: 'text' },
    { label: 'Pages', type: 'number' },
    { label: 'Minutes', type: 'number' },
  ],
  mindfulness: [
    { label: 'Minutes', type: 'number' },
    { label: 'Technique', type: 'text' },
  ],
};

const slug = (s) => (s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field');

const blankTracker = () => ({ name: '', unit: 'times', target: '', color: COLORS[0], icon: TICONS[0], fields: [] });

// Editor for a tracker's custom columns (weight, book, pages…). Used for new + edit.
function FieldsEditor({ fields, setFields }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');

  const addField = () => {
    if (!label.trim()) return;
    if (fields.some((f) => f.label.toLowerCase() === label.trim().toLowerCase())) {
      setLabel('');
      return;
    }
    setFields([...fields, { key: `${slug(label.trim())}_${uid().slice(0, 4)}`, label: label.trim(), type }]);
    setLabel('');
  };

  const addPreset = (list) => {
    const have = new Set(fields.map((f) => f.label.toLowerCase()));
    const next = [...fields];
    list.forEach((p) => {
      if (!have.has(p.label.toLowerCase())) next.push({ ...p, key: `${slug(p.label)}_${uid().slice(0, 4)}` });
    });
    setFields(next);
  };

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-2.5 grid gap-1.5">
      <p className="text-[11px] font-bold text-slate-500 uppercase">Columns for each log <span className="normal-case font-medium">(e.g. weight, book, minutes)</span></p>
      {fields.length > 0 && (
        <ul className="grid gap-1">
          {fields.map((f) => (
            <li key={f.key} className="flex items-center gap-2 text-xs bg-white border rounded-xl px-2.5 py-1.5">
              <span className="font-bold flex-1">{f.label}</span>
              <span className="text-slate-400 font-semibold">{f.type === 'number' ? 'number' : 'text'}</span>
              <button onClick={() => setFields(fields.filter((x) => x.key !== f.key))} className="text-slate-300 hover:text-red-500 font-bold px-2 py-0.5" aria-label={`remove ${f.label}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addField()} placeholder="New column, e.g. Weight (kg)" className="input !py-1.5 !text-xs flex-1" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="input !py-1.5 !text-xs !w-auto">
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
        <button onClick={addField} className="px-3 rounded-xl bg-slate-900 text-white text-xs font-bold">Add</button>
      </div>
      <div className="flex gap-1.5 flex-wrap text-[11px] font-bold">
        <span className="text-slate-400 self-center">Quick sets:</span>
        <button onClick={() => addPreset(PRESETS.gym)} className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">Gym</button>
        <button onClick={() => addPreset(PRESETS.reading)} className="px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200">Reading</button>
        <button onClick={() => addPreset(PRESETS.mindfulness)} className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200">Calm</button>
      </div>
    </div>
  );
}

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
  const [logForm, setLogForm] = useState({ value: '1', note: '', date: todayLocal(), extra: {} });
  const [cal, setCal] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const liveTrackers = useMemo(() => trackers.filter((t) => !t.is_archived), [trackers]);
  const archivedTrackers = useMemo(() => trackers.filter((t) => t.is_archived), [trackers]);
  const sel = trackers.find((t) => t.id === (selId ?? liveTrackers[0]?.id)) ?? null;
  const selFields = sel?.fields || [];

  // Per-tracker mini stats for the list
  const statMap = useMemo(() => {
    const m = {};
    const monday = mondayStr();
    liveTrackers.forEach((t) => {
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
  }, [liveTrackers, logs]);

  // Selected tracker logs + calendar lookup
  const selLogs = useMemo(
    () =>
      logs
        .filter((l) => l.tracker_id === sel?.id)
        .sort((a, b) => b.log_date.localeCompare(a.log_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [logs, sel?.id]
  );
  const loggedDates = useMemo(() => new Set(selLogs.map((l) => l.log_date)), [selLogs]);
  const selStats = sel ? statMap[sel.id] ?? { streak: 0, week: 0, sessions: 0 } : null;
  const weekPct = sel?.target_per_week
    ? Math.min(100, Math.round(((selStats?.week ?? 0) / sel.target_per_week) * 100))
    : null;
  const weeks = useMemo(() => monthGrid(cal.y, cal.m), [cal]);
  const today = todayLocal();
  // Missed days only count from the tracker's creation day — never before it existed
  const createdDay = (sel?.created_at || '').slice(0, 10);

  // ---------- actions ----------
  const addTracker = () => {
    if (!draft.name.trim()) return alert('Name your tracker (e.g. Gym, Atomic Habits).');
    const max = trackers.reduce((m, t) => Math.max(m, t.sort_order), -1);
    const id = uid();
    const row = {
      id, user_id: me, name: draft.name.trim(), icon: draft.icon, color: draft.color,
      unit: draft.unit.trim() || 'times',
      target_per_week: draft.target === '' ? null : Number(draft.target),
      fields: draft.fields || [],
      is_archived: false, archived_at: null,
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
      fields: draft.fields || [],
    };
    setData((d) => ({ ...d, trackers: d.trackers.map((t) => (t.id === sel.id ? { ...t, ...patch } : t)) }));
    setEditing(false);
  };

  const archiveTracker = (id) => {
    const t = now();
    setData((d) => ({
      ...d,
      trackers: d.trackers.map((x) => (x.id === id ? { ...x, is_archived: true, archived_at: t } : x)),
    }));
    if (selId === id) setSelId(null);
  };

  const restoreTracker = (id) => {
    setData((d) => ({
      ...d,
      trackers: d.trackers.map((x) => (x.id === id ? { ...x, is_archived: false, archived_at: null } : x)),
    }));
  };

  const deleteTrackerForever = (id) => {
    if (!confirm('Permanently delete this tracker and all its logged activity? This cannot be undone.')) return;
    setData((d) => ({
      ...d,
      trackers: d.trackers.filter((t) => t.id !== id),
      tracker_logs: d.tracker_logs.filter((l) => l.tracker_id !== id),
    }));
    if (selId === id) setSelId(null);
  };

  // One-tap recovery: bring back starter trackers missing by name (Gym, Reading…)
  const restoreStarters = () => {
    const have = new Set([...(data.trackers || [])].map((t) => t.name.trim().toLowerCase()));
    const max = trackers.reduce((m, t) => Math.max(m, t.sort_order), -1);
    const fresh = defaultTrackers(me).filter((t) => !have.has(t.name.trim().toLowerCase()));
    if (!fresh.length) return alert('Starter trackers already exist.');
    const placed = fresh.map((t, i) => ({ ...t, sort_order: max + 1 + i }));
    setData((d) => ({ ...d, trackers: [...(d.trackers || []), ...placed] }));
    setSelId(placed[0].id);
    setGtab('progress');
  };

  const buildExtra = () => {
    const extra = {};
    selFields.forEach((f) => {
      const raw = logForm.extra[f.key];
      if (raw === undefined || raw === '') return;
      extra[f.key] = f.type === 'number' ? Number(raw) : String(raw).trim();
      if (f.type === 'number' && Number.isNaN(extra[f.key])) delete extra[f.key];
    });
    return extra;
  };

  const resetLogForm = (date) => setLogForm({ value: '1', note: '', date: date || todayLocal(), extra: {} });

  const addLog = () => {
    if (!sel) return;
    const v = Number(logForm.value);
    if (!(v > 0)) return alert('Enter a value above 0.');
    if (!logForm.date) return alert('Pick a date.');
    const extra = buildExtra();
    setData((d) => ({
      ...d,
      tracker_logs: [...(d.tracker_logs || []), {
        id: uid(), tracker_id: sel.id, user_id: me,
        log_date: logForm.date, value: v, note: logForm.note.trim(), extra, created_at: now(),
      }],
    }));
    resetLogForm();
  };

  const quickLog = () => {
    if (!sel) return;
    setData((d) => ({
      ...d,
      tracker_logs: [...(d.tracker_logs || []), {
        id: uid(), tracker_id: sel.id, user_id: me,
        log_date: todayLocal(), value: 1, note: '', extra: {}, created_at: now(),
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
    resetLogForm();
    setGtab('progress');
  };

  const startEdit = () => {
    if (!sel) return;
    setDraft({
      name: sel.name, unit: sel.unit ?? 'times',
      target: sel.target_per_week ?? '', color: sel.color, icon: sel.icon,
      fields: sel.fields || [],
    });
    setEditing(true);
  };

  const jumpToDate = (date) => {
    setLogForm((f) => ({ ...f, date }));
    document.getElementById('growth-log-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const shiftMonth = (dir) => {
    setCal((c) => {
      const d = new Date(c.y, c.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
      {/* LEFT: trackers */}
      <section className={`card p-4 ${gtab === 'trackers' ? '' : 'hidden lg:block'}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Growth</h2>
          <button onClick={() => { setDraft(blankTracker()); setShowNew((v) => !v); }} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white">
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
            <FieldsEditor fields={draft.fields} setFields={(f) => setDraft({ ...draft, fields: f })} />
            <button onClick={addTracker} className="btn-primary py-2 text-sm">Create tracker</button>
          </div>
        )}

        <div className="mt-3 grid gap-1.5">
          {liveTrackers.length === 0 && !showNew && (
            <div className="text-center py-8">
              <p className="font-bold mt-2 text-sm">No trackers yet</p>
              <p className="text-xs text-slate-500">Track gym, books, calm — hit ＋ New.</p>
              <button onClick={restoreStarters} className="mt-3 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
                Restore starter trackers
              </button>
            </div>
          )}
          {liveTrackers.map((t) => {
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
                    <span className="block text-[11px] text-slate-400">{plural(st.streak, 'day')} streak · {plural(st.sessions, 'log')}</span>
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
        {archivedTrackers.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">Archived ({archivedTrackers.length})</p>
            <div className="grid gap-1.5">
              {archivedTrackers.map((t) => (
                <button key={t.id} onClick={() => pick(t.id)}
                  className={`w-full text-left rounded-2xl border border-slate-100 px-3 py-2 flex items-center gap-2 opacity-60 hover:opacity-100 ${sel?.id === t.id ? 'bg-slate-100' : ''}`}>
                  <span className="text-base">{t.icon}</span>
                  <span className="flex-1 min-w-0 text-sm font-bold truncate">{t.name}</span>
                  <span className="text-[10px] font-bold text-slate-500">ARCHIVED</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* RIGHT: detail + log + calendar + record table */}
      <div className={`grid gap-4 ${gtab === 'progress' ? '' : 'hidden lg:grid'}`}>
        {!sel ? (
            <section className="card p-8 text-center">
              <p className="font-bold mt-2">Pick a tracker to see progress</p>
            <p className="text-sm text-slate-500">Or create one with ＋ New.</p>
          </section>
        ) : sel.is_archived ? (
          <section className="card p-4">
            <div className="flex items-center gap-2.5">
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 opacity-60" style={{ background: `${sel.color}1e` }}>{sel.icon}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl truncate">{sel.name}</h2>
                <p className="text-xs text-slate-500">Archived · {plural(selLogs.length, 'log')} kept safely</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-2">Restore it to keep logging, or delete it forever with all its history.</p>
            <div className="flex gap-2 mt-3 text-sm font-bold">
              <button onClick={() => restoreTracker(sel.id)} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white">↩ Restore</button>
              <button onClick={() => deleteTrackerForever(sel.id)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100">Delete forever</button>
            </div>
          </section>
        ) : (
          <>
            <section className="card card-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${sel.color}1e` }}>{sel.icon}</span>
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-xl truncate">{sel.name}</h2>
                    <p className="text-xs text-slate-500">Measured in {sel.unit}{sel.target_per_week ? ` · goal ${sel.target_per_week}/week` : ''}{selFields.length ? ` · ${selFields.length} extra columns` : ''}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 text-xs font-bold">
                  <button onClick={startEdit} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Edit</button>
                  <button onClick={() => archiveTracker(sel.id)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">Archive</button>
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
                  <FieldsEditor fields={draft.fields} setFields={(f) => setDraft({ ...draft, fields: f })} />
                  <div className="flex gap-2">
                    <button onClick={saveTracker} className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Save</button>
                    <button onClick={() => setEditing(false)} className="px-4 rounded-xl border text-sm font-bold">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3">
                      <div className="text-2xl font-extrabold">{selStats?.streak ?? 0}</div>
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

            <section id="growth-log-card" className="card p-4 scroll-mt-24">
              <h3 className="font-display font-bold text-base">Log activity</h3>
              <button onClick={quickLog} className="btn-primary w-full py-2.5 text-sm mt-2 shadow-lg shadow-violet-200">
                ＋ Log today
              </button>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase">Value ({sel.unit})
                  <input value={logForm.value} onChange={(e) => setLogForm({ ...logForm, value: e.target.value })} type="number" min="0" step="any" inputMode="decimal" className="input mt-1" />
                </label>
                <label className="text-[11px] font-bold text-slate-500 uppercase">Date
                  <input value={logForm.date} onChange={(e) => setLogForm({ ...logForm, date: e.target.value })} type="date" className="input mt-1" />
                </label>
              </div>
              {selFields.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-2 mt-2">
                  {selFields.map((f) => (
                    <label key={f.key} className="text-[11px] font-bold text-slate-500 uppercase">{f.label}
                      <input
                        value={logForm.extra[f.key] ?? ''}
                        onChange={(e) => setLogForm({ ...logForm, extra: { ...logForm.extra, [f.key]: e.target.value } })}
                        type={f.type === 'number' ? 'number' : 'text'}
                        step="any"
                        inputMode={f.type === 'number' ? 'decimal' : 'text'}
                        placeholder={f.type === 'number' ? '0' : '…'}
                        className="input mt-1"
                      />
                    </label>
                  ))}
                </div>
              )}
              <input value={logForm.note} onChange={(e) => setLogForm({ ...logForm, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLog()} placeholder="Note (optional) — e.g. Chest day, Ch. 4…" className="input mt-2" />
              <button onClick={addLog} className="w-full py-2.5 rounded-xl border mt-2 text-sm font-bold hover:bg-slate-50">Save log</button>
            </section>

            <section className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base">{monthLabel(cal.y, cal.m)}</h3>
                <div className="flex gap-1.5 text-xs font-bold">
                  <button onClick={() => shiftMonth(-1)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200" aria-label="previous month">‹ Prev</button>
                  <button onClick={() => { const d = new Date(); setCal({ y: d.getFullYear(), m: d.getMonth() }); }} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Today</button>
                  <button onClick={() => shiftMonth(1)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200" aria-label="next month">Next ›</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 mt-3 text-center text-[10px] font-bold text-slate-400 uppercase">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div className="grid gap-1 mt-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((date, di) => {
                      if (!date) return <span key={di} />;
                      const logged = loggedDates.has(date);
                      const isToday = date === today;
                      const missed = !logged && date < today && date >= createdDay;
                      const dayNum = Number(date.slice(8, 10));
                      return (
                        <button
                          key={di}
                          onClick={() => jumpToDate(date)}
                          title={date + (logged ? ' — logged ✓ (tap to add more)' : missed ? ' — missed (tap to log)' : ' — tap to log')}
                          className={`aspect-square rounded-xl text-xs font-bold flex flex-col items-center justify-center transition
                            ${logged ? 'text-white shadow' : missed ? 'bg-red-50 text-red-300 hover:bg-red-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}
                            ${isToday ? 'ring-2 ring-offset-1' : ''}`}
                          style={logged ? { background: sel.color, ...(isToday ? { '--tw-ring-color': sel.color } : {}) } : isToday ? { '--tw-ring-color': '#94a3b8' } : undefined}
                        >
                          <span>{dayNum}</span>
                          {logged && <span className="text-[9px] leading-none">✓</span>}
                          {missed && <span className="text-[9px] leading-none">·</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Tap any day to log for it — red days are missed (counted from when the tracker was created).</p>
            </section>

            <section className="card p-4 overflow-hidden">
              <h3 className="font-display font-bold text-base">Records</h3>
              {selLogs.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">Nothing logged yet — your day-by-day record (weight, exercises, book, pages…) will appear here.</p>
              ) : (
                <div className="mt-2 -mx-4 px-4 overflow-x-auto nice-scroll">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b">
                        <th className="text-left font-bold py-2 pr-3">Date</th>
                        <th className="text-left font-bold py-2 pr-3">{sel.unit}</th>
                        {selFields.map((f) => (
                          <th key={f.key} className="text-left font-bold py-2 pr-3">{f.label}</th>
                        ))}
                        <th className="text-left font-bold py-2 pr-3">Note</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selLogs.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="py-2 pr-3 font-semibold">{fmtDateLong(l.log_date)}</td>
                          <td className="py-2 pr-3 font-extrabold" style={{ color: sel.color }}>+{Number(l.value)}</td>
                          {selFields.map((f) => (
                            <td key={f.key} className="py-2 pr-3 text-slate-600">
                              {l.extra?.[f.key] ?? <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="py-2 pr-3 text-slate-500 text-xs max-w-[180px] truncate">{l.note || <span className="text-slate-300">—</span>}</td>
                          <td className="py-2">
                            <button onClick={() => deleteLog(l.id)} className="text-slate-300 hover:text-red-500 font-bold px-1" aria-label="delete log">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
