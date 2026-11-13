-- Spot the Bug v0.12: games for the online scoreboard are timed by the server.
--
-- Before, the browser sent its answers and how much time it had left, and the
-- server believed the time. Now a ranked game is opened on the server when it
-- starts, the server notes when each round is shown, paused, resumed and
-- answered, and the post counts the server's own clock:
--
--   * a round can't claim to be quicker than the server saw it (less a few
--     seconds for slow mobile networks);
--   * an answer that arrives well after the clock ran out counts as no answer;
--   * a game with 3 or more clean rounds answered in under 2 seconds is posted
--     hidden, for a moderator to check (a person can't read, click a line,
--     pick a flaw and lock in that fast);
--   * only a game that was really played, in order, can be posted, once.
--
-- The answers themselves are still in the public repository, so this doesn't
-- stop someone who copies them and plays at a human speed. That needs content
-- kept out of the public repo (see README, "Scoreboard integrity").

-- ---------- games in progress ----------

create table arcade.stb_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,  -- null until claimed by a signed-in player
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  snippet_ids text[] not null,
  current_round smallint not null default 0,      -- the round on screen (1 to 10), 0 before the first
  round_started_at timestamptz,
  paused_at timestamptz,
  paused_ms integer not null default 0,           -- paused time in the current round
  answers jsonb not null default '[]'::jsonb,     -- one object per answered round
  posted_score uuid references arcade.scores (id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create index stb_games_created_idx on arcade.stb_games (created_at);
create index stb_games_user_idx on arcade.stb_games (user_id, created_at);
alter table arcade.stb_games enable row level security;   -- no policies: functions only

alter table arcade.scores add column if not exists fast_rounds smallint not null default 0;

-- ---------- scoring, shared by every way of posting ----------

-- p_answers: [{id, line, type, left}] with left in tenths of a second.
-- Same rules as scoreRound() in assets/js/engine.js.
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

  insert into arcade.scores (game, level, team_id, user_id, name, score, clean, lines, rounds, accuracy, best_streak, marks, hidden, fast_rounds)
  values (c_game, p_level, p_team.id, p_uid, v_name, v_total, v_cleans, v_lines, c_rounds, v_accuracy, v_best, v_marks,
          coalesce(p_hidden, false), coalesce(p_fast, 0))
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
revoke all on function arcade.stb_post_scores(uuid, text, jsonb, arcade.teams, boolean, integer) from public, anon, authenticated;

-- ---------- the old way of posting is retired ----------

create or replace function public.arcade_submit_spot_the_bug(
  p_name text, p_level text, p_answers jsonb, p_team text default null, p_key text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  raise exception 'This copy of Spot the Bug is out of date. Reload the page, then play a new game to post it.' using errcode = '22023';
end
$$;

-- ---------- 1. start ----------

-- The browser picks the snippets (it avoids ones the player has seen); the
-- server checks the game is a real one: 10 distinct snippets from the level,
-- at least one mobile and one config.
create or replace function public.arcade_stb_start(p_level text, p_snippets text[])
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if p_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'Unknown level.' using errcode = '22023';
  end if;
  if p_snippets is null or cardinality(p_snippets) <> 10
     or (select count(distinct x) from unnest(p_snippets) as x) <> 10 then
    raise exception 'A game has 10 different snippets.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.stb_answer_key k where k.id = any (p_snippets) and k.level = p_level) <> 10 then
    raise exception 'This game has snippets the online scoreboard doesn''t know yet.' using errcode = '22023';
  end if;
  if not exists (select 1 from arcade.stb_answer_key k where k.id = any (p_snippets) and k.surface = 'mobile')
     or not exists (select 1 from arcade.stb_answer_key k where k.id = any (p_snippets) and k.surface = 'config') then
    raise exception 'A game needs at least one mobile and one config snippet.' using errcode = '22023';
  end if;

  -- Flood protection.
  if v_uid is not null and (select count(*) from arcade.stb_games g
      where g.user_id = v_uid and g.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many games started in a short time. Try again in a few minutes.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.stb_games g where g.created_at > now() - interval '1 minute') >= 300 then
    raise exception 'The game server is busy. Try again in a minute.' using errcode = '22023';
  end if;

  -- Tidy up: games can be posted for a day.
  delete from arcade.stb_games g
  where g.id in (select g2.id from arcade.stb_games g2 where g2.created_at < now() - interval '2 days' limit 500);

  insert into arcade.stb_games (user_id, level, snippet_ids) values (v_uid, p_level, p_snippets)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------- 2. the clock: a round is shown, paused, resumed ----------

create or replace function public.arcade_stb_clock(p_game uuid, p_round integer, p_action text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g arcade.stb_games;
begin
  select * into v_g from arcade.stb_games g where g.id = p_game for update;
  if not found or v_g.posted_at is not null or v_g.created_at < now() - interval '1 day' then
    raise exception 'This game is no longer open.' using errcode = '22023';
  end if;
  if v_g.user_id is not null and v_g.user_id is distinct from auth.uid() then
    raise exception 'This game belongs to another player.' using errcode = '22023';
  end if;

  if p_action = 'start' then
    if p_round = v_g.current_round then return true; end if;          -- repeated call: the clock keeps running
    if p_round <> v_g.current_round + 1 or p_round > 10
       or jsonb_array_length(v_g.answers) <> v_g.current_round then
      raise exception 'Rounds must be played in order.' using errcode = '22023';
    end if;
    update arcade.stb_games set current_round = p_round, round_started_at = now(), paused_at = null, paused_ms = 0
    where id = p_game;
  elsif p_action = 'pause' then
    if p_round <> v_g.current_round then raise exception 'Rounds must be played in order.' using errcode = '22023'; end if;
    update arcade.stb_games set paused_at = coalesce(paused_at, now()) where id = p_game;
  elsif p_action = 'resume' then
    if p_round <> v_g.current_round then raise exception 'Rounds must be played in order.' using errcode = '22023'; end if;
    if v_g.paused_at is not null then
      update arcade.stb_games
      set paused_ms = least(paused_ms + (extract(epoch from now() - paused_at) * 1000)::integer, 3600000), paused_at = null
      where id = p_game;
    end if;
  else
    raise exception 'Unknown clock action.' using errcode = '22023';
  end if;
  return true;
end
$$;

-- ---------- 3. an answer ----------

-- p_left: the time left the browser showed, in tenths of a second. Kept for
-- the post, which won't let it be more than the server's clock allows.
create or replace function public.arcade_stb_answer(p_game uuid, p_round integer, p_line integer, p_type text, p_left integer)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g arcade.stb_games;
  v_ms integer;
begin
  select * into v_g from arcade.stb_games g where g.id = p_game for update;
  if not found or v_g.posted_at is not null or v_g.created_at < now() - interval '1 day' then
    raise exception 'This game is no longer open.' using errcode = '22023';
  end if;
  if v_g.user_id is not null and v_g.user_id is distinct from auth.uid() then
    raise exception 'This game belongs to another player.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_g.answers) >= p_round then return true; end if;   -- repeated call: the first answer stands
  if p_round <> v_g.current_round or v_g.round_started_at is null then
    raise exception 'Rounds must be played in order.' using errcode = '22023';
  end if;

  v_ms := (extract(epoch from coalesce(v_g.paused_at, now()) - v_g.round_started_at) * 1000)::integer - v_g.paused_ms;
  update arcade.stb_games
  set answers = answers || jsonb_build_array(jsonb_build_object(
        'id', snippet_ids[p_round],
        'line', case when p_line between 1 and 999 then p_line end,
        'type', left(p_type, 40),
        'left', greatest(0, least(coalesce(p_left, 0), 9999)),
        'ms', greatest(v_ms, 0))),
      paused_at = null
  where id = p_game;
  return true;
end
$$;

-- ---------- 4. post ----------

create or replace function public.arcade_stb_post(p_game uuid, p_team text default null, p_key text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_slack_ms constant integer := 3000;   -- slow networks: the server sees each round a little late
  c_fast_ms constant integer := 2000;
  v_uid uuid := auth.uid();
  v_g arcade.stb_games;
  v_team arcade.teams;
  v_seconds integer;
  v_a jsonb;
  v_out jsonb := '[]'::jsonb;
  v_left integer;
  v_cap integer;
  v_late boolean;
  v_key arcade.stb_answer_key;
  v_fast integer := 0;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in or quick join to post to the online scoreboard.' using errcode = '22023';
  end if;
  select * into v_g from arcade.stb_games g where g.id = p_game for update;
  if not found or v_g.created_at < now() - interval '1 day' then
    raise exception 'This game can no longer be posted. Games can be posted for a day after they''re played.' using errcode = '22023';
  end if;
  if v_g.posted_at is not null then
    raise exception 'This game is already on the scoreboard.' using errcode = '22023';
  end if;
  if v_g.user_id is not null and v_g.user_id <> v_uid then
    raise exception 'This game belongs to another player.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_g.answers) <> 10 then
    raise exception 'This game didn''t finish online, so it can''t be posted. It''s saved on this device.' using errcode = '22023';
  end if;

  v_seconds := case v_g.level when 'beginner' then 60 when 'intermediate' then 45 else 40 end;
  if p_team is not null then
    v_team := arcade.team_for('spot-the-bug', p_team, p_key);
  end if;

  for v_a in select e.value from jsonb_array_elements(v_g.answers) with ordinality as e(value, n) order by e.n
  loop
    -- The time left can't be more than the server's clock allows.
    v_cap := greatest(0, v_seconds * 10 - greatest(0, (v_a ->> 'ms')::integer - c_slack_ms) / 100);
    v_left := least((v_a ->> 'left')::integer, v_cap);
    -- An answer that arrives well after the clock ran out counts as no answer.
    v_late := (v_a ->> 'ms')::integer > v_seconds * 1000 + 2 * c_slack_ms;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_a ->> 'id',
      'line', case when v_late then null else v_a -> 'line' end,
      'type', case when v_late then null else v_a -> 'type' end,
      'left', v_left));

    select * into v_key from arcade.stb_answer_key k where k.id = v_a ->> 'id';
    if not v_late and (v_a ->> 'ms')::integer < c_fast_ms and v_a ->> 'type' = v_key.category
       and ((v_a ->> 'line')::integer = v_key.vulnerable_line or (v_a ->> 'line')::integer = any (v_key.accept_lines)) then
      v_fast := v_fast + 1;
    end if;
  end loop;

  v_res := arcade.stb_post_scores(v_uid, v_g.level, v_out, v_team, v_fast >= 3, v_fast);
  update arcade.stb_games set user_id = v_uid, posted_score = (v_res ->> 'id')::uuid, posted_at = now() where id = p_game;
  return v_res;
end
$$;

revoke all on function public.arcade_stb_start(text, text[]) from public;
revoke all on function public.arcade_stb_clock(uuid, integer, text) from public;
revoke all on function public.arcade_stb_answer(uuid, integer, integer, text, integer) from public;
revoke all on function public.arcade_stb_post(uuid, text, text) from public, anon;
grant execute on function public.arcade_stb_start(text, text[]) to anon, authenticated;
grant execute on function public.arcade_stb_clock(uuid, integer, text) to anon, authenticated;
grant execute on function public.arcade_stb_answer(uuid, integer, integer, text, integer) to anon, authenticated;
grant execute on function public.arcade_stb_post(uuid, text, text) to authenticated;

-- ---------- moderators see games held for a check ----------

create or replace function public.arcade_mod_scores(p_game text default 'spot-the-bug', p_view text default 'recent',
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
                   and o.created_at between sc.created_at - interval '1 hour' and sc.created_at + interval '1 hour') >= 6 then 'burst' end,
        case when sc.fast_rounds >= 3 then 'too-fast' end
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
