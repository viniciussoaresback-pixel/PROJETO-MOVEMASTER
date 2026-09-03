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

// ===== Helpers universais de documento (CNPJ/CPF) =====
// Comparação SEMPRE por dígitos: "22.941.518/0001-62" === "22941518000162".
function _soDigitos(v){ return String(v||'').replace(/\D/g,''); }
function _docsIguais(a, b){
  const da = _soDigitos(a), db = _soDigitos(b);
  return da.length > 0 && da === db;
}
// true se algum documento (cnpj/cpf) do cliente casa com o termo digitado (por dígitos)
function _clienteTemDoc(c, termo){
  const t = _soDigitos(termo);
  if (!t) return false;
  return _soDigitos(c.cnpj).includes(t) || _soDigitos(c.cpf).includes(t);
}
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
            // Recarga COMPLETA de verdade: clientes, motoristas, veículos, pedidos, etc.
            // (antes recarregava só pedidos, por isso cadastros novos de cliente/motorista/
            //  veículo não apareciam sem sair e voltar da página.)
            try { await carregarDadosDoSupabase(); }
            catch(e){ try { await carregarDadosDoSupabase({ somentePedidos: true }); } catch(_){} }
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

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    if (typeof inicializarSupabase === 'function') inicializarSupabase();
    inicializarAplicacao();
});

function inicializarAplicacao() {
    carregarEstadosIBGE();
    carregarDadosDoSupabase();

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', trocarAba);
    });

    const formComercial = document.getElementById('formComercial');
    if (formComercial) formComercial.addEventListener('submit', salvarPedidoComercial);

    const ufOrigem = document.getElementById('ufOrigem');
    const ufDestino = document.getElementById('ufDestino');
    if (ufOrigem) ufOrigem.addEventListener('change', function() { carregarCidadesIBGE(this.value, 'cidadeOrigem'); });
    if (ufDestino) ufDestino.addEventListener('change', function() { carregarCidadesIBGE(this.value, 'cidadeDestino'); });

    const btnCarregarPainel = document.getElementById('btnCarregarPainel');
    if (btnCarregarPainel) btnCarregarPainel.addEventListener('click', carregarPainel);

    const btnCarregarPedidos = document.getElementById('btnCarregarPedidos');
    if (btnCarregarPedidos) btnCarregarPedidos.addEventListener('click', carregarLogistica);

    const btnCarregarFaturamento = document.getElementById('btnCarregarFaturamento');
    if (btnCarregarFaturamento) btnCarregarFaturamento.addEventListener('click', carregarFaturamento);

    configurarModal();

    const formLogistica = document.getElementById('formLogistica');
    if (formLogistica) formLogistica.addEventListener('submit', salvarAlteracoesLogistica);

    const formAlocacao = document.getElementById('formAlocacao');
    if (formAlocacao) formAlocacao.addEventListener('submit', confirmarAlocacao);

    const formCadastroCliente = document.getElementById('formCadastroCliente');
    if (formCadastroCliente) formCadastroCliente.addEventListener('submit', salvarCadastroCliente);

    const formCadastroMotorista = document.getElementById('formCadastroMotorista');
    if (formCadastroMotorista) formCadastroMotorista.addEventListener('submit', salvarCadastroMotorista);

    const formCadastroVeiculo = document.getElementById('formCadastroVeiculo');
    if (formCadastroVeiculo) formCadastroVeiculo.addEventListener('submit', salvarCadastroVeiculo);

    preencherSelects();
    aplicarMascaras();

    // Verificar notificações a cada minuto
    setInterval(verificarNotificacoesColeta, 60000);
}

// ============================================
// NAVEGAÇÃO
// ============================================

function trocarAba(event) {
    const tabAlvo = event.currentTarget.getAttribute('data-tab');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    event.currentTarget.classList.add('active');
    const secao = document.getElementById(tabAlvo);
    if (secao) secao.classList.add('active');
    if (tabAlvo === 'diretoria') renderizarDiretoria();
    if (tabAlvo === 'visaoGlobal' && typeof renderizarVisaoGlobal === 'function') renderizarVisaoGlobal();
    if (tabAlvo === 'comercialPedidos' && typeof renderizarComercialPedidos === 'function') renderizarComercialPedidos();
    if (tabAlvo === 'comercialViagens' && typeof renderizarComercialViagens === 'function') renderizarComercialViagens();
    if (tabAlvo === 'fiscal' && typeof renderizarEnvioDocsFiscal === 'function') renderizarEnvioDocsFiscal();
    if (tabAlvo === 'orcamento') prepararOrcamento();

    if (tabAlvo === 'painel') carregarPainel();
    if (tabAlvo === 'logistica') carregarLogistica();
    if (tabAlvo === 'manutencao' && typeof carregarManutencao === 'function') carregarManutencao();
    if (tabAlvo === 'faturamento' && typeof renderizarSolicitacoesEPI === 'function') renderizarSolicitacoesEPI();
    if (tabAlvo === 'faturamento'){
        if (typeof renderizarTabelaPrecos === 'function') renderizarTabelaPrecos();
        const wrap = document.getElementById('faturamentoHistoricoCargas');
        if (wrap && typeof _histCargasCasca === 'function'){ wrap.innerHTML = _histCargasCasca(); renderizarHistoricoCargas('historicoCargasWrap'); }
        if (typeof abrirRelatorioFaturamento === 'function') abrirRelatorioFaturamento();
    }
    if (tabAlvo === 'comercial' && typeof renderizarReservasAtivas === 'function') { renderizarReservasAtivas(); iniciarTickReservas(); if (typeof renderizarConfirmacaoComercial === 'function') renderizarConfirmacaoComercial(); if (typeof popularResponsaveisComercial === 'function') popularResponsaveisComercial(); }
    if (tabAlvo === 'cadastros' && typeof carregarCorredores === 'function') { carregarCorredores(); if (typeof renderizarEquipesEntrega === 'function') renderizarEquipesEntrega(); if (typeof inicializarCadastrosSubabas === 'function') inicializarCadastrosSubabas(); }
    if (tabAlvo === 'cadastros') { renderizarListaClientes(); renderizarListaMotoristas(); renderizarListaVeiculos(); }
    if (tabAlvo === 'equipes' && typeof renderizarEquipesPainel === 'function') renderizarEquipesPainel();
    if (tabAlvo === 'cobranca' && typeof renderizarCobranca === 'function') renderizarCobranca();
    if (tabAlvo === 'conferencia' && typeof renderizarCentralConferencia === 'function') renderizarCentralConferencia();
    if (tabAlvo === 'tabelaFrete' && typeof renderizarTabelaFrete === 'function') renderizarTabelaFrete();
    if (tabAlvo === 'remunTrecho' && typeof renderizarTabelaPrecos === 'function') renderizarTabelaPrecos();
    if (tabAlvo === 'relatoriosFin' && typeof renderizarRelatorioFaturamento === 'function') renderizarRelatorioFaturamento();
    if (tabAlvo === 'epiUniforme' && typeof renderizarSolicitacoesEPI === 'function') renderizarSolicitacoesEPI();
    if (tabAlvo === 'meusPedidos') {
        renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
        atualizarDashboardComercial();
        if (typeof renderizarLiberacoesComercial === 'function') renderizarLiberacoesComercial();
        if (typeof renderizarOcorrenciasComercial === 'function') renderizarOcorrenciasComercial();
    }
    if (typeof _initCardsMinimizaveis === 'function') setTimeout(() => _initCardsMinimizaveis(secao), 200);
}

// ============================================
// ESTADOS E CIDADES (IBGE)
// ============================================

async function carregarEstadosIBGE() {
    try {
        const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        if (!resp.ok) throw new Error();
        estadosBrasil = await resp.json();
        preencherSelectEstados();
    } catch {
        carregarEstadosManual();
    }
}

function carregarEstadosManual() {
    estadosBrasil = [
        {sigla:'AC',nome:'Acre'},{sigla:'AL',nome:'Alagoas'},{sigla:'AM',nome:'Amazonas'},
        {sigla:'BA',nome:'Bahia'},{sigla:'CE',nome:'Ceará'},{sigla:'DF',nome:'Distrito Federal'},
        {sigla:'ES',nome:'Espírito Santo'},{sigla:'GO',nome:'Goiás'},{sigla:'MA',nome:'Maranhão'},
        {sigla:'MG',nome:'Minas Gerais'},{sigla:'MS',nome:'Mato Grosso do Sul'},{sigla:'MT',nome:'Mato Grosso'},
        {sigla:'PA',nome:'Pará'},{sigla:'PB',nome:'Paraíba'},{sigla:'PE',nome:'Pernambuco'},
        {sigla:'PI',nome:'Piauí'},{sigla:'PR',nome:'Paraná'},{sigla:'RJ',nome:'Rio de Janeiro'},
        {sigla:'RN',nome:'Rio Grande do Norte'},{sigla:'RO',nome:'Rondônia'},{sigla:'RR',nome:'Roraima'},
        {sigla:'RS',nome:'Rio Grande do Sul'},{sigla:'SC',nome:'Santa Catarina'},{sigla:'SE',nome:'Sergipe'},
        {sigla:'SP',nome:'São Paulo'},{sigla:'TO',nome:'Tocantins'}
    ];
    preencherSelectEstados();
}

function preencherSelectEstados() {
    ['ufOrigem','ufDestino'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione o estado</option>';
        estadosBrasil.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.sigla; opt.textContent = `${e.sigla} — ${e.nome}`;
            sel.appendChild(opt);
        });
    });
}

async function carregarCidadesIBGE(sigla, selectID) {
    if (!sigla) return;
    try {
        const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios?orderBy=nome`);
        if (!resp.ok) throw new Error();
        const cidades = await resp.json();
        preencherSelectCidades(cidades, selectID);
    } catch {
        const sel = document.getElementById(selectID);
        if (sel) { sel.innerHTML = '<option value="">Erro ao carregar cidades</option>'; }
    }
}

function preencherSelectCidades(cidades, selectID) {
    const sel = document.getElementById(selectID);
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a cidade</option>';
    cidades.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.nome; opt.textContent = c.nome;
        sel.appendChild(opt);
    });
}

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

// ============================================
// LANÇAMENTO COMERCIAL
// ============================================

// Item 1 — modal ao finalizar o lançamento: aguardando aprovação ou já aprovado
function _abrirModalAprovacaoLancamento(){
  const old = document.getElementById('modalAprovLanc'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalAprovLanc';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:10000';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:440px;width:92%;border-radius:14px;padding:24px">
      <h2 style="margin:0 0 6px">✅ Como registrar este pedido?</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1.2rem">Escolha se o pedido já entra aprovado no fluxo ou se fica aguardando aprovação.</p>
      <button class="aprov-opt" onclick="_confirmarAprovacaoLanc(true)">
        <div class="aprov-ic" style="background:rgba(34,197,94,.15)">✅</div>
        <div><div class="aprov-tit">Já aprovado</div><div class="aprov-sub">Entra direto nos corredores / sem rota para planejamento.</div></div>
      </button>
      <button class="aprov-opt" onclick="_confirmarAprovacaoLanc(false)">
        <div class="aprov-ic" style="background:rgba(245,158,11,.15)">⏳</div>
        <div><div class="aprov-tit">Aguardando aprovação</div><div class="aprov-sub">Fica numa área separada até alguém (comercial ou logística) aprovar.</div></div>
      </button>
      <button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="document.getElementById('modalAprovLanc').remove()">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
}

function _confirmarAprovacaoLanc(aprovado){
  window._lancamentoJaAprovado = aprovado;
  window._lancamentoAprovacaoEscolhida = true;
  document.getElementById('modalAprovLanc')?.remove();
  // dispara o submit de novo, agora com a escolha feita
  const form = document.getElementById('formComercial');
  if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable:true}));
}

// ============================================================
// IMPORTAÇÃO DE CARGAS DO EVO APP (Excel)
// ============================================================
let _evoPreview = null; // dados processados aguardando confirmação

function _evoArquivoSelecionado(event){
  const file = event.target.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined'){ alert('Biblioteca de leitura de Excel não carregou. Recarregue a página (Ctrl+Shift+R) e tente de novo.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
      _evoProcessar(linhas);
    } catch(err){ alert('Não consegui ler a planilha: '+(err.message||err)); }
    event.target.value = ''; // permite reimportar o mesmo arquivo
  };
  reader.readAsArrayBuffer(file);
}

// Índice das colunas do Evo (baseado no cabeçalho da linha 2)
function _evoMapCols(header){
  const idx = {};
  header.forEach((nome, i) => { if (nome) idx[String(nome).trim()] = i; });
  return idx;
}

function _evoProcessar(linhas){
  // linha 0 = grupos, linha 1 = cabeçalho real, dados a partir da linha 2
  if (!linhas || linhas.length < 3){ alert('Planilha vazia ou fora do formato esperado.'); return; }
  const H = _evoMapCols(linhas[1]);
  const col = (nome) => H[nome];
  const get = (row, nome) => { const c = col(nome); return c!=null ? row[c] : null; };

  // agrupa por ID (pregão) — cada ID = 1 pedido com N carros
  const grupos = {};
  for (let r = 2; r < linhas.length; r++){
    const row = linhas[r];
    if (!row) continue;
    const placa = get(row, 'PLACA/CÓD.') || get(row, 'LOCALIZADOR');
    if (!placa) continue;
    const idPedido = get(row, 'ID') || placa;
    if (!grupos[idPedido]) grupos[idPedido] = [];
    grupos[idPedido].push({
      placa: String(placa).trim(),
      localizador: get(row,'LOCALIZADOR'),
      modelo: get(row,'MODELO') || '',
      valorVeiculo: get(row,'VALOR DO VEÍCULO (R$)'),
      frete: parseFloat(get(row,'TRANSPORTE (R$)')) || null,
      embarcador: get(row,'EMBARCADOR (NOME)') || '',
      embarcadorDoc: get(row,'TOMADOR (CPF/CNPJ)') || get(row,'EMBARCADOR (CPF/CNPJ)') || '',
      colLocal: get(row,'LOCAL'), colRua: get(row,'RUA'), colNum: get(row,'NÚMERO'),
      colBairro: get(row,'BAIRRO'), colCidade: get(row,'CIDADE'), colUf: get(row,'UF'),
      colCep: get(row,'CEP'), colCnpj: get(row,'CPF/CNPJ'), colContato: get(row,'CONTATO'), colTel: get(row,'TELEFONE'),
      entLocal: get(row,'LOCAL (1)'), entRua: get(row,'RUA (1)'), entNum: get(row,'NÚMERO (1)'),
      entBairro: get(row,'BAIRRO (1)'), entCidade: get(row,'CIDADE (1)'), entUf: get(row,'UF (1)'),
      entCep: get(row,'CEP (1)'), entCnpj: get(row,'CPF/CNPJ (1)'),
      dtLancamento: get(row,'DT. LANÇAMENTO')
    });
  }

  const pedidos = Object.keys(grupos).map(id => {
    const carros = grupos[id];
    const ref = carros[0];
    const dupCarros = carros.filter(c => (pedidosGlobais||[]).some(p =>
      _norm(p.placa||'') === _norm(c.placa) && _norm(p.cidadeDestino||'') === _norm(c.entCidade||'')));
    return { id, carros, ref, duplicado: dupCarros.length };
  });

  _evoPreview = pedidos;
  _evoAbrirPreview(pedidos);
}

function _evoAbrirPreview(pedidos){
  const totalCarros = pedidos.reduce((s,p)=>s+p.carros.length,0);
  const comDup = pedidos.filter(p => p.duplicado > 0).length;
  const old = document.getElementById('evoPreviewOverlay'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'evoPreviewOverlay';
  div.className = 'evo-overlay';
  div.innerHTML = `
    <div class="evo-bg" onclick="document.getElementById('evoPreviewOverlay').remove()"></div>
    <div class="evo-painel">
      <div class="evo-head">
        <div>
          <h2 style="margin:0">📥 Importar do Evo — prévia</h2>
          <p class="text-muted" style="font-size:.85rem;margin:.3rem 0 0">${pedidos.length} pedido(s) · ${totalCarros} carro(s)${comDup?` · <span style="color:#f59e0b">⚠️ ${comDup} possível(is) duplicado(s)</span>`:''}</p>
        </div>
        <button class="evo-x" onclick="document.getElementById('evoPreviewOverlay').remove()">✕</button>
      </div>
      <div class="evo-lista">
        ${pedidos.map((p,i) => {
          const c = p.ref;
          const semCliente = !c.embarcador;
          const semDestino = !c.entCidade;
          const problema = semCliente || semDestino;
          return `<div class="evo-ped ${p.duplicado?'evo-dup':''}">
            <label class="evo-ped-head">
              <input type="checkbox" class="evo-chk" data-idx="${i}" ${problema?'':'checked'}>
              <span class="evo-ped-id">${p.id}</span>
              <span class="evo-ped-badge">🔗 ${p.carros.length} carro(s)</span>
              ${p.duplicado?`<span class="evo-dup-badge">⚠️ ${p.duplicado} já existe(m)</span>`:''}
              ${problema?`<span class="evo-prob-badge">⚠️ ${semCliente?'sem cliente':''}${semCliente&&semDestino?' / ':''}${semDestino?'sem destino':''}</span>`:''}
            </label>
            <div class="evo-ped-info">
              <div>👤 <strong>${c.embarcador||'—'}</strong> ${c.embarcadorDoc?`· ${c.embarcadorDoc}`:''}</div>
              <div>📍 ${c.colCidade||'—'}/${c.colUf||''} → 🏁 ${c.entCidade||'—'}/${c.entUf||''}</div>
              <div class="text-muted" style="font-size:.78rem">🚗 ${p.carros.map(x=>x.placa).join(', ')}</div>
              <div class="text-muted" style="font-size:.78rem">${c.modelo||'sem modelo'} · frete: ${c.frete?('R$ '+c.frete.toLocaleString('pt-BR')):'a preencher'}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="evo-actions">
        <button class="btn btn-primary" onclick="_evoConfirmarImportacao()">✅ Importar selecionados</button>
        <button class="btn btn-secondary" onclick="document.getElementById('evoPreviewOverlay').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Converte a data do Evo (texto dd/mm/aaaa, ou serial do Excel) para ISO
function _evoParseData(v){
  if (!v) return null;
  // número serial do Excel (dias desde 1899-12-30)
  if (typeof v === 'number'){
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString();
  }
  const s = String(v).trim();
  // formato dd/mm/aaaa (com ou sem hora)
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m){ const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`); return isNaN(d)?null:d.toISOString(); }
  // formato aaaa-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m){ const d = new Date(s); return isNaN(d)?null:d.toISOString(); }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

async function _evoConfirmarImportacao(){
  console.log('%c[Evo Import v257] iniciando — grupo_id via UUID','color:#ff6a00;font-weight:bold');
  const marcados = [...document.querySelectorAll('.evo-chk:checked')].map(c => parseInt(c.getAttribute('data-idx')));
  if (marcados.length === 0){ alert('Selecione ao menos um pedido para importar.'); return; }
  const pedidos = marcados.map(i => _evoPreview[i]);
  const btn = document.querySelector('#evoPreviewOverlay .btn-primary');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Importando...'; }

  let criados = 0, clientesCriados = 0;
  window._evoErroMostrado = false;
  try {
    for (const ped of pedidos){
      const c = ped.ref;
      let clienteId = null, clienteNome = c.embarcador || '';
      if (c.embarcador){
        let cli = (clientesGlobais||[]).find(x =>
          (c.embarcadorDoc && _docsIguais(x.cnpj, c.embarcadorDoc)) || _norm(x.nome||'')===_norm(c.embarcador));
        if (!cli){
          const novoCli = {
            nome: c.embarcador, cnpj: c.embarcadorDoc || null, tipo_cliente: 'empresa',
            cidade: c.colCidade || null, uf: c.colUf || null,
            endereco: c.colRua || null, numero: c.colNum ? String(c.colNum) : null,
            bairro: c.colBairro || null, cep: c.colCep || null,
            telefone: c.colTel || null
          };
          const { data, error: errCli } = await supabase.from('clientes').insert(novoCli).select();
          if (errCli){ console.error('Evo import erro no cliente', c.embarcador, errCli); }
          if (data && data[0]){ cli = data[0]; clientesGlobais.push(cli); clientesCriados++; }
        }
        if (cli){ clienteId = cli.id; clienteNome = cli.nome; }
      }
      const grupoId = ped.carros.length > 1 ? (typeof gerarGrupoId === 'function' ? gerarGrupoId() : (crypto.randomUUID ? crypto.randomUUID() : null)) : null;
      for (const carro of ped.carros){
        const novoPedido = {
          cliente: clienteNome, cliente_id: clienteId,
          modelo: carro.modelo || '', placa: carro.placa,
          referencia: String(ped.id||''),
          cidade_origem: c.colCidade || null, uf_origem: c.colUf || null,
          cidade_destino: c.entCidade || null, uf_destino: c.entUf || null,
          endereco_coleta: [c.colRua, c.colNum, c.colBairro].filter(Boolean).join(', ') || null,
          endereco_entrega: [c.entRua, c.entNum, c.entBairro].filter(Boolean).join(', ') || null,
          cnpj_coleta: c.colCnpj ? String(c.colCnpj) : null,
          cnpj_entrega: c.entCnpj ? String(c.entCnpj) : null,
          cep_coleta: c.colCep ? String(c.colCep) : null,
          cep_entrega: c.entCep ? String(c.entCep) : null,
          valor_frete: Number(carro.frete) || 0,
          data_solicitacao: _evoParseData(c.dtLancamento) || new Date().toISOString(),
          status: 'Pendente',
          aprovado: true,
          aprovado_em: new Date().toISOString(),
          grupo_id: grupoId,
          origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
          criado_por_nome: 'Importado do Evo'
        };
        const { error } = await supabase.from('pedidos').insert(novoPedido);
        if (!error) criados++;
        else {
          console.error('Evo import erro no pedido', carro.placa, '| MENSAGEM:', error.message, '| DETALHES:', error.details, '| DICA:', error.hint, '| CODE:', error.code);
          console.error('Evo pedido que falhou:', JSON.stringify(novoPedido));
          if (!window._evoErroMostrado){
            window._evoErroMostrado = true;
            alert('Erro ao importar (primeiro pedido que falhou):\n\n'
              + 'Placa: '+carro.placa+'\n'
              + 'Mensagem: '+(error.message||'—')+'\n'
              + (error.details?('Detalhes: '+error.details+'\n'):'')
              + (error.hint?('Dica: '+error.hint):''));
          }
        }
      }
    }
    await recarregarPedidos();
    document.getElementById('evoPreviewOverlay')?.remove();
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(`✅ ${criados} carro(s) importado(s)!`);
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', `✅ Importação concluída: ${criados} carro(s)${clientesCriados?`, ${clientesCriados} cliente(s) novo(s)`:''}. Revise os pedidos se necessário.`, 'success');
  } catch(e){
    alert('Erro na importação: '+(e.message||e));
    if (btn){ btn.disabled = false; btn.textContent = '✅ Importar selecionados'; }
  }
}

async function salvarPedidoComercial(event) {
    event.preventDefault();

    // Item 1 — pergunta se o pedido já nasce aprovado ou aguardando aprovação
    if (window._lancamentoAprovacaoEscolhida !== true){
        _abrirModalAprovacaoLancamento();
        return;
    }
    window._lancamentoAprovacaoEscolhida = false; // reseta para o próximo

    // Item 1 — modo Reserva (fluxo leve, sem veículos, com timer)
    if (document.getElementById('pedidoReserva')?.checked) {
        return salvarReservaComercial();
    }

    const pedido = {
        cliente: document.getElementById('cliente').value,
        dataSolicitacao: document.getElementById('dataSolicitacao').value,
        prazoEntregaEstimado: document.getElementById('prazoEntregaEstimado')?.value || null,
        modelo: document.getElementById('modelo').value,
        placa: document.getElementById('placa').value,
        cidadeOrigem: document.getElementById('cidadeOrigem').value,
        categoriaVeiculo: document.getElementById('categoriaVeiculo')?.value || null,
        ufOrigem: document.getElementById('ufOrigem').value,
        cidadeDestino: document.getElementById('cidadeDestino').value,
        ufDestino: document.getElementById('ufDestino').value,
        enderecoColeta: document.getElementById('enderecoColeta').value,
        enderecoEntrega: document.getElementById('enderecoEntrega').value,
        valorFrete: valorMoedaParaFloat(document.getElementById('valorFrete').value),
        responsavelComercial: _getResponsavelComercial(),
        referencia: (document.getElementById('referenciaVeiculo1')?.value.trim() || document.getElementById('referenciaPedido')?.value.trim() || null),
        observacao: document.getElementById('observacaoPedido')?.value.trim() || null
    };

    if (!validarPedido(pedido)) {
        exibirMensagem('mensagemComercial', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    // Veículos adicionais do mesmo cliente (mesma origem/destino)
    const veiculosExtras = coletarVeiculosExtras();
    if (veiculosExtras === null) {
        exibirMensagem('mensagemComercial', 'Preencha modelo e placa de todos os veículos adicionais (ou remova a linha vazia).', 'error');
        return;
    }

    // Placas duplicadas no mesmo lançamento
    const todasPlacas = [pedido.placa.toUpperCase(), ...veiculosExtras.map(v => v.placa)];
    if (new Set(todasPlacas).size !== todasPlacas.length) {
        exibirMensagem('mensagemComercial', 'Há placas repetidas no mesmo lançamento. Verifique os veículos.', 'error');
        return;
    }

    if (supabase) {
        try {
            const dadosParaSalvar = {
                cliente: pedido.cliente,
                cliente_id: document.getElementById('clienteId')?.value ? parseInt(document.getElementById('clienteId').value) : null,
                data_solicitacao: pedido.dataSolicitacao,
                prazo_entrega_estimado: pedido.prazoEntregaEstimado,
                modelo: pedido.modelo,
                placa: pedido.placa,
                cidade_origem: pedido.cidadeOrigem,
                categoria_veiculo: pedido.categoriaVeiculo,
                uf_origem: pedido.ufOrigem,
                cidade_destino: pedido.cidadeDestino,
                uf_destino: pedido.ufDestino,
                cep_coleta: document.getElementById('cepColeta')?.value || null,
                endereco_coleta: pedido.enderecoColeta,
                cnpj_coleta: document.getElementById('cnpjColeta')?.value.trim() || null,
                cep_entrega: document.getElementById('cepEntrega')?.value || null,
                endereco_entrega: pedido.enderecoEntrega,
                cnpj_entrega: document.getElementById('cnpjEntrega')?.value.trim() || null,
                valor_frete: pedido.valorFrete,
                frete_tipo: document.getElementById('freteTipo')?.value || 'cheio',
                responsavel_comercial: pedido.responsavelComercial,
                referencia: pedido.referencia,
                observacao_pedido: pedido.observacao,
                tipo_entrega: document.getElementById('tipoEntregaPedido')?.value || 'patio',
                forma_coleta: document.getElementById('formaColeta')?.value || null,
                patio_coleta: (document.getElementById('formaColeta')?.value === 'patio') ? (document.getElementById('patioColeta')?.value || null) : null,
                equipe_coleta_id: (document.getElementById('formaColeta')?.value === 'coletador') ? (parseInt(document.getElementById('equipeColeta')?.value) || null) : null,
                obs_coleta: document.getElementById('obsColeta')?.value.trim() || null,
                origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
                criado_por_nome: (document.getElementById('usuarioLogado')?.textContent || null),
                corredor_manual_id: (parseInt(document.getElementById('pedidoCorredor')?.value) || null),
                aprovado: (window._lancamentoJaAprovado === true),
                aprovado_em: (window._lancamentoJaAprovado === true) ? new Date().toISOString() : null,
                aprovado_por: (window._lancamentoJaAprovado === true) ? (document.getElementById('usuarioLogado')?.textContent || null) : null,
                status: 'Pendente'
            };

            // ===== Cálculo do frete conforme o tipo (por carro x frete cheio) =====
            const _freteTipo = document.getElementById('freteTipo')?.value || 'cheio';
            const _valorBase = Number(dadosParaSalvar.valor_frete) || 0;
            const _qtdCarros = 1 + veiculosExtras.length;
            let _valoresCarro; // valor de frete de cada carro (índice 0 = principal)
            if (_freteTipo === 'cheio') {
                // "frete cheio" = total da carga; divide entre os carros (total é a verdade)
                const base = Math.floor((_valorBase / _qtdCarros) * 100) / 100;
                _valoresCarro = Array(_qtdCarros).fill(base);
                const resto = Math.round((_valorBase - base * _qtdCarros) * 100) / 100;
                _valoresCarro[_qtdCarros - 1] = Math.round((base + resto) * 100) / 100; // última linha absorve o centavo
            } else {
                // "por carro" = valor unitário; cada carro usa o seu (ou o principal)
                _valoresCarro = [_valorBase];
                veiculosExtras.forEach(v => _valoresCarro.push(v.valorFrete !== null ? v.valorFrete : _valorBase));
            }

            // Monta 1 pedido por veículo; se houver mais de 1, vincula por grupo_id
            let linhasParaInserir;
            if (veiculosExtras.length > 0) {
                const grupoId = gerarGrupoId();
                linhasParaInserir = [
                    { ...dadosParaSalvar, valor_frete: _valoresCarro[0], grupo_id: grupoId },
                    ...veiculosExtras.map((v, i) => ({
                        ...dadosParaSalvar,
                        modelo: v.modelo,
                        placa: v.placa,
                        categoria_veiculo: v.categoriaVeiculo || dadosParaSalvar.categoria_veiculo || null,
                        valor_frete: _valoresCarro[i + 1],
                        referencia: v.referencia || dadosParaSalvar.referencia,
                        endereco_coleta:  v.enderecoColeta  || dadosParaSalvar.endereco_coleta,
                        endereco_entrega: v.enderecoEntrega || dadosParaSalvar.endereco_entrega,
                        grupo_id: grupoId
                    }))
                ];
            } else {
                linhasParaInserir = [{ ...dadosParaSalvar, valor_frete: _valoresCarro[0] }];
            }

            const { error } = await supabase.from('pedidos').insert(linhasParaInserir);
            if (error) throw error;

            await recarregarPedidos();
            const qtd = linhasParaInserir.length;
            exibirMensagem('mensagemComercial',
                qtd > 1 ? `✅ ${qtd} pedidos salvos com sucesso (1 por veículo, mesmo grupo)!` : '✅ Pedido salvo com sucesso!',
                'success');

            // Avisa a logística que chegou pedido novo
            notificar({
                perfil: 'logistica', tipo: 'acao',
                titulo: qtd > 1 ? `Nova ${nomenclaturaCarga(qtd)}: ${qtd} carros` : 'Novo pedido para alocar',
                mensagem: `${pedido.cliente} · ${pedido.cidadeOrigem}/${pedido.ufOrigem} → ${pedido.cidadeDestino}/${pedido.ufDestino}`
            });
            document.getElementById('formComercial').reset();
            limparVeiculosExtras();
            await carregarPainel();
            await carregarFaturamento();
            renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
        } catch (error) {
            console.error('Erro ao salvar pedido:', error, '| details:', error.details, '| hint:', error.hint, '| code:', error.code);
            exibirMensagem('mensagemComercial', 'Erro ao salvar: ' + (error.message||'') + (error.details?(' — '+error.details):''), 'error');
        }
    } else {
        pedidosGlobais.push(pedido);
        exibirMensagem('mensagemComercial', 'Pedido salvo localmente!', 'success');
        document.getElementById('formComercial').reset();
    }
}

function validarPedido(pedido) {
    return pedido.cliente && pedido.dataSolicitacao && pedido.modelo && pedido.placa &&
           pedido.cidadeOrigem && pedido.ufOrigem && pedido.cidadeDestino && pedido.ufDestino &&
           pedido.enderecoColeta && pedido.enderecoEntrega && pedido.valorFrete;
}

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
