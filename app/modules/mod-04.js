/* ============================================================================
   MOVEMASTER — mod-04.js  (42 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: confirmarMudancaStatus, abrirHistorico, filtrarClientes, selecionarCliente, limparClienteSelecionado, fecharListaClientes, buscarCEPPedido, mascaraMoeda, ...
   ============================================================================ */
async function confirmarMudancaStatus() {
    const pedidoId = document.getElementById('statusPedidoId').value;
    const statusAnterior = document.getElementById('statusAtual').value;
    const statusNovo = document.getElementById('statusNovo').value;
    const observacao = document.getElementById('statusObservacao').value.trim();
    let cidadeTransbordo = document.getElementById('cidadeTransbordo').value.trim();
    if (cidadeTransbordo === '__outro') {
        cidadeTransbordo = document.getElementById('cidadeTransbordoOutra').value.trim();
    }
    const msgEl = document.getElementById('mensagemStatus');

    // Tipo de transbordo e cegonha destino (caminhão→caminhão)
    const tipoTransbordo = document.querySelector('input[name="tipoTransbordo"]:checked')?.value || 'patio';
    const cegonhaDestino = document.getElementById('cegonhaDestinoTransbordo')?.value || '';
    const checklistVerificado = document.getElementById('checklistVerificado')?.checked || false;
    const motivoTransbordo = document.getElementById('motivoTransbordo')?.value || 'planejado';
    const novoEtaTransbordoRaw = document.getElementById('novoEtaTransbordo')?.value || null;

    if (!statusNovo) {
        msgEl.textContent = 'Selecione o próximo status.';
        msgEl.className = 'message show error';
        return;
    }

    // ITEM 2 — Definição de Transbordo é exclusiva da Logística
    if (statusNovo === 'Transbordo' && !podeAlocarOuTransbordar()) {
        msgEl.textContent = 'Apenas o Setor de Logística pode definir transbordo.';
        msgEl.className = 'message show error';
        return;
    }

    // Transbordo: valida conforme o tipo
    if (statusNovo === 'Transbordo') {
        if (tipoTransbordo === 'patio' && !cidadeTransbordo) {
            msgEl.textContent = 'Selecione o pátio do transbordo.';
            msgEl.className = 'message show error';
            return;
        }
        if (tipoTransbordo === 'caminhao' && !cegonhaDestino) {
            msgEl.textContent = 'Selecione a cegonha de destino do transbordo.';
            msgEl.className = 'message show error';
            return;
        }
    }

    // Checklist do motorista: obrigatório na ENTREGA e em TODO TRANSBORDO
    if ((statusNovo === 'Entregue' || statusNovo === 'Transbordo') && !checklistVerificado) {
        msgEl.textContent = '✅ Confirme que verificou o checklist do motorista na plataforma da empresa antes de concluir.';
        msgEl.className = 'message show error';
        return;
    }

    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin';
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Sistema';

    try {
        const pedidoObj = pedidosGlobais.find(p => String(p.id) === String(pedidoId));

        // ============ GATES DO FLUXO DE CONFIRMAÇÃO ============
        // Checkpoint 1 (logística, até 4h antes da coleta): confirmar a intenção
        // exige caminhão E motorista definidos — bloqueia até estar completo.
        if (statusAnterior === 'Intenção Agendada' && statusNovo === 'Aguardando Confirmação') {
            if (!pedidoObj?.placaCegonha) {
                msgEl.textContent = '🚛 Caminhão ainda A DEFINIR. Aloque o pedido em uma cegonha antes de confirmar a intenção.';
                msgEl.className = 'message show error';
                return;
            }
            if (!pedidoObj?.motorista1) {
                msgEl.textContent = '👤 Motorista ainda A DEFINIR. Defina o motorista da cegonha antes de confirmar a intenção.';
                msgEl.className = 'message show error';
                return;
            }
        }

        // 1. Atualizar status no pedido
        const atualizacao = { status: statusNovo };
        let saidaPatioObs = '';

        // Carimbo do checkpoint 1: confirmação da logística
        if (statusAnterior === 'Intenção Agendada' && statusNovo === 'Aguardando Confirmação') {
            atualizacao.confirmacao_logistica_em = new Date().toISOString();
            atualizacao.confirmacao_logistica_por = usuarioNome;
        }
        // Carimbo do checkpoint 2: liberação do comercial para coleta
        if (statusAnterior === 'Aguardando Confirmação' && statusNovo === 'Em Coleta') {
            atualizacao.confirmacao_comercial_em = new Date().toISOString();
            atualizacao.confirmacao_comercial_por = usuarioNome;
        }

        if (statusNovo === 'Transbordo') {
            if (tipoTransbordo === 'patio') {
                // Caminhão → Pátio: carro fica no pátio, cegonha segue
                atualizacao.cidade_transbordo = cidadeTransbordo;
                atualizacao.transbordo_em = new Date().toISOString();
                atualizacao.patio_atual = cidadeTransbordo;
                atualizacao.patio_desde = atualizacao.transbordo_em;
                atualizacao.placa_cegonha = null;
                atualizacao.motorista_1 = null;
                atualizacao.motorista_2 = null;
                atualizacao.percent_motorista_1 = null;
                atualizacao.percent_motorista_2 = null;
                // Perna 1 concluída: sai do corredor/rota antigos e renasce no pátio (perna 2)
                atualizacao.rota_id = null;
                atualizacao.corredor_manual_id = null;
            } else {
                // Caminhão → Caminhão: passa direto para a nova cegonha, sem pátio
                atualizacao.cidade_transbordo = `Cegonha ${cegonhaDestino}`;
                atualizacao.transbordo_em = new Date().toISOString();
                atualizacao.placa_cegonha = cegonhaDestino;
                // motoristas da nova cegonha entram na próxima alocação/definição
                atualizacao.motorista_1 = null;
                atualizacao.motorista_2 = null;
                atualizacao.percent_motorista_1 = null;
                atualizacao.percent_motorista_2 = null;
                atualizacao.patio_atual = null;
                atualizacao.patio_desde = null;
            }
        }

        // Carro voltou a rodar (ou finalizou): sai do pátio automaticamente
        if (['Em Transporte', 'Entregue'].includes(statusNovo) && pedidoObj?.patioAtual) {
            atualizacao.patio_atual = null;
            atualizacao.patio_desde = null;
            saidaPatioObs = ` — 📤 Saiu do pátio de ${pedidoObj.patioAtual}`;
        }

        const { error: errPedido } = await supabase
            .from('pedidos')
            .update(atualizacao)
            .eq('id', pedidoId);
        if (errPedido) throw errPedido;

        // ITEM 17.3 — Reprogramação de ETA no transbordo.
        // Por padrão o ETA original é PRESERVADO (nada muda). Só recalcula se a
        // Logística digitou um novo ETA final. Aplica ao grupo (carga fechada) se houver.
        if (statusNovo === 'Transbordo' && novoEtaTransbordoRaw) {
            try {
                const novoEtaISO = new Date(novoEtaTransbordoRaw).toISOString();
                const atrasado = new Date(novoEtaISO).getTime() < Date.now();
                const patchReprog = {
                    eta_reprogramado: novoEtaISO,
                    status_reprogramacao: atrasado ? 'atrasado' : 'reprogramado'
                };
                const idsReprog = (_statusGrupoIds && _statusGrupoIds.length > 1)
                    ? _statusGrupoIds.map(x => parseInt(x)) : [parseInt(pedidoId)];
                await supabase.from('pedidos').update(patchReprog).in('id', idsReprog);
                // Avisa o Comercial
                if (typeof notificar === 'function') notificar({
                    perfil: 'comercial', tipo: 'alerta',
                    titulo: atrasado ? '🔴 Entrega atrasada (transbordo)' : '🟡 Entrega reprogramada (transbordo)',
                    mensagem: `Pedido #${pedidoId}: novo ETA ${new Date(novoEtaISO).toLocaleString('pt-BR')}`
                });
            } catch(e){ console.warn('Reprogramação de ETA não aplicada:', e.message); }
        }

        // 2. Registrar no histórico
        let descTransbordo = '';
        if (statusNovo === 'Transbordo') {
            descTransbordo = tipoTransbordo === 'patio'
                ? `Transbordo para pátio de ${cidadeTransbordo}`
                : `Transbordo caminhão → caminhão (nova cegonha ${cegonhaDestino})`;
        }
        const seloChecklist = (statusNovo === 'Entregue' || statusNovo === 'Transbordo')
            ? ' [✅ checklist verificado]' : '';
        const obsCompleta = ((statusNovo === 'Transbordo'
            ? `${descTransbordo}${observacao ? ' — ' + observacao : ''}`
            : (observacao || '')) + saidaPatioObs + seloChecklist).trim() || null;

        const { error: errHist } = await supabase
            .from('historico_status')
            .insert({
                pedido_id: parseInt(pedidoId),
                status_anterior: statusAnterior,
                status_novo: statusNovo,
                usuario_nome: usuarioNome,
                usuario_perfil: perfilUsuario,
                observacao: obsCompleta
            });
        if (errHist) console.warn('Histórico não salvo:', errHist.message);

        // 2b. MANIFESTO + APONTAMENTO FISCAL
        // Eventos que ALTERAM a quantidade de veículos na carga de um caminhão:
        //  • Em Coleta  → +1 no caminhão (carro embarca)
        //  • Entregue   → -1 (carro sai da carga)
        //  • Transbordo pátio    → -1 no caminhão de origem
        //  • Transbordo caminhão → -1 na origem e +1 no destino
        try {
            if (statusNovo === 'Em Coleta' && pedidoObj?.placaCegonha) {
                await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'coleta', +1);
            } else if (statusNovo === 'Entregue') {
                const cam = pedidoObj?.placaCegonha;
                if (cam) await registrarEventoManifesto(cam, pedidoObj, 'entrega', -1);
            } else if (statusNovo === 'Transbordo') {
                const camOrigem = pedidoObj?.placaCegonha;
                if (camOrigem) await registrarEventoManifesto(camOrigem, pedidoObj, 'transbordo_saida', -1);
                if (tipoTransbordo === 'caminhao' && cegonhaDestino) {
                    await registrarEventoManifesto(cegonhaDestino, pedidoObj, 'transbordo_entrada', +1);
                }
            }
        } catch (e) {
            console.warn('Manifesto/fiscal não atualizado:', e.message);
        }

        // Transbordo → registra as pernas (fecha a atual, abre a próxima) p/ faturamento
        if (statusNovo === 'Transbordo') {
            await _registrarTrechosTransbordo(pedidoObj, { statusNovo, tipoTransbordo, cidadeTransbordo, cegonhaDestino });
        }

        // 3b. Notificar o setor certo conforme a etapa do fluxo
        try { notificarMudancaStatus(pedidoObj, statusAnterior, statusNovo); } catch (e) {}

        // Carga fechada: aplica o MESMO avanço aos demais carros do grupo
        // que estão no mesmo status (statusAnterior). Os que estão em outro
        // status ficam de fora (decisão A + A).
        let avancadosLote = 0;
        if (_statusGrupoIds && _statusGrupoIds.length > 1) {
            const dados = { statusAnterior, statusNovo, tipoTransbordo, cidadeTransbordo, cegonhaDestino, observacao, usuarioNome, perfilUsuario };
            for (const outroId of _statusGrupoIds) {
                if (String(outroId) === String(pedidoId)) continue;
                const outro = pedidosGlobais.find(p => String(p.id) === String(outroId));
                if (!outro || (outro.status || 'Pendente') !== statusAnterior) continue;
                try { await _aplicarStatusEmPedidoLote(outro, dados); avancadosLote++; }
                catch (e) { console.warn('Lote: falha ao avançar', outroId, e.message); }
            }
        }
        _statusGrupoIds = [];

        // 3. Atualizar dados locais
        await aposMutacaoPedidos();
        fecharModal('modalStatus');
        exibirMensagem('mensagemLogistica', `✅ Status atualizado: ${statusAnterior} → ${statusNovo}${avancadosLote ? ` · +${avancadosLote} carros do grupo` : ''}`, 'success');
        renderizarPedidosDrag();
        renderizarVeiculosDrop();
        renderizarKanban();
        renderizarPainelCegonhas();
        // Disparar PDF fiscal automaticamente ao entrar Em Transporte
        if (statusNovo === 'Em Transporte') {
            await dispararPDFFiscal(pedidoId);
        }

    } catch (err) {
        msgEl.textContent = 'Erro ao atualizar: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// HISTÓRICO DO PEDIDO
// ============================================

async function abrirHistorico(pedidoId) {
    document.getElementById('historicoPedidoId').textContent = '#' + pedidoId;
    document.getElementById('listaHistorico').innerHTML = '<p class="text-center text-muted">Carregando...</p>';
    document.getElementById('modalHistorico').classList.add('show');

    try {
        const { data, error } = await supabase
            .from('historico_status')
            .select('*')
            .eq('pedido_id', pedidoId)
            .order('created_at', { ascending: false });

        const lista = document.getElementById('listaHistorico');

        if (error || !data || data.length === 0) {
            lista.innerHTML = '<p class="text-center text-muted">Nenhuma alteração registrada.</p>';
            return;
        }

        lista.innerHTML = data.map(h => {
            const corAnterior = FLUXO_STATUS[h.status_anterior]?.cor || '#888';
            const corNovo = FLUXO_STATUS[h.status_novo]?.cor || '#4ade80';
            const data_fmt = h.created_at
                ? new Date(h.created_at).toLocaleString('pt-BR')
                : '—';
            return `
                <div class="historico-item">
                    <div class="historico-linha">
                        <span class="hist-status" style="color:${corAnterior}">${h.status_anterior || '—'}</span>
                        <span class="hist-seta">→</span>
                        <span class="hist-status" style="color:${corNovo}">${h.status_novo}</span>
                    </div>
                    <div class="historico-meta">
                        <span>👤 ${h.usuario_nome || '—'} (${h.usuario_perfil || '—'})</span>
                        <span>🕐 ${data_fmt}</span>
                    </div>
                    ${h.observacao ? `<div class="historico-obs">📝 ${h.observacao}</div>` : ''}
                </div>
            `;
        }).join('');

    } catch(e) {
        document.getElementById('listaHistorico').innerHTML = '<p class="text-center text-muted">Erro ao carregar histórico.</p>';
    }
}

// ============================================
// BUSCA DE CLIENTE NO FORMULÁRIO DE PEDIDO
// ============================================

let clientesBuscaTimer = null;

function filtrarClientes(termo) {
    const lista = document.getElementById('listaClientesBusca');
    if (!lista) return;

    if (!termo || termo.length < 1) {
        lista.style.display = 'none';
        return;
    }

    const termoLower = termo.toLowerCase();
    const filtrados = clientesGlobais.filter(c => {
        const nome = (c.nome || '').toLowerCase();
        const fantasia = (c.nome_fantasia || '').toLowerCase();
        const cnpj = (c.cnpj || '').replace(/\D/g,'');
        const cpf  = (c.cpf  || '').replace(/\D/g,'');
        const cod  = (c.codigo || '').toLowerCase();
        const cidade = (c.cidade || '').toLowerCase();
        const termoDigits = termo.replace(/\D/g,'');
        return nome.includes(termoLower) ||
               fantasia.includes(termoLower) ||
               (termoDigits && (cnpj.includes(termoDigits) || cpf.includes(termoDigits))) ||
               cod.includes(termoLower) ||
               cidade.includes(termoLower);
    }).slice(0, 8);

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="cliente-item-vazio">Nenhum cliente encontrado</div>';
        lista.style.display = 'block';
        return;
    }

    lista.innerHTML = filtrados.map(c => {
        const doc = c.cnpj || c.cpf || '';
        const tipo = c.tipo_cliente ? `<span class="cliente-tipo-badge">${c.tipo_cliente}</span>` : '';
        const cod = c.codigo ? `<span class="cliente-cod">${c.codigo}</span>` : '';
        const cidadeUf = `${c.cidade||''}${c.uf?('/'+c.uf):''}`;
        const fantasia = (c.nome_fantasia && _norm(c.nome_fantasia) !== _norm(c.nome||'')) ? `<span class="cliente-fantasia">🏷️ ${c.nome_fantasia}</span>` : '';
        return `<div class="cliente-item" onmousedown="selecionarCliente(${c.id}, '${(c.nome||'').replace(/'/g,"\'")}', '${doc}', '${c.tipo_cliente||''}', '${c.codigo||''}')">
            <div class="cliente-item-nome">${c.nome || '—'} ${tipo} ${cod}</div>
            <div class="cliente-item-doc">${fantasia}${fantasia&&(cidadeUf||doc)?' · ':''}${cidadeUf?`📍 ${cidadeUf}`:''}${cidadeUf&&doc?' · ':''}${doc || ''}</div>
        </div>`;
    }).join('');
    lista.style.display = 'block';
}

function selecionarCliente(id, nome, doc, tipo, codigo) {
    document.getElementById('clienteBusca').value = nome;
    document.getElementById('cliente').value = nome;
    document.getElementById('clienteId').value = id;

    // Item 1 — tipo de entrega padrão do cliente (editável por exceção)
    try {
        const cli = (clientesGlobais||[]).find(c => String(c.id) === String(id));
        const selTE = document.getElementById('tipoEntregaPedido');
        if (cli && selTE && cli.tipo_entrega_padrao) selTE.value = cli.tipo_entrega_padrao;
    } catch(e){}

    const info = document.getElementById('clienteSelecionadoInfo');
    if (info) {
        info.style.display = 'flex';
        info.innerHTML = `
            <span class="cliente-sel-nome">✅ ${nome}</span>
            ${tipo ? `<span class="cliente-sel-tipo">${tipo}</span>` : ''}
            ${doc ? `<span class="cliente-sel-doc">${doc}</span>` : ''}
            ${codigo ? `<span class="cliente-sel-cod">${codigo}</span>` : ''}
            <button type="button" class="btn-hist-cliente" onclick="abrirHistoricoCliente()">📊 Histórico</button>
            <button type="button" class="cliente-sel-limpar" onclick="limparClienteSelecionado()">×</button>
        `;
    }

    const lista = document.getElementById('listaClientesBusca');
    if (lista) lista.style.display = 'none';
}

function limparClienteSelecionado() {
    document.getElementById('clienteBusca').value = '';
    document.getElementById('cliente').value = '';
    document.getElementById('clienteId').value = '';
    const info = document.getElementById('clienteSelecionadoInfo');
    if (info) info.style.display = 'none';
}

function fecharListaClientes() {
    setTimeout(() => {
        const lista = document.getElementById('listaClientesBusca');
        if (lista) lista.style.display = 'none';
    }, 200);
}

// ============================================
// CEP NO PEDIDO (COLETA E ENTREGA)
// ============================================

async function buscarCEPPedido(cep, tipo) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await resp.json();
        if (data.erro) return;

        const endereco = `${data.logradouro || ''}, ${data.bairro || ''} — ${data.localidade || ''}/${data.uf || ''}`;

        if (tipo === 'Coleta') {
            const el = document.getElementById('enderecoColeta');
            if (el) { el.value = endereco; el.focus(); }
            // Preencher UF e cidade de origem automaticamente
            const ufSel = document.getElementById('ufOrigem');
            if (ufSel && data.uf) {
                ufSel.value = data.uf;
                ufSel.dispatchEvent(new Event('change'));
                setTimeout(() => {
                    const cidSel = document.getElementById('cidadeOrigem');
                    if (cidSel) {
                        // Aguarda cidades carregar e seleciona
                        const tentarSelecionar = setInterval(() => {
                            const opts = [...cidSel.options];
                            const match = opts.find(o => o.value.toLowerCase() === (data.localidade||'').toLowerCase());
                            if (match) { cidSel.value = match.value; clearInterval(tentarSelecionar); }
                            else if (opts.length > 1) clearInterval(tentarSelecionar);
                        }, 300);
                        setTimeout(() => clearInterval(tentarSelecionar), 5000);
                    }
                }, 800);
            }
        } else {
            const el = document.getElementById('enderecoEntrega');
            if (el) { el.value = endereco; el.focus(); }
            const ufSel = document.getElementById('ufDestino');
            if (ufSel && data.uf) {
                ufSel.value = data.uf;
                ufSel.dispatchEvent(new Event('change'));
                setTimeout(() => {
                    const cidSel = document.getElementById('cidadeDestino');
                    if (cidSel) {
                        const tentarSelecionar = setInterval(() => {
                            const opts = [...cidSel.options];
                            const match = opts.find(o => o.value.toLowerCase() === (data.localidade||'').toLowerCase());
                            if (match) { cidSel.value = match.value; clearInterval(tentarSelecionar); }
                            else if (opts.length > 1) clearInterval(tentarSelecionar);
                        }, 300);
                        setTimeout(() => clearInterval(tentarSelecionar), 5000);
                    }
                }, 800);
            }
        }
    } catch(e) {
        console.warn('Erro ao buscar CEP:', e);
    }
}

// ============================================
// MÁSCARA MOEDA R$
// ============================================

function mascaraMoeda(input) {
    let v = input.value.replace(/\D/g, '');
    v = (parseInt(v) || 0).toString();
    while (v.length < 3) v = '0' + v;
    const reais = v.slice(0, -2);
    const centavos = v.slice(-2);
    const reaisFormatado = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = reaisFormatado + ',' + centavos;
    input.dataset.valor = (parseInt(v) / 100).toFixed(2);
}

function valorMoedaParaFloat(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/\./g,'').replace(',','.')) || 0;
}

// ============================================
// AJUSTE DE CAPACIDADE POR TIPO DE VEÍCULO
// ============================================

function ajustarCapacidadeVeiculo(tipo) {
    const cap = document.getElementById('capacidadeCegonha');
    if (!cap) return;
    const caps = {
        'Carreta 2 Eixos': 6,
        'Cavalo Trucado 3 Eixos': 4,
        'Cavalo Simples 2 Eixos': 3,
        'Caminhão 3/4 2 Eixos': 2,
        'Guincho': 1,
        'Prancha': 2
    };
    if (caps[tipo]) cap.value = caps[tipo];
}

// ============================================
// VALIDAÇÃO UNIQUE CPF/CNPJ NO CADASTRO
// ============================================

async function verificarDocumentoUnico(campo, valor) {
    if (!supabase || !valor) return true;
    const digits = valor.replace(/\D/g,'');
    if (digits.length < 11) return true;

    try {
        // Busca todos os clientes e compara só os DÍGITOS (ignora pontuação/formatação),
        // pra não dar falso positivo nem falso negativo por causa de "." "/" "-".
        const { data } = await supabase.from('clientes').select('id, nome, cnpj, cpf');
        if (data && data.length){
            const achado = data.find(c => String(c[campo]||'').replace(/\D/g,'') === digits);
            if (achado) return achado; // já existe (retorna o cliente)
        }
        return true; // ok, não existe
    } catch(e) {
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
    document.getElementById('filtroPedidosRota').value = rota;
    const label = document.getElementById('filtroRotaLabel');
    if (label) label.textContent = rota;
    popularFiltroRotas();
    renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
    const painel = document.getElementById('painelResumoRotas');
    if (painel) painel.style.display = 'none';
    document.getElementById('tabelaPedidosComercial')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// ============================================
// ABAS INTERNAS DA LOGÍSTICA
// ============================================

function trocarTabLogistica(tab, btn) {
    document.querySelectorAll('.log-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.log-tab-content').forEach(c => c.style.display = 'none');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('logTab-' + tab);
    if (el) el.style.display = 'block';
    if (tab === 'folgas') renderizarFolgas();
    if (tab === 'rotas') renderizarRotas();

    if (tab === 'cegonhas') renderizarPainelCegonhas();
    if (tab === 'terceiros') renderizarPainelTerceiros();
    if (tab === 'acompanhamento') renderizarAcompanhamento();
    if (tab === 'confirmacoes') { renderizarPainelConfirmacoes(); renderizarSolicitacoesEdicao(); }
    if (tab === 'validacaoPlacas') renderizarValidacaoPlacas();
    if (tab === 'manifestos') renderizarManifestos();
    if (tab === 'patios') renderizarPainelPatios();
    if (tab === 'fotos') carregarGaleriaFotos('galeria-fotos-logistica');
}

// ============================================
// ACOMPANHAMENTO (PEDIDOS ALOCADOS) — TABELA COM FILTROS
// ============================================

function limparFiltrosAcompanhamento() {
    ['acompFiltroCaminhao', 'acompFiltroDe', 'acompFiltroAte', 'acompFiltroStatus', 'acompBusca'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderizarAcompanhamento();
}

function renderizarAcompanhamento() {
    const corpo = document.getElementById('corpoTabelaAcompanhamento');
    if (!corpo) return;

    // Popular filtro de caminhões com as cegonhas em uso (preserva seleção)
    const selCam = document.getElementById('acompFiltroCaminhao');
    if (selCam) {
        const atual = selCam.value;
        const cegonhas = [...new Set(pedidosGlobais.map(p => p.placaCegonha).filter(Boolean))].sort();
        selCam.innerHTML = '<option value="">Todos</option>' +
            cegonhas.map(c => `<option value="${c}" ${c === atual ? 'selected' : ''}>${c}</option>`).join('');
    }

    const fCam = document.getElementById('acompFiltroCaminhao')?.value || '';
    const fDe = document.getElementById('acompFiltroDe')?.value || '';
    const fAte = document.getElementById('acompFiltroAte')?.value || '';
    const fStatus = document.getElementById('acompFiltroStatus')?.value || '';

    // Base: pedidos que já saíram da alocação (têm cegonha ou já avançaram)
    let lista = pedidosGlobais.filter(p =>
        p.status !== 'Pendente' && !(p.status === 'Intenção Agendada' && !p.placaCegonha)
    );

    if (fStatus === '') {
        lista = lista.filter(p => !['Entregue', 'Cancelado'].includes(p.status)); // Em andamento
    } else if (fStatus === 'Cancelado') {
        lista = lista.filter(p => p.status === 'Cancelado');
    } else if (fStatus !== '__todos') {
        lista = lista.filter(p => statusPlanilhaDoPedido(p) === fStatus);
    }
    if (fCam) lista = lista.filter(p => p.placaCegonha === fCam);

    const dataRef = p => (p.dataPrevColeta || p.createdAt || '').slice(0, 10);
    if (fDe) lista = lista.filter(p => dataRef(p) && dataRef(p) >= fDe);
    if (fAte) lista = lista.filter(p => dataRef(p) && dataRef(p) <= fAte);

    // Busca livre por texto (cliente, placa, modelo, cegonha, cidade, rota, #id)
    const termo = (document.getElementById('acompBusca')?.value || '').trim().toLowerCase();
    const totalAntesBusca = lista.length;
    if (termo) {
        lista = lista.filter(p => `${p.cliente || ''} ${p.placa || ''} ${p.modelo || ''} ${p.placaCegonha || ''} ${p.motorista1 || ''} ${p.cidadeOrigem || ''} ${p.cidadeDestino || ''} ${p.rota || ''} #${p.id}`.toLowerCase().includes(termo));
    }

    // Contador "mostrando X de Y"
    const elContador = document.getElementById('acompContador');
    if (elContador) {
        elContador.textContent = termo
            ? `${lista.length} de ${totalAntesBusca}`
            : `${lista.length} carro(s)`;
    }

    lista.sort((a, b) => {
        if (!a.dataPrevColeta) return 1;
        if (!b.dataPrevColeta) return -1;
        return new Date(a.dataPrevColeta) - new Date(b.dataPrevColeta);
    });

    if (lista.length === 0) {
        corpo.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum pedido com esses filtros.</td></tr>';
        return;
    }

    const _linhaAcompanhamento = (p) => {
        const cor = FLUXO_STATUS[p.status || 'Pendente']?.cor || '#888';
        const temProximo = FLUXO_STATUS[p.status]?.proximos?.length > 0;
        return `
        <tr>
            <td>#${p.id}</td>
            <td>${p.cliente || '—'} ${selCTEDoPedido(p.id)}${(() => {
                if (!p.grupoId) return '';
                const n = pedidosGlobais.filter(x => x.grupoId === p.grupoId).length;
                return n > 1 ? ` <span class="badge-carga-fechada" title="${nomenclaturaCarga(n)}: ${n} carros do mesmo pedido">📦 ${n}</span>` : '';
            })()}<br><span class="ocup-resp" title="Responsável comercial">🧑‍💼 ${p.responsavelComercial || '—'}</span></td>
            <td style="font-size:0.78rem">${p.modelo || ''}<br><strong>${p.placa || ''}</strong></td>
            <td style="font-size:0.75rem">${p.cidadeOrigem || ''}/${p.ufOrigem || ''}${p.cidadeTransbordo ? ` → 🔁 ${p.cidadeTransbordo}` : ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td style="font-size:0.82rem">
                ${p.placaCegonha ? `<strong>${p.placaCegonha}</strong>` : '<span class="tag-adefinir">A DEFINIR</span>'}
                ${p.motorista1 ? `<br><span style="color:var(--text-tertiary);font-size:0.75rem">👤 ${p.motorista1}</span>` : ''}
            </td>
            <td>${statusDropdownHTML(p)}
                ${p.patioAtual ? `<br><span class="badge-patio" style="margin:0.2rem 0 0">🅿️ ${p.patioAtual}</span>` : ''}
                ${p.cidadeTransbordo ? `<br><span class="badge-patio" style="margin:0.2rem 0 0;background:rgba(251,146,60,.15);color:#fb923c">🔁 transbordo ${p.cidadeTransbordo}</span>` : ''}
                ${p.transbordoPrevisto && !p.cidadeTransbordo ? `<br><span class="badge-patio" style="margin:0.2rem 0 0;background:rgba(251,146,60,.1);color:#fb923c;border:1px dashed rgba(251,146,60,.5)">🔁 previsto em ${p.transbordoPrevisto}</span>` : ''}</td>
            <td class="acomp-acoes">
                ${acaoOuAguardando(p)}
                <button class="btn-kanban-hist" onclick="_toggleJornada(${p.id})" title="Ver a jornada completa deste carro">📜 Jornada</button>
            </td>
        </tr>
        <tr id="jornadaRow_${p.id}" style="display:none"><td colspan="7" style="padding:0;background:var(--surface-2,rgba(255,255,255,.02))"><div id="jornadaBox_${p.id}" style="padding:14px 18px"></div></td></tr>`;
    };

    corpo.innerHTML = montarListaComGrupos(lista, _linhaAcompanhamento, 7, true);
}

// ============================================
// OCORRÊNCIAS → COMERCIAL RESPONSÁVEL (com retorno)
// Não trava o fluxo do pedido; fica tudo em histórico.
// ============================================

// Selo de alerta na aba "Meus Pedidos": mostra quantas ocorrências
// aguardam retorno. Some sozinho quando zera.
function atualizarSeloOcorrencias(qtd) {
    const selo = document.getElementById('seloOcorrencias');
    if (!selo) return;
    if (qtd > 0) {
        selo.textContent = qtd;
        selo.style.display = '';
        selo.title = qtd === 1
            ? '1 ocorrência aguardando seu retorno'
            : `${qtd} ocorrências aguardando seu retorno`;
    } else {
        selo.style.display = 'none';
    }
}

async function renderizarOcorrenciasComercial() {
    const painel = document.getElementById('ocorrenciasComercial');
    if (!painel || !supabase) return;

    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : null;
    if (!['comercial', 'admin'].includes(perfilUsuario)) { painel.innerHTML = ''; return; }

    try {
        const { data, error } = await supabase
            .from('ocorrencias')
            .select('*')
            .eq('tipo', 'ocorrencia')
            .or('status_retorno.is.null,status_retorno.eq.aberta')
            .order('created_at', { ascending: false })
            .limit(30);
        if (error) throw error;

        const usuarioNome = document.getElementById('usuarioLogado')?.textContent || '';

        // Roteamento: comercial vê as ocorrências dos SEUS pedidos; admin vê todas
        const minhas = (data || []).filter(o => {
            const ped = pedidosGlobais.find(p => String(p.id) === String(o.pedido_id));
            if (!ped) return false;
            if (perfilUsuario === 'admin') return true;
            return (ped.responsavelComercial || '').trim().toLowerCase() === usuarioNome.trim().toLowerCase();
        });

        atualizarSeloOcorrencias(minhas.length);
        if (minhas.length === 0) { painel.innerHTML = ''; return; }

        painel.innerHTML = `
        <div class="card ocorrencias-card">
            <h2>⚠️ Ocorrências aguardando seu retorno <span class="patio-qtd">${minhas.length}</span></h2>
            <p class="text-muted text-sm" style="margin-bottom:0.7rem">A logística registrou estas ocorrências em pedidos sob sua responsabilidade. Dê um retorno sobre a sequência — o pedido <strong>não fica travado</strong>, mas o retorno fica registrado no histórico.</p>
            ${minhas.map(o => {
                const ped = pedidosGlobais.find(p => String(p.id) === String(o.pedido_id)) || {};
                return `
                <div class="conf-card" style="border-left-color:#fbbf24">
                    <div class="conf-card-topo">
                        <span class="carro-patio-id">#${o.pedido_id}</span>
                        <strong>${ped.cliente || '—'}</strong>
                        <span class="text-muted text-sm" style="margin-left:auto">${o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : ''}</span>
                    </div>
                    <div class="conf-card-linha">🚗 ${ped.modelo || ''} · ${ped.placa || ''} | 🚛 ${ped.placaCegonha || '—'} · por ${o.usuario_nome || 'logística'}</div>
                    <div class="ocorr-descricao">${o.descricao || ''}</div>
                    ${o.arquivo_url ? `<a href="${o.arquivo_url}" target="_blank" class="text-sm">📎 Ver anexo</a>` : ''}
                    <div class="ocorr-resposta-area">
                        <textarea id="respostaOcorr_${o.id}" placeholder="Seu retorno sobre a sequência deste pedido..." rows="2"></textarea>
                        <button class="btn btn-primary btn-sm" onclick="responderOcorrencia(${o.id}, ${o.pedido_id})">↩️ Enviar Retorno</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    } catch (e) {
        console.warn('Ocorrências do comercial não carregadas:', e.message);
        atualizarSeloOcorrencias(0);
        painel.innerHTML = '';
    }
}

async function responderOcorrencia(ocorrenciaId, pedidoId) {
    const campo = document.getElementById(`respostaOcorr_${ocorrenciaId}`);
    const resposta = (campo?.value || '').trim();
    if (!resposta) { alert('Escreva o retorno antes de enviar.'); return; }

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Comercial';
    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'comercial';

    try {
        const { error } = await supabase.from('ocorrencias')
            .update({
                resposta,
                respondida_por: usuarioNome,
                respondida_em: new Date().toISOString(),
                status_retorno: 'respondida'
            })
            .eq('id', ocorrenciaId);
        if (error) throw error;

        // Retorno visível para a logística no histórico do pedido
        const ped = pedidosGlobais.find(p => String(p.id) === String(pedidoId)) || {};
        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: ped.status || 'Pendente',
            status_novo: ped.status || 'Pendente',
            usuario_nome: usuarioNome,
            usuario_perfil: perfilUsuario,
            observacao: `↩️ Retorno do comercial sobre ocorrência: ${resposta}`
        });

        renderizarOcorrenciasComercial();
        // Tocar o sino da LOGÍSTICA (fecha o bate-e-volta da ocorrência)
        if (typeof notificar === 'function') {
            notificar({
                perfil: 'logistica', pedidoId: parseInt(pedidoId), tipo: 'status',
                titulo: '↩️ Comercial respondeu a ocorrência',
                mensagem: `${ped.cliente ? ped.cliente + ' · ' : ''}${resposta}`
            });
        }
        exibirMensagem(document.getElementById('mensagemMeusPedidos') ? 'mensagemMeusPedidos' : 'mensagemComercial', '✅ Retorno enviado! A logística vê no histórico do pedido.', 'success');
    } catch (e) {
        alert('Erro ao enviar retorno: ' + e.message);
    }
}

// ============================================
// ETAPA 3 — EDIÇÃO DE PEDIDO
// • Comercial: SOLICITA edição → logística aprova. Aprovada, o pedido
//   (se além de Pendente) VOLTA para Pendente para editar e realocar.
// • Logística: EDITA direto, sem autorização e SEM mudar o status.
// ============================================

const CAMPOS_EDITAVEIS = [
    { k: 'cliente',        label: 'Cliente',            tipo: 'text',   sec: 'Cliente' },
    { k: 'referencia',     label: 'Referência (OC/ID)', tipo: 'text',   col: 'referencia', sec: 'Cliente' },
    { k: 'modelo',         label: 'Modelo',             tipo: 'text',   sec: 'Veículo' },
    { k: 'placa',          label: 'Placa',              tipo: 'text',   sec: 'Veículo' },
    { k: 'categoriaVeiculo', label: 'Categoria (hatch/sedan/suv/caminhonete/moto/furgão/capota)', tipo: 'text', col: 'categoria_veiculo', sec: 'Veículo' },
    { k: 'cidadeOrigem',   label: 'Cidade Origem',      tipo: 'text',   col: 'cidade_origem', sec: 'Origem' },
    { k: 'ufOrigem',       label: 'UF Origem',          tipo: 'text',   col: 'uf_origem', sec: 'Origem' },
    { k: 'enderecoColeta', label: 'Endereço de Coleta', tipo: 'text',   col: 'endereco_coleta', sec: 'Origem' },
    { k: 'cnpjColeta',     label: 'CNPJ do local de coleta', tipo: 'text', col: 'cnpj_coleta', sec: 'Origem' },
    { k: 'cidadeDestino',  label: 'Cidade Destino',     tipo: 'text',   col: 'cidade_destino', sec: 'Destino' },
    { k: 'ufDestino',      label: 'UF Destino',         tipo: 'text',   col: 'uf_destino', sec: 'Destino' },
    { k: 'enderecoEntrega',label: 'Endereço de Entrega',tipo: 'text',   col: 'endereco_entrega', sec: 'Destino' },
    { k: 'cnpjEntrega',    label: 'CNPJ do local de entrega', tipo: 'text', col: 'cnpj_entrega', sec: 'Destino' },
    { k: 'valorFrete',     label: 'Valor do Frete (R$)',tipo: 'number', col: 'valor_frete', sec: 'Frete e Datas' },
    { k: 'dataPrevColeta', label: 'Coleta Prevista',    tipo: 'datetime-local', col: 'data_prev_coleta', sec: 'Frete e Datas' },
    { k: 'dataPrevEntrega',label: 'Entrega Prevista',   tipo: 'datetime-local', col: 'data_prev_entrega', sec: 'Frete e Datas' },
    { k: 'prazoEntregaEstimado', label: 'Prazo de Entrega Estimado', tipo: 'date', col: 'prazo_entrega_estimado', sec: 'Frete e Datas' },
    { k: 'transbordoPrevisto', label: 'Transbordo previsto em (cidade) — deixa vazio se não vai transbordar', tipo: 'text', col: 'transbordo_previsto', sec: 'Outros' },
    { k: 'observacaoPedido',label: 'Observações',       tipo: 'text',   col: 'observacao_pedido', sec: 'Outros' },
    { k: 'valorMotoristaTerceiro', label: 'Valor a pagar ao motorista terceiro (R$)', tipo: 'number', col: 'valor_motorista_terceiro', sec: 'Motorista Terceiro' },
    { k: 'guiaIcmsValor',  label: 'Valor da guia de ICMS (R$) — deixe vazio se não passa no posto', tipo: 'number', col: 'guia_icms_valor', sec: 'Motorista Terceiro' }
];

// ---------- COMERCIAL: solicitar edição ----------
async function solicitarEdicaoPedido(pedidoId) {
    // Comercial agora edita diretamente, sem precisar de autorização da logística.
    if (typeof abrirEdicaoPedido === 'function') { abrirEdicaoPedido(pedidoId); return; }
}
async function _solicitarEdicaoPedidoAntigo(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;

    // Já existe solicitação aberta para este pedido?
    try {
        const { data: abertas } = await supabase.from('solicitacoes_edicao')
            .select('id').eq('pedido_id', pedidoId).eq('status', 'pendente').limit(1);
        if (abertas && abertas.length > 0) {
            exibirMensagem('mensagemComercial', '⏳ Já existe uma solicitação de edição pendente para este pedido, aguardando a logística.', 'error');
            return;
        }
    } catch (e) { /* segue */ }

    const motivo = prompt(`Solicitar edição do pedido #${p.id} (${p.cliente || ''}).\n\nDescreva o que precisa ser alterado (a logística vai analisar):`);
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Descreva o motivo da edição.'); return; }

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Comercial';
    try {
        const { error } = await supabase.from('solicitacoes_edicao').insert({
            pedido_id: parseInt(pedidoId),
            solicitante: usuarioNome,
            motivo: motivo.trim(),
            status: 'pendente'
        });
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: p.status || 'Pendente',
            status_novo: p.status || 'Pendente',
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'comercial',
            observacao: `✏️ Solicitação de edição enviada à logística: ${motivo.trim()}`
        });

        exibirMensagem('mensagemComercial', '✅ Solicitação enviada! A logística vai analisar e liberar a edição.', 'success');
    } catch (e) {
        exibirMensagem('mensagemComercial', 'Erro ao solicitar edição: ' + e.message, 'error');
    }
}

// ---------- LOGÍSTICA: painel de solicitações ----------
async function renderizarSolicitacoesEdicao() {
    const painel = document.getElementById('painelSolicitacoesEdicao');
    if (!painel || !supabase) return;

    try {
        const { data, error } = await supabase.from('solicitacoes_edicao')
            .select('*').eq('status', 'pendente')
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            painel.innerHTML = '<p class="text-muted text-sm" style="padding:0.5rem 0">Nenhuma solicitação de edição pendente. 👌</p>';
            return;
        }

        painel.innerHTML = data.map(s => {
            const p = pedidosGlobais.find(x => String(x.id) === String(s.pedido_id)) || {};
            return `
            <div class="conf-card" style="border-left-color:#a78bfa">
                <div class="conf-card-topo">
                    <span class="carro-patio-id">#${s.pedido_id}</span>
                    <strong>${p.cliente || '—'}</strong>
                    <span class="text-muted text-sm" style="margin-left:auto">${s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : ''}</span>
                </div>
                <div class="conf-card-linha">🚗 ${p.modelo || ''} · ${p.placa || ''} · status atual: <strong>${p.status || '—'}</strong> · por ${s.solicitante || ''}</div>
                <div class="ocorr-descricao">${s.motivo || ''}</div>
                <div class="conf-card-acoes">
                    <button class="btn btn-primary btn-sm" onclick="aprovarSolicitacaoEdicao(${s.id}, ${s.pedido_id})">✅ Aprovar e editar</button>
                    <button class="btn btn-secondary btn-sm" onclick="recusarSolicitacaoEdicao(${s.id}, ${s.pedido_id})">Recusar</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.warn('Solicitações de edição não carregadas:', e.message);
        painel.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar as solicitações.</p>';
    }
}

async function aprovarSolicitacaoEdicao(solicitacaoId, pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    const precisaVoltar = p.status !== 'Pendente';
    const aviso = precisaVoltar
        ? `Aprovar a edição do pedido #${p.id}?\n\n⚠️ Ele está em "${p.status}". Ao aprovar, o pedido VOLTA para Pendente, sai da carga atual (libera a vaga na cegonha) e precisará ser realocado após a edição.`
        : `Aprovar a edição do pedido #${p.id}? Ele já está Pendente.`;
    if (!confirm(aviso)) return;

    try {
        // Se além de Pendente: volta para Pendente e desvincula da carga
        if (precisaVoltar) {
            const { error: errPed } = await supabase.from('pedidos').update({
                status: 'Pendente',
                placa_cegonha: null, motorista_1: null, motorista_2: null,
                percent_motorista_1: null, percent_motorista_2: null
            }).eq('id', pedidoId);
            if (errPed) throw errPed;

            await supabase.from('historico_status').insert({
                pedido_id: parseInt(pedidoId),
                status_anterior: p.status,
                status_novo: 'Pendente',
                usuario_nome: usuarioNome,
                usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
                observacao: '✏️ Edição aprovada — pedido retornado a Pendente para edição e realocação'
            });
        }

        await supabase.from('solicitacoes_edicao').update({
            status: 'aprovada', resolvida_por: usuarioNome, resolvida_em: new Date().toISOString()
        }).eq('id', solicitacaoId);

        await aposMutacaoPedidos();
        renderizarSolicitacoesEdicao();
        exibirMensagem('mensagemLogistica', `✅ Edição aprovada. Abrindo o pedido #${pedidoId} para edição...`, 'success');
        abrirEdicaoPedido(pedidoId);
    } catch (e) {
        alert('Erro ao aprovar: ' + e.message);
    }
}

async function recusarSolicitacaoEdicao(solicitacaoId, pedidoId) {
    if (!supabase) return;
    const motivo = prompt('Motivo da recusa (opcional):') || '';
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    try {
        await supabase.from('solicitacoes_edicao').update({
            status: 'recusada', resolvida_por: usuarioNome,
            resolvida_em: new Date().toISOString(), resolucao_obs: motivo.trim() || null
        }).eq('id', solicitacaoId);

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: '', status_novo: '',
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
            observacao: `✏️ Solicitação de edição recusada pela logística${motivo.trim() ? ': ' + motivo.trim() : ''}`
        });

        renderizarSolicitacoesEdicao();
        exibirMensagem('mensagemLogistica', 'Solicitação recusada.', 'success');
    } catch (e) {
        alert('Erro ao recusar: ' + e.message);
    }
}

// ---------- MODAL DE EDIÇÃO (logística) ----------
