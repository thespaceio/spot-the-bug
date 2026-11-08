-- Spot the Bug v0.8: classrooms and moderation.
--
-- Classrooms: a teacher (any signed-in player with a username) creates a class
-- and gets a 6-character code. Everyone who joins with the code plays the same
-- ten snippets in the same order, once. Results go to the class board only
-- (not the public scoreboard), and the class debrief shows, round by round,
-- how many found the line and the most common wrong answer.
--
-- Moderation: LureLens moderators (public.moderators, public.is_moderator())
-- can review posted games, certificates and classes, hide or show them, and
-- see the log. Hiding a player everywhere uses LureLens's moderate_player().

-- ---------- scoring shared by class games ----------

-- Scores a game exactly like arcade_submit_spot_the_bug (and scoreRound() in
-- assets/js/engine.js). p_ids, when given, is the exact snippet order required.
create function arcade.stb_score(p_level text, p_answers jsonb, p_ids text[] default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c_rounds constant integer := 10;
  v_seconds integer;
  v_mult numeric;
  v_answer jsonb;
  v_n integer := 0;
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
  v_rounds jsonb := '[]'::jsonb;
begin
  case p_level
    when 'beginner' then v_seconds := 60; v_mult := 1;
    when 'intermediate' then v_seconds := 45; v_mult := 1.5;
    when 'advanced' then v_seconds := 40; v_mult := 2;
    else raise exception 'Unknown level.' using errcode = '22023';
  end case;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) <> c_rounds then
    raise exception 'A game has % rounds.', c_rounds using errcode = '22023';
  end if;

  for v_answer in
    select e.value from jsonb_array_elements(p_answers) with ordinality as e(value, n) order by e.n
  loop
    v_n := v_n + 1;
    if jsonb_typeof(v_answer) is distinct from 'object' then
      raise exception 'Unknown answer format.' using errcode = '22023';
    end if;
    if p_ids is not null and (v_answer ->> 'id') is distinct from p_ids[v_n] then
      raise exception 'This game doesn''t match the class''s snippets. Reload the class page and play again.' using errcode = '22023';
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
    v_rounds := v_rounds || jsonb_build_array(jsonb_build_object(
      'id', v_key.id, 'l', v_line_ok, 't', v_type_ok,
      -- the wrong type picked, kept for the class debrief ("most common wrong answer")
      'w', case when v_type_ok or v_type is null then null
                when exists (select 1 from arcade.stb_answer_key k2 where k2.category = v_type) then v_type end));
  end loop;

  return jsonb_build_object('score', v_total, 'clean', v_cleans, 'lines', v_lines,
    'accuracy', round(v_cleans * 100.0 / c_rounds)::integer, 'best_streak', v_best, 'rounds', v_rounds);
end
$$;

-- ---------- classes ----------

create table arcade.classes (
  code text primary key check (code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  game text not null default 'spot-the-bug',
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  snippet_ids text[] not null check (cardinality(snippet_ids) = 10),
  seed integer not null,
  open_until timestamptz not null,
  closed boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index classes_owner_idx on arcade.classes (owner, created_at desc);
alter table arcade.classes enable row level security;

create table arcade.class_results (
  class_code text not null references arcade.classes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  score integer not null,
  clean integer not null,
  lines integer not null,
  accuracy integer not null,
  best_streak integer not null,
  rounds jsonb not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (class_code, user_id)
);
create index class_results_user_idx on arcade.class_results (user_id);
create index class_results_created_idx on arcade.class_results (created_at);
alter table arcade.class_results enable row level security;

-- A tiny live signal per class so the class board and big screen reload.
create function arcade.announce_class_result()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform realtime.send(jsonb_build_object('code', new.class_code), 'class_result', 'arcade:class:' || new.class_code, false);
  exception when others then
    null;   -- live updates must never stop a game from being posted
  end;
  return new;
end
$$;
create trigger class_results_announce after insert or update on arcade.class_results
  for each row execute function arcade.announce_class_result();

create function arcade.class_json(p_class arcade.classes)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'code', p_class.code, 'name', p_class.name, 'level', p_class.level,
    'snippets', to_jsonb(p_class.snippet_ids), 'seed', p_class.seed,
    'teacher', (select p.username from public.profiles p where p.id = p_class.owner),
    'open_until', p_class.open_until, 'closed', p_class.closed,
    'open', not p_class.closed and p_class.open_until > now(),
    'created_at', p_class.created_at,
    'is_owner', p_class.owner = auth.uid(),
    'players', (select count(*) from arcade.class_results r join public.profiles p on p.id = r.user_id
                where r.class_code = p_class.code and not r.hidden and not p.hidden),
    'my_result', (select jsonb_build_object('score', r.score, 'accuracy', r.accuracy, 'clean', r.clean, 'played_at', r.created_at)
                  from arcade.class_results r where r.class_code = p_class.code and r.user_id = auth.uid()))
$$;

create function public.arcade_create_class(p_name text, p_level text, p_hours integer default 12)
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

  select array_agg(k.id order by random()) into v_ids
  from (select k.id from arcade.stb_answer_key k where k.level = p_level order by random() limit 10) k;
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

create function public.arcade_class(p_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select arcade.class_json(c) from arcade.classes c
  join public.profiles p on p.id = c.owner
  where c.code = upper(btrim(coalesce(p_code, ''))) and not c.hidden and not p.hidden
$$;

create function public.arcade_class_submit(p_code text, p_answers jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_class arcade.classes;
  v_s jsonb;
  v_rank integer;
  v_of integer;
begin
  if v_uid is null then
    raise exception 'Sign in or quick join to post to the class board.' using errcode = '22023';
  end if;
  select p.username into v_name from public.profiles p where p.id = v_uid;
  if v_name is null then
    raise exception 'Choose a username on your Account page first.' using errcode = '22023';
  end if;
  select * into v_class from arcade.classes c where c.code = upper(btrim(coalesce(p_code, ''))) and not c.hidden;
  if v_class.code is null then
    raise exception 'That class code doesn''t exist.' using errcode = '22023';
  end if;
  if v_class.closed or v_class.open_until <= now() then
    raise exception 'This class has closed, so new games can''t be added.' using errcode = '22023';
  end if;
  if exists (select 1 from arcade.class_results r where r.class_code = v_class.code and r.user_id = v_uid) then
    raise exception 'You''ve already played this class game. Your first game is the one that counts.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.class_results r where r.class_code = v_class.code) >= 300 then
    raise exception 'This class is full (300 players).' using errcode = '22023';
  end if;
  if (select count(*) from arcade.class_results r where r.created_at > now() - interval '1 minute') >= 300 then
    raise exception 'The class boards are busy. Try again in a minute.' using errcode = '22023';
  end if;

  v_s := arcade.stb_score(v_class.level, p_answers, v_class.snippet_ids);
  insert into arcade.class_results (class_code, user_id, name, score, clean, lines, accuracy, best_streak, rounds)
  values (v_class.code, v_uid, v_name, (v_s ->> 'score')::integer, (v_s ->> 'clean')::integer, (v_s ->> 'lines')::integer,
          (v_s ->> 'accuracy')::integer, (v_s ->> 'best_streak')::integer, v_s -> 'rounds');

  select count(*) + 1 into v_rank from arcade.class_results r join public.profiles p on p.id = r.user_id
  where r.class_code = v_class.code and not r.hidden and not p.hidden and r.score > (v_s ->> 'score')::integer;
  select count(*) into v_of from arcade.class_results r join public.profiles p on p.id = r.user_id
  where r.class_code = v_class.code and not r.hidden and not p.hidden;

  return jsonb_build_object('name', v_name, 'score', (v_s ->> 'score')::integer, 'clean', (v_s ->> 'clean')::integer,
    'accuracy', (v_s ->> 'accuracy')::integer, 'best_streak', (v_s ->> 'best_streak')::integer,
    'rank', v_rank, 'of', v_of, 'class', v_class.name);
end
$$;

create function public.arcade_class_board(p_code text, p_limit integer default 100)
returns table (rank integer, name text, score integer, accuracy integer, best_streak integer, played_at timestamptz, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select (rank() over (order by r.score desc))::integer, r.name, r.score, r.accuracy, r.best_streak, r.created_at, r.user_id = auth.uid()
  from arcade.classes c
  join arcade.class_results r on r.class_code = c.code
  join public.profiles p on p.id = r.user_id
  where c.code = upper(btrim(coalesce(p_code, ''))) and not c.hidden and not r.hidden and not p.hidden
  order by r.score desc, r.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 300))
$$;

-- Round by round for the whole class: how many found the line, how many got
-- it clean, and the most common wrong flaw type.
create function public.arcade_class_debrief(p_code text)
returns table (round_no integer, id text, played integer, line_found integer, clean integer, top_wrong text, top_wrong_count integer)
language sql stable security definer set search_path = ''
as $$
  with cls as (
    select c.* from arcade.classes c where c.code = upper(btrim(coalesce(p_code, ''))) and not c.hidden
  ), rounds as (
    select e.n::integer as pos, e.value as r
    from cls
    join arcade.class_results res on res.class_code = cls.code and not res.hidden
    join public.profiles p on p.id = res.user_id and not p.hidden
    cross join lateral jsonb_array_elements(res.rounds) with ordinality as e(value, n)
  ), wrong as (
    select pos, r ->> 'w' as w, count(*)::integer as n,
           row_number() over (partition by pos order by count(*) desc, r ->> 'w') as k
    from rounds where r ->> 'w' is not null group by pos, r ->> 'w'
  )
  select s.pos::integer, cls.snippet_ids[s.pos],
         coalesce(count(rounds.r), 0)::integer,
         coalesce(count(*) filter (where (rounds.r ->> 'l')::boolean), 0)::integer,
         coalesce(count(*) filter (where (rounds.r ->> 'l')::boolean and (rounds.r ->> 't')::boolean), 0)::integer,
         w.w, w.n
  from cls
  cross join generate_series(1, 10) as s(pos)
  left join rounds on rounds.pos = s.pos
  left join wrong w on w.pos = s.pos and w.k = 1
  group by s.pos, cls.snippet_ids, w.w, w.n
  order by s.pos
$$;

create function public.arcade_my_classes()
returns setof jsonb
language sql stable security definer set search_path = ''
as $$
  select arcade.class_json(c) from arcade.classes c
  where c.owner = auth.uid() and not c.hidden
  order by c.created_at desc limit 30
$$;

create function public.arcade_close_class(p_code text, p_closed boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_class arcade.classes;
begin
  update arcade.classes c set closed = coalesce(p_closed, true),
    open_until = case when not coalesce(p_closed, true) and c.open_until <= now() then now() + interval '12 hours' else c.open_until end
  where c.code = upper(btrim(coalesce(p_code, ''))) and c.owner = auth.uid()
  returning * into v_class;
  if v_class.code is null then
    raise exception 'Only the teacher who started this class can do that.' using errcode = '22023';
  end if;
  return arcade.class_json(v_class);
end
$$;

-- The teacher (or a moderator) can take a name off their class board.
create function public.arcade_class_hide_result(p_code text, p_name text, p_hidden boolean default true)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  if not exists (select 1 from arcade.classes c where c.code = upper(btrim(coalesce(p_code, '')))
                 and (c.owner = auth.uid() or public.is_moderator())) then
    raise exception 'Only the teacher who started this class can do that.' using errcode = '22023';
  end if;
  update arcade.class_results r set hidden = coalesce(p_hidden, true)
  where r.class_code = upper(btrim(p_code)) and lower(r.name) = lower(btrim(coalesce(p_name, '')));
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$$;

-- ---------- moderation ----------

create table arcade.moderation_log (
  id bigint generated always as identity primary key,
  moderator uuid references auth.users (id) on delete set null,
  game text not null default 'spot-the-bug',
  action text not null check (action in ('hide', 'show')),
  target_kind text not null check (target_kind in ('score', 'certificate', 'class')),
  target_id text not null,
  player_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
create index moderation_log_created_idx on arcade.moderation_log (created_at desc);
alter table arcade.moderation_log enable row level security;

create function arcade.require_moderator()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can do that.' using errcode = '42501';
  end if;
end
$$;

-- Posted games for review. p_view: recent | flagged | hidden.
-- Flags: near-max (98%+ of the most a level can score) and burst (6+ games by
-- the same account within an hour).
create function public.arcade_mod_scores(p_game text default 'spot-the-bug', p_view text default 'recent',
                                         p_search text default null, p_limit integer default 100)
returns table (id uuid, player_id uuid, name text, level text, score integer, accuracy integer, best_streak integer,
               team text, created_at timestamptz, hidden boolean, player_hidden boolean, flags text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform arcade.require_moderator();
  return query
  with s as (
    select sc.*, p.hidden as p_hidden, t.name as team_name,
      array_remove(array[
        case when sc.score >= 0.98 * (case sc.level when 'beginner' then 2350 when 'intermediate' then 3525 else 4700 end) then 'near-max' end,
        case when (select count(*) from arcade.scores o where o.user_id = sc.user_id and o.game = sc.game
                   and o.created_at between sc.created_at - interval '1 hour' and sc.created_at + interval '1 hour') >= 6 then 'burst' end
      ], null) as fl
    from arcade.scores sc
    left join public.profiles p on p.id = sc.user_id
    left join arcade.teams t on t.id = sc.team_id
    where sc.game = p_game
      and (p_search is null or btrim(p_search) = '' or sc.name ilike '%' || btrim(p_search) || '%')
    order by sc.created_at desc
    limit 1000
  )
  select s.id, s.user_id, s.name, s.level, s.score, s.accuracy, s.best_streak, s.team_name, s.created_at,
         s.hidden, coalesce(s.p_hidden, false), s.fl
  from s
  where case coalesce(p_view, 'recent')
          when 'hidden' then s.hidden or coalesce(s.p_hidden, false)
          when 'flagged' then cardinality(s.fl) > 0
          else true end
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
end
$$;

-- Certificates and classes for review: setof jsonb rows.
create function public.arcade_mod_list(p_kind text, p_search text default null, p_limit integer default 100)
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform arcade.require_moderator();
  if p_kind = 'certificate' then
    return query
    select jsonb_build_object('id', c.reference, 'name', c.display_name, 'username', p.username, 'player_id', c.user_id,
                              'created_at', c.created_at, 'hidden', c.hidden, 'player_hidden', coalesce(p.hidden, false))
    from arcade.certificates c left join public.profiles p on p.id = c.user_id
    where p_search is null or btrim(p_search) = '' or c.display_name ilike '%' || btrim(p_search) || '%'
       or p.username ilike '%' || btrim(p_search) || '%' or c.reference ilike '%' || btrim(p_search) || '%'
    order by c.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 300));
  elsif p_kind = 'class' then
    return query
    select jsonb_build_object('id', c.code, 'name', c.name, 'username', p.username, 'player_id', c.owner, 'level', c.level,
                              'players', (select count(*) from arcade.class_results r where r.class_code = c.code),
                              'created_at', c.created_at, 'hidden', c.hidden, 'player_hidden', coalesce(p.hidden, false))
    from arcade.classes c left join public.profiles p on p.id = c.owner
    where p_search is null or btrim(p_search) = '' or c.name ilike '%' || btrim(p_search) || '%'
       or p.username ilike '%' || btrim(p_search) || '%' or c.code ilike '%' || btrim(p_search) || '%'
    order by c.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 300));
  else
    raise exception 'Unknown list.' using errcode = '22023';
  end if;
end
$$;

create function public.arcade_mod_set_hidden(p_kind text, p_id text, p_hidden boolean, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hidden boolean := coalesce(p_hidden, true);
  v_player uuid;
  v_game text := 'spot-the-bug';
begin
  perform arcade.require_moderator();
  if p_kind = 'score' then
    if p_id !~ '^[0-9a-f-]{36}$' then raise exception 'Unknown game.' using errcode = '22023'; end if;
    update arcade.scores s set hidden = v_hidden where s.id = p_id::uuid returning s.user_id, s.game into v_player, v_game;
  elsif p_kind = 'certificate' then
    update arcade.certificates c set hidden = v_hidden where c.reference = upper(btrim(p_id)) returning c.user_id, c.game into v_player, v_game;
  elsif p_kind = 'class' then
    update arcade.classes c set hidden = v_hidden where c.code = upper(btrim(p_id)) returning c.owner, c.game into v_player, v_game;
  else
    raise exception 'Unknown item.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'That item no longer exists.' using errcode = '22023';
  end if;
  insert into arcade.moderation_log (moderator, game, action, target_kind, target_id, player_id, reason)
  values (auth.uid(), v_game, case when v_hidden then 'hide' else 'show' end, p_kind, upper(btrim(p_id)), v_player, arcade.clean_text(p_reason, 200));
  return jsonb_build_object('kind', p_kind, 'id', p_id, 'hidden', v_hidden);
end
$$;

-- What moderators did here, plus player-level hides from the shared LureLens log.
create function public.arcade_mod_history(p_limit integer default 100)
returns table (created_at timestamptz, action text, kind text, target text, player text, moderator text, reason text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform arcade.require_moderator();
  return query
  select * from (
    select l.created_at, l.action, l.target_kind, l.target_id, pl.username, md.username, l.reason
    from arcade.moderation_log l
    left join public.profiles pl on pl.id = l.player_id
    left join public.profiles md on md.id = l.moderator
    union all
    select l.created_at, case when l.action = 'hide_player' then 'hide' else 'show' end, 'player', null::text, pl.username, md.username, l.reason
    from public.moderation_log l
    left join public.profiles pl on pl.id = l.player_id
    left join public.profiles md on md.id = l.moderator
    where l.action in ('hide_player', 'show_player')
  ) x
  order by 1 desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
end
$$;

-- ---------- access ----------

revoke all on function arcade.stb_score(text, jsonb, text[]) from public, anon, authenticated;
revoke all on function arcade.class_json(arcade.classes) from public, anon, authenticated;
revoke all on function arcade.require_moderator() from public, anon, authenticated;
revoke all on function arcade.announce_class_result() from public, anon, authenticated;

revoke all on function public.arcade_create_class(text, text, integer) from public, anon;
revoke all on function public.arcade_class(text) from public;
revoke all on function public.arcade_class_submit(text, jsonb) from public, anon;
revoke all on function public.arcade_class_board(text, integer) from public;
revoke all on function public.arcade_class_debrief(text) from public;
revoke all on function public.arcade_my_classes() from public, anon;
revoke all on function public.arcade_close_class(text, boolean) from public, anon;
revoke all on function public.arcade_class_hide_result(text, text, boolean) from public, anon;
revoke all on function public.arcade_mod_scores(text, text, text, integer) from public, anon;
revoke all on function public.arcade_mod_list(text, text, integer) from public, anon;
revoke all on function public.arcade_mod_set_hidden(text, text, boolean, text) from public, anon;
revoke all on function public.arcade_mod_history(integer) from public, anon;

grant execute on function public.arcade_class(text) to anon, authenticated;
grant execute on function public.arcade_class_board(text, integer) to anon, authenticated;
grant execute on function public.arcade_class_debrief(text) to anon, authenticated;
grant execute on function public.arcade_create_class(text, text, integer) to authenticated;
grant execute on function public.arcade_class_submit(text, jsonb) to authenticated;
grant execute on function public.arcade_my_classes() to authenticated;
grant execute on function public.arcade_close_class(text, boolean) to authenticated;
grant execute on function public.arcade_class_hide_result(text, text, boolean) to authenticated;
grant execute on function public.arcade_mod_scores(text, text, text, integer) to authenticated;
grant execute on function public.arcade_mod_list(text, text, integer) to authenticated;
grant execute on function public.arcade_mod_set_hidden(text, text, boolean, text) to authenticated;
grant execute on function public.arcade_mod_history(integer) to authenticated;
