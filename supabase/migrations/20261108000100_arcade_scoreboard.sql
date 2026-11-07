-- Shared online scoreboard for Th3 SpaceIO games, starting with Spot the Bug.
-- Lives in the LureLens Supabase project but touches none of its objects.
--
-- Design
--   * Tables live in the "arcade" schema, which the public API does not expose.
--   * The browser can only call three functions in public:
--       arcade_team                 check a team link (slug + key)
--       arcade_leaderboard          top players on a board
--       arcade_submit_spot_the_bug  post a finished game
--   * The server re-scores every posted game from the answers and its own
--     answer key, with the same rules as assets/js/engine.js. If SCORING or
--     LEVELS change in assets/js/config.js, change arcade_submit_spot_the_bug too.
--   * Team boards are private: reading or posting needs the team's secret key.
--     Only a hash of each key is stored.

create schema if not exists arcade;
revoke all on schema arcade from public;
comment on schema arcade is 'Shared scoreboards for Th3 SpaceIO games (Spot the Bug, later Password Lab and Terminal Quest).';

create table arcade.settings (
  id boolean primary key default true check (id),
  ip_secret bytea not null default extensions.gen_random_bytes(32)
);
insert into arcade.settings default values;

create table arcade.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 60),
  games text[] not null default '{spot-the-bug}',
  key_hash text not null,
  seats integer check (seats is null or seats > 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table arcade.teams is 'Licensed teams (companies, bootcamps). Create with arcade.create_team().';

create table arcade.stb_answer_key (
  id text primary key check (id ~ '^[A-Z]{3}-[0-9]{3}$'),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  category text not null,
  vulnerable_line integer not null check (vulnerable_line > 0),
  accept_lines integer[] not null default '{}',
  updated_at timestamptz not null default now()
);
comment on table arcade.stb_answer_key is 'Spot the Bug answers. Refresh with: node scripts/answer-key-sql.mjs';

create table arcade.scores (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('spot-the-bug')),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  team_id uuid references arcade.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  score integer not null check (score >= 0),
  clean integer not null,
  lines integer not null,
  rounds integer not null,
  accuracy integer not null check (accuracy between 0 and 100),
  best_streak integer not null,
  marks text not null,          -- per round: C clean, L line only, T type only, M missed
  ip_hash text,                 -- keyed hash of the client IP, for flood limits only
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index arcade_scores_board on arcade.scores (game, level, team_id, score desc) where not hidden;
create index arcade_scores_ip on arcade.scores (ip_hash, created_at);
create index arcade_scores_team_time on arcade.scores (team_id, created_at);
create index arcade_scores_time on arcade.scores (created_at);

alter table arcade.settings enable row level security;
alter table arcade.teams enable row level security;
alter table arcade.stb_answer_key enable row level security;
alter table arcade.scores enable row level security;
revoke all on all tables in schema arcade from public, anon, authenticated;

-- ---------- helpers (not reachable from the API) ----------

create function arcade.key_hash(p_key text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(coalesce(p_key, ''), 'UTF8'), 'sha256'), 'hex')
$$;

create function arcade.ip_hash() returns text
language sql stable set search_path = '' as $$
  select encode(extensions.hmac(
    convert_to(coalesce(
      nullif(btrim(x.h ->> 'cf-connecting-ip'), ''),
      nullif(btrim(split_part(x.h ->> 'x-forwarded-for', ',', 1)), ''),
      'unknown'), 'UTF8'),
    (select s.ip_secret from arcade.settings s), 'sha256'), 'hex')
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- Names: drop control and bidi override characters, collapse spaces, 1 to 24 characters.
create function arcade.clean_name(p_name text) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''),
    '[[:cntrl:]' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
      || chr(8294) || '-' || chr(8297) || chr(65279) || ']', '', 'g'),
    '\s+', ' ', 'g')), 24), '')
$$;

create function arcade.team_for(p_game text, p_slug text, p_key text) returns arcade.teams
language plpgsql stable set search_path = '' as $$
declare
  v arcade.teams;
begin
  select * into v from arcade.teams t
  where t.slug = lower(btrim(p_slug)) and t.active and p_game = any (t.games)
    and (t.expires_at is null or t.expires_at > now())
    and t.key_hash = arcade.key_hash(p_key);
  if not found then
    raise exception 'This team link isn''t valid or has expired. Ask your organiser for the current link.'
      using errcode = '22023';
  end if;
  return v;
end
$$;

-- ---------- admin (run in the Supabase SQL editor) ----------

create function arcade.create_team(
  p_slug text, p_name text, p_seats integer default null,
  p_expires_at timestamptz default null, p_games text[] default '{spot-the-bug}'
) returns table (team_slug text, team_name text, team_key text, link text)
language plpgsql volatile set search_path = '' as $$
declare
  v_slug text := lower(btrim(p_slug));
  v_key text := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
begin
  insert into arcade.teams (slug, name, games, key_hash, seats, expires_at)
  values (v_slug, btrim(p_name), p_games, arcade.key_hash(v_key), p_seats, p_expires_at);
  return query select v_slug, btrim(p_name), v_key,
    'https://thespaceio.github.io/spot-the-bug/?team=' || v_slug || '&key=' || v_key;
end
$$;
comment on function arcade.create_team is 'Admin only. Returns the team''s private link. The key is shown once; only its hash is stored.';

create function arcade.rotate_team_key(p_slug text)
returns table (team_slug text, team_key text, link text)
language plpgsql volatile set search_path = '' as $$
declare
  v_slug text := lower(btrim(p_slug));
  v_key text := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
begin
  update arcade.teams t set key_hash = arcade.key_hash(v_key) where t.slug = v_slug;
  if not found then
    raise exception 'No team with slug %', v_slug;
  end if;
  return query select v_slug, v_key,
    'https://thespaceio.github.io/spot-the-bug/?team=' || v_slug || '&key=' || v_key;
end
$$;
comment on function arcade.rotate_team_key is 'Admin only. Issues a new key; the old link stops working.';

revoke execute on all functions in schema arcade from public, anon, authenticated;

-- ---------- public API ----------

create function public.arcade_team(p_game text, p_slug text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v arcade.teams;
begin
  v := arcade.team_for(p_game, p_slug, p_key);
  return jsonb_build_object('slug', v.slug, 'name', v.name, 'expires_at', v.expires_at);
end
$$;

create function public.arcade_leaderboard(
  p_game text, p_level text, p_team text default null, p_key text default null, p_limit integer default 10
) returns table (rank integer, name text, score integer, accuracy integer, best_streak integer, played_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_team arcade.teams;
begin
  if p_team is not null then
    v_team := arcade.team_for(p_game, p_team, p_key);
  end if;
  return query
  with best as (
    select distinct on (lower(s.name)) s.name, s.score, s.accuracy, s.best_streak, s.created_at
    from arcade.scores s
    where s.game = p_game and s.level = p_level and not s.hidden
      and s.team_id is not distinct from v_team.id
    order by lower(s.name), s.score desc, s.created_at
  )
  select (rank() over (order by b.score desc))::integer, b.name, b.score, b.accuracy, b.best_streak, b.created_at
  from best b
  order by b.score desc, b.created_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end
$$;

create function public.arcade_submit_spot_the_bug(
  p_name text, p_level text, p_answers jsonb, p_team text default null, p_key text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_game constant text := 'spot-the-bug';
  c_rounds constant integer := 10;
  v_name text := arcade.clean_name(p_name);
  v_team arcade.teams;
  v_seconds integer;
  v_mult numeric;
  v_ip text := arcade.ip_hash();
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
  if v_name is null then
    raise exception 'Add a name for the scoreboard.' using errcode = '22023';
  end if;
  -- Same numbers as LEVELS in assets/js/config.js
  case p_level
    when 'beginner' then v_seconds := 60; v_mult := 1;
    when 'intermediate' then v_seconds := 45; v_mult := 1.5;
    when 'advanced' then v_seconds := 40; v_mult := 2;
    else raise exception 'Unknown level.' using errcode = '22023';
  end case;
  if p_team is not null then
    v_team := arcade.team_for(c_game, p_team, p_key);
  end if;

  -- Flood protection. Classrooms share one network, so team boards get a higher limit.
  if v_team.id is null then
    if (select count(*) from arcade.scores s
        where s.ip_hash = v_ip and s.created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'Too many games posted from your network in a short time. Try again in a few minutes.'
        using errcode = '22023';
    end if;
  elsif (select count(*) from arcade.scores s
         where s.team_id = v_team.id and s.created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'Your team has posted a lot of games in the last few minutes. Try again shortly.'
      using errcode = '22023';
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
    if jsonb_typeof(v_answer) is distinct from 'object' then
      raise exception 'Unknown answer format.' using errcode = '22023';
    end if;
    select * into v_key from arcade.stb_answer_key k where k.id = v_answer ->> 'id';
    if not found or v_key.level <> p_level then
      raise exception 'This game has snippets the online scoreboard doesn''t know yet.' using errcode = '22023';
    end if;
    if v_key.id = any (v_seen) then
      raise exception 'A snippet appears twice in this game.' using errcode = '22023';
    end if;
    v_seen := v_seen || v_key.id;

    v_line := case when (v_answer ->> 'line') ~ '^[0-9]{1,3}$' then (v_answer ->> 'line')::integer end;
    v_type := left(v_answer ->> 'type', 40);
    v_left := case when (v_answer ->> 'left') ~ '^[0-9]{1,4}$'
                   then least((v_answer ->> 'left')::integer, v_seconds * 10) else 0 end;

    -- Same rules as scoreRound() in assets/js/engine.js
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

  insert into arcade.scores (game, level, team_id, name, score, clean, lines, rounds, accuracy, best_streak, marks, ip_hash)
  values (c_game, p_level, v_team.id, v_name, v_total, v_cleans, v_lines, c_rounds, v_accuracy, v_best, v_marks, v_ip)
  returning id into v_id;

  -- Where this game lands among other players' best scores on the same board.
  select count(*) + 1 into v_rank
  from (
    select lower(s.name) as player, max(s.score) as best
    from arcade.scores s
    where s.game = c_game and s.level = p_level and not s.hidden and s.team_id is not distinct from v_team.id
    group by 1
  ) b
  where b.best > v_total and b.player <> lower(v_name);

  select count(distinct lower(s.name)) into v_of
  from arcade.scores s
  where s.game = c_game and s.level = p_level and not s.hidden and s.team_id is not distinct from v_team.id;

  select max(s.score) into v_pb
  from arcade.scores s
  where s.game = c_game and s.level = p_level and not s.hidden
    and s.team_id is not distinct from v_team.id and lower(s.name) = lower(v_name);

  return jsonb_build_object(
    'id', v_id, 'name', v_name, 'score', v_total, 'clean', v_cleans, 'lines', v_lines,
    'accuracy', v_accuracy, 'best_streak', v_best, 'rank', v_rank, 'of', v_of,
    'personal_best', v_pb, 'team', v_team.name
  );
end
$$;

revoke execute on function public.arcade_team(text, text, text) from public;
revoke execute on function public.arcade_leaderboard(text, text, text, text, integer) from public;
revoke execute on function public.arcade_submit_spot_the_bug(text, text, jsonb, text, text) from public;
grant execute on function public.arcade_team(text, text, text) to anon, authenticated;
grant execute on function public.arcade_leaderboard(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.arcade_submit_spot_the_bug(text, text, jsonb, text, text) to anon, authenticated;

comment on function public.arcade_submit_spot_the_bug is
  'Posts a Spot the Bug game. Scores are recalculated here from the answers; the browser''s own total is ignored.';

-- Spot the Bug answer key: 30 snippets. Generated by scripts/answer-key-sql.mjs
insert into arcade.stb_answer_key (id, level, category, vulnerable_line, accept_lines) values
  ('BEG-001', 'beginner', 'sqli', 11, '{10}'),
  ('BEG-002', 'beginner', 'xss', 12, '{}'),
  ('BEG-003', 'beginner', 'access-control', 12, '{11}'),
  ('BEG-004', 'beginner', 'hardcoded-secret', 4, '{}'),
  ('BEG-005', 'beginner', 'weak-hashing', 7, '{}'),
  ('BEG-006', 'beginner', 'path-traversal', 7, '{6}'),
  ('BEG-007', 'beginner', 'ssrf', 11, '{}'),
  ('BEG-008', 'beginner', 'deserialization', 13, '{}'),
  ('BEG-009', 'beginner', 'input-validation', 8, '{13}'),
  ('BEG-010', 'beginner', 'verbose-errors', 13, '{12,14}'),
  ('INT-001', 'intermediate', 'sqli', 18, '{}'),
  ('INT-002', 'intermediate', 'xss', 18, '{}'),
  ('INT-003', 'intermediate', 'access-control', 20, '{}'),
  ('INT-004', 'intermediate', 'hardcoded-secret', 8, '{}'),
  ('INT-005', 'intermediate', 'weak-hashing', 6, '{}'),
  ('INT-006', 'intermediate', 'path-traversal', 13, '{14}'),
  ('INT-007', 'intermediate', 'ssrf', 8, '{19}'),
  ('INT-008', 'intermediate', 'deserialization', 12, '{}'),
  ('INT-009', 'intermediate', 'input-validation', 15, '{11}'),
  ('INT-010', 'intermediate', 'verbose-errors', 24, '{}'),
  ('ADV-001', 'advanced', 'sqli', 8, '{}'),
  ('ADV-002', 'advanced', 'xss', 14, '{}'),
  ('ADV-003', 'advanced', 'access-control', 14, '{}'),
  ('ADV-004', 'advanced', 'hardcoded-secret', 4, '{}'),
  ('ADV-005', 'advanced', 'weak-hashing', 5, '{10}'),
  ('ADV-006', 'advanced', 'path-traversal', 12, '{}'),
  ('ADV-007', 'advanced', 'ssrf', 14, '{16}'),
  ('ADV-008', 'advanced', 'deserialization', 15, '{}'),
  ('ADV-009', 'advanced', 'input-validation', 12, '{}'),
  ('ADV-010', 'advanced', 'verbose-errors', 16, '{}')
on conflict (id) do update set level = excluded.level, category = excluded.category,
  vulnerable_line = excluded.vulnerable_line, accept_lines = excluded.accept_lines, updated_at = now();
