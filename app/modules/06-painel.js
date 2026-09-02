/* ==========================================================================
   MODULE: 06-painel.js
   Kanban painel + notificações coleta
   Linhas originais: 1269-1471
   ========================================================================== */

// ============================================
// PAINEL DE OCUPAÇÃO — KANBAN
// ============================================

// Monta a rota visual do pedido incluindo o pátio de transbordo, quando houver.
// Status 'Transbordo' = carro parado no pátio agora (badge laranja pulsando).
// Depois que segue viagem, o pátio fica marcado como etapa cumprida (✔ verde).
function rotaComTransbordoHTML(p) {
    const origem  = `<span>📍 ${p.cidadeOrigem || ''}/${p.ufOrigem || ''}</span>`;
    const destino = `<span>🏁 ${p.cidadeDestino || ''}/${p.ufDestino || ''}</span>`;
    const seta = '<span class="kanban-arrow">→</span>';

    if (!p.cidadeTransbordo) return `${origem}${seta}${destino}`;

    const noPatio = p.status === 'Transbordo';
    const cls    = noPatio ? 'badge-transbordo transbordo-atual' : 'badge-transbordo transbordo-feito';
    const icone  = noPatio ? '🔁' : '✔';
    const titulo = noPatio
        ? `Veículo no pátio de ${p.cidadeTransbordo} aguardando nova cegonha`
        : `Transbordo realizado no pátio de ${p.cidadeTransbordo}`;

    return `${origem}${seta}<span class="${cls}" title="${titulo}">${icone} ${p.cidadeTransbordo}</span>${seta}${destino}`;
}

async function carregarPainel() {
    // Usa dados em memória — evita reload completo a cada abertura da aba
    renderizarKanban();
    verificarNotificacoesColeta();
    // Abre na primeira aba (Planejamento de Rotas), se o botão existir e nenhuma view estiver ativa
    try {
        const btnPrimeira = document.querySelector('.painel-subtabs .cad-subtab-btn.ativo');
        if (btnPrimeira && /Planejamento/.test(btnPrimeira.textContent)) {
            mostrarViewPainel('planejamento', btnPrimeira);
        }
    } catch(e){}
}

let _ocupFiltroStatus = '';

// Mapeia o status detalhado para os 3 grupos do painel
function grupoOcupacao(status) {
    if (status === 'Pendente') return 'Pendente';
    if (['Entregue'].includes(status)) return 'Entregue';
    if (['Cancelado'].includes(status)) return 'Cancelado';
    return 'Em Rota'; // Intenção, Aguardando, Em Coleta, Em Transporte, Transbordo
}

function filtrarOcupacao(status, el) {
    _ocupFiltroStatus = status;
    document.querySelectorAll('.ocup-chip').forEach(c => c.classList.toggle('active', (c.dataset.filtro || '') === status));
    document.querySelectorAll('.ocup-resumo-card').forEach(c => c.classList.toggle('ativo', (c.dataset.filtro || '') === status));
    renderizarOcupacao();
}

// Mantém o nome antigo para não quebrar as chamadas existentes
function renderizarKanban() { renderizarOcupacao(); }

// Prazo de entrega prometido ao cliente: mostra com alerta de vencimento
function badgePrazoEntrega(p) {
    if (!p.prazoEntregaEstimado) return '';
    const prazo = new Date(p.prazoEntregaEstimado + 'T23:59:59');
    const txt = prazo.toLocaleDateString('pt-BR');
    const entregue = ['Entregue', 'Cancelado'].includes(p.status);
    if (entregue) return `<span class="prazo-entrega prazo-ent-ok" title="Prazo prometido ao cliente">🎯 ${txt}</span>`;

    const dias = Math.ceil((prazo - Date.now()) / 86400000);
    if (dias < 0) return `<span class="prazo-entrega prazo-ent-vencido" title="Prazo prometido ao cliente vencido há ${Math.abs(dias)} dia(s)">🎯 ${txt} · atrasado</span>`;
    if (dias <= 2) return `<span class="prazo-entrega prazo-ent-perto" title="Prazo prometido ao cliente">🎯 ${txt} · ${dias === 0 ? 'hoje' : dias + 'd'}</span>`;
    return `<span class="prazo-entrega prazo-ent-ok" title="Prazo prometido ao cliente">🎯 ${txt}</span>`;
}

function renderizarOcupacao() {
    const corpo = document.getElementById('ocupTabelaCorpo');
    if (!corpo) return;
    // Corredores e Avançar Pedidos ficam visíveis para todos (comercial acompanha).
    // As AÇÕES continuam restritas à logística (criar rota, jogar no corredor, etc.).
    if (typeof gerarSugestoesRota === 'function') gerarSugestoesRota();

    // Contagens dos cards de resumo
    const cont = { total: 0, Pendente: 0, 'Em Rota': 0, Entregue: 0 };
    pedidosGlobais.forEach(p => {
        const g = grupoOcupacao(p.status || 'Pendente');
        if (g === 'Cancelado') return;
        if (g !== 'Entregue') cont.total++; // total ATIVO: só o que ainda está em andamento
        if (cont[g] !== undefined) cont[g]++;
    });
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('ocupTotal', cont.total);
    setTxt('ocupPendente', cont.Pendente);
    setTxt('ocupEmRota', cont['Em Rota']);
    setTxt('ocupEntregue', cont.Entregue);

    // Filtro + busca
    const busca = _norm(document.getElementById('ocupBusca')?.value || '');
    const fOrigem = _norm(document.getElementById('ocupOrigem')?.value || '');
    const fDestino = _norm(document.getElementById('ocupDestino')?.value || '');
    let lista = pedidosGlobais.filter(p => grupoOcupacao(p.status || 'Pendente') !== 'Cancelado');
    if (_ocupFiltroStatus) lista = lista.filter(p => grupoOcupacao(p.status || 'Pendente') === _ocupFiltroStatus);
    if (busca) lista = lista.filter(p =>
        _norm(`${p.cliente||''} ${p.placa||''} ${p.modelo||''} ${p.placaCegonha||''} ${p.motorista1||''} ${p.referencia||''} ${p.cidadeOrigem||''} ${p.ufOrigem||''} ${p.cidadeDestino||''} ${p.ufDestino||''} #${p.id}`).includes(busca)
    );
    if (fOrigem) lista = lista.filter(p => _norm(`${p.cidadeOrigem||''} ${p.ufOrigem||''}`).includes(fOrigem));
    if (fDestino) lista = lista.filter(p => _norm(`${p.cidadeDestino||''} ${p.ufDestino||''}`).includes(fDestino));

    // Ordena: pendentes primeiro, depois em rota, depois entregues; dentro por coleta
    const ordemGrupo = { 'Pendente': 0, 'Em Rota': 1, 'Entregue': 2 };
    lista.sort((a, b) => {
        const ga = ordemGrupo[grupoOcupacao(a.status||'Pendente')] ?? 3;
        const gb = ordemGrupo[grupoOcupacao(b.status||'Pendente')] ?? 3;
        if (ga !== gb) return ga - gb;
        if (!a.dataPrevColeta) return 1;
        if (!b.dataPrevColeta) return -1;
        return new Date(a.dataPrevColeta) - new Date(b.dataPrevColeta);
    });

    if (lista.length === 0) {
        corpo.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum pedido nesta visão.</td></tr>';
        return;
    }

    const _linhaOcupacao = (p) => {
        const cor = FLUXO_STATUS[p.status||'Pendente']?.cor || '#888';
        const qtdGrupo = p.grupoId ? pedidosGlobais.filter(x => x.grupoId === p.grupoId).length : 0;
        const cegonhaLinha = p.placaCegonha
            ? `${p.placaCegonha}${p.motorista1 ? ' · ' + p.motorista1 : ' · <span class="tag-adefinir">A DEFINIR</span>'}`
            : (['Intenção Agendada','Aguardando Confirmação'].includes(p.status) ? '<span class="tag-adefinir">A DEFINIR</span>' : '—');
        const grupo = grupoOcupacao(p.status||'Pendente');
        const pulse = grupo === 'Em Rota' ? '<span class="ocup-pulse"></span>' : '';
        return `
        <tr style="--row-cor:${cor}">
            <td data-label="Pedido"><span class="ocup-id">#${p.id}</span> ${selCTEDoPedido(p.id)}<br><span class="ocup-cliente">${p.cliente || '—'}</span><br><span class="ocup-resp" title="Responsável comercial">🧑‍💼 ${p.responsavelComercial || '—'}</span></td>
            <td data-label="Rota" class="ocup-rota-cell">${rotaComTransbordoHTML(p)}</td>
            <td data-label="Veículo / Cegonha">
                <div>🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong>${qtdGrupo > 1 ? ` <span class="badge-grupo">🔗 ${qtdGrupo}</span>` : ''}${p.patioAtual ? ` <span class="badge-patio">🅿️ ${p.patioAtual}</span>` : ''}${p.referencia ? ` <span class="badge-ref" title="Referência: ${p.referencia}">🔖 ${p.referencia}</span>` : ''}</div>
                <div class="ocup-sub">🚛 ${cegonhaLinha}</div>
            </td>
            <td data-label="Coleta prev." class="ocup-sub">${p.dataPrevColeta ? formatarDataHora(p.dataPrevColeta) : '—'}${badgePrazoEntrega(p) ? '<br>' + badgePrazoEntrega(p) : ''}</td>
            <td data-label="Status">${p.patioAtual && !['Entregue','Cancelado'].includes(p.status)
                ? `<span class="status-pill-vivo status-pill-patio" title="Status interno: ${p.status || 'Pendente'} · no pátio de ${p.patioAtual}">🅿️ Pátio ${p.patioAtual.split('/')[0]}</span>`
                : `<span class="status-pill-vivo" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${pulse}${p.status || 'Pendente'}</span>`}</td>
            <td data-label="Frete" style="text-align:right;font-weight:600;white-space:nowrap">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}${p.freteTipo === 'carro' ? '<br><small style="font-weight:400;opacity:.7">por carro</small>' : '<br><small style="font-weight:400;opacity:.7">frete cheio</small>'}</td>
            <td data-label="Ações" class="ocup-acoes-cell">
                ${acaoOuAguardando(p)}
                <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Hist.</button>
                ${!['Entregue','Cancelado'].includes(p.status||'Pendente') ? `<button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="${p.patioAtual ? 'No pátio de ' + p.patioAtual : 'Informar pátio'}">🅿️</button>` : ''}
                ${p.placaCegonha && p.status !== 'Cancelado' ? `<button class="btn-kanban-trechos" onclick="abrirEdicaoTrechos(${p.id})" title="Editar trechos e motoristas da viagem">🛣️</button>` : ''}
                ${['Em Coleta','Em Transporte'].includes(p.status) ? `<button class="btn-kanban-ocorr" onclick="abrirRegistrarOcorrencia(${p.id})" title="Ocorrência">⚠️</button>` : ''}
                ${p.status === 'Entregue' ? `<button class="btn-kanban-receita" onclick="abrirConfirmarReceita(${p.id})" title="Confirmar Receita">💰</button>` : ''}
            </td>
        </tr>`;
    };

    corpo.innerHTML = montarListaComGrupos(lista, _linhaOcupacao, 7, true);
}

function formatarDataHora(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d)) return dt;
    return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ============================================
// NOTIFICAÇÕES DE COLETA (2H ANTES)
// ============================================

function verificarNotificacoesColeta() {
    const container = document.getElementById('notificacoesColeta');
    if (!container) return;

    const agora = new Date();
    const duasHoras = 2 * 60 * 60 * 1000;

    pedidosGlobais.forEach(p => {
        if (!p.dataPrevColeta || p.status === 'Entregue' || p.status === 'Cancelado') return;
        if (notificacoesEnviadas.has(p.id)) return;

        const dataColeta = new Date(p.dataPrevColeta);
        const diff = dataColeta - agora;

        if (diff > 0 && diff <= duasHoras) {
            notificacoesEnviadas.add(p.id);

            const notif = document.createElement('div');
            notif.className = 'notificacao-coleta';
            notif.innerHTML = `
                <div class="notif-icon">🔔</div>
                <div class="notif-corpo">
                    <strong>Coleta em breve!</strong>
                    <p>Pedido <strong>#${p.id}</strong> — ${p.cliente || ''}</p>
                    <p>Coleta prevista: <strong>${formatarDataHora(p.dataPrevColeta)}</strong></p>
                    <p>Responsável: ${p.responsavelComercial || '—'} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</p>
                </div>
                <button class="notif-fechar" onclick="this.parentElement.remove()">×</button>
            `;
            container.appendChild(notif);

            // Auto-remover em 30 minutos
            setTimeout(() => notif.remove(), 30 * 60 * 1000);
        }
    });
}

