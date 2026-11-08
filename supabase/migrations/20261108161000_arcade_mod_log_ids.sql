-- Moderation log: game ids are stored in lower case (as Postgres prints uuids),
-- certificate references and class codes in upper case.
create or replace function public.arcade_mod_set_hidden(p_kind text, p_id text, p_hidden boolean, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hidden boolean := coalesce(p_hidden, true);
  v_id text := case when p_kind = 'score' then lower(btrim(coalesce(p_id, ''))) else upper(btrim(coalesce(p_id, ''))) end;
  v_player uuid;
  v_game text := 'spot-the-bug';
begin
  perform arcade.require_moderator();
  if p_kind = 'score' then
    if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Unknown game.' using errcode = '22023'; end if;
    update arcade.scores s set hidden = v_hidden where s.id = v_id::uuid returning s.user_id, s.game into v_player, v_game;
  elsif p_kind = 'certificate' then
    update arcade.certificates c set hidden = v_hidden where c.reference = v_id returning c.user_id, c.game into v_player, v_game;
  elsif p_kind = 'class' then
    update arcade.classes c set hidden = v_hidden where c.code = v_id returning c.owner, c.game into v_player, v_game;
  else
    raise exception 'Unknown item.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'That item no longer exists.' using errcode = '22023';
  end if;
  insert into arcade.moderation_log (moderator, game, action, target_kind, target_id, player_id, reason)
  values (auth.uid(), v_game, case when v_hidden then 'hide' else 'show' end, p_kind, v_id, v_player, arcade.clean_text(p_reason, 200));
  return jsonb_build_object('kind', p_kind, 'id', v_id, 'hidden', v_hidden);
end
$$;
revoke all on function public.arcade_mod_set_hidden(text, text, boolean, text) from public, anon;
grant execute on function public.arcade_mod_set_hidden(text, text, boolean, text) to authenticated;
