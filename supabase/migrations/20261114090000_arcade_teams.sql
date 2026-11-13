-- Spot the Bug v0.17: teams.
--
-- Team admins. Each licensed team (arcade.teams) can have its own admins: people
-- at the client (a company's security lead, a bootcamp's instructor) who see
-- their team's results and nobody else's. Th3 SpaceIO adds them in the SQL editor
-- with arcade.add_team_admin(slug, username). Moderators can see every team.
--
--   arcade_my_teams()                   the teams the caller looks after
--   arcade_team_report(slug, days)      players, levels and flaw types for a team
--   arcade_team_new_link(slug)          a new team link (the old one stops working)
--
-- Team packs. Snippets written for one client (their stack, their domain) live
-- only in the database, never in the public repository: arcade.stb_packs and
-- arcade.stb_pack_snippets, loaded with scripts/pack-sql.mjs. A team is given a
-- pack with arcade.grant_team_pack(slug, pack). Players on that team's link get
-- the pack's snippets mixed into their games (arcade_team_pack), and a game with
-- pack snippets can only be posted to a board of a team that has the pack.
--
-- Scores now keep the snippet IDs of each game (arcade.scores.snippets), so team
-- reports can break results down by flaw type.

-- ---------- tables ----------

create table arcade.team_admins (
  team_id uuid not null references arcade.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index arcade_team_admins_user on arcade.team_admins (user_id);
comment on table arcade.team_admins is 'People at a client who can see their team''s results. Add with arcade.add_team_admin().';

create table arcade.stb_packs (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table arcade.stb_packs is 'Team-only snippet packs. Load with scripts/pack-sql.mjs; give to a team with arcade.grant_team_pack().';

create table arcade.stb_pack_snippets (
  id text primary key check (id ~ '^[A-Z]{3}-[0-9]{3}$'),
  pack text not null references arcade.stb_packs (id) on delete cascade,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  payload jsonb not null,           -- the whole snippet, as in data/snippets/*.json
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index arcade_stb_pack_snippets_pack on arcade.stb_pack_snippets (pack) where active;

create table arcade.team_packs (
  team_id uuid not null references arcade.teams (id) on delete cascade,
  pack text not null references arcade.stb_packs (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, pack)
);

alter table arcade.stb_answer_key add column if not exists pack text references arcade.stb_packs (id) on delete cascade;
alter table arcade.scores add column if not exists snippets text[];

alter table arcade.team_admins enable row level security;
alter table arcade.stb_packs enable row level security;
alter table arcade.stb_pack_snippets enable row level security;
alter table arcade.team_packs enable row level security;

-- ---------- posting: pack guard, and keep the snippet IDs ----------

create or replace function arcade.stb_post_scores(
  p_uid uuid, p_level text, p_answers jsonb, p_team arcade.teams, p_hidden boolean default false, p_fast integer default 0
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_game constant text := 'spot-the-bug';
  c_rounds constant integer := 10;
  v_name text;
  v_seconds integer;
  v_mult numeric;
  v_answer jsonb;
  v_key arcade.stb_answer_key;
  v_seen text[] := '{}';
  v_line integer;
  v_type text;
  v_left integer;
  v_line_ok boolean;
  v_type_ok boolean;
  v_clean boolean;
  v_streak integer := 0;
  v_best integer := 0;
  v_raw integer;
  v_total integer := 0;
  v_cleans integer := 0;
  v_lines integer := 0;
  v_marks text := '';
  v_accuracy integer;
  v_id uuid;
  v_rank integer;
  v_of integer;
  v_pb integer;
begin
  select p.username into v_name from public.profiles p where p.id = p_uid;
  if v_name is null then
    raise exception 'Choose a username on your Account page first.' using errcode = '22023';
  end if;

  -- Same numbers as LEVELS in assets/js/config.js
  case p_level
    when 'beginner' then v_seconds := 60; v_mult := 1;
    when 'intermediate' then v_seconds := 45; v_mult := 1.5;
    when 'advanced' then v_seconds := 40; v_mult := 2;
    else raise exception 'Unknown level.' using errcode = '22023';
  end case;

  -- Flood protection: per account, per team, and overall.
  if (select count(*) from arcade.scores s
      where s.user_id = p_uid and s.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many games posted in a short time. Try again in a few minutes.' using errcode = '22023';
  end if;
  if p_team.id is not null and (select count(*) from arcade.scores s
      where s.team_id = p_team.id and s.created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'Your team has posted a lot of games in the last few minutes. Try again shortly.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.scores s where s.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'The scoreboard is busy. Try again in a minute.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> c_rounds then
    raise exception 'A game has % rounds.', c_rounds using errcode = '22023';
  end if;

  for v_answer in
    select e.value from jsonb_array_elements(p_answers) with ordinality as e(value, n) order by e.n
  loop
    select * into v_key from arcade.stb_answer_key k where k.id = v_answer ->> 'id';
    if not found or v_key.level <> p_level then
      raise exception 'This game has snippets the online scoreboard doesn''t know yet.' using errcode = '22023';
    end if;
    if v_key.id = any (v_seen) then
      raise exception 'A snippet appears twice in this game.' using errcode = '22023';
    end if;
    v_seen := v_seen || v_key.id;
    -- Team pack snippets only count on a board of a team that has the pack.
    if v_key.pack is not null and not exists (
      select 1 from arcade.team_packs tp where tp.team_id = p_team.id and tp.pack = v_key.pack) then
      raise exception 'This game has snippets from a team pack, so it can only be posted to that team''s board.' using errcode = '22023';
    end if;

    v_line := case when (v_answer ->> 'line') ~ '^[0-9]{1,3}$' then (v_answer ->> 'line')::integer end;
    v_type := left(v_answer ->> 'type', 40);
    v_left := case when (v_answer ->> 'left') ~ '^[0-9]{1,4}$'
                   then least((v_answer ->> 'left')::integer, v_seconds * 10) else 0 end;

    v_line_ok := v_line is not null and (v_line = v_key.vulnerable_line or v_line = any (v_key.accept_lines));
    v_type_ok := v_type is not null and v_type = v_key.category;
    v_clean := v_line_ok and v_type_ok;
    v_streak := case when v_clean then v_streak + 1 else 0 end;
    v_best := greatest(v_best, v_streak);
    v_raw := (case when v_line_ok then 100 else 0 end)
           + (case when v_type_ok then 50 else 0 end)
           + (case when v_clean
                   then round(50 * v_left::numeric / (v_seconds * 10))::integer + least(50, 10 * (v_streak - 1))
                   else 0 end);
    v_total := v_total + round(v_raw * v_mult)::integer;
    v_cleans := v_cleans + v_clean::integer;
    v_lines := v_lines + v_line_ok::integer;
    v_marks := v_marks || case when v_clean then 'C' when v_line_ok then 'L' when v_type_ok then 'T' else 'M' end;
  end loop;

  v_accuracy := round(v_cleans * 100.0 / c_rounds)::integer;

  insert into arcade.scores (game, level, team_id, user_id, name, score, clean, lines, rounds, accuracy, best_streak, marks, hidden, fast_rounds, snippets)
  values (c_game, p_level, p_team.id, p_uid, v_name, v_total, v_cleans, v_lines, c_rounds, v_accuracy, v_best, v_marks,
          coalesce(p_hidden, false), coalesce(p_fast, 0), v_seen)
  returning id into v_id;

  if p_hidden then
    insert into arcade.moderation_log (moderator, game, action, target_kind, target_id, player_id, reason)
    values (null, c_game, 'hide', 'score', v_id::text, p_uid,
            format('Held automatically: %s clean rounds answered in under 2 seconds.', p_fast));
  end if;

  select count(*) + 1 into v_rank
  from (
    select s.user_id, max(s.score) as best
    from arcade.scores s join public.profiles p on p.id = s.user_id
    where s.game = c_game and s.level = p_level and not s.hidden and not p.hidden
      and s.team_id is not distinct from p_team.id
    group by s.user_id
  ) b
  where b.best > v_total and b.user_id <> p_uid;

  select count(distinct s.user_id) into v_of
  from arcade.scores s join public.profiles p on p.id = s.user_id
  where s.game = c_game and s.level = p_level and not s.hidden and not p.hidden
    and s.team_id is not distinct from p_team.id;

  select max(s.score) into v_pb
  from arcade.scores s
  where s.game = c_game and s.level = p_level and not s.hidden
    and s.team_id is not distinct from p_team.id and s.user_id = p_uid;

  return jsonb_build_object(
    'id', v_id, 'name', v_name, 'score', v_total, 'clean', v_cleans, 'lines', v_lines,
    'accuracy', v_accuracy, 'best_streak', v_best, 'rank', case when p_hidden then null else v_rank end, 'of', v_of,
    'personal_best', v_pb, 'team', p_team.name, 'held', coalesce(p_hidden, false)
  );
end
$$;

-- ---------- classes: public snippets only ----------

create or replace function public.arcade_create_class(p_name text, p_level text, p_hours integer default 12)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_uid uuid := auth.uid();
  v_name text := arcade.clean_text(p_name, 60);
  v_ids text[];
  v_code text;
  v_bytes bytea;
  v_class arcade.classes;
begin
  if v_uid is null then
    raise exception 'Sign in or quick join to run a class.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.username is not null) then
    raise exception 'Choose a username on your Account page first.' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Give the class a name of at least 2 characters.' using errcode = '22023';
  end if;
  if p_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'Unknown level.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.classes c where c.owner = v_uid and c.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can start up to 20 classes a day. Reuse a class code, or try again tomorrow.' using errcode = '22023';
  end if;

  -- Like a normal game: at least one mobile and one config snippet, the rest at random.
  -- Public snippets only: team pack snippets never go into a class.
  v_ids := array(
    (select k.id from arcade.stb_answer_key k where k.level = p_level and k.pack is null and k.surface = 'mobile' order by random() limit 1)
    union all
    (select k.id from arcade.stb_answer_key k where k.level = p_level and k.pack is null and k.surface = 'config' order by random() limit 1));
  v_ids := v_ids || array(
    select k.id from arcade.stb_answer_key k
    where k.level = p_level and k.pack is null and not (k.id = any (v_ids))
    order by random() limit 10 - cardinality(v_ids));
  select array_agg(x order by random()) into v_ids from unnest(v_ids) as x;
  if cardinality(v_ids) is distinct from 10 then
    raise exception 'This level doesn''t have enough snippets yet.' using errcode = '22023';
  end if;

  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for n in 0..5 loop
      v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, n) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from arcade.classes c where c.code = v_code);
  end loop;

  insert into arcade.classes (code, owner, name, level, snippet_ids, seed, open_until)
  values (v_code, v_uid, v_name, p_level, v_ids,
          (get_byte(extensions.gen_random_bytes(1), 0) * 65536 + get_byte(extensions.gen_random_bytes(1), 0) * 256 + get_byte(extensions.gen_random_bytes(1), 0)),
          now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 12), 72))))
  returning * into v_class;
  return arcade.class_json(v_class);
end
$$;

-- ---------- admin (run in the Supabase SQL editor) ----------

create function arcade.add_team_admin(p_slug text, p_username text)
returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_team uuid;
  v_user uuid;
begin
  select t.id into v_team from arcade.teams t where t.slug = lower(btrim(p_slug));
  if v_team is null then raise exception 'No team with slug %', p_slug; end if;
  select p.id into v_user from public.profiles p where lower(p.username) = lower(btrim(p_username));
  if v_user is null then raise exception 'No player with username %', p_username; end if;
  insert into arcade.team_admins (team_id, user_id) values (v_team, v_user) on conflict do nothing;
  return format('%s can now see team %s at https://thespaceio.github.io/spot-the-bug/?teamadmin', p_username, p_slug);
end
$$;
comment on function arcade.add_team_admin is 'Admin only. Lets a player see one team''s results on the Team admin page.';

create function arcade.remove_team_admin(p_slug text, p_username text)
returns void
language sql volatile set search_path = '' as $$
  delete from arcade.team_admins a
  using arcade.teams t, public.profiles p
  where a.team_id = t.id and a.user_id = p.id
    and t.slug = lower(btrim(p_slug)) and lower(p.username) = lower(btrim(p_username));
$$;

create function arcade.grant_team_pack(p_slug text, p_pack text)
returns void
language plpgsql volatile set search_path = '' as $$
declare
  v_team uuid;
begin
  select t.id into v_team from arcade.teams t where t.slug = lower(btrim(p_slug));
  if v_team is null then raise exception 'No team with slug %', p_slug; end if;
  if not exists (select 1 from arcade.stb_packs k where k.id = p_pack) then raise exception 'No pack %', p_pack; end if;
  insert into arcade.team_packs (team_id, pack) values (v_team, p_pack) on conflict do nothing;
end
$$;

create function arcade.revoke_team_pack(p_slug text, p_pack text)
returns void
language sql volatile set search_path = '' as $$
  delete from arcade.team_packs tp using arcade.teams t
  where tp.team_id = t.id and t.slug = lower(btrim(p_slug)) and tp.pack = p_pack;
$$;

revoke all on function arcade.add_team_admin(text, text) from public, anon, authenticated;
revoke all on function arcade.remove_team_admin(text, text) from public, anon, authenticated;
revoke all on function arcade.grant_team_pack(text, text) from public, anon, authenticated;
revoke all on function arcade.revoke_team_pack(text, text) from public, anon, authenticated;

-- ---------- helpers ----------

create function arcade.team_packs_json(p_team uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'description', k.description,
           'snippets', (select count(*) from arcade.stb_pack_snippets s where s.pack = k.id and s.active)) order by k.name), '[]'::jsonb)
  from arcade.team_packs tp join arcade.stb_packs k on k.id = tp.pack
  where tp.team_id = p_team;
$$;

-- The team the caller may look after (a team admin of it, or a moderator).
create function arcade.team_for_admin(p_slug text)
returns arcade.teams
language plpgsql stable security definer set search_path = '' as $$
declare
  v arcade.teams;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see your team.' using errcode = '22023';
  end if;
  select * into v from arcade.teams t where t.slug = lower(btrim(coalesce(p_slug, '')));
  if v.id is null or not (public.is_moderator()
      or exists (select 1 from arcade.team_admins a where a.team_id = v.id and a.user_id = auth.uid())) then
    raise exception 'You aren''t an admin of that team. Ask Th3 SpaceIO to add you.' using errcode = '22023';
  end if;
  return v;
end
$$;

revoke all on function arcade.team_packs_json(uuid) from public, anon, authenticated;
revoke all on function arcade.team_for_admin(text) from public, anon, authenticated;

-- ---------- players on a team link ----------

-- The team link check now also lists the team's packs.
create or replace function public.arcade_team(p_game text, p_slug text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v arcade.teams;
begin
  v := arcade.team_for(p_game, p_slug, p_key);
  return jsonb_build_object('slug', v.slug, 'name', v.name, 'expires_at', v.expires_at, 'packs', arcade.team_packs_json(v.id));
end
$$;

-- The snippets of the team's packs, for players with the team link.
create function public.arcade_team_pack(p_slug text, p_key text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v arcade.teams;
begin
  v := arcade.team_for('spot-the-bug', p_slug, p_key);
  return jsonb_build_object(
    'packs', arcade.team_packs_json(v.id),
    'snippets', coalesce((
      select jsonb_agg(s.payload || jsonb_build_object('pack', s.pack) order by s.id)
      from arcade.stb_pack_snippets s join arcade.team_packs tp on tp.pack = s.pack
      where tp.team_id = v.id and s.active), '[]'::jsonb));
end
$$;

-- ---------- team admins ----------

create function public.arcade_my_teams()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', t.slug, 'name', t.name, 'seats', t.seats, 'expires_at', t.expires_at, 'active', t.active,
      'admin', exists (select 1 from arcade.team_admins a where a.team_id = t.id and a.user_id = auth.uid()),
      'players', (select count(distinct s.user_id) from arcade.scores s where s.team_id = t.id),
      'packs', arcade.team_packs_json(t.id)) order by t.name)
    from arcade.teams t
    where exists (select 1 from arcade.team_admins a where a.team_id = t.id and a.user_id = auth.uid())
       or public.is_moderator()), '[]'::jsonb);
end
$$;

-- A team's results over the last p_days days (1 to 366): totals, each level,
-- each player, and each flaw type (from games posted since v0.17, which keep
-- their snippet IDs). Hidden games are left out.
create function public.arcade_team_report(p_slug text, p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_team arcade.teams;
  v_since timestamptz;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 366));
begin
  v_team := arcade.team_for_admin(p_slug);
  v_since := now() - make_interval(days => v_days);
  return jsonb_build_object(
    'team', jsonb_build_object('slug', v_team.slug, 'name', v_team.name, 'seats', v_team.seats,
                               'expires_at', v_team.expires_at, 'active', v_team.active,
                               'packs', arcade.team_packs_json(v_team.id)),
    'days', v_days,
    'generated_at', now(),
    'totals', (
      select jsonb_build_object('players', count(distinct s.user_id), 'games', count(*),
        'accuracy', coalesce(round(avg(s.accuracy))::integer, 0), 'clean', coalesce(sum(s.clean), 0),
        'rounds', coalesce(sum(s.rounds), 0))
      from arcade.scores s where s.team_id = v_team.id and not s.hidden and s.created_at >= v_since),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('level', x.level, 'games', x.games, 'players', x.players,
               'accuracy', x.accuracy, 'best', x.best, 'average', x.average)
             order by array_position(array['beginner', 'intermediate', 'advanced'], x.level))
      from (select s.level, count(*) as games, count(distinct s.user_id) as players,
                   round(avg(s.accuracy))::integer as accuracy, max(s.score) as best, round(avg(s.score))::integer as average
            from arcade.scores s where s.team_id = v_team.id and not s.hidden and s.created_at >= v_since
            group by s.level) x), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'games', x.games, 'accuracy', x.accuracy,
               'clean', x.clean, 'rounds', x.rounds, 'best', x.best, 'last_played', x.last_played)
             order by x.accuracy desc, x.games desc, x.name)
      from (select coalesce(p.username, max(s.name)) as name, count(*) as games,
                   round(avg(s.accuracy))::integer as accuracy, sum(s.clean) as clean, sum(s.rounds) as rounds,
                   jsonb_build_object(
                     'beginner', max(s.score) filter (where s.level = 'beginner'),
                     'intermediate', max(s.score) filter (where s.level = 'intermediate'),
                     'advanced', max(s.score) filter (where s.level = 'advanced')) as best,
                   max(s.created_at) as last_played
            from arcade.scores s left join public.profiles p on p.id = s.user_id
            where s.team_id = v_team.id and not s.hidden and s.created_at >= v_since
            group by s.user_id, p.username) x), '[]'::jsonb),
    'flaws', coalesce((
      select jsonb_agg(jsonb_build_object('category', x.category, 'rounds', x.rounds, 'clean', x.clean,
               'players', x.players) order by (x.clean::numeric / x.rounds), x.rounds desc)
      from (select k.category, count(*) as rounds, count(*) filter (where substr(s.marks, r.n::integer, 1) = 'C') as clean,
                   count(distinct s.user_id) as players
            from arcade.scores s
            cross join lateral unnest(s.snippets) with ordinality as r(id, n)
            join arcade.stb_answer_key k on k.id = r.id
            where s.team_id = v_team.id and not s.hidden and s.created_at >= v_since and s.snippets is not null
            group by k.category) x), '[]'::jsonb));
end
$$;

-- A new team link. The old link stops working straight away.
create function public.arcade_team_new_link(p_slug text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_team arcade.teams;
  v_key text := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
begin
  v_team := arcade.team_for_admin(p_slug);
  update arcade.teams t set key_hash = arcade.key_hash(v_key) where t.id = v_team.id;
  return jsonb_build_object('slug', v_team.slug,
    'link', 'https://thespaceio.github.io/spot-the-bug/?team=' || v_team.slug || '&key=' || v_key);
end
$$;

revoke all on function public.arcade_team_pack(text, text) from public;
revoke all on function public.arcade_my_teams() from public, anon;
revoke all on function public.arcade_team_report(text, integer) from public, anon;
revoke all on function public.arcade_team_new_link(text) from public, anon;
grant execute on function public.arcade_team_pack(text, text) to anon, authenticated;
grant execute on function public.arcade_my_teams() to authenticated;
grant execute on function public.arcade_team_report(text, integer) to authenticated;
grant execute on function public.arcade_team_new_link(text) to authenticated;
