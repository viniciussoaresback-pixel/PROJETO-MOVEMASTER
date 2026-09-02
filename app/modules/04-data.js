/* ==========================================================================
   MODULE: 04-data.js
   Supabase load, CTE, selects, multi-veículos
   Linhas originais: 450-841
   ========================================================================== */

// ============================================
// DADOS DO SUPABASE
// ============================================

async function carregarDadosDoSupabase(opts) {
    if (!supabase) return;
    const somentePedidos = !!(opts && opts.somentePedidos);
    if (typeof mostrarProcessando === 'function') mostrarProcessando();
    try {
        let resClientes = { data: null }, resMotoristas = { data: null }, resVeiculos = { data: null }, resPedidos = { data: null };
        if (somentePedidos) {
            const [rp, rr] = await Promise.all([
                supabase.from('pedidos').select('*').order('created_at', {ascending:false}),
                supabase.from('rotas_planejadas').select('*').order('data_saida', { ascending: true })
            ]);
            resPedidos = rp; if (rr.data) rotasGlobais = rr.data;
        } else {
        [resClientes, resMotoristas, resVeiculos, resPedidos] = await Promise.all([
            supabase.from('clientes').select('*').order('nome'),
            supabase.from('motoristas').select('*').order('nome'),
            supabase.from('veiculos').select('*').order('placa'),
            supabase.from('pedidos').select('*').order('created_at', {ascending:false})
        ]);

        // Rotas planejadas (tabela opcional — se não existir, segue sem quebrar)
        // Carrega TODAS as tabelas secundárias em paralelo (antes era em fila = lento)
        const [
          resRotas, resAgs, resEmg, resEps, resPar, resCors, resParadas, resEq, resEn, resTab, resTabM, resDocs
        ] = await Promise.all([
          supabase.from('rotas_planejadas').select('*').order('data_saida', { ascending: true }),
          supabase.from('agendamentos_manutencao').select('*').order('data_hora', { ascending: true }),
          supabase.from('paradas_emergencia').select('*').order('created_at', { ascending: false }),
          supabase.from('solicitacoes_epi').select('motorista_id,motorista_nome,status').eq('status','pendente'),
          supabase.from('parametros_sistema').select('valor').eq('chave','reserva_timer_minutos').maybeSingle(),
          supabase.from('corredores').select('*').order('nome'),
          supabase.from('corredor_paradas').select('*').order('ordem'),
          supabase.from('equipes_entrega').select('*').order('nome'),
          supabase.from('entregas_last_mile').select('*').order('created_at', { ascending:false }),
          supabase.from('tabela_precos').select('*').order('cidade_origem'),
          supabase.from('precos_manuais_trecho').select('*'),
          supabase.from('documentos_rota').select('*').order('enviado_em', { ascending:false })
        ].map(q => q.then(r => r).catch(() => ({ data: null }))));

        rotasGlobais = resRotas.data || [];
        agendamentosManutencaoGlobais = resAgs.data || [];
        paradasEmergenciaGlobais = resEmg.data || [];
        episPendentesGlobais = resEps.data || [];
        if (resPar.data && resPar.data.valor) paramReservaTimerMin = parseInt(resPar.data.valor,10) || 120;
        corredoresGlobais = resCors.data || [];
        { const porCor = {}; (resParadas.data||[]).forEach(p => { (porCor[p.corredor_id] = porCor[p.corredor_id] || []).push(p); });
          corredoresGlobais.forEach(c => { c._paradas = porCor[c.id] || []; }); }
        equipesEntregaGlobais = resEq.data || [];
        entregasLastMileGlobais = resEn.data || [];
        tabelaPrecosGlobais = resTab.data || [];
        precosManuaisTrechoGlobais = resTabM.data || [];
        documentosRotaGlobais = resDocs.data || [];
        // Vínculo histórico viagem <-> pedido (nunca apagado; separa histórico da etapa atual)
        try {
          const resVP = await supabase.from('viagem_pedidos').select('*');
          viagemPedidosGlobais = resVP.data || [];
        } catch(e){ viagemPedidosGlobais = []; }

        // Folgas (tabela opcional) — mantém sua própria função
        if (typeof carregarFolgas === 'function') { try { await carregarFolgas(); } catch(e){} }
        } // fim do modo completo

        if (resClientes.data)   clientesGlobais   = resClientes.data;
        if (resMotoristas.data) motoristasGlobais = resMotoristas.data;
        if (resVeiculos.data)   veiculosGlobais   = resVeiculos.data;
        if (resPedidos.data) {
            pedidosGlobais = resPedidos.data.map(p => ({
                id: p.id,
                cliente: p.cliente,
                clienteId: p.cliente_id || null,
                dataSolicitacao: p.data_solicitacao,
                prazoEntregaEstimado: p.prazo_entrega_estimado || null,
                modelo: p.modelo,
                placa: p.placa,
                cidadeOrigem: p.cidade_origem,
                categoriaVeiculo: p.categoria_veiculo || null,
                ufOrigem: p.uf_origem,
                cidadeDestino: p.cidade_destino,
                ufDestino: p.uf_destino,
                enderecoColeta: p.endereco_coleta,
                cnpjColeta: p.cnpj_coleta || null,
                cnpjEntrega: p.cnpj_entrega || null,
                enderecoEntrega: p.endereco_entrega,
                valorFrete: p.valor_frete,
                freteTipo: p.frete_tipo || 'cheio',
                responsavelComercial: p.responsavel_comercial,
                referencia: p.referencia || null,
                observacaoPedido: p.observacao_pedido || null,
                status: p.status || 'Pendente',
                rota: p.rota,
                placaCegonha: p.placa_cegonha,
                motorista1: p.motorista_1,
                percentMotorista1: p.percent_motorista_1,
                motorista2: p.motorista_2,
                percentMotorista2: p.percent_motorista_2,
                dataPrevColeta: p.data_prev_coleta,
                dataPrevEntrega: p.data_prev_entrega,
                cidadeTransbordo: p.cidade_transbordo || null,
                transbordoPrevisto: p.transbordo_previsto || null,
                statusPlanilha: p.status_planilha || null,
                transbordoEm: p.transbordo_em || null,
                patioAtual: p.patio_atual || null,
                corredorManualId: p.corredor_manual_id || null,
                cobrancaStatus: p.cobranca_status || 'a_cobrar',
                pagoEm: p.pago_em || null,
                freteEsperado: p.frete_esperado != null ? p.frete_esperado : null,
                cobrancaForma: p.cobranca_forma || null,
                cobradoEm: p.cobrado_em || null,
                pagoEm: p.pago_em || null,
                freteEsperado: p.frete_esperado != null ? p.frete_esperado : null,
                pagtoConfirmadoEm: p.pagto_confirmado_em || null,
                patioDesde: p.patio_desde || null,
                grupoId: p.grupo_id || null,
                rotaId: p.rota_id || null,
                tipoEntrega: p.tipo_entrega || 'patio',
                aguardandoRetirada: p.aguardando_retirada || false,
                qtdTransbordos: p.qtd_transbordos || 0,
                aguardandoTransbordo: p.aguardando_transbordo || false,
                precisaEquipeEntrega: p.precisa_equipe_entrega || false,
                numeroCte: p.numero_cte || null,
                cteEmitidoEm: p.cte_emitido_em || null,
                aprovado: p.aprovado !== false,
                aprovadoEm: p.aprovado_em || null,
                fluxoEntrega: p.fluxo_entrega || null,
                equipeEntregaId: p.equipe_entrega_id || null,
                coletaEquipeEm: p.coleta_equipe_em || null,
                coletaEquipePor: p.coleta_equipe_por || null,
                formaColeta: p.forma_coleta || null,
                localCarro: p.local_carro || null,
                valorMotoristaTerceiro: p.valor_motorista_terceiro != null ? p.valor_motorista_terceiro : null,
                guiaIcmsValor: p.guia_icms_valor != null ? p.guia_icms_valor : null,
                romaneioEnderecoColeta: p.romaneio_endereco_coleta || null,
                romaneioEnderecoEntrega: p.romaneio_endereco_entrega || null,
                patioColeta: p.patio_coleta || null,
                equipeColetaId: p.equipe_coleta_id || null,
                entregaEquipeId: p.entrega_equipe_id || null,
                obsColeta: p.obs_coleta || null,
                entregaEquipeEm: p.entrega_equipe_em || null,
                entregaEquipePor: p.entrega_equipe_por || null,
                origemLancamento: p.origem_lancamento || null,
                criadoPorNome: p.criado_por_nome || null,
                isReserva: p.is_reserva === true,
                reservaStatus: p.reserva_status || null,
                reservaExpiraEm: p.reserva_expira_em || null,
                statusReprogramacao: p.status_reprogramacao || null,
                etaReprogramado: p.eta_reprogramado || null,
                confLogisticaEm: p.confirmacao_logistica_em || null,
                confLogisticaPor: p.confirmacao_logistica_por || null,
                confComercialEm: p.confirmacao_comercial_em || null,
                confComercialPor: p.confirmacao_comercial_por || null,
                receitaConfirmada: p.receita_confirmada === true,
                receitaConfirmadaEm: p.receita_confirmada_em || null,
                receitaConfirmadaPor: p.receita_confirmada_por || null,
                receitaObservacao: p.receita_observacao || null,
                createdAt: p.created_at
            }));
        }
        preencherSelects();
        // Se a Visão Geral estiver aberta, atualiza com os dados novos
        const secDir = document.getElementById('diretoria');
        if (secDir && secDir.classList.contains('active') && typeof renderizarDiretoria === 'function') {
            renderizarDiretoria();
        }
        if (typeof renderizarListaClientes === 'function') renderizarListaClientes();
        if (typeof renderizarListaMotoristas === 'function') renderizarListaMotoristas();
        if (typeof renderizarListaVeiculos === 'function') renderizarListaVeiculos();
        if (typeof carregarMapaCTE === 'function') await carregarMapaCTE();
        renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
        atualizarDashboardComercial();
        if (typeof renderizarLiberacoesComercial === 'function') renderizarLiberacoesComercial();
        if (typeof renderizarOcorrenciasComercial === 'function') renderizarOcorrenciasComercial();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    } finally {
        if (typeof ocultarProcessando === 'function') ocultarProcessando();
    }
}

// ============================================
// CTE EMITIDO por pedido — derivado dos espelhos fiscais
// ============================================
async function carregarMapaCTE() {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('ocorrencias')
            .select('cte_emitido, cte_numero, dados_extras')
            .eq('tipo', 'pdf_fiscal').eq('cte_emitido', true);
        const mapa = {};
        (data || []).forEach(e => {
            let extras = {};
            try { extras = JSON.parse(e.dados_extras || '{}'); } catch (_) {}
            const ids = Array.isArray(extras.pedidos_ids) ? extras.pedidos_ids : [];
            ids.forEach(id => {
                // Se o mesmo pedido está em vários espelhos (transbordo), guarda o
                // primeiro que veio (que é o mais recente pela ordem do query).
                if (!mapa[id]) mapa[id] = { emitido: true, numero: e.cte_numero || null };
            });
        });
        ctePorPedido = mapa;
    } catch (e) {
        console.warn('Não consegui carregar CTE dos pedidos:', e.message);
    }
}

function cteInfoDoPedido(pedidoId) {
    return ctePorPedido[pedidoId] || null;
}

function selCTEDoPedido(pedidoId) {
    const info = cteInfoDoPedido(pedidoId);
    if (!info) return '';
    return `<span class="selo-cte-pedido" title="CTE já emitido${info.numero ? ' — nº ' + info.numero : ''}. Em transbordo, só o manifesto muda.">🧾 CTE${info.numero ? ' nº ' + info.numero : ' emitido'}</span>`;
}

// ============================================
// SELECTS GLOBAIS
// ============================================

function preencherSelects() {
    // Select cliente no form comercial
    const selCliente = document.getElementById('cliente');
    if (selCliente) {
        const val = selCliente.value;
        selCliente.innerHTML = '<option value="">Selecione um cliente</option>';
        clientesGlobais.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nome || c; opt.textContent = c.nome || c;
            selCliente.appendChild(opt);
        });
        selCliente.value = val;
    }

    // Selects de motorista no modal de alocação
    ['alocMotorista1','alocMotorista2','motorista1','motorista2'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const val = sel.value;
        const isOpcional = id.includes('2') || id === 'alocMotorista2';
        sel.innerHTML = isOpcional ? '<option value="">Nenhum</option>' : '<option value="">Selecione um motorista</option>';
        motoristasGlobais.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.nome || m;
            opt.textContent = (m.nome || m) + (m.vinculo === 'terceiro' ? ' 🤝 (terceiro)' : '');
            sel.appendChild(opt);
        });
        sel.value = val;
    });

    // Selects de veículo no modal legado
    ['veiculo1','veiculo2'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const val = sel.value;
        sel.innerHTML = id === 'veiculo2' ? '<option value="">Nenhum</option>' : '<option value="">Selecione um veículo</option>';
        veiculosGlobais.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.placa; opt.textContent = `${v.placa} (${v.tipo})`;
            sel.appendChild(opt);
        });
        sel.value = val;
    });

    preencherSelectMotoristasFaturamento();
}

function preencherSelectMotoristasFaturamento() {
    // Mantido por compatibilidade; agora o filtro é montado por atualizarSelectFaturamento()
    if (typeof atualizarSelectFaturamento === 'function') atualizarSelectFaturamento();
}

// ============================================
// MÚLTIPLOS VEÍCULOS NO MESMO PEDIDO
// Mesmo cliente, mesma origem/destino → 1 pedido por carro,
// todos vinculados por um grupo_id (mantém 1 carro = 1 vaga na cegonha)
// ============================================

let contadorVeiculosExtras = 0;

function adicionarVeiculoExtra() {
    contadorVeiculosExtras++;
    const idx = contadorVeiculosExtras;
    const container = document.getElementById('veiculosExtras');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'veiculo-extra-row';
    div.id = `veiculoExtra_${idx}`;
    div.innerHTML = `
        <div class="veiculo-extra-topo">
            <span class="veiculo-extra-num">Veículo ${idx + 1}</span>
            <button type="button" class="btn-remover-veiculo" onclick="removerVeiculoExtra(${idx})" title="Remover este veículo">✕</button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Modelo do Veículo (adicional) *</label>
                <input type="text" class="veiculo-extra-modelo" placeholder="Ex: Toyota Corolla">
            </div>
            <div class="form-group">
                <label>Placa *</label>
                <input type="text" class="veiculo-extra-placa" placeholder="Ex: XYZ9876" maxlength="8" style="text-transform:uppercase">
            </div>
            <div class="form-group" style="max-width:200px">
                <label>Referência deste carro <span class="label-opcional">(opcional)</span></label>
                <input type="text" class="veiculo-extra-referencia" placeholder="Se vazio, usa a geral">
            </div>
            <div class="form-group" style="max-width:180px">
                <label>Categoria *</label>
                <select class="veiculo-extra-categoria">
                    <option value="">Selecione...</option>
                    <option value="hatch">Hatch</option>
                    <option value="sedan">Sedan</option>
                    <option value="suv">SUV</option>
                    <option value="caminhonete">Caminhonete</option>
                    <option value="moto">Moto</option>
                    <option value="furgao">Furgão</option>
                    <option value="capota">Veículo com capota</option>
                    <option value="utilitario">Utilitário</option>
                </select>
            </div>
            <div class="form-group" style="max-width:180px">
                <label>Valor Frete (R$)</label>
                <div class="input-moeda-wrap">
                    <span class="input-moeda-prefixo">R$</span>
                    <input type="text" class="veiculo-extra-valor" placeholder="Igual ao 1º" oninput="mascaraMoeda(this); atualizarPreviewFrete()">
                </div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Endereço de coleta <span class="label-opcional">(só se for diferente do 1º veículo)</span></label>
                <input type="text" class="veiculo-extra-end-coleta" placeholder="Deixe em branco = mesmo endereço do 1º">
            </div>
            <div class="form-group">
                <label>Endereço de entrega <span class="label-opcional">(só se for diferente do 1º veículo)</span></label>
                <input type="text" class="veiculo-extra-end-entrega" placeholder="Deixe em branco = mesmo endereço do 1º">
            </div>
        </div>
    `;
    container.appendChild(div);
    if (typeof atualizarPreviewFrete === "function") atualizarPreviewFrete();
    div.querySelector('.veiculo-extra-modelo').focus();
}

function removerVeiculoExtra(idx) {
    const div = document.getElementById(`veiculoExtra_${idx}`);
    if (div) div.remove();
    if (typeof atualizarPreviewFrete === 'function') atualizarPreviewFrete();
}

function limparVeiculosExtras() {
    const container = document.getElementById('veiculosExtras');
    if (container) container.innerHTML = '';
    contadorVeiculosExtras = 0;
}

// Retorna [{modelo, placa, valorFrete|null, enderecoColeta, enderecoEntrega}] ou null se houver linha incompleta
function coletarVeiculosExtras() {
    const linhas = document.querySelectorAll('.veiculo-extra-row');
    const veiculos = [];
    for (const linha of linhas) {
        const modelo = linha.querySelector('.veiculo-extra-modelo')?.value.trim() || '';
        const placa  = (linha.querySelector('.veiculo-extra-placa')?.value.trim() || '').toUpperCase();
        const valorStr = linha.querySelector('.veiculo-extra-valor')?.value.trim() || '';
        const endColeta  = linha.querySelector('.veiculo-extra-end-coleta')?.value.trim() || '';
        const endEntrega = linha.querySelector('.veiculo-extra-end-entrega')?.value.trim() || '';
        const categoria = linha.querySelector('.veiculo-extra-categoria')?.value || '';
        const referencia = linha.querySelector('.veiculo-extra-referencia')?.value.trim() || '';
        if (!modelo && !placa) continue; // linha vazia, ignora
        if (!modelo || !placa) return null; // linha incompleta
        veiculos.push({
            modelo,
            placa,
            categoriaVeiculo: categoria || null,
            valorFrete: valorStr ? valorMoedaParaFloat(valorStr) : null,
            referencia: referencia || null,   // vazio = herda a geral
            enderecoColeta: endColeta,   // vazio = herda do 1º
            enderecoEntrega: endEntrega  // vazio = herda do 1º
        });
    }
    return veiculos;
}

function gerarGrupoId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'grp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

