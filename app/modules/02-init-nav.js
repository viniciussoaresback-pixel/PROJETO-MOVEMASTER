/* ==========================================================================
   MODULE: 02-init-nav.js
   Inicialização e navegação
   Linhas originais: 277-382
   ========================================================================== */

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

