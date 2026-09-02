/* ==========================================================================
   MODULE: 11-comercial-views.js
   Dashboard e listagens comerciais
   Linhas originais: 5387-6074
   ========================================================================== */

            const doc = String(c[campo] || '').replace(/\D/g, '');
            return doc === digits;
        });

        return encontrado || true;
    } catch (e) {
        console.warn('verificarDocumentoUnico:', e);
        return true;
    }
}
// ============================================
// DASHBOARD COMERCIAL
// ============================================

function atualizarDashboardComercial() {
    const hoje = new Date().toISOString().split('T')[0];
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = new Date();
    inicioMes.setDate(1);

    const pedidosHoje = pedidosGlobais.filter(p => (p.dataSolicitacao || '').startsWith(hoje));
    const pedidosSemana = pedidosGlobais.filter(p => new Date(p.dataSolicitacao) >= inicioSemana);
    const pedidosAberto = pedidosGlobais.filter(p => p.status === 'Aguardando Confirmação');
    const receitaMes = pedidosGlobais
        .filter(p => new Date(p.dataSolicitacao) >= inicioMes)
        .reduce((acc, p) => acc + (parseFloat(p.valorFrete) || 0), 0);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('dashValorHoje', pedidosHoje.length);
    set('dashValorSemana', pedidosSemana.length);
    set('dashValorAberto', pedidosAberto.length);
    set('dashValorReceita', 'R$ ' + receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    // Colorir card de abertos se houver
    const cardAberto = document.getElementById('dashAberto');
    if (cardAberto) cardAberto.style.borderColor = pedidosAberto.length > 0 ? 'rgba(251,191,36,0.5)' : '';
}

// ============================================
// LISTAGEM DE PEDIDOS DO COMERCIAL
// ============================================

// ============================================
// #1 · Carga fechada minimizável (componente reaproveitável p/ tabelas)
// Reaproveita o mesmo estado _gruposAbertos usado na tela de alocação,
// então abrir/minimizar fica sincronizado entre as telas.
// ============================================
function toggleGrupo(grupoId) {
    const g = String(grupoId);
    if (_gruposAbertos.has(g)) _gruposAbertos.delete(g);
    else _gruposAbertos.add(g);
    // Re-renderiza as telas de lista que existirem (mantém todas em sincronia)
    try { if (typeof renderizarPedidosComercial === 'function') renderizarPedidosComercial(); } catch (e) {}
    try { if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento(); } catch (e) {}
    try { if (typeof renderizarOcupacao === 'function') renderizarOcupacao(); } catch (e) {}
    try { if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag(); } catch (e) {}
}

// pedidos: array já filtrado/ordenado · linhaFn(p): retorna o <tr> de 1 pedido
// colspan: nº de colunas da tabela (para o cabeçalho do grupo)
// #1 · Sair do pátio → próxima cegonha, direto para Em Transporte
function abrirSairPatio(pedidoId) {
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;
    const modal = document.getElementById('modalSairPatio');
    if (!modal) return;
    if (modal.parentElement !== document.body) document.body.appendChild(modal);

    document.getElementById('sairPatioPedidoId').value = pedido.id;
    const local = pedido.cidadeTransbordo || pedido.patioAtual || '—';
    const destino = `${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}`;
    const cteInfo = typeof cteInfoDoPedido === 'function' ? cteInfoDoPedido(pedido.id) : null;
    const avisoCte = cteInfo
        ? `<div class="aviso-cte-transbordo">🧾 <strong>Este carro já tem CTE emitido${cteInfo.numero ? ' (nº ' + cteInfo.numero + ')' : ''}.</strong> Ao sair do pátio, o mesmo CTE é mantido — apenas o manifesto é atualizado para a nova cegonha. Não emita CTE de novo.</div>`
        : '';
    document.getElementById('sairPatioResumo').innerHTML = `
        <div class="alocacao-info">
            <div class="alocacao-info-item"><label>Pedido</label><span>#${pedido.id} — ${pedido.cliente || ''}</span></div>
            <div class="alocacao-info-item"><label>Está em</label><span>${local}</span></div>
            <div class="alocacao-info-item"><label>Destino final</label><span>${destino}</span></div>
        </div>
        ${avisoCte}`;

    const selC = document.getElementById('sairPatioCegonha');
    selC.innerHTML = '<option value="">Selecione a cegonha</option>' +
        (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : []).map(v =>
            `<option value="${v.placa}" ${v.placa === pedido.placaCegonha ? 'selected' : ''}>${v.placa}${v.motorista_padrao ? ' · ' + v.motorista_padrao : ''}</option>`).join('');
    const selM = document.getElementById('sairPatioMotorista');
    selM.innerHTML = '<option value="">Selecione o motorista</option>' +
        (typeof motoristasGlobais !== 'undefined' ? motoristasGlobais : []).map(m => {
            const nome = m.nome || m;
            return `<option value="${nome}">${nome}</option>`;
        }).join('');
    document.getElementById('sairPatioKm').value = '';
    modal.classList.add('show');
}

async function confirmarSairPatio() {
    const pedidoId = document.getElementById('sairPatioPedidoId').value;
    const cegonha = document.getElementById('sairPatioCegonha').value;
    const motorista = document.getElementById('sairPatioMotorista').value;
    const km = parseFloat(document.getElementById('sairPatioKm').value) || 0;
    if (!cegonha || !motorista) { alert('Escolha a cegonha e o motorista.'); return; }
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido || !supabase) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    const perfilU = typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica';
    try {
        const { error } = await supabase.from('pedidos').update({
            placa_cegonha: cegonha, motorista_1: motorista, percent_motorista_1: 100,
            motorista_2: null, percent_motorista_2: null,
            patio_atual: null, patio_desde: null,
            status: 'Em Transporte'
        }).eq('id', parseInt(pedidoId));
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: 'Transbordo', status_novo: 'Em Transporte',
            usuario_nome: usuarioNome, usuario_perfil: perfilU,
            observacao: `🚚 Saiu do pátio de ${pedido.cidadeTransbordo || pedido.patioAtual || '—'} na cegonha ${cegonha} com ${motorista}`
        });

        // Completa o trecho aberto (última perna sem motorista) e redivide por km
        try {
            const { data: tr } = await supabase.from('pedido_trechos').select('*').eq('pedido_id', parseInt(pedidoId)).order('ordem', { ascending: true });
            if (tr && tr.length) {
                const aberto = [...tr].reverse().find(x => !x.motorista_nome) || tr[tr.length - 1];
                await supabase.from('pedido_trechos').update({ motorista_nome: motorista, placa_cegonha: cegonha, km: km || Number(aberto.km) || 0 }).eq('id', aberto.id);
                const { data: tr2 } = await supabase.from('pedido_trechos').select('*').eq('pedido_id', parseInt(pedidoId)).order('ordem', { ascending: true });
                const freteCent = Math.round((Number(pedido.valorFrete) || 0) * 100);
                const vals = _alocDividirPorKm(freteCent, (tr2 || []).map(x => ({ km: Number(x.km) || 0 })));
                for (let i = 0; i < tr2.length; i++) { await supabase.from('pedido_trechos').update({ valor_frete: (vals[i] || 0) / 100 }).eq('id', tr2[i].id); }
            }
        } catch (e) { console.warn('Trecho (sair do pátio):', e.message); }

        try { await registrarEventoManifesto(cegonha, { ...pedido, placaCegonha: cegonha }, 'transbordo_entrada', +1); } catch (e) {}
        try { notificarMudancaStatus({ ...pedido, placaCegonha: cegonha }, 'Transbordo', 'Em Transporte'); } catch (e) {}

        await aposMutacaoPedidos({ forceFull: true });
        fecharModal('modalSairPatio');
        exibirMensagem('mensagemLogistica', `✅ Saiu do pátio na cegonha ${cegonha} · agora Em Transporte.`, 'success');
    } catch (e) {
        alert('Não consegui concluir a saída do pátio: ' + (e.message || e));
    }
}

// #3 · Mostra o botão de avançar SE o passo é do seu setor; senão, mostra
// um selo "⏳ Aguardando comercial/logística" (didático, bate-volta visível).
function acaoOuAguardando(p) {
    // Status agora é livre (dropdown). Não há mais "Avançar" nem selo de espera.
    // Mantém apenas a ação específica de transbordo (definir próxima cegonha).
    const viewer = (typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
    const podeAgir = viewer === 'admin' || viewer === 'logistica';
    if (p.status === 'Transbordo' && podeAgir) {
        return `<button class="btn-kanban-status btn-sair-patio" onclick="abrirSairPatio(${p.id})" title="Definir a próxima cegonha/motorista e seguir direto para Em Transporte">🚚 Sair do pátio</button>`;
    }
    return '';
}

function montarListaComGrupos(pedidos, linhaFn, colspan, mostrarAvancar) {
    const contagem = {};
    pedidos.forEach(p => { if (p.grupoId) contagem[p.grupoId] = (contagem[p.grupoId] || 0) + 1; });
    const emitido = new Set();
    const out = [];
    pedidos.forEach(p => {
        const gid = p.grupoId;
        if (gid && contagem[gid] > 1) {
            if (emitido.has(gid)) return;
            emitido.add(gid);
            const membros = pedidos.filter(x => x.grupoId === gid);
            const aberto = _gruposAbertos.has(String(gid));
            const cliente = membros[0].cliente || '—';
            const responsavel = membros[0].responsavelComercial || '—';
            const rota = `${membros[0].cidadeOrigem || ''}/${membros[0].ufOrigem || ''} → ${membros[0].cidadeDestino || ''}/${membros[0].ufDestino || ''}`;
            const soma = membros.reduce((sm, m) => sm + Number(m.valorFrete || 0), 0);
            // Status predominante do grupo — só mostra "Avançar todos" se ainda houver próximo passo
            const _cont = {};
            membros.forEach(m => { const st = m.status || 'Pendente'; _cont[st] = (_cont[st] || 0) + 1; });
            const _statusPred = Object.keys(_cont).sort((a, b) => _cont[b] - _cont[a])[0];
            const _temProximo = (FLUXO_STATUS[_statusPred]?.proximos?.length || 0) > 0;
            const btnAvancar = '';
            out.push(`<tr class="grupo-header ${aberto ? 'aberto' : ''}" onclick="toggleGrupo('${gid}')">
                <td colspan="${colspan}">
                    <span class="grupo-toggle">${aberto ? '▼' : '▶'}</span>
                    <span class="grupo-badge">📦 ${nomenclaturaCarga(membros.length)}</span>
                    <strong>${membros.length} carros</strong>
                    <span class="grupo-cliente">${cliente}</span>
                    <span class="grupo-resp" title="Responsável comercial que fechou o frete">🧑‍💼 ${responsavel}</span>
                    <span class="grupo-rota">${rota}</span>
                    <span class="grupo-total">R$ ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    ${btnAvancar}
                    <span class="grupo-dica">${aberto ? 'minimizar' : 'abrir'}</span>
                </td>
            </tr>`);
            if (aberto) membros.forEach(m => out.push(linhaFn(m)));
        } else {
            out.push(linhaFn(p));
        }
    });
    return out.join('');
}

function renderizarPedidosComercial() {
    const corpo = document.getElementById('corpoTabelaPedidosComercial');
    if (!corpo) return;

    const filtroStatus = document.getElementById('filtroPedidosComercial')?.value || '';
    const filtroRota   = document.getElementById('filtroPedidosRota')?.value || '';
    const filtroTexto  = (document.getElementById('filtroPedidosTexto')?.value || '').toLowerCase();

    // Popular dropdown de rotas
    popularFiltroRotas();
    const filtroOrigem = (document.getElementById('filtroPedidosOrigem')?.value || '').toLowerCase();
    const filtroDestino = (document.getElementById('filtroPedidosDestino')?.value || '').toLowerCase();

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Transbordo': '#fb923c', 'Entregue': '#4ade80'
    };

    let pedidos = [...pedidosGlobais].sort((a, b) => b.id - a.id);

    if (filtroOrigem) pedidos = pedidos.filter(p => _norm(`${p.cidadeOrigem||''} ${p.ufOrigem||''}`).includes(_norm(filtroOrigem)));
    if (filtroDestino) pedidos = pedidos.filter(p => _norm(`${p.cidadeDestino||''} ${p.ufDestino||''}`).includes(_norm(filtroDestino)));
    if (filtroStatus) pedidos = pedidos.filter(p => p.status === filtroStatus);
    if (filtroRota) pedidos = pedidos.filter(p => {
        const r = `${p.cidadeOrigem||''}/${p.ufOrigem||''} → ${p.cidadeDestino||''}/${p.ufDestino||''}`;
        return r === filtroRota;
    });
    if (filtroTexto) pedidos = pedidos.filter(p =>
        (p.cliente || '').toLowerCase().includes(filtroTexto) ||
        (p.placa || '').toLowerCase().includes(filtroTexto) ||
        (p.cidadeOrigem || '').toLowerCase().includes(filtroTexto) ||
        (p.cidadeDestino || '').toLowerCase().includes(filtroTexto) ||
        (p.ufOrigem || '').toLowerCase().includes(filtroTexto) ||
        (p.ufDestino || '').toLowerCase().includes(filtroTexto) ||
        String(p.id).includes(filtroTexto)
    );

    // Contador no título (visível mesmo com a lista recolhida)
    const contPed = document.getElementById('contadorPedidosCom');
    if (contPed) contPed.textContent = pedidos.length;

    if (pedidos.length === 0) {
        corpo.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    const _linhaComercial = (p) => {
        const cor = cores[p.status] || '#888';
        const podeChecklist = p.status === 'Aguardando Confirmação';
        return `<tr>
            <td><strong>#${p.id}</strong> ${selCTEDoPedido(p.id)}</td>
            <td>${p.cliente || '—'}</td>
            <td style="font-size:0.78rem">${p.modelo || ''}<br><span style="color:var(--text-muted)">${p.placa || ''}</span></td>
            <td style="font-size:0.78rem">${p.cidadeOrigem || ''}/${p.ufOrigem || ''}${p.cidadeTransbordo ? `<br><span class="${p.status === 'Transbordo' ? 'badge-transbordo transbordo-atual' : 'badge-transbordo transbordo-feito'}" title="${p.status === 'Transbordo' ? 'Veículo no pátio aguardando nova cegonha' : 'Transbordo já realizado'}">${p.status === 'Transbordo' ? '🔁' : '✔'} ${p.cidadeTransbordo}</span>` : ''}<br>→ ${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td style="color:#4ade80;font-weight:600">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td>${typeof _statusPillPlanilha === 'function' ? _statusPillPlanilha(p) : `<span style="font-size:0.7rem;font-weight:600;padding:0.15rem 0.5rem;border-radius:4px;background:${cor}20;color:${cor};border:1px solid ${cor}40">${p.status || '—'}</span>`}</td>
            <td style="font-size:0.78rem">${_dataLancamentoFmt(p)}</td>
            <td>
                <div style="display:flex;gap:0.3rem;flex-wrap:wrap">
                    ${podeChecklist ? `<button class="btn btn-primary btn-sm" onclick="abrirChecklist(${p.id})">✅ Confirmar</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="solicitarEdicaoPedido(${p.id})" title="Editar pedido">✏️ Editar</button>
                    <button class="btn btn-secondary btn-sm" onclick="abrirHistorico(${p.id})">Histórico</button>
                    <button class="btn btn-sm" style="background:#7f1d1d;color:#fff" onclick="excluirPedido(${p.id})" title="Excluir pedido">🗑️</button>
                    <button class="btn btn-secondary btn-sm" onclick="verFotosPlaca(${p.id},'${(p.cliente||'').replace(/'/g,"\'")}')">📸</button>
                    ${p.status === 'Entregue' ? `<button class="btn btn-secondary btn-sm" onclick="abrirConfirmarReceita(${p.id})">💰</button>` : ''}
                </div>
            </td>
        </tr>`;
    };

    corpo.innerHTML = montarListaComGrupos(pedidos, _linhaComercial, 8, false);

    atualizarDashboardComercial();
}

// ============================================
// CHECKLIST DE CONFIRMAÇÃO DE COLETA
// ============================================

let checklistPedidoId = null;

function abrirChecklist(pedidoId) {
    const pedido = pedidosGlobais.find(p => p.id == pedidoId);
    if (!pedido) return;

    checklistPedidoId = pedidoId;

    document.getElementById('checklistPedidoInfo').textContent =
        `#${pedido.id} — ${pedido.cliente || ''} | ${pedido.cidadeOrigem}/${pedido.ufOrigem} → ${pedido.cidadeDestino}/${pedido.ufDestino}`;

    // Resetar checkboxes
    ['check1','check2','check3','check4','check5'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    const obs = document.getElementById('checklistObs');
    if (obs) obs.value = '';
    const msg = document.getElementById('mensagemChecklist');
    if (msg) msg.className = 'message';

    const btn = document.getElementById('btnConfirmarChecklist');
    if (btn) btn.onclick = confirmarChecklist;

    document.getElementById('modalChecklist').classList.add('show');
}

async function confirmarChecklist() {
    const checks = ['check1','check2','check3','check4','check5'];
    const todos = checks.every(id => document.getElementById(id)?.checked);
    const msgEl = document.getElementById('mensagemChecklist');

    if (!todos) {
        msgEl.textContent = 'Confirme todos os itens antes de prosseguir.';
        msgEl.className = 'message show error';
        return;
    }

    const obs = document.getElementById('checklistObs')?.value || '';
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Comercial';

    try {
        const { error } = await supabase.from('pedidos')
            .update({ status: 'Em Coleta' })
            .eq('id', checklistPedidoId);
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(checklistPedidoId),
            status_anterior: 'Aguardando Confirmação',
            status_novo: 'Em Coleta',
            usuario_nome: usuarioNome,
            usuario_perfil: 'comercial',
            observacao: `Checklist confirmado${obs ? ' — ' + obs : ''}`
        });

        // Sino: avisa a logística que o comercial liberou a coleta
        try {
            const _ped = pedidosGlobais.find(x => String(x.id) === String(checklistPedidoId));
            if (_ped) notificarMudancaStatus({ ..._ped, status: 'Em Coleta' }, 'Aguardando Confirmação', 'Em Coleta');
        } catch (e) {}

        await aposMutacaoPedidos();
        fecharModal('modalChecklist');
        renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
        exibirMensagem('mensagemComercial', '✅ Coleta confirmada! Status atualizado para Em Coleta.', 'success');
    } catch(err) {
        msgEl.textContent = 'Erro: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// HISTÓRICO DO CLIENTE
// ============================================

async function abrirHistoricoCliente() {
    const clienteId = document.getElementById('clienteId')?.value;
    const clienteNome = document.getElementById('cliente')?.value;
    if (!clienteId || !clienteNome) return;

    document.getElementById('historicoClienteInfo').innerHTML =
        `<strong>${clienteNome}</strong><span style="color:var(--text-muted);font-size:0.8rem">ID: ${clienteId}</span>`;

    document.getElementById('corpoHistoricoCliente').innerHTML =
        '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
    document.getElementById('modalHistoricoCliente').classList.add('show');

    const pedidosCliente = pedidosGlobais.filter(p =>
        String(p.clienteId) === String(clienteId) || p.cliente === clienteNome
    );

    const totalValor = pedidosCliente.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);
    const entregues  = pedidosCliente.filter(p => p.status === 'Entregue').length;
    const emAndamento = pedidosCliente.filter(p => p.status !== 'Entregue' && p.status !== 'Pendente').length;

    document.getElementById('historicoClienteStats').innerHTML = `
        <div class="hc-stat"><span class="hc-num">${pedidosCliente.length}</span><span class="hc-label">Total de Pedidos</span></div>
        <div class="hc-stat"><span class="hc-num">${entregues}</span><span class="hc-label">Entregues</span></div>
        <div class="hc-stat"><span class="hc-num">${emAndamento}</span><span class="hc-label">Em Andamento</span></div>
        <div class="hc-stat"><span class="hc-num" style="color:#4ade80">R$ ${totalValor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span><span class="hc-label">Valor Total</span></div>
    `;

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Entregue': '#4ade80'
    };

    const corpo = document.getElementById('corpoHistoricoCliente');
    if (pedidosCliente.length === 0) {
        corpo.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    corpo.innerHTML = pedidosCliente.map(p => {
        const cor = cores[p.status] || '#888';
        return `<tr>
            <td><strong>#${p.id}</strong></td>
            <td style="font-size:0.78rem">${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td style="color:#4ade80;font-weight:600">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td><span style="font-size:0.68rem;font-weight:600;padding:0.12rem 0.4rem;border-radius:4px;background:${cor}20;color:${cor}">${p.status}</span></td>
            <td style="font-size:0.78rem">${_dataLancamentoFmt(p)}</td>
        </tr>`;
    }).join('');
}

// ============================================
// EXPORTAR PDF
// ============================================

function exportarPedidosPDF() {
    const filtroStatus = document.getElementById('filtroPedidosComercial')?.value || '';
    const filtroTexto  = (document.getElementById('filtroPedidosTexto')?.value || '').toLowerCase();

    let pedidos = [...pedidosGlobais].sort((a, b) => b.id - a.id);
    if (filtroStatus) pedidos = pedidos.filter(p => p.status === filtroStatus);
    if (filtroTexto)  pedidos = pedidos.filter(p =>
        (p.cliente||'').toLowerCase().includes(filtroTexto) || String(p.id).includes(filtroTexto)
    );

    const linhas = pedidos.map(p => `
        <tr>
            <td>#${p.id}</td>
            <td>${p.cliente || '—'}</td>
            <td>${p.modelo || ''} · ${p.placa || ''}</td>
            <td>${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td>R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td>${p.status || '—'}</td>
            <td>${_dataLancamentoFmt(p)}</td>
        </tr>
    `).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Pedidos Movemaster</title>
        <style>
            body{font-family:Arial,sans-serif;padding:2rem;font-size:12px}
            h1{color:#f97316;font-size:1.2rem;margin-bottom:0.3rem}
            p{color:#666;margin-bottom:1rem;font-size:0.85rem}
            table{width:100%;border-collapse:collapse}
            th{background:#f5f5f5;padding:0.4rem 0.5rem;text-align:left;font-size:0.7rem;text-transform:uppercase}
            td{padding:0.35rem 0.5rem;border-bottom:1px solid #eee}
        </style></head><body>
        <h1>MOVEMASTER — Relatório de Pedidos</h1>
        <p>Gerado em ${new Date().toLocaleString('pt-BR')} · ${pedidos.length} pedidos</p>
        <table><thead><tr><th>ID</th><th>Cliente</th><th>Veículo</th><th>Rota</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead>
        <tbody>${linhas}</tbody></table>
        </body></html>`;

    const janela = window.open('', '_blank');
    janela.document.write(html);
    janela.document.close();
    setTimeout(() => janela.print(), 400);
}

// ============================================
// EXPORTAR EXCEL
// ============================================

function exportarPedidosExcel() {
    const filtroStatus = document.getElementById('filtroPedidosComercial')?.value || '';
    const filtroTexto  = (document.getElementById('filtroPedidosTexto')?.value || '').toLowerCase();

    let pedidos = [...pedidosGlobais].sort((a, b) => b.id - a.id);
    if (filtroStatus) pedidos = pedidos.filter(p => p.status === filtroStatus);
    if (filtroTexto)  pedidos = pedidos.filter(p =>
        (p.cliente||'').toLowerCase().includes(filtroTexto) || String(p.id).includes(filtroTexto)
    );

    const cabecalho = ['ID','Cliente','Modelo','Placa','Origem','Destino','Valor Frete','Status','Data','Responsável'];
    const linhas = pedidos.map(p => [
        p.id, p.cliente||'', p.modelo||'', p.placa||'',
        `${p.cidadeOrigem||''}/${p.ufOrigem||''}`,
        `${p.cidadeDestino||''}/${p.ufDestino||''}`,
        p.valorFrete||0, p.status||'', p.dataSolicitacao||'', p.responsavelComercial||''
    ]);

    const csvContent = [cabecalho, ...linhas]
        .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';'))
        .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movemaster-pedidos-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
// ============================================
// DROPDOWN CUSTOMIZADO
// ============================================

function toggleCustomSelect(id) {
    const dropdown = document.getElementById(id + 'Dropdown');
    if (!dropdown) return;

    // Fechar outros dropdowns abertos
    document.querySelectorAll('.custom-select-dropdown').forEach(d => {
        if (d.id !== id + 'Dropdown') d.style.display = 'none';
    });

    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function selecionarFiltro(tipo, valor, label) {
    if (tipo === 'status') {
        document.getElementById('filtroPedidosComercial').value = valor;
        document.getElementById('filtroStatusLabel').textContent = label;
        const dropdown = document.getElementById('filtroStatusDropdown');
        if (dropdown) {
            dropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selecionado'));
            event.target.classList.add('selecionado');
            dropdown.style.display = 'none';
        }
    } else if (tipo === 'rota') {
        document.getElementById('filtroPedidosRota').value = valor;
        document.getElementById('filtroRotaLabel').textContent = label || 'Todas as rotas';
        const dropdown = document.getElementById('filtroRotaDropdown');
        if (dropdown) {
            dropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selecionado'));
            event.target.classList.add('selecionado');
            dropdown.style.display = 'none';
        }
    }
    renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
}

// Fechar dropdowns ao clicar fora
document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-select-wrap')) {
        document.querySelectorAll('.custom-select-dropdown').forEach(d => d.style.display = 'none');
    }
});

// ============================================
// POPULAR ROTAS NO DROPDOWN CUSTOMIZADO
// ============================================

function popularFiltroRotas() {
    const dropdown = document.getElementById('filtroRotaDropdown');
    if (!dropdown) return;

    const rotasUnicas = [...new Set(pedidosGlobais.map(p => {
        if (!p.cidadeOrigem || !p.cidadeDestino) return null;
        return `${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}`;
    }).filter(Boolean))].sort();

    const valorAtual = document.getElementById('filtroPedidosRota')?.value || '';

    // Manter só a opção "Todas as rotas" e adicionar as dinâmicas
    dropdown.innerHTML = `<div class="custom-select-option ${!valorAtual ? 'selecionado' : ''}" onclick="selecionarFiltro('rota','','Todas as rotas')">Todas as rotas</div>`;

    rotasUnicas.forEach(r => {
        const div = document.createElement('div');
        div.className = 'custom-select-option' + (r === valorAtual ? ' selecionado' : '');
        div.textContent = r;
        div.onclick = () => selecionarFiltro('rota', r, r);
        dropdown.appendChild(div);
    });
}

// ============================================
// RESUMO VISUAL DE ROTAS
// ============================================

function toggleResumoRotas() {
    const painel = document.getElementById('painelResumoRotas');
    if (!painel) return;
    if (painel.style.display === 'none') {
        renderizarResumoRotas();
        painel.style.display = 'block';
    } else {
        painel.style.display = 'none';
    }
}

function limparPeriodoRotas() {
    const de = document.getElementById('rotasDataDe');
    const ate = document.getElementById('rotasDataAte');
    if (de) de.value = '';
    if (ate) ate.value = '';
    renderizarResumoRotas();
}

// Data usada para o filtro de período: a coleta prevista é o que
// representa quando a carga rodou; se faltar, cai para o lançamento.
function dataRefPedido(p) {
    const d = p.dataPrevColeta || p.dataSolicitacao || p.createdAt;
    return d ? String(d).slice(0, 10) : null;
}

function renderizarResumoRotas() {
    const grid = document.getElementById('gridResumoRotas');
    if (!grid) return;

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Transbordo': '#fb923c', 'Entregue': '#4ade80'
    };

    // Filtro de período
    const de  = document.getElementById('rotasDataDe')?.value || '';
    const ate = document.getElementById('rotasDataAte')?.value || '';

    let base = pedidosGlobais.filter(p => p.status !== 'Cancelado');
    if (de || ate) {
        base = base.filter(p => {
            const d = dataRefPedido(p);
            if (!d) return false;                 // sem data não entra no recorte
            if (de && d < de) return false;
            if (ate && d > ate) return false;
            return true;
        });
    }

    const rotaMap = {};
    base.forEach(p => {
        if (!p.cidadeOrigem || !p.cidadeDestino) return;
        const chave = `${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}`;
        if (!rotaMap[chave]) rotaMap[chave] = { pedidos: [], total: 0, statuses: {}, cegonhas: new Set() };
        rotaMap[chave].pedidos.push(p);
        rotaMap[chave].total += parseFloat(p.valorFrete) || 0;
        if (p.placaCegonha) rotaMap[chave].cegonhas.add(p.placaCegonha);
        const st = p.status || 'Pendente';
        rotaMap[chave].statuses[st] = (rotaMap[chave].statuses[st] || 0) + 1;
    });

    const rotas = Object.entries(rotaMap).sort((a, b) => b[1].total - a[1].total);

    // Totais gerais do período
    const elTotais = document.getElementById('rotasTotaisGerais');
    if (elTotais) {
        const totCarros = base.length;
        const totValor  = base.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);
        const totCargas = new Set(base.map(p => p.placaCegonha).filter(Boolean)).size;
        const periodo = (de || ate)
            ? `${de ? new Date(de + 'T12:00').toLocaleDateString('pt-BR') : '…'} a ${ate ? new Date(ate + 'T12:00').toLocaleDateString('pt-BR') : '…'}`
            : 'todo o período';
        elTotais.innerHTML = `
            <div class="rtg-item"><span class="rtg-label">Rotas</span><span class="rtg-valor">${rotas.length}</span></div>
            <div class="rtg-item"><span class="rtg-label">Carros</span><span class="rtg-valor">${totCarros}</span></div>
            <div class="rtg-item"><span class="rtg-label">Cargas</span><span class="rtg-valor">${totCargas}</span></div>
            <div class="rtg-item rtg-destaque"><span class="rtg-label">Total ${periodo}</span><span class="rtg-valor">R$ ${totValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>`;
    }

    if (rotas.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted">Nenhuma rota encontrada neste período.</p>';
        return;
    }

    grid.innerHTML = rotas.map(([rota, dados]) => {
        const [origem, destino] = rota.split(' → ');
        const statusBadges = Object.entries(dados.statuses).map(([st, n]) => {
            const cor = cores[st] || '#888';
            return `<span class="rota-status-badge" style="background:${cor}20;color:${cor};border:1px solid ${cor}40">${n} ${st}</span>`;
        }).join('');
        const maiorStatus = Object.entries(dados.statuses).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Pendente';
        const corCard = cores[maiorStatus] || '#888';

        return `<div class="rota-card" onclick="filtrarPorRota('${rota.replace(/'/g, "\\'")}')">
            <div class="rota-card-header" style="border-left-color:${corCard}">
                <div class="rota-trajeto">
                    <span class="rota-origem">📍 ${origem}</span>
                    <span class="rota-seta">→</span>
                    <span class="rota-destino">🏁 ${destino}</span>
                </div>
                <span class="rota-total-badge">${dados.pedidos.length} carro${dados.pedidos.length > 1 ? 's' : ''}</span>
            </div>
            <div class="rota-statuses">${statusBadges}</div>
            <div class="rota-numeros">
                <span class="rn-item" title="Veículos transportados nesta rota">🚗 <strong>${dados.pedidos.length}</strong> carro(s)</span>
                <span class="rn-item" title="Cegonhas distintas que rodaram esta rota">🚛 <strong>${dados.cegonhas.size}</strong> carga(s)</span>
                <span class="rn-item" title="Média por carro">≈ R$ ${(dados.total / dados.pedidos.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/carro</span>
            </div>
            <div class="rota-valor">R$ ${dados.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>`;
    }).join('');
}

function filtrarPorRota(rota) {
