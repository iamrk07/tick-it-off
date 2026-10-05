import { useEffect, useMemo, useState } from 'react';
import { useStore, useCloudStore, uid, now, LOCAL_USER_ID } from './lib/store.js';
import { supabase } from './lib/supabase.js';
import AuthArea from './components/Auth.jsx';
import Growth from './components/Growth.jsx';
import { calcStreak } from './lib/growth.js';
import { toJSON, toCSV } from './lib/export.js';

const COLORS = ['#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#ef4444', '#0ea5e9', '#64748b'];
const ICONS = ['📚', '☕', '✈️', '💬', '🧠', '⏰', '⭐', '🎯', '📝', '💡', '🎨', '🌿'];

const fmt = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};
const fmtFull = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

function emptyItem(catId) {
  return { category_id: catId ?? '', title: '', notes: '', link: '', is_checklist: false, subs: [''] };
}
// Placeholder while cloud data loads (replaced before anything renders)
const EMPTY = { user: null, settings: { appTitle: 'Tick It Off ✅', tagline: '' }, categories: [], items: [], subitems: [], trackers: [], tracker_logs: [] };
const asLink = (l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`);

// A fresh line of fuel under the title — rotates daily
const QUOTES = [
  'Small steps every day. 🌱',
  'Done is better than perfect. ✅',
  'What gets written, gets done. 📝',
  'Focus is a superpower. 🎯',
  'One task at a time. 🐢',
  'Future you says thanks. 🙏',
  'Discipline beats motivation. 💪',
];
const todayQuote = () => QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];

export default function App() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Logged out → this-device storage (exactly as before).
  // Logged in → cloud-synced storage with the same interface, so every
  // action below works unchanged in both modes.
  const [localData, setLocalData] = useStore();
  const [cloudData, setCloudData, cloudMeta] = useCloudStore(session, localData);
  const data = session ? cloudData ?? EMPTY : localData;
  const setData = session ? setCloudData : setLocalData;

  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [manageCats, setManageCats] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [mobileTab, setMobileTab] = useState('items'); // cats | items | details
  const [view, setView] = useState('home'); // home | plan | growth
  const [gtab, setGtab] = useState('trackers'); // trackers | progress (mobile panes in growth view)
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [form, setForm] = useState(emptyItem(data.categories[0]?.id));
  const [newCat, setNewCat] = useState({ name: '', color: COLORS[0], icon: ICONS[0] });

  const cats = useMemo(() => [...data.categories].sort((a, b) => a.sort_order - b.sort_order), [data.categories]);
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const counts = useMemo(() => {
    const m = {};
    data.items.forEach((i) => { if (!i.is_archived) m[i.category_id] = (m[i.category_id] ?? 0) + 1; });
    return m;
  }, [data.items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.items]
      .filter((i) => (selectedCat === 'all' ? true : i.category_id === selectedCat))
      .filter((i) => (statusFilter === 'archived' ? !!i.is_archived : !i.is_archived))
      .filter((i) => (statusFilter === 'all' || statusFilter === 'archived' ? true : i.status === statusFilter))
      .filter((i) => (!q ? true : (i.title + '\n' + (i.notes ?? '') + '\n' + (i.link ?? '')).toLowerCase().includes(q)))
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }, [data.items, selectedCat, statusFilter, query]);

  // Counts for the status pills: current category + search, before status filter.
  // Archived entries are excluded from active/done/all and counted separately.
  const statusCounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inCat = data.items.filter(
      (i) =>
        (selectedCat === 'all' ? true : i.category_id === selectedCat) &&
        (!q ? true : (i.title + '\n' + (i.notes ?? '') + '\n' + (i.link ?? '')).toLowerCase().includes(q))
    );
    const live = inCat.filter((i) => !i.is_archived);
    return {
      active: live.filter((i) => i.status === 'active').length,
      done: live.filter((i) => i.status === 'done').length,
      all: live.length,
      archived: inCat.filter((i) => i.is_archived).length,
    };
  }, [data.items, selectedCat, query]);

  const selectedItem = data.items.find((i) => i.id === selectedItemId) ?? null;
  const selectedSubs = useMemo(
    () => (selectedItem ? data.subitems.filter((s) => s.item_id === selectedItem.id) : []),
    [data.subitems, selectedItem]
  );

  const activeCount = data.items.filter((i) => i.status === 'active' && !i.is_archived).length;
  const doneCount = data.items.filter((i) => i.status === 'done' && !i.is_archived).length;
  const archivedCount = data.items.filter((i) => i.is_archived).length;

  // Best day-streak across all growth trackers (for the home card)
  const bestStreak = useMemo(() => {
    let best = 0;
    (data.trackers || []).forEach((t) => {
      const dates = new Set((data.tracker_logs || []).filter((l) => l.tracker_id === t.id).map((l) => l.log_date));
      best = Math.max(best, calcStreak(dates));
    });
    return best;
  }, [data.trackers, data.tracker_logs]);

  // The category a NEW entry should land in: the one you're viewing,
  // or the first category when viewing "All".
  const defaultCatId = () => (selectedCat !== 'all' ? selectedCat : cats[0]?.id ?? '');
  const formCat = catById[form.category_id];

  // ---------- settings ----------
  const saveTitle = () => {
    const v = titleDraft.trim() || 'Tick It Off ✅';
    setData((d) => ({ ...d, settings: { ...d.settings, appTitle: v } }));
    setEditingTitle(false);
  };

  // Clicking the title goes home (the ultimate reset)
  const resetView = () => {
    setQuery('');
    setStatusFilter('active');
    setSelectedCat('all');
    setSelectedItemId(null);
    setMobileTab('items');
    setView('home');
  };

  // ---------- category actions ----------
  const addCategory = (name, color, icon) => {
    if (!name.trim()) return;
    const max = cats.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const id = uid();
    setData((d) => ({
      ...d,
      categories: [...d.categories, { id, user_id: LOCAL_USER_ID, name: name.trim(), color, icon, sort_order: max + 1, created_at: now() }],
    }));
    setSelectedCat(id);
  };
  const patchCategory = (id, patch) =>
    setData((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const deleteCategory = (id) => {
    if (!confirm('Delete this category and all its entries?')) return;
    setData((d) => {
      const ids = new Set(d.items.filter((i) => i.category_id === id).map((i) => i.id));
      return {
        ...d,
        categories: d.categories.filter((c) => c.id !== id),
        items: d.items.filter((i) => i.category_id !== id),
        subitems: d.subitems.filter((s) => !ids.has(s.item_id)),
      };
    });
    if (selectedCat === id) setSelectedCat('all');
  };
  const moveCategory = (id, dir) => {
    const sorted = [...cats];
    const idx = sorted.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    [sorted[idx], sorted[j]] = [sorted[j], sorted[idx]];
    const order = Object.fromEntries(sorted.map((c, k) => [c.id, k]));
    setData((d) => ({ ...d, categories: d.categories.map((c) => ({ ...c, sort_order: order[c.id] ?? c.sort_order })) }));
  };

  const selectCat = (id) => {
    setSelectedCat(id);
    // Keep a fresh (not-yet-opened) add-form in sync so it always
    // defaults to the category you're looking at.
    if (!showModal && !editingItem) {
      setForm((f) => ({ ...f, category_id: id !== 'all' ? id : f.category_id || cats[0]?.id }));
    }
    setMobileTab('items');
  };

  // ---------- item actions (modal popup form) ----------
  const openNew = () => {
    setEditingItem(null);
    setForm(emptyItem(defaultCatId()));
    setNewCat({ name: '', color: COLORS[0], icon: ICONS[0] });
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const saveItem = () => {
    if (!form.title.trim()) return alert('Title is required');
    let catId = form.category_id;
    if (catId === '__new__') {
      if (!newCat.name.trim()) return alert('Name the new category first');
      catId = uid();
      const maxOrder = cats.reduce((m, c) => Math.max(m, c.sort_order), -1);
      const fresh = { id: catId, user_id: LOCAL_USER_ID, name: newCat.name.trim(), color: newCat.color, icon: newCat.icon, sort_order: maxOrder + 1, created_at: now() };
      setData((d) => ({ ...d, categories: [...d.categories, fresh] }));
      setSelectedCat(catId);
    }
    if (!catId) return alert('Pick a category');
    let savedId = editingItem?.id;
    if (editingItem) {
      const t = now();
      setData((d) => ({
        ...d,
        items: d.items.map((i) =>
          i.id === editingItem.id
            ? { ...i, category_id: catId, title: form.title.trim(), notes: form.notes, link: form.link.trim(), is_checklist: form.is_checklist, updated_at: t }
            : i
        ),
        subitems: form.is_checklist
          ? [...d.subitems.filter((s) => s.item_id !== editingItem.id),
             ...form.subs.filter((s) => (typeof s === 'string' ? s.trim() : s.text.trim())).map((s) =>
               typeof s === 'string'
                 ? { id: uid(), item_id: editingItem.id, text: s.trim(), is_done: false, created_at: t, updated_at: t }
                 : { ...s, id: s.id ?? uid(), item_id: editingItem.id, text: s.text.trim(), created_at: s.created_at ?? t, updated_at: now() }
             )]
          : d.subitems.filter((s) => s.item_id !== editingItem.id),
      }));
    } else {
      const id = uid();
      savedId = id;
      const t = now();
      const subs = form.is_checklist
        ? form.subs.filter((s) => (typeof s === 'string' ? s.trim() : (s.text ?? '').trim())).map((s) => ({
            id: uid(), item_id: id, text: (typeof s === 'string' ? s : s.text).trim(), is_done: false, created_at: t, updated_at: t,
          }))
        : [];
      setData((d) => ({
        ...d,
        items: [...d.items, { id, category_id: catId, user_id: LOCAL_USER_ID, title: form.title.trim(), notes: form.notes, link: form.link.trim(), is_checklist: form.is_checklist, status: 'active', created_at: t, updated_at: t, completed_at: null, is_archived: false, archived_at: null }],
        subitems: [...d.subitems, ...subs],
      }));
    }
    setEditingItem(null);
    setShowModal(false);
    setSelectedItemId(savedId);
    setForm(emptyItem(catId || cats[0]?.id));
    setNewCat({ name: '', color: COLORS[0], icon: ICONS[0] });
    setMobileTab('details');
  };

  const toggleDone = (item) => {
    const t = now();
    const done = item.status !== 'done';
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, status: done ? 'done' : 'active', completed_at: done ? t : null, updated_at: t } : i)) }));
  };
  const archiveItem = (id) => {
    const t = now();
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, is_archived: true, archived_at: t, updated_at: t } : i)),
    }));
    if (selectedItemId === id) setSelectedItemId(null);
  };
  const restoreItem = (id) => {
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, is_archived: false, archived_at: null, updated_at: now() } : i)),
    }));
  };
  const deleteForever = (id) => {
    if (!confirm('Permanently delete this entry? This cannot be undone.')) return;
    setData((d) => ({
      ...d,
      items: d.items.filter((i) => i.id !== id),
      subitems: d.subitems.filter((s) => s.item_id !== id),
    }));
    if (selectedItemId === id) setSelectedItemId(null);
    if (editingItem?.id === id) { setEditingItem(null); setShowModal(false); }
  };
  const toggleSub = (sub) =>
    setData((d) => ({
      ...d,
      subitems: d.subitems.map((s) => (s.id === sub.id ? { ...s, is_done: !s.is_done, updated_at: now() } : s)),
      items: d.items.map((i) => (i.id === sub.item_id ? { ...i, updated_at: now() } : i)),
    }));

  const startEdit = (item) => {
    const subs = data.subitems.filter((s) => s.item_id === item.id);
    setEditingItem(item);
    setSelectedItemId(item.id);
    setForm({
      category_id: item.category_id, title: item.title, notes: item.notes ?? '', link: item.link ?? '',
      is_checklist: item.is_checklist, subs: item.is_checklist ? (subs.length ? subs : [{ text: '' }]) : [''],
    });
    setShowModal(true);
  };

  const pickItem = (id) => {
    setSelectedItemId(id);
    setMobileTab('details');
  };

  const appTitle = data.settings?.appTitle ?? 'Tick It Off ✅';
  const viewedCat = selectedCat === 'all' ? null : catById[selectedCat];

  // Logged in but cloud data still loading — don't render half-empty UI
  if (session && !cloudData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-sm">
          <div className="text-5xl">☁️</div>
          <p className="font-display font-bold text-xl mt-3">Loading your space…</p>
          <p className="text-sm text-slate-500 mt-1">Pulling your synced entries from the cloud.</p>
          {cloudMeta.sync.state === 'error' && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
              {cloudMeta.sync.error} — check your connection and reopen.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ===== Top banner ===== */}
      <header className="sticky top-0 z-20 border-b border-white/20 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-200">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {editingTitle ? (
                <div className="flex gap-2 items-center">
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                    placeholder="Name your space… e.g. Rahul's World"
                    className="px-3 py-1.5 rounded-xl text-slate-900 text-lg font-bold w-64 max-w-full"
                  />
                  <button onClick={saveTitle} className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-sm font-bold">Save</button>
                  <button onClick={() => setEditingTitle(false)} className="px-2 py-1.5 text-sm text-white/80">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1
                    onClick={resetView}
                    title="Click to reset view — show everything"
                    className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate cursor-pointer hover:opacity-90"
                  >
                    {appTitle}
                  </h1>
                  <button
                    onClick={() => { setTitleDraft(appTitle); setEditingTitle(true); }}
                    title="Rename your space"
                    className="text-white/80 hover:text-white text-sm bg-white/15 hover:bg-white/25 rounded-lg px-2 py-1"
                  >
                    ✏️
                  </button>
                </div>
              )}
              <p className="text-white/80 text-xs sm:text-sm mt-0.5 italic">“{todayQuote()}”</p>
              <div className="flex gap-2 mt-2 text-[11px]">
                {view === 'plan' && (
                  <>
                    <span className="bg-white/15 rounded-full px-2.5 py-0.5 whitespace-nowrap">🔥 {activeCount} active</span>
                    <span className="bg-white/15 rounded-full px-2.5 py-0.5 whitespace-nowrap">✅ {doneCount} done</span>
                    <span className="bg-white/15 rounded-full px-2.5 py-0.5 hidden sm:inline whitespace-nowrap">📁 {cats.length} categories</span>
                    {archivedCount > 0 && <span className="bg-white/15 rounded-full px-2.5 py-0.5 whitespace-nowrap">📦 {archivedCount} archived</span>}
                  </>
                )}
                {view === 'growth' && (
                  <span className="bg-white/15 rounded-full px-2.5 py-0.5 whitespace-nowrap">📈 {(data.trackers || []).length} trackers · 🔥 {bestStreak} best streak</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0 items-end">
              <AuthArea session={session} sync={cloudMeta.sync} onRefresh={cloudMeta.refresh} />
              <div className="flex gap-2">
                <button onClick={() => toJSON(data)} className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-bold shadow">⬇ JSON</button>
                <button onClick={() => toCSV(data)} className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/30 text-xs font-bold">⬇ CSV</button>
              </div>
            </div>
          </div>
          {view !== 'home' && (
          <div className="mt-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles, notes, links…"
                className="w-full pl-9 pr-3 py-2.5 rounded-2xl text-slate-900 text-[15px] shadow-inner outline-none focus:ring-4 ring-white/40"
              />
            </div>
          </div>
          )}
        </div>
      </header>

      {/* ===== Home / Planner / Growth ===== */}
      {view === 'home' ? (
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 pb-28 lg:pb-10 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => { setView('plan'); setMobileTab('items'); }}
          className="text-left rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-violet-200 min-h-[240px] flex flex-col justify-between transition hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed 55%, #db2777)' }}
        >
          <div>
            <div className="text-6xl">🗂️</div>
            <h2 className="font-display text-3xl font-bold mt-3">Planner</h2>
            <p className="text-white/80 text-sm mt-1">Goals, to-dos & reminders under your own categories.</p>
          </div>
          <div className="flex gap-2 mt-6 text-xs font-bold flex-wrap">
            <span className="bg-white/20 rounded-full px-3 py-1">🔥 {activeCount} active</span>
            <span className="bg-white/20 rounded-full px-3 py-1">📁 {cats.length} categories</span>
            <span className="bg-white text-slate-900 rounded-full px-3 py-1 ml-auto">Open →</span>
          </div>
        </button>
        <button
          onClick={() => { setView('growth'); setGtab('trackers'); }}
          className="text-left rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-200 min-h-[240px] flex flex-col justify-between transition hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #059669, #0d9488 55%, #0284c7)' }}
        >
          <div>
            <div className="text-6xl">📈</div>
            <h2 className="font-display text-3xl font-bold mt-3">Growth</h2>
            <p className="text-white/80 text-sm mt-1">Track gym, reading, calm… streaks, tables & calendars.</p>
          </div>
          <div className="flex gap-2 mt-6 text-xs font-bold flex-wrap">
            <span className="bg-white/20 rounded-full px-3 py-1">🔥 {bestStreak} best streak</span>
            <span className="bg-white/20 rounded-full px-3 py-1">📈 {(data.trackers || []).length} trackers</span>
            <span className="bg-white text-slate-900 rounded-full px-3 py-1 ml-auto">Open →</span>
          </div>
        </button>
      </div>
      ) : view === 'plan' ? (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_380px] items-start pb-28 lg:pb-10">

        {/* LEFT: categories */}
        <aside className={`card p-4 ${mobileTab === 'cats' ? '' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg">📁 Categories</h2>
            <button onClick={() => setManageCats((v) => !v)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">
              {manageCats ? 'Done' : '⚙️ Manage'}
            </button>
          </div>
          <div className="mt-3 grid gap-1.5">
            <CatRow
              active={selectedCat === 'all'} color="#0f172a" icon="🌟" name="All entries"
              count={data.items.length} onClick={() => selectCat('all')}
            />
            {cats.map((c) => (
              <div key={c.id} className={`group rounded-2xl border transition overflow-hidden ${selectedCat === c.id ? 'border-transparent shadow-md' : 'border-slate-100 hover:border-slate-200'}`}
                style={selectedCat === c.id ? { background: `linear-gradient(135deg, ${c.color}22, #ffffff)`, borderLeft: `5px solid ${c.color}` } : { borderLeft: `5px solid ${c.color}` }}>
                <CatRow
                  active={false} color={c.color} icon={c.icon} name={c.name} count={counts[c.id] ?? 0}
                  onClick={() => selectCat(c.id)}
                />
                {manageCats && (
                  <ManageRow
                    c={c}
                    onRename={(v) => patchCategory(c.id, { name: v })}
                    onColor={(v) => patchCategory(c.id, { color: v })}
                    onIcon={(v) => patchCategory(c.id, { icon: v })}
                    onUp={() => moveCategory(c.id, -1)}
                    onDown={() => moveCategory(c.id, 1)}
                    onDel={() => deleteCategory(c.id)}
                  />
                )}
              </div>
            ))}
          </div>
          {manageCats && <NewCategory onAdd={addCategory} />}
          {!manageCats && (
            <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">Tap ⚙️ Manage to rename, recolor, reorder or delete. Deleting a category removes its entries too.</p>
          )}
        </aside>

        {/* MIDDLE: entries table */}
        <section className={`card p-4 ${mobileTab === 'items' ? '' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-display font-bold text-lg">
                {selectedCat === 'all' ? '🗂️ All entries' : `${catById[selectedCat]?.icon ?? ''} ${catById[selectedCat]?.name ?? ''}`}
              </h2>
              <p className="text-xs text-slate-500">{filtered.length} shown · tap a row to see details →</p>
            </div>
            <button onClick={openNew} className="btn-primary px-4 py-2 text-sm shadow-lg shadow-violet-200">
              ＋ New entry
            </button>
          </div>
          <div className="flex gap-1.5 mt-2.5 text-xs font-bold">
            {([
              ['active', `Active · ${statusCounts.active}`],
              ['done', `Done · ${statusCounts.done}`],
              ['all', `All · ${statusCounts.all}`],
              ['archived', `📦 Archived · ${statusCounts.archived}`],
            ]).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-1.5 rounded-full capitalize transition ${statusFilter === s ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            statusFilter === 'archived' ? (
              <div className="text-center py-12">
                <div className="text-5xl">📦</div>
                <p className="font-bold mt-2">Archive is empty</p>
                <p className="text-sm text-slate-500">Entries you archive will wait here — restore them or delete forever.</p>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-5xl">🪴</div>
                <p className="font-bold mt-2">Nothing here yet</p>
                <p className="text-sm text-slate-500">Entries you add to {viewedCat ? `${viewedCat.icon} ${viewedCat.name}` : 'any category'} will appear here.</p>
                <button onClick={openNew} className="btn-primary px-5 py-2.5 text-sm mt-4 shadow-lg shadow-violet-200">
                  ＋ Add to {viewedCat ? viewedCat.name : 'a category'}
                </button>
              </div>
            )
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100">
              <div className="hidden sm:grid grid-cols-[28px_1fr_auto] gap-2 px-3 py-2 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <span></span><span>Entry</span><span className="text-right">Updated</span>
              </div>
              <ul className="divide-y divide-slate-100 bg-white">
                {filtered.map((item) => {
                  const subs = data.subitems.filter((s) => s.item_id === item.id);
                  const doneN = subs.filter((s) => s.is_done).length;
                  const pct = subs.length ? Math.round((doneN / subs.length) * 100) : 0;
                  const active = selectedItemId === item.id;
                  return (
                    <li key={item.id}>
                      <button onClick={() => pickItem(item.id)} className={`w-full text-left px-3 py-3 grid grid-cols-[28px_1fr_auto] gap-2 items-start transition ${active ? 'bg-violet-50' : 'hover:bg-slate-50'} ${item.status === 'done' ? 'opacity-60' : ''}`}>
                        {item.is_archived ? (
                          <span className="mt-0.5 w-6 h-6 flex items-center justify-center text-base" title="Archived">📦</span>
                        ) : (
                          <span onClick={(e) => { e.stopPropagation(); toggleDone(item); }}
                            className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-pointer ${item.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                            {item.status === 'done' ? '✓' : ''}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: catById[item.category_id]?.color ?? '#64748b' }}>
                              {catById[item.category_id]?.icon} {catById[item.category_id]?.name}
                            </span>
                            {item.is_checklist && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-2 py-0.5">☑ {doneN}/{subs.length}</span>}
                            {item.link && <span className="text-[10px] font-bold text-sky-700 bg-sky-100 rounded-full px-2 py-0.5">🔗 link</span>}
                            {item.status === 'done' && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">DONE</span>}
                            {item.is_archived && <span className="text-[10px] font-bold text-slate-600 bg-slate-200 rounded-full px-2 py-0.5">📦 ARCHIVED</span>}
                          </span>
                          <span className={`block font-bold text-[15px] leading-snug mt-1 truncate ${item.status === 'done' ? 'line-through' : ''}`}>{item.title}</span>
                          {item.notes && <span className="block text-xs text-slate-500 truncate">{item.notes}</span>}
                          {item.is_checklist && subs.length > 0 && (
                            <span className="block h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                              <span className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400 text-right whitespace-nowrap">{fmt(item.updated_at)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* RIGHT: details only (form moved to popup) */}
        <aside className={`grid gap-4 ${mobileTab === 'details' ? '' : 'hidden lg:grid'}`}>
          <section className="card card-hover p-4">
            <h2 className="font-display font-bold text-lg">✨ Additional details</h2>
            {!selectedItem ? (
              <div className="mt-2 text-center py-8">
                <div className="text-4xl opacity-40">👈</div>
                <p className="text-sm text-slate-400 mt-2">Click any entry to see its details here.</p>
              </div>
            ) : (
              <div className="mt-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`font-bold text-lg leading-snug ${selectedItem.status === 'done' ? 'line-through text-slate-500' : ''}`}>{selectedItem.title}</h3>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white shrink-0" style={{ background: catById[selectedItem.category_id]?.color }}>
                    {catById[selectedItem.category_id]?.icon} {catById[selectedItem.category_id]?.name}
                  </span>
                </div>
                {selectedItem.notes && <p className="text-sm text-slate-700 whitespace-pre-wrap mt-2 bg-slate-50 rounded-xl p-3">{selectedItem.notes}</p>}
                {selectedItem.link && (
                  <a href={asLink(selectedItem.link)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-indigo-500 rounded-xl px-3 py-2.5 break-all">
                    🔗 {selectedItem.link} <span aria-hidden>↗</span>
                  </a>
                )}
                {selectedItem.is_checklist && (
                  <ul className="mt-2 grid gap-1.5">
                    {selectedSubs.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm bg-violet-50/70 border border-violet-100 rounded-xl px-2.5 py-2">
                        <input type="checkbox" checked={!!s.is_done} onChange={() => toggleSub(s)} className="w-5 h-5 accent-violet-600" />
                        <span className={`flex-1 ${s.is_done ? 'line-through text-slate-400' : 'font-medium'}`}>{s.text}</span>
                      </li>
                    ))}
                    {selectedSubs.length === 0 && <li className="text-xs text-slate-400">No sub-tasks.</li>}
                  </ul>
                )}
                <dl className="detail-table mt-3 bg-slate-50 rounded-xl p-3 grid gap-1">
                  <div className="flex justify-between"><dt>Created</dt><dd>{fmtFull(selectedItem.created_at)}</dd></div>
                  <div className="flex justify-between"><dt>Last edited</dt><dd>{fmtFull(selectedItem.updated_at)}</dd></div>
                  <div className="flex justify-between"><dt>Completed</dt><dd>{selectedItem.completed_at ? fmtFull(selectedItem.completed_at) : '—'}</dd></div>
                  <div className="flex justify-between"><dt>Status</dt><dd>{selectedItem.status}</dd></div>
                </dl>
                {selectedItem.is_archived ? (
                  <div className="flex gap-2 mt-3 text-sm font-bold">
                    <button onClick={() => restoreItem(selectedItem.id)} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white">↩ Restore</button>
                    <button onClick={() => deleteForever(selectedItem.id)} className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100">🗑 Delete forever</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3 text-sm font-bold">
                    <button onClick={() => toggleDone(selectedItem)} className={`flex-1 py-2 rounded-xl ${selectedItem.status === 'done' ? 'bg-slate-100' : 'bg-emerald-500 text-white'}`}>
                      {selectedItem.status === 'done' ? '↩ Reopen' : '✓ Mark done'}
                    </button>
                    <button onClick={() => startEdit(selectedItem)} className="flex-1 py-2 rounded-xl bg-slate-900 text-white">Edit</button>
                    <button onClick={() => archiveItem(selectedItem.id)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">📦 Archive</button>
                  </div>
                )}
              </div>
            )}
          </section>

        </aside>
      </div>
      ) : (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 pb-28 lg:pb-10">
        <Growth data={data} setData={setData} gtab={gtab} setGtab={setGtab} />
      </div>
      )}

      {/* ===== Popup entry form (modal) ===== */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 backdrop-blur-sm p-0 sm:p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto nice-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white/95 backdrop-blur px-5 pt-4 pb-3 border-b border-slate-100 rounded-t-3xl">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-xl">{editingItem ? '📝 Edit entry' : '＋ New entry'}</h2>
                <button onClick={closeModal} aria-label="close" className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold">✕</button>
              </div>
              {!editingItem && (
                <p className="text-xs mt-1 px-2.5 py-1.5 rounded-xl inline-block font-bold text-white" style={{ background: form.category_id === '__new__' ? newCat.color : formCat?.color ?? '#64748b' }}>
                  {form.category_id === '__new__' ? `📍 New category: ${newCat.name.trim() || '…'}` : `📍 Adding to: ${formCat ? `${formCat.icon} ${formCat.name}` : '…'}`}
                </p>
              )}
            </div>
            <div className="grid gap-2.5 p-5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Category
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="input mt-1">
                  {cats.map((c) => (<option key={c.id} value={c.id}>{c.icon} {c.name}</option>))}
                  <option value="__new__">＋ New category…</option>
                </select>
              </label>
              {form.category_id === '__new__' && (
                <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-2.5 grid gap-1.5">
                  <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="New category name…" className="input !py-2" />
                  <div className="flex gap-1 flex-wrap">
                    {COLORS.map((col) => (
                      <button key={col} onClick={() => setNewCat({ ...newCat, color: col })} className={`w-6 h-6 rounded-full border-2 ${newCat.color === col ? 'border-slate-900' : 'border-transparent'}`} style={{ background: col }} aria-label={col} />
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {ICONS.map((e) => (
                      <button key={e} onClick={() => setNewCat({ ...newCat, icon: e })} className={`w-7 h-7 rounded-lg border text-sm ${newCat.icon === e ? 'border-slate-900 bg-white' : ''}`}>{e}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Entry type</span>
                <label className="flex items-center gap-1.5 text-xs font-bold bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_checklist} onChange={(e) => setForm({ ...form, is_checklist: e.target.checked })} className="w-4 h-4 accent-violet-600" />
                  ☑ Checklist with sub-tasks
                </label>
              </div>
              <input value={form.title} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveItem()} placeholder="Title (required)…" className="input font-semibold !py-3 !text-base" />
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes, thoughts, details…" rows={3} className="input" />
              <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https:// link (optional)" inputMode="url" className="input" />
              {form.is_checklist && (
                <div className="grid gap-1.5 bg-slate-50 rounded-2xl p-2.5 border">
                  {form.subs.map((s, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <input
                        value={typeof s === 'string' ? s : s.text ?? ''}
                        onChange={(e) => {
                          const next = [...form.subs];
                          next[idx] = typeof s === 'string' ? e.target.value : { ...s, text: e.target.value };
                          setForm({ ...form, subs: next });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && saveItem()}
                        placeholder={`Sub-task ${idx + 1}…`}
                        className="input !py-2"
                      />
                      <button onClick={() => setForm({ ...form, subs: form.subs.filter((_, k) => k !== idx) })} className="px-2 text-slate-400 hover:text-red-500" aria-label="remove sub-task">✕</button>
                    </div>
                  ))}
                  <button onClick={() => setForm({ ...form, subs: [...form.subs, editingItem ? { text: '' } : ''] })} className="text-xs font-bold text-violet-700 text-left px-1">+ Add sub-task</button>
                </div>
              )}
              <div className="flex gap-2 pb-1">
                <button onClick={saveItem} className="btn-primary flex-1 py-3 text-base shadow-lg shadow-violet-200">
                  {editingItem ? '💾 Save changes' : form.category_id === '__new__' ? `🚀 Create & add to ${newCat.name.trim() || 'new category'}` : `🚀 Add to ${formCat ? formCat.name : 'category'}`}
                </button>
                <button onClick={closeModal} className="px-5 rounded-xl border font-bold text-sm bg-white">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] grid grid-cols-4 gap-2 text-xs font-bold">
        {(view === 'growth'
          ? [
              { k: 'home', label: '🏠 Home', fn: () => setView('home'), active: false },
              { k: 'trackers', label: '📈 Trackers', fn: () => setGtab('trackers'), active: gtab === 'trackers' },
              { k: 'progress', label: '✅ Progress', fn: () => setGtab('progress'), active: gtab === 'progress' },
              { k: 'plan', label: '🗂️ Planner', fn: () => { setView('plan'); setMobileTab('items'); }, active: false },
            ]
          : [
              { k: 'home', label: '🏠 Home', fn: () => setView('home'), active: view === 'home' },
              { k: 'cats', label: '📁 Cats', fn: () => setMobileTab('cats'), active: view === 'plan' && mobileTab === 'cats' },
              { k: 'items', label: '🗂️ Entries', fn: () => { setView('plan'); setMobileTab('items'); }, active: view === 'plan' && mobileTab === 'items' },
              { k: 'details', label: '✨ Details', fn: () => { setView('plan'); setMobileTab('details'); }, active: view === 'plan' && mobileTab === 'details' },
            ]
        ).map((b) => (
          <button key={b.k} onClick={b.fn}
            className={`py-2.5 rounded-xl ${b.active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {b.label}
          </button>
        ))}
      </nav>

      {/* Floating + button on mobile (planner only) */}
      {view === 'plan' && (
      <button
        onClick={openNew}
        aria-label="add new entry"
        className="lg:hidden fixed bottom-20 right-4 z-20 w-14 h-14 rounded-full text-white text-2xl font-bold shadow-xl"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed 55%, #db2777)' }}
      >
        ＋
      </button>
      )}
    </div>
  );
}

function CatRow({ active, color, icon, name, count, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left transition ${active ? 'bg-slate-900 text-white shadow-md' : 'hover:bg-slate-50'}`}>
      <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0" style={{ background: `${color}1e` }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm truncate">{name}</span>
        <span className={`block text-[11px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{count} entries</span>
      </span>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0`} style={{ background: color }} />
    </button>
  );
}

function ManageRow({ c, onRename, onColor, onIcon, onUp, onDown, onDel }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(c.name);
  return (
    <div className="px-3 pb-2.5">
      <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-bold text-slate-500">{open ? '▾ hide tools' : '▸ rename · color · reorder'}</button>
      {open && (
        <div className="mt-1.5 grid gap-1.5 bg-slate-50 rounded-xl p-2">
          <div className="flex gap-1.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} className="input !py-1.5 !text-xs" />
            <button onClick={() => onRename(draft.trim() || c.name)} className="px-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold">OK</button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {COLORS.map((col) => (
              <button key={col} onClick={() => onColor(col)} className={`w-6 h-6 rounded-full border-2 ${c.color === col ? 'border-slate-900' : 'border-transparent'}`} style={{ background: col }} />
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {ICONS.map((e) => (
              <button key={e} onClick={() => onIcon(e)} className={`w-7 h-7 rounded-lg border text-sm ${c.icon === e ? 'border-slate-900 bg-white' : ''}`}>{e}</button>
            ))}
          </div>
          <div className="flex gap-1.5 text-xs font-bold">
            <button onClick={onUp} className="flex-1 py-1 rounded-lg bg-white border">⬆ Up</button>
            <button onClick={onDown} className="flex-1 py-1 rounded-lg bg-white border">⬇ Down</button>
            <button onClick={onDel} className="flex-1 py-1 rounded-lg bg-red-50 text-red-600 border border-red-100">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewCategory({ onAdd }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-3">
      <p className="text-xs font-bold text-slate-600">＋ New category</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movies to Watch" className="input !text-sm mt-1.5" />
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {COLORS.map((col) => (
          <button key={col} onClick={() => setColor(col)} className={`w-6 h-6 rounded-full border-2 ${color === col ? 'border-slate-900' : 'border-transparent'}`} style={{ background: col }} />
        ))}
      </div>
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {ICONS.map((e) => (
          <button key={e} onClick={() => setIcon(e)} className={`w-7 h-7 rounded-lg border ${icon === e ? 'border-slate-900 bg-slate-100' : ''}`}>{e}</button>
        ))}
      </div>
      <button onClick={() => { onAdd(name, color, icon); setName(''); }} className="mt-2 w-full py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Create category</button>
    </div>
  );
}
