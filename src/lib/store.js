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

const seed = () => ({
  user: { id: LOCAL_USER_ID, email: null, created_at: now() },
  settings: { appTitle: 'Tick It Off ✅', tagline: 'Small steps every day. 🌱' },
  categories: defaultCategories(LOCAL_USER_ID),
  items: [],
  subitems: [],
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
  return { ...data, categories, items, subitems };
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
  return { categories: categories || [], items: items || [], subitems };
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
  !!d && ((d.categories && d.categories.length > 0) || (d.items && d.items.length > 0));

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
        const cloudEmpty = cloud.categories.length === 0 && cloud.items.length === 0;
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
