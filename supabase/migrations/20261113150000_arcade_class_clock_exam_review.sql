-- Spot the Bug v0.15: class games on the server's clock, and exam review.
--
-- Class games used to send their answers and time left at the end, and the
-- server believed the time. Now a class game is recorded like a ranked game:
-- arcade_class_start opens it (the class's snippets, in the class's order),
-- arcade_stb_clock / arcade_stb_answer record each round, and
-- arcade_class_submit_game scores it with the same caps as the scoreboard.
-- The old arcade_class_submit is retired once the new game is live.
--
-- Exams held for answering too fast can now be reviewed: moderators list them
-- with arcade_mod_exams and accept one with arcade_mod_exam_accept (logged).

alter table arcade.stb_games drop constraint if exists stb_games_kind_check;
alter table arcade.stb_games add constraint stb_games_kind_check check (kind in ('ranked', 'exam', 'class'));
alter table arcade.stb_games add column if not exists class_code text;

alter table arcade.moderation_log drop constraint if exists moderation_log_target_kind_check;
alter table arcade.moderation_log add constraint moderation_log_target_kind_check check (target_kind in ('score', 'certificate', 'class', 'exam'));
alter table arcade.moderation_log drop constraint if exists moderation_log_action_check;
alter table arcade.moderation_log add constraint moderation_log_action_check check (action in ('hide', 'show', 'accept'));

-- ---------- class games ----------

create or replace function public.arcade_class_start(p_code text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_class arcade.classes;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in or quick join to play the class game.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.username is not null) then
    raise exception 'Choose a username on your Account page first.' using errcode = '22023';
  end if;
  select * into v_class from arcade.classes c where c.code = upper(btrim(coalesce(p_code, ''))) and not c.hidden;
  if v_class.code is null then
    raise exception 'That class code doesn''t exist.' using errcode = '22023';
  end if;
  if v_class.closed or v_class.open_until <= now() then
    raise exception 'This class has closed.' using errcode = '22023';
  end if;
  if exists (select 1 from arcade.class_results r where r.class_code = v_class.code and r.user_id = v_uid) then
    raise exception 'You''ve already played this class game. Your first game is the one that counts.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.stb_games g where g.user_id = v_uid and g.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many games started in a short time. Try again in a few minutes.' using errcode = '22023';
  end if;

  insert into arcade.stb_games (user_id, level, snippet_ids, kind, class_code)
  values (v_uid, v_class.level, v_class.snippet_ids, 'class', v_class.code)
  returning id into v_id;
  return v_id;
end
$$;

-- The clock works for ranked and class games (exams have their own round call).
create or replace function public.arcade_stb_clock(p_game uuid, p_round integer, p_action text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g arcade.stb_games;
begin
  select * into v_g from arcade.stb_games g where g.id = p_game for update;
  if not found or v_g.kind not in ('ranked', 'class') or v_g.posted_at is not null or v_g.created_at < now() - interval '1 day' then
    raise exception 'This game is no longer open.' using errcode = '22023';
  end if;
  if v_g.user_id is not null and v_g.user_id is distinct from auth.uid() then
    raise exception 'This game belongs to another player.' using errcode = '22023';
  end if;

  if p_action = 'start' then
    if p_round = v_g.current_round then return true; end if;
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

create or replace function public.arcade_class_submit_game(p_game uuid)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_slack_ms constant integer := 3000;
  v_uid uuid := auth.uid();
  v_name text;
  v_g arcade.stb_games;
  v_class arcade.classes;
  v_seconds integer;
  v_a jsonb;
  v_out jsonb := '[]'::jsonb;
  v_late boolean;
  v_s jsonb;
  v_rank integer;
  v_of integer;
begin
  if v_uid is null then
    raise exception 'Sign in or quick join to post to the class board.' using errcode = '22023';
  end if;
  select p.username into v_name from public.profiles p where p.id = v_uid;
  select * into v_g from arcade.stb_games g where g.id = p_game and g.kind = 'class' for update;
  if not found or v_g.user_id is distinct from v_uid then
    raise exception 'This class game isn''t yours.' using errcode = '22023';
  end if;
  if v_g.posted_at is not null then
    raise exception 'This game is already on the class board.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_g.answers) <> 10 then
    raise exception 'This game didn''t finish online, so it can''t go on the class board.' using errcode = '22023';
  end if;
  select * into v_class from arcade.classes c where c.code = v_g.class_code and not c.hidden;
  if v_class.code is null then
    raise exception 'That class no longer exists.' using errcode = '22023';
  end if;
  if exists (select 1 from arcade.class_results r where r.class_code = v_class.code and r.user_id = v_uid) then
    raise exception 'You''ve already played this class game. Your first game is the one that counts.' using errcode = '22023';
  end if;

  -- Same rules as the scoreboard: time left can't beat the server's clock, and late answers don't count.
  v_seconds := case v_g.level when 'beginner' then 60 when 'intermediate' then 45 else 40 end;
  for v_a in select e.value from jsonb_array_elements(v_g.answers) with ordinality as e(value, n) order by e.n
  loop
    v_late := (v_a ->> 'ms')::integer > v_seconds * 1000 + 2 * c_slack_ms;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_a ->> 'id',
      'line', case when v_late then null else v_a -> 'line' end,
      'type', case when v_late then null else v_a -> 'type' end,
      'left', least((v_a ->> 'left')::integer, greatest(0, v_seconds * 10 - greatest(0, (v_a ->> 'ms')::integer - c_slack_ms) / 100))));
  end loop;

  v_s := arcade.stb_score(v_class.level, v_out, v_class.snippet_ids);
  insert into arcade.class_results (class_code, user_id, name, score, clean, lines, accuracy, best_streak, rounds)
  values (v_class.code, v_uid, v_name, (v_s ->> 'score')::integer, (v_s ->> 'clean')::integer, (v_s ->> 'lines')::integer,
          (v_s ->> 'accuracy')::integer, (v_s ->> 'best_streak')::integer, v_s -> 'rounds');
  update arcade.stb_games set posted_at = now() where id = p_game;

  select count(*) + 1 into v_rank from arcade.class_results r join public.profiles p on p.id = r.user_id
  where r.class_code = v_class.code and not r.hidden and not p.hidden and r.score > (v_s ->> 'score')::integer;
  select count(*) into v_of from arcade.class_results r join public.profiles p on p.id = r.user_id
  where r.class_code = v_class.code and not r.hidden and not p.hidden;

  return jsonb_build_object('name', v_name, 'score', (v_s ->> 'score')::integer, 'clean', (v_s ->> 'clean')::integer,
    'accuracy', (v_s ->> 'accuracy')::integer, 'best_streak', (v_s ->> 'best_streak')::integer,
    'rank', v_rank, 'of', v_of, 'class', v_class.name);
end
$$;

-- ---------- exam review ----------

create or replace function public.arcade_mod_exams(p_view text default 'held', p_limit integer default 100)
returns table (id uuid, player_id uuid, username text, level text, accuracy integer, clean integer,
               passed boolean, held boolean, accepted boolean, started_at timestamptz, finished_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform arcade.require_moderator();
  return query
  select g.id, g.user_id, p.username, g.level, (g.result ->> 'accuracy')::integer, (g.result ->> 'clean')::integer,
         coalesce((g.result ->> 'passed')::boolean, false), coalesce((g.result ->> 'held')::boolean, false),
         coalesce((g.result ->> 'accepted')::boolean, false), g.created_at, g.posted_at
  from arcade.stb_games g
  left join public.profiles p on p.id = g.user_id
  where g.kind = 'exam' and g.posted_at is not null
    and (coalesce(p_view, 'held') <> 'held' or (g.result ->> 'held')::boolean)
  order by g.posted_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
end
$$;

-- Accept an exam that was held for answering too fast. It then counts as passed
-- if its accuracy was 80% or more.
create or replace function public.arcade_mod_exam_accept(p_exam uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_g arcade.stb_games;
begin
  perform arcade.require_moderator();
  select * into v_g from arcade.stb_games g where g.id = p_exam and g.kind = 'exam' for update;
  if not found or v_g.posted_at is null then
    raise exception 'No finished exam with that ID.' using errcode = '22023';
  end if;
  if not coalesce((v_g.result ->> 'held')::boolean, false) then
    raise exception 'This exam wasn''t held, so there''s nothing to accept.' using errcode = '22023';
  end if;
  update arcade.stb_games
  set result = result || jsonb_build_object('held', false, 'accepted', true,
                                            'passed', coalesce((result ->> 'accuracy')::integer, 0) >= 80)
  where id = p_exam returning * into v_g;
  insert into arcade.moderation_log (moderator, game, action, target_kind, target_id, player_id, reason)
  values (auth.uid(), 'spot-the-bug', 'accept', 'exam', p_exam::text, v_g.user_id, arcade.clean_text(p_reason, 200));
  return v_g.result;
end
$$;

revoke all on function public.arcade_class_start(text) from public, anon;
revoke all on function public.arcade_class_submit_game(uuid) from public, anon;
revoke all on function public.arcade_mod_exams(text, integer) from public, anon;
revoke all on function public.arcade_mod_exam_accept(uuid, text) from public, anon;
grant execute on function public.arcade_class_start(text) to authenticated;
grant execute on function public.arcade_class_submit_game(uuid) to authenticated;
grant execute on function public.arcade_mod_exams(text, integer) to authenticated;
grant execute on function public.arcade_mod_exam_accept(uuid, text) to authenticated;

-- Applied after v0.15.0 went live: the old way of posting a class game is retired.
create or replace function public.arcade_class_submit(p_code text, p_answers jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  raise exception 'This copy of Spot the Bug is out of date. Reload the page, then play the class game again.' using errcode = '22023';
end
$$;
