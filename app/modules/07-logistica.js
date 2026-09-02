/* ==========================================================================
   MODULE: 07-logistica.js
   Drag-drop, alocação, trechos, modal
   Linhas originais: 1472-2637
   ========================================================================== */

// ============================================
// GESTÃO LOGÍSTICA — DRAG AND DROP
// ============================================

let pedidoArrastando = null;
let veiculoAlvoDrop = null;

async function carregarLogistica() {
    // Usa dados em memória — evita reload completo a cada abertura da aba
    renderizarPedidosDrag();
    renderizarVeiculosDrop();
    verificarNotificacoesColeta();
    if (typeof renderizarParadasEmergencia === 'function') renderizarParadasEmergencia();
    if (typeof gerarSugestoesRota === 'function') gerarSugestoesRota();
    if (typeof renderizarLastMile === 'function') renderizarLastMile();
    if (typeof renderizarConferenciaFaturamento === 'function') renderizarConferenciaFaturamento();
}

// ============================================
// MENU DE AÇÕES "⋯" REUTILIZÁVEL
// Uso: montarMenuAcoes(pedidoId, [{label, icone, onclick, classe}])
// Gera o botão ⋯ + o dropdown. Serve para qualquer card/linha.
// ============================================

function montarMenuAcoes(id, itens) {
    const opcoes = itens.filter(Boolean).map(it => `
        <button class="menu-acao-item ${it.classe || ''}" onclick="event.stopPropagation();event.preventDefault();fecharMenusAcoes();${it.onclick}">
            <span class="menu-acao-ico">${it.icone || ''}</span> ${it.label}
        </button>`).join('');

    return `
        <div class="menu-acoes-wrap" draggable="false">
            <button draggable="false" class="btn-menu-acoes" title="Mais ações"
                onclick="event.stopPropagation();event.preventDefault();abrirMenuAcoes(this)">⋯</button>
            <div class="menu-acoes-dropdown">${opcoes}</div>
        </div>`;
}

function fecharMenusAcoes() {
    document.querySelectorAll('.menu-acoes-dropdown.aberto').forEach(m => m.classList.remove('aberto'));
}

function abrirMenuAcoes(btn) {
    const dd = btn.parentElement.querySelector('.menu-acoes-dropdown');
    const jaAberto = dd.classList.contains('aberto');
    fecharMenusAcoes();
    if (!jaAberto) {
        dd.classList.add('aberto');
        // fecha ao clicar fora
        setTimeout(() => {
            document.addEventListener('click', function fechar(e) {
                if (!dd.parentElement.contains(e.target)) {
                    dd.classList.remove('aberto');
                    document.removeEventListener('click', fechar);
                }
            });
        }, 0);
    }
}

// Bloco recolhido de uma carga fechada (vários carros do mesmo pedido).
// Arrastar o bloco aloca a carga inteira de uma vez.
// Aloca uma CARGA FECHADA inteira numa cegonha, de uma vez.
// Mostra um aviso no modal de alocação quando o motorista está
// de folga/férias/atestado na data prevista de coleta.
function mostrarAvisoFolgaMotorista(nomeMotorista, pedido) {
    const antigo = document.getElementById('avisoFolgaAlocacao');
    if (antigo) antigo.remove();
    if (!nomeMotorista) return;

    const dataRef = (pedido?.dataPrevColeta || new Date().toISOString()).slice(0, 10);
    const folga = motoristaIndisponivel(nomeMotorista, dataRef);
    if (!folga) return;

    const cfg = TIPOS_FOLGA[folga.tipo] || TIPOS_FOLGA.folga;
    const dataFmt = new Date(dataRef + 'T12:00').toLocaleDateString('pt-BR');

    const aviso = document.createElement('div');
    aviso.id = 'avisoFolgaAlocacao';
    aviso.className = 'aviso-folga-alocacao';
    aviso.innerHTML = `
        <strong>${cfg.icone} Atenção: ${nomeMotorista} está de ${cfg.label.toLowerCase()} em ${dataFmt}</strong>
        ${folga.descricao ? `<span>${folga.descricao}</span>` : ''}
        <span>Você pode continuar, mas confirme a escalação antes.</span>`;

    const alvo = document.getElementById('alocMotoristaResumo') ||
                 document.getElementById('alocMotoristaCampos');
    if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(aviso, alvo);
}

// Item 11 — folga próxima (dentro de N dias da data de referência)?
function folgaProximaMotorista(nomeMotorista, dataRefISO, dias) {
    if (!nomeMotorista) return null;
    const janela = dias || 15;
    const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                       .toUpperCase().replace(/\s+/g, ' ').trim();
    const alvo = norm(nomeMotorista);
    const ref = new Date((dataRefISO || new Date().toISOString().slice(0,10)) + 'T12:00').getTime();
    let maisProxima = null;
    (folgasGlobais || []).forEach(f => {
        if (!f.motorista_id || norm(f.motorista_nome) !== alvo) return;
        if ((f.tipo || 'folga') === 'lembrete') return;
        const ini = new Date(String(f.data_inicio).slice(0,10) + 'T12:00').getTime();
        const difDias = (ini - ref) / 86400000;
        if (difDias >= 0 && difDias <= janela) {
            if (!maisProxima || ini < maisProxima._ini) { maisProxima = { ...f, _ini: ini, _dias: Math.round(difDias) }; }
        }
    });
    return maisProxima;
}

// Aviso preventivo de folga próxima na alocação (evitar viagens longas)
function mostrarAvisoFolgaProxima(nomeMotorista, pedido) {
    const antigo = document.getElementById('avisoFolgaProxima');
    if (antigo) antigo.remove();
    if (!nomeMotorista) return;
    const dataRef = (pedido?.dataPrevColeta || new Date().toISOString()).slice(0, 10);
    // se já está de folga na data, o outro aviso cobre
    if (motoristaIndisponivel(nomeMotorista, dataRef)) return;
    const prox = folgaProximaMotorista(nomeMotorista, dataRef, 15);
    if (!prox) return;
    const dataFmt = new Date(prox._ini).toLocaleDateString('pt-BR');
    const aviso = document.createElement('div');
    aviso.id = 'avisoFolgaProxima';
    aviso.className = 'aviso-folga-alocacao aviso-folga-proxima';
    aviso.innerHTML = `
        <strong>🗓️ ${nomeMotorista} tem folga em ${prox._dias} dia(s) (${dataFmt})</strong>
        <span>Folga a 15 dias ou menos — evite escalar em viagem longa que avance sobre a data.</span>`;
    const alvo = document.getElementById('alocMotoristaResumo') ||
                 document.getElementById('alocMotoristaCampos');
    if (alvo && alvo.parentNode) alvo.parentNode.insertBefore(aviso, alvo);
}

// ============================================
// ITEM 2 — GOVERNANÇA: alocação/transbordo só Logística
// Trava explícita (defesa em profundidade, além da aba já ser restrita).
// ============================================
const PERFIS_LOGISTICA = ['logistica', 'admin'];
function podeAlocarOuTransbordar() {
    const p = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
    return PERFIS_LOGISTICA.includes(p);
}
function bloquearSeNaoLogistica(acao) {
    if (podeAlocarOuTransbordar()) return false;
    alert(`Apenas o Setor de Logística pode executar ${acao || 'esta ação'}.`);
    return true;
}
// Ações da tela de Equipes: logística, admin ou o próprio pessoal da equipe
function podeAgirEquipe() {
    const p = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
    return ['logistica', 'admin', 'equipe'].includes(p);
}
function bloquearSeNaoEquipe(acao) {
    if (podeAgirEquipe()) return false;
    alert(`Você não tem permissão para ${acao || 'esta ação'}.`);
    return true;
}

async function abrirModalAlocacaoCarga(itens, veiculo) {
    if (bloquearSeNaoLogistica('a alocação de veículos')) return;
    const _bloq = (typeof statusManutencaoVeiculo === 'function') ? statusManutencaoVeiculo(veiculo) : null;
    if (_bloq && _bloq.bloqueado) { alert(`Veículo ${veiculo.placa} indisponível: ${_bloq.motivo}.`); return; }
    const emUso = pedidosGlobais.filter(p =>
        p.placaCegonha === veiculo.placa && !['Entregue','Cancelado'].includes(p.status)
    ).length;
    const capacidade = veiculo.capacidade || 11;
    const vagas = capacidade - emUso;

    if (itens.length > vagas) {
        alert(`Não cabe: a carga tem ${itens.length} carros e a cegonha ${veiculo.placa} tem só ${vagas} vaga(s) livre(s).\n\n` +
              `Libere espaço ou aloque os carros individualmente (abra a carga no ▸ para arrastar um a um).`);
        return;
    }

    const p0 = itens[0];
    const resumo = `${itens.length} carros · ${p0.cliente || ''}\n` +
                   `${p0.cidadeOrigem}/${p0.ufOrigem} → ${p0.cidadeDestino}/${p0.ufDestino}`;
    if (!confirm(`Alocar os múltiplos veículos na cegonha ${veiculo.placa}?\n\n${resumo}\n\nFicará com ${emUso + itens.length}/${capacidade} vagas ocupadas.`)) return;

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    const atualizacao = {
        placa_cegonha: veiculo.placa,
        motorista_1: veiculo.motorista_padrao || null,
        percent_motorista_1: veiculo.motorista_padrao ? 100 : null,
        status: 'Intenção Agendada'
    };

    // Se a cegonha já tem rota planejada, a carga entra nela
    const rotaCeg = (rotasGlobais || []).find(r =>
        r.placa_cegonha === veiculo.placa && ['planejada','em_andamento'].includes(r.status));
    if (rotaCeg) atualizacao.rota_id = rotaCeg.id;

    try {
        const ids = itens.map(p => p.id);
        const { error } = await supabase.from('pedidos').update(atualizacao).in('id', ids);
        if (error) throw error;

        for (const p of itens) {
            await supabase.from('historico_status').insert({
                pedido_id: parseInt(p.id),
                status_anterior: p.status,
                status_novo: 'Intenção Agendada',
                usuario_nome: usuarioNome,
                usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
                observacao: `📦 Alocado como múltiplos veículos (${itens.length} carros) na cegonha ${veiculo.placa}`
            });
        }

        await aposMutacaoPedidos({ forceFull: true });
        renderizarPedidosDrag();
        renderizarVeiculosDrop();
        if (typeof renderizarOcupacao === 'function') renderizarOcupacao();
        notificar({
            perfil: 'comercial', nome: p0.responsavelComercial, pedidoId: p0.id, tipo: 'status',
            titulo: `📦 Seus múltiplos veículos foram alocados (${itens.length} carros)`,
            mensagem: `${p0.cliente} · cegonha ${veiculo.placa} — só para você saber. Você será chamado para liberar a coleta.`
        });

        exibirMensagem('mensagemLogistica', `✅ Múltiplos veículos (${itens.length} carros) alocados na ${veiculo.placa}.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemLogistica', 'Erro ao alocar a carga: ' + e.message, 'error');
    }
}

function montarBlocoCargaFechada(grupoId, itens) {
    const bloco = document.createElement('div');
    bloco.className = 'carga-fechada';
    bloco.draggable = true;
    bloco.dataset.grupoId = grupoId;

    const p0 = itens[0];
    const total = itens.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);
    const rota = `${p0.cidadeOrigem || ''}/${p0.ufOrigem || ''} → ${p0.cidadeDestino || ''}/${p0.ufDestino || ''}`;
    const aberto = _gruposAbertos.has(String(grupoId));

    bloco.innerHTML = `
        <div class="cf-topo" onclick="alternarCargaFechada('${grupoId}')">
            <span class="cf-chevron">${aberto ? '▾' : '▸'}</span>
            <div class="cf-info">
                <span class="cf-titulo">📦 ${nomenclaturaCarga(itens.length)} · ${itens.length} carros</span>
                <span class="cf-cliente">${p0.cliente || '—'}</span>
                <span class="cf-rota">${rota}</span>
            </div>
            <span class="cf-valor">R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="cf-itens" style="display:${aberto ? '' : 'none'}">
            ${itens.map(p => `
                <div class="cf-item">
                    <span>#${p.id}</span>
                    <span>🚗 ${p.modelo || ''} <strong>${p.placa || ''}</strong></span>
                    <span class="cf-item-valor">R$ ${Number(p.valorFrete || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>`).join('')}
        </div>
        <div class="cf-rodape">
            <span class="cf-dica">Arraste o bloco para alocar a carga inteira</span>
        </div>`;

    bloco.addEventListener('dragstart', (e) => {
        if (e.target.closest('.cf-topo') && e.target.tagName === 'BUTTON') { e.preventDefault(); return; }
        cargaArrastando = itens;
        pedidoArrastando = null;
        bloco.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        const lv = document.getElementById('listaVeiculosDrop');
        if (lv) { lv.classList.add('arrastando'); ativarAutoScrollDrag(lv); }
    });
    bloco.addEventListener('dragend', () => {
        bloco.classList.remove('dragging');
        cargaArrastando = null;
        const lv = document.getElementById('listaVeiculosDrop');
        if (lv) lv.classList.remove('arrastando');
        desativarAutoScrollDrag();
    });

    return bloco;
}

let _gruposAbertos = new Set();
let cargaArrastando = null;

function alternarCargaFechada(grupoId) {
    const g = String(grupoId);
    if (_gruposAbertos.has(g)) _gruposAbertos.delete(g); else _gruposAbertos.add(g);
    renderizarPedidosDrag();
}

function renderizarPedidosDrag() {
    const lista = document.getElementById('listaPedidosDrag');
    if (!lista) return;

    // Regra: aqui aparecem SOMENTE os pedidos pendentes de alocação —
    // Pendentes e intenções "a definir" (sem caminhão). Ao alocar,
    // o pedido vira Intenção Agendada com cegonha e cai para o Acompanhamento.
    const pendentes = pedidosGlobais.filter(p =>
        p.status === 'Pendente' ||
        (p.status === 'Intenção Agendada' && !p.placaCegonha)
    );

    // Busca: filtra por cliente, placa, modelo, cidade, referência ou #id
    const termo = (document.getElementById('buscaAlocacao')?.value || '').trim().toLowerCase();
    const pendentesFiltrados = termo
        ? pendentes.filter(p => `${p.cliente || ''} ${p.placa || ''} ${p.modelo || ''} ${p.cidadeOrigem || ''} ${p.cidadeDestino || ''} ${p.referencia || ''} #${p.id}`.toLowerCase().includes(termo))
        : pendentes;

    const contador = document.getElementById('contadorPendentesAlocar');
    if (contador) contador.textContent = termo ? `${pendentesFiltrados.length}/${pendentes.length}` : pendentes.length;

    if (pendentesFiltrados.length === 0) {
        lista.innerHTML = termo
            ? `<p class="text-center text-muted">Nenhum pedido encontrado para "<strong>${termo}</strong>".</p>`
            : '<p class="text-center text-muted">Nenhum pedido para alocar 🎉<br><span class="text-sm">Acompanhe os alocados na aba 📊 Acompanhamento</span></p>';
        return;
    }

    lista.innerHTML = '';

    // Cargas fechadas (mesmo grupo_id) entram recolhidas num único bloco,
    // para não poluir a lista com 11 cards soltos do mesmo cliente.
    const grupos = {};
    const avulsos = [];
    pendentesFiltrados.forEach(p => {
        if (p.grupoId) {
            (grupos[p.grupoId] = grupos[p.grupoId] || []).push(p);
        } else {
            avulsos.push(p);
        }
    });

    Object.entries(grupos).forEach(([gid, itens]) => {
        if (itens.length < 2) { avulsos.push(itens[0]); return; }  // grupo de 1 é avulso
        lista.appendChild(montarBlocoCargaFechada(gid, itens));
    });

    avulsos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'pedido-drag-card';
        card.draggable = true;
        card.dataset.pedidoId = p.id;

        const cfgStatus = FLUXO_STATUS[p.status || 'Pendente'];
        const corDrag = cfgStatus?.cor || '#fbbf24';
        card.innerHTML = `
            <div class="drag-card-top">
                <span class="drag-card-id">#${p.id}</span>
                <div class="drag-card-top-right">
                    <span class="status-badge-inline" style="background:${corDrag}20;color:${corDrag};border:1px solid ${corDrag}40;font-size:0.62rem;padding:0.12rem 0.5rem;border-radius:20px">${p.status || 'Pendente'}</span>
                    <span class="drag-card-valor">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                </div>
            </div>
            <div class="drag-card-cliente">${p.cliente || '—'}</div>
            <div class="drag-card-rota">${rotaComTransbordoHTML(p)}</div>
            <div class="drag-card-detalhe">🚗 ${p.modelo || ''} · ${p.placa || ''}${p.referencia ? ` <span class="badge-ref" title="Referência: ${p.referencia}">🔖 ${p.referencia}</span>` : ''}</div>
            ${badgePrazoEntrega(p) ? `<div class="drag-card-detalhe">${badgePrazoEntrega(p)}</div>` : ''}
            <div class="drag-card-bottom" draggable="false">
                ${statusDropdownHTML(p)}
                ${montarMenuAcoes(p.id, [
                    p.status === 'Pendente' ? { label: 'A definir', icone: '⏳', onclick: `registrarIntencaoADefinir(${p.id})` } : null,
                    { label: 'Histórico', icone: '🕘', onclick: `abrirHistorico(${p.id})` },
                    ['Em Coleta','Em Transporte'].includes(p.status) ? { label: 'Ocorrência', icone: '⚠️', onclick: `abrirRegistrarOcorrencia(${p.id})` } : null,
                    p.status === 'Pendente' ? { label: 'Cancelar', icone: '🚫', onclick: `cancelarPedido(${p.id})`, classe: 'menu-acao-alerta' } : null,
                    { label: 'Excluir', icone: '🗑️', onclick: `excluirPedido(${p.id})`, classe: 'menu-acao-perigo' }
                ])}
            </div>
        `;

        // Impede que cliques nos botões iniciem o drag
        card.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mousedown', (e) => e.stopPropagation());
            btn.addEventListener('dragstart', (e) => e.preventDefault());
        });

        card.addEventListener('dragstart', (e) => {
            // Não arrastar se o alvo for um botão
            if (e.target.tagName === 'BUTTON') {
                e.preventDefault();
                return;
            }
            pedidoArrastando = p;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            const listaVeic = document.getElementById('listaVeiculosDrop');
            if (listaVeic) { listaVeic.classList.add('arrastando'); ativarAutoScrollDrag(listaVeic); }
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            pedidoArrastando = null;
            const lv = document.getElementById('listaVeiculosDrop');
            if (lv) lv.classList.remove('arrastando');
            desativarAutoScrollDrag();
        });

        lista.appendChild(card);
    });
}

// #4 · Alterna filtro Frota/Terceiros com rota na alocação
function filtrarCegonhasAlocacao(tipo) {
    document.getElementById('btnFiltroCegTodos')?.classList.toggle('active', tipo === 'todos');
    document.getElementById('btnFiltroCegTerceiros')?.classList.toggle('active', tipo === 'terceiros');
    renderizarVeiculosDrop();
}

function renderizarVeiculosDrop() {
    const lista = document.getElementById('listaVeiculosDrop');
    if (!lista) return;

    if (veiculosGlobais.length === 0) {
        lista.innerHTML = '<p class="text-center text-muted">Nenhum veículo cadastrado.</p>';
        return;
    }

    // #4 · Filtro Frota / Terceiros com rota + busca
    const filtroTipo = document.getElementById('btnFiltroCegTerceiros')?.classList.contains('active') ? 'terceiros' : 'todos';
    const termo = (document.getElementById('buscaCegonhaAlocacao')?.value || '').trim().toLowerCase();

    // #5 · Só aparecem veículos com ROTA PLANEJADA criada (frota ou terceiro).
    // Sem rota = não aparece na alocação. Guarda um mapa placa->rota.
    const rotasAtivas = (typeof rotasGlobais !== 'undefined' ? rotasGlobais : [])
        .filter(r => ['planejada', 'em_andamento'].includes(String(r.status || '').toLowerCase()));
    const placasComRota = new Set(rotasAtivas.map(r => r.placa_cegonha).filter(Boolean));

    let veiculosMostrar = veiculosGlobais.filter(v => {
        // Ponto 5: exige rota planejada
        if (!placasComRota.has(v.placa)) return false;
        // Filtro tipo
        const eTerceiro = v.propriedade === 'terceiro';
        if (filtroTipo === 'terceiros' && !eTerceiro) return false;
        if (filtroTipo === 'todos' && eTerceiro) return false; // "Frota" mostra só frota
        // Busca
        if (termo && !`${v.placa || ''} ${v.modelo || ''} ${v.tipo || ''} ${v.transportador_nome || ''}`.toLowerCase().includes(termo)) return false;
        return true;
    });

    if (veiculosMostrar.length === 0) {
        const dica = filtroTipo === 'terceiros'
            ? 'Nenhum terceiro com rota planejada. Crie uma rota na aba "🛣️ Rotas Planejadas" selecionando um terceiro.'
            : 'Nenhuma cegonha da frota com rota planejada. Crie uma rota primeiro na aba "🛣️ Rotas Planejadas".';
        lista.innerHTML = `<p class="text-center text-muted" style="padding:0.8rem">${dica}</p>`;
        return;
    }

    lista.innerHTML = '';
    veiculosMostrar.forEach(v => {
        // Carros que ocupam vaga nesta cegonha: alocados e ainda não
        // finalizados. (Antes filtrava por status 'Em Rota', que NÃO é um
        // status real do fluxo — só um nome de grupo do painel. Por isso
        // os carros alocados nunca apareciam aqui.)
        const pedidosNoVeiculo = pedidosGlobais.filter(p =>
            p.placaCegonha === v.placa && !['Entregue', 'Cancelado'].includes(p.status)
        );
        const vagas = (v.capacidade || 4) - pedidosNoVeiculo.length;
        const motoristaPadrao = v.motorista_padrao || '';
        const bloqueio = (typeof statusManutencaoVeiculo === 'function') ? statusManutencaoVeiculo(v) : { bloqueado:false, selo:null, motivo:'' };
        const manut = bloqueio.bloqueado ? bloqueio : null;

        const card = document.createElement('div');
        card.className = 'veiculo-drop-card' + (manut ? ' veiculo-drop-manutencao' : '');
        card.dataset.veiculoPlaca = v.placa;

        // Indicador de vagas
        const vagasClass = vagas <= 0 ? 'vagas-cheio' : vagas <= 1 ? 'vagas-quase' : 'vagas-livre';

        card.innerHTML = `
            ${bloqueio.selo ? `<div class="veiculo-drop-manut-selo">${bloqueio.selo}</div>` : ''}
            <div class="veiculo-drop-header">
                <div class="veiculo-drop-title">
                    <span class="veiculo-placa">${v.placa}</span>
                    <span class="veiculo-tipo">${v.tipo || 'Cegonha'}</span>
                    ${(typeof tagIntegridadeHTML === 'function' && v.propriedade !== 'terceiro') ? tagIntegridadeHTML(v) : ''}
                    ${v.propriedade === 'terceiro' ? `<span class="badge-terceiro" title="Terceiro${v.transportador_nome ? ' — ' + v.transportador_nome : ''}">🤝</span>` : ''}
                    ${(() => {
                        const rp = (rotasGlobais || []).find(r => r.placa_cegonha === v.placa && ['planejada','em_andamento'].includes(r.status));
                        return rp ? `<span class="badge-rota-planejada" title="Rota planejada: ${paradasDaRota(rp).join(' → ')}">🛣️ ${rp.nome || 'Rota #' + rp.id}</span>` : '';
                    })()}
                </div>
                <span class="vagas-badge ${vagasClass}">${vagas > 0 ? vagas + ' vaga(s)' : 'Lotado'}</span>
            </div>
            <div class="veiculo-motorista-info">
                👤 <span class="motorista-nome">${motoristaPadrao || 'Sem motorista padrão'}</span>
                <button class="btn-vincular-motorista" onclick="abrirVincularMotorista('${v.placa}', '${v.id || ''}')">Alterar</button>
            </div>
            <div class="veiculo-pedidos-alocados">
                ${pedidosNoVeiculo.map(p => `
                    <div class="pedido-alocado-mini">
                        <span>#${p.id} ${p.cliente || ''}</span>
                        <span>🚗 ${p.modelo || ''} ${p.placa || ''}</span>
                        <span>${p.cidadeOrigem}→${p.cidadeDestino}</span>
                    </div>
                `).join('') || '<span class="text-muted text-sm">Nenhum pedido alocado</span>'}
            </div>
            <div class="drop-zone ${manut ? 'drop-zone-manutencao' : (vagas <= 0 ? 'drop-zone-cheio' : '')}" data-placa="${v.placa}">
                ${manut ? ('🔧 ' + (bloqueio.motivo || 'Bloqueado para manutenção')) : (vagas <= 0 ? '🔒 Veículo lotado' : '⬇ Arraste um pedido aqui')}
            </div>
        `;

        // Drag events na drop zone (bloqueado se lotado OU em manutenção)
        const dropZone = card.querySelector('.drop-zone');
        if (vagas > 0 && !manut) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                if (cargaArrastando && cargaArrastando.length > 0) {
                    veiculoAlvoDrop = v;
                    abrirModalAlocacaoCarga(cargaArrastando, v);
                } else if (pedidoArrastando) {
                    veiculoAlvoDrop = v;
                    abrirModalAlocacao(pedidoArrastando, v);
                }
            });
        }

        lista.appendChild(card);
    });
}

// Auto-scroll ao arrastar perto do topo/base da lista de cegonhas
let _autoScrollRAF = null;
function ativarAutoScrollDrag(elemento) {
    const margem = 70, velocidade = 12;
    let mouseY = 0;
    const onDragOver = (e) => { mouseY = e.clientY; };
    document.addEventListener('dragover', onDragOver);
    const passo = () => {
        const rect = elemento.getBoundingClientRect();
        if (mouseY && mouseY < rect.top + margem) elemento.scrollTop -= velocidade;
        else if (mouseY && mouseY > rect.bottom - margem) elemento.scrollTop += velocidade;
        _autoScrollRAF = requestAnimationFrame(passo);
    };
    _autoScrollRAF = requestAnimationFrame(passo);
    desativarAutoScrollDrag._cleanup = () => document.removeEventListener('dragover', onDragOver);
}
function desativarAutoScrollDrag() {
    if (_autoScrollRAF) { cancelAnimationFrame(_autoScrollRAF); _autoScrollRAF = null; }
    if (desativarAutoScrollDrag._cleanup) { desativarAutoScrollDrag._cleanup(); desativarAutoScrollDrag._cleanup = null; }
}

// ============================================
// MODAL DE ALOCAÇÃO (DRAG DROP)
// ============================================

// ============================================
// FASE A · Trechos da viagem (N motoristas / cegonhas, frete por km)
// ============================================
let alocTrechos = [];
let alocModoEdicao = false; // true quando editando trechos de um pedido já alocado

function _alocFreteCentavos() {
    const pedidoId = document.getElementById('alocPedidoId')?.value;
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    const v = pedido ? (parseFloat(pedido.valorFrete ?? pedido.valor_frete) || 0) : 0;
    return Math.round(v * 100);
}

function _alocDividirPorKm(freteCent, trechos) {
    const kms = trechos.map(t => Math.max(0, Number(t.km) || 0));
    const total = kms.reduce((s, k) => s + k, 0);
    let v;
    if (total <= 0) { const base = Math.floor(freteCent / (trechos.length || 1)); v = trechos.map(() => base); }
    else { v = kms.map(k => Math.floor(freteCent * k / total)); }
    const alocado = v.reduce((s, x) => s + x, 0);
    if (v.length) v[v.length - 1] += freteCent - alocado; // sobra no ultimo
    return v;
}

function _alocOptsMotoristas(sel) {
    const opts = ['<option value="">Selecione…</option>'];
    (motoristasGlobais || []).forEach(m => {
        const nome = m.nome || m;
        const extra = m.vinculo === 'terceiro' ? ' \ud83e\udd1d (terceiro)' : '';
        opts.push(`<option value="${nome}" ${nome === sel ? 'selected' : ''}>${nome}${extra}</option>`);
    });
    return opts.join('');
}

function renderAlocTrechos() {
    const lista = document.getElementById('alocTrechosLista');
    if (!lista) return;
    const freteCent = _alocFreteCentavos();
    const valores = _alocDividirPorKm(freteCent, alocTrechos);
    const reais = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const esc = v => (v || '').replace(/"/g, '&quot;');
    const total = alocTrechos.length;

    lista.innerHTML = alocTrechos.map((t, i) => {
        const conector = i < total - 1
            ? `<div class="trecho-conector"><span>a mesma carga segue para a próxima cegonha</span></div>`
            : '';
        const motoristaResumo = t.motorista
            ? `<span class="trecho-quem">🚚 ${t.motorista}</span>`
            : `<span class="trecho-quem trecho-quem-vazio">sem motorista</span>`;
        return `
        <div class="trecho-card">
            <div class="trecho-card-topo">
                <span class="trecho-badge">Trecho ${i + 1}</span>
                ${motoristaResumo}
                <button type="button" class="btn-rm-trecho" onclick="alocRemTrecho(${i})" ${total <= 1 ? 'disabled' : ''} title="Remover este trecho">✕</button>
            </div>

            <div class="trecho-percurso">
                <div class="fg">
                    <label>📍 De (onde pega)</label>
                    <input type="text" value="${esc(t.origem)}" placeholder="Cidade/UF" oninput="alocUpdTrecho(${i},'origem',this.value)">
                </div>
                <span class="seta-percurso">→</span>
                <div class="fg">
                    <label>🏁 Até (onde larga)</label>
                    <input type="text" value="${esc(t.destino)}" placeholder="Cidade/UF" oninput="alocUpdTrecho(${i},'destino',this.value)">
                </div>
            </div>

            <div class="trecho-dados">
                <div class="fg">
                    <label>Motorista / cegonha deste trecho</label>
                    <select onchange="alocUpdTrecho(${i},'motorista',this.value)">${_alocOptsMotoristas(t.motorista)}</select>
                </div>
                <div class="fg fg-km">
                    <label>Km do trecho</label>
                    <input type="number" min="0" step="1" value="${t.km || ''}" placeholder="0" oninput="alocUpdTrecho(${i},'km',this.value)">
                </div>
                <div class="fg fg-valor">
                    <label>Frete deste trecho</label>
                    <input type="text" value="R$ ${reais(valores[i])}" readonly tabindex="-1">
                </div>
            </div>
        </div>
        ${conector}`;
    }).join('');

    const soma = valores.reduce((s, v) => s + v, 0);
    const somaEl = document.getElementById('alocTrechosSoma');
    const rod = document.getElementById('alocTrechosRodape');
    if (somaEl) somaEl.textContent = 'R$ ' + reais(soma);
    if (rod) rod.className = 'trechos-rodape ' + (soma === freteCent ? 'ok' : 'warn');
}

// Recalcula só os VALORES e a soma, sem refazer a lista (preserva o foco/cursor)
function _alocRecalcValores() {
    const freteCent = _alocFreteCentavos();
    const valores = _alocDividirPorKm(freteCent, alocTrechos);
    const reais = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const cards = document.querySelectorAll('#alocTrechosLista .trecho-card');
    cards.forEach((card, i) => {
        const inp = card.querySelector('.fg-valor input');
        if (inp) inp.value = 'R$ ' + reais(valores[i] || 0);
    });
    const soma = valores.reduce((s, v) => s + v, 0);
    const somaEl = document.getElementById('alocTrechosSoma');
    const rod = document.getElementById('alocTrechosRodape');
    if (somaEl) somaEl.textContent = 'R$ ' + reais(soma);
    if (rod) rod.className = 'trechos-rodape ' + (soma === freteCent ? 'ok' : 'warn');
}

// IMPORTANTE: enquanto o usuário digita nos campos de texto, NÃO refazemos a
// lista inteira (isso recriava o input e tirava o foco a cada letra). Só
// guardamos o valor e atualizamos pontualmente o que precisa.
function alocUpdTrecho(i, campo, val) {
    if (!alocTrechos[i]) return;
    const anterior = alocTrechos[i][campo];
    alocTrechos[i][campo] = campo === 'km' ? (parseFloat(val) || 0) : val;

    if (campo === 'km') {
        _alocRecalcValores(); // muda os valores, mas mantém o cursor no campo km
        return;
    }

    if (campo === 'motorista') {
        // atualiza a tag "quem leva" no topo do cartão, sem refazer a lista
        const card = document.querySelectorAll('#alocTrechosLista .trecho-card')[i];
        const tag = card && card.querySelector('.trecho-quem');
        if (tag) {
            if (val) { tag.textContent = '🚚 ' + val; tag.classList.remove('trecho-quem-vazio'); }
            else { tag.textContent = 'sem motorista'; tag.classList.add('trecho-quem-vazio'); }
        }
        return;
    }

    if (campo === 'destino' && alocTrechos[i + 1]) {
        // Encadeia no "De" do próximo se ele estava vazio (ou igual ao destino antigo).
        const prox = alocTrechos[i + 1];
        if (!prox.origem || prox.origem === anterior) {
            prox.origem = val;
            const proxCard = document.querySelectorAll('#alocTrechosLista .trecho-card')[i + 1];
            const inpDe = proxCard && proxCard.querySelectorAll('.trecho-percurso input')[0];
            // só escreve no input do próximo se ele NÃO estiver em foco (não atrapalha digitação)
            if (inpDe && document.activeElement !== inpDe) inpDe.value = val;
        }
    }
    // campos de texto (origem/destino): o próprio input já mostra o que foi digitado,
    // então não precisamos redesenhar nada aqui.
}
function alocRemTrecho(i) {
    if (alocTrechos.length > 1) { alocTrechos.splice(i, 1); renderAlocTrechos(); }
}
function alocAddTrecho() {
    const ult = alocTrechos[alocTrechos.length - 1];
    alocTrechos.push({ origem: ult ? (ult.destino || '') : '', destino: '', motorista: '', km: 0 });
    renderAlocTrechos();
}
// Preenche o km de cada trecho automaticamente, via Edge Function calcular-km
// (usa OSRM por padrão; Google se a chave estiver configurada no Supabase).
async function alocCalcularKmAuto() {
    if (typeof supabase === 'undefined' || !supabase) {
        alert('Sem conexão com o servidor para calcular o km.');
        return;
    }
    const btn = document.getElementById('btnKmAuto');
    const textoOrig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Calculando km...'; }
    let algum = false;
    const falhas = []; // { n, motivo }
    for (let i = 0; i < alocTrechos.length; i++) {
        const t = alocTrechos[i];
        if (!t.origem || !t.destino) { falhas.push({ n: i + 1, motivo: 'faltou preencher De/Até' }); continue; }
        if (btn) btn.textContent = `⏳ Calculando trecho ${i + 1}/${alocTrechos.length}...`;
        try {
            const { data, error } = await supabase.functions.invoke('calcular-km', {
                body: { origem: t.origem, destino: t.destino }
            });
            if (error) throw new Error(error.message || 'função calcular-km indisponível');
            if (data && data.error) throw new Error(data.error);
            if (data && data.km) { alocTrechos[i].km = data.km; algum = true; renderAlocTrechos(); }
            else falhas.push({ n: i + 1, motivo: 'rota não encontrada' });
        } catch (e) {
            falhas.push({ n: i + 1, motivo: (e && e.message) ? e.message : String(e) });
        }
    }
    if (btn) { btn.disabled = false; btn.textContent = textoOrig || '📍 Calcular km automaticamente'; }

    if (falhas.length) {
        const linhas = falhas.map(f => `• Trecho ${f.n}: ${f.motivo}`).join('\n');
        if (algum) {
            alert('Calculei o que deu certo. Estes ficaram pendentes — pode digitar o km à mão:\n\n' + linhas);
        } else {
            alert('Não consegui calcular o km automaticamente:\n\n' + linhas +
                  '\n\nDica: escreva as cidades como "Cidade/UF" (ex.: Curitiba/PR). Você pode digitar o km manualmente.');
        }
    }
}

function initAlocTrechos(pedido, veiculo) {
    const origem = `${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''}`;
    const destino = `${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}`;
    alocTrechos = [{ origem, destino, motorista: veiculo.motorista_padrao || '', placa_cegonha: veiculo.placa || '', km: 0 }];
    renderAlocTrechos();
}

// ============================================
// EDITAR TRECHOS de um pedido JÁ ALOCADO (reabre a tela de trechos)
// ============================================
async function abrirEdicaoTrechos(pedidoId) {
  try {
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) { alert('Pedido não encontrado.'); return; }

    const placaCeg = pedido.placaCegonha || pedido.placa_cegonha || '';
    const veiculo = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
        .find(v => v.placa === placaCeg) || { placa: placaCeg, motorista_padrao: pedido.motorista1 || '' };

    const modal = document.getElementById('modalAlocacao');
    if (!modal) { alert('Modal de alocação não encontrado nesta tela.'); return; }

    alocModoEdicao = true;
    document.getElementById('alocPedidoId').value = pedido.id;
    document.getElementById('alocVeiculoId').value = veiculo.placa || placaCeg;

    const h2 = modal.querySelector('h2');
    if (h2) h2.textContent = 'Editar trechos da viagem';

    const resumo = document.getElementById('alocacaoResumo');
    if (resumo) {
        resumo.innerHTML = `
            <div class="alocacao-info">
                <div class="alocacao-info-item"><label>Pedido</label><span>#${pedido.id} — ${pedido.cliente || ''}</span></div>
                <div class="alocacao-info-item"><label>Rota</label><span>${pedido.cidadeOrigem}/${pedido.ufOrigem} → ${pedido.cidadeDestino}/${pedido.ufDestino}</span></div>
                <div class="alocacao-info-item"><label>Cegonha</label><span>${veiculo.placa || placaCeg || '—'}</span></div>
                <div class="alocacao-info-item"><label>Status atual</label><span>${pedido.status || '—'}</span></div>
            </div>`;
    }

    const toLocal = v => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d)) return '';
        const off = d.getTimezoneOffset();
        return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
    };
    const dtC = document.getElementById('alocDataColeta');
    const dtE = document.getElementById('alocDataEntrega');
    if (dtC) { dtC.value = toLocal(pedido.dataPrevColeta || pedido.data_prev_coleta); dtC.required = false; }
    if (dtE) { dtE.value = toLocal(pedido.dataPrevEntrega || pedido.data_prev_entrega); dtE.required = false; }

    if (typeof alternarCamposMotorista === 'function') alternarCamposMotorista(true, true);

    // Abre o modal JÁ (não depende do carregamento assíncrono dos trechos).
    // Move para o <body> para não ficar preso a nenhuma aba escondida.
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    modal.classList.add('show');

    // Carrega os trechos existentes; se falhar, o modal continua aberto com 1 trecho base
    try {
        await carregarTrechosDoPedido(pedido, veiculo);
    } catch (eLoad) {
        console.error('Falha ao carregar trechos:', eLoad);
        const origem = `${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''}`;
        const destino = `${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}`;
        alocTrechos = [{ origem, destino, motorista: pedido.motorista1 || veiculo.motorista_padrao || '', km: 0 }];
        renderAlocTrechos();
    }
  } catch (e) {
    console.error('Erro ao abrir edição de trechos:', e);
    alert('Não consegui abrir a edição de trechos: ' + (e && e.message ? e.message : e));
  }
}

// Carrega os trechos já existentes do pedido (tabela nova) com fallback para o legado
async function carregarTrechosDoPedido(pedido, veiculo) {
    let carregados = [];
    if (typeof supabase !== 'undefined' && supabase) {
        try {
            const { data } = await supabase
                .from('pedido_trechos').select('*')
                .eq('pedido_id', parseInt(pedido.id)).order('ordem', { ascending: true });
            if (data && data.length) {
                carregados = data.map(r => ({
                    origem: [r.origem_cidade, r.origem_uf].filter(Boolean).join('/'),
                    destino: [r.destino_cidade, r.destino_uf].filter(Boolean).join('/'),
                    motorista: r.motorista_nome || '',
                    placa_cegonha: r.placa_cegonha || '',
                    km: Number(r.km) || 0
                }));
            }
        } catch (e) {
            console.warn('Não consegui ler pedido_trechos (a tabela existe?).', e);
        }
    }
    if (!carregados.length) {
        // Fallback: reconstrói a partir das colunas legadas motorista_1/2
        const origem = `${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''}`;
        const destino = `${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}`;
        const m1 = pedido.motorista1 || pedido.motorista_1 || veiculo.motorista_padrao || '';
        const m2 = pedido.motorista2 || pedido.motorista_2 || '';
        if (m2) {
            carregados = [
                { origem, destino: '', motorista: m1, km: 0 },
                { origem: '', destino, motorista: m2, km: 0 }
            ];
        } else {
            carregados = [{ origem, destino, motorista: m1, placa_cegonha: veiculo.placa || '', km: 0 }];
        }
    }
    alocTrechos = carregados;
    renderAlocTrechos();
}

function abrirModalAlocacao(pedido, veiculo) {
    if (bloquearSeNaoLogistica('a alocação de veículos')) return;
    const _bloq = (typeof statusManutencaoVeiculo === 'function') ? statusManutencaoVeiculo(veiculo) : null;
    if (_bloq && _bloq.bloqueado) { alert(`Veículo ${veiculo.placa} indisponível: ${_bloq.motivo}.`); return; }
    const modal = document.getElementById('modalAlocacao');
    if (!modal) return;
    alocModoEdicao = false; // alocação inicial (não é edição)
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    const _h2 = modal.querySelector('h2'); if (_h2) _h2.textContent = 'Confirmar Alocação';
    const _dc = document.getElementById('alocDataColeta'); if (_dc) _dc.required = true;
    const _de = document.getElementById('alocDataEntrega'); if (_de) _de.required = true;

    document.getElementById('alocPedidoId').value = pedido.id;
    document.getElementById('alocVeiculoId').value = veiculo.placa;

    const resumo = document.getElementById('alocacaoResumo');
    resumo.innerHTML = `
        <div class="alocacao-info">
            <div class="alocacao-info-item">
                <label>Pedido</label>
                <span>#${pedido.id} — ${pedido.cliente || ''}</span>
            </div>
            <div class="alocacao-info-item">
                <label>Rota</label>
                <span>${pedido.cidadeOrigem}/${pedido.ufOrigem} → ${pedido.cidadeDestino}/${pedido.ufDestino}</span>
            </div>
            <div class="alocacao-info-item">
                <label>Veículo</label>
                <span>${veiculo.placa} (${veiculo.tipo || 'Cegonha'})</span>
            </div>
            <div class="alocacao-info-item">
                <label>Veículo do Cliente</label>
                <span>${pedido.modelo || ''} · ${pedido.placa || ''}</span>
            </div>
        </div>
    `;

    // Motorista: se a cegonha já tem motorista definido, usa o dela e não
    // pergunta de novo — só mostra quem é, com opção de trocar/dividir.
    const selMot1 = document.getElementById('alocMotorista1');
    const selMot2 = document.getElementById('alocMotorista2');
    if (selMot1) selMot1.value = veiculo.motorista_padrao || '';
    if (selMot2) selMot2.value = '';
    const p1 = document.getElementById('alocPercent1');
    const p2 = document.getElementById('alocPercent2');
    if (p1) p1.value = 100;
    if (p2) p2.value = 0;

    // Aviso se o motorista da cegonha estiver de folga na data da coleta
    mostrarAvisoFolgaMotorista(veiculo.motorista_padrao, pedido);
    if (typeof mostrarAvisoFolgaProxima === 'function') mostrarAvisoFolgaProxima(veiculo.motorista_padrao, pedido);
    initAlocTrechos(pedido, veiculo);

    if (veiculo.motorista_padrao) {
        // Se o motorista padrão não existe mais na lista (renomeado/excluído),
        // o value não "cola" — nesse caso mostramos os campos para escolher.
        const colou = selMot1 && selMot1.value === veiculo.motorista_padrao;
        if (colou) {
            const txt = document.getElementById('alocMotoristaResumoTexto');
            if (txt) txt.innerHTML = `👤 Motorista da cegonha: <strong>${veiculo.motorista_padrao}</strong> · 100% do frete`;
            alternarCamposMotorista(false);
        } else {
            alternarCamposMotorista(true, true);
        }
    } else {
        // Cegonha sem motorista padrão: precisa escolher
        alternarCamposMotorista(true, true);
    }

    modal.classList.add('show');
}

// Alterna entre o resumo do motorista da cegonha e os campos de ajuste
function alternarCamposMotorista(mostrarCampos, semPadrao) {
    const campos  = document.getElementById('alocMotoristaCampos');
    const resumo  = document.getElementById('alocMotoristaResumo');
    if (campos) campos.style.display = mostrarCampos ? '' : 'none';
    if (resumo) resumo.style.display = mostrarCampos ? 'none' : '';
    // quando não há motorista padrão, nem oferece o resumo
    if (semPadrao && resumo) resumo.style.display = 'none';
}

async function confirmarAlocacao(event) {
    event.preventDefault();
    if (bloquearSeNaoLogistica('a alocação de veículos')) return;

    const pedidoId = document.getElementById('alocPedidoId').value;
    const veiculoPlaca = document.getElementById('alocVeiculoId').value;
    const dataColeta = document.getElementById('alocDataColeta').value;
    const dataEntrega = document.getElementById('alocDataEntrega').value;

    // --- Trechos (Fase A): valida motoristas e calcula divisão por km ---
    const trechos = (alocTrechos || []).filter(t => (t.motorista || '').trim());
    if (trechos.length === 0) {
        alert('Informe ao menos um motorista no trecho da viagem.');
        return;
    }

    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const freteCent = Math.round((parseFloat(pedido.valorFrete ?? pedido.valor_frete) || 0) * 100);
    const valores = _alocDividirPorKm(freteCent, trechos);
    const pct = v => freteCent > 0 ? Math.round(v / freteCent * 10000) / 100 : 0;
    const motorista1 = trechos[0].motorista; // usado no histórico/notificação

    const rota = `${pedido.cidadeOrigem}/${pedido.ufOrigem} - ${pedido.cidadeDestino}/${pedido.ufDestino}`;

    // Espelho legado motorista_1/2 (telas antigas continuam lendo estas colunas)
    const atualizacao = {
        rota,
        placa_cegonha: veiculoPlaca,
        motorista_1: trechos[0].motorista,
        percent_motorista_1: pct(valores[0]),
        motorista_2: trechos[1] ? trechos[1].motorista : null,
        percent_motorista_2: trechos[1] ? pct(valores[1]) : null,
        data_prev_coleta: dataColeta,
        data_prev_entrega: dataEntrega,
        status: 'Intenção Agendada'
    };

    const modoEdicao = (typeof alocModoEdicao !== 'undefined' && alocModoEdicao === true);
    if (modoEdicao) {
        // Editando um pedido já alocado: não mexe no status nem reinicia o fluxo.
        delete atualizacao.status;
    }

    // Se a cegonha tem uma rota planejada ativa, o pedido entra nela
    // automaticamente (conta nas vagas da rota, aparece nos vinculados).
    const rotaDaCegonha = (rotasGlobais || []).find(r =>
        r.placa_cegonha === veiculoPlaca && ['planejada','em_andamento'].includes(r.status)
    );
    if (rotaDaCegonha) atualizacao.rota_id = rotaDaCegonha.id;

    if (supabase) {
        try {
            const { error } = await supabase.from('pedidos').update(atualizacao).eq('id', pedidoId);
            if (error) throw error;

            // Gravar os trechos na tabela nova (blindado: se a tabela ainda
            // não existir, a alocação não quebra — segue pelas colunas legadas)
            try {
                await supabase.from('pedido_trechos').delete().eq('pedido_id', parseInt(pedidoId));
                const linhasTrechos = trechos.map((t, i) => {
                    const [oc, ou] = (t.origem || '').split('/');
                    const [dc, du] = (t.destino || '').split('/');
                    return {
                        pedido_id: parseInt(pedidoId),
                        ordem: i + 1,
                        origem_cidade: (oc || '').trim() || null,
                        origem_uf: (ou || '').trim() || null,
                        destino_cidade: (dc || '').trim() || null,
                        destino_uf: (du || '').trim() || null,
                        motorista_nome: t.motorista || null,
                        placa_cegonha: t.placa_cegonha || veiculoPlaca || null,
                        km: Number(t.km) || 0,
                        valor_frete: (valores[i] || 0) / 100,
                        status: 'pendente'
                    };
                });
                if (linhasTrechos.length) {
                    const r = await supabase.from('pedido_trechos').insert(linhasTrechos);
                    if (r.error) console.warn('Trechos não gravados (rode a migração pedido_trechos):', r.error.message);
                }
            } catch (eTrecho) {
                console.warn('Tabela pedido_trechos indisponível — seguindo só com colunas legadas.', eTrecho);
            }
            // Registrar histórico só na alocação inicial (edição de trechos não muda status)
            if (!modoEdicao) {
                const pedidoAtual = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
                await supabase.from('historico_status').insert({
                    pedido_id: parseInt(pedidoId),
                    status_anterior: pedidoAtual?.status || 'Pendente',
                    status_novo: 'Intenção Agendada',
                    usuario_nome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
                    usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
                    observacao: `Alocado no veículo ${veiculoPlaca} com motorista ${motorista1}`
                });
            }
            await recarregarPedidos();
            fecharModal('modalAlocacao');
            if (!modoEdicao) {
                notificar({
                    perfil: 'comercial', nome: pedido.responsavelComercial, pedidoId: pedido.id, tipo: 'status',
                    titulo: '📦 Seu pedido foi alocado',
                    mensagem: `${pedido.cliente} · cegonha ${veiculoPlaca}${motorista1 ? ' · motorista ' + motorista1 : ''} — só para você saber. Você será chamado para liberar a coleta.`
                });
            }
            alocModoEdicao = false;
            exibirMensagem('mensagemLogistica', modoEdicao ? '✅ Trechos atualizados!' : '✅ Pedido alocado com sucesso!', 'success');
            renderizarPedidosDrag();
            renderizarVeiculosDrop();
            renderizarKanban();
            renderizarPainelCegonhas();
        } catch (error) {
            console.error('Erro ao alocar:', error);
            alert('Erro ao alocar: ' + error.message);
        }
    }
}

// ============================================
// VINCULAR MOTORISTA AO VEÍCULO
// ============================================

function abrirVincularMotorista(placa, veiculoId) {
    const motorista = prompt(`Veículo ${placa}\n\nDigite o nome do motorista padrão (deixe em branco para remover):`);
    if (motorista === null) return; // cancelou

    vincularMotoristaVeiculo(placa, motorista.trim());
}

async function vincularMotoristaVeiculo(placa, motoristaNome) {
    if (supabase) {
        try {
            const { error } = await supabase
                .from('veiculos')
                .update({ motorista_padrao: motoristaNome || null })
                .eq('placa', placa);
            if (error) throw error;
            await aposMutacaoPedidos({ forceFull: true });
            renderizarVeiculosDrop();
            exibirMensagem('mensagemLogistica', `✅ Motorista ${motoristaNome || 'removido'} do veículo ${placa}`, 'success');
        } catch (error) {
            alert('Erro ao vincular motorista: ' + error.message);
        }
    } else {
        const v = veiculosGlobais.find(v => v.placa === placa);
        if (v) { v.motorista_padrao = motoristaNome; renderizarVeiculosDrop(); }
    }
}

// ============================================
// MODAL LEGADO (EDIÇÃO)
// ============================================

function fecharModal(modalId) {
    const id = modalId || 'modalEdicao';
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
}

function configurarModal() {
    const modal = document.getElementById('modalEdicao');
    if (!modal) return;

    const btnFechar = document.getElementById('btnFecharModal');
    const spanFechar = modal.querySelector('.close');

    if (btnFechar) btnFechar.addEventListener('click', () => fecharModal('modalEdicao'));
    if (spanFechar) spanFechar.addEventListener('click', () => fecharModal('modalEdicao'));

    modal.addEventListener('click', function(event) {
        if (event.target === modal) fecharModal('modalEdicao');
    });

    const modalAlocacao = document.getElementById('modalAlocacao');
    if (modalAlocacao) {
        modalAlocacao.addEventListener('click', function(event) {
            if (event.target === modalAlocacao) fecharModal('modalAlocacao');
        });
    }
}

async function salvarAlteracoesLogistica(event) {
    event.preventDefault();

    const pedidoID = document.getElementById('pedidoID').value;
    const percent1 = parseFloat(document.getElementById('percentMotorista1').value) || 0;
    const percent2 = parseFloat(document.getElementById('percentMotorista2').value) || 0;

    if (percent1 + percent2 > 100) {
        exibirMensagem('mensagemLogistica', 'A soma dos percentuais não pode passar de 100%.', 'error');
        return;
    }

    const alteracoes = {
        rota: document.getElementById('trechoRota').value,
        placa_cegonha: document.getElementById('veiculo1').value,
        motorista_1: document.getElementById('motorista1').value,
        percent_motorista_1: percent1,
        motorista_2: document.getElementById('motorista2').value,
        percent_motorista_2: percent2,
        data_prev_coleta: document.getElementById('dataPrevColeta').value,
        data_prev_entrega: document.getElementById('dataPrevEntrega').value,
        // 'Em Rota' não é status válido do fluxo — alocar gera Intenção Agendada
        status: 'Intenção Agendada'
    };

    if (supabase) {
        try {
            const { error } = await supabase.from('pedidos').update(alteracoes).eq('id', pedidoID);
            if (error) throw error;
            await aposMutacaoPedidos({ forceFull: true });
            exibirMensagem('mensagemLogistica', 'Pedido alocado com sucesso!', 'success');
            fecharModal('modalEdicao');
            renderizarPedidosDrag();
            renderizarVeiculosDrop();
        } catch (error) {
            exibirMensagem('mensagemLogistica', 'Erro ao salvar: ' + error.message, 'error');
        }
    }
}

