-- v0.6: posting needs a Th3 SpaceIO account. Accounts are shared with LureLens
-- (auth.users and public.profiles in the same project), so one username works
-- in both games. Sign in with an email code, or quick join with no email.
--
-- * Scores belong to an account; the board shows the account's current
--   username and leaves out players a moderator has hidden (profiles.hidden).
-- * The board can show this week or all time, one level or every level.
-- * Flood limits are per account now, so no network address is stored.
-- * New public scores send a small live signal on the public realtime channel
--   "arcade:spot-the-bug" (just the level, no names). Open boards reload.

drop index if exists arcade.arcade_scores_ip;
alter table arcade.scores drop column if exists ip_hash;
drop function if exists arcade.ip_hash();
drop table if exists arcade.settings;

alter table arcade.scores add column user_id uuid references auth.users (id) on delete cascade;
alter table arcade.scores alter column user_id set not null;   -- no scores had been posted yet
create index arcade_scores_user on arcade.scores (user_id, created_at desc);
create index arcade_scores_recent on arcade.scores (game, created_at desc) where not hidden;

-- ---------- board ----------

drop function if exists public.arcade_leaderboard(text, text, text, text, integer);
create function public.arcade_leaderboard(
  p_game text, p_level text default null, p_days integer default null,
  p_team text default null, p_key text default null, p_limit integer default 10
) returns table (
  rank integer, name text, level text, score integer, accuracy integer,
  best_streak integer, played_at timestamptz, is_me boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_team arcade.teams;
begin
  if p_team is not null then
    v_team := arcade.team_for(p_game, p_team, p_key);
  end if;
  return query
  with best as (
    select distinct on (s.user_id, s.level) s.user_id, s.level, s.score, s.accuracy, s.best_streak, s.created_at
    from arcade.scores s
    where s.game = p_game and not s.hidden
      and (p_level is null or s.level = p_level)
      and (p_days is null or s.created_at >= now() - make_interval(days => p_days))
      and s.team_id is not distinct from v_team.id
    order by s.user_id, s.level, s.score desc, s.accuracy desc, s.created_at asc
  )
  select (rank() over (order by b.score desc))::integer, p.username, b.level, b.score, b.accuracy,
         b.best_streak, b.created_at, coalesce(b.user_id = auth.uid(), false)
  from best b
  join public.profiles p on p.id = b.user_id
  where not p.hidden
  order by b.score desc, b.accuracy desc, b.created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end
$$;

-- ---------- posting ----------

create or replace function public.arcade_submit_spot_the_bug(
  p_name text, p_level text, p_answers jsonb, p_team text default null, p_key text default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_game constant text := 'spot-the-bug';
  c_rounds constant integer := 10;
  v_uid uuid := auth.uid();
  v_name text;
  v_team arcade.teams;
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
  -- p_name is ignored: games are filed under the account's username.
  if v_uid is null then
    raise exception 'Sign in or quick join to post to the online scoreboard.' using errcode = '22023';
  end if;
  select p.username into v_name from public.profiles p where p.id = v_uid;
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
  if p_team is not null then
    v_team := arcade.team_for(c_game, p_team, p_key);
  end if;

  -- Flood protection: per account, per team, and overall.
  if (select count(*) from arcade.scores s
      where s.user_id = v_uid and s.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many games posted in a short time. Try again in a few minutes.' using errcode = '22023';
  end if;
  if v_team.id is not null and (select count(*) from arcade.scores s
      where s.team_id = v_team.id and s.created_at > now() - interval '10 minutes') >= 300 then
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

  insert into arcade.scores (game, level, team_id, user_id, name, score, clean, lines, rounds, accuracy, best_streak, marks)
  values (c_game, p_level, v_team.id, v_uid, v_name, v_total, v_cleans, v_lines, c_rounds, v_accuracy, v_best, v_marks)
  returning id into v_id;

  -- Where this game lands among other players' best scores on the same board.
  select count(*) + 1 into v_rank
  from (
    select s.user_id, max(s.score) as best
    from arcade.scores s join public.profiles p on p.id = s.user_id
    where s.game = c_game and s.level = p_level and not s.hidden and not p.hidden
      and s.team_id is not distinct from v_team.id
    group by s.user_id
  ) b
  where b.best > v_total and b.user_id <> v_uid;

  select count(distinct s.user_id) into v_of
  from arcade.scores s join public.profiles p on p.id = s.user_id
  where s.game = c_game and s.level = p_level and not s.hidden and not p.hidden
    and s.team_id is not distinct from v_team.id;

  select max(s.score) into v_pb
  from arcade.scores s
  where s.game = c_game and s.level = p_level and not s.hidden
    and s.team_id is not distinct from v_team.id and s.user_id = v_uid;

  return jsonb_build_object(
    'id', v_id, 'name', v_name, 'score', v_total, 'clean', v_cleans, 'lines', v_lines,
    'accuracy', v_accuracy, 'best_streak', v_best, 'rank', v_rank, 'of', v_of,
    'personal_best', v_pb, 'team', v_team.name
  );
end
$$;

-- ---------- live signal ----------

create function arcade.announce_score() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.team_id is null and not new.hidden then
      perform realtime.send(jsonb_build_object('level', new.level), 'new_score', 'arcade:' || new.game, false);
    end if;
  exception when others then
    null; -- live updates must never stop a game from being posted
  end;
  return new;
end
$$;
create trigger arcade_scores_announce after insert on arcade.scores
  for each row execute function arcade.announce_score();

-- ---------- access ----------

revoke execute on all functions in schema arcade from public, anon, authenticated;
revoke execute on function public.arcade_leaderboard(text, text, integer, text, text, integer) from public;
grant execute on function public.arcade_leaderboard(text, text, integer, text, text, integer) to anon, authenticated;
-- Posting needs a signed-in (or quick-join) account, which is the "authenticated" role.
revoke execute on function public.arcade_submit_spot_the_bug(text, text, jsonb, text, text) from public, anon;
grant execute on function public.arcade_submit_spot_the_bug(text, text, jsonb, text, text) to authenticated;
