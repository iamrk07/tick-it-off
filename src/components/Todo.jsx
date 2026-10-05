import { useEffect, useMemo, useState } from 'react';
import { uid, now } from '../lib/store.js';
import { todayLocal, fmtDay, fmtDateLong, fmtDayMon, plural, monthGrid, monthLabel, mondayStr } from '../lib/growth.js';

const shiftDay = (dateStr, dir) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dir);
  return fmtDay(dt);
};

const last30 = () => {
  const out = [];
  const t = todayLocal();
  for (let i = 29; i >= 0; i--) out.push(shiftDay(t, -i));
  return out;
};

const byCreated = (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '');

// Next occurrence for a repeat rule (daily / weekly / monthly)
const nextRepeatDate = (dateStr, repeat) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (repeat === 'daily') dt.setDate(dt.getDate() + 1);
  else if (repeat === 'weekly') dt.setDate(dt.getDate() + 7);
  else if (repeat === 'monthly') dt.setMonth(dt.getMonth() + 1);
  else return null;
  return fmtDay(dt);
};

const weekdayLong = (dateStr) => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
  } catch {
    return dateStr;
  }
};

// To-Do: Master backlog (unscheduled) + day view + 30-day history.
// Props: data, setData, ttab/setTtab (mobile panes: master | today | history)
export default function Todo({ data, setData, ttab, setTtab }) {
  const me = data.user?.id ?? 'local-user';
  const tasks = data.tasks || [];
  const today = todayLocal();

  const [day, setDay] = useState(today);
  const [histDay, setHistDay] = useState(today);
  const [masterDraft, setMasterDraft] = useState('');
  const [dayDraft, setDayDraft] = useState('');
  const [dismissed, setDismissed] = useState(''); // date for which the overdue nudge was left alone
  const [showOverdue, setShowOverdue] = useState(false); // expand the unfinished-items list
  const [period, setPeriod] = useState('day'); // day | week | month (middle pane)
  const [weekOff, setWeekOff] = useState(0); // 0 = this week
  const [mon, setMon] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', notes: '', repeat: 'none', project: '' });
  const projById = useMemo(() => Object.fromEntries((data.projects || []).map((p) => [p.id, p])), [data.projects]);

  const master = useMemo(
    () => tasks.filter((t) => !t.scheduled_date && t.status === 'active').sort(byCreated),
    [tasks]
  );
  const dayTasks = useMemo(
    () => tasks.filter((t) => t.scheduled_date === day).sort(byCreated),
    [tasks, day]
  );
  const dayDone = dayTasks.filter((t) => t.status === 'done').length;
  const overdue = useMemo(
    () => (day === today ? tasks.filter((t) => t.scheduled_date && t.scheduled_date < today && t.status === 'active').sort(byCreated) : []),
    [tasks, day, today]
  );
  const days30 = useMemo(last30, []);
  const dayStats = useMemo(() => {
    const m = {};
    tasks.forEach((t) => {
      if (!t.scheduled_date) return;
      m[t.scheduled_date] = m[t.scheduled_date] || { total: 0, done: 0 };
      m[t.scheduled_date].total++;
      if (t.status === 'done') m[t.scheduled_date].done++;
    });
    return m;
  }, [tasks]);
  const histTasks = useMemo(
    () => tasks.filter((t) => t.scheduled_date === histDay).sort(byCreated),
    [tasks, histDay]
  );

  // Week view: Monday–Sunday of the viewed week
  const weekMonday = shiftDay(mondayStr(), weekOff * 7);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDay(weekMonday, i)), [weekMonday]);
  const weekDone = weekDays.reduce((s, d) => s + tasks.filter((t) => t.scheduled_date === d && t.status === 'done').length, 0);
  const weekTotal = weekDays.reduce((s, d) => s + tasks.filter((t) => t.scheduled_date === d).length, 0);

  // Month view grid
  const monthWeeks = useMemo(() => monthGrid(mon.y, mon.m), [mon]);

  const jumpToDay = (date) => {
    setDay(date);
    setPeriod('day');
  };

  // ---------- actions ----------
  const addTask = (title, date) => {
    if (!title.trim()) return;
    const max = tasks.reduce((m, t) => Math.max(m, t.sort_order ?? 0), -1);
    setData((d) => ({
      ...d,
      tasks: [...(d.tasks || []), {
        id: uid(), user_id: me, title: title.trim(), notes: '',
        scheduled_date: date || null, repeat: 'none', project_id: null,
        status: 'active', sort_order: max + 1,
        created_at: now(), updated_at: now(), completed_at: null,
      }],
    }));
  };

  const toggleTask = (t) => {
    const tnow = now();
    const done = t.status !== 'done';
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((x) => (x.id === t.id
        ? { ...x, status: done ? 'done' : 'active', completed_at: done ? tnow : null, updated_at: tnow }
        : x)),
    }));
  };

  // Forward-plan repeating series: keep the tail filled to the horizon.
  // Only extends the tail (never refills deleted middle copies), so it converges.
  useEffect(() => {
    if (!tasks.length) return;
    const groups = {};
    tasks.forEach((t) => {
      if (!t.repeat || t.repeat === 'none' || !t.scheduled_date) return;
      const k = t.series_id || `t:${(t.title || '').trim().toLowerCase()}|${t.repeat}`;
      const g = groups[k] || (groups[k] = { repeat: t.repeat, title: t.title, key: t.series_id || t.id, max: '' });
      if (t.scheduled_date > g.max) {
        g.max = t.scheduled_date;
        g.key = t.series_id || t.id;
      }
    });
    const horizonDays = { daily: 30, weekly: 84, monthly: 180 };
    const have = new Set(tasks.map((t) => `${(t.title || '').trim().toLowerCase()}|${t.repeat}|${t.scheduled_date}`));
    const add = [];
    Object.values(groups).forEach((g) => {
      const h = horizonDays[g.repeat];
      if (!h) return;
      let cursor = g.max < today ? shiftDay(today, -1) : g.max;
      const end = shiftDay(today, h);
      const src = tasks.find((t) => (t.series_id || t.id) === g.key) || {};
      let guard = 0;
      while (guard++ < 200) {
        const nd = nextRepeatDate(cursor, g.repeat);
        if (!nd || nd <= cursor || nd > end) break;
        cursor = nd;
        const sig = `${(g.title || '').trim().toLowerCase()}|${g.repeat}|${nd}`;
        if (have.has(sig)) continue;
        have.add(sig);
        add.push({
          id: uid(), user_id: me, title: g.title, notes: '',
          scheduled_date: nd, repeat: g.repeat, project_id: src.project_id ?? null,
          status: 'active', sort_order: 0,
          created_at: now(), updated_at: now(), completed_at: null, series_id: g.key,
        });
      }
    });
    if (add.length) setData((d) => ({ ...d, tasks: [...(d.tasks || []), ...add] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const deleteTask = (id) => {
    if (!confirm('Delete this to-do?')) return;
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  const schedule = (id, date) => {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((x) => (x.id === id ? { ...x, scheduled_date: date, updated_at: now() } : x)),
    }));
  };

  const moveOverdueToday = () => {
    const tnow = now();
    const ids = new Set(overdue.map((t) => t.id));
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((x) => (ids.has(x.id) ? { ...x, scheduled_date: today, updated_at: tnow } : x)),
    }));
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditDraft({ title: t.title, notes: t.notes ?? '', repeat: t.repeat ?? 'none', project: t.project_id ?? '' });
  };

  const saveEdit = () => {
    if (!editDraft.title.trim()) return alert('Title is required.');
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((x) => (x.id === editingId
        ? { ...x, title: editDraft.title.trim(), notes: editDraft.notes, repeat: editDraft.repeat ?? 'none', project_id: editDraft.project || null, updated_at: now() }
        : x)),
    }));
    setEditingId(null);
  };

  const rowEditor = (t) => (
    <div className="flex-1 grid gap-1.5">
      <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="input !py-1.5 !text-sm font-semibold" autoFocus />
      <input value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} placeholder="Note (optional)…" className="input !py-1.5 !text-xs" />
      <div className="flex gap-1.5">
        <select value={editDraft.repeat} onChange={(e) => setEditDraft({ ...editDraft, repeat: e.target.value })} className="input !py-1.5 !text-xs flex-1" aria-label="repeat">
          <option value="none">Does not repeat</option>
          <option value="daily">🔁 Repeats daily</option>
          <option value="weekly">🔁 Repeats weekly</option>
          <option value="monthly">🔁 Repeats monthly</option>
        </select>
        <select value={editDraft.project} onChange={(e) => setEditDraft({ ...editDraft, project: e.target.value })} className="input !py-1.5 !text-xs flex-1" aria-label="venture">
          <option value="">No venture</option>
          {(data.projects || []).map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
        </select>
      </div>
      <div className="flex gap-1.5">
        <button onClick={saveEdit} className="px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold">Save</button>
        <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-lg border text-xs font-bold">Cancel</button>
      </div>
    </div>
  );

  const taskRow = (t, opts) => (
    <li key={t.id} className={`flex items-start gap-2 px-3 py-2.5 ${t.status === 'done' ? 'opacity-60' : ''}`}>
      {opts.readonly ? (
        <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${t.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
          {t.status === 'done' ? '✓' : ''}
        </span>
      ) : (
        <button onClick={() => toggleTask(t)} aria-label="toggle done"
          className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${t.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
          {t.status === 'done' ? '✓' : ''}
        </button>
      )}
      {editingId === t.id && !opts.readonly ? rowEditor(t) : (
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-[15px] leading-snug ${t.status === 'done' ? 'line-through' : ''}`}>
            {t.title}
            {t.repeat && t.repeat !== 'none' && <span className="ml-1.5 text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-1.5 py-0.5 whitespace-nowrap">🔁 {t.repeat}</span>}
            {t.project_id && projById[t.project_id] && <span className="ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 whitespace-nowrap text-white" style={{ background: projById[t.project_id].color }}>{projById[t.project_id].icon} {projById[t.project_id].name}</span>}
          </p>
          {t.notes && <p className="text-xs text-slate-500 truncate">{t.notes}</p>}
        </div>
      )}
      {!opts.readonly && editingId !== t.id && (
        <div className="flex gap-0.5 shrink-0">
          {opts.toDay && t.status === 'active' && (
            <button onClick={() => schedule(t.id, opts.toDay)} title={`Schedule for ${opts.toDay === today ? 'today' : fmtDateLong(opts.toDay)}`} className="px-2 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg">＋ Day</button>
          )}
          {opts.toMaster && (
            <button onClick={() => schedule(t.id, null)} title="Back to Master backlog" className="px-2 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">Master</button>
          )}
          <button onClick={() => startEdit(t)} className="px-2 py-1.5 text-xs font-bold text-blue-600">Edit</button>
          <button onClick={() => deleteTask(t.id)} className="px-2 py-1.5 text-xs font-bold text-slate-300 hover:text-red-500">✕</button>
        </div>
      )}
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px] items-start">
      {/* LEFT: Master backlog */}
      <section className={`card p-4 ${ttab === 'master' ? '' : 'hidden lg:block'}`}>
        <h2 className="font-display font-bold text-lg">📥 Master list</h2>
        <p className="text-xs text-slate-500 mt-0.5">Unscheduled pool — pull items into a day.</p>
        <div className="flex gap-1.5 mt-2">
          <input value={masterDraft} onChange={(e) => setMasterDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (addTask(masterDraft, null), setMasterDraft(''))} placeholder="Park a to-do…" className="input !text-sm" />
          <button onClick={() => { addTask(masterDraft, null); setMasterDraft(''); }} className="px-3.5 rounded-xl bg-slate-900 text-white text-sm font-bold shrink-0">Add</button>
        </div>
        {master.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl">📥</div>
            <p className="font-bold mt-2 text-sm">Master is empty</p>
            <p className="text-xs text-slate-500">Park anything here — no date, no pressure.</p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden bg-white">
            {master.map((t) => taskRow(t, { toDay: day }))}
          </ul>
        )}
        <p className="text-[11px] text-slate-400 mt-2">{plural(master.length, 'item')} waiting · done ones disappear ✓</p>
      </section>

      {/* MIDDLE: day / week / month views */}
      <section className={`card p-4 ${ttab === 'today' ? '' : 'hidden lg:block'}`}>
        <div className="flex gap-1.5 text-xs font-bold mb-1">
          {[['day', '☀️ Day'], ['week', '🗓️ Week'], ['month', '📅 Month']].map(([p, label]) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-1.5 rounded-xl ${period === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>
        {period === 'day' ? (
        <>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDay(shiftDay(day, -1))} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold" aria-label="previous day">‹</button>
            <div className="text-center min-w-[150px]">
              <h2 className="font-display font-bold text-lg leading-tight">
                {day === today ? '☀️ Today' : fmtDateLong(day)}
              </h2>
              <p className="text-[11px] text-slate-400">{day === today ? fmtDateLong(day) : `${dayDone}/${dayTasks.length} done`}</p>
            </div>
            <button onClick={() => setDay(shiftDay(day, 1))} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold" aria-label="next day">›</button>
          </div>
          <div className="flex gap-1.5">
            {day !== today && (
              <button onClick={() => setDay(today)} className="px-3 py-1.5 rounded-xl bg-slate-100 text-xs font-bold">Today</button>
            )}
            <input value={day} onChange={(e) => e.target.value && setDay(e.target.value)} type="date" className="input !w-auto !py-1.5 !text-xs" aria-label="jump to date" />
          </div>
        </div>

        {day === today && overdue.length > 0 && dismissed !== today && (
          <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <button onClick={() => setShowOverdue((v) => !v)} className="w-full text-left">
              <p className="text-sm font-bold">⏰ {plural(overdue.length, 'unfinished item')} from earlier {showOverdue ? '▾' : '▸'}</p>
              <p className="text-xs text-slate-500">Tap to view the list — carry them into today, or leave them as missed.</p>
            </button>
            {showOverdue && (
              <ul className="mt-2 divide-y divide-amber-100 rounded-xl border border-amber-200 overflow-hidden bg-white">
                {overdue.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-2.5 py-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">{fmtDayMon(t.scheduled_date)}</span>
                    <span className="flex-1 min-w-0 text-sm font-semibold truncate" title={t.title}>{t.title}</span>
                    <button onClick={() => schedule(t.id, today)} className="px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg shrink-0">→ Today</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-2 text-xs font-bold">
              <button onClick={moveOverdueToday} className="flex-1 py-2 rounded-xl bg-slate-900 text-white">Move all to today →</button>
              <button onClick={() => setDismissed(today)} className="px-4 py-2 rounded-xl border bg-white">Leave</button>
            </div>
          </div>
        )}

        {dayTasks.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] font-bold text-slate-500">
              <span>Day progress</span>
              <span>{dayDone}/{dayTasks.length} done · {dayTasks.length ? Math.round((dayDone / dayTasks.length) * 100) : 0}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" style={{ width: `${dayTasks.length ? (dayDone / dayTasks.length) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-1.5 mt-3">
          <input value={dayDraft} onChange={(e) => setDayDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (addTask(dayDraft, day), setDayDraft(''))} placeholder={`Add to ${day === today ? 'today' : fmtDateLong(day)}…`} className="input !text-sm" />
          <button onClick={() => { addTask(dayDraft, day); setDayDraft(''); }} className="btn-primary px-4 text-sm shrink-0">＋ Add</button>
        </div>

        {dayTasks.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-5xl">{day === today ? '🪴' : '📭'}</div>
            <p className="font-bold mt-2">{day === today ? 'A fresh today' : 'Nothing scheduled'}</p>
            <p className="text-sm text-slate-500">{day < today ? 'This day stayed empty.' : 'Pull from Master or add above.'}</p>
          </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden bg-white">
              {dayTasks.map((t) => taskRow(t, { toMaster: true }))}
            </ul>
          )}
        </>
        ) : period === 'week' ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setWeekOff((o) => o - 1)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold" aria-label="previous week">‹</button>
              <div className="text-center">
                <h2 className="font-display font-bold text-base leading-tight">
                  {weekOff === 0 ? '🗓️ This week' : `${fmtDayMon(weekDays[0])} – ${fmtDateLong(weekDays[6])}`}
                </h2>
                <p className="text-[11px] text-slate-400">{weekDone}/{weekTotal} done</p>
              </div>
              <button onClick={() => setWeekOff((o) => o + 1)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold" aria-label="next week">›</button>
            </div>
            {weekOff !== 0 && (
              <button onClick={() => setWeekOff(0)} className="mt-2 w-full py-1.5 rounded-xl bg-slate-100 text-xs font-bold">Back to this week</button>
            )}
            <div className="grid gap-1.5 mt-2">
              {weekDays.map((wd) => {
                const ts = tasks.filter((t) => t.scheduled_date === wd).sort(byCreated);
                const dn = ts.filter((t) => t.status === 'done').length;
                const isT = wd === today;
                return (
                  <button key={wd} onClick={() => jumpToDay(wd)}
                    className={`text-left rounded-2xl border px-3 py-2 transition ${isT ? 'border-slate-900 shadow bg-slate-900 text-white' : 'border-slate-100 hover:border-slate-300 bg-white'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm">{isT ? '☀️ Today' : weekdayLong(wd)} <span className={`text-[11px] font-semibold ${isT ? 'text-white/70' : 'text-slate-400'}`}>{fmtDayMon(wd)}</span></span>
                      <span className={`text-[11px] font-bold ${isT ? 'text-white/80' : 'text-slate-500'}`}>{dn}/{ts.length}</span>
                    </span>
                    <span className={`block h-1 rounded-full mt-1.5 overflow-hidden ${isT ? 'bg-white/20' : 'bg-slate-100'}`}>
                      <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${ts.length ? (dn / ts.length) * 100 : 0}%` }} />
                    </span>
                    {ts.slice(0, 3).map((t) => (
                      <span key={t.id} className={`block text-xs truncate mt-0.5 ${t.status === 'done' ? `line-through ${isT ? 'text-white/60' : 'text-slate-400'}` : isT ? 'text-white/90' : 'text-slate-600'}`}>
                        {t.status === 'done' ? '✓ ' : '· '}{t.title}
                      </span>
                    ))}
                    {ts.length > 3 && <span className={`block text-[11px] mt-0.5 ${isT ? 'text-white/60' : 'text-slate-400'}`}>+{ts.length - 3} more — tap to open day →</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setMon((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold" aria-label="previous month">‹</button>
              <h2 className="font-display font-bold text-base">🗓️ {monthLabel(mon.y, mon.m)}</h2>
              <button onClick={() => setMon((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold" aria-label="next month">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mt-2 text-center text-[10px] font-bold text-slate-400 uppercase">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className="grid gap-1 mt-1">
              {monthWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.map((date, di) => {
                    if (!date) return <span key={di} />;
                    const s = dayStats[date] || { total: 0, done: 0 };
                    const isT = date === today;
                    const pct = s.total ? s.done / s.total : 0;
                    return (
                      <button key={di} onClick={() => jumpToDay(date)} title={`${fmtDateLong(date)}: ${s.done}/${s.total} done — tap to open`}
                        className={`aspect-square rounded-xl text-xs font-bold flex flex-col items-center justify-center transition ${s.total ? 'bg-indigo-100 text-indigo-900 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'} ${isT ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}>
                        <span>{Number(date.slice(8, 10))}</span>
                        {s.total > 0 && <span className="text-[9px] leading-none">{s.done}/{s.total}</span>}
                        {s.total > 0 && (
                          <span className="w-4/5 h-1 rounded-full bg-white/70 mt-0.5 overflow-hidden">
                            <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct * 100}%` }} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Tap any day to open it. Repeating tasks appear automatically after you complete one. 🔁</p>
          </div>
        )}
      </section>

      {/* RIGHT: 30-day history */}
      <aside className={`card p-4 ${ttab === 'history' ? '' : 'hidden lg:block'}`}>
        <h2 className="font-display font-bold text-lg">🕘 Last 30 days</h2>
        <p className="text-xs text-slate-500 mt-0.5">Tap a day to see exactly what it held.</p>
        <div className="grid grid-cols-6 gap-1 mt-2">
          {days30.map((d) => {
            const s = dayStats[d] || { total: 0, done: 0 };
            const isToday = d === today;
            const active = histDay === d;
            const pct = s.total ? s.done / s.total : 0;
            return (
              <button key={d} onClick={() => setHistDay(d)} title={`${fmtDateLong(d)}: ${s.done}/${s.total} done`}
                className={`rounded-xl py-1.5 text-center border transition ${active ? 'border-slate-900 shadow' : 'border-slate-100 hover:border-slate-300'} ${isToday ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                <span className={`block text-sm font-extrabold leading-none ${isToday ? '' : ''}`}>{Number(d.slice(8, 10))}</span>
                <span className="block h-1 rounded-full bg-slate-100 mt-1 mx-1 overflow-hidden">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct * 100}%` }} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <p className="text-xs font-bold text-slate-500 uppercase">{histDay === today ? '☀️ Today' : fmtDateLong(histDay)} · history is frozen ❄️</p>
          {histTasks.length === 0 ? (
            <p className="text-sm text-slate-400 mt-1">Nothing was scheduled.</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden bg-white">
              {histTasks.map((t) => taskRow(t, { readonly: true }))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
