/* =====================================================================
   MOVEMASTER — MÓDULO 13 · CRM COMERCIAL
   ─────────────────────────────────────────────────────────────────────
   Perfil próprio (`crm`), no mesmo nível de Comercial e Logística.
   Três abas top-level:

     1) crmCadastros — Cadastros (leads + clientes)
        Puxa a base `clientesGlobais` do sistema, exibe com campos
        complementares (prioridade, potencial, vendedor). Permite:
          · Editar os campos CRM de qualquer cliente já cadastrado
          · Criar um NOVO LEAD com cadastro mínimo (eh_lead=true)
          · Converter um lead em cliente (completa CNPJ, endereço)
          · Abrir uma nova ação/tarefa direto do cadastro
          · Criar pedido (vai pro lançamento comercial; se for lead,
            força complemento antes)

     2) crmTarefas — Gestor de Tarefas
        Lista as ações programadas: visitas, ligações, propostas.
        Filtros por situação (atrasadas / hoje / próximos 7d /
        concluídas) e por responsável. Ações: concluir, editar,
        excluir, transferir para outro vendedor.

     3) crmPainel — Painel de Acompanhamento
        Cards com KPIs (leads, clientes ativos, sem movimentação,
        negociações abertas, tarefas atrasadas). Ranking por
        vendedor. Agenda das próximas ações.

   ─────────────────────────────────────────────────────────────────────
   DEPENDÊNCIAS
   - `clientesGlobais` e `pedidosGlobais` já preenchidos pelo mod-01.
   - Tabela `crm_tarefas` no Supabase (ver crm-schema.sql).

   FILOSOFIA
   - Uma tabela única `clientes`, com flag `eh_lead` para diferenciar.
   - Vendedor responsável é campo livre de texto (nome do vendedor).
     A lista de opções nos filtros vem dos próprios clientes.
   - Nada é cacheado localmente: cada renderização recalcula do zero
     a partir dos globais. Se alguém alterar, basta reabrir a aba.
   ===================================================================== */

// -------------------------------------------------------------------
// ESTADO
// -------------------------------------------------------------------
window.crmTarefasGlobais = window.crmTarefasGlobais || [];
let _crmTarefasCarregado = false;

// Situação = janela em dias para "cliente sem movimentação".
// Espelha "Sem Movimentação +30 dias" da planilha original.
const CRM_DIAS_SEM_MOV = 30;

// Filtros persistentes por aba (não somem ao trocar sub-aba interna,
// mas resetam se o usuário sair do CRM e voltar — comportamento
// padrão do sistema).
let _crmFiltrosCad = {
    busca: '', vendedor: '', prioridade: '',
    status: '', segmento: '', tipo: '' /* '', 'lead', 'cliente' */
};
let _crmFiltrosTar = {
    situacao: 'ativas' /* ativas | atrasadas | hoje | proximas7 | concluidas | todas */,
    responsavel: '', busca: ''
};

// -------------------------------------------------------------------
// UTILIDADES
// -------------------------------------------------------------------
function _crmNorm(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .toLowerCase().trim().replace(/\s+/g,' ');
}
function _crmDiasDesde(data){
    if (!data) return null;
    const d = new Date(String(data).length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (1000*60*60*24));
}
function _crmFmtData(d){
    if (!d) return '—';
    const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR');
}
function _crmHoje(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
}
function _crmDataStr(d){
    // YYYY-MM-DD para inputs type=date
    const dt = d instanceof Date ? d : new Date(d);
    const y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
}
function _crmEsc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _crmUsuario(){
    return (typeof _usuarioAtualNome === 'function' ? _usuarioAtualNome() : null)
        || (window.perfilLogado?.nome)
        || 'CRM';
}

// Busca o último pedido do cliente em pedidosGlobais (por id, com
// fallback por nome normalizado — cobre pedidos antigos sem cliente_id).
function _crmUltimoTransporte(cliente){
    const pedidos = window.pedidosGlobais || [];
    if (!pedidos.length) return null;
    const idAlvo = cliente?.id;
    const nomeAlvo = _crmNorm(cliente?.nome);
    const doCli = pedidos.filter(p => {
        if (idAlvo && p.clienteId && Number(p.clienteId) === Number(idAlvo)) return true;
        if (nomeAlvo && _crmNorm(p.cliente) === nomeAlvo) return true;
        return false;
    });
    if (!doCli.length) return null;
    doCli.sort((a,b) => (b.dataSolicitacao||b.createdAt||'').localeCompare(a.dataSolicitacao||a.createdAt||''));
    return doCli[0];
}

// Lista de vendedores para popular dropdowns. Vem dos próprios
// clientes cadastrados + dos usuários com perfil `comercial`/`crm`
// se disponíveis no `usuariosGlobais`.
function _crmListaVendedores(){
    const set = new Set();
    (window.clientesGlobais||[]).forEach(c => {
        if (c.vendedor_responsavel) set.add(c.vendedor_responsavel);
    });
    (window.crmTarefasGlobais||[]).forEach(t => {
        if (t.responsavel) set.add(t.responsavel);
        if (t.transferir_para) set.add(t.transferir_para);
    });
    return [...set].sort();
}

// -------------------------------------------------------------------
// CARREGAMENTO DA TABELA crm_tarefas
// -------------------------------------------------------------------
// Sob demanda: primeira vez que qualquer aba do CRM abre, carrega.
// Se falhar (tabela ainda não criada, RLS, etc), degrada graciosamente
// — o CRM segue funcionando com as listas de clientes/pedidos.
async function carregarCRMTarefas(forcar){
    if (_crmTarefasCarregado && !forcar) return;
    if (!window.supabase) return;
    try {
        const { data, error } = await supabase.from('crm_tarefas').select('*').order('data_proxima_acao', { ascending: true });
        if (error) throw error;
        window.crmTarefasGlobais = data || [];
        _crmTarefasCarregado = true;
    } catch(e){
        console.warn('[CRM] Falha ao carregar crm_tarefas — a aba abre mesmo assim, mas sem tarefas:', e.message);
        window.crmTarefasGlobais = [];
        _crmTarefasCarregado = true; // evita loop de tentativas
    }
}

// -------------------------------------------------------------------
// DISPATCHER DAS 3 ABAS
// -------------------------------------------------------------------
// Cada função abaixo é chamada pelo dispatcher do mod-01 quando a
// aba correspondente é aberta. Nome fixo — não renomear.
async function renderizarCRMCadastros(){
    await carregarCRMTarefas();
    _crmMontarCadastros();
}
async function renderizarCRMTarefas(){
    await carregarCRMTarefas();
    _crmMontarTarefas();
}
async function renderizarCRMPainel(){
    await carregarCRMTarefas();
    _crmMontarPainel();
}

// ===================================================================
// ABA 1 · CADASTROS (leads + clientes)
// ===================================================================
function _crmSetFiltroCad(chave, valor){
    _crmFiltrosCad[chave] = valor;
    _crmMontarCadastros();
}
function _crmLimparFiltrosCad(){
    _crmFiltrosCad = { busca:'', vendedor:'', prioridade:'', status:'', segmento:'', tipo:'' };
    _crmMontarCadastros();
}

function _crmMontarCadastros(){
    const cont = document.getElementById('crmCadastrosConteudo');
    if (!cont) return;

    // Skeleton enquanto os globais não chegam
    if (!window.__mmDadosCarregados && typeof mmSkeletonTabela === 'function'){
        mmSkeletonTabela(cont, { linhas:6, colunas:6 });
        if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => _crmMontarCadastros());
        return;
    }

    const clientes = window.clientesGlobais || [];
    const f = _crmFiltrosCad;
    const vendedores = _crmListaVendedores();

    // Enriquecimento (último transporte + dias sem mov)
    const linhas = clientes.map(c => {
        const ult = _crmUltimoTransporte(c);
        const dias = ult ? _crmDiasDesde(ult.dataSolicitacao || ult.createdAt) : null;
        return { c, ult, dias };
    });

    const busca = _crmNorm(f.busca);
    const filtrados = linhas.filter(({c}) => {
        if (busca){
            const alvo = _crmNorm(c.nome) + ' ' + _crmNorm(c.nome_fantasia) + ' ' + _crmNorm(c.nome_contato) + ' ' + _crmNorm(c.cidade) + ' ' + _crmNorm(c.codigo) + ' ' + _crmNorm(c.cnpj) + ' ' + _crmNorm(c.cpf) + ' ' + _crmNorm(c.telefone) + ' ' + _crmNorm(c.email);
            if (!alvo.includes(busca)) return false;
        }
        if (f.vendedor   && (c.vendedor_responsavel||'') !== f.vendedor)   return false;
        if (f.prioridade && (c.prioridade||'')          !== f.prioridade) return false;
        if (f.status     && (c.status_negociacao||'')   !== f.status)     return false;
        if (f.segmento   && (c.segmento||'')            !== f.segmento)   return false;
        if (f.tipo === 'lead'    && !c.eh_lead) return false;
        if (f.tipo === 'cliente' &&  c.eh_lead) return false;
        return true;
    });

    // Ordena: leads no topo (para lembrar de qualificar), depois por
    // prioridade A → C, depois quem está há mais tempo sem movimentar.
    const ordemPrio = { 'A':0, 'B':1, 'C':2 };
    filtrados.sort((a,b) => {
        const la = a.c.eh_lead ? 0 : 1, lb = b.c.eh_lead ? 0 : 1;
        if (la !== lb) return la - lb;
        const pa = ordemPrio[(a.c.prioridade||'').toUpperCase()] ?? 3;
        const pb = ordemPrio[(b.c.prioridade||'').toUpperCase()] ?? 3;
        if (pa !== pb) return pa - pb;
        return (b.dias||-1) - (a.dias||-1);
    });

    const totalLeads = clientes.filter(c => c.eh_lead).length;
    const totalCli   = clientes.length - totalLeads;

    const optsPrio = ['A','B','C'];
    const optsSeg  = ['Garagem','Concessionária','Locadora','Particular','Transportadora','Outro'];
    const optsStat = ['Novo Cadastro','Prospecção em Andamento','Negociação Aberta','Proposta Enviada','Fechado - Ganho','Fechado - Perdido'];

    let corpo;
    if (!filtrados.length){
        corpo = `<tr><td colspan="8" class="text-center text-muted" style="padding:1.6rem">Nenhum cliente ou lead encontrado.</td></tr>`;
    } else {
        corpo = filtrados.map(({c, ult, dias}) => {
            const badgeTipo = c.eh_lead
                ? `<span class="crm-tag crm-tag-lead">🌱 LEAD</span>`
                : `<span class="crm-tag crm-tag-cli">🏢 Cliente</span>`;

            const corPrio = { 'A':'#ef4444', 'B':'#3b82f6', 'C':'#6b7280' }[(c.prioridade||'').toUpperCase()] || 'var(--surface-3)';
            const badgePrio = c.prioridade
                ? `<span class="crm-tag" style="background:${corPrio};color:#fff">${c.prioridade}</span>`
                : '<span style="color:var(--text-tertiary)">—</span>';

            const rota = ult ? `${ult.cidadeOrigem||'—'} → ${ult.cidadeDestino||'—'}` : '<span style="color:var(--text-tertiary)">Sem transporte</span>';
            const dataUlt = ult ? _crmFmtData(ult.dataSolicitacao || ult.createdAt) : '';

            let corDias = 'var(--text-tertiary)', textoDias = 'sem pedidos';
            if (dias != null){
                textoDias = `${dias}d`;
                corDias = dias <= CRM_DIAS_SEM_MOV ? '#22c55e' : '#f59e0b';
            }

            return `<tr>
                <td>
                    <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
                        ${badgeTipo}
                        <strong>${_crmEsc(c.nome)}</strong>
                    </div>
                    <div class="crm-sub">${_crmEsc(c.codigo||'')}${c.cidade?' · '+_crmEsc(c.cidade):''}${c.uf?'/'+_crmEsc(c.uf):''}</div>
                </td>
                <td>
                    ${c.nome_contato ? `<div>${_crmEsc(c.nome_contato)}</div>` : ''}
                    ${c.telefone ? `<div class="crm-sub">📱 ${_crmEsc(c.telefone)}</div>` : ''}
                    ${c.email ? `<div class="crm-sub">✉ ${_crmEsc(c.email)}</div>` : ''}
                    ${!c.nome_contato && !c.telefone && !c.email ? '<span style="color:var(--text-tertiary)">—</span>' : ''}
                </td>
                <td>${c.vendedor_responsavel ? _crmEsc(c.vendedor_responsavel) : '<span style="color:var(--text-tertiary)">Sem responsável</span>'}</td>
                <td>${badgePrio}</td>
                <td style="font-size:.82rem">${c.status_negociacao ? _crmEsc(c.status_negociacao) : '<span style="color:var(--text-tertiary)">—</span>'}</td>
                <td style="font-size:.82rem">
                    <div>${rota}</div>
                    ${dataUlt ? `<div class="crm-sub">${dataUlt} · <span style="color:${corDias};font-weight:600">${textoDias}</span></div>` : ''}
                </td>
                <td style="text-align:right;white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="_crmModalNovaAcao(${c.id})" title="Registrar ação">📝</button>
                    <button class="btn btn-sm btn-secondary" onclick="_crmModalEditarCRM(${c.id})" title="Editar CRM">✏️</button>
                    ${c.eh_lead
                        ? `<button class="btn btn-sm btn-primary" onclick="_crmModalConverterLead(${c.id})" title="Converter em cliente">🔄</button>`
                        : `<button class="btn btn-sm btn-primary" onclick="_crmIrParaPedido(${c.id})" title="Criar pedido">📋</button>`
                    }
                </td>
            </tr>`;
        }).join('');
    }

    cont.innerHTML = `
        <div class="cg-header" style="align-items:center;flex-wrap:wrap;gap:.6rem">
            <h2 style="margin:0">📇 Cadastros — Leads & Clientes</h2>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                <button class="btn btn-primary btn-sm" onclick="_crmModalNovoLead()">🌱 Novo Lead</button>
                <button class="btn btn-secondary btn-sm" onclick="_crmMontarCadastros()">🔄 Atualizar</button>
            </div>
        </div>

        <div class="crm-cards-topo">
            <div class="crm-mini-card"><div class="crm-mini-num">${totalCli}</div><div class="crm-mini-lab">Clientes</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:#22c55e">${totalLeads}</div><div class="crm-mini-lab">Leads em qualificação</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:var(--accent)">${filtrados.length}</div><div class="crm-mini-lab">Mostrando no filtro</div></div>
        </div>

        <div class="cg-filtros" style="margin-top:1rem">
            <div class="cg-filtro" style="min-width:220px">
                <label>Buscar</label>
                <input type="text" value="${_crmEsc(f.busca)}" placeholder="Nome, contato, cidade, CNPJ..." oninput="_crmSetFiltroCad('busca', this.value)">
            </div>
            <div class="cg-filtro">
                <label>Tipo</label>
                <select onchange="_crmSetFiltroCad('tipo', this.value)">
                    <option value="">Todos</option>
                    <option value="lead"    ${f.tipo==='lead'?'selected':''}>Só leads</option>
                    <option value="cliente" ${f.tipo==='cliente'?'selected':''}>Só clientes</option>
                </select>
            </div>
            <div class="cg-filtro">
                <label>Vendedor</label>
                <select onchange="_crmSetFiltroCad('vendedor', this.value)">
                    <option value="">Todos</option>
                    ${vendedores.map(v => `<option ${f.vendedor===v?'selected':''}>${_crmEsc(v)}</option>`).join('')}
                </select>
            </div>
            <div class="cg-filtro">
                <label>Prioridade</label>
                <select onchange="_crmSetFiltroCad('prioridade', this.value)">
                    <option value="">Todas</option>
                    ${optsPrio.map(p => `<option ${f.prioridade===p?'selected':''}>${p}</option>`).join('')}
                </select>
            </div>
            <div class="cg-filtro">
                <label>Status</label>
                <select onchange="_crmSetFiltroCad('status', this.value)">
                    <option value="">Todos</option>
                    ${optsStat.map(s => `<option ${f.status===s?'selected':''}>${_crmEsc(s)}</option>`).join('')}
                </select>
            </div>
            <div class="cg-filtro">
                <label>Segmento</label>
                <select onchange="_crmSetFiltroCad('segmento', this.value)">
                    <option value="">Todos</option>
                    ${optsSeg.map(s => `<option ${f.segmento===s?'selected':''}>${_crmEsc(s)}</option>`).join('')}
                </select>
            </div>
            <div class="cg-filtro" style="align-self:flex-end">
                <button class="btn btn-secondary btn-sm" onclick="_crmLimparFiltrosCad()">Limpar</button>
            </div>
        </div>

        <div class="card" style="margin-top:1rem;padding:0">
            <div class="tabela-scroll">
                <table class="ocup-tabela crm-tabela">
                    <thead>
                        <tr>
                            <th>Cliente / Lead</th>
                            <th>Contato</th>
                            <th>Vendedor</th>
                            <th>Prio</th>
                            <th>Status</th>
                            <th>Último transporte</th>
                            <th style="text-align:right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${corpo}</tbody>
                </table>
            </div>
        </div>
    `;
}

// ===================================================================
// ABA 2 · GESTOR DE TAREFAS
// ===================================================================
function _crmSetFiltroTar(chave, valor){
    _crmFiltrosTar[chave] = valor;
    _crmMontarTarefas();
}

function _crmMontarTarefas(){
    const cont = document.getElementById('crmTarefasConteudo');
    if (!cont) return;

    const tarefas = window.crmTarefasGlobais || [];
    const clientes = window.clientesGlobais || [];
    const f = _crmFiltrosTar;
    const vendedores = _crmListaVendedores();

    const mapCli = new Map(clientes.map(c => [Number(c.id), c]));
    const hoje = _crmHoje();
    const em7d = new Date(hoje.getTime() + 7*24*60*60*1000);

    // Enriquecer + filtrar
    const enriched = tarefas.map(t => {
        const cli = mapCli.get(Number(t.cliente_id));
        const dataProx = t.data_proxima_acao ? new Date(t.data_proxima_acao + 'T12:00:00') : null;
        let situacao = 'sem_data';
        if (t.concluida) situacao = 'concluida';
        else if (dataProx){
            if (dataProx < hoje) situacao = 'atrasada';
            else if (dataProx.toDateString() === hoje.toDateString()) situacao = 'hoje';
            else if (dataProx <= em7d) situacao = 'proximas7';
            else situacao = 'futura';
        }
        return { t, cli, dataProx, situacao };
    });

    const busca = _crmNorm(f.busca);
    const filt = enriched.filter(({t, cli, situacao}) => {
        if (busca){
            const alvo = _crmNorm(cli?.nome) + ' ' + _crmNorm(t.descricao) + ' ' + _crmNorm(t.proxima_acao) + ' ' + _crmNorm(t.responsavel);
            if (!alvo.includes(busca)) return false;
        }
        if (f.responsavel && t.responsavel !== f.responsavel && t.transferir_para !== f.responsavel) return false;

        if (f.situacao === 'ativas'      && (t.concluida)) return false;
        if (f.situacao === 'atrasadas'   && situacao !== 'atrasada') return false;
        if (f.situacao === 'hoje'        && situacao !== 'hoje') return false;
        if (f.situacao === 'proximas7'   && !['hoje','proximas7'].includes(situacao)) return false;
        if (f.situacao === 'concluidas'  && !t.concluida) return false;
        // 'todas' e 'ativas' já tratados
        return true;
    });

    // Ordena: atrasadas primeiro, depois por data mais próxima
    filt.sort((a,b) => {
        if (a.t.concluida !== b.t.concluida) return a.t.concluida ? 1 : -1;
        const da = a.dataProx ? a.dataProx.getTime() : Infinity;
        const db = b.dataProx ? b.dataProx.getTime() : Infinity;
        return da - db;
    });

    // Contadores para os chips de filtro
    const cnt = { atrasadas:0, hoje:0, proximas7:0, ativas:0, concluidas:0 };
    enriched.forEach(({t, situacao}) => {
        if (t.concluida) cnt.concluidas++;
        else {
            cnt.ativas++;
            if (situacao==='atrasada') cnt.atrasadas++;
            if (situacao==='hoje') cnt.hoje++;
            if (['hoje','proximas7'].includes(situacao)) cnt.proximas7++;
        }
    });

    let corpo;
    if (!filt.length){
        corpo = `<div class="card" style="padding:1.6rem;text-align:center;color:var(--text-secondary)">
            Nenhuma tarefa encontrada. ${tarefas.length === 0 ? 'Registre a primeira ação a partir do cadastro de um cliente.' : 'Ajuste os filtros.'}
        </div>`;
    } else {
        corpo = filt.map(({t, cli, dataProx, situacao}) => {
            const clNome = cli ? _crmEsc(cli.nome) : `<em>cliente #${t.cliente_id}</em>`;
            const clTag = cli?.eh_lead ? '<span class="crm-tag crm-tag-lead" style="margin-left:.3rem">🌱 LEAD</span>' : '';

            const corSit = {
                'atrasada':'#ef4444', 'hoje':'#f59e0b',
                'proximas7':'#3b82f6', 'futura':'var(--text-secondary)',
                'sem_data':'var(--text-tertiary)', 'concluida':'#22c55e'
            }[situacao];
            const lblSit = {
                'atrasada':'⚠️ ATRASADA', 'hoje':'🕒 HOJE',
                'proximas7':'📅 Esta semana', 'futura':'⏳ Futura',
                'sem_data':'Sem data', 'concluida':'✅ Concluída'
            }[situacao];

            const transferBadge = t.transferir_para
                ? (t.transferencia_aceita === true
                    ? `<span class="crm-sub">→ transferido para <strong>${_crmEsc(t.transferir_para)}</strong> (aceito)</span>`
                    : t.transferencia_aceita === false
                        ? `<span class="crm-sub" style="color:#ef4444">→ transferência para ${_crmEsc(t.transferir_para)} RECUSADA</span>`
                        : `<span class="crm-sub" style="color:#f59e0b">⏳ transferência pendente para <strong>${_crmEsc(t.transferir_para)}</strong></span>`)
                : '';

            const podeAceitar = t.transferir_para && t.transferencia_aceita == null;

            return `<div class="crm-tarefa-card">
                <div class="crm-tarefa-topo">
                    <div>
                        <div class="crm-tarefa-titulo">
                            <span class="crm-tag" style="background:${corSit};color:#fff">${lblSit}</span>
                            <span style="margin-left:.4rem">${_crmEsc(t.tipo_acao||'Ação')}</span>
                            ${clTag}
                        </div>
                        <div class="crm-tarefa-cli">
                            👤 ${clNome}
                            ${t.nome_contato ? ` · contato: ${_crmEsc(t.nome_contato)}` : ''}
                        </div>
                    </div>
                    <div class="crm-tarefa-data">
                        ${dataProx ? _crmFmtData(dataProx) : ''}
                        <div class="crm-sub">Resp: <strong>${_crmEsc(t.responsavel)}</strong></div>
                    </div>
                </div>

                ${t.descricao ? `<div class="crm-tarefa-desc"><strong>Tratado:</strong> ${_crmEsc(t.descricao)}</div>` : ''}
                ${t.resultado ? `<div class="crm-tarefa-desc"><strong>Resultado:</strong> ${_crmEsc(t.resultado)}${t.motivo_perdido ? ' · '+_crmEsc(t.motivo_perdido):''}</div>` : ''}
                ${t.proxima_acao ? `<div class="crm-tarefa-desc"><strong>Próxima ação:</strong> ${_crmEsc(t.proxima_acao)}${t.tipo_proxima_acao ? ' ('+_crmEsc(t.tipo_proxima_acao)+')':''}</div>` : ''}
                ${transferBadge ? `<div style="margin-top:.35rem">${transferBadge}</div>` : ''}

                <div class="crm-tarefa-acoes">
                    ${!t.concluida ? `<button class="btn btn-sm btn-primary" onclick="_crmConcluirTarefa(${t.id})">✓ Concluir</button>` : ''}
                    ${podeAceitar ? `
                        <button class="btn btn-sm btn-primary" onclick="_crmAceitarTransfer(${t.id}, true)">Aceitar transferência</button>
                        <button class="btn btn-sm btn-secondary" onclick="_crmAceitarTransfer(${t.id}, false)">Recusar</button>
                    ` : ''}
                    ${cli ? `<button class="btn btn-sm btn-secondary" onclick="_crmModalNovaAcao(${cli.id})">📝 Nova ação</button>` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="_crmExcluirTarefa(${t.id})">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }

    cont.innerHTML = `
        <div class="cg-header" style="align-items:center;flex-wrap:wrap">
            <h2 style="margin:0">✅ Gestor de Tarefas</h2>
            <button class="btn btn-secondary btn-sm" onclick="carregarCRMTarefas(true).then(_crmMontarTarefas)">🔄 Atualizar</button>
        </div>

        <div class="crm-cards-topo">
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:#ef4444">${cnt.atrasadas}</div><div class="crm-mini-lab">Atrasadas</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:#f59e0b">${cnt.hoje}</div><div class="crm-mini-lab">Hoje</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:#3b82f6">${cnt.proximas7}</div><div class="crm-mini-lab">Próximos 7 dias</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num">${cnt.ativas}</div><div class="crm-mini-lab">Ativas (total)</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:#22c55e">${cnt.concluidas}</div><div class="crm-mini-lab">Concluídas</div></div>
        </div>

        <div class="cg-filtros" style="margin-top:1rem">
            <div class="cg-filtro" style="min-width:220px">
                <label>Buscar</label>
                <input type="text" value="${_crmEsc(f.busca)}" placeholder="Cliente, descrição, responsável..." oninput="_crmSetFiltroTar('busca', this.value)">
            </div>
            <div class="cg-filtro">
                <label>Situação</label>
                <select onchange="_crmSetFiltroTar('situacao', this.value)">
                    <option value="ativas"      ${f.situacao==='ativas'?'selected':''}>Ativas (pendentes)</option>
                    <option value="atrasadas"   ${f.situacao==='atrasadas'?'selected':''}>Só atrasadas</option>
                    <option value="hoje"        ${f.situacao==='hoje'?'selected':''}>Só hoje</option>
                    <option value="proximas7"   ${f.situacao==='proximas7'?'selected':''}>Próximos 7 dias</option>
                    <option value="concluidas"  ${f.situacao==='concluidas'?'selected':''}>Concluídas</option>
                    <option value="todas"       ${f.situacao==='todas'?'selected':''}>Todas</option>
                </select>
            </div>
            <div class="cg-filtro">
                <label>Responsável</label>
                <select onchange="_crmSetFiltroTar('responsavel', this.value)">
                    <option value="">Todos</option>
                    ${vendedores.map(v => `<option ${f.responsavel===v?'selected':''}>${_crmEsc(v)}</option>`).join('')}
                </select>
            </div>
        </div>

        <div class="crm-tarefas-lista" style="margin-top:1rem;display:flex;flex-direction:column;gap:.6rem">${corpo}</div>
    `;
}

// ===================================================================
// ABA 3 · PAINEL DE ACOMPANHAMENTO
// ===================================================================
function _crmMontarPainel(){
    const cont = document.getElementById('crmPainelConteudo');
    if (!cont) return;

    const clientes = window.clientesGlobais || [];
    const tarefas  = window.crmTarefasGlobais || [];
    const hoje = _crmHoje();
    const em7d = new Date(hoje.getTime() + 7*24*60*60*1000);

    // KPIs
    let leads=0, clis=0, ativos=0, semMov=0;
    clientes.forEach(c => {
        if (c.eh_lead) leads++; else clis++;
        const ult = _crmUltimoTransporte(c);
        if (ult){
            const d = _crmDiasDesde(ult.dataSolicitacao || ult.createdAt);
            if (d != null){
                if (d <= CRM_DIAS_SEM_MOV) ativos++;
                else semMov++;
            }
        }
    });

    const statusAndamento = new Set(['Prospecção em Andamento','Negociação Aberta','Proposta Enviada']);
    const negociacoes = clientes.filter(c => statusAndamento.has(c.status_negociacao||'')).length;

    let atrasadas=0, tarefasHoje=0, tarefasSemana=0;
    tarefas.forEach(t => {
        if (t.concluida || !t.data_proxima_acao) return;
        const d = new Date(t.data_proxima_acao + 'T12:00:00');
        if (d < hoje) atrasadas++;
        else if (d.toDateString() === hoje.toDateString()) tarefasHoje++;
        else if (d <= em7d) tarefasSemana++;
    });

    // Ranking por vendedor: nº de clientes/leads sob responsabilidade
    // + tarefas ativas + tarefas concluídas nos últimos 30 dias.
    const rank = {};
    const bump = (v, campo) => {
        if (!v) return;
        rank[v] = rank[v] || { clientes:0, leads:0, tarefasAtivas:0, tarefasConcluidas30d:0 };
        rank[v][campo]++;
    };
    clientes.forEach(c => {
        if (!c.vendedor_responsavel) return;
        bump(c.vendedor_responsavel, c.eh_lead ? 'leads' : 'clientes');
    });
    const trintaDiasAtras = new Date(hoje.getTime() - 30*24*60*60*1000);
    tarefas.forEach(t => {
        if (t.concluida){
            const d = t.data_acao ? new Date(t.data_acao) : null;
            if (d && d >= trintaDiasAtras) bump(t.responsavel, 'tarefasConcluidas30d');
        } else {
            bump(t.responsavel, 'tarefasAtivas');
        }
    });
    const rankArr = Object.entries(rank).map(([v, d]) => ({ vendedor: v, ...d }))
        .sort((a,b) => (b.clientes+b.leads) - (a.clientes+a.leads));

    // Agenda das próximas 10 tarefas ativas com data
    const mapCli = new Map(clientes.map(c => [Number(c.id), c]));
    const agenda = tarefas
        .filter(t => !t.concluida && t.data_proxima_acao)
        .sort((a,b) => a.data_proxima_acao.localeCompare(b.data_proxima_acao))
        .slice(0, 10);

    const kpi = (t, v, s, c) => `
        <div class="card crm-kpi">
            <div class="crm-kpi-lab">${t}</div>
            <div class="crm-kpi-num" style="color:${c||'var(--text-primary)'}">${v}</div>
            <div class="crm-kpi-sub">${s}</div>
        </div>
    `;

    let rankHTML;
    if (!rankArr.length){
        rankHTML = `<div class="text-muted" style="padding:.8rem 1rem">Ninguém com clientes ou tarefas ainda. Comece atribuindo um vendedor aos cadastros.</div>`;
    } else {
        rankHTML = `<div class="tabela-scroll"><table class="ocup-tabela">
            <thead><tr><th>Vendedor</th><th>Clientes</th><th>Leads</th><th>Tarefas ativas</th><th>Concluídas (30d)</th></tr></thead>
            <tbody>${rankArr.map(r => `<tr>
                <td><strong>${_crmEsc(r.vendedor)}</strong></td>
                <td>${r.clientes}</td>
                <td>${r.leads}</td>
                <td>${r.tarefasAtivas}</td>
                <td>${r.tarefasConcluidas30d}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
    }

    let agendaHTML;
    if (!agenda.length){
        agendaHTML = `<div class="text-muted" style="padding:.8rem 1rem">Sem próximas ações programadas.</div>`;
    } else {
        agendaHTML = `<div class="tabela-scroll"><table class="ocup-tabela">
            <thead><tr><th>Data</th><th>Cliente</th><th>Ação</th><th>Responsável</th></tr></thead>
            <tbody>${agenda.map(t => {
                const cli = mapCli.get(Number(t.cliente_id));
                const atrasada = new Date(t.data_proxima_acao+'T12:00:00') < hoje;
                return `<tr>
                    <td style="${atrasada?'color:#ef4444;font-weight:600':''}">${_crmFmtData(t.data_proxima_acao)}</td>
                    <td>${cli ? _crmEsc(cli.nome) : '#'+t.cliente_id}</td>
                    <td>${_crmEsc(t.tipo_proxima_acao||t.tipo_acao||'')}${t.proxima_acao ? ' · '+_crmEsc(t.proxima_acao):''}</td>
                    <td>${_crmEsc(t.responsavel)}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;
    }

    cont.innerHTML = `
        <div class="cg-header" style="align-items:center">
            <h2 style="margin:0">📊 Painel de Acompanhamento</h2>
            <button class="btn btn-secondary btn-sm" onclick="carregarCRMTarefas(true).then(_crmMontarPainel)">🔄 Atualizar</button>
        </div>

        <div class="crm-kpi-grid">
            ${kpi('Clientes', clis, 'Cadastro completo', 'var(--accent)')}
            ${kpi('Leads', leads, 'Em qualificação', '#22c55e')}
            ${kpi('Ativos', ativos, `Transporte ≤ ${CRM_DIAS_SEM_MOV}d`, '#22c55e')}
            ${kpi('Sem movimentação', semMov, `Há mais de ${CRM_DIAS_SEM_MOV} dias`, '#f59e0b')}
            ${kpi('Negociações abertas', negociacoes, 'Prospecção · Aberta · Proposta', '#3b82f6')}
            ${kpi('Tarefas atrasadas', atrasadas, 'Pendentes com data passada', '#ef4444')}
            ${kpi('Tarefas hoje', tarefasHoje, 'A fazer nas próximas horas', '#f59e0b')}
            ${kpi('Esta semana', tarefasSemana, 'Próximos 7 dias', '#3b82f6')}
        </div>

        <div class="crm-painel-linha">
            <div class="card" style="padding:0;flex:1;min-width:340px">
                <div class="crm-card-titulo">🏆 Ranking por vendedor</div>
                ${rankHTML}
            </div>
            <div class="card" style="padding:0;flex:1;min-width:340px">
                <div class="crm-card-titulo">🗓️ Próximas ações</div>
                ${agendaHTML}
            </div>
        </div>
    `;
}

// ===================================================================
// MODAIS · CADASTRO / EDIÇÃO
// ===================================================================
function _crmAbrirModal(html){
    let m = document.getElementById('crmModal');
    if (!m){
        m = document.createElement('div');
        m.id = 'crmModal';
        m.className = 'modal';
        m.innerHTML = `<div class="modal-content" id="crmModalConteudo" style="max-width:640px"></div>`;
        document.body.appendChild(m);
    }
    document.getElementById('crmModalConteudo').innerHTML = html;
    m.style.display = 'flex';
}
function _crmFecharModal(){
    const m = document.getElementById('crmModal');
    if (m) m.style.display = 'none';
}

// ─── MODAL: NOVO LEAD (cadastro mínimo) ───────────────────────────
// Só o essencial. Sem CNPJ, sem endereço, sem forma de pagamento.
// Se depois ele for gerar pedido, o sistema abre o cadastro completo.
function _crmModalNovoLead(){
    const vendedores = _crmListaVendedores();
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">🌱 Novo Lead</h2>
        <p class="text-muted" style="margin-top:-.4rem">Cadastro mínimo. Complete os dados quando o lead virar pedido.</p>
        <form id="formCRMNovoLead" class="form" onsubmit="event.preventDefault(); _crmSalvarNovoLead();">
            <div class="form-row">
                <div class="form-group full-width">
                    <label>Nome / Empresa *</label>
                    <input type="text" id="crmLeadNome" required placeholder="Nome do lead ou empresa">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Nome do contato</label>
                    <input type="text" id="crmLeadContato" placeholder="Pessoa com quem falou">
                </div>
                <div class="form-group">
                    <label>Telefone / WhatsApp</label>
                    <input type="text" id="crmLeadTel" placeholder="(00) 00000-0000">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>E-mail</label>
                    <input type="email" id="crmLeadEmail" placeholder="contato@email.com">
                </div>
                <div class="form-group">
                    <label>Cidade</label>
                    <input type="text" id="crmLeadCidade" placeholder="Cidade">
                </div>
                <div class="form-group" style="max-width:100px">
                    <label>UF</label>
                    <input type="text" id="crmLeadUF" maxlength="2" style="text-transform:uppercase">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Vendedor responsável</label>
                    <input list="crmLeadVendedores" id="crmLeadVendedor" placeholder="Nome do vendedor">
                    <datalist id="crmLeadVendedores">${vendedores.map(v=>`<option value="${_crmEsc(v)}">`).join('')}</datalist>
                </div>
                <div class="form-group">
                    <label>Origem</label>
                    <select id="crmLeadOrigem">
                        <option value="">—</option>
                        <option>Visita</option><option>Ligação</option><option>WhatsApp</option>
                        <option>Indicação</option><option>Site</option><option>Outro</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Segmento</label>
                    <select id="crmLeadSegmento">
                        <option value="">—</option>
                        <option>Garagem</option><option>Concessionária</option><option>Locadora</option>
                        <option>Particular</option><option>Transportadora</option><option>Outro</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Potencial</label>
                    <select id="crmLeadPotencial">
                        <option value="">—</option><option>Alto</option><option>Médio</option><option>Baixo</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Prioridade</label>
                    <select id="crmLeadPrio">
                        <option value="">—</option><option>A</option><option>B</option><option>C</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group full-width">
                    <label>Observações</label>
                    <textarea id="crmLeadObs" rows="2" placeholder="Contexto do primeiro contato, interesse, rota inicial..."></textarea>
                </div>
            </div>
            <div id="crmMsgLead" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">🌱 Salvar Lead</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>
    `);
}

async function _crmSalvarNovoLead(){
    const msg = document.getElementById('crmMsgLead');
    const nome = document.getElementById('crmLeadNome').value.trim();
    if (!nome){ msg.textContent = 'Informe pelo menos o nome.'; msg.className='message error'; return; }

    // Gera código único (mesmo padrão CLI-XXXX do salvarCadastroCliente).
    // Fica coerente porque lead e cliente vivem na mesma tabela.
    let codigo = null;
    try {
        const { data: ultimo } = await supabase.from('clientes').select('id').order('id', {ascending:false}).limit(1);
        const prox = ultimo?.[0]?.id ? ultimo[0].id + 1 : 1;
        codigo = 'CLI-' + String(prox).padStart(4,'0');
    } catch(_){}

    const payload = {
        nome,
        nome_contato: document.getElementById('crmLeadContato').value.trim() || null,
        telefone: document.getElementById('crmLeadTel').value.trim() || null,
        email: document.getElementById('crmLeadEmail').value.trim() || null,
        cidade: document.getElementById('crmLeadCidade').value.trim() || null,
        uf: (document.getElementById('crmLeadUF').value||'').toUpperCase() || null,
        vendedor_responsavel: document.getElementById('crmLeadVendedor').value.trim() || null,
        origem_prospeccao: document.getElementById('crmLeadOrigem').value || null,
        segmento: document.getElementById('crmLeadSegmento').value || null,
        potencial: document.getElementById('crmLeadPotencial').value || null,
        prioridade: document.getElementById('crmLeadPrio').value || null,
        observacoes_crm: document.getElementById('crmLeadObs').value.trim() || null,
        eh_lead: true,
        status_negociacao: 'Novo Cadastro',
        tipo_cliente: 'particular', // fallback obrigatório se a coluna for NOT NULL — ajusta ao converter
        codigo
    };

    try {
        const { data, error } = await supabase.from('clientes').insert(payload).select().single();
        if (error) throw error;
        // Recarrega clientesGlobais
        const { data: cli } = await supabase.from('clientes').select('*').order('nome');
        if (cli) window.clientesGlobais = cli;
        _crmFecharModal();
        _crmMontarCadastros();
        if (typeof toastOk === 'function') toastOk('🌱 Lead criado.');
    } catch(e){
        msg.textContent = 'Erro ao salvar lead: ' + e.message;
        msg.className = 'message error';
    }
}

// ─── MODAL: EDITAR CAMPOS CRM DE UM CLIENTE ───────────────────────
function _crmModalEditarCRM(clienteId){
    const c = (window.clientesGlobais||[]).find(x => Number(x.id)===Number(clienteId));
    if (!c) return;
    const vendedores = _crmListaVendedores();
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">✏️ CRM — ${_crmEsc(c.nome)}</h2>
        <p class="text-muted" style="margin-top:-.4rem">Campos complementares. Dados básicos são editados no Cadastro do Comercial.</p>
        <form id="formCRMEditar" class="form" onsubmit="event.preventDefault(); _crmSalvarEdicaoCRM(${c.id});">
            <div class="form-row">
                <div class="form-group">
                    <label>Vendedor responsável</label>
                    <input list="crmEdVendedores" id="crmEdVendedor" value="${_crmEsc(c.vendedor_responsavel||'')}">
                    <datalist id="crmEdVendedores">${vendedores.map(v=>`<option value="${_crmEsc(v)}">`).join('')}</datalist>
                </div>
                <div class="form-group">
                    <label>Nome do contato</label>
                    <input type="text" id="crmEdContato" value="${_crmEsc(c.nome_contato||'')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Prioridade</label>
                    <select id="crmEdPrio">
                        <option value="">—</option>
                        ${['A','B','C'].map(p=>`<option ${c.prioridade===p?'selected':''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Potencial</label>
                    <select id="crmEdPotencial">
                        <option value="">—</option>
                        ${['Alto','Médio','Baixo'].map(p=>`<option ${c.potencial===p?'selected':''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Segmento</label>
                    <select id="crmEdSegmento">
                        <option value="">—</option>
                        ${['Garagem','Concessionária','Locadora','Particular','Transportadora','Outro'].map(s=>`<option ${c.segmento===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Status da negociação</label>
                    <select id="crmEdStatus">
                        <option value="">—</option>
                        ${['Novo Cadastro','Prospecção em Andamento','Negociação Aberta','Proposta Enviada','Fechado - Ganho','Fechado - Perdido'].map(s=>`<option ${c.status_negociacao===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Origem</label>
                    <select id="crmEdOrigem">
                        <option value="">—</option>
                        ${['Visita','Ligação','WhatsApp','Indicação','Site','Outro'].map(s=>`<option ${c.origem_prospeccao===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group full-width">
                    <label>Observações CRM</label>
                    <textarea id="crmEdObs" rows="2">${_crmEsc(c.observacoes_crm||'')}</textarea>
                </div>
            </div>
            <div id="crmMsgEd" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Salvar</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>
    `);
}
async function _crmSalvarEdicaoCRM(clienteId){
    const msg = document.getElementById('crmMsgEd');
    const patch = {
        vendedor_responsavel: document.getElementById('crmEdVendedor').value.trim() || null,
        nome_contato:  document.getElementById('crmEdContato').value.trim() || null,
        prioridade:    document.getElementById('crmEdPrio').value || null,
        potencial:     document.getElementById('crmEdPotencial').value || null,
        segmento:      document.getElementById('crmEdSegmento').value || null,
        status_negociacao: document.getElementById('crmEdStatus').value || null,
        origem_prospeccao: document.getElementById('crmEdOrigem').value || null,
        observacoes_crm: document.getElementById('crmEdObs').value.trim() || null
    };
    try {
        const { error } = await supabase.from('clientes').update(patch).eq('id', clienteId);
        if (error) throw error;
        const { data: cli } = await supabase.from('clientes').select('*').order('nome');
        if (cli) window.clientesGlobais = cli;
        _crmFecharModal();
        _crmMontarCadastros();
        if (typeof toastOk === 'function') toastOk('✏️ CRM atualizado.');
    } catch(e){
        msg.textContent = 'Erro ao salvar: ' + e.message;
        msg.className = 'message error';
    }
}

// ─── MODAL: CONVERTER LEAD EM CLIENTE ─────────────────────────────
// Abre um form com o que falta para virar cliente pleno: tipo,
// CNPJ/CPF, endereço, forma de pagamento. Ao salvar, `eh_lead=false`.
function _crmModalConverterLead(clienteId){
    const c = (window.clientesGlobais||[]).find(x => Number(x.id)===Number(clienteId));
    if (!c) return;
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">🔄 Converter Lead em Cliente</h2>
        <p class="text-muted" style="margin-top:-.4rem"><strong>${_crmEsc(c.nome)}</strong> — complete os dados para poder gerar pedidos.</p>
        <form id="formCRMConv" class="form" onsubmit="event.preventDefault(); _crmSalvarConversao(${c.id});">
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo *</label>
                    <select id="crmConvTipo" required>
                        <option value="">Selecione</option>
                        <option value="empresa" ${c.tipo_cliente==='empresa'?'selected':''}>Empresa</option>
                        <option value="concessionaria" ${c.tipo_cliente==='concessionaria'?'selected':''}>Concessionária</option>
                        <option value="locadora" ${c.tipo_cliente==='locadora'?'selected':''}>Locadora</option>
                        <option value="garagista" ${c.tipo_cliente==='garagista'?'selected':''}>Garagista</option>
                        <option value="transportadora" ${c.tipo_cliente==='transportadora'?'selected':''}>Transportadora</option>
                        <option value="particular" ${c.tipo_cliente==='particular'?'selected':''}>Particular</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>CNPJ</label>
                    <input type="text" id="crmConvCnpj" value="${_crmEsc(c.cnpj||'')}" placeholder="00.000.000/0000-00">
                </div>
                <div class="form-group">
                    <label>CPF</label>
                    <input type="text" id="crmConvCpf" value="${_crmEsc(c.cpf||'')}" placeholder="000.000.000-00">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Endereço</label>
                    <input type="text" id="crmConvEnd" value="${_crmEsc(c.endereco||'')}">
                </div>
                <div class="form-group" style="max-width:100px">
                    <label>Nº</label>
                    <input type="text" id="crmConvNum" value="${_crmEsc(c.numero||'')}">
                </div>
                <div class="form-group">
                    <label>Bairro</label>
                    <input type="text" id="crmConvBairro" value="${_crmEsc(c.bairro||'')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Forma de pagamento</label>
                    <select id="crmConvPag">
                        <option value="">—</option>
                        <option value="boleto" ${c.forma_pagamento==='boleto'?'selected':''}>Boleto</option>
                        <option value="pix" ${c.forma_pagamento==='pix'?'selected':''}>PIX</option>
                        <option value="transferencia" ${c.forma_pagamento==='transferencia'?'selected':''}>Transferência</option>
                    </select>
                </div>
            </div>
            <div id="crmMsgConv" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">✅ Converter em Cliente</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>
    `);
}
async function _crmSalvarConversao(clienteId){
    const msg = document.getElementById('crmMsgConv');
    const tipo = document.getElementById('crmConvTipo').value;
    if (!tipo){ msg.textContent = 'Selecione o tipo de cliente.'; msg.className='message error'; return; }
    const patch = {
        tipo_cliente: tipo,
        cnpj: document.getElementById('crmConvCnpj').value.trim() || null,
        cpf:  document.getElementById('crmConvCpf').value.trim() || null,
        endereco: document.getElementById('crmConvEnd').value.trim() || null,
        numero:   document.getElementById('crmConvNum').value.trim() || null,
        bairro:   document.getElementById('crmConvBairro').value.trim() || null,
        forma_pagamento: document.getElementById('crmConvPag').value || null,
        eh_lead: false
    };
    try {
        const { error } = await supabase.from('clientes').update(patch).eq('id', clienteId);
        if (error) throw error;
        const { data: cli } = await supabase.from('clientes').select('*').order('nome');
        if (cli) window.clientesGlobais = cli;
        _crmFecharModal();
        _crmMontarCadastros();
        if (typeof toastOk === 'function') toastOk('✅ Lead convertido em cliente.');
    } catch(e){
        msg.textContent = 'Erro ao converter: ' + e.message;
        msg.className = 'message error';
    }
}

// ─── AÇÃO: IR PARA PEDIDO ─────────────────────────────────────────
// Se for lead → obriga complementar antes.
// Se for cliente → navega direto para o lançamento comercial.
function _crmIrParaPedido(clienteId){
    const c = (window.clientesGlobais||[]).find(x => Number(x.id)===Number(clienteId));
    if (!c) return;
    if (c.eh_lead){
        if (confirm(`"${c.nome}" ainda é um LEAD. Complete o cadastro antes de gerar o pedido.`)){
            _crmModalConverterLead(c.id);
        }
        return;
    }
    // Se o admin/CRM tem acesso à aba Comercial, tenta abrir.
    // Caso contrário só mostra a mensagem.
    const btn = document.querySelector('.nav-btn[data-tab="comercial"]');
    if (btn){
        btn.click();
        if (typeof toastOk === 'function') toastOk(`📋 Cliente ${c.nome} selecionado — use no lançamento.`);
    } else {
        alert(`Vá até o perfil Comercial → Lançamento e selecione o cliente "${c.nome}".`);
    }
}

// ===================================================================
// MODAIS · TAREFAS
// ===================================================================
function _crmModalNovaAcao(clienteId){
    const c = (window.clientesGlobais||[]).find(x => Number(x.id)===Number(clienteId));
    if (!c) return;
    const vendedores = _crmListaVendedores();
    const respPadrao = c.vendedor_responsavel || _crmUsuario();
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">📝 Nova Ação — ${_crmEsc(c.nome)}</h2>
        <form id="formCRMAcao" class="form" onsubmit="event.preventDefault(); _crmSalvarAcao(${c.id});">
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo da ação *</label>
                    <select id="crmAcTipo" required>
                        <option value="">Selecione</option>
                        <option>Visita</option><option>Ligação</option><option>WhatsApp</option>
                        <option>Proposta</option><option>Negociação</option>
                        <option>Manutenção de Cliente</option><option>Novo Cliente</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Data / hora desta ação</label>
                    <input type="datetime-local" id="crmAcData" value="${new Date().toISOString().slice(0,16)}">
                </div>
                <div class="form-group">
                    <label>Nome do contato</label>
                    <input type="text" id="crmAcContato" value="${_crmEsc(c.nome_contato||'')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group full-width">
                    <label>O que foi tratado</label>
                    <textarea id="crmAcDesc" rows="2"></textarea>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Resultado</label>
                    <select id="crmAcResult">
                        <option value="">—</option>
                        <option>Contato Realizado</option><option>Cliente Aprovado</option>
                        <option>Negócio Fechado</option><option>Negócio Perdido</option>
                        <option>Em Negociação</option><option>Proposta Enviada</option>
                        <option>Sem Retorno</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Motivo (se perdido)</label>
                    <select id="crmAcMotivo">
                        <option value="">—</option>
                        <option>Preço</option><option>Prazo não atendido</option>
                        <option>Não atendemos a rota</option><option>Outro</option>
                    </select>
                </div>
            </div>

            <hr style="border:none;border-top:1px solid var(--border-soft);margin:.4rem 0">
            <div class="text-muted" style="font-size:.82rem;margin-bottom:.4rem">Próxima ação programada (aparece na Agenda):</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo da próxima</label>
                    <select id="crmAcProxTipo">
                        <option value="">—</option>
                        <option>Visita</option><option>Ligação</option><option>WhatsApp</option>
                        <option>Proposta</option><option>Negociação</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Data da próxima</label>
                    <input type="date" id="crmAcProxData">
                </div>
                <div class="form-group">
                    <label>Descrição da próxima</label>
                    <input type="text" id="crmAcProxDesc" placeholder="Ex.: Enviar proposta revisada">
                </div>
            </div>

            <hr style="border:none;border-top:1px solid var(--border-soft);margin:.4rem 0">
            <div class="form-row">
                <div class="form-group">
                    <label>Responsável *</label>
                    <input list="crmAcRespList" id="crmAcResp" value="${_crmEsc(respPadrao)}" required>
                    <datalist id="crmAcRespList">${vendedores.map(v=>`<option value="${_crmEsc(v)}">`).join('')}</datalist>
                </div>
                <div class="form-group">
                    <label>Transferir para (opcional)</label>
                    <input list="crmAcTransfList" id="crmAcTransf" placeholder="Outro vendedor">
                    <datalist id="crmAcTransfList">${vendedores.map(v=>`<option value="${_crmEsc(v)}">`).join('')}</datalist>
                </div>
            </div>

            <div id="crmMsgAc" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Registrar</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>
    `);
}
async function _crmSalvarAcao(clienteId){
    const msg = document.getElementById('crmMsgAc');
    const tipo = document.getElementById('crmAcTipo').value;
    const resp = document.getElementById('crmAcResp').value.trim();
    if (!tipo){ msg.textContent = 'Selecione o tipo da ação.'; msg.className='message error'; return; }
    if (!resp){ msg.textContent = 'Informe o responsável.'; msg.className='message error'; return; }

    const dataAcao = document.getElementById('crmAcData').value;
    const transf = document.getElementById('crmAcTransf').value.trim();

    const cli = (window.clientesGlobais||[]).find(x => Number(x.id)===Number(clienteId));

    const payload = {
        cliente_id: clienteId,
        tipo_relacionamento: cli?.eh_lead ? 'Novo Cliente' : 'Cliente já atendido',
        tipo_acao: tipo,
        nome_contato: document.getElementById('crmAcContato').value.trim() || null,
        descricao: document.getElementById('crmAcDesc').value.trim() || null,
        resultado: document.getElementById('crmAcResult').value || null,
        motivo_perdido: document.getElementById('crmAcMotivo').value || null,
        proxima_acao: document.getElementById('crmAcProxDesc').value.trim() || null,
        tipo_proxima_acao: document.getElementById('crmAcProxTipo').value || null,
        data_proxima_acao: document.getElementById('crmAcProxData').value || null,
        responsavel: resp,
        transferir_para: transf || null,
        transferencia_aceita: null,
        data_acao: dataAcao ? new Date(dataAcao).toISOString() : new Date().toISOString(),
        criado_por: _crmUsuario()
    };
    try {
        const { data, error } = await supabase.from('crm_tarefas').insert(payload).select().single();
        if (error) throw error;
        window.crmTarefasGlobais.push(data);
        _crmFecharModal();
        // Rerenderiza a aba atual (qualquer uma; todas podem mostrar tarefas)
        _crmMontarCadastros();
        _crmMontarTarefas();
        _crmMontarPainel();
        if (typeof toastOk === 'function') toastOk('📝 Ação registrada.');
    } catch(e){
        msg.textContent = 'Erro ao salvar: ' + e.message;
        msg.className = 'message error';
    }
}

async function _crmConcluirTarefa(tarefaId){
    if (!confirm('Marcar esta tarefa como concluída?')) return;
    try {
        const { error } = await supabase.from('crm_tarefas').update({ concluida: true }).eq('id', tarefaId);
        if (error) throw error;
        const t = window.crmTarefasGlobais.find(x => x.id === tarefaId);
        if (t) t.concluida = true;
        _crmMontarTarefas(); _crmMontarPainel();
    } catch(e){ alert('Erro: ' + e.message); }
}

async function _crmExcluirTarefa(tarefaId){
    if (!confirm('Excluir esta tarefa? Não é possível desfazer.')) return;
    try {
        const { error } = await supabase.from('crm_tarefas').delete().eq('id', tarefaId);
        if (error) throw error;
        window.crmTarefasGlobais = window.crmTarefasGlobais.filter(x => x.id !== tarefaId);
        _crmMontarTarefas(); _crmMontarPainel();
    } catch(e){ alert('Erro: ' + e.message); }
}

// Aceite/recusa de transferência. Quando aceita, transfere de fato
// o vendedor responsável do cliente (se houver cliente vinculado).
async function _crmAceitarTransfer(tarefaId, aceitar){
    const t = window.crmTarefasGlobais.find(x => x.id === tarefaId);
    if (!t) return;
    try {
        const patch = { transferencia_aceita: !!aceitar };
        const { error } = await supabase.from('crm_tarefas').update(patch).eq('id', tarefaId);
        if (error) throw error;
        t.transferencia_aceita = !!aceitar;

        // Se aceitou e há cliente vinculado → efetiva a transferência
        if (aceitar && t.cliente_id && t.transferir_para){
            await supabase.from('clientes').update({ vendedor_responsavel: t.transferir_para }).eq('id', t.cliente_id);
            const cli = window.clientesGlobais.find(c => Number(c.id) === Number(t.cliente_id));
            if (cli) cli.vendedor_responsavel = t.transferir_para;
        }
        _crmMontarTarefas(); _crmMontarCadastros(); _crmMontarPainel();
        if (typeof toastOk === 'function') toastOk(aceitar ? '✅ Transferência aceita.' : '❌ Transferência recusada.');
    } catch(e){ alert('Erro: ' + e.message); }
}
