/* =====================================================================
   MOVEMASTER — MÓDULO 13 · CRM COMERCIAL
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   ─────────────────────────────────────────────────────────────────────
   Um item de menu "🎯 CRM" (aba `crm`) com 3 áreas internas:
     1) Cadastro ............ clientes do Comercial + leads (mesma tabela)
     2) Gestor de Tarefas ... ações comerciais e próximas ações
     3) Painel .............. quem atender, o quê, quando, o que atrasou

   DE ONDE VÊM OS DADOS (nada duplicado)
   - Clientes e leads: tabela `clientes` (clientesGlobais do mod-01).
     Lead = `eh_lead = true`. Ao converter, é o MESMO registro que vira
     cliente — o histórico (crm_tarefas.cliente_id) continua ligado.
   - Transportes: `pedidos` (pedidosGlobais). O "último transporte" sai
     daí; não existe controle manual de movimentação.
   - Ações/tarefas/transferências: tabela `crm_tarefas` (histórico).
   - Vendedores: tabela `perfis` (usuários ativos comercial/crm/admin).
     Quem registra/transfere é sempre o usuário logado.

   ATENÇÃO: clientesGlobais/pedidosGlobais são `let` no mod-01 — NÃO
   existem em window. A versão anterior lia window.clientesGlobais e o
   CRM abria sempre vazio. Aqui o acesso é pelo nome global direto.

   Banco: sql/2026-09-28-crm.sql (colunas do CRM + tabela crm_tarefas).
   ===================================================================== */

// -------------------------------------------------------------------
// ESTADO
// -------------------------------------------------------------------
window.crmTarefasGlobais = window.crmTarefasGlobais || [];
let _crmTarefasCarregado = false;
let _crmVendedoresDb = null;          // nomes vindos de perfis
let _crmAreaAtual = 'cadastro';

// Regra que JÁ existia no CRM/planilha da empresa ("Sem Movimentação +30
// dias"). Mantida — não foram criadas outras faixas de temperatura.
const CRM_DIAS_SEM_MOV = 30;

const CRM_TIPOS_ACAO = ['Ligação','WhatsApp','E-mail','Visita','Atendimento','Proposta','Negociação'];
const CRM_RESULTADOS = ['Contato realizado','Cliente vai avaliar','Aguardando retorno','Proposta enviada','Em negociação','Negócio fechado','Negócio perdido','Sem retorno'];
const CRM_STATUS_NEG = ['Novo Cadastro','Prospecção em Andamento','Negociação Aberta','Proposta Enviada','Fechado - Ganho','Fechado - Perdido'];
const CRM_STATUS_ANDAMENTO = new Set(['Prospecção em Andamento','Negociação Aberta','Proposta Enviada']);
const CRM_TIPOS_CLIENTE = { empresa:'Empresa', concessionaria:'Concessionária', locadora:'Locadora',
    garagista:'Garagista', transportadora:'Transportadora', particular:'Particular' };
const CRM_ICONE = { 'Ligação':'📞','WhatsApp':'💬','E-mail':'✉️','Visita':'🤝','Atendimento':'🗣️',
    'Proposta':'📄','Negociação':'💼','Transferência':'🔁','Conversão':'✅' };

let _crmFiltrosCad = { busca:'', vendedor:'', tipo:'', prioridade:'', situacao:'' };
let _crmFiltrosTar = { situacao:'abertas', responsavel:'', busca:'' };
let _crmFiltrosPainel = { vendedor:'', tipo:'', busca:'', de:'', ate:'', status:'abertas' };

// -------------------------------------------------------------------
// UTILIDADES
// -------------------------------------------------------------------
function _crmClientes(){ return (typeof clientesGlobais !== 'undefined' && clientesGlobais) ? clientesGlobais : []; }
function _crmPedidos(){ return (typeof pedidosGlobais !== 'undefined' && pedidosGlobais) ? pedidosGlobais : []; }
function _crmCli(id){ return _crmClientes().find(c => Number(c.id) === Number(id)) || null; }
// Atualiza o registro NA MESMA lista usada pelo Comercial (sem cópia)
function _crmAtualizarClienteLocal(row){
    const arr = _crmClientes();
    const i = arr.findIndex(c => Number(c.id) === Number(row.id));
    if (i >= 0) Object.assign(arr[i], row); else arr.push(row);
}
function _crmNorm(s){
    return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
}
function _crmData(d){
    if (!d) return null;
    const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
    return isNaN(dt.getTime()) ? null : dt;
}
function _crmDiasDesde(d){
    const dt = _crmData(d);
    return dt ? Math.floor((Date.now() - dt.getTime()) / 86400000) : null;
}
function _crmFmtData(d){ const dt = _crmData(d); return dt ? dt.toLocaleDateString('pt-BR') : '—'; }
function _crmFmtDataHora(d){
    const dt = _crmData(d); if (!dt) return '—';
    return String(d).length <= 10 ? dt.toLocaleDateString('pt-BR')
        : dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}
function _crmHojeStr(){
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function _crmAgoraLocal(){
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function _crmSomaDias(iso, n){
    const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function _crmEsc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _crmUsuario(){
    return (typeof _usuarioAtualNome === 'function' ? _usuarioAtualNome() : null) || 'CRM';
}
function _crmToast(msg){
    if (typeof toastOk === 'function') toastOk(msg);
    else if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(msg);
}

// Último transporte REAL do cliente (ignora cancelados e reservas).
// Por id e, para pedidos antigos sem cliente_id, pelo nome.
function _crmUltimoTransporte(cli){
    if (!cli) return null;
    const nome = _crmNorm(cli.nome);
    let melhor = null, melhorData = '';
    _crmPedidos().forEach(p => {
        if (p.status === 'Cancelado' || p.isReserva) return;
        const doCli = (p.clienteId && Number(p.clienteId) === Number(cli.id)) || (nome && _crmNorm(p.cliente) === nome);
        if (!doCli) return;
        const d = String(p.dataSolicitacao || p.createdAt || '');
        if (d > melhorData){ melhorData = d; melhor = p; }
    });
    return melhor;
}
// Situação de movimentação de um cliente (lead não entra: nunca transportou)
function _crmMovimentacao(cli){
    const ult = _crmUltimoTransporte(cli);
    const dias = ult ? _crmDiasDesde(ult.dataSolicitacao || ult.createdAt) : null;
    const semMov = !cli.eh_lead && (dias == null || dias > CRM_DIAS_SEM_MOV);
    return { ult, dias, semMov };
}

// Vendedores = usuários ativos do sistema (comercial / crm / admin) +
// nomes que já estão nos cadastros/tarefas (histórico antigo).
async function _crmCarregarVendedores(){
    if (_crmVendedoresDb || !window.supabase) return;
    try {
        const { data } = await supabase.from('perfis').select('nome, perfil, ativo')
            .in('perfil', ['comercial','crm','admin']).eq('ativo', true);
        _crmVendedoresDb = (data || []).map(p => p.nome).filter(Boolean);
    } catch(e){ _crmVendedoresDb = []; }
}
function _crmListaVendedores(){
    const set = new Set(_crmVendedoresDb || []);
    _crmClientes().forEach(c => { if (c.vendedor_responsavel) set.add(c.vendedor_responsavel); });
    (window.crmTarefasGlobais||[]).forEach(t => { if (t.responsavel) set.add(t.responsavel); });
    const eu = _crmUsuario(); if (eu && eu !== 'CRM' && eu !== 'Sistema') set.add(eu);
    return [...set].sort((a,b) => a.localeCompare(b, 'pt-BR'));
}
function _crmOptsVendedores(sel){
    return _crmListaVendedores().map(v => `<option value="${_crmEsc(v)}" ${v===sel?'selected':''}>${_crmEsc(v)}</option>`).join('');
}

// Situação de uma tarefa (a "próxima ação" registrada numa ação)
function _crmSituacaoTarefa(t){
    if (!t.data_proxima_acao) return t.concluida ? 'concluida' : 'registro';
    if (t.concluida) return 'concluida';
    const hoje = _crmHojeStr();
    const d = String(t.data_proxima_acao).slice(0,10);
    if (d < hoje) return 'atrasada';
    if (d === hoje) return 'hoje';
    if (d <= _crmSomaDias(hoje, 7)) return 'semana';
    return 'futura';
}
const CRM_SIT = {
    atrasada: { lbl:'⚠️ ATRASADA', cor:'#ef4444' }, hoje: { lbl:'🕒 HOJE', cor:'#f59e0b' },
    semana:   { lbl:'📅 Esta semana', cor:'#3b82f6' }, futura: { lbl:'⏳ Programada', cor:'#6b7280' },
    concluida:{ lbl:'✅ Concluída', cor:'#22c55e' }, registro: { lbl:'📝 Registro', cor:'#6b7280' }
};
function _crmTarefaAberta(t){ return !!t.data_proxima_acao && !t.concluida; }

// Insere em crm_tarefas tolerando colunas novas que o banco ainda não
// tenha (mesmo padrão do mmInserirPedidos): sem isso, uma coluna faltando
// derrubaria o registro inteiro.
const _CRM_CAMPOS_OPCIONAIS = ['assunto','transferido_de','concluida_em','concluida_por'];
async function _crmInserirTarefa(payload){
    let { data, error } = await supabase.from('crm_tarefas').insert(payload).select().single();
    if (error && /column|schema cache/i.test(error.message || '')){
        const p2 = { ...payload };
        _CRM_CAMPOS_OPCIONAIS.forEach(k => delete p2[k]);
        ({ data, error } = await supabase.from('crm_tarefas').insert(p2).select().single());
        if (data) Object.assign(data, payload, { id: data.id });
    }
    if (error) throw error;
    window.crmTarefasGlobais.push(data);
    return data;
}
async function _crmAtualizarTarefa(id, patch){
    let { error } = await supabase.from('crm_tarefas').update(patch).eq('id', id);
    if (error && /column|schema cache/i.test(error.message || '')){
        const p2 = { ...patch }; _CRM_CAMPOS_OPCIONAIS.forEach(k => delete p2[k]);
        ({ error } = await supabase.from('crm_tarefas').update(p2).eq('id', id));
    }
    if (error) throw error;
    const t = window.crmTarefasGlobais.find(x => Number(x.id) === Number(id));
    if (t) Object.assign(t, patch);
}

// -------------------------------------------------------------------
// CARREGAMENTO
// -------------------------------------------------------------------
async function carregarCRMTarefas(forcar){
    if (_crmTarefasCarregado && !forcar) return;
    if (!window.supabase) return;
    try {
        const { data, error } = await supabase.from('crm_tarefas').select('*').order('data_acao', { ascending: false });
        if (error) throw error;
        window.crmTarefasGlobais = data || [];
        _crmTarefasCarregado = true;
    } catch(e){
        console.warn('[CRM] crm_tarefas não carregou (rode sql/2026-09-28-crm.sql):', e.message);
        window.crmTarefasGlobais = [];
        _crmTarefasCarregado = true;
    }
}

// -------------------------------------------------------------------
// ABA ÚNICA "CRM" + NAVEGAÇÃO ENTRE AS 3 ÁREAS
// -------------------------------------------------------------------
async function renderizarCRM(area){
    if (area) _crmAreaAtual = area;
    document.querySelectorAll('#crmSubnav .crm-subnav-btn').forEach(b =>
        b.classList.toggle('ativo', b.getAttribute('data-area') === _crmAreaAtual));
    const ids = { cadastro:'crmCadastrosConteudo', tarefas:'crmTarefasConteudo', painel:'crmPainelConteudo' };
    Object.entries(ids).forEach(([k, id]) => {
        const el = document.getElementById(id); if (el) el.style.display = k === _crmAreaAtual ? '' : 'none';
    });
    // Dados do sistema ainda chegando: espera o sinal do mod-01
    if (!window.__mmDadosCarregados && window.__mmDadosProntos){
        await Promise.race([window.__mmDadosProntos, new Promise(r => setTimeout(r, 4000))]);
    }
    await Promise.all([carregarCRMTarefas(), _crmCarregarVendedores()]);
    _crmRedesenhar();
}
function crmIrPara(area){ renderizarCRM(area); }
function _crmRedesenhar(){
    if (_crmAreaAtual === 'cadastro') _crmMontarCadastros();
    else if (_crmAreaAtual === 'tarefas') _crmMontarTarefas();
    else _crmMontarPainel();
}
// Nomes antigos (chamados por outras partes do sistema)
async function renderizarCRMCadastros(){ return renderizarCRM('cadastro'); }
async function renderizarCRMTarefas(){ return renderizarCRM('tarefas'); }
async function renderizarCRMPainel(){ return renderizarCRM('painel'); }

// ===================================================================
// ÁREA 1 · CADASTRO (clientes do Comercial + leads)
// ===================================================================
function _crmSetFiltroCad(k, v){ _crmFiltrosCad[k] = v; _mmDeb ? _mmDeb('crmCad', _crmMontarCadastros, 250) : _crmMontarCadastros(); }
function _crmLimparFiltrosCad(){ _crmFiltrosCad = { busca:'', vendedor:'', tipo:'', prioridade:'', situacao:'' }; _crmMontarCadastros(); }

function _crmMontarCadastros(){
    const cont = document.getElementById('crmCadastrosConteudo');
    if (!cont) return;
    const f = _crmFiltrosCad;
    const clientes = _crmClientes();
    const tarefas = window.crmTarefasGlobais || [];
    const abertasPorCli = {};
    tarefas.forEach(t => { if (_crmTarefaAberta(t)) abertasPorCli[t.cliente_id] = (abertasPorCli[t.cliente_id]||0) + 1; });

    const linhas = clientes.map(c => ({ c, ...(_crmMovimentacao(c)) }));
    const busca = _crmNorm(f.busca);
    const filt = linhas.filter(({ c, semMov }) => {
        if (busca){
            const alvo = _crmNorm([c.nome, c.nome_fantasia, c.nome_contato, c.cidade, c.codigo, c.cnpj, c.cpf, c.telefone, c.email].join(' '));
            if (!alvo.includes(busca)) return false;
        }
        if (f.vendedor === '__sem__' && c.vendedor_responsavel) return false;
        if (f.vendedor && f.vendedor !== '__sem__' && c.vendedor_responsavel !== f.vendedor) return false;
        if (f.tipo === 'lead' && !c.eh_lead) return false;
        if (f.tipo === 'cliente' && c.eh_lead) return false;
        if (f.prioridade && (c.prioridade||'') !== f.prioridade) return false;
        if (f.situacao === 'semmov' && !semMov) return false;
        if (f.situacao === 'ativo' && (c.eh_lead || semMov)) return false;
        return true;
    });
    const prio = { A:0, B:1, C:2 };
    filt.sort((a, b) => {
        if (!!a.c.eh_lead !== !!b.c.eh_lead) return a.c.eh_lead ? -1 : 1;
        const pa = prio[(a.c.prioridade||'').toUpperCase()] ?? 3, pb = prio[(b.c.prioridade||'').toUpperCase()] ?? 3;
        if (pa !== pb) return pa - pb;
        return String(a.c.nome||'').localeCompare(String(b.c.nome||''), 'pt-BR');
    });

    const totLeads = clientes.filter(c => c.eh_lead).length;
    const totSemMov = linhas.filter(l => l.semMov).length;
    const LIM = 300;
    const mostra = filt.slice(0, LIM);

    const corpo = !mostra.length
        ? `<tr><td colspan="7" class="text-center text-muted" style="padding:1.6rem">Nenhum cliente ou lead no filtro.</td></tr>`
        : mostra.map(({ c, ult, dias, semMov }) => {
            const tag = c.eh_lead ? '<span class="crm-tag crm-tag-lead">🌱 LEAD</span>' : '<span class="crm-tag crm-tag-cli">🏢 Cliente</span>';
            const corPrio = { A:'#ef4444', B:'#3b82f6', C:'#6b7280' }[(c.prioridade||'').toUpperCase()];
            const ultTxt = c.eh_lead ? '<span class="crm-sub">— (lead)</span>'
                : ult ? `${_crmFmtData(ult.dataSolicitacao || ult.createdAt)} <span class="crm-sub">· ${dias}d</span><div class="crm-sub">${_crmEsc(ult.cidadeOrigem||'—')} → ${_crmEsc(ult.cidadeDestino||'—')}</div>`
                : '<span class="crm-sub">sem transporte registrado</span>';
            const ab = abertasPorCli[c.id] || 0;
            return `<tr>
                <td>
                    <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">
                        ${tag}
                        <a href="#" class="crm-link-nome" onclick="event.preventDefault();_crmModalHistorico(${c.id})">${_crmEsc(c.nome)}</a>
                        ${semMov ? '<span class="crm-tag crm-tag-semmov">⚠️ SEM MOVIMENTAÇÃO</span>' : ''}
                        ${ab ? `<span class="crm-tag crm-tag-tarefa" title="Tarefas em aberto">⏭️ ${ab}</span>` : ''}
                    </div>
                    <div class="crm-sub">${_crmEsc(c.codigo||'')}${c.cidade ? ' · ' + _crmEsc(c.cidade) : ''}${c.uf ? '/' + _crmEsc(c.uf) : ''}</div>
                </td>
                <td>${c.nome_contato ? `<div>${_crmEsc(c.nome_contato)}</div>` : ''}${c.telefone ? `<div class="crm-sub">📱 ${_crmEsc(c.telefone)}</div>` : ''}${c.email ? `<div class="crm-sub">✉ ${_crmEsc(c.email)}</div>` : ''}${!c.nome_contato && !c.telefone && !c.email ? '<span class="crm-sub">—</span>' : ''}</td>
                <td>${c.vendedor_responsavel ? _crmEsc(c.vendedor_responsavel) : '<span class="crm-sub">sem responsável</span>'}</td>
                <td>${c.prioridade ? `<span class="crm-tag" style="background:${corPrio||'#6b7280'};color:#fff">${_crmEsc(c.prioridade)}</span>` : '<span class="crm-sub">—</span>'}${c.potencial ? `<div class="crm-sub">Pot.: ${_crmEsc(c.potencial)}</div>` : ''}</td>
                <td style="font-size:.82rem">${c.status_negociacao ? _crmEsc(c.status_negociacao) : '<span class="crm-sub">—</span>'}</td>
                <td style="font-size:.82rem">${ultTxt}</td>
                <td class="crm-acoes-td">
                    <button class="btn btn-sm btn-secondary" onclick="_crmModalHistorico(${c.id})" title="Histórico do relacionamento">📜</button>
                    <button class="btn btn-sm btn-secondary" onclick="_crmModalNovaAcao(${c.id})" title="Registrar ação">📝</button>
                    <button class="btn btn-sm btn-secondary" onclick="_crmModalEditarCRM(${c.id})" title="Prioridade, potencial e dados comerciais">✏️</button>
                    <button class="btn btn-sm btn-secondary" onclick="_crmModalTransferir(${c.id})" title="Transferir para outro vendedor">🔁</button>
                    <button class="btn btn-sm btn-primary" onclick="_crmIrParaPedido(${c.id})" title="${c.eh_lead ? 'Completar cadastro e criar pedido' : 'Criar pedido'}">📋 Pedido</button>
                </td>
            </tr>`;
        }).join('');

    cont.innerHTML = `
        <div class="cg-header crm-cab">
            <h2 style="margin:0">📇 Cadastro — Clientes & Leads</h2>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                <button class="btn btn-primary btn-sm" onclick="_crmModalNovoLead()">🌱 Novo Lead</button>
                <button class="btn btn-secondary btn-sm" onclick="_crmModalNovaAcao()">📝 Registrar ação</button>
            </div>
        </div>
        <div class="crm-cards-topo">
            <div class="crm-mini-card"><div class="crm-mini-num">${clientes.length - totLeads}</div><div class="crm-mini-lab">Clientes</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:#22c55e">${totLeads}</div><div class="crm-mini-lab">Leads</div></div>
            <div class="crm-mini-card crm-mini-click" onclick="_crmSetFiltroCad('situacao','semmov')"><div class="crm-mini-num" style="color:#f59e0b">${totSemMov}</div><div class="crm-mini-lab">Sem movimentação (+${CRM_DIAS_SEM_MOV}d)</div></div>
            <div class="crm-mini-card"><div class="crm-mini-num" style="color:var(--accent)">${filt.length}</div><div class="crm-mini-lab">No filtro</div></div>
        </div>
        <div class="cg-filtros" style="margin-top:1rem">
            <div class="cg-filtro" style="min-width:220px"><label>Buscar</label>
                <input type="text" id="crmBuscaCad" value="${_crmEsc(f.busca)}" placeholder="Nome, contato, cidade, CNPJ..." oninput="_crmSetFiltroCad('busca', this.value)"></div>
            <div class="cg-filtro"><label>Tipo</label>
                <select onchange="_crmSetFiltroCad('tipo', this.value)">
                    <option value="">Todos</option>
                    <option value="lead" ${f.tipo==='lead'?'selected':''}>Só leads</option>
                    <option value="cliente" ${f.tipo==='cliente'?'selected':''}>Só clientes</option>
                </select></div>
            <div class="cg-filtro"><label>Vendedor</label>
                <select onchange="_crmSetFiltroCad('vendedor', this.value)">
                    <option value="">Todos</option>
                    <option value="__sem__" ${f.vendedor==='__sem__'?'selected':''}>Sem responsável</option>
                    ${_crmOptsVendedores(f.vendedor)}
                </select></div>
            <div class="cg-filtro"><label>Prioridade</label>
                <select onchange="_crmSetFiltroCad('prioridade', this.value)">
                    <option value="">Todas</option>
                    ${['A','B','C'].map(p => `<option ${f.prioridade===p?'selected':''}>${p}</option>`).join('')}
                </select></div>
            <div class="cg-filtro"><label>Movimentação</label>
                <select onchange="_crmSetFiltroCad('situacao', this.value)">
                    <option value="">Todas</option>
                    <option value="semmov" ${f.situacao==='semmov'?'selected':''}>⚠️ Sem movimentação</option>
                    <option value="ativo" ${f.situacao==='ativo'?'selected':''}>Com transporte recente</option>
                </select></div>
            <div class="cg-filtro" style="align-self:flex-end"><button class="btn btn-secondary btn-sm" onclick="_crmLimparFiltrosCad()">Limpar</button></div>
        </div>
        <div class="card" style="margin-top:1rem;padding:0">
            <div class="tabela-scroll">
                <table class="ocup-tabela crm-tabela">
                    <thead><tr><th>Cliente / Lead</th><th>Contato</th><th>Vendedor</th><th>Prio / Potencial</th><th>Status</th><th>Último transporte</th><th style="text-align:right">Ações</th></tr></thead>
                    <tbody>${corpo}</tbody>
                </table>
            </div>
            ${filt.length > LIM ? `<div class="crm-sub" style="padding:.6rem 1rem">Mostrando ${LIM} de ${filt.length}. Use a busca para achar os demais.</div>` : ''}
        </div>`;
}

// ===================================================================
// ÁREA 2 · GESTOR DE TAREFAS
// ===================================================================
function _crmSetFiltroTar(k, v){ _crmFiltrosTar[k] = v; _mmDeb ? _mmDeb('crmTar', _crmMontarTarefas, 250) : _crmMontarTarefas(); }

// Cartão de tarefa/ação (usado no Gestor e no Painel)
function _crmCardTarefa(t){
    const cli = _crmCli(t.cliente_id);
    const sit = _crmSituacaoTarefa(t);
    const s = CRM_SIT[sit];
    const aberta = _crmTarefaAberta(t);
    return `<div class="crm-tarefa-card">
        <div class="crm-tarefa-topo">
            <div>
                <div class="crm-tarefa-titulo">
                    <span class="crm-tag" style="background:${s.cor};color:#fff">${s.lbl}</span>
                    <span style="margin-left:.4rem">${aberta ? '⏭️ ' + _crmEsc(t.tipo_proxima_acao || 'Próxima ação') : (CRM_ICONE[t.tipo_acao]||'📝') + ' ' + _crmEsc(t.tipo_acao || 'Ação')}</span>
                    ${cli?.eh_lead ? '<span class="crm-tag crm-tag-lead" style="margin-left:.3rem">🌱 LEAD</span>' : ''}
                </div>
                <div class="crm-tarefa-cli">👤 ${cli ? `<a href="#" class="crm-link-nome" onclick="event.preventDefault();_crmModalHistorico(${cli.id})">${_crmEsc(cli.nome)}</a>` : `<em>cadastro #${_crmEsc(t.cliente_id)}</em>`}${t.nome_contato ? ' · contato: ' + _crmEsc(t.nome_contato) : ''}</div>
            </div>
            <div class="crm-tarefa-data">
                ${aberta ? `<strong>${_crmFmtData(t.data_proxima_acao)}</strong>` : _crmFmtDataHora(t.data_acao)}
                <div class="crm-sub">Resp.: <strong>${_crmEsc(t.responsavel || '—')}</strong></div>
            </div>
        </div>
        ${aberta && t.proxima_acao ? `<div class="crm-tarefa-desc"><strong>O que fazer:</strong> ${_crmEsc(t.proxima_acao)}</div>` : ''}
        ${t.assunto ? `<div class="crm-tarefa-desc"><strong>Assunto:</strong> ${_crmEsc(t.assunto)}</div>` : ''}
        ${!aberta && t.descricao ? `<div class="crm-tarefa-desc"><strong>Tratado:</strong> ${_crmEsc(t.descricao)}</div>` : ''}
        ${aberta ? `<div class="crm-sub" style="margin-top:.25rem">Origem: ${_crmEsc(t.tipo_acao || 'ação')} em ${_crmFmtData(t.data_acao)}${t.resultado ? ' · ' + _crmEsc(t.resultado) : ''}</div>`
                 : (t.resultado ? `<div class="crm-tarefa-desc"><strong>Resultado:</strong> ${_crmEsc(t.resultado)}${t.motivo_perdido ? ' · ' + _crmEsc(t.motivo_perdido) : ''}</div>` : '')}
        ${t.concluida && t.concluida_por ? `<div class="crm-sub">Concluída por ${_crmEsc(t.concluida_por)}${t.concluida_em ? ' em ' + _crmFmtDataHora(t.concluida_em) : ''}</div>` : ''}
        <div class="crm-tarefa-acoes">
            ${aberta ? `<button class="btn btn-sm btn-primary" onclick="_crmExecutarTarefa(${t.id})" title="Registrar o que foi feito nesta tarefa">✓ Registrar execução</button>
                        <button class="btn btn-sm btn-secondary" onclick="_crmConcluirTarefa(${t.id})" title="Fechar sem registrar nova ação">Concluir</button>` : ''}
            ${cli ? `<button class="btn btn-sm btn-secondary" onclick="_crmModalHistorico(${cli.id})">📜 Histórico</button>` : ''}
        </div>
    </div>`;
}

function _crmMontarTarefas(){
    const cont = document.getElementById('crmTarefasConteudo');
    if (!cont) return;
    const f = _crmFiltrosTar;
    // O gestor mostra as TAREFAS (próximas ações). Registros sem próxima
    // ação ficam no histórico do cliente e aparecem aqui só em "Todas".
    const todas = (window.crmTarefasGlobais || []).filter(t => t.tipo_acao !== 'Transferência' && t.tipo_acao !== 'Conversão');
    const busca = _crmNorm(f.busca);
    const cnt = { atrasada:0, hoje:0, semana:0, abertas:0, concluidas:0 };
    todas.forEach(t => {
        const s = _crmSituacaoTarefa(t);
        if (_crmTarefaAberta(t)){ cnt.abertas++; if (s === 'atrasada') cnt.atrasada++; if (s === 'hoje') cnt.hoje++; if (s === 'hoje' || s === 'semana') cnt.semana++; }
        else if (t.data_proxima_acao && t.concluida) cnt.concluidas++;
    });
    const filt = todas.filter(t => {
        const s = _crmSituacaoTarefa(t);
        if (f.situacao === 'abertas' && !_crmTarefaAberta(t)) return false;
        if (f.situacao === 'atrasadas' && s !== 'atrasada') return false;
        if (f.situacao === 'hoje' && s !== 'hoje') return false;
        if (f.situacao === 'semana' && !(_crmTarefaAberta(t) && (s === 'hoje' || s === 'semana'))) return false;
        if (f.situacao === 'concluidas' && !(t.data_proxima_acao && t.concluida)) return false;
        if (f.responsavel && t.responsavel !== f.responsavel) return false;
        if (busca){
            const cli = _crmCli(t.cliente_id);
            if (!_crmNorm([cli?.nome, t.assunto, t.descricao, t.proxima_acao, t.responsavel, t.nome_contato].join(' ')).includes(busca)) return false;
        }
        return true;
    });
    filt.sort((a, b) => {
        const aa = _crmTarefaAberta(a), ab = _crmTarefaAberta(b);
        if (aa !== ab) return aa ? -1 : 1;
        if (aa) return String(a.data_proxima_acao).localeCompare(String(b.data_proxima_acao));
        return String(b.data_acao||'').localeCompare(String(a.data_acao||''));
    });
    const chip = (k, lbl, n, cor) => `<button class="crm-chip ${f.situacao===k?'sel':''}" onclick="_crmSetFiltroTar('situacao','${k}')">${lbl} <b style="color:${cor}">${n}</b></button>`;

    cont.innerHTML = `
        <div class="cg-header crm-cab">
            <h2 style="margin:0">✅ Gestor de Tarefas</h2>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                <button class="btn btn-primary btn-sm" onclick="_crmModalNovaAcao()">📝 Registrar ação</button>
                <button class="btn btn-secondary btn-sm" onclick="carregarCRMTarefas(true).then(_crmMontarTarefas)">🔄 Atualizar</button>
            </div>
        </div>
        <div class="crm-chips">
            ${chip('abertas','Em aberto', cnt.abertas, 'inherit')}
            ${chip('atrasadas','⚠️ Atrasadas', cnt.atrasada, '#ef4444')}
            ${chip('hoje','🕒 Hoje', cnt.hoje, '#f59e0b')}
            ${chip('semana','📅 Próximos 7 dias', cnt.semana, '#3b82f6')}
            ${chip('concluidas','✅ Concluídas', cnt.concluidas, '#22c55e')}
            ${chip('todas','Todos os registros', todas.length, 'inherit')}
        </div>
        <div class="cg-filtros" style="margin-top:.8rem">
            <div class="cg-filtro" style="min-width:220px"><label>Buscar</label>
                <input type="text" id="crmBuscaTar" value="${_crmEsc(f.busca)}" placeholder="Cliente, assunto, responsável..." oninput="_crmSetFiltroTar('busca', this.value)"></div>
            <div class="cg-filtro"><label>Responsável</label>
                <select onchange="_crmSetFiltroTar('responsavel', this.value)"><option value="">Todos</option>${_crmOptsVendedores(f.responsavel)}</select></div>
        </div>
        <div class="crm-tarefas-lista">${filt.length ? filt.slice(0, 200).map(_crmCardTarefa).join('')
            : `<div class="card" style="padding:1.6rem;text-align:center;color:var(--text-secondary)">Nada aqui. ${todas.length ? 'Ajuste os filtros.' : 'Registre a primeira ação (📝) a partir de um cliente ou lead.'}</div>`}</div>`;
}

// ===================================================================
// ÁREA 3 · PAINEL DE ACOMPANHAMENTO
// ===================================================================
function _crmSetFiltroPainel(k, v){ _crmFiltrosPainel[k] = v; _mmDeb ? _mmDeb('crmPainel', _crmMontarPainel, 250) : _crmMontarPainel(); }

function _crmMontarPainel(){
    const cont = document.getElementById('crmPainelConteudo');
    if (!cont) return;
    const f = _crmFiltrosPainel;
    const busca = _crmNorm(f.busca);
    const hoje = _crmHojeStr(), em7 = _crmSomaDias(hoje, 7);

    // Cadastros no filtro (vendedor / tipo / nome)
    const clientes = _crmClientes().filter(c => {
        if (f.vendedor && c.vendedor_responsavel !== f.vendedor) return false;
        if (f.tipo === 'lead' && !c.eh_lead) return false;
        if (f.tipo === 'cliente' && c.eh_lead) return false;
        if (busca && !_crmNorm(c.nome + ' ' + (c.nome_fantasia||'')).includes(busca)) return false;
        return true;
    });
    const idsCli = new Set(clientes.map(c => Number(c.id)));
    const movs = clientes.map(c => ({ c, ...(_crmMovimentacao(c)) }));
    const semMov = movs.filter(m => m.semMov).sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999));

    // Tarefas no filtro (vendedor = responsável da tarefa; período = data da tarefa)
    const tarefas = (window.crmTarefasGlobais || []).filter(t => {
        if (!t.data_proxima_acao) return false;
        if (f.vendedor && t.responsavel !== f.vendedor) return false;
        if ((f.tipo || busca) && !idsCli.has(Number(t.cliente_id))) return false;
        const d = String(t.data_proxima_acao).slice(0,10);
        if (f.de && d < f.de) return false;
        if (f.ate && d > f.ate) return false;
        return true;
    });
    const abertas = tarefas.filter(_crmTarefaAberta);
    const atrasadas = abertas.filter(t => String(t.data_proxima_acao).slice(0,10) < hoje);
    const pendentes = abertas.filter(t => String(t.data_proxima_acao).slice(0,10) >= hoje);
    const visitas = abertas.filter(t => t.tipo_proxima_acao === 'Visita' && String(t.data_proxima_acao).slice(0,10) >= hoje);
    const proximos = pendentes.filter(t => String(t.data_proxima_acao).slice(0,10) <= em7);
    const negociacoes = clientes.filter(c => CRM_STATUS_ANDAMENTO.has(c.status_negociacao || '')).length;

    // Lista principal: responde "o que fazer, quando, o que atrasou"
    let lista = f.status === 'atrasadas' ? atrasadas
              : f.status === 'pendentes' ? pendentes
              : f.status === 'concluidas' ? tarefas.filter(t => t.concluida)
              : f.status === 'todas' ? tarefas
              : abertas;
    lista = lista.slice().sort((a, b) => String(a.data_proxima_acao).localeCompare(String(b.data_proxima_acao)));

    // Por vendedor
    const rank = {};
    const r = v => (rank[v] = rank[v] || { clientes:0, leads:0, semMov:0, abertas:0, atrasadas:0 });
    movs.forEach(({ c, semMov: sm }) => {
        const v = c.vendedor_responsavel || '(sem responsável)';
        r(v)[c.eh_lead ? 'leads' : 'clientes']++; if (sm) r(v).semMov++;
    });
    abertas.forEach(t => { const v = t.responsavel || '(sem responsável)'; r(v).abertas++; if (String(t.data_proxima_acao).slice(0,10) < hoje) r(v).atrasadas++; });
    const rankArr = Object.entries(rank).sort((a, b) => (b[1].atrasadas - a[1].atrasadas) || (b[1].abertas - a[1].abertas));

    const kpi = (lbl, v, sub, cor, acao) => `<div class="crm-kpi crm-kpi-v2 ${acao ? 'crm-mini-click' : ''}" style="--kc:${cor||'var(--text-primary)'}" ${acao ? `onclick="${acao}"` : ''}>
        <div class="crm-kpi-lab">${lbl}</div><div class="crm-kpi-num">${v}</div><div class="crm-kpi-sub">${sub}</div></div>`;
    const totLeads = clientes.filter(c => c.eh_lead).length;

    cont.innerHTML = `
        <div class="cg-header crm-cab">
            <h2 style="margin:0">📊 Painel de Acompanhamento</h2>
            <button class="btn btn-secondary btn-sm" onclick="carregarCRMTarefas(true).then(_crmMontarPainel)">🔄 Atualizar</button>
        </div>
        <div class="cg-filtros">
            <div class="cg-filtro"><label>Vendedor</label>
                <select onchange="_crmSetFiltroPainel('vendedor', this.value)"><option value="">Todos</option>${_crmOptsVendedores(f.vendedor)}</select></div>
            <div class="cg-filtro"><label>Cliente/Lead</label>
                <select onchange="_crmSetFiltroPainel('tipo', this.value)">
                    <option value="">Todos</option>
                    <option value="cliente" ${f.tipo==='cliente'?'selected':''}>Só clientes</option>
                    <option value="lead" ${f.tipo==='lead'?'selected':''}>Só leads</option>
                </select></div>
            <div class="cg-filtro" style="min-width:180px"><label>Nome</label>
                <input type="text" id="crmBuscaPainel" value="${_crmEsc(f.busca)}" placeholder="Buscar cliente/lead" oninput="_crmSetFiltroPainel('busca', this.value)"></div>
            <div class="cg-filtro"><label>Período de</label><input type="date" value="${_crmEsc(f.de)}" onchange="_crmSetFiltroPainel('de', this.value)"></div>
            <div class="cg-filtro"><label>até</label><input type="date" value="${_crmEsc(f.ate)}" onchange="_crmSetFiltroPainel('ate', this.value)"></div>
            <div class="cg-filtro"><label>Status da tarefa</label>
                <select onchange="_crmSetFiltroPainel('status', this.value)">
                    <option value="abertas" ${f.status==='abertas'?'selected':''}>Em aberto (pendentes + atrasadas)</option>
                    <option value="atrasadas" ${f.status==='atrasadas'?'selected':''}>Só atrasadas</option>
                    <option value="pendentes" ${f.status==='pendentes'?'selected':''}>Só pendentes (em dia)</option>
                    <option value="concluidas" ${f.status==='concluidas'?'selected':''}>Concluídas</option>
                    <option value="todas" ${f.status==='todas'?'selected':''}>Todas</option>
                </select></div>
            <div class="cg-filtro" style="align-self:flex-end"><button class="btn btn-secondary btn-sm" onclick="_crmFiltrosPainel={vendedor:'',tipo:'',busca:'',de:'',ate:'',status:'abertas'};_crmMontarPainel()">Limpar</button></div>
        </div>
        <div class="crm-kpi-grid">
            ${kpi('Total de clientes', clientes.length - totLeads, 'Cadastro do Comercial', 'var(--accent)')}
            ${kpi('Total de leads', totLeads, 'Ainda não são clientes', '#22c55e')}
            ${kpi('Clientes sem movimentação', semMov.length, `Sem transporte há +${CRM_DIAS_SEM_MOV} dias`, '#f59e0b', "document.getElementById('crmSecSemMov')?.scrollIntoView({behavior:'smooth'})")}
            ${kpi('Tarefas pendentes', pendentes.length, 'Em dia (hoje em diante)', '#3b82f6', "_crmSetFiltroPainel('status','pendentes')")}
            ${kpi('Tarefas atrasadas', atrasadas.length, 'Data já passou', '#ef4444', "_crmSetFiltroPainel('status','atrasadas')")}
            ${kpi('Visitas programadas', visitas.length, 'Próxima ação = Visita', '#a855f7')}
            ${kpi('Próximos atendimentos', proximos.length, 'Próximos 7 dias', '#0ea5e9')}
            ${kpi('Negociações em andamento', negociacoes, 'Prospecção · Negociação · Proposta', '#3b82f6')}
        </div>

        <div class="card" style="padding:0;margin-top:1rem">
            <div class="crm-card-titulo">🗓️ O que precisa ser feito — ${ { abertas:'em aberto', atrasadas:'atrasadas', pendentes:'pendentes em dia', concluidas:'concluídas', todas:'todas' }[f.status] || '' } (${lista.length})</div>
            <div class="tabela-scroll"><table class="ocup-tabela crm-tabela">
                <thead><tr><th>Quando</th><th>Quem (cliente/lead)</th><th>O quê</th><th>Responsável</th><th></th></tr></thead>
                <tbody>${lista.length ? lista.slice(0, 150).map(t => {
                    const cli = _crmCli(t.cliente_id);
                    const sit = CRM_SIT[_crmSituacaoTarefa(t)];
                    return `<tr>
                        <td><strong style="color:${sit.cor}">${_crmFmtData(t.data_proxima_acao)}</strong><div class="crm-sub">${sit.lbl}</div></td>
                        <td>${cli ? `<a href="#" class="crm-link-nome" onclick="event.preventDefault();_crmModalHistorico(${cli.id})">${_crmEsc(cli.nome)}</a>${cli.eh_lead ? ' <span class="crm-tag crm-tag-lead">LEAD</span>' : ''}` : '#' + _crmEsc(t.cliente_id)}</td>
                        <td>${_crmEsc(t.tipo_proxima_acao || '—')}${t.proxima_acao ? `<div class="crm-sub">${_crmEsc(t.proxima_acao)}</div>` : ''}</td>
                        <td>${_crmEsc(t.responsavel || '—')}</td>
                        <td style="text-align:right">${_crmTarefaAberta(t) ? `<button class="btn btn-sm btn-primary" onclick="_crmExecutarTarefa(${t.id})">✓ Registrar</button>` : ''}</td>
                    </tr>`;
                }).join('') : '<tr><td colspan="5" class="text-center text-muted" style="padding:1rem">Nada no filtro.</td></tr>'}</tbody>
            </table></div>
        </div>

        <div class="crm-painel-linha">
            <div class="card" style="padding:0;flex:1;min-width:340px" id="crmSecSemMov">
                <div class="crm-card-titulo">⚠️ Clientes sem movimentação (${semMov.length})</div>
                <div class="tabela-scroll"><table class="ocup-tabela crm-tabela">
                    <thead><tr><th>Cliente</th><th>Último transporte</th><th>Vendedor</th><th></th></tr></thead>
                    <tbody>${semMov.length ? semMov.slice(0, 30).map(({ c, ult, dias }) => `<tr>
                        <td><a href="#" class="crm-link-nome" onclick="event.preventDefault();_crmModalHistorico(${c.id})">${_crmEsc(c.nome)}</a></td>
                        <td>${ult ? `${_crmFmtData(ult.dataSolicitacao || ult.createdAt)} <div class="crm-sub" style="color:#f59e0b">${dias} dias sem movimentação</div>` : '<span class="crm-sub">nunca transportou</span>'}</td>
                        <td>${_crmEsc(c.vendedor_responsavel || '—')}</td>
                        <td style="text-align:right"><button class="btn btn-sm btn-secondary" onclick="_crmModalNovaAcao(${c.id})">📝 Ação</button></td>
                    </tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted" style="padding:1rem">Nenhum 🎉</td></tr>'}</tbody>
                </table></div>
                ${semMov.length > 30 ? `<div class="crm-sub" style="padding:.5rem 1rem">+${semMov.length - 30} — veja todos em Cadastro → Movimentação: Sem movimentação.</div>` : ''}
            </div>
            <div class="card" style="padding:0;flex:1;min-width:340px">
                <div class="crm-card-titulo">👥 Por vendedor</div>
                <div class="tabela-scroll"><table class="ocup-tabela">
                    <thead><tr><th>Vendedor</th><th>Clientes</th><th>Leads</th><th>Sem mov.</th><th>Em aberto</th><th>Atrasadas</th></tr></thead>
                    <tbody>${rankArr.length ? rankArr.map(([v, d]) => `<tr>
                        <td><strong>${_crmEsc(v)}</strong></td><td>${d.clientes}</td><td>${d.leads}</td><td>${d.semMov}</td><td>${d.abertas}</td>
                        <td style="${d.atrasadas ? 'color:#ef4444;font-weight:700' : ''}">${d.atrasadas}</td></tr>`).join('')
                        : '<tr><td colspan="6" class="text-center text-muted" style="padding:1rem">—</td></tr>'}</tbody>
                </table></div>
            </div>
        </div>`;
}

// ===================================================================
// MODAL (genérico do CRM)
// ===================================================================
function _crmAbrirModal(html, largura){
    let m = document.getElementById('crmModal');
    if (!m){
        m = document.createElement('div');
        m.id = 'crmModal';
        m.className = 'modal';
        m.innerHTML = `<div class="modal-content" id="crmModalConteudo"></div>`;
        m.addEventListener('click', e => { if (e.target === m) _crmFecharModal(); });
        document.body.appendChild(m);
    }
    const c = document.getElementById('crmModalConteudo');
    c.style.maxWidth = (largura || 640) + 'px';
    c.innerHTML = html;
    m.style.display = 'flex';
}
function _crmFecharModal(){ const m = document.getElementById('crmModal'); if (m) m.style.display = 'none'; }
function _crmMsg(id, txt){ const el = document.getElementById(id); if (el){ el.textContent = txt; el.className = 'message show error'; } }

// ===================================================================
// HISTÓRICO DO CLIENTE / LEAD (linha do tempo)
// Ações e transferências (crm_tarefas) + transportes já existentes
// (pedidos, agrupados por dia e trecho — nada é copiado).
// ===================================================================
function _crmModalHistorico(clienteId){
    const c = _crmCli(clienteId);
    if (!c) return;
    const { ult, dias, semMov } = _crmMovimentacao(c);
    const itens = [];
    (window.crmTarefasGlobais || []).filter(t => Number(t.cliente_id) === Number(c.id)).forEach(t => {
        itens.push({ data: String(t.data_acao || t.created_at || ''), tipo: 'acao', t });
        if (t.data_proxima_acao) itens.push({ data: String(t.data_proxima_acao).slice(0,10) + 'T23:59', tipo: 'proxima', t });
    });
    const nome = _crmNorm(c.nome);
    const grupos = {};
    _crmPedidos().forEach(p => {
        const doCli = (p.clienteId && Number(p.clienteId) === Number(c.id)) || (nome && _crmNorm(p.cliente) === nome);
        if (!doCli) return;
        const dia = String(p.dataSolicitacao || p.createdAt || '').slice(0,10);
        const k = dia + '|' + (p.cidadeOrigem||'') + '|' + (p.cidadeDestino||'');
        (grupos[k] = grupos[k] || { dia, orig: p.cidadeOrigem, dest: p.cidadeDestino, pedidos: [] }).pedidos.push(p);
    });
    Object.values(grupos).forEach(g => itens.push({ data: g.dia + 'T12:00', tipo: 'transporte', g }));
    itens.sort((a, b) => b.data.localeCompare(a.data));

    const linha = it => {
        if (it.tipo === 'transporte'){
            const g = it.g;
            const st = {}; g.pedidos.forEach(p => { st[p.status || '—'] = (st[p.status || '—'] || 0) + 1; });
            return `<div class="crm-hist-item crm-hist-op">
                <div class="crm-hist-data">${_crmFmtData(g.dia)}</div>
                <div class="crm-hist-corpo"><strong>🚛 Transporte</strong> — ${g.pedidos.length} veículo(s) · ${_crmEsc(g.orig||'—')} → ${_crmEsc(g.dest||'—')}
                    <div class="crm-sub">${Object.entries(st).map(([s, n]) => `${_crmEsc(s)}: ${n}`).join(' · ')} · pedidos ${g.pedidos.slice(0, 6).map(p => '#' + p.id).join(', ')}${g.pedidos.length > 6 ? '…' : ''}</div></div>
            </div>`;
        }
        const t = it.t;
        if (it.tipo === 'proxima'){
            const s = CRM_SIT[_crmSituacaoTarefa(t)];
            return `<div class="crm-hist-item crm-hist-prox">
                <div class="crm-hist-data">${_crmFmtData(t.data_proxima_acao)}</div>
                <div class="crm-hist-corpo"><strong>⏭️ Próxima ação: ${_crmEsc(t.tipo_proxima_acao || '—')}</strong> <span class="crm-tag" style="background:${s.cor};color:#fff">${s.lbl}</span>
                    <div class="crm-sub">Responsável: ${_crmEsc(t.responsavel || '—')}${t.proxima_acao ? ' · ' + _crmEsc(t.proxima_acao) : ''}</div>
                    ${_crmTarefaAberta(t) ? `<button class="btn btn-sm btn-primary" style="margin-top:.3rem" onclick="_crmExecutarTarefa(${t.id})">✓ Registrar execução</button>` : ''}</div>
            </div>`;
        }
        if (t.tipo_acao === 'Transferência'){
            return `<div class="crm-hist-item crm-hist-transf">
                <div class="crm-hist-data">${_crmFmtDataHora(t.data_acao)}</div>
                <div class="crm-hist-corpo"><strong>🔁 Transferência de atendimento</strong>
                    <div>De <strong>${_crmEsc(t.transferido_de || '—')}</strong> para <strong>${_crmEsc(t.transferir_para || t.responsavel || '—')}</strong></div>
                    <div class="crm-sub">Transferido por ${_crmEsc(t.criado_por || '—')}${t.descricao ? ' · ' + _crmEsc(t.descricao) : ''}</div></div>
            </div>`;
        }
        return `<div class="crm-hist-item">
            <div class="crm-hist-data">${_crmFmtDataHora(t.data_acao)}</div>
            <div class="crm-hist-corpo"><strong>${CRM_ICONE[t.tipo_acao] || '📝'} ${_crmEsc(t.tipo_acao || 'Ação')}</strong>
                <div class="crm-sub">Responsável: ${_crmEsc(t.responsavel || '—')}${t.nome_contato ? ' · contato: ' + _crmEsc(t.nome_contato) : ''}${t.criado_por && t.criado_por !== t.responsavel ? ' · registrado por ' + _crmEsc(t.criado_por) : ''}</div>
                ${t.assunto ? `<div>Assunto: ${_crmEsc(t.assunto)}</div>` : ''}
                ${t.descricao ? `<div>Tratado: ${_crmEsc(t.descricao)}</div>` : ''}
                ${t.resultado ? `<div>Resultado: <strong>${_crmEsc(t.resultado)}</strong>${t.motivo_perdido ? ' · ' + _crmEsc(t.motivo_perdido) : ''}</div>` : ''}</div>
        </div>`;
    };

    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">📜 ${_crmEsc(c.nome)} ${c.eh_lead ? '<span class="crm-tag crm-tag-lead">🌱 LEAD</span>' : '<span class="crm-tag crm-tag-cli">🏢 Cliente</span>'}</h2>
        <div class="crm-hist-resumo">
            <div><span>Vendedor</span><strong>${_crmEsc(c.vendedor_responsavel || '—')}</strong></div>
            <div><span>Contato</span><strong>${_crmEsc(c.nome_contato || '—')}</strong>${c.telefone ? `<div class="crm-sub">📱 ${_crmEsc(c.telefone)}</div>` : ''}</div>
            <div><span>Prioridade / Potencial</span><strong>${_crmEsc(c.prioridade || '—')} / ${_crmEsc(c.potencial || '—')}</strong></div>
            <div><span>Status</span><strong>${_crmEsc(c.status_negociacao || '—')}</strong></div>
            <div><span>Último transporte</span><strong>${c.eh_lead ? '—' : ult ? _crmFmtData(ult.dataSolicitacao || ult.createdAt) : 'nunca'}</strong>${semMov ? `<div class="crm-sub" style="color:#f59e0b">⚠️ sem movimentação${dias != null ? ' · ' + dias + ' dias' : ''}</div>` : ''}</div>
        </div>
        ${c.observacoes_crm ? `<div class="crm-sub" style="margin:.4rem 0">📝 ${_crmEsc(c.observacoes_crm)}</div>` : ''}
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.6rem 0 .8rem">
            <button class="btn btn-sm btn-primary" onclick="_crmModalNovaAcao(${c.id})">📝 Registrar ação</button>
            <button class="btn btn-sm btn-secondary" onclick="_crmModalEditarCRM(${c.id})">✏️ Dados comerciais</button>
            <button class="btn btn-sm btn-secondary" onclick="_crmModalTransferir(${c.id})">🔁 Transferir</button>
            <button class="btn btn-sm btn-secondary" onclick="_crmIrParaPedido(${c.id})">📋 ${c.eh_lead ? 'Completar cadastro e criar pedido' : 'Criar pedido'}</button>
        </div>
        <div class="crm-hist-lista">${itens.length ? itens.slice(0, 120).map(linha).join('')
            : '<p class="text-muted" style="padding:1rem;text-align:center">Nenhum registro ainda. Registre a primeira ação.</p>'}</div>
        ${itens.length > 120 ? `<div class="crm-sub">Mostrando os 120 registros mais recentes de ${itens.length}.</div>` : ''}
    `, 760);
}

// ===================================================================
// NOVO LEAD (cadastro simples, na MESMA tabela de clientes)
// ===================================================================
function _crmModalNovoLead(){
    const eu = _crmUsuario();
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">🌱 Novo Lead</h2>
        <p class="text-muted" style="margin-top:-.4rem">Cadastro simples. Os dados de cliente (CNPJ, endereço...) só são pedidos quando for criar o primeiro pedido.</p>
        <form class="form" onsubmit="event.preventDefault(); _crmSalvarNovoLead();">
            <div class="form-row"><div class="form-group full-width"><label>Nome / Empresa *</label>
                <input type="text" id="crmLeadNome" required maxlength="120"></div></div>
            <div class="form-row">
                <div class="form-group"><label>Pessoa de contato</label><input type="text" id="crmLeadContato" maxlength="80"></div>
                <div class="form-group"><label>Telefone / WhatsApp</label><input type="text" id="crmLeadTel" maxlength="20"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>E-mail</label><input type="email" id="crmLeadEmail" maxlength="120"></div>
                <div class="form-group"><label>Cidade</label><input type="text" id="crmLeadCidade" maxlength="80"></div>
                <div class="form-group" style="max-width:90px"><label>UF</label><input type="text" id="crmLeadUF" maxlength="2" style="text-transform:uppercase"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Vendedor responsável *</label>
                    <select id="crmLeadVendedor" required>${_crmOptsVendedores(eu)}</select></div>
                <div class="form-group"><label>Prioridade</label><select id="crmLeadPrio"><option value="">—</option><option>A</option><option>B</option><option>C</option></select></div>
                <div class="form-group"><label>Potencial</label><select id="crmLeadPot"><option value="">—</option><option>Alto</option><option>Médio</option><option>Baixo</option></select></div>
            </div>
            <div class="form-row"><div class="form-group full-width"><label>Observação inicial</label>
                <textarea id="crmLeadObs" rows="2" maxlength="1000" placeholder="Como chegou, interesse, rotas..."></textarea></div></div>
            <div id="crmMsgLead" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="crmBtnLead">🌱 Salvar Lead</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>`);
}

async function _crmSalvarNovoLead(){
    const v = id => (document.getElementById(id)?.value || '').trim();
    const nome = v('crmLeadNome');
    if (!nome) return _crmMsg('crmMsgLead', 'Informe o nome.');
    // Evita duplicar: mesmo nome, telefone ou e-mail de um cadastro existente
    const tel = v('crmLeadTel').replace(/\D/g,''), email = _crmNorm(v('crmLeadEmail'));
    const parecido = _crmClientes().find(c => _crmNorm(c.nome) === _crmNorm(nome)
        || (tel.length >= 8 && String(c.telefone||'').replace(/\D/g,'').endsWith(tel.slice(-8)))
        || (email && _crmNorm(c.email) === email));
    if (parecido && !confirm(`Já existe um cadastro parecido: "${parecido.nome}" (${parecido.eh_lead ? 'lead' : 'cliente'}).\n\nSe for a mesma empresa, cancele e use esse cadastro.\nCriar um novo lead mesmo assim?`)) return;

    const btn = document.getElementById('crmBtnLead'); if (btn) btn.disabled = true;
    let codigo = null;
    try {
        const { data: ultimo } = await supabase.from('clientes').select('id').order('id', { ascending:false }).limit(1);
        codigo = 'CLI-' + String((ultimo?.[0]?.id || 0) + 1).padStart(4, '0');
    } catch(_){}
    const payload = {
        nome, codigo, eh_lead: true, status_negociacao: 'Novo Cadastro',
        nome_contato: v('crmLeadContato') || null, telefone: v('crmLeadTel') || null, email: v('crmLeadEmail') || null,
        cidade: v('crmLeadCidade') || null, uf: v('crmLeadUF').toUpperCase() || null,
        vendedor_responsavel: v('crmLeadVendedor') || _crmUsuario(),
        prioridade: v('crmLeadPrio') || null, potencial: v('crmLeadPot') || null,
        observacoes_crm: v('crmLeadObs') || null,
        // tipo_cliente pode ser NOT NULL no banco: provisório até a conversão,
        // quando o vendedor escolhe o tipo de verdade.
        tipo_cliente: 'particular'
    };
    try {
        const { data, error } = await supabase.from('clientes').insert(payload).select().single();
        if (error) throw error;
        _crmAtualizarClienteLocal(data);
        _crmFecharModal();
        _crmRedesenhar();
        _crmToast('🌱 Lead criado.');
    } catch(e){
        if (btn) btn.disabled = false;
        _crmMsg('crmMsgLead', 'Erro ao salvar lead: ' + e.message + (/column/i.test(e.message) ? ' — rode o sql/2026-09-28-crm.sql no Supabase.' : ''));
    }
}

// ===================================================================
// DADOS COMERCIAIS (prioridade, potencial...) de cliente ou lead
// ===================================================================
function _crmModalEditarCRM(clienteId){
    const c = _crmCli(clienteId);
    if (!c) return;
    const sel = (lista, atual) => lista.map(x => `<option ${atual===x?'selected':''}>${x}</option>`).join('');
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">✏️ Dados comerciais — ${_crmEsc(c.nome)}</h2>
        <p class="text-muted" style="margin-top:-.4rem">Os demais dados (CNPJ, endereço...) continuam no Cadastro de Clientes do Comercial. Para trocar o vendedor use 🔁 Transferir.</p>
        <form class="form" onsubmit="event.preventDefault(); _crmSalvarEdicaoCRM(${c.id});">
            <div class="form-row">
                <div class="form-group"><label>Prioridade</label><select id="crmEdPrio"><option value="">—</option>${sel(['A','B','C'], c.prioridade)}</select></div>
                <div class="form-group"><label>Potencial</label><select id="crmEdPot"><option value="">—</option>${sel(['Alto','Médio','Baixo'], c.potencial)}</select></div>
                <div class="form-group"><label>Status da negociação</label><select id="crmEdStatus"><option value="">—</option>${sel(CRM_STATUS_NEG, c.status_negociacao)}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Pessoa de contato</label><input type="text" id="crmEdContato" value="${_crmEsc(c.nome_contato||'')}"></div>
                <div class="form-group"><label>Vendedor responsável</label>
                    ${c.vendedor_responsavel ? `<input type="text" value="${_crmEsc(c.vendedor_responsavel)}" disabled>`
                        : `<select id="crmEdVend"><option value="">—</option>${_crmOptsVendedores('')}</select>`}</div>
            </div>
            <div class="form-row"><div class="form-group full-width"><label>Observações</label>
                <textarea id="crmEdObs" rows="2">${_crmEsc(c.observacoes_crm||'')}</textarea></div></div>
            <div id="crmMsgEd" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">💾 Salvar</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>`);
}
async function _crmSalvarEdicaoCRM(clienteId){
    const v = id => (document.getElementById(id)?.value || '').trim();
    const patch = {
        prioridade: v('crmEdPrio') || null, potencial: v('crmEdPot') || null,
        status_negociacao: v('crmEdStatus') || null,
        nome_contato: v('crmEdContato') || null, observacoes_crm: v('crmEdObs') || null
    };
    // Primeiro responsável pode ser definido aqui; trocar = transferência
    if (document.getElementById('crmEdVend') && v('crmEdVend')) patch.vendedor_responsavel = v('crmEdVend');
    try {
        const { error } = await supabase.from('clientes').update(patch).eq('id', clienteId);
        if (error) throw error;
        _crmAtualizarClienteLocal({ id: clienteId, ...patch });
        _crmFecharModal();
        _crmRedesenhar();
        _crmToast('✏️ Dados comerciais salvos.');
    } catch(e){ _crmMsg('crmMsgEd', 'Erro ao salvar: ' + e.message); }
}

// ===================================================================
// TRANSFERÊNCIA DE ATENDIMENTO
// Troca o vendedor do cliente/lead, passa as tarefas EM ABERTO para o
// novo responsável e grava a transferência no histórico (quem, de quem,
// para quem, quando). Nada do histórico é apagado.
// ===================================================================
function _crmModalTransferir(clienteId){
    const c = _crmCli(clienteId);
    if (!c) return;
    const abertas = (window.crmTarefasGlobais||[]).filter(t => Number(t.cliente_id) === Number(c.id) && _crmTarefaAberta(t)).length;
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">🔁 Transferir atendimento</h2>
        <p><strong>${_crmEsc(c.nome)}</strong><br><span class="text-muted">Vendedor atual: <strong>${_crmEsc(c.vendedor_responsavel || 'sem responsável')}</strong></span></p>
        <form class="form" onsubmit="event.preventDefault(); _crmSalvarTransferencia(${c.id});">
            <div class="form-row"><div class="form-group full-width"><label>Transferir para *</label>
                <select id="crmTrPara" required><option value="">Selecione</option>${_crmListaVendedores().filter(v => v !== c.vendedor_responsavel).map(v => `<option value="${_crmEsc(v)}">${_crmEsc(v)}</option>`).join('')}</select></div></div>
            <div class="form-row"><div class="form-group full-width"><label>Motivo / observação</label>
                <input type="text" id="crmTrObs" maxlength="300" placeholder="Ex.: cliente é da região da Maria"></div></div>
            ${abertas ? `<p class="crm-sub">${abertas} tarefa(s) em aberto passam para o novo vendedor.</p>` : ''}
            <div id="crmMsgTr" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">🔁 Transferir</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>`, 520);
}
async function _crmSalvarTransferencia(clienteId){
    const c = _crmCli(clienteId);
    const para = (document.getElementById('crmTrPara')?.value || '').trim();
    if (!c || !para) return _crmMsg('crmMsgTr', 'Escolha o vendedor.');
    const de = c.vendedor_responsavel || null;
    const eu = _crmUsuario();
    try {
        const { error } = await supabase.from('clientes').update({ vendedor_responsavel: para }).eq('id', c.id);
        if (error) throw error;
        _crmAtualizarClienteLocal({ id: c.id, vendedor_responsavel: para });
        const abertas = (window.crmTarefasGlobais||[]).filter(t => Number(t.cliente_id) === Number(c.id) && _crmTarefaAberta(t));
        if (abertas.length){
            await supabase.from('crm_tarefas').update({ responsavel: para }).in('id', abertas.map(t => t.id));
            abertas.forEach(t => { t.responsavel = para; });
        }
        await _crmInserirTarefa({
            cliente_id: c.id, tipo_acao: 'Transferência', data_acao: new Date().toISOString(),
            responsavel: para, transferido_de: de, transferir_para: para, transferencia_aceita: true,
            assunto: 'Transferência de atendimento',
            descricao: (document.getElementById('crmTrObs')?.value || '').trim() || null,
            concluida: true, criado_por: eu
        });
        _crmFecharModal();
        _crmRedesenhar();
        _crmToast(`🔁 ${c.nome} agora é atendido por ${para}.`);
        if (typeof notificar === 'function') notificar({ nome: para, tipo: 'acao', titulo: '🔁 Atendimento transferido para você',
            mensagem: `${eu} transferiu ${c.nome}${de ? ' (antes: ' + de + ')' : ''} para você.` });
    } catch(e){ _crmMsg('crmMsgTr', 'Erro ao transferir: ' + e.message); }
}

// ===================================================================
// REGISTRAR AÇÃO (vira histórico; a "próxima ação" vira tarefa)
// ===================================================================
function _crmModalNovaAcao(clienteId, origemTarefaId){
    const c = clienteId ? _crmCli(clienteId) : null;
    const origem = origemTarefaId ? (window.crmTarefasGlobais||[]).find(t => Number(t.id) === Number(origemTarefaId)) : null;
    const eu = _crmUsuario();
    const resp = c?.vendedor_responsavel || eu;
    const optsTipo = sel => CRM_TIPOS_ACAO.map(t => `<option ${t===sel?'selected':''}>${t}</option>`).join('');
    const listaCli = !c ? `<datalist id="crmAcCliLista">${_crmClientes().map(x => `<option value="${_crmEsc(x.nome)}${x.eh_lead ? ' (lead)' : ''}">`).join('')}</datalist>` : '';
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">📝 Registrar ação${c ? ' — ' + _crmEsc(c.nome) : ''}</h2>
        ${origem ? `<p class="crm-sub" style="margin-top:-.3rem">Executando a tarefa: <strong>${_crmEsc(origem.tipo_proxima_acao||'')}</strong> de ${_crmFmtData(origem.data_proxima_acao)}${origem.proxima_acao ? ' — ' + _crmEsc(origem.proxima_acao) : ''}. Ao salvar, ela fica concluída.</p>` : ''}
        <form class="form" onsubmit="event.preventDefault(); _crmSalvarAcao(${c ? c.id : 'null'}, ${origem ? origem.id : 'null'});">
            ${!c ? `<div class="form-row"><div class="form-group full-width"><label>Cliente / Lead *</label>
                <input list="crmAcCliLista" id="crmAcCliente" required placeholder="Digite o nome">${listaCli}</div></div>` : ''}
            <div class="form-row">
                <div class="form-group"><label>Tipo de ação *</label><select id="crmAcTipo" required><option value="">Selecione</option>${optsTipo(origem?.tipo_proxima_acao || '')}</select></div>
                <div class="form-group"><label>Data *</label><input type="datetime-local" id="crmAcData" value="${_crmAgoraLocal()}" required></div>
                <div class="form-group"><label>Responsável *</label><select id="crmAcResp" required>${_crmOptsVendedores(resp)}</select></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Pessoa de contato</label><input type="text" id="crmAcContato" value="${_crmEsc(c?.nome_contato||'')}" maxlength="80"></div>
                <div class="form-group"><label>Assunto *</label><input type="text" id="crmAcAssunto" required maxlength="150" value="${_crmEsc(origem?.proxima_acao||'')}" placeholder="Ex.: aumento de demanda"></div>
            </div>
            <div class="form-row"><div class="form-group full-width"><label>O que foi tratado</label>
                <textarea id="crmAcDesc" rows="2" maxlength="2000"></textarea></div></div>
            <div class="form-row">
                <div class="form-group"><label>Resultado</label><select id="crmAcResult"><option value="">—</option>${CRM_RESULTADOS.map(r => `<option>${r}</option>`).join('')}</select></div>
                <div class="form-group"><label>Motivo (se perdido)</label><select id="crmAcMotivo"><option value="">—</option><option>Preço</option><option>Prazo não atendido</option><option>Não atendemos a rota</option><option>Outro</option></select></div>
            </div>
            <div class="crm-bloco-prox">
                <div class="crm-sub" style="margin-bottom:.4rem"><strong>Próxima ação</strong> — vira tarefa no Gestor de Tarefas e no Painel</div>
                <div class="form-row">
                    <div class="form-group"><label>Próxima ação</label><select id="crmAcProxTipo"><option value="">— nenhuma —</option>${optsTipo('')}</select></div>
                    <div class="form-group"><label>Data da próxima ação</label><input type="date" id="crmAcProxData"></div>
                </div>
                <div class="form-row"><div class="form-group full-width"><label>O que fazer</label>
                    <input type="text" id="crmAcProxDesc" maxlength="300" placeholder="Ex.: enviar proposta revisada"></div></div>
            </div>
            <div id="crmMsgAc" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="crmBtnAc">💾 Registrar</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>`, 700);
}

async function _crmSalvarAcao(clienteId, origemTarefaId){
    const v = id => (document.getElementById(id)?.value || '').trim();
    let cli = clienteId ? _crmCli(clienteId) : null;
    if (!cli){
        const txt = v('crmAcCliente').replace(/ \(lead\)$/, '');
        const achados = _crmClientes().filter(c => _crmNorm(c.nome) === _crmNorm(txt));
        if (achados.length !== 1) return _crmMsg('crmMsgAc', achados.length ? 'Há mais de um cadastro com esse nome — registre pela linha dele no Cadastro.' : 'Escolha um cliente/lead da lista.');
        cli = achados[0];
    }
    if (!v('crmAcTipo')) return _crmMsg('crmMsgAc', 'Escolha o tipo de ação.');
    if (!v('crmAcAssunto')) return _crmMsg('crmMsgAc', 'Informe o assunto.');
    const proxTipo = v('crmAcProxTipo'), proxData = v('crmAcProxData');
    if (proxTipo && !proxData) return _crmMsg('crmMsgAc', 'Informe a data da próxima ação.');
    if (proxData && !proxTipo) return _crmMsg('crmMsgAc', 'Escolha qual é a próxima ação.');
    const btn = document.getElementById('crmBtnAc'); if (btn) btn.disabled = true;
    const eu = _crmUsuario();
    const dataAcao = v('crmAcData');
    try {
        await _crmInserirTarefa({
            cliente_id: cli.id,
            tipo_relacionamento: cli.eh_lead ? 'Lead' : 'Cliente',
            tipo_acao: v('crmAcTipo'),
            data_acao: dataAcao ? new Date(dataAcao).toISOString() : new Date().toISOString(),
            responsavel: v('crmAcResp') || eu,
            nome_contato: v('crmAcContato') || null,
            assunto: v('crmAcAssunto'),
            descricao: v('crmAcDesc') || null,
            resultado: v('crmAcResult') || null,
            motivo_perdido: v('crmAcMotivo') || null,
            tipo_proxima_acao: proxTipo || null,
            data_proxima_acao: proxData || null,
            proxima_acao: v('crmAcProxDesc') || null,
            // sem próxima ação = só registro de histórico (nada pendente)
            concluida: !proxTipo,
            criado_por: eu
        });
        if (origemTarefaId) await _crmAtualizarTarefa(origemTarefaId, { concluida: true, concluida_em: new Date().toISOString(), concluida_por: eu });
        // Resultado de negociação atualiza o status comercial do cadastro
        const r = v('crmAcResult');
        const novoStatus = r === 'Negócio fechado' ? 'Fechado - Ganho' : r === 'Negócio perdido' ? 'Fechado - Perdido'
            : r === 'Proposta enviada' ? 'Proposta Enviada' : r === 'Em negociação' ? 'Negociação Aberta'
            : (cli.eh_lead && (!cli.status_negociacao || cli.status_negociacao === 'Novo Cadastro')) ? 'Prospecção em Andamento' : null;
        if (novoStatus && novoStatus !== cli.status_negociacao){
            const { error } = await supabase.from('clientes').update({ status_negociacao: novoStatus }).eq('id', cli.id);
            if (!error) _crmAtualizarClienteLocal({ id: cli.id, status_negociacao: novoStatus });
        }
        if (!cli.vendedor_responsavel){
            const resp = v('crmAcResp') || eu;
            const { error } = await supabase.from('clientes').update({ vendedor_responsavel: resp }).eq('id', cli.id);
            if (!error) _crmAtualizarClienteLocal({ id: cli.id, vendedor_responsavel: resp });
        }
        _crmFecharModal();
        _crmRedesenhar();
        _crmToast('📝 Ação registrada.');
    } catch(e){
        if (btn) btn.disabled = false;
        _crmMsg('crmMsgAc', 'Erro ao salvar: ' + e.message + (/relation|column|schema/i.test(e.message) ? ' — rode o sql/2026-09-28-crm.sql no Supabase.' : ''));
    }
}

// Executar a tarefa = registrar o que foi feito (a tarefa fica concluída)
function _crmExecutarTarefa(tarefaId){
    const t = (window.crmTarefasGlobais||[]).find(x => Number(x.id) === Number(tarefaId));
    if (t) _crmModalNovaAcao(t.cliente_id, t.id);
}
async function _crmConcluirTarefa(tarefaId){
    if (!confirm('Concluir esta tarefa sem registrar uma nova ação?')) return;
    try {
        await _crmAtualizarTarefa(tarefaId, { concluida: true, concluida_em: new Date().toISOString(), concluida_por: _crmUsuario() });
        _crmRedesenhar();
    } catch(e){ alert('Erro: ' + e.message); }
}

// ===================================================================
// LEAD → CLIENTE → PEDIDO
// O lead é o MESMO registro: ao completar os dados obrigatórios ele vira
// cliente (eh_lead=false) e o histórico continua ligado a ele.
// ===================================================================
const _CRM_PJ = ['empresa','concessionaria','locadora','transportadora'];
function _crmCamposFaltando(c, tipoEscolhido){
    const f = [];
    const tipo = tipoEscolhido !== undefined ? tipoEscolhido : (c.eh_lead ? '' : c.tipo_cliente);
    if (!tipo) f.push('Tipo de cliente');
    const cnpj = String(c.cnpj||'').replace(/\D/g,''), cpf = String(c.cpf||'').replace(/\D/g,'');
    if (_CRM_PJ.includes(tipo) && cnpj.length !== 14) f.push('CNPJ');
    if (!_CRM_PJ.includes(tipo) && cnpj.length !== 14 && cpf.length !== 11) f.push('CPF ou CNPJ');
    if (!String(c.telefone||'').trim() && !String(c.email||'').trim()) f.push('Telefone ou e-mail');
    if (!c.endereco) f.push('Endereço');
    if (!c.numero) f.push('Número');
    if (!c.bairro) f.push('Bairro');
    if (!c.cidade) f.push('Cidade');
    if (!c.uf) f.push('UF');
    return f;
}

function _crmIrParaPedido(clienteId){
    const c = _crmCli(clienteId);
    if (!c) return;
    if (c.eh_lead) return _crmModalCompletarCadastro(c.id);
    _crmAbrirPedido(c);
}

function _crmModalCompletarCadastro(clienteId){
    const c = _crmCli(clienteId);
    if (!c) return;
    const falta = _crmCamposFaltando(c);
    const val = k => _crmEsc(c[k] || '');
    const tipoAtual = c.eh_lead ? '' : (c.tipo_cliente || '');
    _crmAbrirModal(`
        <span class="close" onclick="_crmFecharModal()">&times;</span>
        <h2 style="margin-top:0">🔄 Completar cadastro para criar o pedido</h2>
        <p class="text-muted" style="margin-top:-.4rem"><strong>${_crmEsc(c.nome)}</strong> ainda é LEAD. Complete os dados obrigatórios: ele vira cliente (o mesmo cadastro, com todo o histórico) e o lançamento do pedido abre em seguida.</p>
        ${falta.length ? `<div class="crm-faltando">Faltando: ${falta.map(_crmEsc).join(' · ')}</div>` : ''}
        <form class="form" onsubmit="event.preventDefault(); _crmSalvarCompletarCadastro(${c.id});">
            <div class="form-row">
                <div class="form-group"><label>Tipo *</label><select id="crmCcTipo" required><option value="">Selecione</option>
                    ${Object.entries(CRM_TIPOS_CLIENTE).map(([k, l]) => `<option value="${k}" ${tipoAtual===k?'selected':''}>${l}</option>`).join('')}</select></div>
                <div class="form-group"><label>Razão social / Nome *</label><input type="text" id="crmCcNome" value="${val('nome')}" required></div>
                <div class="form-group"><label>Nome fantasia</label><input type="text" id="crmCcFantasia" value="${val('nome_fantasia')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>CNPJ</label><input type="text" id="crmCcCnpj" value="${val('cnpj')}" placeholder="00.000.000/0000-00"></div>
                <div class="form-group"><label>CPF</label><input type="text" id="crmCcCpf" value="${val('cpf')}" placeholder="000.000.000-00"></div>
                <div class="form-group"><label>Inscrição estadual</label><input type="text" id="crmCcIE" value="${val('inscricao_estadual')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Telefone</label><input type="text" id="crmCcTel" value="${val('telefone')}"></div>
                <div class="form-group"><label>E-mail</label><input type="email" id="crmCcEmail" value="${val('email')}"></div>
                <div class="form-group"><label>CEP</label><input type="text" id="crmCcCep" value="${val('cep')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Endereço *</label><input type="text" id="crmCcEnd" value="${val('endereco')}"></div>
                <div class="form-group" style="max-width:110px"><label>Número *</label><input type="text" id="crmCcNum" value="${val('numero')}"></div>
                <div class="form-group"><label>Bairro *</label><input type="text" id="crmCcBairro" value="${val('bairro')}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Cidade *</label><input type="text" id="crmCcCidade" value="${val('cidade')}"></div>
                <div class="form-group" style="max-width:90px"><label>UF *</label><input type="text" id="crmCcUf" maxlength="2" style="text-transform:uppercase" value="${val('uf')}"></div>
                <div class="form-group"><label>Forma de pagamento</label><select id="crmCcPag"><option value="">—</option>
                    ${['boleto','pix','transferencia'].map(p => `<option value="${p}" ${c.forma_pagamento===p?'selected':''}>${p==='boleto'?'Boleto':p==='pix'?'PIX':'Transferência'}</option>`).join('')}</select></div>
            </div>
            <div id="crmMsgCc" class="message"></div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="crmBtnCc">✅ Salvar e criar pedido</button>
                <button type="button" class="btn btn-secondary" onclick="_crmFecharModal()">Cancelar</button>
            </div>
        </form>`, 760);
}

async function _crmSalvarCompletarCadastro(clienteId){
    const c = _crmCli(clienteId);
    if (!c) return;
    const v = id => (document.getElementById(id)?.value || '').trim();
    const patch = {
        tipo_cliente: v('crmCcTipo'), nome: v('crmCcNome') || c.nome, nome_fantasia: v('crmCcFantasia') || null,
        cnpj: v('crmCcCnpj') || null, cpf: v('crmCcCpf') || null, inscricao_estadual: v('crmCcIE') || null,
        telefone: v('crmCcTel') || null, email: v('crmCcEmail') || null, cep: v('crmCcCep') || null,
        endereco: v('crmCcEnd') || null, numero: v('crmCcNum') || null, bairro: v('crmCcBairro') || null,
        cidade: v('crmCcCidade') || null, uf: v('crmCcUf').toUpperCase() || null,
        forma_pagamento: v('crmCcPag') || null
    };
    const falta = _crmCamposFaltando({ ...c, ...patch, eh_lead: false }, patch.tipo_cliente);
    if (falta.length) return _crmMsg('crmMsgCc', 'Ainda falta: ' + falta.join(', ') + '.');
    // Mesmo documento em outro cadastro = seria cliente duplicado
    for (const campo of ['cnpj', 'cpf']){
        if (!patch[campo] || typeof verificarDocumentoUnico !== 'function') continue;
        const achado = await verificarDocumentoUnico(campo, patch[campo]);
        if (achado !== true && Number(achado.id) !== Number(c.id))
            return _crmMsg('crmMsgCc', `Este ${campo.toUpperCase()} já é do cliente "${achado.nome}". Use esse cadastro (registre as ações nele) em vez de converter o lead.`);
    }
    const btn = document.getElementById('crmBtnCc'); if (btn) btn.disabled = true;
    const eraLead = !!c.eh_lead;
    try {
        const conv = { ...patch, eh_lead: false };
        if (eraLead && (!c.status_negociacao || c.status_negociacao === 'Novo Cadastro' || CRM_STATUS_ANDAMENTO.has(c.status_negociacao))) conv.status_negociacao = 'Fechado - Ganho';
        let { error } = await supabase.from('clientes').update({ ...conv, lead_convertido_em: new Date().toISOString() }).eq('id', c.id);
        if (error && /lead_convertido_em/.test(error.message || '')) ({ error } = await supabase.from('clientes').update(conv).eq('id', c.id));
        if (error) throw error;
        _crmAtualizarClienteLocal({ id: c.id, ...conv });
        if (eraLead){
            try {
                await _crmInserirTarefa({ cliente_id: c.id, tipo_acao: 'Conversão', data_acao: new Date().toISOString(),
                    responsavel: c.vendedor_responsavel || _crmUsuario(), assunto: 'Lead convertido em cliente',
                    descricao: 'Cadastro completado para o primeiro pedido.', concluida: true, criado_por: _crmUsuario() });
            } catch(_){ /* o registro de histórico não pode travar o pedido */ }
        }
        _crmFecharModal();
        _crmToast(eraLead ? '✅ Lead convertido em cliente.' : '✅ Cadastro completo.');
        _crmAbrirPedido(_crmCli(c.id));
    } catch(e){
        if (btn) btn.disabled = false;
        _crmMsg('crmMsgCc', 'Erro ao salvar: ' + e.message);
    }
}

// Abre o Lançamento Comercial já com o cliente selecionado.
// Vendedor no modo CRM → troca para o modo Operacional Comercial.
function _crmAbrirPedido(c){
    if (!c) return;
    _crmFecharModal();
    const irLancamento = () => {
        const btn = document.querySelector('.nav-btn[data-tab="comercial"]');
        if (!btn || btn.style.display === 'none'){
            alert(`Cliente "${c.nome}" pronto para pedido.\n\nSeu perfil não tem o Lançamento Comercial — peça ao Comercial para lançar.`);
            return;
        }
        btn.click();
        setTimeout(() => {
            if (typeof selecionarCliente === 'function')
                selecionarCliente(c.id, c.nome, c.cnpj || c.cpf || '', c.tipo_cliente || '', c.codigo || '');
            document.getElementById('formComercial')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            _crmToast(`📋 ${c.nome} selecionado — complete o pedido.`);
        }, 250);
    };
    if (typeof mmModoComercial === 'function' && mmModoComercial() === 'crm' && typeof mmTrocarModoComercial === 'function'){
        mmTrocarModoComercial('operacional', irLancamento);
    } else irLancamento();
}

window.renderizarCRM = renderizarCRM;
window.crmIrPara = crmIrPara;
