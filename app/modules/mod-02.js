/* ============================================================================
   MOVEMASTER — mod-02.js  (49 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: podeAgirEquipe, bloquearSeNaoEquipe, abrirModalAlocacaoCarga, montarBlocoCargaFechada, alternarCargaFechada, renderizarPedidosDrag, filtrarCegonhasAlocacao, renderizarVeiculosDrop, ...
   ============================================================================ */
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

// ============================================
// FATURAMENTO POR MOTORISTA
// ============================================

let _fatTrechosCache = [];

// Parte 3 · Auditoria: cargas com CTE emitido x faturado
// Link para abrir o CTE no Mais Frete.
// ATENÇÃO: hoje usa f_cd_ctrc (ID interno do Mais Frete). Se o número que o
// fiscal digita for o número FISCAL do CTE (diferente do ID interno), troque
// o parâmetro AQUI (ex.: para o campo de busca por número). Um lugar só.
function montarLinkCTE(codigo) {
    const c = encodeURIComponent((codigo || '').toString().trim());
    return `https://oliveira.atua.com.br/adm/con_ctrc.php?f_cd_ctrc=${c}`;
}
let _auditFatAberto = false;
function toggleAuditFaturados() { _auditFatAberto = !_auditFatAberto; renderAuditoriaFaturamento(); }

async function renderAuditoriaFaturamento() {
    const cont = document.getElementById('auditoriaFaturamento');
    if (!cont || !supabase) return;
    cont.innerHTML = '<p class="text-center text-muted">Carregando...</p>';
    try {
        const { data, error } = await supabase.from('ocorrencias')
            .select('*').eq('tipo', 'pdf_fiscal').eq('cte_emitido', true)
            .order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        const espelhos = data || [];
        const parse = e => { try { return JSON.parse(e.dados_extras || '{}'); } catch (_) { return {}; } };
        const money = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

        const pendentes = espelhos.filter(e => e.faturado !== true);
        const feitos = espelhos.filter(e => e.faturado === true);

        const ident = (e) => {
            const d = parse(e);
            const snap = Array.isArray(d.snapshot) ? d.snapshot : [];
            return {
                cegonha: e.espelho_cegonha || d.placa_cegonha || '—',
                clientes: [...new Set(snap.map(x => x.cliente).filter(Boolean))],
                placas: snap.map(x => x.placa).filter(Boolean),
                refs: [...new Set(snap.map(x => x.referencia).filter(Boolean))],
                dataCte: e.cte_emitido_em ? new Date(e.cte_emitido_em).toLocaleDateString('pt-BR')
                        : (e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : ''),
                total: d.total_frete,
                doc: d.numero_doc || '',
                qtd: d.total_pedidos || (d.pedidos_ids ? d.pedidos_ids.length : snap.length)
            };
        };

        const card = (e, pend) => {
            const id = ident(e);
            const cteNum = e.cte_numero
                ? `<span class="audit-chip audit-chip-cte" title="Número do CTE (localize no Mais Frete pela busca)">🧾 CTE nº ${e.cte_numero}</span>`
                : '';
            return `<div class="audit-card ${pend ? 'audit-pend' : 'audit-ok'}">
                <div class="audit-topo">
                    <span class="audit-cegonha">🚛 ${id.cegonha}</span>
                    ${id.dataCte ? `<span class="audit-data">📅 ${id.dataCte}</span>` : ''}
                    ${pend ? '<span class="audit-tag-pend">Pendente de faturar</span>'
                           : `<span class="audit-tag-ok">✅ Faturado${e.faturado_por ? ' · ' + e.faturado_por : ''}</span>`}
                </div>
                <div class="audit-ident">
                    ${cteNum}
                    ${id.clientes.length ? `<span class="audit-chip audit-chip-cli">🏢 ${id.clientes.join(', ')}</span>` : ''}
                    ${id.placas.length ? `<span class="audit-chip audit-chip-placa">🚗 ${id.placas.join(' · ')}</span>` : ''}
                    ${id.refs.length ? `<span class="audit-chip audit-chip-ref">🔖 ${id.refs.join(', ')}</span>` : ''}
                </div>
                <div class="audit-info">${id.qtd || '?'} veículo(s) · ${id.total != null ? money(id.total) : '—'}${id.doc ? ` · doc ${id.doc}` : ''} · CTE${e.cte_emitido_por ? ' por ' + e.cte_emitido_por : ''}</div>
                ${pend ? `<button class="btn btn-primary btn-sm" onclick="marcarFaturado('${e.id}')">✅ Marcar como faturado</button>` : ''}
            </div>`;
        };

        cont.innerHTML = `
            <div class="audit-resumo">
                <span class="audit-num-pend">${pendentes.length}</span> pendente(s) de faturar ·
                <span class="audit-num-ok">${feitos.length}</span> já faturada(s)
            </div>
            ${pendentes.length
                ? '<h4 class="audit-h">⚠️ Pendentes de faturar</h4>' + pendentes.map(e => card(e, true)).join('')
                : '<p class="audit-zero">🎉 Nenhuma carga com CTE emitido está pendente de faturar.</p>'}
            ${feitos.length ? `
                <div class="audit-faturados-header" onclick="toggleAuditFaturados()">
                    <span class="grupo-toggle">${_auditFatAberto ? '▼' : '▶'}</span>
                    <strong>Já faturadas</strong> <span class="audit-count">${feitos.length}</span>
                    <span class="grupo-dica">${_auditFatAberto ? 'minimizar' : 'abrir'}</span>
                </div>
                ${_auditFatAberto ? feitos.map(e => card(e, false)).join('') : ''}
            ` : ''}
        `;
    } catch (e) {
        cont.innerHTML = `<p class="text-center text-muted">Não consegui carregar a auditoria (rodou a migração auditoria_faturado.sql?). ${e.message || ''}</p>`;
    }
}

async function gerarPDFAuditoria() {
    if (!supabase) { alert('Sem conexão para gerar o PDF.'); return; }
    let espelhos = [];
    try {
        const { data, error } = await supabase.from('ocorrencias')
            .select('*').eq('tipo', 'pdf_fiscal').eq('cte_emitido', true)
            .order('created_at', { ascending: false }).limit(300);
        if (error) throw error;
        espelhos = data || [];
    } catch (e) { alert('Não consegui carregar a auditoria: ' + (e.message || e)); return; }
    if (!espelhos.length) { alert('Nenhuma carga com CTE emitido para gerar o relatório.'); return; }

    const parse = e => { try { return JSON.parse(e.dados_extras || '{}'); } catch (_) { return {}; } };
    const money = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const dataStr = e => e.cte_emitido_em ? new Date(e.cte_emitido_em).toLocaleDateString('pt-BR') : (e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : '-');

    const pend = espelhos.filter(e => e.faturado !== true);
    const feitos = espelhos.filter(e => e.faturado === true);
    const totalPend = pend.reduce((s, e) => s + (Number(parse(e).total_frete) || 0), 0);
    const totalFeito = feitos.reduce((s, e) => s + (Number(parse(e).total_frete) || 0), 0);

    const linha = (e) => {
        const d = parse(e);
        const snap = Array.isArray(d.snapshot) ? d.snapshot : [];
        const clientes = [...new Set(snap.map(x => x.cliente).filter(Boolean))].join(', ');
        const placas = snap.map(x => x.placa).filter(Boolean).join(' / ');
        return `<tr><td>${e.espelho_cegonha || d.placa_cegonha || '-'}</td><td>${e.cte_numero || '-'}</td><td>${dataStr(e)}</td><td>${clientes || '-'}</td><td>${placas || '-'}</td><td style="text-align:right">${d.total_frete != null ? money(d.total_frete) : '-'}</td><td>${e.faturado ? (e.faturado_por || 'sim') : ''}</td></tr>`;
    };
    const tabela = (titulo, arr, total) => arr.length ? `<h3>${titulo} (${arr.length}) - ${money(total)}</h3>
        <table><thead><tr><th>Cegonha</th><th>CTE nº</th><th>Data CTE</th><th>Cliente(s)</th><th>Placas</th><th>Valor</th><th>Faturado por</th></tr></thead><tbody>${arr.map(linha).join('')}</tbody></table>` : '';

    const aud_corpo = ''
        + '<div class="resumo"><strong>' + pend.length + '</strong> pendente(s) de faturar (' + money(totalPend) + ') &middot; <strong>' + feitos.length + '</strong> ja faturada(s) (' + money(totalFeito) + ')</div>'
        + tabela('PENDENTES DE FATURAR', pend, totalPend)
        + tabela('JA FATURADAS', feitos, totalFeito);
    _abrirPDF('Auditoria de CTE (emitido x faturado)', aud_corpo);
}

async function marcarFaturado(id) {
    if (!supabase) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
    try {
        const { error } = await supabase.from('ocorrencias').update({
            faturado: true, faturado_em: new Date().toISOString(), faturado_por: usuarioNome
        }).eq('id', id);
        if (error) throw error;
        renderAuditoriaFaturamento();
    } catch (e) {
        alert('Não consegui marcar como faturado: ' + (e.message || e));
    }
}

// Helper único: abre um PDF com cabeçalho/logo Movemaster padronizado.
// corpoHtml = o conteúdo específico do relatório.
function _abrirPDF(titulo, corpoHtml) {
    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups no navegador para gerar o PDF.'); return; }
    const logo = window.location.origin + '/movemaster1.png';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + titulo + ' - Movemaster</title><style>'
        + '*{box-sizing:border-box}'
        + 'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:28px 30px;font-size:12px}'
        + '.pdf-header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #ff6a00;padding-bottom:14px;margin-bottom:20px}'
        + '.pdf-logo{height:46px;width:auto}'
        + '.pdf-brand{font-size:22px;font-weight:800;letter-spacing:1px;color:#111;line-height:1}'
        + '.pdf-brand span{color:#ff6a00}'
        + '.pdf-tag{font-size:10px;color:#666;letter-spacing:2px;text-transform:uppercase;margin-top:3px}'
        + '.pdf-titulo{margin-left:auto;text-align:right}'
        + '.pdf-titulo h1{font-size:16px;margin:0;color:#111}'
        + '.pdf-titulo .pdf-data{font-size:11px;color:#777;margin-top:2px}'
        + 'h3{font-size:13px;margin:20px 0 8px;color:#111}'
        + 'table{width:100%;border-collapse:collapse;margin-bottom:14px}'
        + 'th,td{border:1px solid #ccc;padding:6px 9px;text-align:left;vertical-align:middle}'
        + 'th{background:#1a1a1a;color:#fff;font-size:11px;letter-spacing:.3px}'
        + 'tr:nth-child(even){background:#f7f7f7}'
        + '.resumo,.filtros{background:#f5f5f5;border:1px solid #e2e2e2;border-radius:8px;padding:10px 14px;margin-bottom:14px}'
        + '.filtros span{display:inline-block;margin-right:18px;margin-bottom:2px}'
        + '.totalgeral{font-size:15px;font-weight:bold;margin:8px 0 16px;color:#111}'
        + '.rescards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px}'
        + '.rescard{border:1px solid #ddd;border-radius:8px;padding:10px 13px;min-width:230px}'
        + '.restopo{display:flex;justify-content:space-between;gap:12px;font-weight:bold;border-bottom:1px solid #eee;padding-bottom:5px;margin-bottom:5px}'
        + '.resdet{font-size:11px;color:#333;line-height:1.5}'
        + '.pdf-rodape{margin-top:24px;border-top:1px solid #e2e2e2;padding-top:8px;font-size:10px;color:#999;text-align:center}'
        + '@media print{body{padding:14px}}'
        + '</style></head><body>'
        + '<div class="pdf-header">'
        + '<img src="' + logo + '" class="pdf-logo" onerror="this.style.display=\'none\'">'
        + '<div><div class="pdf-brand">MOVE<span>MASTER</span></div><div class="pdf-tag">Controle Logistico</div></div>'
        + '<div class="pdf-titulo"><h1>' + titulo + '</h1><div class="pdf-data">Gerado em ' + new Date().toLocaleString('pt-BR') + '</div></div>'
        + '</div>'
        + corpoHtml
        + '<div class="pdf-rodape">Movemaster - Controle Logistico - documento gerado pelo sistema</div>'
        + '<scr' + 'ipt>(function(){var i=document.querySelector(".pdf-logo");function g(){setTimeout(function(){window.print();},150);}if(i&&!i.complete){i.onload=g;i.onerror=g;setTimeout(g,1500);}else{g();}})();</scr' + 'ipt>'
        + '</body></html>';
    win.document.write(html);
    win.document.close();
}

// ============================================
// #5 · CONFERÊNCIA DE RECEITAS (financeiro)
// Todos os pedidos entregues aparecem aqui. O financeiro marca o que
// foi recebido. Pedidos atrasados podem ser notificados ao comercial.
// Precisa da migração faseA/receitas.sql (colunas receita_*).
// ============================================
const _RECEITAS_ATRASO_DIAS = 15;

function _receitaLinhas() {
    const busca = (document.getElementById('recBuscaCliente')?.value || '').trim().toLowerCase();
    const filtro = document.getElementById('recFiltroStatus')?.value || 'pendentes';
    const hoje = Date.now();
    const entregues = (pedidosGlobais || []).filter(p => p.status === 'Entregue');

    return entregues.filter(p => {
        if (busca && !(p.cliente || '').toLowerCase().includes(busca)) return false;
        const conf = p.receitaConfirmada === true || p.receita_confirmada === true;
        const dataRef = p.dataEntregaReal || p.data_entrega_real || p.updatedAt || p.updated_at || p.dataSolicitacao;
        const diasSince = dataRef ? Math.floor((hoje - new Date(dataRef).getTime()) / 86400000) : 0;
        p._receitaConf = conf;
        p._receitaDias = diasSince;
        if (filtro === 'pendentes') return !conf;
        if (filtro === 'conferidas') return conf;
        if (filtro === 'atrasadas') return !conf && diasSince >= _RECEITAS_ATRASO_DIAS;
        return true;
    }).sort((a, b) => (b._receitaDias || 0) - (a._receitaDias || 0));
}

async function renderizarReceitas() {
    const lista = document.getElementById('listaReceitas');
    const resumo = document.getElementById('resumoReceitas');
    if (!lista || !resumo) return;
    if (supabase) { try { await aposMutacaoPedidos(); } catch (e) {} }

    const linhas = _receitaLinhas();
    const money = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    // Resumo geral (independente do filtro)
    const entregues = (pedidosGlobais || []).filter(p => p.status === 'Entregue');
    const pend = entregues.filter(p => !(p.receitaConfirmada || p.receita_confirmada));
    const conf = entregues.filter(p => p.receitaConfirmada || p.receita_confirmada);
    const atras = pend.filter(p => {
        const d = p.dataEntregaReal || p.data_entrega_real || p.updatedAt || p.updated_at || p.dataSolicitacao;
        return d && (Date.now() - new Date(d).getTime()) / 86400000 >= _RECEITAS_ATRASO_DIAS;
    });
    const totalPend = pend.reduce((s, p) => s + (Number(p.valorFrete) || 0), 0);
    const totalConf = conf.reduce((s, p) => s + (Number(p.valorFrete) || 0), 0);
    const totalAtr = atras.reduce((s, p) => s + (Number(p.valorFrete) || 0), 0);

    resumo.innerHTML = `
        <div class="rec-resumo-cards">
            <div class="rec-rc rec-rc-pend"><span class="rec-rc-num">${pend.length}</span><span class="rec-rc-lbl">Pendentes</span><span class="rec-rc-val">${money(totalPend)}</span></div>
            <div class="rec-rc rec-rc-atr"><span class="rec-rc-num">${atras.length}</span><span class="rec-rc-lbl">⚠️ Atrasadas (>${_RECEITAS_ATRASO_DIAS}d)</span><span class="rec-rc-val">${money(totalAtr)}</span></div>
            <div class="rec-rc rec-rc-conf"><span class="rec-rc-num">${conf.length}</span><span class="rec-rc-lbl">Conferidas</span><span class="rec-rc-val">${money(totalConf)}</span></div>
        </div>`;

    if (!linhas.length) {
        lista.innerHTML = '<p class="text-center text-muted" style="padding:1rem">Nenhum pedido nesse filtro.</p>';
        return;
    }

    lista.innerHTML = `<div class="table-container"><table class="table">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Responsável</th><th>Entregue há</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${linhas.map(p => {
            const atrasado = !p._receitaConf && p._receitaDias >= _RECEITAS_ATRASO_DIAS;
            const seloStatus = p._receitaConf
                ? `<span class="rec-selo rec-selo-ok">✅ Conferida</span>`
                : atrasado ? `<span class="rec-selo rec-selo-atr">⚠️ ${p._receitaDias}d atrasada</span>`
                           : `<span class="rec-selo rec-selo-pend">⏳ Pendente</span>`;
            return `<tr class="${atrasado ? 'rec-linha-atrasada' : ''}">
                <td>#${p.id}</td>
                <td>${p.cliente || '—'}</td>
                <td>${p.responsavelComercial || '—'}</td>
                <td>${p._receitaDias} dia(s)</td>
                <td style="color:#4ade80;font-weight:600">${money(p.valorFrete)}</td>
                <td>${seloStatus}${p.receitaObservacao ? `<br><span class="text-muted text-sm">${p.receitaObservacao}</span>` : ''}${p.receitaConfirmadaPor ? `<br><span class="text-muted text-sm">por ${p.receitaConfirmadaPor}</span>` : ''}</td>
                <td>${p._receitaConf
                    ? `<button class="btn btn-secondary btn-sm" onclick="marcarReceita(${p.id}, false)">↩️ Desmarcar</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="marcarReceita(${p.id}, true)">✅ Recebi</button>
                       ${atrasado ? `<button class="btn btn-secondary btn-sm" onclick="cobrarComercialUm(${p.id})" title="Notifica ${p.responsavelComercial || 'o comercial'} sobre este pagamento">📣 Cobrar</button>` : ''}`}
                </td>
            </tr>`;
        }).join('')}</tbody>
    </table></div>`;
}

async function marcarReceita(pedidoId, confirmar) {
    if (!supabase) return;
    let obs = null;
    if (confirmar) {
        obs = prompt('Observação sobre o pagamento (opcional):\nEx: "PIX 15/03", "boleto 30 dias", "compensou dia X"');
        if (obs === null) return;
        obs = obs.trim() || null;
    }
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
    try {
        const upd = confirmar
            ? { receita_confirmada: true, receita_confirmada_em: new Date().toISOString(), receita_confirmada_por: usuarioNome, receita_observacao: obs,
                cobranca_status: 'confirmado', pagto_confirmado_em: new Date().toISOString(), pagto_confirmado_por: usuarioNome }
            : { receita_confirmada: false, receita_confirmada_em: null, receita_confirmada_por: null, receita_observacao: null };
        const { error } = await supabase.from('pedidos').update(upd).eq('id', pedidoId);
        if (error) throw error;
        const _p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
        if (_p && confirmar) _p.cobrancaStatus = 'confirmado';
        renderizarReceitas();
        if (typeof renderizarCobranca === 'function') renderizarCobranca();
    } catch (e) {
        alert('Não consegui atualizar: ' + (e.message || e));
    }
}

async function cobrarComercialUm(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p) return;
    if (!p.responsavelComercial) { alert('Este pedido não tem responsável comercial gravado.'); return; }
    if (!confirm(`Notificar ${p.responsavelComercial} sobre a receita pendente do pedido #${p.id}?`)) return;
    try {
        notificar({
            perfil: 'comercial', nome: p.responsavelComercial, pedidoId: p.id, tipo: 'acao',
            titulo: '💰 Receita pendente — revise o pagamento',
            mensagem: `${p.cliente || ''} · R$ ${(Number(p.valorFrete) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · entregue há ${p._receitaDias || '?'} dias sem confirmação.`
        });
        alert('✅ Comercial notificado.');
    } catch (e) { alert('Não consegui notificar: ' + (e.message || e)); }
}

async function cobrarComercialAtrasadas() {
    const atras = _receitaLinhas().filter(p => !p._receitaConf && p._receitaDias >= _RECEITAS_ATRASO_DIAS);
    if (!atras.length) { alert('Nenhuma atrasada para cobrar.'); return; }
    if (!confirm(`Notificar o comercial responsável de ${atras.length} pedido(s) atrasado(s)?`)) return;
    let n = 0;
    for (const p of atras) {
        if (!p.responsavelComercial) continue;
        try {
            notificar({
                perfil: 'comercial', nome: p.responsavelComercial, pedidoId: p.id, tipo: 'acao',
                titulo: '💰 Receita pendente — revise o pagamento',
                mensagem: `${p.cliente || ''} · R$ ${(Number(p.valorFrete) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · entregue há ${p._receitaDias} dias sem confirmação.`
            });
            n++;
        } catch (e) { /* segue */ }
    }
    alert(`✅ ${n} notificação(ões) enviadas ao comercial.`);
}

function gerarPDFReceitas() {
    const linhas = _receitaLinhas();
    if (!linhas.length) { alert('Nada para gerar com esse filtro.'); return; }
    const money = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const filtroTxt = { pendentes: 'Pendentes de conferir', conferidas: 'Já conferidas', atrasadas: `Atrasadas (mais de ${_RECEITAS_ATRASO_DIAS} dias)`, todas: 'Todas entregues' }[document.getElementById('recFiltroStatus')?.value || 'pendentes'];
    const total = linhas.reduce((s, p) => s + (Number(p.valorFrete) || 0), 0);
    const corpo = ''
        + '<div class="filtros"><span>Filtro: ' + filtroTxt + '</span><span>' + linhas.length + ' pedido(s)</span></div>'
        + '<div class="totalgeral">Total: ' + money(total) + '</div>'
        + '<table><thead><tr><th>Pedido</th><th>Cliente</th><th>Responsavel</th><th>Entregue ha</th><th>Valor</th><th>Situacao</th></tr></thead><tbody>'
        + linhas.map(p => `<tr><td>#${p.id}</td><td>${p.cliente || '-'}</td><td>${p.responsavelComercial || '-'}</td><td>${p._receitaDias} dia(s)</td><td style="text-align:right">${money(p.valorFrete)}</td><td>${p._receitaConf ? 'Conferida' + (p.receitaConfirmadaPor ? ' por ' + p.receitaConfirmadaPor : '') : (p._receitaDias >= _RECEITAS_ATRASO_DIAS ? 'ATRASADA' : 'Pendente')}</td></tr>`).join('')
        + '</tbody></table>';
    _abrirPDF('Conferencia de Receitas - ' + filtroTxt, corpo);
}

function _fatLinhasFiltradas() {
    const modo = document.getElementById('fatModo')?.value || 'motorista';
    const filtro = document.getElementById('fatFiltro')?.value || '';
    const de = document.getElementById('fatDe')?.value || '';
    const ate = document.getElementById('fatAte')?.value || '';
    const tipoCli = document.getElementById('fatTipoCliente')?.value || '';
    const rotaSel = document.getElementById('fatRota')?.value || '';
    let linhas = _fatMontarLinhas();
    if (de) linhas = linhas.filter(l => l.data && l.data >= de);
    if (ate) linhas = linhas.filter(l => l.data && l.data <= ate);
    if (tipoCli) linhas = linhas.filter(l => l.tipoCliente === tipoCli);
    if (rotaSel) linhas = linhas.filter(l => l.rota === rotaSel);
    if (filtro) linhas = linhas.filter(l => (modo === 'caminhao' ? l.caminhao : l.motorista) === filtro);
    linhas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    return { linhas, modo, filtro, de, ate, tipoCli, rotaSel };
}

function gerarPDFFaturamento() {
    const { linhas, modo, filtro, de, ate, tipoCli, rotaSel } = _fatLinhasFiltradas();
    if (!linhas.length) { alert('Nada para gerar com esses filtros. Ajuste e tente de novo.'); return; }
    const money = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const fmt = d => d ? d.split('-').reverse().join('/') : '—';
    const TIPOS = { empresa: 'Empresa', concessionaria: 'Concessionaria', locadora: 'Locadora', garagista: 'Garagista', particular: 'Particular' };

    const filtrosTxt = [];
    filtrosTxt.push('Visao: ' + (modo === 'caminhao' ? 'por Caminhao' : 'por Motorista'));
    if (de || ate) filtrosTxt.push('Periodo: ' + (de ? fmt(de) : 'inicio') + ' a ' + (ate ? fmt(ate) : 'hoje'));
    if (filtro) filtrosTxt.push((modo === 'caminhao' ? 'Caminhao' : 'Motorista') + ': ' + filtro);
    if (tipoCli) filtrosTxt.push('Tipo de cliente: ' + (TIPOS[tipoCli] || tipoCli));
    if (rotaSel) filtrosTxt.push('Rota: ' + rotaSel);

    const chave = l => modo === 'caminhao' ? l.caminhao : l.motorista;
    const totais = {};
    linhas.forEach(l => { const k = chave(l); if (!totais[k]) totais[k] = { total: 0, det: {} }; totais[k].total += l.valor; const sub = modo === 'caminhao' ? l.motorista : l.caminhao; totais[k].det[sub] = (totais[k].det[sub] || 0) + l.valor; });
    const totalGeral = linhas.reduce((s, l) => s + l.valor, 0);
    const labelSub = modo === 'caminhao' ? 'por motorista' : 'por caminhao';

    const linhasHtml = linhas.map(l => `<tr><td>${fmt(l.data)}</td><td>#${l.pedidoId}</td><td>${l.cliente}</td><td>${l.trecho}</td><td>${l.caminhao}</td><td>${l.motorista}</td><td style="text-align:right">${l.km || '-'}</td><td style="text-align:right">${money(l.valor)}</td></tr>`).join('');
    const resumoHtml = Object.entries(totais).sort((a, b) => b[1].total - a[1].total).map(([nome, info]) => {
        const det = Object.entries(info.det).sort((a, b) => b[1] - a[1]).map(([v, val]) => `<div>${v || '-'}: <strong>${money(val)}</strong></div>`).join('');
        return `<div class="rescard"><div class="restopo"><span>${nome}</span><span>${money(info.total)}</span></div><div class="resdet">${labelSub}:<br>${det}</div></div>`;
    }).join('');

    const win_corpo = ''
        + '<div class="filtros">' + filtrosTxt.map(f => '<span>' + f + '</span>').join('') + '</div>'
        + '<div class="totalgeral">Total: ' + money(totalGeral) + ' &middot; ' + linhas.length + ' trecho(s)</div>'
        + '<div class="rescards">' + resumoHtml + '</div>'
        + '<h3>Detalhamento</h3>'
        + '<table><thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Trecho</th><th>Caminhao</th><th>Motorista</th><th>Km</th><th>Valor</th></tr></thead><tbody>' + linhasHtml + '</tbody></table>';
    _abrirPDF('Relatorio de Faturamento', win_corpo);
}

async function carregarFaturamento() {
    if (supabase) { try { await aposMutacaoPedidos(); } catch (e) {} }
    if (supabase) {
        try {
            const { data } = await supabase.from('pedido_trechos').select('*').order('created_at', { ascending: false });
            _fatTrechosCache = data || [];
        } catch (e) { console.warn('Trechos não carregados p/ faturamento:', e.message); _fatTrechosCache = []; }
    }
    atualizarSelectFaturamento();
    renderizarFaturamento();
    renderAuditoriaFaturamento();
    renderizarReceitas();
}

// Monta as linhas de faturamento a partir dos TRECHOS (+ fallback legado
// motorista_1/2 para pedidos que ainda não têm trecho).
function _fatMontarLinhas() {
    const linhas = [];
    const pedidoPorId = {};
    pedidosGlobais.forEach(p => { pedidoPorId[p.id] = p; });
    // mapa nome do cliente -> tipo_cliente
    const tipoPorCliente = {};
    (clientesGlobais || []).forEach(c => { if (c.nome) tipoPorCliente[c.nome] = c.tipo_cliente || ''; });
    const pedidosComTrecho = new Set();

    (_fatTrechosCache || []).forEach(t => {
        if (!t.motorista_nome) return; // só conta perna com motorista definido
        pedidosComTrecho.add(t.pedido_id);
        const p = pedidoPorId[t.pedido_id] || {};
        const orig = [t.origem_cidade, t.origem_uf].filter(Boolean).join('/') || '—';
        const dest = [t.destino_cidade, t.destino_uf].filter(Boolean).join('/') || '—';
        linhas.push({
            data: (t.created_at || p.dataPrevColeta || '').slice(0, 10),
            pedidoId: t.pedido_id,
            cliente: p.cliente || '—',
            trecho: `${orig} → ${dest}`,
            caminhao: t.placa_cegonha || '—',
            motorista: t.motorista_nome,
            km: Number(t.km) || 0,
            valor: Number(t.valor_frete) || 0,
            tipoCliente: tipoPorCliente[p.cliente] || '',
            rota: `${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}`
        });
    });

    pedidosGlobais.forEach(p => {
        if (pedidosComTrecho.has(p.id)) return;
        [{ m: p.motorista1, pc: p.percentMotorista1 }, { m: p.motorista2, pc: p.percentMotorista2 }].forEach(it => {
            if (!it.m) return;
            const pct = it.pc != null ? it.pc : (p.motorista2 ? 0 : 100);
            const valor = (Number(p.valorFrete) || 0) * ((pct || 0) / 100);
            linhas.push({
                data: (p.dataPrevColeta || p.dataSolicitacao || '').slice(0, 10),
                pedidoId: p.id, cliente: p.cliente || '—',
                trecho: `${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}`,
                caminhao: p.placaCegonha || '—', motorista: it.m, km: 0, valor,
                tipoCliente: tipoPorCliente[p.cliente] || '',
                rota: `${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}`
            });
        });
    });
    return linhas;
}

function atualizarSelectFaturamento() {
    const modo = document.getElementById('fatModo')?.value || 'motorista';
    const sel = document.getElementById('fatFiltro');
    const lbl = document.getElementById('fatFiltroLabel');
    if (lbl) lbl.textContent = modo === 'caminhao' ? 'Caminhão' : 'Motorista';
    if (!sel) return;
    const atual = sel.value;
    const linhas = _fatMontarLinhas();
    const chave = l => modo === 'caminhao' ? l.caminhao : l.motorista;
    const valores = [...new Set(linhas.map(chave).filter(v => v && v !== '—'))].sort();
    sel.innerHTML = '<option value="">Todos</option>' + valores.map(v => `<option value="${v}">${v}</option>`).join('');
    sel.value = atual;

    // Select de rota (independente do modo)
    const selR = document.getElementById('fatRota');
    if (selR) {
        const atualR = selR.value;
        const rotas = [...new Set(linhas.map(l => l.rota).filter(v => v && v !== '/ → /'))].sort();
        selR.innerHTML = '<option value="">Todas as rotas</option>' + rotas.map(v => `<option value="${v}">${v}</option>`).join('');
        selR.value = atualR;
    }
}

function renderizarFaturamento() {
    const corpo = document.getElementById('corpoTabelaFaturamento');
    const resumo = document.getElementById('resumoFaturamento');
    if (!corpo || !resumo) return;

    const modo = document.getElementById('fatModo')?.value || 'motorista';
    const filtro = document.getElementById('fatFiltro')?.value || '';
    const de = document.getElementById('fatDe')?.value || '';
    const ate = document.getElementById('fatAte')?.value || '';
    const tipoCli = document.getElementById('fatTipoCliente')?.value || '';

    let linhas = _fatMontarLinhas();
    if (de) linhas = linhas.filter(l => l.data && l.data >= de);
    if (ate) linhas = linhas.filter(l => l.data && l.data <= ate);
    if (tipoCli) linhas = linhas.filter(l => l.tipoCliente === tipoCli);
    const rotaSel = document.getElementById('fatRota')?.value || '';
    if (rotaSel) linhas = linhas.filter(l => l.rota === rotaSel);
    if (filtro) linhas = linhas.filter(l => (modo === 'caminhao' ? l.caminhao : l.motorista) === filtro);
    linhas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const money = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    if (linhas.length === 0) {
        corpo.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhum trecho executado nesse filtro/período.</td></tr>';
        resumo.innerHTML = '';
        return;
    }

    corpo.innerHTML = linhas.map(l => `
        <tr>
            <td>${l.data ? l.data.split('-').reverse().join('/') : '—'}</td>
            <td>#${l.pedidoId}</td>
            <td>${l.cliente}</td>
            <td style="font-size:0.8rem">${l.trecho}</td>
            <td><strong>${l.caminhao}</strong></td>
            <td>${l.motorista}</td>
            <td>${l.km ? l.km + ' km' : '—'}</td>
            <td style="color:#4ade80;font-weight:700">${money(l.valor)}</td>
        </tr>`).join('');

    // Resumo agrupado + relatório por veículo (quebra por caminhão dentro do motorista, e vice-versa)
    const chave = l => modo === 'caminhao' ? l.caminhao : l.motorista;
    const totais = {};
    linhas.forEach(l => {
        const k = chave(l);
        if (!totais[k]) totais[k] = { total: 0, det: {} };
        totais[k].total += l.valor;
        const sub = modo === 'caminhao' ? l.motorista : l.caminhao;
        totais[k].det[sub] = (totais[k].det[sub] || 0) + l.valor;
    });
    const totalGeral = linhas.reduce((s, l) => s + l.valor, 0);
    const labelSub = modo === 'caminhao' ? 'Por motorista' : 'Por caminhão';

    resumo.innerHTML = `
        <div class="fat-total-geral">Total no período: <strong>${money(totalGeral)}</strong> · ${linhas.length} trecho(s)</div>
        <div class="fat-cards">` +
        Object.entries(totais).sort((a, b) => b[1].total - a[1].total).map(([nome, info]) => {
            const detalhe = Object.entries(info.det).sort((a, b) => b[1] - a[1])
                .map(([v, val]) => `<div class="fat-card-linha"><span>${v || '—'}</span><span>${money(val)}</span></div>`).join('');
            return `<div class="resumo-card fat-card">
                <div class="fat-card-topo"><span>${modo === 'caminhao' ? '🚛' : '🧑‍✈️'} ${nome}</span><strong>${money(info.total)}</strong></div>
                <div class="fat-card-sub">${labelSub}:</div>
                ${detalhe}
            </div>`;
        }).join('') + `</div>`;
}

// ============================================
// CADASTROS
// ============================================

async function salvarCadastroCliente(event) {
    event.preventDefault();

    const tipo    = document.getElementById('tipoCliente').value;
    const nome    = document.getElementById('nomeCliente').value;
    const nomeFantasia = document.getElementById('nomeFantasiaCliente')?.value.trim() || null;
    const formaPagamento = document.getElementById('formaPagamentoCliente')?.value || null;
    const cnpj    = document.getElementById('cnpjCliente').value || null;
    const cpf     = document.getElementById('cpfCliente').value  || null;
    const inscricaoEstadual = document.getElementById('inscricaoEstadual')?.value.trim() || null;
    const telefone = document.getElementById('telefoneCliente').value || null;
    const email    = document.getElementById('emailCliente').value    || null;
    const cep      = document.getElementById('cepCliente').value || null;
    const endereco = document.getElementById('enderecoCliente').value || null;
    const numero   = document.getElementById('numeroCliente').value || null;
    const complemento = document.getElementById('complementoCliente').value || null;
    const bairro   = document.getElementById('bairroCliente').value || null;
    const cidade   = document.getElementById('cidadeCliente').value || null;
    const uf       = document.getElementById('ufCliente').value || null;

    if (!tipo || !nome) {
        exibirMensagem('mensagemCadastroCliente', 'Preencha o tipo e o nome do cliente!', 'error');
        return;
    }

    // Verificar documento único
    if (cnpj) {
        const existeCnpj = await verificarDocumentoUnico('cnpj', cnpj);
        if (existeCnpj !== true) {
            exibirMensagem('mensagemCadastroCliente', `⚠️ Este CNPJ já está cadastrado no cliente: "${existeCnpj.nome}" (procure por ele na lista de clientes e edite, em vez de criar de novo). Se não achar na lista, ele pode ter sido criado automaticamente pela importação do Evo.`, 'error');
            return;
        }
    }
    if (cpf) {
        const existeCpf = await verificarDocumentoUnico('cpf', cpf);
        if (existeCpf !== true) {
            exibirMensagem('mensagemCadastroCliente', `CPF já cadastrado para: ${existeCpf.nome}`, 'error');
            return;
        }
    }

    if (supabase) {
        try {
            // Gerar código único do cliente ex: CLI-0042
            const { data: ultimoCliente } = await supabase
                .from('clientes').select('id').order('id', { ascending: false }).limit(1);
            const proximoId = ultimoCliente?.[0]?.id ? ultimoCliente[0].id + 1 : 1;
            const codigo = 'CLI-' + String(proximoId).padStart(4, '0');

            const { error } = await supabase.from('clientes').insert({
                nome, nome_fantasia: nomeFantasia, forma_pagamento: formaPagamento, cnpj, cpf, telefone, email,
                inscricao_estadual: inscricaoEstadual,
                tipo_cliente: tipo,
                tipo_entrega_padrao: document.getElementById('tipoEntregaPadrao')?.value || 'patio',
                cep, endereco, numero, complemento, bairro, cidade, uf,
                codigo
            });
            if (error) throw error;
            // Recarrega os clientes do banco para o novo aparecer NA HORA (sem sair e voltar).
            try {
                const { data: cli } = await supabase.from('clientes').select('*').order('nome');
                if (cli) clientesGlobais = cli;
            } catch(_){}
            if (typeof renderizarListaClientes === 'function') renderizarListaClientes();
            exibirMensagem('mensagemCadastroCliente', '✅ Cliente salvo com sucesso!', 'success');
            document.getElementById('formCadastroCliente').reset();
            ajustarFormCliente(''); // volta os campos condicionais ao estado inicial
        } catch (error) {
            exibirMensagem('mensagemCadastroCliente', 'Erro ao salvar: ' + error.message, 'error');
        }
    }
}

// Ajusta label e campos conforme tipo de cliente
// ============================================
// LISTAS RECOLHÍVEIS (Cadastros)
// Cabeçalho clicável abre/fecha a tabela e seus controles.
// ============================================

