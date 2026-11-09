-- =====================================================================
-- Vistoria por Voz — estrutura do banco (Supabase / PostgreSQL)
-- Executar uma vez no SQL Editor do Supabase.
--
-- Princípios:
--   1. O app (chave publicável = papel "anon") NÃO acessa as tabelas de
--      vistoria diretamente: só chama as funções receber_vistoria e
--      receber_complemento, e só LÊ veículos e documentos.
--   2. Imutabilidade: vistorias, respostas, alertas, pendências e
--      complementos não podem ser alterados nem apagados por ninguém
--      que use a API (gatilhos bloqueiam UPDATE e DELETE).
--   3. Envio idempotente: a mesma vistoria enviada duas vezes (reenvio
--      por falha de rede) é gravada uma única vez.
--   4. SQL padrão PostgreSQL, para migrar ao servidor da empresa.
--   5. Dados pessoais (CNH) só são lidos pelo painel com login; o app não tem acesso a motoristas.
-- =====================================================================

-- ---------- cadastro (mantido pela central) ----------
create table if not exists public.veiculos (
  frota            text primary key,
  marca            text,
  modelo           text,
  tipo             text,
  ano              text,
  centro_coletas   text,
  ativo            boolean not null default true,
  atualizado_em    timestamptz not null default now()
);

create table if not exists public.documentos_veiculo (
  id               bigint generated always as identity primary key,
  frota            text not null references public.veiculos(frota),
  documento        text not null check (documento in
                     ('crlv','civ','cipp','tacografo','ctf','atipp','lic_estadual','lic_municipal')),
  numero           text,
  vencimento       date not null,
  uf               text,          -- licença estadual
  municipio        text,          -- licença municipal
  atualizado_em    timestamptz not null default now(),
  atualizado_por   text
);
create index if not exists documentos_veiculo_frota_idx on public.documentos_veiculo (frota);

create table if not exists public.motoristas (
  matricula        text primary key,
  nome             text not null,
  centro_coletas   text,
  cnh_numero       text,          -- número de registro da CNH, só dígitos
  cnh_validade     date,          -- base para o alerta de CNH vencida ou a vencer
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now()
);
-- se a tabela já existia (script rodado antes desta versão), inclui os campos da CNH
alter table public.motoristas add column if not exists cnh_numero text;
alter table public.motoristas add column if not exists cnh_validade date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'motoristas_cnh_numero_digitos') then
    alter table public.motoristas add constraint motoristas_cnh_numero_digitos check (cnh_numero ~ '^[0-9]{9,11}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'motoristas_cnh_numero_unico') then
    alter table public.motoristas add constraint motoristas_cnh_numero_unico unique (cnh_numero);
  end if;
end $$;

-- ---------- vistorias (somente inclusão) ----------
create table if not exists public.vistorias (
  id                  text primary key,                 -- gerado no celular
  recebido_em         timestamptz not null default now(), -- hora do servidor (não depende do relógio do celular)
  motorista           text,
  frota               text,
  frota_fora_cadastro boolean,
  quilometragem       integer,
  hora_inicio         timestamptz,
  hora_fim            timestamptz,
  duracao_total_seg   numeric,
  tipo_encerramento   text,
  motivo_encerramento text,
  retomada            boolean,
  relato_livre        text,
  localizacao_status  text,
  versao_app          text,
  versao_checklist    text,
  dispositivo         text,
  lacre               text not null,
  lacre_anterior      text,
  registro            jsonb not null                    -- vistoria completa, exatamente como lacrada no celular
);
create index if not exists vistorias_frota_idx on public.vistorias (frota, hora_inicio desc);
create index if not exists vistorias_inicio_idx on public.vistorias (hora_inicio desc);

create table if not exists public.respostas (
  vistoria_id          text not null references public.vistorias(id),
  ordem                integer,
  item_id              text not null,
  item                 text,
  resposta             text,
  nivel                text,
  acao                 text,
  sinal                text,
  transcricao          text,
  tentativas_voz       integer,
  t_anuncio            timestamptz,
  t_prontidao          timestamptz,
  t_resposta           timestamptz,
  duracao_inspecao_seg numeric,
  duracao_resposta_seg numeric,
  primary key (vistoria_id, item_id)
);

create table if not exists public.pendencias (
  vistoria_id  text not null references public.vistorias(id),
  item_id      text not null,
  item         text,
  nivel        text,
  acao         text,
  detalhe      text,
  primary key (vistoria_id, item_id)
);
create index if not exists pendencias_acao_idx on public.pendencias (acao);

create table if not exists public.alertas (
  id           bigint generated always as identity primary key,
  vistoria_id  text not null references public.vistorias(id),
  tipo         text not null,
  dados        jsonb
);

create table if not exists public.complementos (
  hash         text primary key,                        -- lacre do complemento (encadeado)
  vistoria_id  text not null references public.vistorias(id),
  em           timestamptz not null,
  autor        text,
  texto        text not null,
  recebido_em  timestamptz not null default now()
);

-- ---------- imutabilidade ----------
create or replace function public.bloquear_alteracao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registro imutável: % não é permitido em %. Use um complemento.', tg_op, tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vistorias','respostas','pendencias','alertas','complementos'] loop
    execute format('drop trigger if exists %I_imutavel on public.%I', t, t);
    execute format('create trigger %I_imutavel before update or delete on public.%I
                    for each row execute function public.bloquear_alteracao()', t, t);
  end loop;
end $$;

-- ---------- acesso (RLS) ----------
alter table public.veiculos           enable row level security;
alter table public.documentos_veiculo enable row level security;
alter table public.motoristas         enable row level security;
alter table public.vistorias          enable row level security;
alter table public.respostas          enable row level security;
alter table public.pendencias         enable row level security;
alter table public.alertas            enable row level security;
alter table public.complementos       enable row level security;

-- começa fechado para o app e para usuários logados
revoke all on public.veiculos, public.documentos_veiculo, public.motoristas, public.vistorias,
              public.respostas, public.pendencias, public.alertas, public.complementos
  from anon, authenticated;

-- app: lê só o cadastro de veículos e documentos
grant select on public.veiculos, public.documentos_veiculo to anon, authenticated;
drop policy if exists veiculos_leitura on public.veiculos;
create policy veiculos_leitura on public.veiculos for select to anon, authenticated using (ativo);
drop policy if exists documentos_leitura on public.documentos_veiculo;
create policy documentos_leitura on public.documentos_veiculo for select to anon, authenticated using (true);

-- painel da central (usuários logados): lê tudo, não altera nada
grant select on public.motoristas, public.vistorias, public.respostas, public.pendencias,
                public.alertas, public.complementos to authenticated;
do $$
declare t text;
begin
  foreach t in array array['motoristas','vistorias','respostas','pendencias','alertas','complementos'] loop
    execute format('drop policy if exists %I_painel on public.%I', t, t);
    execute format('create policy %I_painel on public.%I for select to authenticated using (true)', t, t);
  end loop;
end $$;

-- ---------- entrada de dados: funções chamadas pelo app ----------
-- Recebe a vistoria lacrada. Idempotente: reenvio da mesma vistoria não duplica.
create or replace function public.receber_vistoria(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    text := p->>'id';
  v_lacre text := p#>>'{integridade,hash}';
  v_ex    text;
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
    nullif(p->>'quilometragem', '')::integer, (p->>'hora_inicio')::timestamptz, (p->>'hora_fim')::timestamptz,
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

  return jsonb_build_object('status', 'recebida', 'id', v_id);
end $$;

-- Recebe um complemento posterior (a vistoria original não muda).
create or replace function public.receber_complemento(p_vistoria text, c jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from vistorias where id = p_vistoria) then raise exception 'vistoria % não encontrada', p_vistoria; end if;
  if c->>'hash' !~ '^[0-9a-f]{64}$' or coalesce(c->>'texto', '') = '' then raise exception 'complemento inválido'; end if;
  insert into complementos (hash, vistoria_id, em, autor, texto)
  values (c->>'hash', p_vistoria, (c->>'em')::timestamptz, c->>'autor', c->>'texto')
  on conflict (hash) do nothing;
  return jsonb_build_object('status', 'recebido');
end $$;

revoke all on function public.receber_vistoria(jsonb) from public;
revoke all on function public.receber_complemento(text, jsonb) from public;
grant execute on function public.receber_vistoria(jsonb) to anon, authenticated;
grant execute on function public.receber_complemento(text, jsonb) to anon, authenticated;
revoke all on function public.bloquear_alteracao() from public, anon, authenticated;
