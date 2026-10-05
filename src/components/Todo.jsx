import { useMemo, useState } from 'react';
import { uid, now } from '../lib/store.js';
import { todayLocal, fmtDay, fmtDateLong, plural } from '../lib/growth.js';

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
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', notes: '' });

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
    setEditDraft({ title: t.title, notes: t.notes ?? '' });
  };

  const saveEdit = () => {
    if (!editDraft.title.trim()) return alert('Title is required.');
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((x) => (x.id === editingId
        ? { ...x, title: editDraft.title.trim(), notes: editDraft.notes, updated_at: now() }
        : x)),
    }));
    setEditingId(null);
  };

  const rowEditor = (t) => (
    <div className="flex-1 grid gap-1.5">
      <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} className="input !py-1.5 !text-sm font-semibold" autoFocus />
      <input value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} placeholder="Note (optional)…" className="input !py-1.5 !text-xs" />
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
          <p className={`font-semibold text-[15px] leading-snug ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</p>
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

      {/* MIDDLE: day view */}
      <section className={`card p-4 ${ttab === 'today' ? '' : 'hidden lg:block'}`}>
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
            <p className="text-sm font-bold">⏰ {plural(overdue.length, 'unfinished item')} from earlier</p>
            <p className="text-xs text-slate-500">Carry them into today, or leave them in history as missed.</p>
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
