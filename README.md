# 🎯 Personal Goals, Categories & Reminders Tracker — MVP

Mobile-first, local-first MVP. No login needed yet — data stays in your browser (localStorage), scoped by `user_id = 'local-user'` so Supabase Auth can be added later without a rewrite.

## Run it

```powershell
npm install
npm run dev
```

Open http://localhost:5173 — works on phone browser on same Wi-Fi (use your laptop's LAN URL Vite prints).

## Features (all MVP core done)

- **Categories:** create, rename, delete, reorder (⬆️⬇️), color + icon
- **Items:** title (required), notes, link (clickable), checklist mode with tick-off sub-tasks
- **Auto timestamps:** `created_at` + `updated_at` on items AND sub-items; `completed_at` when marked done
- **Views:** filter by category, active/done/all, search titles+notes
- **Export:** JSON + CSV backup buttons in header
- Seed categories: Books, Cafés, Places, Quotes, Philosophy, Reminders

## Data model

Mirrors `supabase/schema.sql`: `users`, `categories`, `items`, `checklist_subitems` — every row scoped to `user_id` from day one.

## Next steps (phase 2, not built)

1. Create a Supabase project, run `supabase/schema.sql`
2. Add `@supabase/supabase-js`, wire Auth (email/password or magic link) + realtime sync
3. Shared boards, AI-assistant hooks, push reminders, billing — schema already allows this

## Answers to open questions (defaults chosen)

- Sub-item timestamps: **yes**, each sub-task has `created_at`/`updated_at`
- Links: **plain clickable URLs** for now (no preview fetch)
- Category-specific fields (e.g. address for Cafés): deferred, just use Notes for now

## Cloud sync setup (Supabase)

1. Create project → run `supabase/schema.sql` in SQL Editor (green "Run and enable RLS" if warned)
2. Run this second snippet (profile rows for login + auto-create on signup):
```sql
drop policy if exists "own profile" on users;
create policy "own profile" on users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```
3. Authentication → turn OFF "Confirm email" (smoother signup; or leave on and users confirm via inbox)
4. Settings → API → put Project URL + anon key in `src/lib/supabase.js` (or `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars)
5. `npm run build` → deploy `dist` (Netlify Drop). One deployment serves everyone; RLS keeps each login's data private.
