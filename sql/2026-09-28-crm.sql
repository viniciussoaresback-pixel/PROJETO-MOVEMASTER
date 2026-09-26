-- ============================================================================
-- MOVEMASTER — CRM Comercial (2026-09-28)
-- Rodar UMA VEZ no Supabase (SQL Editor). Idempotente e sem apagar dados:
-- só acrescenta o que ainda não existe.
--
-- Reaproveita o que já existe:
--   clientes  → clientes E leads (eh_lead = true). Não há segunda base.
--   pedidos   → último transporte do cliente (nada manual).
--   perfis    → vendedores / quem registrou / quem transferiu.
-- Novo só o necessário:
--   colunas comerciais em clientes (várias já podem existir)
--   crm_tarefas → histórico de ações, próximas ações e transferências
-- ============================================================================

-- 1. Campos comerciais no cadastro de clientes (usados também pelo
--    Cadastro de Clientes do Comercial, que já grava vendedor/prioridade...)
alter table public.clientes add column if not exists eh_lead              boolean default false;
alter table public.clientes add column if not exists vendedor_responsavel text;
alter table public.clientes add column if not exists prioridade           text;
alter table public.clientes add column if not exists potencial            text;
alter table public.clientes add column if not exists segmento             text;
alter table public.clientes add column if not exists status_negociacao    text;
alter table public.clientes add column if not exists nome_contato         text;
alter table public.clientes add column if not exists origem_prospeccao    text;
alter table public.clientes add column if not exists observacoes_crm      text;
alter table public.clientes add column if not exists lead_convertido_em   timestamptz;
update public.clientes set eh_lead = false where eh_lead is null;

-- 2. Histórico do relacionamento: cada linha é uma AÇÃO feita (ligação,
--    visita...). Se tiver "próxima ação" + data, ela é uma TAREFA em aberto
--    até ser concluída. Transferências e conversões de lead também ficam aqui.
create table if not exists public.crm_tarefas (
  id                   bigserial primary key,
  cliente_id           bigint references public.clientes(id),
  created_at           timestamptz default now()
);
alter table public.crm_tarefas add column if not exists tipo_relacionamento  text;
alter table public.crm_tarefas add column if not exists tipo_acao            text;
alter table public.crm_tarefas add column if not exists data_acao            timestamptz default now();
alter table public.crm_tarefas add column if not exists responsavel          text;
alter table public.crm_tarefas add column if not exists nome_contato         text;
alter table public.crm_tarefas add column if not exists assunto              text;
alter table public.crm_tarefas add column if not exists descricao            text;
alter table public.crm_tarefas add column if not exists resultado            text;
alter table public.crm_tarefas add column if not exists motivo_perdido       text;
alter table public.crm_tarefas add column if not exists proxima_acao         text;
alter table public.crm_tarefas add column if not exists tipo_proxima_acao    text;
alter table public.crm_tarefas add column if not exists data_proxima_acao    date;
alter table public.crm_tarefas add column if not exists concluida            boolean default false;
alter table public.crm_tarefas add column if not exists concluida_em         timestamptz;
alter table public.crm_tarefas add column if not exists concluida_por        text;
alter table public.crm_tarefas add column if not exists transferido_de       text;
alter table public.crm_tarefas add column if not exists transferir_para      text;
alter table public.crm_tarefas add column if not exists transferencia_aceita boolean;
alter table public.crm_tarefas add column if not exists criado_por           text;

create index if not exists crm_tarefas_cliente_idx on public.crm_tarefas (cliente_id);
create index if not exists crm_tarefas_proxima_idx on public.crm_tarefas (data_proxima_acao) where concluida = false;

-- 3. Acesso: só a equipe interna (perfil ativo que não é cliente).
--    Mesma regra da migração 2026-09-26 (recriada aqui caso ela não tenha
--    sido rodada ainda).
create or replace function public.mm_eh_interno() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where user_id = auth.uid() and ativo = true and perfil <> 'cliente');
$$;
grant execute on function public.mm_eh_interno() to authenticated, anon;

alter table public.crm_tarefas enable row level security;
drop policy if exists crm_tarefas_equipe on public.crm_tarefas;
create policy crm_tarefas_equipe on public.crm_tarefas for all to authenticated
  using ((select public.mm_eh_interno())) with check ((select public.mm_eh_interno()));
grant select, insert, update on public.crm_tarefas to authenticated;
grant usage, select on sequence public.crm_tarefas_id_seq to authenticated;

-- Histórico não se apaga pelo sistema (sem DELETE para usuários).
revoke delete on public.crm_tarefas from authenticated, anon;
