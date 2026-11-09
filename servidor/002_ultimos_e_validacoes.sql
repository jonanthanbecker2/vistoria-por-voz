-- =====================================================================
-- Vistoria por Voz — 002: último KM e última vistoria por frota,
-- e validações cruzadas no servidor (valem entre todos os celulares).
-- Executar no SQL Editor do Supabase DEPOIS do 001. Pode rodar de novo.
-- =====================================================================

-- O app baixa esta lista junto com o cadastro: só frota, KM e datas (nenhum dado pessoal).
create or replace function public.ultimos_por_frota()
returns table (frota text, ultimo_km integer, km_em timestamptz, km_vistoria_id text,
               ultima_vistoria_em timestamptz, ultima_vistoria_id text)
language sql
stable
security definer
set search_path = public
as $$
  with ult as (
    select distinct on (v.frota) v.frota, v.hora_inicio, v.id
    from vistorias v
    where v.frota is not null
    order by v.frota, v.hora_inicio desc
  ), km as (
    select distinct on (v.frota) v.frota, v.quilometragem, v.hora_inicio, v.id
    from vistorias v
    where v.frota is not null and v.quilometragem is not null
    order by v.frota, v.hora_inicio desc
  )
  select ult.frota, km.quilometragem, km.hora_inicio, km.id, ult.hora_inicio, ult.id
  from ult left join km on km.frota = ult.frota;
$$;
revoke all on function public.ultimos_por_frota() from public;
grant execute on function public.ultimos_por_frota() to anon, authenticated;

-- Recebimento com as validações cruzadas: se o celular não sabia de uma vistoria
-- feita em outro aparelho, o servidor registra o alerta ao receber.
create or replace function public.receber_vistoria(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text := p->>'id';
  v_lacre   text := p#>>'{integridade,hash}';
  v_ex      text;
  v_km      integer := nullif(p->>'quilometragem', '')::integer;
  v_inicio  timestamptz := (p->>'hora_inicio')::timestamptz;
  v_km_ant  integer;
  v_id_ant  text;
  v_rep     text;
begin
  if v_id is null or length(v_id) > 64 then raise exception 'vistoria sem identificação válida'; end if;
  if v_lacre is null or v_lacre !~ '^[0-9a-f]{64}$' then raise exception 'vistoria sem lacre'; end if;
  if p->>'hora_fim' is null then raise exception 'vistoria não concluída'; end if;
  if pg_column_size(p) > 300000 then raise exception 'vistoria grande demais'; end if;

  select lacre into v_ex from vistorias where id = v_id;
  if found then
    if v_ex = v_lacre then return jsonb_build_object('status', 'ja_recebida', 'id', v_id); end if;
    raise exception 'vistoria % já recebida com outro lacre', v_id;
  end if;

  insert into vistorias (id, motorista, frota, frota_fora_cadastro, quilometragem, hora_inicio, hora_fim,
    duracao_total_seg, tipo_encerramento, motivo_encerramento, retomada, relato_livre, localizacao_status,
    versao_app, versao_checklist, dispositivo, lacre, lacre_anterior, registro)
  values (v_id, p->>'motorista', p->>'frota', coalesce((p->>'frota_nao_cadastrada')::boolean, false),
    v_km, v_inicio, (p->>'hora_fim')::timestamptz,
    nullif(p->>'duracao_total_seg', '')::numeric, p->>'tipo_encerramento', p->>'motivo_encerramento',
    coalesce((p->>'retomada')::boolean, false), p->>'relato_livre', p#>>'{localizacao,status}',
    p->>'versao_app', p->>'versao_checklist', p->>'dispositivo', v_lacre, p#>>'{integridade,hash_anterior}', p);

  insert into respostas (vistoria_id, ordem, item_id, item, resposta, nivel, acao, sinal, transcricao, tentativas_voz,
    t_anuncio, t_prontidao, t_resposta, duracao_inspecao_seg, duracao_resposta_seg)
  select v_id, (r->>'ordem')::integer, r->>'item_id', r->>'rotulo', r->>'resposta', r->>'nivel', r->>'acao', r->>'sinal',
    r->>'transcricao', nullif(r->>'tentativas_voz', '')::integer,
    nullif(r->>'t_anuncio', '')::timestamptz, nullif(r->>'t_prontidao', '')::timestamptz, nullif(r->>'t_resposta', '')::timestamptz,
    nullif(r->>'duracao_inspecao_seg', '')::numeric, nullif(r->>'duracao_resposta_seg', '')::numeric
  from jsonb_array_elements(coalesce(p->'respostas', '[]'::jsonb)) r
  on conflict do nothing;

  insert into pendencias (vistoria_id, item_id, item, nivel, acao, detalhe)
  select v_id, x->>'item_id', x->>'rotulo', x->>'nivel', x->>'acao', x->>'detalhe'
  from jsonb_array_elements(coalesce(p->'pendencias', '[]'::jsonb)) x
  on conflict do nothing;

  insert into alertas (vistoria_id, tipo, dados)
  select v_id, a->>'tipo', a from jsonb_array_elements(coalesce(p->'alertas', '[]'::jsonb)) a;

  insert into complementos (hash, vistoria_id, em, autor, texto)
  select c->>'hash', v_id, (c->>'em')::timestamptz, c->>'autor', c->>'texto'
  from jsonb_array_elements(coalesce(p->'complementos', '[]'::jsonb)) c
  on conflict do nothing;

  -- ---------- validações cruzadas (todas as vistorias já recebidas) ----------
  if p->>'frota' is not null then
    -- KM menor que a leitura anterior desta frota
    select v.quilometragem, v.id into v_km_ant, v_id_ant
      from vistorias v
     where v.frota = p->>'frota' and v.id <> v_id and v.quilometragem is not null and v.hora_inicio < v_inicio
     order by v.hora_inicio desc limit 1;
    if v_km is not null and v_km_ant is not null and v_km < v_km_ant
       and not exists (select 1 from jsonb_array_elements(coalesce(p->'alertas', '[]'::jsonb)) a where a->>'tipo' = 'km_menor') then
      insert into alertas (vistoria_id, tipo, dados)
      values (v_id, 'km_menor', jsonb_build_object('origem', 'servidor', 'km', v_km, 'km_anterior', v_km_ant, 'vistoria_anterior', v_id_ant));
    end if;
    -- mesma frota vistoriada no mesmo dia (horário de Brasília)
    select v.id into v_rep
      from vistorias v
     where v.frota = p->>'frota' and v.id <> v_id
       and (v.hora_inicio at time zone 'America/Sao_Paulo')::date = (v_inicio at time zone 'America/Sao_Paulo')::date
     order by v.hora_inicio limit 1;
    if v_rep is not null
       and not exists (select 1 from jsonb_array_elements(coalesce(p->'alertas', '[]'::jsonb)) a where a->>'tipo' = 'frota_repetida_dia') then
      insert into alertas (vistoria_id, tipo, dados)
      values (v_id, 'frota_repetida_dia', jsonb_build_object('origem', 'servidor', 'vistoria_anterior', v_rep));
    end if;
  end if;

  return jsonb_build_object('status', 'recebida', 'id', v_id);
end $$;

revoke all on function public.receber_vistoria(jsonb) from public;
grant execute on function public.receber_vistoria(jsonb) to anon, authenticated;
