-- ============================================================================
-- MOVEMASTER — migração 2026-09-26
-- Rodar UMA VEZ no Supabase (SQL Editor). É idempotente: pode rodar de novo.
--
--  1. Roteirizador: distância salva na viagem (rotas_planejadas.distancia_km)
--  2. Perfil CLIENTE (portal do cliente):
--     - colunas novas em perfis (empresa, cidade, UF, telefone, cliente_id)
--     - cadastro próprio: gatilho em auth.users cria o perfil "cliente"
--     - funções (RPC) que o portal usa: listar / solicitar / cancelar
--     - bloqueio (RLS RESTRITIVA) de tudo o mais para o perfil cliente
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Roteirizador
-- ---------------------------------------------------------------------------
alter table public.rotas_planejadas add column if not exists distancia_km numeric;

-- ---------------------------------------------------------------------------
-- 2a. Colunas do perfil cliente e do cancelamento de pedido
-- ---------------------------------------------------------------------------
alter table public.perfis add column if not exists cliente_id   bigint;
alter table public.perfis add column if not exists empresa_nome text;
alter table public.perfis add column if not exists tipo_empresa text;
alter table public.perfis add column if not exists cidade       text;
alter table public.perfis add column if not exists uf           text;
alter table public.perfis add column if not exists telefone     text;

alter table public.pedidos add column if not exists motivo_cancelamento   text;
alter table public.pedidos add column if not exists cancelado_em          timestamptz;
alter table public.pedidos add column if not exists cancelado_por         text;
alter table public.pedidos add column if not exists status_antes_cancelar text;

-- Se existir CHECK limitando os valores de perfis.perfil, refaz incluindo 'cliente'
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.perfis'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%perfil%'
  loop
    execute format('alter table public.perfis drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.perfis add constraint perfis_perfil_check check (perfil in (
  'admin','comercial','logistica','financeiro','motorista','equipe','fiscal',
  'diretoria','manutencao','crm','cliente'));

-- ---------------------------------------------------------------------------
-- 2b. Quem é o usuário logado (SECURITY DEFINER: não esbarra no RLS de perfis)
-- ---------------------------------------------------------------------------
create or replace function public.mm_eh_cliente() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where user_id = auth.uid() and perfil = 'cliente');
$$;

create or replace function public.mm_cliente_perfil() returns public.perfis
language sql stable security definer set search_path = public as $$
  select * from public.perfis where user_id = auth.uid() and perfil = 'cliente' and ativo = true limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2c. Cadastro próprio do cliente
-- O portal chama supabase.auth.signUp com metadata { tipo_conta: 'cliente', ... }.
-- Este gatilho cria o perfil. Segurança:
--   - o perfil criado é SEMPRE 'cliente' (ninguém se cadastra como logística)
--   - empresa nova → cria o cliente e o perfil já nasce ATIVO (só vê o que ele
--     mesmo solicitar)
--   - CNPJ que já existe no cadastro → perfil nasce INATIVO até o admin liberar
--     (senão qualquer um digitaria o CNPJ de outra empresa e veria os pedidos dela)
-- ---------------------------------------------------------------------------
create or replace function public.mm_novo_usuario_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_doc text := regexp_replace(coalesce(m->>'cnpj', ''), '\D', '', 'g');
  v_cli bigint;
  v_ativo boolean := true;
begin
  if coalesce(m->>'tipo_conta', '') <> 'cliente' then
    return new;
  end if;
  if exists (select 1 from public.perfis where user_id = new.id) then
    return new;
  end if;

  if v_doc <> '' then
    select id into v_cli from public.clientes
     where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_doc
     order by id limit 1;
  end if;

  if v_cli is not null then
    v_ativo := false;           -- empresa já cadastrada: admin confirma o vínculo
  else
    insert into public.clientes (nome, cnpj, tipo_cliente, cidade, uf, telefone)
    values (coalesce(nullif(m->>'empresa', ''), m->>'nome', new.email),
            nullif(m->>'cnpj', ''), coalesce(nullif(m->>'tipo_empresa', ''), 'empresa'),
            nullif(m->>'cidade', ''), nullif(m->>'uf', ''), nullif(m->>'telefone', ''))
    returning id into v_cli;
  end if;

  insert into public.perfis (user_id, nome, email, perfil, ativo, cliente_id,
                             empresa_nome, tipo_empresa, cidade, uf, telefone)
  values (new.id, coalesce(nullif(m->>'nome', ''), new.email), new.email, 'cliente', v_ativo, v_cli,
          nullif(m->>'empresa', ''), nullif(m->>'tipo_empresa', ''),
          nullif(m->>'cidade', ''), nullif(m->>'uf', ''), nullif(m->>'telefone', ''));
  return new;
end $$;

drop trigger if exists mm_trg_novo_usuario_cliente on auth.users;
create trigger mm_trg_novo_usuario_cliente
  after insert on auth.users
  for each row execute function public.mm_novo_usuario_cliente();

-- ---------------------------------------------------------------------------
-- 2d. RPCs do portal do cliente — só colunas que o cliente pode ver
-- ---------------------------------------------------------------------------
create or replace function public.mm_cliente_meus_pedidos() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare pf public.perfis;
begin
  pf := public.mm_cliente_perfil();
  if pf.id is null or pf.cliente_id is null then return; end if;
  return query
    select jsonb_build_object(
      'id', p.id, 'placa', p.placa, 'modelo', p.modelo,
      'cidade_origem', p.cidade_origem, 'uf_origem', p.uf_origem,
      'cidade_destino', p.cidade_destino, 'uf_destino', p.uf_destino,
      'endereco_coleta', p.endereco_coleta, 'endereco_entrega', p.endereco_entrega,
      'status', p.status, 'status_planilha', p.status_planilha, 'aprovado', p.aprovado,
      'em_viagem', (p.rota_id is not null or p.placa_cegonha is not null),
      'data_solicitacao', p.data_solicitacao,
      'data_prev_coleta', p.data_prev_coleta, 'data_prev_entrega', p.data_prev_entrega,
      'referencia', p.referencia, 'observacao_pedido', p.observacao_pedido,
      'criado_por_nome', p.criado_por_nome, 'origem_lancamento', p.origem_lancamento,
      'motivo_cancelamento', p.motivo_cancelamento, 'cancelado_em', p.cancelado_em,
      'created_at', p.created_at)
    from public.pedidos p
    where p.cliente_id = pf.cliente_id
    order by p.id desc
    limit 500;
end $$;

-- Solicitação: um pedido por carro. Entra como "aguardando aprovação" e cai no
-- Planejamento → "⏳ Aguardando aprovação", identificado com o nome do cliente.
create or replace function public.mm_cliente_solicitar(dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pf public.perfis;
  cli record;
  carro jsonb;
  v_grupo text := gen_random_uuid()::text;
  v_ids bigint[] := '{}';
  v_id bigint;
  v_quem text;
begin
  pf := public.mm_cliente_perfil();
  if pf.id is null or pf.cliente_id is null then
    raise exception 'Perfil de cliente não liberado.';
  end if;
  select * into cli from public.clientes where id = pf.cliente_id;
  v_quem := 'Cliente: ' || coalesce(pf.nome, '') || ' (' || coalesce(pf.empresa_nome, cli.nome, '') || ')';
  if jsonb_array_length(coalesce(dados->'carros', '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos um veículo.';
  end if;
  if coalesce(dados->>'cidade_origem', '') = '' or coalesce(dados->>'cidade_destino', '') = '' then
    raise exception 'Informe a cidade de origem e de destino.';
  end if;

  for carro in select * from jsonb_array_elements(dados->'carros') loop
    insert into public.pedidos (
      cliente, cliente_id, modelo, placa, referencia,
      cidade_origem, uf_origem, cidade_destino, uf_destino,
      endereco_coleta, endereco_entrega, observacao_pedido,
      valor_frete, data_solicitacao, status, aprovado, grupo_id,
      origem_lancamento, criado_por_nome)
    values (
      cli.nome, pf.cliente_id, left(coalesce(carro->>'modelo', ''), 120), upper(left(coalesce(carro->>'placa', ''), 12)),
      nullif(left(coalesce(dados->>'referencia', ''), 80), ''),
      left(dados->>'cidade_origem', 80), left(coalesce(dados->>'uf_origem', ''), 2),
      left(dados->>'cidade_destino', 80), left(coalesce(dados->>'uf_destino', ''), 2),
      nullif(left(coalesce(dados->>'endereco_coleta', ''), 300), ''),
      nullif(left(coalesce(dados->>'endereco_entrega', ''), 300), ''),
      nullif(left(coalesce(dados->>'observacao', ''), 1000), ''),
      0, now(), 'Pendente', false,
      case when jsonb_array_length(dados->'carros') > 1 then v_grupo else null end,
      'cliente', v_quem)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- Aviso para a logística e o comercial (tabela de notificações do sistema, se existir)
  begin
    execute 'insert into public.notificacoes (perfil_destino, tipo, titulo, mensagem, origem, pedido_id)
             values ($1,$2,$3,$4,$6,$7), ($5,$2,$3,$4,$6,$7)'
      using 'logistica', 'acao', '🏢 Nova solicitação de cliente',
            v_quem || ' solicitou ' || array_length(v_ids, 1) || ' transporte(s): ' ||
            (dados->>'cidade_origem') || ' → ' || (dados->>'cidade_destino'),
            'comercial', v_quem, v_ids[1];
  exception when others then null; -- sem tabela/colunas: segue sem notificar
  end;

  return jsonb_build_object('ids', to_jsonb(v_ids));
end $$;

-- Cancelamento: só pedido do próprio cliente e só antes de entrar em viagem
create or replace function public.mm_cliente_cancelar(p_id bigint, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pf public.perfis; p record;
begin
  pf := public.mm_cliente_perfil();
  if pf.id is null then raise exception 'Perfil de cliente não liberado.'; end if;
  select * into p from public.pedidos where id = p_id and cliente_id = pf.cliente_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p.status in ('Cancelado', 'Entregue') then raise exception 'Este pedido já está %.', lower(p.status); end if;
  if p.rota_id is not null or p.placa_cegonha is not null or p.status not in ('Pendente') then
    raise exception 'O transporte já está em andamento — fale com a Movemaster para cancelar.';
  end if;
  update public.pedidos set
    status_antes_cancelar = status, status = 'Cancelado',
    motivo_cancelamento = coalesce(nullif(p_motivo, ''), 'Cancelado pelo cliente'),
    cancelado_em = now(), cancelado_por = 'Cliente: ' || coalesce(pf.nome, '')
  where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.mm_cliente_meus_pedidos() from public, anon;
revoke all on function public.mm_cliente_solicitar(jsonb) from public, anon;
revoke all on function public.mm_cliente_cancelar(bigint, text) from public, anon;
grant execute on function public.mm_cliente_meus_pedidos() to authenticated;
grant execute on function public.mm_cliente_solicitar(jsonb) to authenticated;
grant execute on function public.mm_cliente_cancelar(bigint, text) to authenticated;
grant execute on function public.mm_eh_cliente() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2e. ISOLAMENTO: o perfil cliente não lê nem grava NENHUMA tabela direto.
-- Política RESTRITIVA (é somada com AND às que já existem): para os demais
-- perfis nada muda. Em perfis o cliente enxerga só a própria linha (o login
-- precisa dela). Todo o resto do portal passa pelas funções acima.
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists mm_bloqueia_cliente on public.%I', t.relname);
    if t.relname = 'perfis' then
      execute 'create policy mm_bloqueia_cliente on public.perfis as restrictive for all to authenticated
               using (not public.mm_eh_cliente() or user_id = auth.uid())
               with check (not public.mm_eh_cliente())';
    else
      execute format('create policy mm_bloqueia_cliente on public.%I as restrictive for all to authenticated
               using (not public.mm_eh_cliente()) with check (not public.mm_eh_cliente())', t.relname);
    end if;
  end loop;
end $$;

-- Tabelas SEM RLS ligado ficam abertas a qualquer login (inclusive cliente).
-- Liste-as aqui e ligue o RLS (com as políticas certas) antes de liberar o portal:
select c.relname as tabela_sem_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- ---------------------------------------------------------------------------
-- 3. CRM para o perfil Comercial
-- O menu do Comercial agora mostra CRM · Cadastros / Tarefas / Painel.
-- Se as tabelas do CRM tiverem política liberando só o perfil 'crm', inclua
-- 'comercial' nelas (ex.: ... perfil in ('crm','admin','comercial') ...).
-- ---------------------------------------------------------------------------
