-- Spot the Bug v0.13: the certificate exam.
--
-- The certificate used to come from posted scoreboard games, whose snippets
-- (and answers) are in the public repository. Now it comes from an exam at
-- each level, built from a separate pool of snippets that is kept out of the
-- public repository: the content lives only in arcade.stb_exam_snippets,
-- loaded from a private repository (thespaceio/spot-the-bug-exam). This file
-- creates the tables and functions only; it contains no exam content.
--
-- How an exam runs:
--   * arcade_exam_start(level): signed in with a username; one attempt per
--     level per 24 hours (an unfinished attempt can be resumed for 2 hours);
--     the server picks 10 snippets (at least one mobile and one config).
--   * arcade_exam_round(exam, round): starts that round's clock and only then
--     sends its code and answer choices. Never the answer.
--   * arcade_stb_answer(...): the same answer call as ranked games.
--   * arcade_exam_finish(exam): scores on the server's clock and returns only
--     the accuracy and whether it passed (80%). Which rounds were wrong is
--     never sent, so the pool survives retakes.
--   * The certificate needs a passed exam at every level.

-- ---------- the private pool ----------

create table arcade.stb_exam_snippets (
  id text primary key check (id ~ '^EX[BIA]-[0-9]{3}$'),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  surface text not null check (surface in ('backend', 'mobile', 'config')),
  category text not null,
  vulnerable_line integer not null check (vulnerable_line > 0),
  accept_lines integer[] not null default '{}',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),   -- title, context, language, framework, file, code, choices
  explanation text,                                                  -- kept for a later teacher's review, never sent to players
  fix jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table arcade.stb_exam_snippets enable row level security;
revoke all on arcade.stb_exam_snippets from public, anon, authenticated;

-- ---------- exams are games of a second kind ----------

alter table arcade.stb_games add column if not exists kind text not null default 'ranked' check (kind in ('ranked', 'exam'));
alter table arcade.stb_games add column if not exists result jsonb;
create index if not exists stb_games_exams_idx on arcade.stb_games (user_id, level, created_at) where kind = 'exam';

-- Ranked games: the clock and the post refuse exams, and the clean-up keeps them.
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

  if v_uid is not null and (select count(*) from arcade.stb_games g
      where g.user_id = v_uid and g.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many games started in a short time. Try again in a few minutes.' using errcode = '22023';
  end if;
  if (select count(*) from arcade.stb_games g where g.created_at > now() - interval '1 minute') >= 300 then
    raise exception 'The game server is busy. Try again in a minute.' using errcode = '22023';
  end if;

  delete from arcade.stb_games g
  where g.id in (select g2.id from arcade.stb_games g2
                 where g2.kind = 'ranked' and g2.created_at < now() - interval '2 days' limit 500);

  insert into arcade.stb_games (user_id, level, snippet_ids) values (v_uid, p_level, p_snippets)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.arcade_stb_clock(p_game uuid, p_round integer, p_action text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g arcade.stb_games;
begin
  select * into v_g from arcade.stb_games g where g.id = p_game for update;
  if not found or v_g.kind <> 'ranked' or v_g.posted_at is not null or v_g.created_at < now() - interval '1 day' then
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

-- An exam answer is accepted for 2 hours after the exam starts; a ranked one for a day.
create or replace function public.arcade_stb_answer(p_game uuid, p_round integer, p_line integer, p_type text, p_left integer)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g arcade.stb_games;
  v_ms integer;
begin
  select * into v_g from arcade.stb_games g where g.id = p_game for update;
  if not found or v_g.posted_at is not null
     or v_g.created_at < now() - (case when v_g.kind = 'exam' then interval '2 hours' else interval '1 day' end) then
    raise exception 'This game is no longer open.' using errcode = '22023';
  end if;
  if v_g.user_id is not null and v_g.user_id is distinct from auth.uid() then
    raise exception 'This game belongs to another player.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_g.answers) >= p_round then return true; end if;
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

-- ---------- the exam ----------

create or replace function arcade.exam_seconds(p_level text) returns integer
language sql immutable set search_path = '' as $$
  select case p_level when 'beginner' then 60 when 'intermediate' then 45 else 40 end
$$;

create or replace function public.arcade_exam_start(p_level text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_open arcade.stb_games;
  v_last timestamptz;
  v_ids text[];
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in or quick join to take the certificate exam.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.username is not null) then
    raise exception 'Choose a username on your Account page first.' using errcode = '22023';
  end if;
  if p_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'Unknown level.' using errcode = '22023';
  end if;
  if exists (select 1 from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = p_level
             and (g.result ->> 'passed')::boolean) then
    raise exception 'You have already passed this level''s exam.' using errcode = '22023';
  end if;

  -- An unfinished attempt from the last 2 hours carries on where it stopped.
  select * into v_open from arcade.stb_games g
  where g.kind = 'exam' and g.user_id = v_uid and g.level = p_level and g.posted_at is null
    and g.created_at > now() - interval '2 hours'
  order by g.created_at desc limit 1;
  if found then
    return jsonb_build_object('exam', v_open.id, 'level', p_level, 'rounds', 10,
      'answered', jsonb_array_length(v_open.answers), 'seconds', arcade.exam_seconds(p_level), 'resumed', true);
  end if;

  select max(g.created_at) into v_last from arcade.stb_games g
  where g.kind = 'exam' and g.user_id = v_uid and g.level = p_level;
  if v_last is not null and v_last > now() - interval '24 hours' then
    raise exception 'You can take each level''s exam once a day. Your next attempt opens at %.',
      to_char((v_last + interval '24 hours') at time zone 'Africa/Lagos', 'HH24:MI "WAT on" FMDay FMDD FMMonth') using errcode = '22023';
  end if;

  -- 10 snippets from the private pool: at least one mobile and one config.
  v_ids := array(
    (select s.id from arcade.stb_exam_snippets s where s.active and s.level = p_level and s.surface = 'mobile' order by random() limit 1)
    union all
    (select s.id from arcade.stb_exam_snippets s where s.active and s.level = p_level and s.surface = 'config' order by random() limit 1));
  v_ids := v_ids || array(
    select s.id from arcade.stb_exam_snippets s
    where s.active and s.level = p_level and not (s.id = any (v_ids))
    order by random() limit 10 - cardinality(v_ids));
  select array_agg(x order by random()) into v_ids from unnest(v_ids) as x;
  if coalesce(cardinality(v_ids), 0) <> 10 then
    raise exception 'The % exam isn''t ready yet. Try again soon.', p_level using errcode = '22023';
  end if;

  insert into arcade.stb_games (user_id, level, snippet_ids, kind) values (v_uid, p_level, v_ids, 'exam')
  returning id into v_id;
  return jsonb_build_object('exam', v_id, 'level', p_level, 'rounds', 10, 'answered', 0,
    'seconds', arcade.exam_seconds(p_level), 'resumed', false);
end
$$;

-- Starts a round's clock (once) and sends its code and choices, never the answer.
create or replace function public.arcade_exam_round(p_exam uuid, p_round integer)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_g arcade.stb_games;
  v_s arcade.stb_exam_snippets;
  v_seconds integer;
  v_left integer;
begin
  select * into v_g from arcade.stb_games g where g.id = p_exam and g.kind = 'exam' for update;
  if not found or v_g.user_id is distinct from auth.uid() then
    raise exception 'This exam isn''t yours.' using errcode = '22023';
  end if;
  if v_g.posted_at is not null or v_g.created_at < now() - interval '2 hours' then
    raise exception 'This exam is no longer open.' using errcode = '22023';
  end if;
  if p_round < 1 or p_round > 10 or jsonb_array_length(v_g.answers) <> p_round - 1 then
    raise exception 'Rounds must be played in order.' using errcode = '22023';
  end if;
  if v_g.current_round <> p_round then
    update arcade.stb_games set current_round = p_round, round_started_at = now(), paused_at = null, paused_ms = 0
    where id = p_exam returning * into v_g;
  end if;

  select * into v_s from arcade.stb_exam_snippets s where s.id = v_g.snippet_ids[p_round];
  v_seconds := arcade.exam_seconds(v_g.level);
  v_left := greatest(0, v_seconds * 1000 - (extract(epoch from now() - v_g.round_started_at) * 1000)::integer);
  return jsonb_build_object(
    'round', p_round, 'rounds', 10, 'seconds', v_seconds, 'left_ms', v_left, 'surface', v_s.surface,
    'snippet', v_s.payload - 'choices',
    'choices', (select jsonb_agg(c order by random()) from jsonb_array_elements(v_s.payload -> 'choices') c));
end
$$;

-- Scores the exam on the server's clock. Returns only the accuracy and the verdict.
create or replace function public.arcade_exam_finish(p_exam uuid)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_slack_ms constant integer := 3000;
  c_fast_ms constant integer := 2000;
  v_g arcade.stb_games;
  v_a jsonb;
  v_s arcade.stb_exam_snippets;
  v_seconds integer;
  v_line integer;
  v_clean integer := 0;
  v_fast integer := 0;
  v_ok boolean;
  v_accuracy integer;
  v_result jsonb;
begin
  select * into v_g from arcade.stb_games g where g.id = p_exam and g.kind = 'exam' for update;
  if not found or v_g.user_id is distinct from auth.uid() then
    raise exception 'This exam isn''t yours.' using errcode = '22023';
  end if;
  if v_g.posted_at is not null then
    return v_g.result;
  end if;
  if jsonb_array_length(v_g.answers) <> 10 then
    raise exception 'Answer all 10 rounds to finish the exam.' using errcode = '22023';
  end if;

  v_seconds := arcade.exam_seconds(v_g.level);
  for v_a in select e.value from jsonb_array_elements(v_g.answers) e
  loop
    select * into v_s from arcade.stb_exam_snippets s where s.id = v_a ->> 'id';
    v_line := case when (v_a ->> 'line') ~ '^[0-9]{1,3}$' then (v_a ->> 'line')::integer end;
    v_ok := (v_a ->> 'ms')::integer <= v_seconds * 1000 + 2 * c_slack_ms
      and v_a ->> 'type' = v_s.category
      and (v_line = v_s.vulnerable_line or v_line = any (v_s.accept_lines));
    if coalesce(v_ok, false) then
      v_clean := v_clean + 1;
      if (v_a ->> 'ms')::integer < c_fast_ms then v_fast := v_fast + 1; end if;
    end if;
  end loop;

  v_accuracy := v_clean * 10;
  v_result := jsonb_build_object(
    'level', v_g.level, 'clean', v_clean, 'accuracy', v_accuracy,
    'passed', v_accuracy >= 80 and v_fast < 3,
    'held', v_fast >= 3,
    'finished_at', now(),
    'next_attempt_at', v_g.created_at + interval '24 hours');
  update arcade.stb_games set posted_at = now(), result = v_result where id = p_exam;
  return v_result;
end
$$;

-- Where the signed-in player stands at each level.
create or replace function public.arcade_exam_status()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_level text;
  v_pass arcade.stb_games;
  v_last arcade.stb_games;
  v_open arcade.stb_games;
begin
  foreach v_level in array array['beginner', 'intermediate', 'advanced'] loop
    v_pass := null; v_last := null; v_open := null;
    if v_uid is not null then
      select * into v_pass from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = v_level
        and (g.result ->> 'passed')::boolean order by g.posted_at limit 1;
      select * into v_last from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = v_level
        order by g.created_at desc limit 1;
      select * into v_open from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = v_level
        and g.posted_at is null and g.created_at > now() - interval '2 hours' order by g.created_at desc limit 1;
    end if;
    v_out := v_out || jsonb_build_object(v_level, jsonb_build_object(
      'ready', (select count(*) from arcade.stb_exam_snippets s where s.active and s.level = v_level) >= 10,
      'passed', v_pass.id is not null,
      'accuracy', (v_pass.result ->> 'accuracy')::integer,
      'passed_at', v_pass.posted_at,
      'last_accuracy', (v_last.result ->> 'accuracy')::integer,
      'last_at', v_last.created_at,
      'next_attempt_at', case when v_pass.id is null and v_open.id is null and v_last.created_at > now() - interval '24 hours'
                              then v_last.created_at + interval '24 hours' end,
      'open', case when v_open.id is not null then jsonb_build_object('exam', v_open.id, 'answered', jsonb_array_length(v_open.answers)) end));
  end loop;
  return v_out;
end
$$;

-- ---------- certificates come from passed exams ----------

-- No certificates had been issued under the old rule, so the links to
-- scoreboard games are replaced outright.
alter table arcade.certificates drop column if exists beginner_id;
alter table arcade.certificates drop column if exists intermediate_id;
alter table arcade.certificates drop column if exists advanced_id;
alter table arcade.certificates add column beginner_exam uuid not null references arcade.stb_games (id);
alter table arcade.certificates add column intermediate_exam uuid not null references arcade.stb_games (id);
alter table arcade.certificates add column advanced_exam uuid not null references arcade.stb_games (id);

create or replace function arcade.certificate_json(p_reference text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'reference', c.reference,
    'display_name', c.display_name,
    'username', p.username,
    'completed_on', c.completed_on,
    'exam', true,
    'levels', jsonb_build_object(
      'beginner', jsonb_build_object('accuracy', (b.result ->> 'accuracy')::integer, 'played_at', b.posted_at),
      'intermediate', jsonb_build_object('accuracy', (i.result ->> 'accuracy')::integer, 'played_at', i.posted_at),
      'advanced', jsonb_build_object('accuracy', (a.result ->> 'accuracy')::integer, 'played_at', a.posted_at)))
  from arcade.certificates c
  join arcade.stb_games b on b.id = c.beginner_exam
  join arcade.stb_games i on i.id = c.intermediate_exam
  join arcade.stb_games a on a.id = c.advanced_exam
  join public.profiles p on p.id = c.user_id
  where c.reference = upper(btrim(coalesce(p_reference, ''))) and not c.hidden and not p.hidden
$$;

create or replace function public.arcade_register_certificate(p_display_name text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_game constant text := 'spot-the-bug';
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_display text;
  v_b arcade.stb_games;
  v_i arcade.stb_games;
  v_a arcade.stb_games;
  v_missing text[] := '{}';
  v_existing arcade.certificates;
  v_ref text;
  v_bytes bytea;
begin
  if v_uid is null then
    raise exception 'Sign in to get your certificate.' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles p where p.id = v_uid;
  if v_profile.id is null then
    raise exception 'Choose a username on your Account page first.' using errcode = '22023';
  end if;
  v_display := coalesce(arcade.clean_text(p_display_name, 48), arcade.clean_text(v_profile.full_name, 48), v_profile.username);

  select * into v_existing from arcade.certificates c where c.game = c_game and c.user_id = v_uid;
  if found then
    update arcade.certificates c set display_name = v_display where c.reference = v_existing.reference;
    return arcade.certificate_json(v_existing.reference);
  end if;

  -- The first passed exam at each level.
  select * into v_b from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = 'beginner'
    and (g.result ->> 'passed')::boolean order by g.posted_at limit 1;
  select * into v_i from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = 'intermediate'
    and (g.result ->> 'passed')::boolean order by g.posted_at limit 1;
  select * into v_a from arcade.stb_games g where g.kind = 'exam' and g.user_id = v_uid and g.level = 'advanced'
    and (g.result ->> 'passed')::boolean order by g.posted_at limit 1;
  if v_b.id is null then v_missing := v_missing || 'Beginner'::text; end if;
  if v_i.id is null then v_missing := v_missing || 'Intermediate'::text; end if;
  if v_a.id is null then v_missing := v_missing || 'Advanced'::text; end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Pass the certificate exam at % first.', array_to_string(v_missing, ', ') using errcode = '22023';
  end if;

  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_ref := 'SB-';
    for n in 0..7 loop
      if n = 4 then v_ref := v_ref || '-'; end if;
      v_ref := v_ref || substr(c_alphabet, (get_byte(v_bytes, n) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from arcade.certificates c where c.reference = v_ref);
  end loop;

  insert into arcade.certificates (reference, game, user_id, display_name, beginner_exam, intermediate_exam, advanced_exam, completed_on)
  values (v_ref, c_game, v_uid, v_display, v_b.id, v_i.id, v_a.id, greatest(v_b.posted_at, v_i.posted_at, v_a.posted_at));
  return arcade.certificate_json(v_ref);
end
$$;

-- Ranked posts refuse exams.
create or replace function public.arcade_stb_post(p_game uuid, p_team text default null, p_key text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_slack_ms constant integer := 3000;
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
  select * into v_g from arcade.stb_games g where g.id = p_game and g.kind = 'ranked' for update;
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
    v_cap := greatest(0, v_seconds * 10 - greatest(0, (v_a ->> 'ms')::integer - c_slack_ms) / 100);
    v_left := least((v_a ->> 'left')::integer, v_cap);
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

revoke all on function arcade.exam_seconds(text) from public, anon, authenticated;
revoke all on function public.arcade_exam_start(text) from public, anon;
revoke all on function public.arcade_exam_round(uuid, integer) from public, anon;
revoke all on function public.arcade_exam_finish(uuid) from public, anon;
revoke all on function public.arcade_exam_status() from public, anon;
grant execute on function public.arcade_exam_start(text) to authenticated;
grant execute on function public.arcade_exam_round(uuid, integer) to authenticated;
grant execute on function public.arcade_exam_finish(uuid) to authenticated;
grant execute on function public.arcade_exam_status() to authenticated;
