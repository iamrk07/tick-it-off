import { useMemo, useState } from 'react';
import { uid, now } from '../lib/store.js';
import { fmtDateLong, fmtDayMon, plural } from '../lib/growth.js';

const COLORS = ['#f59e0b', '#8b5cf6', '#10b981', '#3b82f6', '#ec4899', '#ef4444', '#0ea5e9', '#64748b'];
const PICONS = ['💡', '🚀', '💼', '🎨', '📚', '🏋️', '💰', '🌱', '🎯', '⭐', '📝', '🎸'];
const STATUSES = [
  ['idea', '💡 Idea'],
  ['active', '🚀 Active'],
  ['parked', '🅿️ Parked'],
  ['done', '✅ Done'],
];
const statusLabel = (s) => (STATUSES.find(([k]) => k === s) || ['?', s])[1];

const blankProject = () => ({ name: '', notes: '', link: '', status: 'idea', color: COLORS[0], icon: PICONS[0] });

// Ideas / Ventures: projects with a status pipeline, notes, and linked to-dos.
// Props: data, setData, itab/setItab (mobile panes: projects | detail)
export default function Ideas({ data, setData, itab, setItab }) {
  const me = data.user?.id ?? 'local-user';
  const projects = useMemo(
    () => [...(data.projects || [])].sort((a, b) => a.sort_order - b.sort_order),
    [data.projects]
  );
  const tasks = data.tasks || [];

  const [statusFilter, setStatusFilter] = useState('all');
  const [selId, setSelId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(blankProject());
  const [editing, setEditing] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');
  const [taskDate, setTaskDate] = useState('');

  const sel = projects.find((p) => p.id === (selId ?? projects[0]?.id)) ?? null;

  const counts = useMemo(() => {
    const m = { all: projects.length };
    STATUSES.forEach(([k]) => {
      m[k] = projects.filter((p) => p.status === k).length;
    });
    return m;
  }, [projects]);

  const visible = statusFilter === 'all' ? projects : projects.filter((p) => p.status === statusFilter);

  const linked = useMemo(
    () => (sel ? tasks.filter((t) => t.project_id === sel.id).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')) : []),
    [tasks, sel?.id]
  );
  const linkedOpen = linked.filter((t) => t.status === 'active').length;

  // ---------- actions ----------
  const addProject = () => {
    if (!draft.name.trim()) return alert('Name your venture (e.g. Clothing brand, YouTube channel).');
    const max = projects.reduce((m, p) => Math.max(m, p.sort_order ?? 0), -1);
    const id = uid();
    const t = now();
    setData((d) => ({
      ...d,
      projects: [...(d.projects || []), {
        id, user_id: me, name: draft.name.trim(), icon: draft.icon, color: draft.color,
        status: draft.status, notes: draft.notes, link: draft.link.trim(),
        sort_order: max + 1, created_at: t, updated_at: t,
      }],
    }));
    setDraft(blankProject());
    setShowNew(false);
    setSelId(id);
    setItab('detail');
  };

  const saveProject = () => {
    if (!sel || !draft.name.trim()) return alert('Name is required.');
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === sel.id
        ? { ...p, name: draft.name.trim(), icon: draft.icon, color: draft.color, status: draft.status, notes: draft.notes, link: draft.link.trim(), updated_at: now() }
        : p)),
    }));
    setEditing(false);
  };

  const setStatus = (id, status) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === id ? { ...p, status, updated_at: now() } : p)),
    }));
  };

  const deleteProject = (id) => {
    if (!confirm('Delete this venture? Its to-dos stay, unlinked.')) return;
    setData((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      tasks: d.tasks.map((t) => (t.project_id === id ? { ...t, project_id: null, updated_at: now() } : t)),
    }));
    if (selId === id) setSelId(null);
  };

  const addLinkedTask = () => {
    if (!sel || !taskDraft.trim()) return;
    const max = tasks.reduce((m, t) => Math.max(m, t.sort_order ?? 0), -1);
    const t = now();
    setData((d) => ({
      ...d,
      tasks: [...(d.tasks || []), {
        id: uid(), user_id: me, title: taskDraft.trim(), notes: '',
        scheduled_date: taskDate || null, repeat: 'none', project_id: sel.id,
        status: 'active', sort_order: max + 1, created_at: t, updated_at: t, completed_at: null,
      }],
    }));
    setTaskDraft('');
    setTaskDate('');
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

  const pick = (id) => {
    setSelId(id);
    setEditing(false);
    setItab('detail');
  };

  const startEdit = () => {
    if (!sel) return;
    setDraft({ name: sel.name, notes: sel.notes ?? '', link: sel.link ?? '', status: sel.status, color: sel.color, icon: sel.icon });
    setEditing(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
      {/* LEFT: ventures */}
      <section className={`card p-4 ${itab === 'projects' ? '' : 'hidden lg:block'}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">💡 Ideas</h2>
          <button onClick={() => { setDraft(blankProject()); setShowNew((v) => !v); }} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white">
            {showNew ? 'Close' : '＋ New'}
          </button>
        </div>

        {showNew && (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-3 grid gap-1.5">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Clothing brand, Café…" className="input !text-sm" />
            <div className="flex gap-1.5">
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="input !text-sm !py-2 flex-1">
                {STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="Link (optional)" inputMode="url" className="input !text-sm !py-2 flex-1" />
            </div>
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="What is it about? First steps…" rows={2} className="input !text-sm" />
            <div className="flex gap-1 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setDraft({ ...draft, color: c })} className={`w-6 h-6 rounded-full border-2 ${draft.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {PICONS.map((e) => (
                <button key={e} onClick={() => setDraft({ ...draft, icon: e })} className={`w-7 h-7 rounded-lg border ${draft.icon === e ? 'border-slate-900 bg-slate-100' : ''}`}>{e}</button>
              ))}
            </div>
            <button onClick={addProject} className="btn-primary py-2 text-sm">Create venture</button>
          </div>
        )}

        <div className="flex gap-1.5 mt-3 text-[11px] font-bold flex-wrap">
          <button onClick={() => setStatusFilter('all')} className={`px-2.5 py-1 rounded-full ${statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
            All · {counts.all}
          </button>
          {STATUSES.map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)} className={`px-2.5 py-1 rounded-full ${statusFilter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {label} · {counts[k]}
            </button>
          ))}
        </div>

        <div className="mt-2 grid gap-1.5">
          {visible.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl">💡</div>
              <p className="font-bold mt-2 text-sm">Nothing here</p>
              <p className="text-xs text-slate-500">Start a venture with ＋ New.</p>
            </div>
          )}
          {visible.map((p) => {
            const open = tasks.filter((t) => t.project_id === p.id && t.status === 'active').length;
            const active = sel?.id === p.id;
            return (
              <button key={p.id} onClick={() => pick(p.id)}
                className={`w-full text-left rounded-2xl border p-3 transition overflow-hidden ${active ? 'border-transparent shadow-md' : 'border-slate-100 hover:border-slate-200'}`}
                style={active ? { background: `linear-gradient(135deg, ${p.color}22, #ffffff)`, borderLeft: `5px solid ${p.color}` } : { borderLeft: `5px solid ${p.color}` }}>
                <span className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${p.color}1e` }}>{p.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-sm truncate">{p.name}</span>
                    <span className="block text-[11px] text-slate-400">{statusLabel(p.status)} · {plural(open, 'open to-do')}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* RIGHT: venture detail */}
      <div className={`grid gap-4 ${itab === 'detail' ? '' : 'hidden lg:grid'}`}>
        {!sel ? (
          <section className="card p-8 text-center">
            <div className="text-5xl">💡</div>
            <p className="font-bold mt-2">Pick a venture to open its file</p>
            <p className="text-sm text-slate-500">Status, notes, links and its to-dos live here.</p>
          </section>
        ) : (
          <>
            <section className="card card-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${sel.color}1e` }}>{sel.icon}</span>
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-xl truncate">{sel.name}</h2>
                    <p className="text-xs text-slate-500">{statusLabel(sel.status)} · {plural(linkedOpen, 'open to-do')}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 text-xs font-bold">
                  <button onClick={startEdit} className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">Edit</button>
                  <button onClick={() => deleteProject(sel.id)} className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-100">Del</button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 mt-3 text-xs font-bold">
                {STATUSES.map(([k, label]) => (
                  <button key={k} onClick={() => setStatus(sel.id, k)}
                    className={`py-2 rounded-xl transition ${sel.status === k ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {editing ? (
                <div className="mt-3 rounded-2xl bg-slate-50 border p-3 grid gap-1.5">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input !text-sm" />
                  <div className="flex gap-1.5">
                    <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="input !text-sm !py-2 flex-1">
                      {STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    <input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="Link" inputMode="url" className="input !text-sm !py-2 flex-1" />
                  </div>
                  <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} placeholder="Notes…" className="input !text-sm" />
                  <div className="flex gap-1 flex-wrap">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => setDraft({ ...draft, color: c })} className={`w-6 h-6 rounded-full border-2 ${draft.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {PICONS.map((e) => (
                      <button key={e} onClick={() => setDraft({ ...draft, icon: e })} className={`w-7 h-7 rounded-lg border ${draft.icon === e ? 'border-slate-900 bg-white' : ''}`}>{e}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveProject} className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Save</button>
                    <button onClick={() => setEditing(false)} className="px-4 rounded-xl border text-sm font-bold">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {sel.notes && <p className="text-sm text-slate-700 whitespace-pre-wrap mt-3 bg-slate-50 rounded-xl p-3">{sel.notes}</p>}
                  {sel.link && (
                    <a href={/^https?:\/\//i.test(sel.link) ? sel.link : `https://${sel.link}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-rose-500 rounded-xl px-3 py-2.5 break-all">
                      🔗 {sel.link} <span aria-hidden>↗</span>
                    </a>
                  )}
                </>
              )}
            </section>

            <section className="card p-4">
              <h3 className="font-display font-bold text-base">✅ Venture to-dos ({linkedOpen} open)</h3>
              <div className="flex gap-1.5 mt-2">
                <input value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLinkedTask()} placeholder={`Add a to-do for ${sel.name}…`} className="input !text-sm flex-1" />
                <input value={taskDate} onChange={(e) => setTaskDate(e.target.value)} type="date" title="Date (empty = Master)" className="input !text-xs !w-auto" />
                <button onClick={addLinkedTask} className="btn-primary px-4 text-sm shrink-0">＋ Add</button>
              </div>
              {linked.length === 0 ? (
                <p className="text-sm text-slate-500 mt-2">No to-dos attached yet — break this venture into dated steps above.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden bg-white">
                  {linked.map((t) => (
                    <li key={t.id} className={`flex items-center gap-2 px-3 py-2.5 ${t.status === 'done' ? 'opacity-60' : ''}`}>
                      <button onClick={() => toggleTask(t)} aria-label="toggle done"
                        className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${t.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                        {t.status === 'done' ? '✓' : ''}
                      </button>
                      <span className="flex-1 min-w-0">
                        <span className={`block font-semibold text-[15px] truncate ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</span>
                        <span className="block text-[11px] text-slate-400">
                          {t.scheduled_date ? fmtDateLong(t.scheduled_date) : '📥 Master'}
                          {t.repeat && t.repeat !== 'none' ? ` · 🔁 ${t.repeat}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400 mt-2">Full edit lives in ✅ To-Do — these stay in sync everywhere. 🔁</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
