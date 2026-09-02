/* ==========================================================================
   MODULE: 01-core.js
   Anti-refresh, globals, performance, utils
   Linhas originais: 1-276
   ========================================================================== */

/* =========================================================================
   Anti-"refresh" ao digitar
   Vários campos de busca/filtro redesenhavam a tela inteira a cada tecla.
   _mmDeb agenda o redesenho só depois que o usuário para de digitar e
   devolve o foco, o cursor e a rolagem para onde estavam.
   ========================================================================= */
window._mmDebTimers = window._mmDebTimers || {};
function _mmPreservarFoco(fn){
  const ativo = document.activeElement;
  const id  = ativo && ativo.id ? ativo.id : null;
  const pos = (ativo && typeof ativo.selectionStart === 'number') ? ativo.selectionStart : null;
  const sc  = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
  try { fn(); } catch(e){ console.error(e); }
  if (id){
    const el = document.getElementById(id);
    if (el && el !== document.activeElement){
      try { el.focus({ preventScroll: true }); } catch(e){ try { el.focus(); } catch(e2){} }
      if (pos !== null){ try { el.setSelectionRange(pos, pos); } catch(e){} }
    }
  }
  if (document.scrollingElement) document.scrollingElement.scrollTop = sc;
}
function _mmDeb(chave, fn, ms){
  clearTimeout(window._mmDebTimers[chave]);
  window._mmDebTimers[chave] = setTimeout(function(){ _mmPreservarFoco(fn); }, ms || 250);
}

// ============================================
// CONFIGURAÇÃO GLOBAL E VARIÁVEIS
// ============================================

let pedidosGlobais = [];
let clientesGlobais = [];
let motoristasGlobais = [];
let veiculosGlobais = [];
let rotasGlobais = [];
let agendamentosManutencaoGlobais = [];
let paradasEmergenciaGlobais = [];
let episPendentesGlobais = [];
let paramReservaTimerMin = 120;
let equipesEntregaGlobais = [];
let tabelaPrecosGlobais = [];
let _corridorRotaCtx = null;
let precosManuaisTrechoGlobais = [];
let documentosRotaGlobais = [];
let viagemPedidosGlobais = [];
let entregasLastMileGlobais = [];
let estadosBrasil = [];
let cidadesPorEstado = {};
let notificacoesEnviadas = new Set();
// Mapa pedidoId -> { emitido: true/false, numero: 'XXXX' } derivado dos espelhos fiscais.
// Populado por carregarMapaCTE(); usado por cteInfoDoPedido() nas telas.
let ctePorPedido = {};


/* =========================================================================
   ATUALIZAÇÃO LOCAL + RELOAD LEVE (performance)
   Evita recarregar o sistema inteiro após cada ação.
   ========================================================================= */

/** Converte linha do Supabase → formato de pedidosGlobais */
function normalizarPedido(p) {
    if (!p) return null;
    return {
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
        pagtoConfirmadoEm: p.pagto_confirmado_em || null,
        patioDesde: p.patio_desde || null,
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
    };
}

function atualizarPedidoLocal(id, patch) {
    const idx = pedidosGlobais.findIndex(p => Number(p.id) === Number(id));
    if (idx === -1) return null;
    pedidosGlobais[idx] = Object.assign({}, pedidosGlobais[idx], patch || {});
    return pedidosGlobais[idx];
}

function removerPedidoLocal(id) {
    const antes = pedidosGlobais.length;
    pedidosGlobais = pedidosGlobais.filter(p => Number(p.id) !== Number(id));
    return pedidosGlobais.length < antes;
}

function upsertPedidoLocal(pedidoDoBanco) {
    const normalizado = normalizarPedido(pedidoDoBanco);
    if (!normalizado || normalizado.id == null) return null;
    const idx = pedidosGlobais.findIndex(p => Number(p.id) === Number(normalizado.id));
    if (idx >= 0) {
        pedidosGlobais[idx] = Object.assign({}, pedidosGlobais[idx], normalizado);
        return pedidosGlobais[idx];
    }
    pedidosGlobais.unshift(normalizado);
    return pedidosGlobais[0];
}

/** Re-renderiza apenas a aba que está aberta */
function refrescarTelaAtual() {
    try {
        const ativa = document.querySelector('.tab-content.active');
        if (!ativa) return;
        const id = ativa.id;
        if (id === 'logistica') {
            if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag();
            if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
            if (typeof renderizarOcupacao === 'function') renderizarOcupacao();
        } else if (id === 'painel') {
            if (typeof renderizarKanban === 'function') renderizarKanban();
        } else if (id === 'comercial') {
            if (typeof renderizarReservasAtivas === 'function') renderizarReservasAtivas();
            if (typeof renderizarConfirmacaoComercial === 'function') renderizarConfirmacaoComercial();
        } else if (id === 'meusPedidos') {
            if (typeof renderizarPedidosComercial === 'function') renderizarPedidosComercial();
            if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
            if (typeof atualizarDashboardComercial === 'function') atualizarDashboardComercial();
            if (typeof renderizarLiberacoesComercial === 'function') renderizarLiberacoesComercial();
            if (typeof renderizarOcorrenciasComercial === 'function') renderizarOcorrenciasComercial();
        } else if (id === 'comercialPedidos' && typeof renderizarComercialPedidos === 'function') {
            renderizarComercialPedidos();
        } else if (id === 'comercialViagens' && typeof renderizarComercialViagens === 'function') {
            renderizarComercialViagens();
        } else if (id === 'cobranca' && typeof renderizarCobranca === 'function') {
            renderizarCobranca();
        } else if (id === 'faturamento') {
            if (typeof renderizarTabelaPrecos === 'function') renderizarTabelaPrecos();
            if (typeof abrirRelatorioFaturamento === 'function') abrirRelatorioFaturamento();
        } else if (id === 'conferencia' && typeof renderizarCentralConferencia === 'function') {
            renderizarCentralConferencia();
        } else if (id === 'equipes' && typeof renderizarEquipesPainel === 'function') {
            renderizarEquipesPainel();
        } else if (id === 'diretoria' && typeof renderizarDiretoria === 'function') {
            renderizarDiretoria();
        } else if (id === 'fiscal' && typeof renderizarEnvioDocsFiscal === 'function') {
            renderizarEnvioDocsFiscal();
        } else if (id === 'manutencao' && typeof carregarManutencao === 'function') {
            carregarManutencao();
        } else if (id === 'cadastros') {
            if (typeof renderizarListaClientes === 'function') renderizarListaClientes();
            if (typeof renderizarListaMotoristas === 'function') renderizarListaMotoristas();
            if (typeof renderizarListaVeiculos === 'function') renderizarListaVeiculos();
        } else if (id === 'visaoGlobal' && typeof renderizarVisaoGlobal === 'function') {
            renderizarVisaoGlobal();
        }
    } catch (e) {
        console.warn('refrescarTelaAtual:', e);
    }
}

/**
 * Após mutação em pedidos:
 * - se patch/ids → atualiza memória local (instantâneo)
 * - senão → reload LEVE só de pedidos + rotas
 * Nunca recarrega clientes/motoristas/veículos/etc. desnecessariamente.
 */
async function aposMutacaoPedidos(opts) {
    opts = opts || {};
    try {
        if (opts.forceFull) {
            await carregarDadosDoSupabase();
            refrescarTelaAtual();
            return;
        }
        if (opts.pedidosDoBanco) {
            const arr = Array.isArray(opts.pedidosDoBanco) ? opts.pedidosDoBanco : [opts.pedidosDoBanco];
            arr.forEach(function (p) { upsertPedidoLocal(p); });
            refrescarTelaAtual();
            return;
        }
        if (opts.ids && opts.patch) {
            const ids = Array.isArray(opts.ids) ? opts.ids : [opts.ids];
            ids.forEach(function (id) { atualizarPedidoLocal(id, opts.patch); });
            refrescarTelaAtual();
            return;
        }
        // fallback: só pedidos + rotas (muito mais rápido que reload completo)
        await carregarDadosDoSupabase({ somentePedidos: true });
        refrescarTelaAtual();
    } catch (e) {
        console.error('aposMutacaoPedidos:', e);
        try { await carregarDadosDoSupabase({ somentePedidos: true }); } catch (e2) {}
        refrescarTelaAtual();
    }
}


// ============================================
// UTILITÁRIOS
// ============================================

function exibirMensagem(elementId, texto, tipo) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = texto;
    el.className = 'message show ' + tipo;
    clearTimeout(el._timeoutId);
    el._timeoutId = setTimeout(() => el.classList.remove('show'), 5000);
}

