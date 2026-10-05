import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

const KEY = 'goals-tracker-v1';
const BACKUP_KEY = 'goals-tracker-local-backup';
export const LOCAL_USER_ID = 'local-user';

// UUID v4 — works for Postgres `uuid` columns AND localStorage.
// (crypto.randomUUID needs a secure context; Netlify/localhost are fine,
//  plain-LAN http is not, so fall back to Math.random-based UUIDs.)
const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};
const now = () => new Date().toISOString();

export function defaultCategories(userId) {
  return [
    { id: uid(), user_id: userId, name: 'Books to Read', color: '#8b5cf6', icon: '📚', sort_order: 0, created_at: now() },
    { id: uid(), user_id: userId, name: 'Cafés to Visit', color: '#f59e0b', icon: '☕', sort_order: 1, created_at: now() },
    { id: uid(), user_id: userId, name: 'Places to Visit', color: '#10b981', icon: '✈️', sort_order: 2, created_at: now() },
    { id: uid(), user_id: userId, name: 'Quotes', color: '#3b82f6', icon: '💬', sort_order: 3, created_at: now() },
    { id: uid(), user_id: userId, name: 'Philosophy', color: '#ec4899', icon: '🧠', sort_order: 4, created_at: now() },
    { id: uid(), user_id: userId, name: 'Reminders', color: '#ef4444', icon: '⏰', sort_order: 5, created_at: now() },
  ];
}

export function defaultTrackers(userId) {
  return [
    { id: uid(), user_id: userId, name: 'Gym', icon: '🏋️', color: '#10b981', unit: 'workouts', target_per_week: 4, sort_order: 0, created_at: now(), is_archived: false, archived_at: null,
      fields: [{ key: 'weight', label: 'Weight (kg)', type: 'number' }, { key: 'exercises', label: 'Exercises', type: 'text' }] },
    { id: uid(), user_id: userId, name: 'Reading', icon: '📖', color: '#8b5cf6', unit: 'pages', target_per_week: 100, sort_order: 1, created_at: now(), is_archived: false, archived_at: null,
      fields: [{ key: 'book', label: 'Book', type: 'text' }, { key: 'pages', label: 'Pages', type: 'number' }, { key: 'minutes', label: 'Minutes', type: 'number' }] },
  ];
}

export function defaultProjects(userId) {
  return [
    { id: uid(), user_id: userId, name: 'Dream Startup', icon: '🚀', color: '#f59e0b', status: 'idea', notes: 'The big idea. Attach dated to-dos below and move it down the pipeline.', link: '', sort_order: 0, created_at: now(), updated_at: now() },
  ];
}

const seed = () => ({
  user: { id: LOCAL_USER_ID, email: null, created_at: now() },
  settings: { appTitle: 'Tick It Off ✅', tagline: 'Small steps every day. 🌱' },
  categories: defaultCategories(LOCAL_USER_ID),
  items: [],
  subitems: [],
  trackers: defaultTrackers(LOCAL_USER_ID),
  tracker_logs: [],
  tasks: [],
  projects: defaultProjects(LOCAL_USER_ID),
});

function migrate(raw) {
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!d.settings) d.settings = {};
  // Migrate old defaults to the fresh branding (keeps custom user titles intact)
  if (!d.settings.appTitle || d.settings.appTitle === 'My Dreams & Goals ✨') d.settings.appTitle = 'Tick It Off ✅';
  if (!d.settings.tagline || d.settings.tagline === 'Books • Cafés • Places • Ideas • Reminders') d.settings.tagline = 'Small steps every day. 🌱';
  if (!d.user) d.user = { id: LOCAL_USER_ID, email: null, created_at: now() };
  if (!Array.isArray(d.categories)) d.categories = [];
  if (!Array.isArray(d.items)) d.items = [];
  if (!Array.isArray(d.subitems)) d.subitems = [];
  if (!Array.isArray(d.trackers)) d.trackers = [];
  if (!Array.isArray(d.tracker_logs)) d.tracker_logs = [];
  if (!Array.isArray(d.tasks)) d.tasks = [];
  if (!Array.isArray(d.projects)) d.projects = [];
  // Custom-column defaults for data created before custom fields existed
  d.trackers.forEach((t) => {
    if (!Array.isArray(t.fields)) t.fields = [];
    if (t.is_archived === undefined) t.is_archived = false;
    if (t.archived_at === undefined) t.archived_at = null;
  });
  d.tracker_logs.forEach((l) => {
    if (!l.extra || typeof l.extra !== 'object') l.extra = {};
  });
  // Archive defaults for items created before archiving existed
  d.items.forEach((i) => {
    if (i.is_archived === undefined) i.is_archived = false;
    if (i.archived_at === undefined) i.archived_at = null;
  });
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return migrate(raw);
  } catch {
    return seed();
  }
}

// ---------- Local (logged-out) mode: unchanged, this-device storage ----------
export function useStore() {
  const [data, setData] = useState(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);

  return [data, setData];
}

// ================= Cloud (logged-in) mode =================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Remap old random-string ids to UUIDs (Postgres needs UUIDs) and stamp the
// logged-in user id on every row, keeping category/item references intact.
export function normalizeForCloud(data, userId) {
  const catMap = {};
  const itemMap = {};
  const categories = data.categories.map((c) => {
    const id = UUID_RE.test(c.id || '') ? c.id : uid();
    catMap[c.id] = id;
    return { ...c, id, user_id: userId };
  });
  const items = data.items.map((i) => {
    const id = UUID_RE.test(i.id || '') ? i.id : uid();
    itemMap[i.id] = id;
    return { ...i, id, user_id: userId, category_id: catMap[i.category_id] ?? i.category_id };
  });
  const subitems = data.subitems.map((s) => ({
    ...s,
    id: UUID_RE.test(s.id || '') ? s.id : uid(),
    item_id: itemMap[s.item_id] ?? s.item_id,
  }));
  const trackerMap = {};
  const trackers = (data.trackers || []).map((t) => {
    const id = UUID_RE.test(t.id || '') ? t.id : uid();
    trackerMap[t.id] = id;
    return { ...t, id, user_id: userId };
  });
  const tracker_logs = (data.tracker_logs || []).map((l) => ({
    ...l,
    id: UUID_RE.test(l.id || '') ? l.id : uid(),
    user_id: userId,
    tracker_id: trackerMap[l.tracker_id] ?? l.tracker_id,
  }));
  const tasks = (data.tasks || []).map((t) => ({
    ...t,
    id: UUID_RE.test(t.id || '') ? t.id : uid(),
    user_id: userId,
  }));
  const projects = (data.projects || []).map((p) => ({
    ...p,
    id: UUID_RE.test(p.id || '') ? p.id : uid(),
    user_id: userId,
  }));
  return { ...data, categories, items, subitems, trackers, tracker_logs, tasks, projects };
}

function throwIf(error, where) {
  if (error) throw new Error(`${where}: ${error.message}`);
}

// Download everything belonging to this user.
export async function pullCloud(userId) {
  const { data: categories, error: e1 } = await supabase
    .from('categories').select('*').eq('user_id', userId).order('sort_order');
  throwIf(e1, 'load categories');
  const { data: items, error: e2 } = await supabase
    .from('items').select('*').eq('user_id', userId);
  throwIf(e2, 'load entries');
  let subitems = [];
  if (items && items.length) {
    const { data: subs, error: e3 } = await supabase
      .from('checklist_subitems').select('*').in('item_id', items.map((i) => i.id));
    throwIf(e3, 'load checklist');
    subitems = subs || [];
  }
  const { data: trackers, error: e4 } = await supabase
    .from('trackers').select('*').eq('user_id', userId).order('sort_order');
  throwIf(e4, 'load trackers');
  let tracker_logs = [];
  if (trackers && trackers.length) {
    const { data: tl, error: e5 } = await supabase
      .from('tracker_logs').select('*').in('tracker_id', trackers.map((t) => t.id));
    throwIf(e5, 'load activity');
    tracker_logs = tl || [];
  }
  const { data: tasks, error: e6 } = await supabase
    .from('tasks').select('*').eq('user_id', userId);
  throwIf(e6, 'load to-dos');
  const { data: projects, error: e7 } = await supabase
    .from('projects').select('*').eq('user_id', userId).order('sort_order');
  throwIf(e7, 'load ideas');
  return { categories: categories || [], items: items || [], subitems, trackers: trackers || [], tracker_logs, tasks: tasks || [], projects: projects || [] };
}

// Upload full state (upsert all rows) + delete cloud rows missing locally.
export async function pushCloud(userId, data) {
  const dbCats = data.categories.map((c) => ({
    id: c.id, user_id: userId, name: c.name, color: c.color, icon: c.icon,
    sort_order: c.sort_order, created_at: c.created_at,
  }));
  const dbItems = data.items.map((i) => ({
    id: i.id, category_id: i.category_id, user_id: userId, title: i.title,
    notes: i.notes ?? '', link: i.link ?? '', is_checklist: !!i.is_checklist,
    status: i.status, created_at: i.created_at, updated_at: i.updated_at,
    completed_at: i.completed_at ?? null,
    is_archived: !!i.is_archived, archived_at: i.archived_at ?? null,
  }));
  const dbSubs = data.subitems.map((s) => ({
    id: s.id, item_id: s.item_id, text: s.text, is_done: !!s.is_done,
    created_at: s.created_at, updated_at: s.updated_at,
  }));
  const dbTrackers = (data.trackers || []).map((t) => ({
    id: t.id, user_id: userId, name: t.name, icon: t.icon, color: t.color,
    unit: t.unit ?? 'times', target_per_week: t.target_per_week ?? null,
    fields: t.fields ?? [],
    is_archived: !!t.is_archived, archived_at: t.archived_at ?? null,
    sort_order: t.sort_order, created_at: t.created_at,
  }));
  const dbLogs = (data.tracker_logs || []).map((l) => ({
    id: l.id, tracker_id: l.tracker_id, user_id: userId, log_date: l.log_date,
    value: Number(l.value) || 0, note: l.note ?? '', extra: l.extra ?? {},
    created_at: l.created_at,
  }));

  if (dbCats.length) {
    const { error } = await supabase.from('categories').upsert(dbCats);
    throwIf(error, 'save categories');
  }
  if (dbItems.length) {
    const { error } = await supabase.from('items').upsert(dbItems);
    throwIf(error, 'save entries');
  }
  if (dbSubs.length) {
    const { error } = await supabase.from('checklist_subitems').upsert(dbSubs);
    throwIf(error, 'save checklist');
  }
  if (dbTrackers.length) {
    const { error } = await supabase.from('trackers').upsert(dbTrackers);
    throwIf(error, 'save trackers');
  }
  if (dbLogs.length) {
    const { error } = await supabase.from('tracker_logs').upsert(dbLogs);
    throwIf(error, 'save activity');
  }
  const dbTasks = (data.tasks || []).map((t) => ({
    id: t.id, user_id: userId, title: t.title, notes: t.notes ?? '',
    scheduled_date: t.scheduled_date ?? null, repeat: t.repeat ?? 'none',
    project_id: t.project_id ?? null, series_id: t.series_id ?? null, status: t.status,
    sort_order: t.sort_order ?? 0, created_at: t.created_at, updated_at: t.updated_at,
    completed_at: t.completed_at ?? null,
  }));
  if (dbTasks.length) {
    const { error } = await supabase.from('tasks').upsert(dbTasks);
    throwIf(error, 'save to-dos');
  }
  const dbProjects = (data.projects || []).map((p) => ({
    id: p.id, user_id: userId, name: p.name, icon: p.icon, color: p.color,
    status: p.status, notes: p.notes ?? '', link: p.link ?? '',
    sort_order: p.sort_order ?? 0, created_at: p.created_at, updated_at: p.updated_at,
  }));
  if (dbProjects.length) {
    const { error } = await supabase.from('projects').upsert(dbProjects);
    throwIf(error, 'save ideas');
  }

  // Delete cloud orphans (rows the user removed on this device).
  const { data: rc, error: re1 } = await supabase.from('categories').select('id').eq('user_id', userId);
  throwIf(re1, 'check categories');
  const keepCats = new Set(data.categories.map((c) => c.id));
  const delCats = (rc || []).map((r) => r.id).filter((id) => !keepCats.has(id));
  if (delCats.length) {
    const { error } = await supabase.from('categories').delete().in('id', delCats);
    throwIf(error, 'delete categories');
  }
  const { data: ri, error: re2 } = await supabase.from('items').select('id').eq('user_id', userId);
  throwIf(re2, 'check entries');
  const keepItems = new Set(data.items.map((i) => i.id));
  const delItems = (ri || []).map((r) => r.id).filter((id) => !keepItems.has(id));
  if (delItems.length) {
    const { error } = await supabase.from('items').delete().in('id', delItems);
    throwIf(error, 'delete entries');
  }
  if (ri && ri.length) {
    const { data: rs, error: re3 } = await supabase
      .from('checklist_subitems').select('id').in('item_id', ri.map((r) => r.id));
    throwIf(re3, 'check checklist');
    const keepSubs = new Set(data.subitems.map((s) => s.id));
    const delSubs = (rs || []).map((r) => r.id).filter((id) => !keepSubs.has(id));
    if (delSubs.length) {
      const { error } = await supabase.from('checklist_subitems').delete().in('id', delSubs);
      throwIf(error, 'delete checklist');
    }
  }
  // Tracker orphans (logs first, then trackers)
  const { data: rt, error: re4 } = await supabase.from('trackers').select('id').eq('user_id', userId);
  throwIf(re4, 'check trackers');
  const keepTrackers = new Set((data.trackers || []).map((t) => t.id));
  const delTrackers = (rt || []).map((r) => r.id).filter((id) => !keepTrackers.has(id));
  if (delTrackers.length) {
    const { error } = await supabase.from('trackers').delete().in('id', delTrackers);
    throwIf(error, 'delete trackers');
  }
  if (rt && rt.length) {
    const { data: rl, error: re5 } = await supabase
      .from('tracker_logs').select('id').in('tracker_id', rt.map((r) => r.id));
    throwIf(re5, 'check activity');
    const keepLogs = new Set((data.tracker_logs || []).map((l) => l.id));
    const delLogs = (rl || []).map((r) => r.id).filter((id) => !keepLogs.has(id));
    if (delLogs.length) {
      const { error } = await supabase.from('tracker_logs').delete().in('id', delLogs);
      throwIf(error, 'delete activity');
    }
  }
  // Task orphans
  const { data: rk, error: re6 } = await supabase.from('tasks').select('id').eq('user_id', userId);
  throwIf(re6, 'check to-dos');
  const keepTasks = new Set((data.tasks || []).map((t) => t.id));
  const delTasks = (rk || []).map((r) => r.id).filter((id) => !keepTasks.has(id));
  if (delTasks.length) {
    const { error } = await supabase.from('tasks').delete().in('id', delTasks);
    throwIf(error, 'delete to-dos');
  }
  // Project orphans (linked tasks are unlinked, never deleted, in the UI)
  const { data: rj, error: re7 } = await supabase.from('projects').select('id').eq('user_id', userId);
  throwIf(re7, 'check ideas');
  const keepProjects = new Set((data.projects || []).map((p) => p.id));
  const delProjects = (rj || []).map((r) => r.id).filter((id) => !keepProjects.has(id));
  if (delProjects.length) {
    const { error } = await supabase.from('projects').delete().in('id', delProjects);
    throwIf(error, 'delete ideas');
  }
}

// Make sure a profile row exists for FK references (best-effort; a DB trigger
// also does this — see README "Cloud setup").
export async function upsertProfile(user) {
  try {
    await supabase.from('users').upsert({ id: user.id, email: user.email ?? null });
  } catch {
    /* trigger on the DB side covers this; ignore */
  }
}

const hasContent = (d) =>
  !!d && ((d.categories && d.categories.length > 0) || (d.items && d.items.length > 0) ||
    (d.trackers && d.trackers.length > 0) || (d.tracker_logs && d.tracker_logs.length > 0) ||
    (d.tasks && d.tasks.length > 0) || (d.projects && d.projects.length > 0));

// Cloud store: same [data, setData] interface as useStore, so the whole UI
// works unchanged. Pulls on login, pushes (debounced) on every change.
export function useCloudStore(session, getLocal) {
  const userId = session?.user?.id ?? null;
  const snapKey = userId ? `goals-tracker-cloud-${userId}` : null;
  const [data, setDataState] = useState(() => {
    try {
      if (snapKey) {
        const raw = localStorage.getItem(snapKey);
        if (raw) return migrate(raw);
      }
    } catch {
      /* fall through */
    }
    return null; // loading until pull finishes
  });
  const [sync, setSync] = useState({ state: 'idle', at: null, error: '' });
  const readyRef = useRef(false);
  const localRef = useRef(null);
  localRef.current = getLocal;

  // Initial pull / first-login migration when the session starts
  useEffect(() => {
    if (!userId) {
      readyRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      readyRef.current = false;
      setSync({ state: 'loading', at: null, error: '' });
      try {
        const cloud = await pullCloud(userId);
        const cloudEmpty = cloud.categories.length === 0 && cloud.items.length === 0 && (cloud.trackers || []).length === 0 && (cloud.tasks || []).length === 0 && (cloud.projects || []).length === 0;
        const local = localRef.current;
        if (cloudEmpty && hasContent(local)) {
          // First login: move this device's entries up to the cloud
          const normalized = normalizeForCloud(local, userId);
          await pushCloud(userId, normalized);
          if (!cancelled) {
            setDataState({ ...normalized, user: { id: userId, email: session.user.email ?? null, created_at: now() } });
            setSync({ state: 'synced', at: new Date(), error: '' });
          }
        } else if (!cloudEmpty) {
          // Cloud wins; stash the local copy as a backup just in case
          try {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(local));
          } catch { /* ignore */ }
          let settings = local?.settings;
          try {
            const raw = snapKey ? localStorage.getItem(snapKey) : null;
            if (raw) settings = migrate(raw).settings || settings;
          } catch { /* ignore */ }
          if (!cancelled) {
            setDataState({
              user: { id: userId, email: session.user.email ?? null, created_at: now() },
              settings: settings || { appTitle: 'Tick It Off ✅', tagline: '' },
              ...cloud,
            });
            setSync({ state: 'synced', at: new Date(), error: '' });
          }
        } else {
          // Both empty: seed fresh starter categories in the cloud
          const fresh = {
            user: { id: userId, email: session.user.email ?? null, created_at: now() },
            settings: local?.settings || { appTitle: 'Tick It Off ✅', tagline: '' },
            categories: defaultCategories(userId),
            items: [],
            subitems: [],
            trackers: defaultTrackers(userId),
            tracker_logs: [],
            tasks: [],
            projects: defaultProjects(userId),
          };
          await pushCloud(userId, fresh);
          if (!cancelled) {
            setDataState(fresh);
            setSync({ state: 'synced', at: new Date(), error: '' });
          }
        }
        await upsertProfile(session.user);
      } catch (err) {
        if (!cancelled) setSync({ state: 'error', at: null, error: err.message || 'Sync failed' });
      } finally {
        if (!cancelled) readyRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Debounced push on every change (after initial pull)
  useEffect(() => {
    if (!userId || !readyRef.current || !data) return;
    try {
      if (snapKey) localStorage.setItem(snapKey, JSON.stringify(data));
    } catch { /* ignore */ }
    setSync((s) => (s.state === 'synced' ? { ...s, state: 'pending' } : s));
    const t = setTimeout(async () => {
      try {
        setSync((s) => ({ ...s, state: 'syncing' }));
        await pushCloud(userId, data);
        setSync({ state: 'synced', at: new Date(), error: '' });
      } catch (err) {
        setSync({ state: 'error', at: null, error: err.message || 'Sync failed' });
      }
    }, 700);
    return () => clearTimeout(t);
  }, [data, userId, snapKey]);

  const setData = (updater) =>
    setDataState((prev) => (typeof updater === 'function' ? updater(prev) : updater));

  const refresh = async () => {
    if (!userId) return;
    setSync({ state: 'loading', at: null, error: '' });
    try {
      const cloud = await pullCloud(userId);
      setDataState((prev) => ({
        user: { id: userId, email: session.user.email ?? null, created_at: now() },
        settings: prev?.settings || { appTitle: 'Tick It Off ✅', tagline: '' },
        ...cloud,
      }));
      setSync({ state: 'synced', at: new Date(), error: '' });
    } catch (err) {
      setSync({ state: 'error', at: null, error: err.message || 'Refresh failed' });
    }
  };

  return [data, setData, { sync, refresh }];
}

export { uid, now };
