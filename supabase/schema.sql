-- MomentumSociety Run Club: databázová schéma
-- Spusti CELÝ tento súbor v Supabase -> SQL Editor -> New query -> Run.
-- Bezpečný na opakované spustenie len na prázdnom projekte.

create extension if not exists pgcrypto;

-- ============ PROFILY ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'user' check (role in ('user','admin')),
  is_member boolean not null default false,
  plan text check (plan in ('basic','standard','premium')),
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

-- Pri registrácii sa profil vytvorí automaticky
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)), 40));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pomocné funkcie pre pravidlá prístupu
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_member()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_member or role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ============ OBSAH ============
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'Tréning',
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  image_path text,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  place text,
  distance text,
  description text
);

-- Texty a obrázky webu upraviteľné adminom (kľúč -> hodnota)
create table public.site_content (
  key text primary key,
  value text not null
);

create index on public.posts (created_at desc);
create index on public.comments (post_id, created_at);
create index on public.messages (created_at desc);

-- ============ ZABEZPEČENIE (Row Level Security) ============
alter table public.profiles     enable row level security;
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;
alter table public.likes        enable row level security;
alter table public.messages     enable row level security;
alter table public.events       enable row level security;
alter table public.site_content enable row level security;

-- profiles: vlastný profil vidí každý, ostatné len členovia
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Používateľ smie meniť IBA meno. is_member, plan a role mení výhradne server (webhook).
revoke update on public.profiles from authenticated, anon;
grant update (name) on public.profiles to authenticated;

-- posts
create policy posts_read   on public.posts for select to authenticated using (public.is_member());
create policy posts_insert on public.posts for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- comments
create policy comments_read   on public.comments for select to authenticated using (public.is_member());
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- likes
create policy likes_read   on public.likes for select to authenticated using (public.is_member());
create policy likes_insert on public.likes for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

-- messages (chat)
create policy messages_read   on public.messages for select to authenticated using (public.is_member());
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- events: čítať môže každý (aj nepríhlásený), meniť len admin
create policy events_read  on public.events for select to anon, authenticated using (true);
create policy events_write on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- site_content: čítať môže každý, meniť len admin
create policy content_read  on public.site_content for select to anon, authenticated using (true);
create policy content_write on public.site_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ CHAT V REÁLNOM ČASE ============
alter publication supabase_realtime add table public.messages;

-- ============ FOTKY (Storage) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- člen nahráva len do priečinka s vlastným ID
create policy photos_member_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member()
              and (storage.foldername(name))[1] = auth.uid()::text);
-- admin nahráva obrázky webu do priečinka site/
create policy photos_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin() and (storage.foldername(name))[1] = 'site');
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ============ UKÁŽKOVÉ BEHY (môžeš zmazať) ============
insert into public.events (title, date, place, distance, description) values
  ('Guided run',    current_date + 6,  'Bytča – Base', '3 km',  'Pokojné tempo, vhodné pre začiatočníkov. Štart 17:00.'),
  ('Nočný beh',     current_date + 13, 'Bytča – Base', '9 km',  'Čelovky na hlavu a ide sa. Štart 20:20.'),
  ('Sunrise run',   current_date + 20, 'Bytča – Base', '10 km', 'Východ slnka v prírode. Štart 06:30.'),
  ('Community run', current_date + 27, 'Bytča – Base', '8 km',  'Spoločný beh a after run. Štart 17:00.');

-- ============ ADMIN ============
-- Po svojej registrácii spusti (nahraď e-mail svojím):
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'tvoj@email.sk');
