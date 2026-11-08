-- v0.7: synced game history and certificates for Spot the Bug.
--
-- History: a signed-in player's finished games, so Progress follows them
-- between devices. Only the player can read or add their own. Kept apart from
-- LureLens's own public.games table, which holds LureLens-shaped games.
--
-- Certificates: 80%+ accuracy at every level, in games posted online. The
-- server picks the qualifying games itself and issues the reference
-- (SB-XXXX-XXXX); anyone can check a reference at ?cert=SB-XXXX-XXXX.

create function arcade.clean_text(p_text text, p_max integer) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_text, ''),
    '[[:cntrl:]' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238)
      || chr(8294) || '-' || chr(8297) || chr(65279) || ']', '', 'g'),
    '\s+', ' ', 'g')), p_max), '')
$$;

-- ---------- history ----------

create table arcade.history (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('spot-the-bug')),
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  played_at timestamptz not null,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8192),
  created_at timestamptz not null default now(),
  primary key (user_id, game, id)
);
create index arcade_history_recent on arcade.history (user_id, game, played_at desc);
alter table arcade.history enable row level security;
revoke all on arcade.history from public, anon, authenticated;

create function public.arcade_history_push(p_game text, p_games jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_game jsonb;
  v_have integer;
  v_saved integer := 0;
  v_played timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to keep your games in your account.' using errcode = '22023';
  end if;
  if p_game is distinct from 'spot-the-bug' then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_games) is distinct from 'array' or jsonb_array_length(p_games) > 100 then
    raise exception 'Send up to 100 games at a time.' using errcode = '22023';
  end if;
  select count(*) into v_have from arcade.history h where h.user_id = v_uid and h.game = p_game;
  for v_game in select value from jsonb_array_elements(p_games) loop
    exit when v_have + v_saved >= 2000;   -- plenty for anyone, and keeps one account from filling the database
    if jsonb_typeof(v_game) is distinct from 'object' or coalesce(v_game ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,64}$'
       or pg_column_size(v_game) >= 8192 then
      continue;
    end if;
    begin
      v_played := (v_game ->> 'date')::timestamptz;
    exception when others then
      continue;
    end;
    if v_played > now() + interval '1 day' then v_played := now(); end if;
    insert into arcade.history (user_id, game, id, played_at, data)
    values (v_uid, p_game, v_game ->> 'id', v_played, v_game)
    on conflict do nothing;
    if found then v_saved := v_saved + 1; end if;
  end loop;
  return v_saved;
end
$$;

create function public.arcade_history_pull(p_game text, p_limit integer default 1000) returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select h.data from arcade.history h
  where h.user_id = auth.uid() and h.game = p_game
  order by h.played_at desc
  limit least(greatest(coalesce(p_limit, 1000), 1), 2000)
$$;

-- ---------- certificates ----------

create table arcade.certificates (
  reference text primary key check (reference ~ '^SB-[0-9A-Z]{4}-[0-9A-Z]{4}$'),
  game text not null default 'spot-the-bug' check (game in ('spot-the-bug')),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 48),
  beginner_id uuid not null references arcade.scores (id) on delete cascade,
  intermediate_id uuid not null references arcade.scores (id) on delete cascade,
  advanced_id uuid not null references arcade.scores (id) on delete cascade,
  completed_on timestamptz not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game, user_id)
);
alter table arcade.certificates enable row level security;
revoke all on arcade.certificates from public, anon, authenticated;

create function arcade.certificate_json(p_reference text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'reference', c.reference,
    'display_name', c.display_name,
    'username', p.username,
    'completed_on', c.completed_on,
    'levels', jsonb_build_object(
      'beginner', jsonb_build_object('accuracy', b.accuracy, 'score', b.score, 'played_at', b.created_at),
      'intermediate', jsonb_build_object('accuracy', i.accuracy, 'score', i.score, 'played_at', i.created_at),
      'advanced', jsonb_build_object('accuracy', a.accuracy, 'score', a.score, 'played_at', a.created_at)))
  from arcade.certificates c
  join arcade.scores b on b.id = c.beginner_id
  join arcade.scores i on i.id = c.intermediate_id
  join arcade.scores a on a.id = c.advanced_id
  join public.profiles p on p.id = c.user_id
  where c.reference = upper(btrim(coalesce(p_reference, ''))) and not c.hidden and not p.hidden
$$;

-- Issues (or renames) the signed-in player's certificate from their own posted games.
create function public.arcade_register_certificate(p_display_name text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_game constant text := 'spot-the-bug';
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_display text;
  v_b arcade.scores;
  v_i arcade.scores;
  v_a arcade.scores;
  v_missing text[] := '{}';
  v_existing arcade.certificates;
  v_ref text;
  v_bytes bytea;
begin
  if v_uid is null then
    raise exception 'Sign in to make your certificate checkable online.' using errcode = '22023';
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

  -- The first posted game at each level that reached 80%.
  select * into v_b from arcade.scores s where s.user_id = v_uid and s.game = c_game and s.level = 'beginner'
    and not s.hidden and s.accuracy >= 80 order by s.created_at limit 1;
  select * into v_i from arcade.scores s where s.user_id = v_uid and s.game = c_game and s.level = 'intermediate'
    and not s.hidden and s.accuracy >= 80 order by s.created_at limit 1;
  select * into v_a from arcade.scores s where s.user_id = v_uid and s.game = c_game and s.level = 'advanced'
    and not s.hidden and s.accuracy >= 80 order by s.created_at limit 1;
  if v_b.id is null then v_missing := v_missing || 'Beginner'::text; end if;
  if v_i.id is null then v_missing := v_missing || 'Intermediate'::text; end if;
  if v_a.id is null then v_missing := v_missing || 'Advanced'::text; end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Post a game with at least 80%% accuracy at % first. Games saved only on a device can''t be checked online.',
      array_to_string(v_missing, ', ') using errcode = '22023';
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

  insert into arcade.certificates (reference, game, user_id, display_name, beginner_id, intermediate_id, advanced_id, completed_on)
  values (v_ref, c_game, v_uid, v_display, v_b.id, v_i.id, v_a.id, greatest(v_b.created_at, v_i.created_at, v_a.created_at));
  return arcade.certificate_json(v_ref);
end
$$;

create function public.arcade_my_certificate() returns jsonb
language sql stable security definer set search_path = '' as $$
  select arcade.certificate_json(c.reference) from arcade.certificates c
  where c.user_id = auth.uid() and c.game = 'spot-the-bug'
$$;

create function public.arcade_check_certificate(p_reference text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select arcade.certificate_json(p_reference)
$$;

-- ---------- access ----------

revoke execute on all functions in schema arcade from public, anon, authenticated;
revoke execute on function public.arcade_history_push(text, jsonb) from public, anon;
revoke execute on function public.arcade_history_pull(text, integer) from public, anon;
revoke execute on function public.arcade_register_certificate(text) from public, anon;
revoke execute on function public.arcade_my_certificate() from public, anon;
revoke execute on function public.arcade_check_certificate(text) from public;
grant execute on function public.arcade_history_push(text, jsonb) to authenticated;
grant execute on function public.arcade_history_pull(text, integer) to authenticated;
grant execute on function public.arcade_register_certificate(text) to authenticated;
grant execute on function public.arcade_my_certificate() to authenticated;
grant execute on function public.arcade_check_certificate(text) to anon, authenticated;
