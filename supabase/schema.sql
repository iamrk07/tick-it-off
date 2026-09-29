-- Future-proof Supabase schema (run in Supabase SQL editor when you add cloud login).
-- Local MVP uses the same shape in localStorage with user_id = 'local-user'.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  name text not null,
  color text,
  icon text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete cascade,
  user_id uuid references users(id) on delete cascade not null,
  title text not null,
  notes text default '',
  link text default '',
  is_checklist boolean default false,
  status text default 'active' check (status in ('active','done')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists checklist_subitems (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade not null,
  text text not null,
  is_done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security: each user sees only their own rows (private-per-person MVP)
alter table categories enable row level security;
alter table items enable row level security;
alter table checklist_subitems enable row level security;

drop policy if exists "own categories" on categories;
create policy "own categories" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own items" on items;
create policy "own items" on items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own subitems" on checklist_subitems;
create policy "own subitems" on checklist_subitems
  for all using (
    exists (select 1 from items i where i.id = checklist_subitems.item_id and i.user_id = auth.uid())
  ) with check (
    exists (select 1 from items i where i.id = checklist_subitems.item_id and i.user_id = auth.uid())
  );

create index if not exists idx_categories_user on categories(user_id, sort_order);
create index if not exists idx_items_user on items(user_id, updated_at desc);
create index if not exists idx_items_cat on items(category_id);
create index if not exists idx_subs_item on checklist_subitems(item_id);

-- Archive support (soft delete: entries go here before permanent deletion)
alter table items add column if not exists is_archived boolean default false;
alter table items add column if not exists archived_at timestamptz;
create index if not exists idx_items_archived on items(user_id, is_archived);
