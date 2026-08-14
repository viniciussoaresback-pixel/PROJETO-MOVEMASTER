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
let entregasLastMileGlobais = [];
let estadosBrasil = [];
let cidadesPorEstado = {};
let notificacoesEnviadas = new Set();
// Mapa pedidoId -> { emitido: true/false, numero: 'XXXX' } derivado dos espelhos fiscais.
// Populado por carregarMapaCTE(); usado por cteInfoDoPedido() nas telas.
let ctePorPedido = {};

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
    if (tabAlvo === 'orcamento') prepararOrcamento();

    if (tabAlvo === 'painel') carregarPainel();
    if (tabAlvo === 'logistica') carregarLogistica();
    if (tabAlvo === 'manutencao' && typeof carregarManutencao === 'function') carregarManutencao();
    if (tabAlvo === 'faturamento' && typeof renderizarSolicitacoesEPI === 'function') renderizarSolicitacoesEPI();
    if (tabAlvo === 'faturamento'){
        const wrap = document.getElementById('faturamentoHistoricoCargas');
        if (wrap && typeof _histCargasCasca === 'function'){ wrap.innerHTML = _histCargasCasca(); renderizarHistoricoCargas('historicoCargasWrap'); }
    }
    if (tabAlvo === 'comercial' && typeof renderizarReservasAtivas === 'function') { renderizarReservasAtivas(); iniciarTickReservas(); if (typeof renderizarConfirmacaoComercial === 'function') renderizarConfirmacaoComercial(); if (typeof popularResponsaveisComercial === 'function') popularResponsaveisComercial(); }
    if (tabAlvo === 'cadastros' && typeof carregarCorredores === 'function') { carregarCorredores(); if (typeof renderizarEquipesEntrega === 'function') renderizarEquipesEntrega(); if (typeof inicializarCadastrosSubabas === 'function') inicializarCadastrosSubabas(); }
    if (tabAlvo === 'cadastros') { renderizarListaClientes(); renderizarListaMotoristas(); renderizarListaVeiculos(); }
    if (tabAlvo === 'equipes' && typeof renderizarEquipesPainel === 'function') renderizarEquipesPainel();
    if (tabAlvo === 'cobranca' && typeof renderizarCobranca === 'function') renderizarCobranca();
    if (tabAlvo === 'meusPedidos') {
        renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
        atualizarDashboardComercial();
        if (typeof renderizarLiberacoesComercial === 'function') renderizarLiberacoesComercial();
        if (typeof renderizarOcorrenciasComercial === 'function') renderizarOcorrenciasComercial();
    }
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
          resRotas, resAgs, resEmg, resEps, resPar, resCors, resParadas, resEq, resEn
        ] = await Promise.all([
          supabase.from('rotas_planejadas').select('*').order('data_saida', { ascending: true }),
          supabase.from('agendamentos_manutencao').select('*').order('data_hora', { ascending: true }),
          supabase.from('paradas_emergencia').select('*').order('created_at', { ascending: false }),
          supabase.from('solicitacoes_epi').select('motorista_id,motorista_nome,status').eq('status','pendente'),
          supabase.from('parametros_sistema').select('valor').eq('chave','reserva_timer_minutos').maybeSingle(),
          supabase.from('corredores').select('*').order('nome'),
          supabase.from('corredor_paradas').select('*').order('ordem'),
          supabase.from('equipes_entrega').select('*').order('nome'),
          supabase.from('entregas_last_mile').select('*').order('created_at', { ascending:false })
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
                transbordoEm: p.transbordo_em || null,
                patioAtual: p.patio_atual || null,
                corredorManualId: p.corredor_manual_id || null,
                cobrancaStatus: p.cobranca_status || 'a_cobrar',
                cobrancaForma: p.cobranca_forma || null,
                cobradoEm: p.cobrado_em || null,
                pagoEm: p.pago_em || null,
                pagtoConfirmadoEm: p.pagto_confirmado_em || null,
                patioDesde: p.patio_desde || null,
                grupoId: p.grupo_id || null,
                rotaId: p.rota_id || null,
                tipoEntrega: p.tipo_entrega || 'patio',
                fluxoEntrega: p.fluxo_entrega || null,
                equipeEntregaId: p.equipe_entrega_id || null,
                coletaEquipeEm: p.coleta_equipe_em || null,
                coletaEquipePor: p.coleta_equipe_por || null,
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
            <div class="form-group" style="max-width:180px">
                <label>Categoria *</label>
                <select class="veiculo-extra-categoria">
                    <option value="">Selecione...</option>
                    <option value="hatch">Hatch</option>
                    <option value="sedan">Sedan</option>
                    <option value="suv">SUV</option>
                    <option value="caminhonete">Caminhonete</option>
                    <option value="moto">Moto</option>
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
        if (!modelo && !placa) continue; // linha vazia, ignora
        if (!modelo || !placa) return null; // linha incompleta
        veiculos.push({
            modelo,
            placa,
            categoriaVeiculo: categoria || null,
            valorFrete: valorStr ? valorMoedaParaFloat(valorStr) : null,
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

async function salvarPedidoComercial(event) {
    event.preventDefault();

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
        referencia: document.getElementById('referenciaPedido')?.value.trim() || null,
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
                origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
                criado_por_nome: (document.getElementById('usuarioLogado')?.textContent || null),
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
            console.error('Erro ao salvar pedido:', error);
            exibirMensagem('mensagemComercial', 'Erro ao salvar: ' + error.message, 'error');
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
    if (supabase) {
        try { await carregarDadosDoSupabase(); } catch(e) {}
    }
    renderizarKanban();
    verificarNotificacoesColeta();
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
    if (supabase) {
        try { await carregarDadosDoSupabase(); } catch(e) {}
    }
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
    if (!confirm(`Alocar a carga fechada na cegonha ${veiculo.placa}?\n\n${resumo}\n\nFicará com ${emUso + itens.length}/${capacidade} vagas ocupadas.`)) return;

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
                observacao: `📦 Alocado como carga fechada (${itens.length} carros) na cegonha ${veiculo.placa}`
            });
        }

        await carregarDadosDoSupabase();
        renderizarPedidosDrag();
        renderizarVeiculosDrop();
        if (typeof renderizarOcupacao === 'function') renderizarOcupacao();
        notificar({
            perfil: 'comercial', nome: p0.responsavelComercial, pedidoId: p0.id, tipo: 'status',
            titulo: `📦 Sua carga fechada foi alocada (${itens.length} carros)`,
            mensagem: `${p0.cliente} · cegonha ${veiculo.placa} — só para você saber. Você será chamado para liberar a coleta.`
        });

        exibirMensagem('mensagemLogistica', `✅ Carga fechada de ${itens.length} carros alocada na ${veiculo.placa}.`, 'success');
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
                ${cfgStatus?.proximos?.length > 0 ? `<button draggable="false" class="btn-acao-principal" onclick="event.stopPropagation();event.preventDefault();abrirModalStatus(${p.id})">Avançar</button>` : '<span></span>'}
                ${montarMenuAcoes(p.id, [
                    p.status === 'Pendente' ? { label: 'A definir', icone: '⏳', onclick: `registrarIntencaoADefinir(${p.id})` } : null,
                    { label: 'Histórico', icone: '🕘', onclick: `abrirHistorico(${p.id})` },
                    ['Em Coleta','Em Transporte'].includes(p.status) ? { label: 'Ocorrência', icone: '⚠️', onclick: `abrirRegistrarOcorrencia(${p.id})` } : null,
                    p.status === 'Pendente' ? { label: 'Cancelar', icone: '🚫', onclick: `cancelarPedido(${p.id})`, classe: 'menu-acao-alerta' } : null,
                    p.status === 'Pendente' ? { label: 'Excluir', icone: '🗑️', onclick: `excluirPedido(${p.id})`, classe: 'menu-acao-perigo' } : null
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
            await carregarDadosDoSupabase();
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
            await carregarDadosDoSupabase();
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
    if (supabase) { try { await carregarDadosDoSupabase(); } catch (e) {} }

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
    if (supabase) { try { await carregarDadosDoSupabase(); } catch (e) {} }
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
            exibirMensagem('mensagemCadastroCliente', `CNPJ já cadastrado para: ${existeCnpj.nome}`, 'error');
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
                nome, cnpj, cpf, telefone, email,
                inscricao_estadual: inscricaoEstadual,
                tipo_cliente: tipo,
                tipo_entrega_padrao: document.getElementById('tipoEntregaPadrao')?.value || 'patio',
                cep, endereco, numero, complemento, bairro, cidade, uf,
                codigo
            });
            if (error) throw error;
            await carregarDadosDoSupabase();
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

function toggleCardLista(alvo) {
    const corpo = document.getElementById('corpo_' + alvo);
    const ctrl  = document.getElementById('ctrl_' + alvo);
    const chev  = document.getElementById('chev_' + alvo);
    if (!corpo) return;

    const aberto = corpo.style.display !== 'none';
    corpo.style.display = aberto ? 'none' : '';
    if (ctrl) ctrl.style.display = aberto ? 'none' : 'flex';
    if (chev) chev.textContent = aberto ? '▸' : '▾';

    // Lembra a preferência para não ter que reabrir toda vez
    try { localStorage.setItem('mm_lista_' + alvo, aberto ? 'fechado' : 'aberto'); } catch (e) {}

    // Ao abrir, garante que a lista está renderizada
    if (!aberto) {
        if (alvo === 'listaClientes'   && typeof renderizarListaClientes === 'function')   renderizarListaClientes();
        if (alvo === 'listaMotoristas' && typeof renderizarListaMotoristas === 'function') renderizarListaMotoristas();
        if (alvo === 'listaVeiculos'   && typeof renderizarListaVeiculos === 'function')   renderizarListaVeiculos();
        if (alvo === 'listaPedidosCom' && typeof renderizarPedidosComercial === 'function') renderizarPedidosComercial();
        if (typeof renderizarRotasComercial === 'function') renderizarRotasComercial();
    }
}

// Restaura o estado das listas (aberta/fechada) ao carregar a página
function restaurarEstadoListas() {
    ['listaClientes', 'listaMotoristas', 'listaVeiculos', 'listaPedidosCom'].forEach(alvo => {
        let pref = null;
        try { pref = localStorage.getItem('mm_lista_' + alvo); } catch (e) {}
        if (pref === 'aberto' && document.getElementById('corpo_' + alvo)) {
            toggleCardLista(alvo);   // estava aberta: abre de novo
        }
    });
}
document.addEventListener('DOMContentLoaded', restaurarEstadoListas);

// ============================================
// LISTAGEM E EDIÇÃO DE MOTORISTAS
// ============================================

function renderizarListaMotoristas() {
    const corpo = document.getElementById('corpoTabelaMotoristas');
    if (!corpo) return;

    const busca = (document.getElementById('buscaMotoristas')?.value || '').trim().toLowerCase();
    let lista = motoristasGlobais || [];
    if (busca) {
        lista = lista.filter(m =>
            `${m.nome||''} ${m.cpf||''} ${m.cnh||''} ${m.telefone||''} ${m.transportador||''}`
                .toLowerCase().includes(busca));
    }

    const cont = document.getElementById('contadorMotoristas');
    if (cont) cont.textContent = lista.length;

    if (lista.length === 0) {
        corpo.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${busca ? 'Nenhum motorista encontrado.' : 'Nenhum motorista cadastrado ainda.'}</td></tr>`;
        return;
    }

    corpo.innerHTML = lista.map(m => {
        const terceiro = m.vinculo === 'terceiro';
        return `
        <tr>
            <td data-label="Motorista"><span class="ocup-cliente">${m.nome || '—'}</span></td>
            <td data-label="CPF" class="ocup-sub">${m.cpf || '—'}</td>
            <td data-label="CNH" class="ocup-sub">${m.cnh || '—'}</td>
            <td data-label="Telefone" class="ocup-sub">${m.telefone || '—'}</td>
            <td data-label="Vínculo">
                ${terceiro
                    ? `<span class="badge-terceiro">🤝 Terceiro</span>${m.transportador ? `<br><span class="ocup-sub">${m.transportador}</span>` : ''}`
                    : '<span class="ocup-sub">🏢 Próprio</span>'}
            </td>
            <td data-label="Ações" class="ocup-acoes-cell">
                <button class="btn-kanban-editar" onclick="abrirEdicaoMotorista('${m.id}')" title="Editar">✏️</button>
                <button class="btn-kanban-excluir" onclick="excluirMotorista('${m.id}')" title="Excluir">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function abrirEdicaoMotorista(motoristaId) {
    const m = (motoristasGlobais || []).find(x => String(x.id) === String(motoristaId));
    if (!m) return;
    const existing = document.getElementById('modalEdicaoMotorista');
    if (existing) existing.remove();

    const terceiro = m.vinculo === 'terceiro';
    const modal = document.createElement('div');
    modal.id = 'modalEdicaoMotorista';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:560px">
            <span class="close" onclick="document.getElementById('modalEdicaoMotorista').remove()">&times;</span>
            <h2>✏️ Editar Motorista</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Nome Completo *</label>
                    <input type="text" id="edMotNome" value="${(m.nome||'').replace(/"/g,'&quot;')}">
                </div>
                <div class="form-group">
                    <label>CPF *</label>
                    <input type="text" id="edMotCpf" value="${m.cpf||''}" maxlength="14" oninput="mascaraCPF(this)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Telefone</label>
                    <input type="tel" id="edMotTelefone" value="${m.telefone||''}" maxlength="15" oninput="mascaraTelefone(this)">
                </div>
                <div class="form-group">
                    <label>CNH</label>
                    <input type="text" id="edMotCnh" value="${m.cnh||''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Vínculo</label>
                    <select id="edMotVinculo" onchange="document.getElementById('edGrupoTransportador').style.display = this.value==='terceiro' ? '' : 'none'">
                        <option value="proprio" ${!terceiro ? 'selected' : ''}>🏢 Próprio (frota/CLT)</option>
                        <option value="terceiro" ${terceiro ? 'selected' : ''}>🤝 Terceiro / Agregado</option>
                    </select>
                </div>
                <div class="form-group" id="edGrupoTransportador" style="display:${terceiro ? '' : 'none'}">
                    <label>Transportador / Empresa</label>
                    <input type="text" id="edMotTransportador" value="${(m.transportador||'').replace(/"/g,'&quot;')}">
                </div>
            </div>
            <div id="mensagemEdicaoMotorista" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarEdicaoMotorista('${m.id}')">💾 Salvar alterações</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalEdicaoMotorista').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function salvarEdicaoMotorista(motoristaId) {
    const msgEl = document.getElementById('mensagemEdicaoMotorista');
    const nome = document.getElementById('edMotNome').value.trim();
    const cpf  = document.getElementById('edMotCpf').value.trim();
    if (!nome || !cpf) {
        msgEl.textContent = 'Nome e CPF são obrigatórios.';
        msgEl.className = 'message show error';
        return;
    }

    const anterior = (motoristasGlobais || []).find(x => String(x.id) === String(motoristaId));
    const vinculo = document.getElementById('edMotVinculo').value;
    const dados = {
        nome, cpf,
        telefone: document.getElementById('edMotTelefone').value.trim() || null,
        cnh: document.getElementById('edMotCnh').value.trim() || null,
        vinculo,
        transportador: vinculo === 'terceiro'
            ? (document.getElementById('edMotTransportador').value.trim() || null) : null
    };

    try {
        const { error } = await supabase.from('motoristas').update(dados).eq('id', motoristaId);
        if (error) throw error;

        // Se o nome mudou, atualiza os pedidos que referenciam o motorista pelo nome
        if (anterior && anterior.nome && anterior.nome !== nome) {
            await supabase.from('pedidos').update({ motorista_1: nome }).eq('motorista_1', anterior.nome);
            await supabase.from('pedidos').update({ motorista_2: nome }).eq('motorista_2', anterior.nome);
            await supabase.from('veiculos').update({ motorista_padrao: nome }).eq('motorista_padrao', anterior.nome);
        }

        document.getElementById('modalEdicaoMotorista').remove();
        await carregarDadosDoSupabase();
        renderizarListaMotoristas();
        exibirMensagem('mensagemCadastroMotorista', `✅ Motorista "${nome}" atualizado!`, 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

async function excluirMotorista(motoristaId) {
    const m = (motoristasGlobais || []).find(x => String(x.id) === String(motoristaId));
    if (!m) return;

    const emUso = pedidosGlobais.filter(p =>
        (p.motorista1 === m.nome || p.motorista2 === m.nome) && !['Entregue','Cancelado'].includes(p.status)
    );
    if (emUso.length > 0) {
        alert(`Não é possível excluir "${m.nome}": ele está alocado em ${emUso.length} pedido(s) em andamento.\n\nFinalize ou realoque esses pedidos antes de excluir.`);
        return;
    }

    if (!confirm(`Excluir o motorista "${m.nome}"?\n\nO histórico de pedidos antigos mantém o nome registrado.`)) return;

    try {
        const { error } = await supabase.from('motoristas').delete().eq('id', motoristaId);
        if (error) throw error;
        await carregarDadosDoSupabase();
        renderizarListaMotoristas();
        exibirMensagem('mensagemCadastroMotorista', `Motorista "${m.nome}" excluído.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemCadastroMotorista', 'Erro ao excluir: ' + e.message, 'error');
    }
}

// ============================================
// LISTAGEM E EDIÇÃO DE VEÍCULOS
// ============================================

function renderizarListaVeiculos() {
    const corpo = document.getElementById('corpoTabelaVeiculos');
    if (!corpo) return;

    const busca = (document.getElementById('buscaVeiculos')?.value || '').trim().toLowerCase();
    const filtroProp = document.getElementById('filtroPropriedadeVeiculos')?.value || '';

    let lista = veiculosGlobais || [];
    if (filtroProp === 'terceiro') lista = lista.filter(v => v.propriedade === 'terceiro');
    if (filtroProp === 'propria')  lista = lista.filter(v => v.propriedade !== 'terceiro');
    if (busca) {
        lista = lista.filter(v =>
            `${v.placa||''} ${v.marca||''} ${v.modelo||''} ${v.tipo||''} ${v.motorista_padrao||''} ${v.transportador_nome||''}`
                .toLowerCase().includes(busca));
    }

    const cont = document.getElementById('contadorVeiculos');
    if (cont) cont.textContent = lista.length;

    if (lista.length === 0) {
        corpo.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${busca || filtroProp ? 'Nenhum veículo encontrado.' : 'Nenhum veículo cadastrado ainda.'}</td></tr>`;
        return;
    }

    corpo.innerHTML = lista.map(v => {
        const terceiro = v.propriedade === 'terceiro';
        const emUso = pedidosGlobais.filter(p => p.placaCegonha === v.placa && !['Entregue','Cancelado'].includes(p.status)).length;
        return `
        <tr>
            <td data-label="Placa"><span class="ocup-cliente">${v.placa || '—'}</span>${emUso > 0 ? `<br><span class="ocup-sub">${emUso} carro(s) na carga</span>` : ''}</td>
            <td data-label="Tipo / Capacidade" class="ocup-sub">${v.tipo || '—'}<br>${v.capacidade || '—'} vaga(s)</td>
            <td data-label="Marca / Modelo" class="ocup-sub">${v.marca || '—'} ${v.modelo || ''}${v.ano ? `<br>${v.ano}` : ''}</td>
            <td data-label="Motorista padrão" class="ocup-sub">${v.motorista_padrao || '—'}</td>
            <td data-label="Propriedade">
                ${terceiro
                    ? `<span class="badge-terceiro">🤝 Terceiro</span>${v.transportador_nome ? `<br><span class="ocup-sub">${v.transportador_nome}</span>` : ''}`
                    : '<span class="ocup-sub">🏢 Própria</span>'}
            </td>
            <td data-label="Ações" class="ocup-acoes-cell">
                <button class="btn-kanban-editar" onclick="abrirEdicaoVeiculo('${v.id}')" title="Editar">✏️</button>
                <button class="btn-kanban-excluir" onclick="excluirVeiculo('${v.id}')" title="Excluir">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function abrirEdicaoVeiculo(veiculoId) {
    const v = (veiculosGlobais || []).find(x => String(x.id) === String(veiculoId));
    if (!v) return;
    const existing = document.getElementById('modalEdicaoVeiculo');
    if (existing) existing.remove();

    const terceiro = v.propriedade === 'terceiro';
    const tipos = ['Cegonha','Cavalo Simples 2 Eixos','Cavalo Simples 3 Eixos','Caminhão 3/4 2 Eixos','Guincho','Prancha'];
    const opcoesTipo = tipos.map(t => `<option value="${t}" ${v.tipo === t ? 'selected' : ''}>${t}</option>`).join('');
    const opcoesMot = ['<option value="">Sem motorista padrão</option>']
        .concat((motoristasGlobais || []).map(m =>
            `<option value="${m.nome}" ${v.motorista_padrao === m.nome ? 'selected' : ''}>${m.nome}${m.vinculo === 'terceiro' ? ' 🤝' : ''}</option>`)).join('');

    const modal = document.createElement('div');
    modal.id = 'modalEdicaoVeiculo';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:620px">
            <span class="close" onclick="document.getElementById('modalEdicaoVeiculo').remove()">&times;</span>
            <h2>✏️ Editar Veículo</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Placa *</label>
                    <input type="text" id="edVeiPlaca" value="${v.placa||''}" maxlength="8" style="text-transform:uppercase">
                </div>
                <div class="form-group">
                    <label>Tipo</label>
                    <select id="edVeiTipo">${opcoesTipo}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Capacidade (vagas)</label>
                    <input type="number" id="edVeiCapacidade" value="${v.capacidade||''}" min="1" max="20">
                    <label class="capacidade-excecao-lbl">
                        <input type="checkbox" id="edVeiCapacidadeExcecao" ${v.capacidade_excecao ? 'checked' : ''}>
                        Exceção de capacidade (acima de 11)
                    </label>
                </div>
                <div class="form-group">
                    <label>Motorista padrão</label>
                    <select id="edVeiMotorista">${opcoesMot}</select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Marca</label>
                    <input type="text" id="edVeiMarca" value="${(v.marca||'').replace(/"/g,'&quot;')}">
                </div>
                <div class="form-group">
                    <label>Modelo</label>
                    <input type="text" id="edVeiModelo" value="${(v.modelo||'').replace(/"/g,'&quot;')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="max-width:140px">
                    <label>Ano</label>
                    <input type="number" id="edVeiAno" value="${v.ano||''}" min="1990" max="2099">
                </div>
                <div class="form-group">
                    <label>RENAVAM</label>
                    <input type="text" id="edVeiRenavam" value="${v.renavam||''}" maxlength="11">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Chassi</label>
                    <input type="text" id="edVeiChassi" value="${v.chassi||''}" maxlength="17" style="text-transform:uppercase">
                </div>
                <div class="form-group">
                    <label>Propriedade</label>
                    <select id="edVeiPropriedade" onchange="ajustarEdicaoVeiculoTerceiro(this.value)">
                        <option value="propria" ${!terceiro ? 'selected' : ''}>🏢 Frota própria</option>
                        <option value="terceiro" ${terceiro ? 'selected' : ''}>🤝 Terceiro</option>
                    </select>
                </div>
            </div>
            <div id="edGrupoVeiTerceiro" style="display:${terceiro ? '' : 'none'}">
                <div class="form-row">
                    <div class="form-group">
                        <label>Transportador</label>
                        <input type="text" id="edVeiTransportador" value="${(v.transportador_nome||'').replace(/"/g,'&quot;')}">
                    </div>
                    <div class="form-group">
                        <label>Contato do transportador</label>
                        <input type="text" id="edVeiTransportadorContato" value="${(v.transportador_contato||'').replace(/"/g,'&quot;')}">
                    </div>
                </div>
            </div>
            <div id="mensagemEdicaoVeiculo" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarEdicaoVeiculo('${v.id}')">💾 Salvar alterações</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalEdicaoVeiculo').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function ajustarEdicaoVeiculoTerceiro(valor) {
    const bloco = document.getElementById('edGrupoVeiTerceiro');
    if (bloco) bloco.style.display = valor === 'terceiro' ? '' : 'none';
}

async function salvarEdicaoVeiculo(veiculoId) {
    const msgEl = document.getElementById('mensagemEdicaoVeiculo');
    const placa = document.getElementById('edVeiPlaca').value.trim().toUpperCase();
    if (!placa) {
        msgEl.textContent = 'A placa é obrigatória.';
        msgEl.className = 'message show error';
        return;
    }

    const anterior = (veiculosGlobais || []).find(x => String(x.id) === String(veiculoId));
    const propriedade = document.getElementById('edVeiPropriedade').value;
    const _capEdit = parseInt(document.getElementById('edVeiCapacidade').value) || null;
    const _capExcEdit = document.getElementById('edVeiCapacidadeExcecao')?.checked || false;
    if (_capEdit && !_capExcEdit && _capEdit > 11) {
        msgEl.textContent = 'Capacidade acima do teto padrão (11). Marque "Exceção de capacidade" para permitir.';
        msgEl.className = 'message show error';
        return;
    }
    const dados = {
        placa,
        tipo: document.getElementById('edVeiTipo').value,
        capacidade: _capEdit,
        capacidade_excecao: _capExcEdit,
        motorista_padrao: document.getElementById('edVeiMotorista').value || null,
        marca: document.getElementById('edVeiMarca').value.trim() || null,
        modelo: document.getElementById('edVeiModelo').value.trim() || null,
        ano: parseInt(document.getElementById('edVeiAno').value) || null,
        renavam: document.getElementById('edVeiRenavam').value.trim() || null,
        chassi: document.getElementById('edVeiChassi').value.trim().toUpperCase() || null,
        propriedade,
        transportador_nome: propriedade === 'terceiro'
            ? (document.getElementById('edVeiTransportador').value.trim() || null) : null,
        transportador_contato: propriedade === 'terceiro'
            ? (document.getElementById('edVeiTransportadorContato').value.trim() || null) : null
    };

    try {
        const { error } = await supabase.from('veiculos').update(dados).eq('id', veiculoId);
        if (error) throw error;

        // Se a placa mudou, atualiza os pedidos e rotas que apontam para ela
        if (anterior && anterior.placa && anterior.placa !== placa) {
            await supabase.from('pedidos').update({ placa_cegonha: placa }).eq('placa_cegonha', anterior.placa);
            try { await supabase.from('rotas_planejadas').update({ placa_cegonha: placa }).eq('placa_cegonha', anterior.placa); } catch(e){}
        }

        document.getElementById('modalEdicaoVeiculo').remove();
        await carregarDadosDoSupabase();
        renderizarListaVeiculos();
        exibirMensagem('mensagemCadastroVeiculo', `✅ Veículo ${placa} atualizado!`, 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

async function excluirVeiculo(veiculoId) {
    const v = (veiculosGlobais || []).find(x => String(x.id) === String(veiculoId));
    if (!v) return;

    const emUso = pedidosGlobais.filter(p => p.placaCegonha === v.placa && !['Entregue','Cancelado'].includes(p.status));
    if (emUso.length > 0) {
        alert(`Não é possível excluir a cegonha ${v.placa}: ela tem ${emUso.length} carro(s) na carga.\n\nDesaloque ou finalize esses pedidos antes de excluir.`);
        return;
    }

    if (!confirm(`Excluir o veículo ${v.placa}?\n\nEsta ação não pode ser desfeita.`)) return;

    try {
        const { error } = await supabase.from('veiculos').delete().eq('id', veiculoId);
        if (error) throw error;
        await carregarDadosDoSupabase();
        renderizarListaVeiculos();
        exibirMensagem('mensagemCadastroVeiculo', `Veículo ${v.placa} excluído.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemCadastroVeiculo', 'Erro ao excluir: ' + e.message, 'error');
    }
}

// ============================================
// LISTAGEM E EDIÇÃO DE CLIENTES
// ============================================

const TIPOS_CLIENTE = {
    empresa:        'Empresa',
    concessionaria: 'Concessionária',
    locadora:       'Locadora',
    garagista:      'Garagista',
    particular:     'Particular'
};

function renderizarListaClientes() {
    const corpo = document.getElementById('corpoTabelaClientes');
    if (!corpo) return;

    const busca = (document.getElementById('buscaClientes')?.value || '').trim().toLowerCase();
    let lista = clientesGlobais || [];

    if (busca) {
        lista = lista.filter(c =>
            `${c.nome||''} ${c.cnpj||''} ${c.cpf||''} ${c.cidade||''} ${c.uf||''} ${c.email||''} ${c.telefone||''} ${c.inscricao_estadual||''}`
                .toLowerCase().includes(busca)
        );
    }

    const contador = document.getElementById('contadorClientes');
    if (contador) contador.textContent = lista.length;

    if (lista.length === 0) {
        corpo.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${busca ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.'}</td></tr>`;
        return;
    }

    corpo.innerHTML = lista.map(c => {
        const doc = c.cnpj ? `CNPJ: ${c.cnpj}` : c.cpf ? `CPF: ${c.cpf}` : '—';
        const ie = c.inscricao_estadual ? `<br><span class="ocup-sub">IE: ${c.inscricao_estadual}</span>` : '';
        return `
        <tr>
            <td data-label="Cliente"><span class="ocup-cliente">${c.nome || '—'}</span>${c.codigo ? `<br><span class="ocup-id">#${c.codigo}</span>` : ''}</td>
            <td data-label="Tipo"><span class="ocup-sub">${TIPOS_CLIENTE[c.tipo_cliente] || c.tipo_cliente || '—'}</span></td>
            <td data-label="Documento" class="ocup-sub">${doc}${ie}</td>
            <td data-label="Contato" class="ocup-sub">${c.telefone || '—'}${c.email ? `<br>${c.email}` : ''}</td>
            <td data-label="Cidade/UF" class="ocup-sub">${c.cidade || '—'}${c.uf ? '/' + c.uf : ''}</td>
            <td data-label="Ações" class="ocup-acoes-cell">
                <button class="btn-kanban-editar" onclick="abrirEdicaoCliente('${c.id}')" title="Editar cliente">✏️</button>
                <button class="btn-kanban-excluir" onclick="excluirCliente('${c.id}')" title="Excluir cliente">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function abrirEdicaoCliente(clienteId) {
    const c = (clientesGlobais || []).find(x => String(x.id) === String(clienteId));
    if (!c) return;

    const existing = document.getElementById('modalEdicaoCliente');
    if (existing) existing.remove();

    const opcoesTipo = Object.entries(TIPOS_CLIENTE).map(([v, l]) =>
        `<option value="${v}" ${c.tipo_cliente === v ? 'selected' : ''}>${l}</option>`).join('');

    const ehPJ = ['empresa','concessionaria','locadora'].includes(c.tipo_cliente);
    const ehPF = ['garagista','particular'].includes(c.tipo_cliente);

    const modal = document.createElement('div');
    modal.id = 'modalEdicaoCliente';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:620px">
            <span class="close" onclick="document.getElementById('modalEdicaoCliente').remove()">&times;</span>
            <h2>✏️ Editar Cliente</h2>

            <div class="form-row">
                <div class="form-group">
                    <label>Tipo</label>
                    <select id="edCliTipo" onchange="ajustarEdicaoCliente(this.value)">${opcoesTipo}</select>
                </div>
                <div class="form-group">
                    <label>Nome / Razão Social *</label>
                    <input type="text" id="edCliNome" value="${(c.nome||'').replace(/"/g,'&quot;')}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group" id="edGrupoCnpj" style="display:${(ehPJ || ehPF) ? '' : 'none'}">
                    <label>CNPJ</label>
                    <input type="text" id="edCliCnpj" value="${c.cnpj||''}" maxlength="18" oninput="mascaraCNPJ(this)" onblur="autoPreencherCNPJEdicao()">
                </div>
                <div class="form-group" id="edGrupoCpf" style="display:${ehPJ ? 'none' : ''}">
                    <label>CPF</label>
                    <input type="text" id="edCliCpf" value="${c.cpf||''}" maxlength="14" oninput="mascaraCPF(this)">
                </div>
            </div>

            <div class="form-row" id="edGrupoIE" style="display:${ehPJ ? '' : 'none'}">
                <div class="form-group">
                    <label>Inscrição Estadual</label>
                    <input type="text" id="edCliIE" value="${c.inscricao_estadual||''}" placeholder="Ex: 123.45678-90 ou ISENTO" maxlength="20">
                </div>
                <div class="form-group"></div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Telefone</label>
                    <input type="tel" id="edCliTelefone" value="${c.telefone||''}" maxlength="15" oninput="mascaraTelefone(this)">
                </div>
                <div class="form-group">
                    <label>E-mail</label>
                    <input type="email" id="edCliEmail" value="${c.email||''}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group" style="max-width:170px">
                    <label>CEP</label>
                    <input type="text" id="edCliCep" value="${c.cep||''}" maxlength="9" oninput="mascaraCEP(this)">
                </div>
                <div class="form-group">
                    <label>Endereço</label>
                    <input type="text" id="edCliEndereco" value="${(c.endereco||'').replace(/"/g,'&quot;')}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Número</label>
                    <input type="text" id="edCliNumero" value="${c.numero||''}">
                </div>
                <div class="form-group">
                    <label>Complemento</label>
                    <input type="text" id="edCliComplemento" value="${(c.complemento||'').replace(/"/g,'&quot;')}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Bairro</label>
                    <input type="text" id="edCliBairro" value="${(c.bairro||'').replace(/"/g,'&quot;')}">
                </div>
                <div class="form-group">
                    <label>Cidade</label>
                    <input type="text" id="edCliCidade" value="${(c.cidade||'').replace(/"/g,'&quot;')}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group" style="max-width:120px">
                    <label>UF</label>
                    <input type="text" id="edCliUf" value="${c.uf||''}" maxlength="2" style="text-transform:uppercase">
                </div>
                <div class="form-group"></div>
            </div>

            <div id="mensagemEdicaoCliente" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarEdicaoCliente('${c.id}')">💾 Salvar alterações</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalEdicaoCliente').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function ajustarEdicaoCliente(tipo) {
    const ehPJ = ['empresa','concessionaria','locadora'].includes(tipo);
    const ehPF = ['garagista','particular'].includes(tipo);
    const set = (id, mostrar) => { const el = document.getElementById(id); if (el) el.style.display = mostrar ? '' : 'none'; };
    set('edGrupoCnpj', ehPJ || ehPF);   // garagista/particular também podem ter CNPJ
    set('edGrupoIE', ehPJ);
    set('edGrupoCpf', !ehPJ);
}

async function salvarEdicaoCliente(clienteId) {
    const msgEl = document.getElementById('mensagemEdicaoCliente');
    const nome = document.getElementById('edCliNome').value.trim();
    if (!nome) {
        msgEl.textContent = 'O nome é obrigatório.';
        msgEl.className = 'message show error';
        return;
    }

    const tipo = document.getElementById('edCliTipo').value;
    const ehPJ = ['empresa','concessionaria','locadora'].includes(tipo);
    const ehPF = ['garagista','particular'].includes(tipo);

    const dados = {
        nome,
        tipo_cliente: tipo,
        cnpj: (ehPJ || ehPF) ? (document.getElementById('edCliCnpj').value.trim() || null) : null,
        cpf:  ehPJ ? null : (document.getElementById('edCliCpf').value.trim() || null),
        inscricao_estadual: ehPJ ? (document.getElementById('edCliIE').value.trim() || null) : null,
        telefone: document.getElementById('edCliTelefone').value.trim() || null,
        email: document.getElementById('edCliEmail').value.trim() || null,
        cep: document.getElementById('edCliCep').value.trim() || null,
        endereco: document.getElementById('edCliEndereco').value.trim() || null,
        numero: document.getElementById('edCliNumero').value.trim() || null,
        complemento: document.getElementById('edCliComplemento').value.trim() || null,
        bairro: document.getElementById('edCliBairro').value.trim() || null,
        cidade: document.getElementById('edCliCidade').value.trim() || null,
        uf: document.getElementById('edCliUf').value.trim().toUpperCase() || null
    };

    try {
        const { error } = await supabase.from('clientes').update(dados).eq('id', clienteId);
        if (error) throw error;

        document.getElementById('modalEdicaoCliente').remove();
        await carregarDadosDoSupabase();
        renderizarListaClientes();
        exibirMensagem('mensagemCadastroCliente', `✅ Cliente "${nome}" atualizado com sucesso!`, 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

async function excluirCliente(clienteId) {
    const c = (clientesGlobais || []).find(x => String(x.id) === String(clienteId));
    if (!c) return;

    // Não deixar excluir cliente que tem pedidos vinculados
    const pedidosDoCliente = pedidosGlobais.filter(p =>
        String(p.clienteId) === String(clienteId) || p.cliente === c.nome
    );
    if (pedidosDoCliente.length > 0) {
        alert(`Não é possível excluir "${c.nome}": existem ${pedidosDoCliente.length} pedido(s) vinculados a este cliente.\n\nO histórico ficaria órfão. Se o cliente não é mais atendido, o ideal é apenas não usá-lo em novos pedidos.`);
        return;
    }

    if (!confirm(`Excluir definitivamente o cliente "${c.nome}"?\n\nEsta ação não pode ser desfeita.`)) return;

    try {
        const { error } = await supabase.from('clientes').delete().eq('id', clienteId);
        if (error) throw error;
        await carregarDadosDoSupabase();
        renderizarListaClientes();
        exibirMensagem('mensagemCadastroCliente', `Cliente "${c.nome}" excluído.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemCadastroCliente', 'Erro ao excluir: ' + e.message, 'error');
    }
}

function ajustarFormCliente(tipo) {
    const labelNome = document.getElementById('labelNomeCliente');
    const grupoCnpj = document.getElementById('grupoCnpj');
    const grupoCpf  = document.getElementById('grupoCpf');
    const grupoIE   = document.getElementById('grupoInscricaoEstadual');

    const tiposPJ = ['empresa','concessionaria','locadora'];
    const tiposPF = ['garagista','particular'];

    if (tiposPJ.includes(tipo)) {
        labelNome.textContent = 'Razão Social *';
        grupoCnpj.style.display = '';
        grupoCpf.style.display = 'none';
        document.getElementById('cpfCliente').value = '';
        if (grupoIE) grupoIE.style.display = '';           // IE é campo de PJ
    } else if (tiposPF.includes(tipo)) {
        labelNome.textContent = 'Nome Completo *';
        grupoCnpj.style.display = '';   // agora garagista/particular também podem ter CNPJ
        grupoCpf.style.display = '';
        if (grupoIE) grupoIE.style.display = 'none';
    } else {
        labelNome.textContent = 'Nome *';
        grupoCnpj.style.display = '';
        grupoCpf.style.display = '';
        if (grupoIE) grupoIE.style.display = 'none';
    }
}

// Máscara CEP
function mascaraCEP(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.replace(/(\d{5})(\d{0,3})/, '$1-$2');
    input.value = v;
}

// Buscar endereço pelo CEP (ViaCEP)
async function buscarCEP(cep) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await resp.json();
        if (data.erro) return;

        document.getElementById('enderecoCliente').value = data.logradouro || '';
        document.getElementById('bairroCliente').value   = data.bairro     || '';
        document.getElementById('cidadeCliente').value   = data.localidade  || '';
        document.getElementById('ufCliente').value       = data.uf          || '';
        document.getElementById('numeroCliente').focus();
    } catch(e) {
        console.warn('Erro ao buscar CEP:', e);
    }
}

async function salvarCadastroMotorista(event) {
    event.preventDefault();

    const nome = document.getElementById('nomeMotorista').value;
    const cpf = document.getElementById('cpfMotorista').value;

    if (!nome || !cpf) {
        exibirMensagem('mensagemCadastroMotorista', 'Preencha os campos obrigatórios!', 'error');
        return;
    }

    const telefone = document.getElementById('telefoneMotorista')?.value || null;
    const cnh = document.getElementById('cnh')?.value || null;
    const vinculo = document.getElementById('vinculoMotorista')?.value || 'proprio';
    const transportador = vinculo === 'terceiro'
        ? (document.getElementById('transportadorMotorista')?.value.trim() || null)
        : null;

    if (supabase) {
        try {
            const { error } = await supabase.from('motoristas').insert({
                nome, cpf, telefone, cnh, vinculo, transportador
            });
            if (error) throw error;
            await carregarDadosDoSupabase();
            exibirMensagem('mensagemCadastroMotorista', 'Motorista salvo com sucesso!', 'success');
            document.getElementById('formCadastroMotorista').reset();
        } catch (error) {
            exibirMensagem('mensagemCadastroMotorista', 'Erro ao salvar: ' + error.message, 'error');
        }
    }
}

// Mostra/esconde os campos do transportador quando a cegonha é terceira
function toggleCamposTerceiro(valor) {
    const bloco = document.getElementById('camposTerceiro');
    if (bloco) bloco.style.display = valor === 'terceiro' ? 'block' : 'none';
}

// Mostra/esconde o campo transportador quando o motorista é terceiro
function toggleTransportadorMotorista(valor) {
    const bloco = document.getElementById('grupoTransportadorMotorista');
    if (bloco) bloco.style.display = valor === 'terceiro' ? 'block' : 'none';
}

async function salvarCadastroVeiculo(event) {
    event.preventDefault();

    const placa = document.getElementById('placaCegonha').value;
    const tipo = document.getElementById('tipoCegonha').value;
    const capacidade = parseInt(document.getElementById('capacidadeCegonha').value, 10);
    const capacidadeExcecao = document.getElementById('capacidadeExcecao')?.checked || false;

    if (!placa || !tipo || !capacidade) {
        exibirMensagem('mensagemCadastroVeiculo', 'Preencha os campos obrigatórios!', 'error');
        return;
    }
    if (!capacidadeExcecao && capacidade > 11) {
        exibirMensagem('mensagemCadastroVeiculo', 'Capacidade acima do teto padrão (11). Marque "Exceção de capacidade" para permitir.', 'error');
        return;
    }

    const renavam = document.getElementById('renavamVeiculo')?.value || null;
    const chassi  = document.getElementById('chassiVeiculo')?.value  || null;
    const marca   = document.getElementById('marcaCegonha')?.value   || null;
    const modelo  = document.getElementById('modeloCegonha')?.value  || null;
    const ano     = document.getElementById('anoCegonha')?.value     || null;

    // Propriedade: frota própria ou terceiro
    const propriedade = document.getElementById('propriedadeCegonha')?.value || 'propria';
    const ehTerceiro = propriedade === 'terceiro';
    const transportadorNome = ehTerceiro ? (document.getElementById('transportadorNome')?.value.trim() || null) : null;
    const transportadorContato = ehTerceiro ? (document.getElementById('transportadorContato')?.value.trim() || null) : null;

    if (ehTerceiro && !transportadorNome) {
        exibirMensagem('mensagemCadastroVeiculo', 'Informe o nome do transportador terceiro.', 'error');
        return;
    }

    if (supabase) {
        try {
            const { error } = await supabase.from('veiculos').insert({
                placa, tipo, capacidade, renavam, chassi, marca, modelo, ano,
                capacidade_excecao: capacidadeExcecao,
                propriedade, transportador_nome: transportadorNome, transportador_contato: transportadorContato
            });
            if (error) throw error;
            await carregarDadosDoSupabase();
            exibirMensagem('mensagemCadastroVeiculo', 'Veículo salvo com sucesso!', 'success');
            document.getElementById('formCadastroVeiculo').reset();
        } catch (error) {
            exibirMensagem('mensagemCadastroVeiculo', 'Erro ao salvar: ' + error.message, 'error');
        }
    }
}

// ============================================
// MÁSCARAS DE CAMPOS
// ============================================

function aplicarMascaras() {
    function mascaraCPF(e) {
        let v = e.target.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, '$1.$2');
        e.target.value = v;
    }

    function mascaraCNPJ(e) {
        let v = e.target.value.replace(/\D/g, '').slice(0, 14);
        if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
        else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
        else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,3})/, '$1.$2');
        e.target.value = v;
    }

    function mascaraTelefone(e) {
        let v = e.target.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
        else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        else if (v.length > 0) v = '(' + v;
        e.target.value = v;
    }

    const cnpjCliente = document.getElementById('cnpjCliente');
    if (cnpjCliente) cnpjCliente.addEventListener('input', mascaraCNPJ);

    const cpfCliente = document.getElementById('cpfCliente');
    if (cpfCliente) cpfCliente.addEventListener('input', mascaraCPF);

    const telefoneCliente = document.getElementById('telefoneCliente');
    if (telefoneCliente) telefoneCliente.addEventListener('input', mascaraTelefone);

    const cpfMotorista = document.getElementById('cpfMotorista');
    if (cpfMotorista) cpfMotorista.addEventListener('input', mascaraCPF);

    const telefoneMotorista = document.getElementById('telefoneMotorista');
    if (telefoneMotorista) telefoneMotorista.addEventListener('input', mascaraTelefone);
}

// ============================================
// FLUXO DE STATUS DOS PEDIDOS
// ============================================

// Definição do fluxo por status atual
const FLUXO_STATUS = {
    'Pendente': {
        label: 'Pendente',
        cor: '#fbbf24',
        proximos: ['Intenção Agendada'],
        perfis: ['logistica', 'admin']
    },
    'Intenção Agendada': {
        label: 'Intenção Agendada',
        cor: '#60a5fa',
        proximos: ['Aguardando Confirmação'],
        perfis: ['logistica', 'admin']
    },
    'Aguardando Confirmação': {
        label: 'Aguardando Confirmação',
        cor: '#f97316',
        proximos: ['Em Coleta'],
        perfis: ['comercial', 'admin']
    },
    'Em Coleta': {
        label: 'Em Coleta',
        cor: '#a78bfa',
        proximos: ['Em Transporte', 'Transbordo'],
        perfis: ['logistica', 'admin']
    },
    'Em Transporte': {
        label: 'Em Transporte',
        cor: '#34d399',
        proximos: ['Entregue', 'Transbordo'],
        perfis: ['logistica', 'admin']
    },
    'Transbordo': {
        label: 'Transbordo',
        cor: '#fb923c',
        proximos: ['Intenção Agendada'],
        perfis: ['logistica', 'admin']
    },
    'Entregue': {
        label: 'Entregue',
        cor: '#4ade80',
        proximos: [],
        perfis: ['logistica', 'admin']
    }
};

const ORDEM_STATUS = [
    'Pendente',
    'Intenção Agendada',
    'Aguardando Confirmação',
    'Em Coleta',
    'Em Transporte',
    'Entregue'
];

function abrirModalStatus(pedidoId) {
    _statusGrupoIds = []; // avanço individual não é lote
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const statusAtual = pedido.status || 'Pendente';
    const config = FLUXO_STATUS[statusAtual];
    if (!config) return;

    // Verificar permissão
    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin';
    const temPermissao = config.perfis.includes(perfilUsuario);
    if (!temPermissao) {
        alert('Seu perfil não tem permissão para alterar este status.');
        return;
    }

    document.getElementById('statusPedidoId').value = pedidoId;
    document.getElementById('statusAtual').value = statusAtual;

    // Resumo do pedido
    const _podeReverter = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())
        && pedido.placaCegonha
        && ['Intenção Agendada','Aguardando Confirmação'].includes(statusAtual);
    document.getElementById('modalStatusResumo').innerHTML = `
        <div class="status-resumo-info">
            <span><strong>#${pedido.id}</strong> — ${pedido.cliente || '—'}</span>
            ${pedido.origemLancamento ? `<span class="status-origem-inline" title="Quem lançou o pedido">📝 ${(typeof NOMES_PERFIL!=='undefined' && NOMES_PERFIL[pedido.origemLancamento]) || pedido.origemLancamento}${pedido.criadoPorNome ? ' · '+pedido.criadoPorNome : ''}</span>` : ''}
            <span>${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''} → ${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}</span>
            <span class="status-badge-inline" style="background:${config.cor}20;color:${config.cor};border:1px solid ${config.cor}40">
                ${statusAtual}
            </span>
            ${pedido.placaCegonha ? `<span class="status-cegonha-inline">🚛 ${pedido.placaCegonha}</span>` : ''}
            ${pedido.etaReprogramado ? `<span class="tag-eta tag-${pedido.statusReprogramacao==='atrasado'?'vermelho':'amarelo'}" title="ETA reprogramado no transbordo">${pedido.statusReprogramacao==='atrasado'?'🔴':'🟡'} ETA ${new Date(pedido.etaReprogramado).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>` : ''}
            ${_podeReverter ? `<button type="button" class="btn btn-sm btn-reverter" onclick="desalocarPedido(${pedido.id})" title="Remove a cegonha e devolve o pedido para a fila">↩️ Desalocar</button>` : ''}
        </div>
    `;

    // Fluxo visual de etapas
    const flowEl = document.getElementById('statusFlow');
    flowEl.innerHTML = ORDEM_STATUS.map((s, i) => {
        const idx = ORDEM_STATUS.indexOf(statusAtual);
        const isAtual = s === statusAtual;
        const isPast = i < idx;
        const cls = isAtual ? 'flow-step atual' : isPast ? 'flow-step passado' : 'flow-step futuro';
        return `<div class="${cls}">
            <div class="flow-dot"></div>
            <span>${s}</span>
        </div>`;
    }).join('<div class="flow-linha"></div>');

    // Botões de ação
    const btnsEl = document.getElementById('statusAcoesBtns');
    if (config.proximos.length === 0) {
        btnsEl.innerHTML = '<p class="text-muted text-center">Pedido finalizado. Nenhuma ação disponível.</p>';
    } else {
        btnsEl.innerHTML = config.proximos.map(proximo => `
            <button type="button" class="btn btn-status" 
                style="border-color:${FLUXO_STATUS[proximo]?.cor || '#fff'}40;color:${FLUXO_STATUS[proximo]?.cor || '#fff'}"
                onclick="selecionarProximoStatus('${proximo}')">
                → ${proximo}
            </button>
        `).join('');
    }

    // Resetar campos opcionais
    document.getElementById('grupoObservacao').style.display = 'none';
    document.getElementById('grupoCidadeTransbordo').style.display = 'none';
    document.getElementById('statusObservacao').value = '';
    document.getElementById('statusNovo').value = '';
    document.getElementById('mensagemStatus').className = 'message';

    document.getElementById('modalStatus').classList.add('show');
}

function selecionarProximoStatus(novoStatus) {
    document.getElementById('statusNovo').value = novoStatus;

    // Resetar visual dos botões
    document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('btn-status-selecionado'));
    const btnSelecionado = [...document.querySelectorAll('.btn-status')].find(b => b.textContent.includes(novoStatus));
    if (btnSelecionado) btnSelecionado.classList.add('btn-status-selecionado');

    // Mostrar campos extras conforme status
    const grupoObs = document.getElementById('grupoObservacao');
    const grupoTransbordo = document.getElementById('grupoCidadeTransbordo');
    const grupoTipoTransb = document.getElementById('grupoTipoTransbordo');
    const grupoCegonhaDest = document.getElementById('grupoCegonhaDestino');
    const grupoChecklist = document.getElementById('grupoChecklistVerif');
    const statusAtualVal = document.getElementById('statusAtual').value;

    // Reset
    grupoTipoTransb.style.display = 'none';
    grupoCegonhaDest.style.display = 'none';
    grupoChecklist.style.display = 'none';
    const _grupoReprog = document.getElementById('grupoReprogTransbordo');
    if (_grupoReprog) _grupoReprog.style.display = 'none';
    const chkVerif = document.getElementById('checklistVerificado');
    if (chkVerif) chkVerif.checked = false;

    if (novoStatus === 'Transbordo') {
        // Transbordo exige: tipo (pátio/caminhão) + checklist verificado
        grupoObs.style.display = 'block';
        grupoTipoTransb.style.display = 'block';
        grupoChecklist.style.display = 'block';
        if (_grupoReprog) _grupoReprog.style.display = 'block';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Motivo do Transbordo';
        ajustarCamposTransbordo(); // decide pátio vs cegonha destino
    } else if (novoStatus === 'Entregue') {
        // Entrega ao cliente exige checklist verificado
        grupoObs.style.display = 'block';
        grupoTransbordo.style.display = 'none';
        grupoChecklist.style.display = 'block';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Observação da entrega';
    } else if (novoStatus === 'Intenção Agendada' && statusAtualVal === 'Transbordo') {
        grupoObs.style.display = 'block';
        grupoTransbordo.style.display = 'none';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Observação';
    } else {
        grupoObs.style.display = 'none';
        grupoTransbordo.style.display = 'none';
    }

    // Mostrar botão de confirmar
    const btnsEl = document.getElementById('statusAcoesBtns');
    const jaTemConfirmar = btnsEl.querySelector('.btn-confirmar-status');
    if (!jaTemConfirmar) {
        const btnConfirmar = document.createElement('button');
        btnConfirmar.type = 'button';
        btnConfirmar.className = 'btn btn-primary btn-confirmar-status';
        btnConfirmar.textContent = 'Confirmar';
        btnConfirmar.onclick = confirmarMudancaStatus;
        btnsEl.appendChild(btnConfirmar);
    }
}

// Alterna os campos do transbordo entre PÁTIO e CAMINHÃO→CAMINHÃO
function ajustarCamposTransbordo() {
    const tipo = document.querySelector('input[name="tipoTransbordo"]:checked')?.value || 'patio';
    const grupoPatio = document.getElementById('grupoCidadeTransbordo');
    const grupoCegonha = document.getElementById('grupoCegonhaDestino');

    if (tipo === 'patio') {
        grupoPatio.style.display = 'block';
        grupoCegonha.style.display = 'none';
    } else {
        grupoPatio.style.display = 'none';
        grupoCegonha.style.display = 'block';
        // Popular cegonhas disponíveis (exceto a atual do pedido)
        const pedidoId = document.getElementById('statusPedidoId').value;
        const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
        const sel = document.getElementById('cegonhaDestinoTransbordo');
        const cegonhas = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
            .map(v => v.placa).filter(Boolean);
        // fallback: cegonhas já usadas em pedidos
        const usadas = [...new Set(pedidosGlobais.map(x => x.placaCegonha).filter(Boolean))];
        const todas = [...new Set([...cegonhas, ...usadas])].filter(c => c !== p?.placaCegonha).sort();
        sel.innerHTML = '<option value="">Selecione a cegonha...</option>' +
            todas.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

// ============================================
// AVANÇAR STATUS EM LOTE (carga fechada)
// _statusGrupoIds guarda os pedidos que devem avançar juntos.
// O caminho individual continua intacto; o lote reaproveita a mesma lógica.
// ============================================
let _statusGrupoIds = [];

// Aplica UM avanço de status a um pedido, replicando o núcleo do fluxo
// (atualização, histórico, manifesto e notificação). Usado só no lote.
async function _aplicarStatusEmPedidoLote(pedidoObj, d) {
    const pedidoId = pedidoObj.id;
    const atualizacao = { status: d.statusNovo };
    let saidaPatioObs = '';

    if (d.statusAnterior === 'Intenção Agendada' && d.statusNovo === 'Aguardando Confirmação') {
        atualizacao.confirmacao_logistica_em = new Date().toISOString();
        atualizacao.confirmacao_logistica_por = d.usuarioNome;
    }
    if (d.statusAnterior === 'Aguardando Confirmação' && d.statusNovo === 'Em Coleta') {
        atualizacao.confirmacao_comercial_em = new Date().toISOString();
        atualizacao.confirmacao_comercial_por = d.usuarioNome;
    }
    if (d.statusNovo === 'Transbordo') {
        if (d.tipoTransbordo === 'patio') {
            atualizacao.cidade_transbordo = d.cidadeTransbordo;
            atualizacao.transbordo_em = new Date().toISOString();
            atualizacao.patio_atual = d.cidadeTransbordo;
            atualizacao.patio_desde = atualizacao.transbordo_em;
            atualizacao.placa_cegonha = null;
            atualizacao.motorista_1 = null; atualizacao.motorista_2 = null;
            atualizacao.percent_motorista_1 = null; atualizacao.percent_motorista_2 = null;
            // Perna 1 concluída: sai do corredor/rota antigos e renasce no pátio (perna 2)
            atualizacao.rota_id = null;
            atualizacao.corredor_manual_id = null;
        } else {
            atualizacao.cidade_transbordo = `Cegonha ${d.cegonhaDestino}`;
            atualizacao.transbordo_em = new Date().toISOString();
            atualizacao.placa_cegonha = d.cegonhaDestino;
            atualizacao.motorista_1 = null; atualizacao.motorista_2 = null;
            atualizacao.percent_motorista_1 = null; atualizacao.percent_motorista_2 = null;
            atualizacao.patio_atual = null; atualizacao.patio_desde = null;
        }
    }
    if (['Em Transporte', 'Entregue'].includes(d.statusNovo) && pedidoObj.patioAtual) {
        atualizacao.patio_atual = null; atualizacao.patio_desde = null;
        saidaPatioObs = ` — 📤 Saiu do pátio de ${pedidoObj.patioAtual}`;
    }

    const { error: errPedido } = await supabase.from('pedidos').update(atualizacao).eq('id', pedidoId);
    if (errPedido) throw errPedido;

    let descTransbordo = '';
    if (d.statusNovo === 'Transbordo') {
        descTransbordo = d.tipoTransbordo === 'patio'
            ? `Transbordo para pátio de ${d.cidadeTransbordo}`
            : `Transbordo caminhão → caminhão (nova cegonha ${d.cegonhaDestino})`;
    }
    const seloChecklist = (d.statusNovo === 'Entregue' || d.statusNovo === 'Transbordo') ? ' [✅ checklist verificado]' : '';
    const obsCompleta = ((d.statusNovo === 'Transbordo'
        ? `${descTransbordo}${d.observacao ? ' — ' + d.observacao : ''}`
        : (d.observacao || '')) + saidaPatioObs + seloChecklist).trim() || null;

    await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: d.statusAnterior,
        status_novo: d.statusNovo,
        usuario_nome: d.usuarioNome,
        usuario_perfil: d.perfilUsuario,
        observacao: obsCompleta
    });

    try {
        if (d.statusNovo === 'Em Coleta' && pedidoObj.placaCegonha) {
            await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'coleta', +1);
        } else if (d.statusNovo === 'Entregue') {
            if (pedidoObj.placaCegonha) await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'entrega', -1);
        } else if (d.statusNovo === 'Transbordo') {
            if (pedidoObj.placaCegonha) await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'transbordo_saida', -1);
            if (d.tipoTransbordo === 'caminhao' && d.cegonhaDestino) await registrarEventoManifesto(d.cegonhaDestino, pedidoObj, 'transbordo_entrada', +1);
        }
    } catch (e) { console.warn('Manifesto (lote) não atualizado:', e.message); }

    if (d.statusNovo === 'Transbordo') { await _registrarTrechosTransbordo(pedidoObj, d); }

    try { notificarMudancaStatus(pedidoObj, d.statusAnterior, d.statusNovo); } catch (e) {}
    if (d.statusNovo === 'Em Transporte') { try { await dispararPDFFiscal(pedidoId); } catch (e) {} }
}

// PARTE 1 do Financeiro · No transbordo, fecha a perna do motorista atual
// (origem → transbordo) e abre a próxima (transbordo → destino), redividindo
// o frete por km. Isso alimenta o faturamento por motorista/caminhão.
// É blindado: qualquer falha aqui não interrompe a mudança de status.
async function _registrarTrechosTransbordo(pedidoObj, d) {
    if (!supabase || d.statusNovo !== 'Transbordo') return;
    try {
        const pid = parseInt(pedidoObj.id);
        const freteTotal = Number(pedidoObj.valorFrete) || 0;
        const cidadeTransb = d.tipoTransbordo === 'patio'
            ? d.cidadeTransbordo
            : `Cegonha ${d.cegonhaDestino}`;
        const origemPedido = `${pedidoObj.cidadeOrigem || ''}/${pedidoObj.ufOrigem || ''}`;
        const destinoFinal = `${pedidoObj.cidadeDestino || ''}/${pedidoObj.ufDestino || ''}`;

        let { data: existentes } = await supabase.from('pedido_trechos')
            .select('*').eq('pedido_id', pid).order('ordem', { ascending: true });
        existentes = existentes || [];

        let trechos;
        if (existentes.length === 0) {
            // Semeia a perna já executada com quem estava tocando o carro
            trechos = [{
                origem: origemPedido, destino: cidadeTransb,
                motorista: pedidoObj.motorista1 || '', placa_cegonha: pedidoObj.placaCegonha || '', km: 0
            }];
        } else {
            trechos = existentes.map(r => ({
                origem: [r.origem_cidade, r.origem_uf].filter(Boolean).join('/'),
                destino: [r.destino_cidade, r.destino_uf].filter(Boolean).join('/'),
                motorista: r.motorista_nome || '', placa_cegonha: r.placa_cegonha || '', km: Number(r.km) || 0
            }));
            // Fecha a última perna no ponto do transbordo, atribuindo ao executor atual
            const ult = trechos[trechos.length - 1];
            ult.destino = cidadeTransb;
            if (!ult.motorista) ult.motorista = pedidoObj.motorista1 || '';
            if (!ult.placa_cegonha) ult.placa_cegonha = pedidoObj.placaCegonha || '';
        }

        // Abre a próxima perna (transbordo → destino final)
        // No transbordo caminhão→caminhão, já atribui o motorista padrão da cegonha B,
        // para o rateio do faturamento sair completo (motorista A/cegonha A + motorista B/cegonha B).
        const motoristaCegonhaB = d.tipoTransbordo === 'caminhao'
            ? ((veiculosGlobais || []).find(v => v.placa === d.cegonhaDestino)?.motorista_padrao || '')
            : '';
        trechos.push({
            origem: cidadeTransb, destino: destinoFinal,
            motorista: motoristaCegonhaB, // cegonha B: motorista padrão; pátio: A DEFINIR
            placa_cegonha: d.tipoTransbordo === 'caminhao' ? (d.cegonhaDestino || '') : '',
            km: 0
        });

        // Redistribui o frete por km (km 0 → divisão igual até preencher)
        const valores = _alocDividirPorKm(Math.round(freteTotal * 100), trechos);
        const linhas = trechos.map((t, i) => {
            const [oc, ou] = (t.origem || '').split('/');
            const [dc, du] = (t.destino || '').split('/');
            return {
                pedido_id: pid, ordem: i + 1,
                origem_cidade: (oc || '').trim() || null, origem_uf: (ou || '').trim() || null,
                destino_cidade: (dc || '').trim() || null, destino_uf: (du || '').trim() || null,
                motorista_nome: t.motorista || null, placa_cegonha: t.placa_cegonha || null,
                km: Number(t.km) || 0, valor_frete: (valores[i] || 0) / 100, status: 'pendente'
            };
        });
        await supabase.from('pedido_trechos').delete().eq('pedido_id', pid);
        if (linhas.length) await supabase.from('pedido_trechos').insert(linhas);
    } catch (e) {
        console.warn('Trecho de transbordo não registrado:', e.message);
    }
}

// Abre a janela de status já preparada para avançar a carga fechada inteira.
function abrirModalStatusGrupo(grupoId) {
    const membros = pedidosGlobais.filter(p => String(p.grupoId) === String(grupoId));
    if (membros.length === 0) return;

    // Status predominante do grupo (o mais comum entre os carros)
    const cont = {};
    membros.forEach(m => { const s = m.status || 'Pendente'; cont[s] = (cont[s] || 0) + 1; });
    const statusPred = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
    const doStatus = membros.filter(m => (m.status || 'Pendente') === statusPred);

    const config = FLUXO_STATUS[statusPred];
    if (!config || !config.proximos || config.proximos.length === 0) {
        alert('Esta carga já está finalizada neste status — não há próximo passo.');
        return;
    }

    // Reaproveita a janela normal (constrói UI, valida permissão) no 1º carro do passo
    abrirModalStatus(doStatus[0].id);
    // abrirModalStatus zera _statusGrupoIds; agora marcamos o lote:
    _statusGrupoIds = doStatus.map(m => m.id);

    const resumo = document.getElementById('modalStatusResumo');
    if (resumo) {
        const fora = membros.length - doStatus.length;
        resumo.insertAdjacentHTML('afterbegin',
            `<div class="lote-aviso">⏩ Avançando <strong>${doStatus.length} carros</strong> da carga fechada juntos${fora ? ` · ${fora} em outro status ficam de fora` : ''}.</div>`);
    }
}

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
        await carregarDadosDoSupabase();
        fecharModal('modalStatus');
        exibirMensagem('mensagemLogistica', `✅ Status atualizado: ${statusAnterior} → ${statusNovo}${avancadosLote ? ` · +${avancadosLote} carros da carga fechada` : ''}`, 'success');
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
        const cnpj = (c.cnpj || '').replace(/\D/g,'');
        const cpf  = (c.cpf  || '').replace(/\D/g,'');
        const cod  = (c.codigo || '').toLowerCase();
        const termoDigits = termo.replace(/\D/g,'');
        return nome.includes(termoLower) || 
               (termoDigits && (cnpj.includes(termoDigits) || cpf.includes(termoDigits))) ||
               cod.includes(termoLower);
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
        return `<div class="cliente-item" onmousedown="selecionarCliente(${c.id}, '${(c.nome||'').replace(/'/g,"\'")}', '${doc}', '${c.tipo_cliente||''}', '${c.codigo||''}')">
            <div class="cliente-item-nome">${c.nome || '—'} ${tipo} ${cod}</div>
            <div class="cliente-item-doc">${doc || ''}</div>
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
        const { data } = await supabase
            .from('clientes')
            .select('id, nome')
            .eq(campo, valor)
            .limit(1);

        if (data && data.length > 0) {
            return data[0]; // retorna o cliente existente
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

        await carregarDadosDoSupabase();
        fecharModal('modalSairPatio');
        exibirMensagem('mensagemLogistica', `✅ Saiu do pátio na cegonha ${cegonha} · agora Em Transporte.`, 'success');
    } catch (e) {
        alert('Não consegui concluir a saída do pátio: ' + (e.message || e));
    }
}

// #3 · Mostra o botão de avançar SE o passo é do seu setor; senão, mostra
// um selo "⏳ Aguardando comercial/logística" (didático, bate-volta visível).
function acaoOuAguardando(p) {
    const cfg = FLUXO_STATUS[p.status || 'Pendente'];
    if (!cfg || !cfg.proximos || cfg.proximos.length === 0) return '';
    let dono = (cfg.perfis || []).filter(x => x !== 'admin')[0] || 'logistica';
    // Item: pedido criado pela logística não precisa de aprovação do comercial —
    // a própria logística conduz (ela já está no controle).
    if (p.origemLancamento === 'logistica' && dono === 'comercial') dono = 'logistica';
    const viewer = (typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
    const podeAgir = viewer === 'admin' || viewer === dono;
    const seloEspera = `<span class="selo-aguardando selo-aguardando-${dono}">⏳ Aguardando ${dono === 'comercial' ? 'comercial' : 'logística'}</span>`;

    // Transbordo: ação direta "sair do pátio → próxima cegonha", sem repetir intenção/coleta
    if (p.status === 'Transbordo') {
        return podeAgir
            ? `<button class="btn-kanban-status btn-sair-patio" onclick="abrirSairPatio(${p.id})" title="Definir a próxima cegonha/motorista e seguir direto para Em Transporte">🚚 Sair do pátio</button>`
            : seloEspera;
    }

    if (podeAgir) return `<button class="btn-kanban-status" onclick="abrirModalStatus(${p.id})">Avançar</button>`;
    return seloEspera;
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
            const btnAvancar = (mostrarAvancar && _temProximo)
                ? `<button class="grupo-avancar" onclick="event.stopPropagation(); abrirModalStatusGrupo('${gid}')" title="Avançar o status de todos os carros da carga fechada">⏩ Avançar todos</button>`
                : '';
            out.push(`<tr class="grupo-header ${aberto ? 'aberto' : ''}" onclick="toggleGrupo('${gid}')">
                <td colspan="${colspan}">
                    <span class="grupo-toggle">${aberto ? '▼' : '▶'}</span>
                    <span class="grupo-badge">📦 Carga fechada</span>
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
            <td><span style="font-size:0.7rem;font-weight:600;padding:0.15rem 0.5rem;border-radius:4px;background:${cor}20;color:${cor};border:1px solid ${cor}40">${p.status || '—'}</span></td>
            <td style="font-size:0.78rem">${p.dataSolicitacao || '—'}</td>
            <td>
                <div style="display:flex;gap:0.3rem;flex-wrap:wrap">
                    ${podeChecklist ? `<button class="btn btn-primary btn-sm" onclick="abrirChecklist(${p.id})">✅ Confirmar</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="solicitarEdicaoPedido(${p.id})" title="Solicitar edição à logística">✏️ Editar</button>
                    <button class="btn btn-secondary btn-sm" onclick="abrirHistorico(${p.id})">Histórico</button>
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

        await carregarDadosDoSupabase();
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
            <td style="font-size:0.78rem">${p.dataSolicitacao || '—'}</td>
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
            <td>${p.dataSolicitacao || '—'}</td>
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
    } else if (fStatus !== '__todos') {
        lista = lista.filter(p => p.status === fStatus);
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
                return n > 1 ? ` <span class="badge-carga-fechada" title="Carga fechada: ${n} carros do mesmo pedido">📦 ${n}</span>` : '';
            })()}<br><span class="ocup-resp" title="Responsável comercial">🧑‍💼 ${p.responsavelComercial || '—'}</span></td>
            <td style="font-size:0.78rem">${p.modelo || ''}<br><strong>${p.placa || ''}</strong></td>
            <td style="font-size:0.75rem">${p.cidadeOrigem || ''}/${p.ufOrigem || ''}${p.cidadeTransbordo ? ` → 🔁 ${p.cidadeTransbordo}` : ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td style="font-size:0.82rem">
                ${p.placaCegonha ? `<strong>${p.placaCegonha}</strong>` : '<span class="tag-adefinir">A DEFINIR</span>'}
                ${p.motorista1 ? `<br><span style="color:var(--text-tertiary);font-size:0.75rem">👤 ${p.motorista1}</span>` : ''}
            </td>
            <td><span class="status-badge-inline" style="background:${cor}20;color:${cor};border:1px solid ${cor}40;padding:0.15rem 0.5rem;border-radius:5px;font-size:0.7rem;white-space:nowrap">${p.status}</span>
                ${p.patioAtual ? `<br><span class="badge-patio" style="margin:0.2rem 0 0">🅿️ ${p.patioAtual}</span>` : ''}</td>
            <td class="acomp-acoes">
                ${acaoOuAguardando(p)}
                <button class="btn-kanban-editar" onclick="abrirEdicaoPedido(${p.id})" title="Editar pedido (logística edita sem mudar o status)">✏️</button>
                ${p.placaCegonha && p.status !== 'Cancelado' ? `<button class="btn-kanban-trechos" onclick="abrirEdicaoTrechos(${p.id})" title="Dividir frete / editar trechos e motoristas da viagem">🛣️</button>` : ''}
                <button class="btn-kanban-ocorr" onclick="abrirRegistrarOcorrencia(${p.id})" title="Registrar ocorrência (vai para o comercial responsável)">⚠️</button>
                <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Hist.</button>
            </td>
        </tr>`;
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
    { k: 'cliente',        label: 'Cliente',            tipo: 'text' },
    { k: 'modelo',         label: 'Modelo',             tipo: 'text' },
    { k: 'placa',          label: 'Placa',              tipo: 'text' },
    { k: 'cidadeOrigem',   label: 'Cidade Origem',      tipo: 'text',   col: 'cidade_origem' },
    { k: 'ufOrigem',       label: 'UF Origem',          tipo: 'text',   col: 'uf_origem' },
    { k: 'cidadeDestino',  label: 'Cidade Destino',     tipo: 'text',   col: 'cidade_destino' },
    { k: 'ufDestino',      label: 'UF Destino',         tipo: 'text',   col: 'uf_destino' },
    { k: 'valorFrete',     label: 'Valor do Frete (R$)',tipo: 'number', col: 'valor_frete' },
    { k: 'dataPrevColeta', label: 'Coleta Prevista',    tipo: 'datetime-local', col: 'data_prev_coleta' },
    { k: 'dataPrevEntrega',label: 'Entrega Prevista',   tipo: 'datetime-local', col: 'data_prev_entrega' },
    { k: 'referencia',     label: 'Referência (OC/ID)', tipo: 'text',   col: 'referencia' },
    { k: 'categoriaVeiculo', label: 'Categoria (hatch/sedan/suv/caminhonete)', tipo: 'text', col: 'categoria_veiculo' },
    { k: 'prazoEntregaEstimado', label: 'Prazo de Entrega Estimado', tipo: 'date', col: 'prazo_entrega_estimado' },
    { k: 'observacaoPedido',label: 'Observações',       tipo: 'text',   col: 'observacao_pedido' }
];

// ---------- COMERCIAL: solicitar edição ----------
async function solicitarEdicaoPedido(pedidoId) {
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

        await carregarDadosDoSupabase();
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
function abrirEdicaoPedido(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p) return;

    const existing = document.getElementById('modalEdicaoPedido');
    if (existing) existing.remove();

    const val = (campo) => {
        let v = p[campo.k];
        if (v === null || v === undefined) return '';
        if (campo.tipo === 'datetime-local' && v) {
            const d = new Date(v);
            if (!isNaN(d)) return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        return v;
    };

    const campos = CAMPOS_EDITAVEIS.map(c => `
        <div class="form-group">
            <label>${c.label}</label>
            <input type="${c.tipo}" id="edit_${c.k}" value="${String(val(c)).replace(/"/g, '&quot;')}"
                ${c.tipo === 'number' ? 'step="0.01"' : ''}>
        </div>`).join('');

    const modal = document.createElement('div');
    modal.id = 'modalEdicaoPedido';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:640px">
            <span class="close" onclick="document.getElementById('modalEdicaoPedido').remove()">&times;</span>
            <h2>✏️ Editar Pedido #${p.id}</h2>
            <p class="text-muted text-sm" style="margin-bottom:0.8rem">
                Status atual: <strong>${p.status || '—'}</strong> — a edição da logística <strong>não altera o status</strong>.
            </p>
            <div class="edicao-grid">${campos}</div>
            <div id="mensagemEdicaoPedido" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarEdicaoPedido(${p.id})">💾 Salvar alterações</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalEdicaoPedido').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function salvarEdicaoPedido(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;

    const msgEl = document.getElementById('mensagemEdicaoPedido');
    const update = {};
    const mudancas = [];

    CAMPOS_EDITAVEIS.forEach(c => {
        const el = document.getElementById('edit_' + c.k);
        if (!el) return;
        let novo = el.value;
        const col = c.col || c.k;

        if (c.tipo === 'number') {
            novo = novo === '' ? null : parseFloat(novo);
            if (Number(novo) !== Number(p[c.k] || 0)) { update[col] = novo; mudancas.push(c.label); }
        } else if (c.tipo === 'datetime-local') {
            const novoIso = novo ? new Date(novo).toISOString() : null;
            const antigoIso = p[c.k] ? new Date(p[c.k]).toISOString() : null;
            if (novoIso !== antigoIso) { update[col] = novoIso; mudancas.push(c.label); }
        } else {
            novo = novo.trim();
            if (novo !== (p[c.k] || '')) { update[col] = novo; mudancas.push(c.label); }
        }
    });

    if (mudancas.length === 0) {
        msgEl.textContent = 'Nenhuma alteração para salvar.';
        msgEl.className = 'message show error';
        return;
    }

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    try {
        const { error } = await supabase.from('pedidos').update(update).eq('id', pedidoId);
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: p.status || '', status_novo: p.status || '',
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
            observacao: `✏️ Pedido editado pela logística (${mudancas.join(', ')}) — status mantido em ${p.status || '—'}`
        });

        document.getElementById('modalEdicaoPedido').remove();
        await carregarDadosDoSupabase();
        if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
        if (typeof renderizarKanban === 'function') renderizarKanban();
        if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag();
        exibirMensagem('mensagemLogistica', `✅ Pedido #${pedidoId} atualizado (${mudancas.join(', ')}).`, 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// VALIDAÇÃO DE PLACAS (confronto OCR + validação manual da logística)
// ============================================

async function renderizarValidacaoPlacas() {
    const painel = document.getElementById('painelValidacaoPlacas');
    if (!painel || !supabase) return;
    try {
        const { data, error } = await supabase.from('ocorrencias')
            .select('*').eq('tipo', 'foto_placa')
            .order('created_at', { ascending: false }).limit(60);
        if (error) throw error;

        const pendentes = (data || []).filter(o => (o.validacao_logistica || 'pendente') === 'pendente');
        const validadas = (data || []).filter(o => ['auto_ok', 'aprovada', 'reprovada'].includes(o.validacao_logistica)).slice(0, 12);

        // #3 · Auto_ok recentes viram "coletado" automaticamente (silencioso)
        try { await _varrerAutoOkParaColeta((data || []).filter(o => o.validacao_logistica === 'auto_ok').slice(0, 24)); } catch (e) {}

        const vereditoBadge = (o) => {
            const m = {
                confere: ['#4ade80', '✅ OCR confere'],
                diverge: ['#ef4444', '⚠️ OCR divergente'],
                ilegivel: ['#fbbf24', '🔍 OCR ilegível'],
                indisponivel: ['#9ca3af', 'OCR indisponível']
            }[o.ocr_veredito] || ['#9ca3af', 'Sem OCR'];
            return `<span class="prazo-badge" style="color:${m[0]};background:${m[0]}20;border:1px solid ${m[0]}55;margin-left:0">${m[1]}</span>`;
        };

        const card = (o, acoes) => {
            const ped = pedidosGlobais.find(p => String(p.id) === String(o.pedido_id)) || {};
            return `
            <div class="conf-card">
                <div class="conf-card-topo">
                    <span class="carro-patio-id">#${o.pedido_id}</span>
                    <strong>${ped.cliente || '—'}</strong>
                    ${vereditoBadge(o)}
                    <span class="text-muted text-sm" style="margin-left:auto">${o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : ''}</span>
                </div>
                <div class="conf-card-linha">
                    Placa do pedido: <strong>${ped.placa || o.ocr_placa_lida || '—'}</strong>
                    ${o.ocr_placa_lida ? ` · lida na foto: <strong>${o.ocr_placa_lida}</strong>` : ''}
                    ${o.ocr_confianca ? ` · ${o.ocr_confianca}% conf.` : ''}
                </div>
                ${o.arquivo_url ? `<a href="${o.arquivo_url}" target="_blank"><img src="${o.arquivo_url}" class="validacao-foto" alt="foto da placa"></a>` : ''}
                ${acoes}
            </div>`;
        };

        painel.innerHTML = `
            <div class="patios-resumo">
                <div class="patios-resumo-item ${pendentes.length > 0 ? 'patios-resumo-alerta' : ''}">
                    <strong>${pendentes.length}</strong><span>placa(s) aguardando validação manual</span>
                </div>
            </div>
            <h3 class="conf-titulo">Aguardando validação da logística</h3>
            <p class="text-muted text-sm" style="margin-bottom:0.6rem">Fotos onde o OCR divergiu, ficou ilegível ou não rodou. As que o OCR confirmou já entram aprovadas automaticamente.</p>
            ${pendentes.length === 0
                ? '<p class="text-muted text-sm">Nenhuma placa pendente de validação. 👌</p>'
                : pendentes.map(o => card(o, `
                    <div class="conf-card-acoes">
                        <button class="btn btn-primary btn-sm" onclick="validarPlaca(${o.id}, 'aprovada')">✔ Placa confere</button>
                        <button class="btn btn-secondary btn-sm" onclick="validarPlaca(${o.id}, 'reprovada')">✘ Não confere</button>
                    </div>
                `)).join('')}
            ${validadas.length > 0 ? `
                <h3 class="conf-titulo" style="margin-top:1.2rem">Validadas recentes</h3>
                ${validadas.map(o => card(o, `<div class="conf-card-linha">${o.validacao_logistica === 'auto_ok' ? '✅ Confirmada automaticamente pelo OCR' : o.validacao_logistica === 'aprovada' ? '✔ Aprovada manualmente' : '✘ Reprovada'} ${o.validado_por ? '— ' + o.validado_por : ''}${o.motivo_reprovacao ? `<br><span style="color:#fca5a5">Motivo: ${o.motivo_reprovacao}</span>${o.reenviada ? ' <span style="color:#4ade80">· motorista reenviou</span>' : ' <span style="color:#fbbf24">· aguardando reenvio</span>'}` : ''}</div>
                    ${o.validacao_logistica === 'reprovada' && o.arquivo_url ? `<div class="conf-card-acoes"><button class="btn-kanban-excluir" onclick="descartarFotoReprovada(${o.id})" title="Apagar o arquivo desta foto do armazenamento">🗑️ Descartar arquivo</button></div>` : ''}`)).join('')}
            ` : ''}`;
    } catch (e) {
        console.warn('Validação de placas não carregada:', e.message);
        painel.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar. Rode a migração do OCR.</p>';
    }
}

// Descarta o ARQUIVO de uma foto reprovada (libera espaço no Storage).
// O registro da reprovação e o motivo continuam no histórico.
// Envia push para o motorista responsável por um pedido.
// Nunca interrompe o fluxo: se falhar, só registra no console.
async function notificarMotoristaDoPedido(pedido, { titulo, corpo }) {
    if (!supabase || !pedido) return;
    try {
        const nomes = [pedido.motorista1, pedido.motorista2].filter(Boolean);
        if (nomes.length === 0) return;

        const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                            .toUpperCase().replace(/\s+/g, ' ').trim();

        // Achar o motorista no cadastro e o login vinculado a ele
        const motoristas = (motoristasGlobais || []).filter(m =>
            nomes.some(n => norm(n) === norm(m.nome)));
        if (motoristas.length === 0) return;

        const { data: perfis } = await supabase.from('perfis')
            .select('id, user_id')
            .in('motorista_id', motoristas.map(m => m.id));

        for (const perfil of (perfis || [])) {
            await supabase.functions.invoke('enviar-push', {
                body: { user_id: perfil.user_id, titulo, corpo, url: './' }
            });
        }
    } catch (e) {
        console.warn('Push não enviado (não impede o fluxo):', e.message);
    }
}

async function descartarFotoReprovada(ocorrenciaId) {
    if (!supabase) return;
    if (!confirm('Apagar o arquivo desta foto reprovada?\n\nO registro da reprovação e o motivo continuam no histórico — só a imagem é removida do armazenamento.')) return;

    try {
        const { data: oc } = await supabase.from('ocorrencias')
            .select('arquivo_path, arquivo_url').eq('id', ocorrenciaId).maybeSingle();

        const extrair = (url) => {
            if (!url) return null;
            const marcador = '/movemaster-arquivos/';
            const i = url.indexOf(marcador);
            return i === -1 ? null : decodeURIComponent(url.substring(i + marcador.length).split('?')[0]);
        };
        const caminho = oc?.arquivo_path || extrair(oc?.arquivo_url);

        if (caminho) {
            const { error } = await supabase.storage.from('movemaster-arquivos').remove([caminho]);
            if (error) throw error;
        }

        await supabase.from('ocorrencias')
            .update({ arquivo_url: null, arquivo_path: null })
            .eq('id', ocorrenciaId);

        renderizarValidacaoPlacas();
        exibirMensagem('mensagemLogistica', '🗑️ Arquivo da foto reprovada removido do armazenamento.', 'success');
    } catch (e) {
        alert('Erro ao descartar: ' + e.message);
    }
}

// #3 · Avança um pedido para "Em Coleta" quando a placa confere (auto pelo
// OCR ou manual pela logística). É blindado: se já passou desse ponto,
// ignora; se falhar, não interrompe nada.
async function _avancarParaColeta(pedidoId, observacaoExtra) {
    if (!supabase || !pedidoId) return false;
    const ped = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!ped) return false;
    // Só faz sentido avançar se o pedido ainda está em fase de coleta
    const antesDeColeta = ['Pendente', 'Intenção Agendada', 'Aguardando Confirmação'];
    if (!antesDeColeta.includes(ped.status)) return false;

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Sistema';
    const statusAnterior = ped.status;
    try {
        const { error } = await supabase.from('pedidos').update({
            status: 'Em Coleta',
            confirmacao_comercial_em: ped.confirmacaoComercialEm || new Date().toISOString(),
            confirmacao_comercial_por: ped.confirmacaoComercialPor || 'Placa validada',
            confirmacao_logistica_em: ped.confirmacaoLogisticaEm || new Date().toISOString(),
            confirmacao_logistica_por: ped.confirmacaoLogisticaPor || usuarioNome
        }).eq('id', parseInt(pedidoId));
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: statusAnterior,
            status_novo: 'Em Coleta',
            usuario_nome: usuarioNome,
            usuario_perfil: 'logistica',
            observacao: `🔎 Coleta confirmada por leitura de placa${observacaoExtra ? ' — ' + observacaoExtra : ''}`
        });

        // Registra no manifesto (entra na cegonha) e avisa comercial/logística
        try { if (ped.placaCegonha) await registrarEventoManifesto(ped.placaCegonha, ped, 'coleta', +1); } catch (e) {}
        try { notificarMudancaStatus({ ...ped, status: 'Em Coleta' }, statusAnterior, 'Em Coleta'); } catch (e) {}
        return true;
    } catch (e) {
        console.warn('Não consegui avançar para Em Coleta:', e.message);
        return false;
    }
}

// Varre as leituras auto_ok e avança pra Em Coleta as que ainda não foram.
// Roda no carregamento da tela de validação (é seguro chamar várias vezes).
async function _varrerAutoOkParaColeta(ocorrencias) {
    if (!ocorrencias || !ocorrencias.length) return 0;
    let n = 0;
    for (const o of ocorrencias) {
        if (o.validacao_logistica !== 'auto_ok' || !o.pedido_id) continue;
        const ok = await _avancarParaColeta(o.pedido_id, `foto ${o.ocr_placa_lida || ''} · ${o.ocr_confianca || '?'}% confiança`);
        if (ok) n++;
    }
    if (n > 0) { try { await carregarDadosDoSupabase(); } catch (e) {} }
    return n;
}

async function validarPlaca(ocorrenciaId, resultado) {
    if (!supabase) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';

    // Ao REPROVAR, pedir o motivo — é o que o motorista vai ler no celular
    let motivo = null;
    if (resultado === 'reprovada') {
        motivo = prompt(
            'Por que a foto não confere?\n\n' +
            'O motorista vai ver esta mensagem no celular para refazer a foto.\n' +
            'Ex: "Placa ilegível, foto tremida" / "Placa não corresponde ao veículo do pedido"'
        );
        if (motivo === null) return;            // desistiu
        motivo = motivo.trim() || 'Foto não aprovada. Por favor, envie uma nova foto da placa.';
    }

    try {
        const { error } = await supabase.from('ocorrencias').update({
            validacao_logistica: resultado,
            validado_por: usuarioNome,
            validado_em: new Date().toISOString(),
            motivo_reprovacao: motivo
        }).eq('id', ocorrenciaId);
        if (error) throw error;

        // #3 · Placa CONFERE (manual ou reenvio aprovado) → carro conta como COLETADO
        if (resultado === 'aprovada') {
            try {
                const { data: oc } = await supabase.from('ocorrencias')
                    .select('pedido_id').eq('id', ocorrenciaId).maybeSingle();
                if (oc?.pedido_id) await _avancarParaColeta(oc.pedido_id, 'Placa validada pela logística');
            } catch (e) { /* segue */ }
        }

        // Registrar no histórico do pedido para ficar rastreável
        if (resultado === 'reprovada') {
            try {
                const { data: oc } = await supabase.from('ocorrencias')
                    .select('pedido_id').eq('id', ocorrenciaId).maybeSingle();
                if (oc?.pedido_id) {
                    const ped = pedidosGlobais.find(p => String(p.id) === String(oc.pedido_id));
                    await supabase.from('historico_status').insert({
                        pedido_id: oc.pedido_id,
                        status_anterior: ped?.status || '',
                        status_novo: ped?.status || '',
                        usuario_nome: usuarioNome,
                        usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
                        observacao: `📸 Foto da placa REPROVADA — ${motivo}`
                    });

                    // Avisar o motorista no celular (push)
                    await notificarMotoristaDoPedido(ped, {
                        titulo: '📸 Foto da placa reprovada',
                        corpo: `Pedido #${oc.pedido_id} — ${motivo}`
                    });
                }
            } catch (e) { /* histórico e push são complementares */ }
        }

        renderizarValidacaoPlacas();
    } catch (e) {
        alert('Erro ao validar: ' + e.message);
    }
}

// ============================================
// ETAPA 2 — MANIFESTO DE CARGA + APONTAMENTO FISCAL
// Cada caminhão (cegonha) tem um manifesto declarando a quantidade
// de veículos na carga, com a origem do caminhão. Toda coleta, entrega
// ou transbordo que altere essa quantidade gera:
//   1) atualização do manifesto (registro interno)
//   2) apontamento para o fiscal (atualizar/trocar o seguro)
// ============================================

const LABELS_EVENTO_MANIFESTO = {
    coleta: '📥 Coleta (embarque)',
    entrega: '📤 Entrega ao cliente',
    transbordo_saida: '🔁 Transbordo (saída)',
    transbordo_entrada: '🔁 Transbordo (entrada)'
};

// Registra o evento no manifesto do caminhão e gera o apontamento fiscal
async function registrarEventoManifesto(placaCaminhao, pedido, tipoEvento, delta) {
    if (!supabase || !placaCaminhao) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';

    // 1) Buscar/garantir o manifesto ativo do caminhão
    let manifesto;
    const { data: existente } = await supabase.from('manifestos')
        .select('*').eq('placa_caminhao', placaCaminhao).eq('ativo', true).maybeSingle();

    if (existente) {
        manifesto = existente;
    } else {
        // Cria manifesto novo — a origem do caminhão é a origem deste pedido
        const origem = `${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''}`;
        const { data: novo, error: errNovo } = await supabase.from('manifestos')
            .insert({
                placa_caminhao: placaCaminhao,
                origem_caminhao: origem,
                qtd_veiculos: 0,
                ativo: true
            }).select().single();
        if (errNovo) throw errNovo;
        manifesto = novo;
    }

    const qtdAntes = manifesto.qtd_veiculos || 0;
    const qtdDepois = Math.max(0, qtdAntes + delta);

    // 2) Atualizar quantidade do manifesto
    const { error: errUpd } = await supabase.from('manifestos')
        .update({ qtd_veiculos: qtdDepois, atualizado_em: new Date().toISOString() })
        .eq('id', manifesto.id);
    if (errUpd) throw errUpd;

    // 3) Registrar o item de movimentação do manifesto
    await supabase.from('manifesto_itens').insert({
        manifesto_id: manifesto.id,
        pedido_id: parseInt(pedido.id),
        placa_veiculo: pedido.placa || '',
        tipo_evento: tipoEvento,
        delta,
        qtd_antes: qtdAntes,
        qtd_depois: qtdDepois,
        usuario_nome: usuarioNome
    });

    // 4) Gerar o APONTAMENTO FISCAL (necessidade de atualizar/trocar seguro)
    await supabase.from('apontamentos_fiscais').insert({
        manifesto_id: manifesto.id,
        placa_caminhao: placaCaminhao,
        pedido_id: parseInt(pedido.id),
        tipo_evento: tipoEvento,
        qtd_antes: qtdAntes,
        qtd_depois: qtdDepois,
        origem_caminhao: manifesto.origem_caminhao,
        descricao: `${LABELS_EVENTO_MANIFESTO[tipoEvento] || tipoEvento}: carga do caminhão ${placaCaminhao} passou de ${qtdAntes} para ${qtdDepois} veículo(s). Verificar atualização/troca do seguro.`,
        status: 'pendente',
        usuario_nome: usuarioNome
    });

    // OBS: o apontamento acima continua sendo registrado por evento (fica no
    // painel do fiscal para auditoria). O SINO do fiscal sobre revisão de
    // seguro NÃO toca aqui — ele é consolidado e disparado UMA vez quando o
    // espelho de carga é gerado (carga decidida), em registrarEspelhoFiscal().
}

// ---------- PAINEL DO FISCAL: apontamentos de seguro ----------
async function renderizarApontamentosFiscais() {
    const painel = document.getElementById('painelApontamentosFiscais');
    if (!painel || !supabase) return;

    try {
        const { data, error } = await supabase.from('apontamentos_fiscais')
            .select('*').order('created_at', { ascending: false }).limit(60);
        if (error) throw error;

        const pendentes = (data || []).filter(a => a.status === 'pendente');
        const resolvidos = (data || []).filter(a => a.status !== 'pendente').slice(0, 15);

        const cardApont = (a, acoes) => `
            <div class="conf-card ${a.status === 'pendente' ? '' : 'conf-card-resolvido'}" style="border-left-color:${a.status === 'pendente' ? '#f97316' : '#4ade80'}">
                <div class="conf-card-topo">
                    <span class="carro-patio-id">🚛 ${a.placa_caminhao}</span>
                    <span class="manifesto-qtd">${a.qtd_antes} → ${a.qtd_depois} veíc.</span>
                    <span class="text-muted text-sm" style="margin-left:auto">${a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : ''}</span>
                </div>
                <div class="conf-card-linha">Origem do caminhão: ${a.origem_caminhao || '—'} · Pedido #${a.pedido_id}</div>
                <div class="ocorr-descricao">${a.descricao || ''}</div>
                ${acoes}
            </div>`;

        painel.innerHTML = `
            <div class="patios-resumo">
                <div class="patios-resumo-item ${pendentes.length > 0 ? 'patios-resumo-alerta' : ''}">
                    <strong>${pendentes.length}</strong><span>apontamento(s) de seguro pendente(s)</span>
                </div>
            </div>
            <h3 class="conf-titulo">Pendentes de atualização/troca de seguro</h3>
            ${pendentes.length === 0
                ? '<p class="text-muted text-sm" style="padding:0.5rem 0">Nenhum apontamento pendente. 👌</p>'
                : pendentes.map(a => cardApont(a, `
                    <div class="conf-card-acoes">
                        <button class="btn btn-primary btn-sm" onclick="resolverApontamentoFiscal(${a.id}, 'atualizado')">🔄 Seguro atualizado</button>
                        <button class="btn btn-secondary btn-sm" onclick="resolverApontamentoFiscal(${a.id}, 'trocado')">♻️ Seguro trocado</button>
                        <button class="btn btn-secondary btn-sm" onclick="resolverApontamentoFiscal(${a.id}, 'sem_alteracao')">Sem alteração</button>
                    </div>
                `)).join('')}
            ${resolvidos.length > 0 ? `
                <h3 class="conf-titulo" style="margin-top:1.2rem">Resolvidos recentes</h3>
                ${resolvidos.map(a => cardApont(a, `<div class="conf-card-linha">✔ ${a.resolucao || a.status} ${a.resolvido_por ? '— ' + a.resolvido_por : ''} ${a.resolvido_em ? 'em ' + new Date(a.resolvido_em).toLocaleString('pt-BR') : ''}</div>`)).join('')}
            ` : ''}`;
    } catch (e) {
        console.warn('Apontamentos fiscais não carregados:', e.message);
        painel.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar os apontamentos. Rode a migração da Etapa 2.</p>';
    }
}

async function resolverApontamentoFiscal(id, resolucao) {
    if (!supabase) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Fiscal';
    const labels = { atualizado: 'Seguro atualizado', trocado: 'Seguro trocado', sem_alteracao: 'Sem alteração necessária' };
    try {
        const { error } = await supabase.from('apontamentos_fiscais').update({
            status: 'resolvido',
            resolucao: labels[resolucao] || resolucao,
            resolvido_por: usuarioNome,
            resolvido_em: new Date().toISOString()
        }).eq('id', id);
        if (error) throw error;
        renderizarApontamentosFiscais();
    } catch (e) {
        alert('Erro ao resolver apontamento: ' + e.message);
    }
}

// ---------- PAINEL DE MANIFESTOS (visão logística/fiscal) ----------
async function renderizarManifestos() {
    const painel = document.getElementById('painelManifestos');
    if (!painel || !supabase) return;
    try {
        const { data, error } = await supabase.from('manifestos')
            .select('*').eq('ativo', true).order('placa_caminhao');
        if (error) throw error;

        const comCarga = (data || []).filter(m => (m.qtd_veiculos || 0) > 0);
        if (comCarga.length === 0) {
            painel.innerHTML = '<p class="text-muted text-sm" style="padding:0.5rem 0">Nenhum caminhão com carga declarada no momento.</p>';
            return;
        }

        painel.innerHTML = `<div class="painel-patios-grid">` + comCarga.map(m => `
            <div class="patio-card">
                <div class="patio-header">
                    <span class="patio-nome">🚛 ${m.placa_caminhao}</span>
                    <span class="manifesto-qtd">${m.qtd_veiculos} veíc.</span>
                </div>
                <div class="conf-card-linha">Origem: ${m.origem_caminhao || '—'}</div>
                <div class="conf-card-linha text-sm text-muted">Atualizado: ${m.atualizado_em ? new Date(m.atualizado_em).toLocaleString('pt-BR') : '—'}</div>
                <button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;width:100%" onclick="verItensManifesto(${m.id}, '${m.placa_caminhao}')">Ver movimentações</button>
            </div>
        `).join('') + `</div>`;
    } catch (e) {
        console.warn('Manifestos não carregados:', e.message);
        painel.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar os manifestos.</p>';
    }
}

async function verItensManifesto(manifestoId, placa) {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('manifesto_itens')
            .select('*').eq('manifesto_id', manifestoId).order('created_at', { ascending: false });

        const existing = document.getElementById('modalManifesto');
        if (existing) existing.remove();

        const linhas = (data || []).map(it => `
            <tr>
                <td>${it.created_at ? new Date(it.created_at).toLocaleString('pt-BR') : ''}</td>
                <td>${LABELS_EVENTO_MANIFESTO[it.tipo_evento] || it.tipo_evento}</td>
                <td>#${it.pedido_id} · ${it.placa_veiculo || ''}</td>
                <td style="text-align:center">${it.delta > 0 ? '+' : ''}${it.delta}</td>
                <td style="text-align:center">${it.qtd_antes} → ${it.qtd_depois}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted">Sem movimentações.</td></tr>';

        const modal = document.createElement('div');
        modal.id = 'modalManifesto';
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:680px">
                <span class="close" onclick="document.getElementById('modalManifesto').remove()">&times;</span>
                <h2>🚛 Manifesto — ${placa}</h2>
                <div class="tabela-scroll">
                    <table class="tabela-padrao">
                        <thead><tr><th>Quando</th><th>Evento</th><th>Veículo</th><th>Δ</th><th>Carga</th></tr></thead>
                        <tbody>${linhas}</tbody>
                    </table>
                </div>
            </div>`;
        document.body.appendChild(modal);
    } catch (e) {
        alert('Erro ao carregar movimentações: ' + e.message);
    }
}

// ============================================
// FLUXO DE CONFIRMAÇÕES (T-4h LOGÍSTICA / T-2h COMERCIAL)
// Intenção pode nascer com caminhão/motorista A DEFINIR,
// mas a confirmação da logística exige tudo definido (gate).
// ============================================

// Registra a intenção sem caminhão/motorista (a definir)
// ---------- CANCELAR / EXCLUIR PEDIDO PENDENTE ----------

// Cancela: marca como Cancelado, sai da operação mas fica no histórico
async function cancelarPedido(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;
    if (p.status !== 'Pendente') {
        exibirMensagem('mensagemLogistica', 'Só é possível cancelar pedidos pendentes por aqui. Para outros status, use Avançar → Cancelado.', 'error');
        return;
    }

    const motivo = prompt(`Cancelar o pedido #${p.id} (${p.cliente || ''})?\n\nMotivo do cancelamento (opcional):`);
    if (motivo === null) return; // desistiu

    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    try {
        const { error } = await supabase.from('pedidos')
            .update({ status: 'Cancelado' }).eq('id', pedidoId);
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: 'Pendente',
            status_novo: 'Cancelado',
            usuario_nome: usuarioNome,
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
            observacao: `🚫 Pedido cancelado${motivo.trim() ? ': ' + motivo.trim() : ''}`
        });

        // Sino: avisa o comercial responsável do cancelamento
        try { notificarMudancaStatus(p, 'Pendente', 'Cancelado'); } catch (e) {}

        await carregarDadosDoSupabase();
        renderizarPedidosDrag();
        if (typeof renderizarOcupacao === 'function') renderizarOcupacao();
        exibirMensagem('mensagemLogistica', `✅ Pedido #${pedidoId} cancelado. Ele sai da operação e fica registrado no histórico.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemLogistica', 'Erro ao cancelar: ' + e.message, 'error');
    }
}

// Exclui de vez: para pedido criado por engano (apaga do banco)
async function excluirPedido(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;
    if (p.status !== 'Pendente') {
        exibirMensagem('mensagemLogistica', 'Só é possível excluir pedidos pendentes.', 'error');
        return;
    }

    if (!confirm(`⚠️ EXCLUIR DEFINITIVAMENTE o pedido #${p.id} (${p.cliente || ''})?\n\nUse isto apenas para pedidos criados por engano. Esta ação NÃO pode ser desfeita.\n\nSe o transporte foi combinado e depois desmarcado, prefira CANCELAR (mantém o histórico).`)) return;

    try {
        // Limpa vínculos antes de apagar o pedido
        await supabase.from('historico_status').delete().eq('pedido_id', pedidoId);
        await supabase.from('ocorrencias').delete().eq('pedido_id', pedidoId);
        const { error } = await supabase.from('pedidos').delete().eq('id', pedidoId);
        if (error) throw error;

        await carregarDadosDoSupabase();
        renderizarPedidosDrag();
        if (typeof renderizarOcupacao === 'function') renderizarOcupacao();
        exibirMensagem('mensagemLogistica', `🗑️ Pedido #${pedidoId} excluído definitivamente.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemLogistica', 'Erro ao excluir: ' + e.message, 'error');
    }
}

async function registrarIntencaoADefinir(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;
    if (!confirm(`Registrar intenção do pedido #${p.id} com caminhão e motorista A DEFINIR?`)) return;

    try {
        const { error } = await supabase.from('pedidos')
            .update({ status: 'Intenção Agendada' })
            .eq('id', pedidoId);
        if (error) throw error;

        await registrarMovimentacaoPatio(
            { ...p, status: 'Intenção Agendada' },
            '⏳ Intenção registrada — caminhão e motorista a definir'
        );

        await carregarDadosDoSupabase();
        if (typeof renderizarAlocacao === 'function') renderizarAlocacao();
        if (typeof carregarPainel === 'function') carregarPainel();
        notificar({
            perfil: 'comercial', nome: p.responsavelComercial, pedidoId: p.id, tipo: 'status',
            titulo: 'Intenção registrada pela logística',
            mensagem: `${p.cliente} · ${p.modelo || ''} ${p.placa || ''} — caminhão a definir`
        });

        exibirMensagem('mensagemLogistica', `✅ Intenção do pedido #${pedidoId} registrada (a definir). Ela aparece na aba ⏰ Confirmações.`, 'success');
    } catch (e) {
        alert('Erro ao registrar intenção: ' + e.message);
    }
}

// Prazo do checkpoint: quanto falta (ou há quanto tempo estourou)
function infoPrazoConfirmacao(p, horasAntes) {
    if (!p.dataPrevColeta) return { semData: true, texto: 'sem horário agendado', atrasado: false };
    const prazo = new Date(p.dataPrevColeta).getTime() - horasAntes * 3600000;
    const diff = prazo - Date.now();
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    const txt = (h > 0 ? `${h}h ` : '') + `${m}min`;
    return {
        semData: false,
        atrasado: diff < 0,
        texto: diff < 0 ? `⛔ prazo estourado há ${txt}` : `⏳ faltam ${txt}`,
        prazoFmt: new Date(prazo).toLocaleString('pt-BR')
    };
}

function badgePrazoHTML(info) {
    if (info.semData) return `<span class="prazo-badge prazo-semdata" title="Defina a data/hora prevista de coleta no pedido">📅 ${info.texto}</span>`;
    return `<span class="prazo-badge ${info.atrasado ? 'prazo-atrasado' : 'prazo-ok'}" title="Prazo do checkpoint: ${info.prazoFmt}">${info.texto}</span>`;
}

// Painel da LOGÍSTICA: intenções a confirmar + visão das liberações do comercial
function renderizarPainelConfirmacoes() {
    const painel = document.getElementById('painelConfirmacoes');
    if (!painel) return;

    const ordenar = (a, b) => {
        if (!a.dataPrevColeta) return 1;
        if (!b.dataPrevColeta) return -1;
        return new Date(a.dataPrevColeta) - new Date(b.dataPrevColeta);
    };

    const intencoes = pedidosGlobais.filter(p => p.status === 'Intenção Agendada').sort(ordenar);
    const aguardando = pedidosGlobais.filter(p => p.status === 'Aguardando Confirmação').sort(ordenar);
    const atrasadas = intencoes.filter(p => infoPrazoConfirmacao(p, 4).atrasado).length;

    const cardConf = (p, horasAntes, botaoHTML) => {
        const info = infoPrazoConfirmacao(p, horasAntes);
        return `
        <div class="conf-card ${info.atrasado ? 'conf-card-atrasada' : ''}">
            <div class="conf-card-topo">
                <span class="carro-patio-id">#${p.id}</span>
                <strong>${p.cliente || '—'}</strong>
                ${badgePrazoHTML(info)}
            </div>
            <div class="conf-card-linha">🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong>
                ${p.grupoId ? `<span class="badge-grupo">🔗 grupo</span>` : ''}</div>
            <div class="conf-card-linha mpedido-rota">${rotaComTransbordoHTML(p)}</div>
            <div class="conf-card-linha">
                🚛 ${p.placaCegonha ? p.placaCegonha : '<span class="tag-adefinir">A DEFINIR</span>'}
                &nbsp;·&nbsp; 👤 ${p.motorista1 ? p.motorista1 : '<span class="tag-adefinir">A DEFINIR</span>'}
                &nbsp;·&nbsp; 📅 Coleta: ${p.dataPrevColeta ? new Date(p.dataPrevColeta).toLocaleString('pt-BR') : '—'}
            </div>
            <div class="conf-card-acoes">${botaoHTML}</div>
        </div>`;
    };

    const blocoIntencoes = intencoes.length === 0
        ? '<p class="text-muted text-sm" style="padding:0.5rem 0">Nenhuma intenção aguardando confirmação. 👌</p>'
        : intencoes.map(p => cardConf(p, 4, `
            <button class="btn btn-primary btn-sm" onclick="abrirModalStatus(${p.id})">✅ Confirmar Intenção</button>
            <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Histórico</button>
        `)).join('');

    const blocoAguardando = aguardando.length === 0
        ? '<p class="text-muted text-sm" style="padding:0.5rem 0">Nenhum pedido aguardando o comercial.</p>'
        : aguardando.map(p => cardConf(p, 2, `
            <span class="text-muted text-sm">✔ Intenção confirmada ${p.confLogisticaPor ? 'por ' + p.confLogisticaPor : ''}${p.confLogisticaEm ? ' em ' + new Date(p.confLogisticaEm).toLocaleString('pt-BR') : ''} — aguardando liberação do comercial</span>
        `)).join('');

    painel.innerHTML = `
        <div class="patios-resumo">
            <div class="patios-resumo-item"><strong>${intencoes.length}</strong><span>intenç${intencoes.length === 1 ? 'ão' : 'ões'} para confirmar (até 4h antes)</span></div>
            <div class="patios-resumo-item ${atrasadas > 0 ? 'patios-resumo-alerta' : ''}"><strong>${atrasadas}</strong><span>com prazo estourado — coleta BLOQUEADA</span></div>
            <div class="patios-resumo-item"><strong>${aguardando.length}</strong><span>com o comercial (liberação até 2h antes)</span></div>
        </div>
        <h3 class="conf-titulo">1️⃣ Intenções aguardando SUA confirmação</h3>
        <p class="text-muted text-sm" style="margin-bottom:0.6rem">Confirme (ou altere) até <strong>4 horas antes</strong> da coleta. Sem esta confirmação — e sem caminhão e motorista definidos — o pedido <strong>não avança</strong>.</p>
        ${blocoIntencoes}
        <h3 class="conf-titulo" style="margin-top:1.2rem">2️⃣ Com o comercial (liberação para coleta)</h3>
        ${blocoAguardando}`;
}

// Painel do COMERCIAL: liberações para coleta (T-2h)
function renderizarLiberacoesComercial() {
    const painel = document.getElementById('liberacoesComercial');
    if (!painel) return;

    const lista = pedidosGlobais.filter(p => p.status === 'Aguardando Confirmação')
        .sort((a, b) => {
            if (!a.dataPrevColeta) return 1;
            if (!b.dataPrevColeta) return -1;
            return new Date(a.dataPrevColeta) - new Date(b.dataPrevColeta);
        });

    if (lista.length === 0) { painel.innerHTML = ''; return; }

    const atrasadas = lista.filter(p => infoPrazoConfirmacao(p, 2).atrasado).length;

    painel.innerHTML = `
        <div class="card liberacoes-card">
            <h2>🔓 Liberações para Coleta <span class="patio-qtd">${lista.length}</span>
                ${atrasadas > 0 ? `<span class="prazo-badge prazo-atrasado" style="margin-left:0.5rem">${atrasadas} com prazo estourado</span>` : ''}
            </h2>
            <p class="text-muted text-sm" style="margin-bottom:0.7rem">A logística confirmou a intenção destes pedidos. Libere o carro para coleta até <strong>2 horas antes</strong> do horário agendado — sem a liberação, a coleta fica <strong>bloqueada</strong>.</p>
            ${lista.map(p => {
                const info = infoPrazoConfirmacao(p, 2);
                return `
                <div class="conf-card ${info.atrasado ? 'conf-card-atrasada' : ''}">
                    <div class="conf-card-topo">
                        <span class="carro-patio-id">#${p.id}</span>
                        <strong>${p.cliente || '—'}</strong>
                        ${badgePrazoHTML(info)}
                    </div>
                    <div class="conf-card-linha">🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong> | 🚛 ${p.placaCegonha || '—'} · 👤 ${p.motorista1 || '—'}</div>
                    <div class="conf-card-linha">📅 Coleta: ${p.dataPrevColeta ? new Date(p.dataPrevColeta).toLocaleString('pt-BR') : '—'}
                        ${p.confLogisticaPor ? ` · ✔ Logística: ${p.confLogisticaPor}` : ''}</div>
                    <div class="conf-card-acoes">
                        <button class="btn btn-primary btn-sm" onclick="abrirModalStatus(${p.id})">🔓 Liberar para Coleta</button>
                        <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Histórico</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

// ============================================
// CENTRAL DE NOTIFICAÇÕES
// Avisa cada setor no momento certo do fluxo do pedido.
// 'acao'  = alguém precisa fazer algo   (destaque forte)
// 'status'= apenas acompanhamento        (discreto)
// ============================================

let notificacoesGlobais = [];
let _notifIntervalo = null;

// Cria uma notificação. Nunca interrompe o fluxo se falhar.
async function notificar({ perfil, nome, pedidoId, tipo, titulo, mensagem }) {
    if (!supabase) return;
    try {
        await supabase.from('notificacoes').insert({
            perfil_destino: perfil || null,
            nome_destino: nome || null,
            pedido_id: pedidoId ? parseInt(pedidoId) : null,
            tipo: tipo || 'status',
            titulo,
            mensagem: mensagem || null,
            origem: document.getElementById('usuarioLogado')?.textContent || 'Sistema'
        });
    } catch (e) {
        console.warn('Notificação não registrada:', e.message);
    }
}

// Notificação que também vira push no celular (para o motorista)
async function notificarComPush(destino, dados) {
    await notificar(destino);
    // push só quando há motorista alvo
    if (destino.motoristaPedido && typeof notificarMotoristaDoPedido === 'function') {
        try {
            await notificarMotoristaDoPedido(destino.motoristaPedido,
                { titulo: destino.titulo, corpo: destino.mensagem || '' });
        } catch (e) { /* push é complementar */ }
    }
}

// As minhas notificações: pelo meu perfil ou pelo meu nome
function _notifMinhas(lista) {
    const meuPerfil = typeof perfilAtual !== 'undefined' ? perfilAtual : null;
    const meuNome = (document.getElementById('usuarioLogado')?.textContent || '').trim().toLowerCase();
    return (lista || []).filter(n => {
        if (n.nome_destino) return n.nome_destino.trim().toLowerCase() === meuNome;
        if (!n.perfil_destino) return false;
        if (meuPerfil === 'admin') return true;              // admin vê tudo
        return n.perfil_destino === meuPerfil;
    });
}

async function carregarNotificacoes() {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('notificacoes')
            .select('*').order('created_at', { ascending: false }).limit(80);
        notificacoesGlobais = _notifMinhas(data);
        atualizarSino();
        // atualiza os selos numéricos das sub-abas da logística
        if (typeof atualizarSelosLogistica === 'function') atualizarSelosLogistica();
    } catch (e) {
        console.warn('Notificações não carregadas:', e.message);
    }
}

// #2 · Selos de pendência nas sub-abas da logística
// Aparecem número em "⏰ Confirmações" e "🔎 Validação de Placas".
// Ajuda a bater o olho e saber onde tem coisa esperando.
async function atualizarSelosLogistica() {
    // Confirmações: intenção + aguardando confirmação + solicitações de edição
    try {
        const pedPend = (pedidosGlobais || []).filter(p =>
            p.status === 'Intenção Agendada' || p.status === 'Aguardando Confirmação').length;
        let edicoes = 0;
        if (supabase) {
            try {
                const { count } = await supabase.from('solicitacoes_edicao')
                    .select('*', { count: 'exact', head: true }).eq('status', 'pendente');
                edicoes = count || 0;
            } catch (_) {}
        }
        const total = pedPend + edicoes;
        const el = document.getElementById('seloConfirmacoes');
        if (el) {
            el.textContent = total > 99 ? '99+' : total;
            el.style.display = total > 0 ? '' : 'none';
        }
    } catch (_) {}

    // Validação de Placas: fotos com validacao_logistica pendente
    try {
        if (!supabase) return;
        const { count } = await supabase.from('ocorrencias')
            .select('*', { count: 'exact', head: true })
            .eq('tipo', 'foto_placa')
            .or('validacao_logistica.is.null,validacao_logistica.eq.pendente');
        const total = count || 0;
        const el = document.getElementById('seloValidacaoPlacas');
        if (el) {
            el.textContent = total > 99 ? '99+' : total;
            el.style.display = total > 0 ? '' : 'none';
        }
    } catch (_) {}
}

function atualizarSino() {
    const contador = document.getElementById('sinoContador');
    if (!contador) return;
    const naoLidas = notificacoesGlobais.filter(n => !n.lida);
    const temAcao = naoLidas.some(n => n.tipo === 'acao');

    if (naoLidas.length > 0) {
        contador.textContent = naoLidas.length > 99 ? '99+' : naoLidas.length;
        contador.style.display = '';
        contador.classList.toggle('sino-acao', temAcao);
    } else {
        contador.style.display = 'none';
    }
    if (document.getElementById('painelNotificacoes')?.classList.contains('aberto')) {
        renderizarNotificacoes();
    }
}

function alternarPainelNotificacoes() {
    const painel = document.getElementById('painelNotificacoes');
    if (!painel) return;
    const abrindo = !painel.classList.contains('aberto');
    painel.classList.toggle('aberto', abrindo);
    if (abrindo) {
        renderizarNotificacoes();
        setTimeout(() => {
            document.addEventListener('click', function fechar(e) {
                if (!painel.parentElement.contains(e.target)) {
                    painel.classList.remove('aberto');
                    document.removeEventListener('click', fechar);
                }
            });
        }, 0);
    }
}

function _notifQuando(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'ontem';
    if (d < 7) return `há ${d} dias`;
    return new Date(iso).toLocaleDateString('pt-BR');
}

function renderizarNotificacoes() {
    const lista = document.getElementById('pnLista');
    if (!lista) return;

    if (notificacoesGlobais.length === 0) {
        lista.innerHTML = '<div class="pn-vazio">Nenhuma notificação por aqui. 👌</div>';
        return;
    }

    lista.innerHTML = notificacoesGlobais.map(n => `
        <div class="pn-item ${n.lida ? '' : 'pn-nova'} ${n.tipo === 'acao' ? 'pn-acao' : ''}"
             onclick="abrirNotificacao(${n.id}, ${n.pedido_id || 'null'})">
            <div class="pn-item-topo">
                <span class="pn-titulo">${n.tipo === 'acao' ? '⚡ ' : ''}${n.titulo}</span>
                <span class="pn-quando">${_notifQuando(n.created_at)}</span>
            </div>
            ${n.mensagem ? `<div class="pn-msg">${n.mensagem}</div>` : ''}
            ${n.pedido_id ? `<div class="pn-pedido">Pedido #${n.pedido_id}</div>` : ''}
        </div>`).join('');
}

async function abrirNotificacao(id, pedidoId) {
    try {
        await supabase.from('notificacoes')
            .update({ lida: true, lida_em: new Date().toISOString() }).eq('id', id);
        const n = notificacoesGlobais.find(x => x.id === id);
        if (n) { n.lida = true; }
        atualizarSino();
    } catch (e) { /* segue */ }

    if (pedidoId && typeof abrirHistorico === 'function') {
        document.getElementById('painelNotificacoes')?.classList.remove('aberto');
        abrirHistorico(pedidoId);
    }
}

async function marcarTodasLidas() {
    const ids = notificacoesGlobais.filter(n => !n.lida).map(n => n.id);
    if (ids.length === 0) return;
    try {
        await supabase.from('notificacoes')
            .update({ lida: true, lida_em: new Date().toISOString() }).in('id', ids);
        notificacoesGlobais.forEach(n => n.lida = true);
        atualizarSino();
        renderizarNotificacoes();
    } catch (e) {
        console.warn('Erro ao marcar como lidas:', e.message);
    }
}

// Verifica novidades de tempos em tempos
// ============================================
// #5 · REALTIME — a tela se atualiza sozinha quando algo muda no banco
// ============================================
let _realtimeCanal = null;
let _realtimeDebounce = null;

function _recarregarRealtime() {
    clearTimeout(_realtimeDebounce);
    _realtimeDebounce = setTimeout(async () => {
        try { await carregarDadosDoSupabase(); } catch (e) {}
        // Views da logística que o carregarDadosDoSupabase não cobre:
        try { if (typeof renderizarOcupacao === 'function') renderizarOcupacao(); } catch (e) {}
        try { if (typeof renderizarPainelCegonhas === 'function') renderizarPainelCegonhas(); } catch (e) {}
        try { if (typeof renderizarKanban === 'function') renderizarKanban(); } catch (e) {}
        try { if (typeof renderizarRotas === 'function') renderizarRotas(); } catch (e) {}
        // Notificações no sino, instantâneas:
        try { if (typeof carregarNotificacoes === 'function') await carregarNotificacoes(); } catch (e) {}
    }, 400); // agrupa mudanças em rajada num só refresh
}

function iniciarRealtime() {
    if (typeof supabase === 'undefined' || !supabase) return;
    if (_realtimeCanal) return; // já assinado nesta sessão
    try {
        _realtimeCanal = supabase.channel('movemaster-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, _recarregarRealtime)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ocorrencias' }, _recarregarRealtime)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes' }, _recarregarRealtime)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_trechos' }, _recarregarRealtime)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rotas_planejadas' }, _recarregarRealtime)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'historico_status' }, _recarregarRealtime)
            .subscribe();
    } catch (e) {
        console.warn('Realtime não iniciado (usando atualização por intervalo):', e);
    }
}

function iniciarMonitorNotificacoes() {
    if (_notifIntervalo) clearInterval(_notifIntervalo);
    carregarNotificacoes();
    _notifIntervalo = setInterval(carregarNotificacoes, 60000);   // 1 min
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) carregarNotificacoes();
    });
}

// Roteia a notificação conforme a etapa do fluxo (mapa do desenho):
//   Intenção Agendada       -> COMERCIAL precisa aprovar/liberar  (ação)
//   Aguardando Confirmação  -> COMERCIAL precisa liberar a coleta (ação)
//   Em Coleta               -> LOGÍSTICA: comercial liberou       (ação)
//   Em Transporte           -> COMERCIAL: carga rodando           (status)
//   Transbordo              -> COMERCIAL: mudou de caminhão/pátio (status)
//   Entregue                -> COMERCIAL: finalizado              (ação)
// #6 · Mini-painel na tela do comercial: mostra TODAS as rotas planejadas
// (só visualização) com a ocupação atual — o comercial usa pra saber onde
// ainda cabe pedido e vender pra encaixar.
function renderizarRotasComercial() {
    const card = document.getElementById('cardRotasDisponiveis');
    const cont = document.getElementById('listaRotasComercial');
    if (!card || !cont) return;

    const rotas = (typeof rotasGlobais !== 'undefined' ? rotasGlobais : []).filter(r =>
        !['concluida', 'cancelada'].includes(String(r.status || '').toLowerCase()));
    if (!rotas.length) { card.style.display = 'none'; return; }
    card.style.display = '';

    cont.innerHTML = rotas.map(r => {
        const vinculados = (typeof pedidosGlobais !== 'undefined' ? pedidosGlobais : [])
            .filter(p => (
                String(p.rotaId || p.rota_id) === String(r.id) ||
                (r.placa_cegonha && p.placaCegonha === r.placa_cegonha)
            ) && !['Entregue','Cancelado'].includes(p.status)).length;
        // Capacidade: vem do CADASTRO do veículo (fonte da verdade); só cai no
        // r.capacidade se o veículo não tiver, e 8 é último recurso.
        const veic = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
            .find(v => v.placa === r.placa_cegonha);
        const capacidade = Number(veic?.capacidade) || Number(r.capacidade) || 8;
        const vagas = Math.max(0, capacidade - vinculados);
        const pct = Math.round((vinculados / capacidade) * 100);
        const corPct = vagas === 0 ? '#4ade80' : (pct >= 70 ? '#fbbf24' : '#60a5fa');
        const paradas = (typeof paradasDaRota === 'function' ? paradasDaRota(r) : []) || [];
        const rotaTxt = paradas.length
            ? paradas.map((c, i) => `<span class="rota-ponto ${i === 0 ? 'rota-coletar' : i === paradas.length - 1 ? 'rota-destino' : 'rota-patio'}">${c}</span>`).join('<span class="rota-seta">→</span>')
            : '<span class="text-muted">Rota sem cidades cadastradas</span>';
        const dataSaida = r.data_saida ? new Date(r.data_saida + 'T12:00').toLocaleDateString('pt-BR') : '';
        const seloVaga = vagas === 0
            ? '<span class="rota-com-selo rota-com-cheia">🚫 Sem vagas</span>'
            : `<span class="rota-com-selo rota-com-vagas">✅ ${vagas} vaga(s)</span>`;
        return `<div class="rota-com-card">
            <div class="rota-com-topo">
                <div class="rota-com-nome">${r.nome || 'Rota #' + r.id}</div>
                ${seloVaga}
            </div>
            <div class="rota-com-meta">🚛 <strong>${r.placa_cegonha || 'a definir'}</strong>${dataSaida ? ' · 📅 ' + dataSaida : ''}${typeof etaRotaHTML === 'function' ? etaRotaHTML(r) : ''}</div>
            <div class="rota-com-cidades">${rotaTxt}</div>
            <div class="rota-com-ocup"><div class="rota-com-barra"><div class="rota-com-barra-inner" style="width:${Math.min(pct, 100)}%;background:${corPct}"></div></div><span>${vinculados}/${capacidade}</span></div>
        </div>`;
    }).join('');
}

function notificarMudancaStatus(pedido, statusAnterior, statusNovo) {
    if (!pedido) return;
    const quem = pedido.responsavelComercial || null;
    const idPed = pedido.id;
    const resumo = `${pedido.cliente || ''} · ${pedido.modelo || ''} ${pedido.placa || ''}`.trim();

    switch (statusNovo) {
        case 'Intenção Agendada':
            // Informativo: comercial só precisa saber que a logística agendou.
            // Ele NÃO age agora — só quando o pedido virar Aguardando Confirmação.
            notificar({ perfil: 'comercial', nome: quem, pedidoId: idPed, tipo: 'status',
                titulo: '📅 Intenção de carregamento agendada',
                mensagem: `${resumo}${pedido.placaCegonha ? ' · cegonha ' + pedido.placaCegonha : ''} — a logística agendou. Você será avisado quando precisar liberar a coleta.` });
            break;

        case 'Aguardando Confirmação':
            // AÇÃO do comercial: liberar a coleta com o cliente.
            notificar({ perfil: 'comercial', nome: quem, pedidoId: idPed, tipo: 'acao',
                titulo: '👉 Libere a coleta deste pedido',
                mensagem: `${resumo} — confirme com o cliente e libere para a coleta acontecer.` });
            break;

        case 'Em Coleta':
            // AÇÃO da logística: coleta liberada, pode ir buscar o carro.
            notificar({ perfil: 'logistica', pedidoId: idPed, tipo: 'acao',
                titulo: '🚚 Comercial liberou — pode coletar',
                mensagem: `${resumo} — direcionar para a coleta e validar a placa na chegada.` });
            break;

        case 'Em Transporte':
            // Informativo p/ o comercial: só saber que saiu.
            notificar({ perfil: 'comercial', nome: quem, pedidoId: idPed, tipo: 'status',
                titulo: '🚛 Seu pedido está em transporte',
                mensagem: `${resumo}${pedido.placaCegonha ? ' · cegonha ' + pedido.placaCegonha : ''} — saiu do ponto de coleta.` });
            break;

        case 'Transbordo':
            notificar({ perfil: 'comercial', nome: quem, pedidoId: idPed, tipo: 'status',
                titulo: '🔁 Transbordo realizado',
                mensagem: `${resumo} — carro trocou de cegonha durante o trajeto.` });
            break;

        case 'Entregue':
            // AÇÃO do comercial: registrar a comprovação (fecha a receita).
            notificar({ perfil: 'comercial', nome: quem, pedidoId: idPed, tipo: 'acao',
                titulo: '✅ Entrega finalizada — registre a comprovação',
                mensagem: `${resumo} — descarga concluída. Registre a comprovação de pagamento ou repasse ao financeiro para conferir a receita.` });
            break;

        case 'Cancelado':
            notificar({ perfil: 'comercial', nome: quem, pedidoId: idPed, tipo: 'status',
                titulo: '🚫 Pedido cancelado',
                mensagem: resumo });
            break;
    }
}

// ============================================
// ORÇAMENTO POR HISTÓRICO DE FRETES
// Busca o que já foi cobrado em transportes parecidos.
// Se não achar a combinação exata, vai abrindo o critério
// e deixa claro em cima do que a sugestão foi feita.
// ============================================

const CATEGORIAS_VEICULO = {
    hatch:       'Hatch',
    sedan:       'Sedan',
    suv:         'SUV',
    caminhonete: 'Caminhonete',
    moto:        'Moto'
};

function _orcNorm(s) {
    return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[\s\-–—_.]+/g, '').trim();
}

function _orcMoeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// Estatísticas de uma lista de pedidos
function _orcEstatisticas(lista) {
    const valores = lista.map(p => parseFloat(p.valorFrete) || 0).filter(v => v > 0).sort((a, b) => a - b);
    if (valores.length === 0) return null;
    const soma = valores.reduce((a, v) => a + v, 0);
    const meio = Math.floor(valores.length / 2);
    return {
        qtd: valores.length,
        media: soma / valores.length,
        mediana: valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2,
        min: valores[0],
        max: valores[valores.length - 1]
    };
}

function calcularOrcamento() {
    const ufO = document.getElementById('orcUfOrigem').value;
    const cidO = document.getElementById('orcCidadeOrigem').value;
    const ufD = document.getElementById('orcUfDestino').value;
    const cidD = document.getElementById('orcCidadeDestino').value;
    const categoria = document.getElementById('orcCategoria').value;
    const meses = parseInt(document.getElementById('orcPeriodo').value) || 0;
    const qtdCarros = parseInt(document.getElementById('orcQtdCarros').value) || 1;
    const painel = document.getElementById('resultadoOrcamento');

    if (!ufO || !cidO || !ufD || !cidD) {
        painel.innerHTML = '<div class="orc-aviso">Informe a origem e o destino para buscar o histórico.</div>';
        return;
    }

    // Recorte de período
    let base = pedidosGlobais.filter(p =>
        p.status !== 'Cancelado' && (parseFloat(p.valorFrete) || 0) > 0);

    if (meses > 0) {
        const limite = new Date();
        limite.setMonth(limite.getMonth() - meses);
        const limiteISO = limite.toISOString().slice(0, 10);
        base = base.filter(p => {
            const d = String(p.dataPrevColeta || p.dataSolicitacao || p.createdAt || '').slice(0, 10);
            return d && d >= limiteISO;
        });
    }

    const mesmaRota = (p) =>
        _orcNorm(`${p.cidadeOrigem}/${p.ufOrigem}`) === _orcNorm(`${cidO}/${ufO}`) &&
        _orcNorm(`${p.cidadeDestino}/${p.ufDestino}`) === _orcNorm(`${cidD}/${ufD}`);

    const mesmaCategoria = (p) => !categoria || p.categoriaVeiculo === categoria;

    // Níveis de busca, do mais preciso ao mais amplo
    const niveis = [
        {
            id: 'exato',
            titulo: categoria
                ? `Mesma rota e categoria ${CATEGORIAS_VEICULO[categoria]}`
                : 'Mesma rota',
            confianca: 'alta',
            lista: base.filter(p => mesmaRota(p) && mesmaCategoria(p))
        },
        {
            id: 'rota',
            titulo: 'Mesma rota, qualquer categoria',
            confianca: 'media',
            lista: base.filter(mesmaRota)
        },
        {
            id: 'volta',
            titulo: 'Mesma rota no sentido inverso',
            confianca: 'baixa',
            lista: base.filter(p =>
                _orcNorm(`${p.cidadeOrigem}/${p.ufOrigem}`) === _orcNorm(`${cidD}/${ufD}`) &&
                _orcNorm(`${p.cidadeDestino}/${p.ufDestino}`) === _orcNorm(`${cidO}/${ufO}`))
        },
        {
            id: 'categoria',
            titulo: categoria
                ? `Outras rotas, mesma categoria (${CATEGORIAS_VEICULO[categoria]})`
                : 'Outras rotas',
            confianca: 'baixa',
            lista: base.filter(mesmaCategoria)
        }
    ];

    // Usa o primeiro nível com pelo menos 1 registro
    const usado = niveis.find(n => n.lista.length > 0);

    if (!usado) {
        painel.innerHTML = `
            <div class="card orc-resultado">
                <div class="orc-aviso">
                    Nenhum frete encontrado para <strong>${cidO}/${ufO} → ${cidD}/${ufD}</strong>
                    no período escolhido.<br>
                    <span class="text-sm">Tente ampliar o período para "Todo o histórico" ou deixar a categoria em branco.</span>
                </div>
            </div>`;
        return;
    }

    const est = _orcEstatisticas(usado.lista);
    const sugestao = est.mediana;   // mediana resiste melhor a valores fora da curva
    const total = sugestao * qtdCarros;

    const corConf = { alta: '#4ade80', media: '#fbbf24', baixa: '#fb923c' }[usado.confianca];
    const rotuloConf = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }[usado.confianca];

    const recentes = [...usado.lista].sort((a, b) => {
        const da = String(a.dataPrevColeta || a.createdAt || '');
        const db = String(b.dataPrevColeta || b.createdAt || '');
        return db.localeCompare(da);
    }).slice(0, 8);

    painel.innerHTML = `
    <div class="card orc-resultado">
        <div class="orc-sugestao">
            <div class="orc-sug-principal">
                <span class="orc-sug-rot">Valor sugerido por carro</span>
                <span class="orc-sug-num">${_orcMoeda(sugestao)}</span>
                <span class="orc-sug-obs">mediana de ${est.qtd} frete(s) encontrado(s)</span>
            </div>
            ${qtdCarros > 1 ? `
            <div class="orc-sug-total">
                <span class="orc-sug-rot">Total para ${qtdCarros} carros</span>
                <span class="orc-sug-num" style="color:#60a5fa">${_orcMoeda(total)}</span>
            </div>` : ''}
        </div>

        <div class="orc-base">
            <span class="orc-conf" style="color:${corConf};border-color:${corConf}55;background:${corConf}18">
                Confiança ${rotuloConf}
            </span>
            <span>Base usada: <strong>${usado.titulo}</strong></span>
        </div>

        <div class="orc-faixas">
            <div class="orc-faixa"><span>Menor cobrado</span><strong>${_orcMoeda(est.min)}</strong></div>
            <div class="orc-faixa"><span>Média</span><strong>${_orcMoeda(est.media)}</strong></div>
            <div class="orc-faixa"><span>Mediana</span><strong style="color:#4ade80">${_orcMoeda(est.mediana)}</strong></div>
            <div class="orc-faixa"><span>Maior cobrado</span><strong>${_orcMoeda(est.max)}</strong></div>
        </div>

        <h3 class="orc-titulo-lista">Fretes usados como referência</h3>
        <div class="tabela-scroll">
            <table class="ocup-tabela">
                <thead><tr><th>Data</th><th>Cliente</th><th>Veículo</th><th>Rota</th><th style="text-align:right">Valor</th></tr></thead>
                <tbody>
                    ${recentes.map(p => `
                        <tr>
                            <td class="ocup-sub">${p.dataPrevColeta ? new Date(p.dataPrevColeta).toLocaleDateString('pt-BR') : '—'}</td>
                            <td>${p.cliente || '—'}</td>
                            <td class="ocup-sub">${p.modelo || ''}${p.categoriaVeiculo ? ` <span class="orc-cat">${CATEGORIAS_VEICULO[p.categoriaVeiculo] || p.categoriaVeiculo}</span>` : ''}</td>
                            <td class="ocup-sub">${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</td>
                            <td style="text-align:right;font-weight:600">${_orcMoeda(p.valorFrete)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        ${usado.lista.length > recentes.length
            ? `<p class="text-muted text-sm" style="margin-top:0.6rem">Mostrando os ${recentes.length} mais recentes de ${usado.lista.length} encontrados.</p>`
            : ''}
    </div>`;
}

// Preenche os selects de UF/cidade da tela de orçamento,
// usando as mesmas listas do formulário de pedido.
function prepararOrcamento() {
    [['orcUfOrigem','orcCidadeOrigem'], ['orcUfDestino','orcCidadeDestino']].forEach(([ufId, cidId]) => {
        const sel = document.getElementById(ufId);
        if (!sel) return;

        if (sel.options.length <= 1 && typeof estadosBrasil !== 'undefined') {
            sel.innerHTML = '<option value="">Selecione o estado</option>';
            estadosBrasil.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.sigla;
                opt.textContent = `${e.sigla} — ${e.nome}`;
                sel.appendChild(opt);
            });
        }

        if (!sel.dataset.ligado) {
            sel.dataset.ligado = '1';
            sel.addEventListener('change', function () {
                if (typeof carregarCidadesIBGE === 'function') carregarCidadesIBGE(this.value, cidId);
            });
        }
    });
}

// ============================================
// VISÃO GERAL — DIRETORIA
// Painel somente leitura: responde as perguntas que a chefia
// costuma fazer sobre a operação, sem precisar garimpar telas.
// ============================================

const _dirMes = (d) => String(d || '').slice(0, 7);          // 'AAAA-MM'
const _dirHoje = () => new Date().toISOString().slice(0, 10);

function _dirDataPedido(p) {
    return String(p.dataPrevColeta || p.dataSolicitacao || p.createdAt || '').slice(0, 10);
}

function _dirMoeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function _dirMesLabel(ym) {
    const [a, m] = ym.split('-');
    const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${nomes[parseInt(m, 10) - 1]}/${a.slice(2)}`;
}

function renderizarDiretoria() {
    const hoje = _dirHoje();
    const mesAtual = _dirMes(hoje);
    const dataAnterior = new Date();
    dataAnterior.setMonth(dataAnterior.getMonth() - 1);
    const mesAnterior = _dirMes(dataAnterior.toISOString());

    const validos = pedidosGlobais.filter(p => p.status !== 'Cancelado');
    const doMes = validos.filter(p => _dirMes(_dirDataPedido(p)) === mesAtual);
    const doMesAnterior = validos.filter(p => _dirMes(_dirDataPedido(p)) === mesAnterior);

    const soma = (lista) => lista.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);

    // ---------- Indicadores ----------
    const emRota = validos.filter(p =>
        ['Intenção Agendada','Aguardando Confirmação','Em Coleta','Em Transporte','Transbordo'].includes(p.status));
    const entreguesMes = doMes.filter(p => p.status === 'Entregue');
    const fatMes = soma(doMes);
    const fatAnterior = soma(doMesAnterior);
    const variacao = fatAnterior > 0 ? ((fatMes - fatAnterior) / fatAnterior) * 100 : null;

    // ocupação média da frota (só cegonhas com carga)
    const ocupacoes = (veiculosGlobais || []).map(v => {
        const carros = validos.filter(p => p.placaCegonha === v.placa &&
            !['Entregue','Cancelado'].includes(p.status)).length;
        return { placa: v.placa, tipo: v.tipo, carros, capacidade: v.capacidade || 11,
                 terceiro: v.propriedade === 'terceiro' };
    });
    // Item 10 — ocupação considera SÓ frota própria (isola terceiros/agregados)
    const comCarga = ocupacoes.filter(o => o.carros > 0 && !o.terceiro);
    const ocupMedia = comCarga.length > 0
        ? Math.round(comCarga.reduce((a, o) => a + (o.carros / o.capacidade) * 100, 0) / comCarga.length)
        : 0;

    const setaVar = variacao === null ? ''
        : variacao >= 0
            ? `<span class="dir-var dir-var-alta">▲ ${variacao.toFixed(0)}%</span>`
            : `<span class="dir-var dir-var-baixa">▼ ${Math.abs(variacao).toFixed(0)}%</span>`;

    const elKpis = document.getElementById('dirIndicadores');
    const _conf = (typeof _conformidadeSeguranca === 'function') ? _conformidadeSeguranca() : null;
    if (elKpis) elKpis.innerHTML = `
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Cargas em rota agora</span>
            <span class="dir-kpi-num">${emRota.length}</span>
            <span class="dir-kpi-obs">${comCarga.length} cegonha(s) carregada(s)</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Carros entregues no mês</span>
            <span class="dir-kpi-num" style="color:#4ade80">${entreguesMes.length}</span>
            <span class="dir-kpi-obs">de ${doMes.length} no total do mês</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Faturamento do mês</span>
            <span class="dir-kpi-num" style="color:#4ade80;font-size:1.5rem">${_dirMoeda(fatMes)}</span>
            <span class="dir-kpi-obs">${setaVar} vs. mês anterior (${_dirMoeda(fatAnterior)})</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Ocupação média da frota</span>
            <span class="dir-kpi-num" style="color:${ocupMedia >= 80 ? '#4ade80' : ocupMedia >= 50 ? '#fbbf24' : '#ef4444'}">${ocupMedia}%</span>
            <span class="dir-kpi-obs">frota própria em operação</span>
        </div>
        ${_conf ? `
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Conformidade — Veículos</span>
            <span class="dir-kpi-num" style="color:${_conf.corVeic}">${_conf.veiculosPct}</span>
            <span class="dir-kpi-obs">checklist em dia · frota própria (${_conf.totalVeic})</span>
        </div>
        <div class="dir-kpi">
            <span class="dir-kpi-rot">Conformidade — EPIs</span>
            <span class="dir-kpi-num" style="color:${_conf.corEpi}">${_conf.episPct}</span>
            <span class="dir-kpi-obs">motoristas sem pendência (${_conf.totalMot})</span>
        </div>` : ''}`;

    const elPeriodo = document.getElementById('dirPeriodo');
    if (elPeriodo) elPeriodo.textContent =
        'Mês de referência: ' + _dirMesLabel(mesAtual) + ' · atualizado agora';

    // ---------- Alertas ----------
    const prazoVencido = validos.filter(p =>
        p.prazoEntregaEstimado && !['Entregue'].includes(p.status) &&
        String(p.prazoEntregaEstimado).slice(0,10) < hoje).length;

    const patioParado = validos.filter(p => p.patioAtual && p.patioDesde &&
        (Date.now() - new Date(p.patioDesde).getTime()) / 3600000 >= 48).length;

    const semCegonha = validos.filter(p =>
        ['Intenção Agendada','Aguardando Confirmação'].includes(p.status) && !p.placaCegonha).length;

    const alertas = [
        { n: prazoVencido, txt: 'pedido(s) com prazo de entrega vencido', ico: '⏰' },
        { n: patioParado,  txt: 'carro(s) parado(s) em pátio há mais de 48h', ico: '🅿️' },
        { n: semCegonha,   txt: 'pedido(s) confirmado(s) sem cegonha definida', ico: '🚛' },
        { n: (_conf ? _conf.criticos : 0), txt: 'veículo(s) da frota própria com pendência CRÍTICA de segurança', ico: '🔴', critico: true }
    ].filter(a => a.n > 0);

    const elAlertas = document.getElementById('dirAlertas');
    if (elAlertas) elAlertas.innerHTML = alertas.length === 0
        ? '<div class="dir-tudo-ok">✅ Nenhum ponto de atenção no momento.</div>'
        : `<div class="dir-alertas">${alertas.map(a =>
            `<div class="dir-alerta${a.critico ? ' dir-alerta-critico' : ''}"><span class="dir-alerta-num">${a.ico} ${a.n}</span><span>${a.txt}</span></div>`
          ).join('')}</div>`;

    // ---------- Faturamento 6 meses ----------
    const meses = [];
    const _hojeD = new Date();
    for (let i = 5; i >= 0; i--) {
        // Usa SEMPRE o dia 1 para evitar o bug do setMonth quando o dia atual
        // é 29/30/31 (voltar 1 mês "pulava" para o mês errado e repetia).
        const d = new Date(_hojeD.getFullYear(), _hojeD.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        meses.push(ym);
    }
    const porMes = meses.map(m => ({
        mes: m,
        total: soma(validos.filter(p => _dirMes(_dirDataPedido(p)) === m)),
        carros: validos.filter(p => _dirMes(_dirDataPedido(p)) === m).length
    }));
    const maxMes = Math.max(...porMes.map(m => m.total), 1);

    const elFat = document.getElementById('dirFaturamento');
    if (elFat) elFat.innerHTML = porMes.map(m => `
        <div class="dir-barra-linha">
            <span class="dir-barra-rot">${_dirMesLabel(m.mes)}</span>
            <div class="dir-barra-trilho">
                <div class="dir-barra" style="width:${Math.max(2, (m.total / maxMes) * 100)}%;
                     background:${m.mes === mesAtual ? '#ff6a00' : 'rgba(255,106,0,0.45)'}"></div>
            </div>
            <span class="dir-barra-val">${_dirMoeda(m.total)}<small>${m.carros} carros</small></span>
        </div>`).join('');

    // ---------- Ocupação da frota ----------
    const elFrota = document.getElementById('dirFrota');
    const propriasOcup = ocupacoes.filter(o => !o.terceiro);
    const qtdTerceiros = ocupacoes.length - propriasOcup.length;
    const frotaOrd = propriasOcup.sort((a, b) => (b.carros / b.capacidade) - (a.carros / a.capacidade));
    if (elFrota) elFrota.innerHTML = (frotaOrd.length === 0
        ? '<p class="text-muted text-sm">Nenhum veículo próprio cadastrado.</p>'
        : frotaOrd.map(o => {
            const pct = Math.round((o.carros / o.capacidade) * 100);
            const cor = pct >= 80 ? '#4ade80' : pct >= 40 ? '#fbbf24' : pct > 0 ? '#fb923c' : '#4b5563';
            return `
            <div class="dir-barra-linha">
                <span class="dir-barra-rot">${o.placa}</span>
                <div class="dir-barra-trilho">
                    <div class="dir-barra" style="width:${Math.max(2, pct)}%;background:${cor}"></div>
                </div>
                <span class="dir-barra-val">${o.carros}/${o.capacidade}<small>${pct}%</small></span>
            </div>`;
        }).join(''))
        + (qtdTerceiros > 0 ? `<p class="text-muted text-sm" style="margin-top:8px">🤝 ${qtdTerceiros} veículo(s) de terceiros/agregados não entram nos indicadores de ocupação.</p>` : '');
    if (typeof renderizarConferenciaDiretoria === 'function') renderizarConferenciaDiretoria();

    // ---------- Rankings ----------
    const ranking = (chaveFn, elId, vazio) => {
        const mapa = {};
        doMes.forEach(p => {
            const k = chaveFn(p);
            if (!k) return;
            if (!mapa[k]) mapa[k] = { total: 0, carros: 0 };
            mapa[k].total += parseFloat(p.valorFrete) || 0;
            mapa[k].carros++;
        });
        const lista = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        const max = Math.max(...lista.map(l => l[1].total), 1);
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = lista.length === 0
            ? `<p class="text-muted text-sm">${vazio}</p>`
            : lista.map(([nome, d]) => `
                <div class="dir-barra-linha">
                    <span class="dir-barra-rot" title="${nome}">${nome}</span>
                    <div class="dir-barra-trilho">
                        <div class="dir-barra" style="width:${Math.max(2,(d.total/max)*100)}%;background:#60a5fa"></div>
                    </div>
                    <span class="dir-barra-val">${_dirMoeda(d.total)}<small>${d.carros} carros</small></span>
                </div>`).join('');
    };

    ranking(p => p.cliente, 'dirClientes', 'Nenhum pedido neste mês.');
    if (typeof renderComerciais === 'function') renderComerciais();

    // Rotas mais rentáveis — layout próprio, com a ROTA INTEIRA descrita
    // e bem visível (não truncada como no ranking de clientes).
    (() => {
        const mapa = {};
        doMes.forEach(p => {
            if (!p.cidadeOrigem || !p.cidadeDestino) return;
            const k = `${p.cidadeOrigem}/${p.ufOrigem || ''} → ${p.cidadeDestino}/${p.ufDestino || ''}`;
            if (!mapa[k]) mapa[k] = { total: 0, carros: 0 };
            mapa[k].total += parseFloat(p.valorFrete) || 0;
            mapa[k].carros++;
        });
        const lista = Object.entries(mapa).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
        const max = Math.max(...lista.map(l => l[1].total), 1);
        const el = document.getElementById('dirRotas');
        if (!el) return;
        el.innerHTML = lista.length === 0
            ? '<p class="text-muted text-sm">Nenhuma rota neste mês.</p>'
            : lista.map(([nome, d], i) => `
                <div class="dir-rota-item">
                    <div class="dir-rota-topo">
                        <span class="dir-rota-pos">${i + 1}º</span>
                        <span class="dir-rota-nome">${nome}</span>
                        <span class="dir-rota-val">${_dirMoeda(d.total)}</span>
                    </div>
                    <div class="dir-rota-barra-trilho">
                        <div class="dir-rota-barra" style="width:${Math.max(2, (d.total / max) * 100)}%"></div>
                        <span class="dir-rota-carros">${d.carros} carro(s)</span>
                    </div>
                </div>`).join('');
    })();
}

// ============================================
// FOLGAS DE MOTORISTAS E LEMBRETES
// Registra folgas/ferias/atestados e avisa na alocacao
// quando o motorista esta indisponivel.
// ============================================

let folgasGlobais = [];

const TIPOS_FOLGA = {
    folga:      { label: 'Folga',      icone: '🛌', cor: '#60a5fa' },
    ferias:     { label: 'Férias',     icone: '🏖️', cor: '#34d399' },
    atestado:   { label: 'Atestado',   icone: '🏥', cor: '#f472b6' },
    manutencao: { label: 'Manutenção', icone: '🔧', cor: '#fb923c' },
    lembrete:   { label: 'Lembrete',   icone: '📌', cor: '#fbbf24' }
};

async function carregarFolgas() {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('folgas_lembretes')
            .select('*').order('data_inicio', { ascending: true });
        folgasGlobais = data || [];
    } catch (e) {
        folgasGlobais = [];
        console.warn('Folgas não carregadas:', e.message);
    }
}

// Um registro cobre a data informada?
function folgaCobreData(f, dataISO) {
    const d = String(dataISO).slice(0, 10);
    const ini = String(f.data_inicio).slice(0, 10);
    const fim = String(f.data_fim || f.data_inicio).slice(0, 10);
    return d >= ini && d <= fim;
}

// Motorista está indisponível nessa data? Devolve o registro ou null.
function motoristaIndisponivel(nomeMotorista, dataISO) {
    if (!nomeMotorista) return null;
    const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                       .toUpperCase().replace(/\s+/g, ' ').trim();
    const alvo = norm(nomeMotorista);
    const data = dataISO || new Date().toISOString().slice(0, 10);
    return (folgasGlobais || []).find(f =>
        f.motorista_id && norm(f.motorista_nome) === alvo && folgaCobreData(f, data)
    ) || null;
}

function renderizarFolgas() {
    const painel = document.getElementById('painelFolgas');
    if (!painel) return;

    const hoje = new Date().toISOString().slice(0, 10);
    const emDias = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    const ativos   = folgasGlobais.filter(f => folgaCobreData(f, hoje));
    const proximos = folgasGlobais.filter(f => String(f.data_inicio).slice(0,10) > hoje
                                            && String(f.data_inicio).slice(0,10) <= emDias(30));
    const proximos15 = folgasGlobais.filter(f => (f.tipo||'folga') !== 'lembrete'
                                            && String(f.data_inicio).slice(0,10) > hoje
                                            && String(f.data_inicio).slice(0,10) <= emDias(15));
    const passados = folgasGlobais.filter(f =>
        String(f.data_fim || f.data_inicio).slice(0,10) < hoje).slice(-10).reverse();

    const cartao = (f) => {
        const cfg = TIPOS_FOLGA[f.tipo] || TIPOS_FOLGA.lembrete;
        const ini = new Date(String(f.data_inicio).slice(0,10) + 'T12:00').toLocaleDateString('pt-BR');
        const fim = f.data_fim && String(f.data_fim).slice(0,10) !== String(f.data_inicio).slice(0,10)
            ? ' até ' + new Date(String(f.data_fim).slice(0,10) + 'T12:00').toLocaleDateString('pt-BR')
            : '';
        return `
        <div class="folga-card" style="border-left-color:${cfg.cor}">
            <div class="folga-topo">
                <span class="folga-tipo" style="color:${cfg.cor};background:${cfg.cor}18;border:1px solid ${cfg.cor}45">
                    ${cfg.icone} ${cfg.label}
                </span>
                <span class="folga-quem">${f.motorista_nome || 'Geral'}</span>
                <span class="folga-data">${ini}${fim}</span>
                <button class="btn-kanban-excluir" onclick="excluirFolga(${f.id})" title="Excluir">🗑️</button>
            </div>
            ${f.descricao ? `<div class="folga-desc">${f.descricao}</div>` : ''}
        </div>`;
    };

    painel.innerHTML = `
        <div class="patios-resumo">
            <div class="patios-resumo-item ${ativos.length > 0 ? 'patios-resumo-alerta' : ''}">
                <strong>${ativos.length}</strong><span>indisponível(is) hoje</span>
            </div>
            <div class="patios-resumo-item ${proximos15.length > 0 ? 'patios-resumo-alerta' : ''}">
                <strong>${proximos15.length}</strong><span>⚠️ folga(s) em ≤ 15 dias</span>
            </div>
            <div class="patios-resumo-item">
                <strong>${proximos.length}</strong><span>agendado(s) nos próximos 30 dias</span>
            </div>
        </div>

        <h3 class="conf-titulo">Hoje</h3>
        ${ativos.length === 0
            ? '<p class="text-muted text-sm" style="padding:0.4rem 0">Todos disponíveis hoje. 👌</p>'
            : ativos.map(cartao).join('')}

        <h3 class="conf-titulo" style="margin-top:1.2rem">Próximos 30 dias</h3>
        ${proximos.length === 0
            ? '<p class="text-muted text-sm" style="padding:0.4rem 0">Nada agendado.</p>'
            : proximos.map(cartao).join('')}

        ${passados.length > 0 ? `
            <h3 class="conf-titulo" style="margin-top:1.2rem">Encerrados recentes</h3>
            <div class="folgas-passadas">${passados.map(cartao).join('')}</div>` : ''}`;
}

function abrirNovaFolga() {
    const existente = document.getElementById('modalFolga');
    if (existente) existente.remove();

    const opcoesMot = ['<option value="">— Lembrete geral (sem motorista) —</option>']
        .concat((motoristasGlobais || []).map(m =>
            `<option value="${m.id}|${(m.nome||'').replace(/"/g,'&quot;')}">${m.nome}</option>`)).join('');

    const opcoesTipo = Object.entries(TIPOS_FOLGA)
        .map(([v, c]) => `<option value="${v}">${c.icone} ${c.label}</option>`).join('');

    const hoje = new Date().toISOString().slice(0, 10);

    const modal = document.createElement('div');
    modal.id = 'modalFolga';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px">
            <span class="close" onclick="document.getElementById('modalFolga').remove()">&times;</span>
            <h2>📅 Novo registro</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Tipo</label>
                    <select id="folgaTipo" onchange="alternarCampoVeiculoFolga()">${opcoesTipo}</select>
                </div>
                <div class="form-group">
                    <label>Motorista</label>
                    <select id="folgaMotorista">${opcoesMot}</select>
                </div>
            </div>
            <div id="folgaGrupoVeiculo" class="form-group" style="display:none">
                <label>Veículo em manutenção *</label>
                <select id="folgaVeiculo">
                    <option value="">Selecione o caminhão</option>
                    ${(typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
                        .filter(v => v.propriedade !== 'terceiro')
                        .map(v => `<option value="${v.placa}">${v.placa}${v.modelo ? ' · ' + v.modelo : ''}</option>`).join('')}
                </select>
                <p class="text-muted text-sm" style="margin-top:0.3rem">O caminhão selecionado ficará <strong style="color:#ef4444">bloqueado em vermelho</strong> no painel de cegonhas até este lembrete ser concluído.</p>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Data de início *</label>
                    <input type="date" id="folgaInicio" value="${hoje}">
                </div>
                <div class="form-group">
                    <label>Data de fim <span class="text-muted text-sm">(vazio = 1 dia)</span></label>
                    <input type="date" id="folgaFim">
                </div>
            </div>
            <div class="form-group">
                <label>Observação</label>
                <input type="text" id="folgaDescricao" placeholder="Ex: folga compensatória, férias programadas...">
            </div>
            <div id="mensagemFolga" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarFolga()">Salvar</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalFolga').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// #3 · Manutenção de veículo: alterna o campo de seleção conforme o tipo
function alternarCampoVeiculoFolga() {
    const tipo = document.getElementById('folgaTipo')?.value;
    const grupo = document.getElementById('folgaGrupoVeiculo');
    if (!grupo) return;
    grupo.style.display = tipo === 'manutencao' ? '' : 'none';
}

// Retorna o registro de manutenção ATIVA (dentro do período) que se aplica ao
// veículo — ou null se não houver. Usado para colorir o painel de cegonhas.
function manutencaoAtivaDoVeiculo(placa) {
    if (!placa || typeof folgasGlobais === 'undefined' || !folgasGlobais) return null;
    const hoje = new Date().toISOString().slice(0, 10);
    return folgasGlobais.find(f => f.tipo === 'manutencao'
        && f.veiculo_placa === placa
        && (!f.data_inicio || f.data_inicio <= hoje)
        && (!f.data_fim || f.data_fim >= hoje)) || null;
}

async function salvarFolga() {
    const msgEl = document.getElementById('mensagemFolga');
    const inicio = document.getElementById('folgaInicio').value;
    const fim = document.getElementById('folgaFim').value || null;

    if (!inicio) {
        msgEl.textContent = 'Informe a data de início.';
        msgEl.className = 'message show error';
        return;
    }
    if (fim && fim < inicio) {
        msgEl.textContent = 'A data de fim não pode ser anterior à de início.';
        msgEl.className = 'message show error';
        return;
    }

    const sel = document.getElementById('folgaMotorista').value;
    const [motoristaId, motoristaNome] = sel ? sel.split('|') : [null, null];

    const tipo = document.getElementById('folgaTipo').value;
    const veiculoPlaca = document.getElementById('folgaVeiculo')?.value || null;
    if (tipo === 'manutencao' && !veiculoPlaca) {
        msgEl.textContent = 'Selecione o veículo em manutenção.';
        msgEl.className = 'message show error';
        return;
    }

    try {
        const { error } = await supabase.from('folgas_lembretes').insert({
            tipo: tipo,
            motorista_id: motoristaId ? parseInt(motoristaId) : null,
            motorista_nome: motoristaNome || null,
            veiculo_placa: veiculoPlaca,
            data_inicio: inicio,
            data_fim: fim,
            descricao: document.getElementById('folgaDescricao').value.trim() || null,
            criado_por: document.getElementById('usuarioLogado')?.textContent || 'Logística'
        });
        if (error) throw error;

        document.getElementById('modalFolga').remove();
        await carregarFolgas();
        renderizarFolgas();
        if (typeof renderizarPainelCegonhas === 'function') renderizarPainelCegonhas();
        exibirMensagem('mensagemLogistica', '✅ Registro salvo.', 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

async function excluirFolga(id) {
    if (!confirm('Excluir este registro?')) return;
    try {
        const { error } = await supabase.from('folgas_lembretes').delete().eq('id', id);
        if (error) throw error;
        await carregarFolgas();
        renderizarFolgas();
    } catch (e) {
        alert('Erro ao excluir: ' + e.message);
    }
}

// ============================================
// ROTAS PLANEJADAS
// O "inverso" da alocação: planeja-se a rota primeiro (cegonha + data +
// paradas na ordem) e depois vinculam-se os pedidos que se encaixam.
// ============================================

const STATUS_ROTA = {
    planejada:    { label: 'Planejada',    cor: '#60a5fa' },
    em_andamento: { label: 'Em andamento', cor: '#34d399' },
    concluida:    { label: 'Concluída',    cor: '#9ca3af' },
    cancelada:    { label: 'Cancelada',    cor: '#ef4444' }
};

function paradasDaRota(rota) {
    try {
        return typeof rota.paradas === 'string' ? JSON.parse(rota.paradas) : (rota.paradas || []);
    } catch (e) { return []; }
}

// Um pedido "encaixa" na rota se origem e destino estão nas paradas,
// e a origem vem ANTES do destino na sequência da viagem.
// A comparação ignora acentos, maiúsculas e variações de separador.
function normalizarCidade(s) {
    return (s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
        .toLowerCase()
        .replace(/[\s\-–—_.]+/g, '')                        // remove espaços, hífens, pontos
        .replace(/\//g, '/')
        .trim();
}

function pedidoEncaixaNaRota(p, paradas) {
    const origem  = normalizarCidade(`${p.cidadeOrigem}/${p.ufOrigem}`);
    const destino = normalizarCidade(`${p.cidadeDestino}/${p.ufDestino}`);
    const lista = paradas.map(normalizarCidade);
    const iO = lista.indexOf(origem);
    const iD = lista.indexOf(destino);
    return iO !== -1 && iD !== -1 && iO < iD;
}

// Parte A · Classifica como o pedido "encaixa" na rota planejada.
// Compara origem/destino do pedido com as paradas da rota.
// Retorna { tipo, selo } com um selinho pra colar no card.
function _classificarEncaixePedido(pedido, paradas) {
    if (!paradas || paradas.length === 0) return { tipo: 'sem-rota', selo: '' };
    // "Cidade/UF" — comparamos só a cidade (case-insensitive) por robustez
    const norm = s => (s || '').split('/')[0].trim().toLowerCase();
    const paradasN = paradas.map(norm);
    const origemP = norm(pedido.cidadeOrigem);
    const destinoP = norm(pedido.cidadeDestino);

    const iOrigem = paradasN.indexOf(origemP);
    const iDestino = paradasN.indexOf(destinoP);
    const primeira = 0;
    const ultima = paradasN.length - 1;

    // Origem e destino batem exatamente com as pontas da rota
    if (iOrigem === primeira && iDestino === ultima) {
        return { tipo: 'casada', selo: '<span class="selo-encaixe selo-encaixe-ok" title="Rota do pedido bate com a rota planejada">✓ Rota casada</span>' };
    }
    // Origem casa mas destino não é o fim → o carro sai antes
    if (iOrigem >= 0 && iOrigem < ultima) {
        if (iDestino > iOrigem) {
            // Destino é uma parada intermediária da rota
            return { tipo: 'sai-antes', selo: `<span class="selo-encaixe selo-encaixe-sai" title="Este carro é entregue em ${paradas[iDestino]} — antes do fim da rota">🔀 Sai em ${paradas[iDestino].split('/')[0]}</span>` };
        }
        // Origem casa mas o destino é FORA da rota (transbordo pra outra cegonha)
        return { tipo: 'transbordo', selo: `<span class="selo-encaixe selo-encaixe-sai" title="Destino ${pedido.cidadeDestino} é fora da rota — vai fazer transbordo">🔀 Transbordo (destino ${pedido.cidadeDestino})</span>` };
    }
    // Origem fora das paradas cadastradas, mas o DESTINO é uma parada da rota →
    // o carro "pega carona" no caminho (ex.: Imbaú → Maringá numa rota Curitiba → Maringá).
    if (iOrigem < 0 && iDestino >= 0) {
        return { tipo: 'encaixe', selo: `<span class="selo-encaixe selo-encaixe-entra" title="Origem ${pedido.cidadeOrigem} não é uma parada cadastrada, mas o destino ${paradas[iDestino].split('/')[0]} está no trajeto — encaixe no caminho">➕ Encaixe até ${paradas[iDestino].split('/')[0]}</span>` };
    }
    // Origem é uma parada, mas o destino é fora do trajeto → encaixe parcial (segue/transborda)
    if (iOrigem >= 0 && iDestino < 0) {
        return { tipo: 'encaixe', selo: `<span class="selo-encaixe selo-encaixe-entra" title="Coleta em ${paradas[iOrigem].split('/')[0]} (no trajeto), mas o destino ${pedido.cidadeDestino} é fora — precisará seguir/transbordar">➕ Coleta em ${paradas[iOrigem].split('/')[0]}</span>` };
    }
    // Nem origem nem destino batem
    return { tipo: 'fora', selo: '<span class="selo-encaixe selo-encaixe-fora" title="Origem/destino não batem com nenhuma parada da rota">⚠️ Fora da rota</span>' };
}

function renderizarRotas() {
    const painel = document.getElementById('painelRotas');
    if (!painel) return;

    // Mostra qualquer rota que ainda não foi concluída/cancelada.
    // Antes filtrava só ['planejada','em_andamento'], mas se o status vier
    // vazio, com maiúscula ou em outro formato, a rota sumia sem motivo.
    const ativas = (rotasGlobais || []).filter(r => {
        const s = String(r.status || '').toLowerCase().trim();
        return s !== 'concluida' && s !== 'concluída' && s !== 'cancelada';
    });

    if (ativas.length === 0) {
        painel.innerHTML = '<p class="text-center text-muted">Nenhuma rota planejada.<br><span class="text-sm">Clique em <strong>➕ Nova Rota</strong> para planejar o caminho de uma cegonha e ir vinculando os pedidos.</span></p>';
        return;
    }

    painel.innerHTML = ativas.map(r => {
        const paradas = paradasDaRota(r);
        // Parte A · Conta TODOS os pedidos que estão fisicamente na cegonha
        // (não só os vinculados por rota_id). Reflete a operação real.
        const naCegonha = r.placa_cegonha
            ? pedidosGlobais.filter(p => p.placaCegonha === r.placa_cegonha
                && !['Entregue', 'Cancelado'].includes(p.status))
            : [];
        // Vinculados por rota_id ainda existem no BD, mas na tela mostramos naCegonha.
        // Se algum foi vinculado sem estar na cegonha, ainda aparece.
        const vinculadosSemCegonha = pedidosGlobais.filter(p =>
            String(p.rotaId) === String(r.id) &&
            !['Entregue', 'Cancelado'].includes(p.status) &&
            !naCegonha.some(x => x.id === p.id));
        const vinculados = [...naCegonha, ...vinculadosSemCegonha];

        const veic = veiculosGlobais.find(v => v.placa === r.placa_cegonha);
        const capacidade = veic?.capacidade || 11;
        const vagas = capacidade - vinculados.length;
        const pct = Math.round((vinculados.length / capacidade) * 100);
        const corPct = pct >= 100 ? '#4ade80' : pct >= 60 ? '#fbbf24' : '#ef4444';
        const cfg = STATUS_ROTA[r.status] || STATUS_ROTA.planejada;

        // Pedidos pendentes que encaixam nesta rota e ainda não estão em rota nenhuma
        const compativeis = pedidosGlobais.filter(p =>
            p.status === 'Pendente' && !p.rotaId && pedidoEncaixaNaRota(p, paradas)
        );

        const paradasHTML = paradas.map((c, i) =>
            `<span class="rota-ponto ${i === 0 ? 'rota-coletar' : i === paradas.length-1 ? 'rota-destino' : 'rota-patio'}">${i+1}. ${c}</span>`
        ).join('<span class="rota-seta">→</span>');

        return `
        <div class="rota-card">
            <div class="rota-card-topo">
                <div>
                    <span class="rota-nome">${r.nome || 'Rota #' + r.id}</span>
                    <span class="status-badge-inline" style="background:${cfg.cor}20;color:${cfg.cor};border:1px solid ${cfg.cor}40;padding:0.1rem 0.5rem;border-radius:20px;font-size:0.65rem">${cfg.label}</span>
                </div>
                <span class="rota-ocupacao" style="color:${corPct}">${vinculados.length}/${capacidade} vagas</span>
            </div>

            <div class="rota-meta">
                🚛 ${r.status === 'planejada'
                    ? `<a class="rota-cegonha-link" onclick="abrirEditarRota(${r.id})" title="Clique para escolher/trocar a cegonha e o motorista">${r.placa_cegonha || '<span class="tag-adefinir">A DEFINIR</span>'}</a>`
                    : (r.placa_cegonha || '<span class="tag-adefinir">A DEFINIR</span>')}
                ${r.motorista_1 ? ` · 👤 ${r.status === 'planejada' ? `<a class="rota-cegonha-link" onclick="abrirEditarRota(${r.id})" title="Clique para trocar o motorista">${r.motorista_1}</a>` : r.motorista_1}` : (r.placa_cegonha ? ' · <span class="tag-adefinir">motorista a definir</span>' : '')}
                ${r.data_saida ? ` · 📅 ${new Date(r.data_saida + 'T12:00').toLocaleDateString('pt-BR')}` : ''}
                ${vagas > 0 ? ` · <strong style="color:${corPct}">faltam ${vagas} carro(s)</strong>` : ' · <strong style="color:#4ade80">carreta cheia ✔</strong>'}
                ${typeof etaRotaHTML === 'function' ? etaRotaHTML(r) : ''}
                ${typeof fechamentoRotaHTML === 'function' ? fechamentoRotaHTML(r) : ''}
                ${r.valor_previsto ? ` · <span class="rota-valor">💰 ${Number(r.valor_previsto).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>` : ''}
                ${r.criado_por ? ` · <span class="rota-criador" title="Quem planejou esta rota">👤 criada por ${r.criado_por}</span>` : ''}
            </div>

            <div class="cegonha-rota-linha" style="margin:0.5rem 0">${paradasHTML}</div>
            ${r.observacao ? `<div class="text-muted text-sm">📝 ${r.observacao}</div>` : ''}

            <div class="rota-barra"><div class="rota-barra-inner" style="width:${Math.min(pct,100)}%;background:${corPct}"></div></div>

            <div class="rota-secao">
                <div class="rota-secao-titulo">Pedidos vinculados (${vinculados.length})</div>
                ${vinculados.length === 0
                    ? '<p class="text-muted text-sm">Nenhum pedido vinculado ainda.</p>'
                    : vinculados.map(p => {
                        const encaixe = _classificarEncaixePedido(p, paradas);
                        return `
                        <div class="rota-pedido-item">
                            <span>#${p.id} · <strong>${p.cliente || ''}</strong> · ${p.modelo || ''} ${p.placa || ''} ${selCTEDoPedido(p.id)}</span>
                            <span class="rota-pedido-rota">${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino} ${encaixe.selo}</span>
                            <button class="btn-kanban-cancelar" onclick="desvincularPedidoRota(${p.id})" title="Tirar desta rota">✕</button>
                        </div>`;
                    }).join('')}
            </div>

            <div class="rota-secao">
                <div class="rota-secao-titulo">Pedidos compatíveis com esta rota (${compativeis.length})</div>
                ${compativeis.length === 0
                    ? '<p class="text-muted text-sm">Nenhum pedido pendente encaixa neste caminho no momento.</p>'
                    : compativeis.slice(0, 12).map(p => `
                        <div class="rota-pedido-item rota-pedido-sugerido">
                            <span>#${p.id} · <strong>${p.cliente || ''}</strong> · ${p.modelo || ''} ${p.placa || ''}</span>
                            <span class="rota-pedido-rota">${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
                            <button class="btn-acao-principal" style="flex:0 0 auto;padding:0.25rem 0.7rem;font-size:0.72rem"
                                onclick="vincularPedidoRota(${p.id}, ${r.id})" ${vagas <= 0 ? 'disabled title="Carreta cheia"' : ''}>+ Vincular</button>
                        </div>`).join('')}
            </div>

            <div class="rota-acoes">
                ${(r.status === 'planejada' || r.status === 'em_andamento') ? `<button class="btn btn-secondary btn-sm" onclick="abrirInserirCarroRota(${r.id})" title="Adicionar qualquer carro disponível a esta rota">➕ Inserir carro</button>` : ''}
                ${r.status === 'planejada' ? `<button class="btn btn-secondary btn-sm" onclick="abrirEditarRota(${r.id})" title="Alterar dados antes de iniciar a viagem">✏️ Editar</button>` : ''}
                ${r.status === 'planejada' ? `<button class="btn btn-primary btn-sm" onclick="mudarStatusRota(${r.id}, 'em_andamento')">▶️ Iniciar viagem</button>` : ''}
                ${(r.status === 'planejada' || r.status === 'em_andamento') ? `<button class="btn btn-secondary btn-sm" onclick="abrirAvancarStatusRota(${r.id})" title="Avançar o status dos carros desta rota">⏩ Avançar status</button>` : ''}
                ${r.status === 'em_andamento' ? `<button class="btn btn-primary btn-sm" onclick="abrirRegistrarChegada(${r.id})" title="Marcar chegada dos carros (motorista ou pátio)">🏁 Registrar chegada</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="mudarStatusRota(${r.id}, 'cancelada')">Cancelar rota</button>
            </div>
        </div>`;
    }).join('');
}

// ---------- Criar rota ----------
let _paradasNovaRota = [];
let _rotaCegonhaSel = '';

// _rotaEditandoId: quando != null, o modal está em modo edição
let _rotaEditandoId = null;

function abrirNovaRota() {
    _abrirModalRota(null);
}

function abrirEditarRota(rotaId) {
    const r = (rotasGlobais || []).find(x => String(x.id) === String(rotaId));
    if (!r) { alert('Rota não encontrada.'); return; }
    if (r.status !== 'planejada') { alert('Só é possível editar antes de iniciar a viagem.'); return; }
    _abrirModalRota(r);
}

function _abrirModalRota(rota) {
    _rotaEditandoId = rota ? rota.id : null;
    _paradasNovaRota = rota ? [...(paradasDaRota(rota) || [])] : [];
    const existing = document.getElementById('modalNovaRota');
    if (existing) existing.remove();

    // Descobre o tipo do veículo já vinculado (para pré-selecionar frota/terceiro)
    const veicAtual = rota && rota.placa_cegonha
        ? (veiculosGlobais || []).find(v => v.placa === rota.placa_cegonha) : null;
    const tipoInicial = (veicAtual?.propriedade === 'terceiro') ? 'terceiro' : 'frota';

    const modal = document.createElement('div');
    modal.id = 'modalNovaRota';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:560px">
            <span class="close" onclick="document.getElementById('modalNovaRota').remove()">&times;</span>
            <h2>${rota ? '✏️ Editar Rota Planejada' : '🛣️ Nova Rota Planejada'}</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Nome da rota</label>
                    <input type="text" id="rotaNome" placeholder="Ex: Quinta — PR Sul" value="${rota?.nome ? rota.nome.replace(/"/g,'&quot;') : ''}">
                </div>
                <div class="form-group">
                    <label>Data de saída</label>
                    <input type="date" id="rotaData" value="${rota?.data_saida || ''}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Corredor (define o SLA para o ETA)</label>
                    <select id="rotaCorredor">
                        <option value="">Sem corredor</option>
                        ${(corredoresGlobais||[]).map(c => `<option value="${c.id}" data-sla="${c.sla_horas}" ${String(rota?.corredor_id)===String(c.id)?'selected':''}>${c.nome} (SLA ${c.sla_horas}h)</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Horário previsto de saída</label>
                    <input type="time" id="rotaHoraPrev" value="${rota?.hora_saida_prevista || ''}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Data/hora REAL de saída (para calcular o ETA)</label>
                    <input type="datetime-local" id="rotaSaidaReal" value="${rota?.data_hora_saida_real ? String(rota.data_hora_saida_real).slice(0,16) : ''}">
                </div>
            </div>

            <div class="form-group">
                <label>Tipo de cegonha *</label>
                <div class="rota-tipo-selector">
                    <button type="button" id="rotaTipoFrota" class="rota-tipo-btn ${tipoInicial === 'frota' ? 'active' : ''}" onclick="filtrarCegonhasRota('frota')">🚛 Frota própria</button>
                    <button type="button" id="rotaTipoTerceiro" class="rota-tipo-btn ${tipoInicial === 'terceiro' ? 'active' : ''}" onclick="filtrarCegonhasRota('terceiro')">🤝 Terceiro</button>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Cegonha *</label>
                    <input type="text" id="rotaCegonhaBusca" placeholder="🔎 Buscar por placa, modelo ou transportador..." oninput="filtrarCegonhasRota()">
                    <select id="rotaCegonha" size="5" style="margin-top:0.5rem" onchange="_rotaCegonhaSel = this.value; _rotaEditPreencheMotorista()"></select>
                </div>
                <div class="form-group" style="max-width:280px">
                    <label>Motorista</label>
                    <input type="text" id="rotaMotorista" placeholder="Motorista da viagem" list="listaMotoristasRotaEdit" value="${rota?.motorista_1 ? rota.motorista_1.replace(/"/g,'&quot;') : ''}">
                    <datalist id="listaMotoristasRotaEdit">${(motoristasGlobais||[]).map(m => `<option value="${(m.nome||m).toString().replace(/"/g,'&quot;')}">`).join('')}</datalist>
                    <span class="text-muted" style="font-size:.75rem">Ao escolher a cegonha, o motorista padrão dela vem aqui. Pode trocar.</span>
                </div>
            </div>

            <div class="form-group">
                <label>Paradas (na ordem da viagem) *</label>
                <div class="rota-parada-add">
                    <input type="text" id="rotaNovaParada" placeholder="Ex: Cascavel/PR"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();adicionarParadaRota();}">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="adicionarParadaRota()">+ Adicionar</button>
                </div>
                <div id="listaParadasRota" class="lista-paradas"></div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>💰 Valor de tabela (R$)</label>
                    <input type="number" step="0.01" id="rotaValorTabela" placeholder="0,00" value="${rota?.valor_tabela ?? ''}">
                </div>
                <div class="form-group">
                    <label>Excedente (R$)</label>
                    <input type="number" step="0.01" id="rotaValorExcedente" placeholder="0,00" value="${rota?.valor_excedente ?? ''}">
                </div>
            </div>

            <div class="form-group">
                <label>Observação</label>
                <input type="text" id="rotaObs" placeholder="Opcional" value="${rota?.observacao ? rota.observacao.replace(/"/g,'&quot;') : ''}">
            </div>

            <div id="mensagemNovaRota" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarNovaRota()">${rota ? 'Salvar alterações' : 'Criar Rota'}</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalNovaRota').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    renderizarParadasRota();
    // Pré-seleciona a cegonha atual: descobre o tipo dela, filtra e seleciona
    _rotaCegonhaSel = rota?.placa_cegonha || '';
    filtrarCegonhasRota(tipoInicial);
    if (rota?.placa_cegonha) {
        const sel = document.getElementById('rotaCegonha');
        // se a cegonha não está na lista do tipo atual, tenta o outro tipo
        if (sel && !Array.from(sel.options).some(o => o.value === rota.placa_cegonha)) {
            filtrarCegonhasRota(tipoInicial === 'frota' ? 'terceiro' : 'frota');
        }
        if (sel) sel.value = rota.placa_cegonha;
    }
}

// #4 · Filtra a lista de cegonhas do modal por Frota/Terceiro + termo de busca
function filtrarCegonhasRota(tipo) {
    // Alterna botões só se o tipo veio (clique nos botões)
    if (tipo === 'frota' || tipo === 'terceiro') {
        document.getElementById('rotaTipoFrota')?.classList.toggle('active', tipo === 'frota');
        document.getElementById('rotaTipoTerceiro')?.classList.toggle('active', tipo === 'terceiro');
        document.getElementById('rotaCegonha')?.setAttribute('data-tipo', tipo);
    }
    const tipoAtual = document.getElementById('rotaCegonha')?.getAttribute('data-tipo') || 'frota';
    const termo = (document.getElementById('rotaCegonhaBusca')?.value || '').trim().toLowerCase();

    const lista = (veiculosGlobais || []).filter(v => {
        const eTerceiro = v.propriedade === 'terceiro';
        if (tipoAtual === 'frota' && eTerceiro) return false;
        if (tipoAtual === 'terceiro' && !eTerceiro) return false;
        if (!termo) return true;
        return `${v.placa || ''} ${v.modelo || ''} ${v.tipo || ''} ${v.transportador_nome || ''}`.toLowerCase().includes(termo);
    });

    const sel = document.getElementById('rotaCegonha');
    if (!sel) return;
    if (lista.length === 0) {
        sel.innerHTML = `<option disabled>Nenhuma ${tipoAtual === 'terceiro' ? 'cegonha terceira' : 'cegonha da frota'} encontrada</option>`;
        return;
    }
    sel.innerHTML = lista.map(v => {
        const info = tipoAtual === 'terceiro' && v.transportador_nome ? ` · 🏢 ${v.transportador_nome}` : '';
        return `<option value="${v.placa}" data-mot="${(v.motorista_padrao||'').replace(/"/g,'&quot;')}">${v.placa} — ${v.tipo || 'Cegonha'} · ${v.capacidade || '?'} vagas${info}${v.motorista_padrao ? ' · 👤 '+v.motorista_padrao : ''}</option>`;
    }).join('');
}

// Preenche o motorista padrão da cegonha ao escolher, na edição de rota
function _rotaEditPreencheMotorista(){
  const sel = document.getElementById('rotaCegonha');
  const opt = sel?.options[sel.selectedIndex];
  const mot = opt?.getAttribute('data-mot') || '';
  const inp = document.getElementById('rotaMotorista');
  if (inp && mot) inp.value = mot; // só preenche se a cegonha tem padrão (não apaga o que já tem)
}

function adicionarParadaRota() {
    const input = document.getElementById('rotaNovaParada');
    const val = (input?.value || '').trim();
    if (!val) return;
    _paradasNovaRota.push(val);
    input.value = '';
    input.focus();
    renderizarParadasRota();
}

function removerParadaRota(i) {
    _paradasNovaRota.splice(i, 1);
    renderizarParadasRota();
}

function moverParadaRota(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= _paradasNovaRota.length) return;
    [_paradasNovaRota[i], _paradasNovaRota[j]] = [_paradasNovaRota[j], _paradasNovaRota[i]];
    renderizarParadasRota();
}

function renderizarParadasRota() {
    const el = document.getElementById('listaParadasRota');
    if (!el) return;
    if (_paradasNovaRota.length === 0) {
        el.innerHTML = '<p class="text-muted text-sm">Nenhuma parada. Adicione ao menos a origem e o destino.</p>';
        return;
    }
    el.innerHTML = _paradasNovaRota.map((c, i) => `
        <div class="parada-item">
            <span class="parada-num">${i+1}</span>
            <span class="parada-nome">${c}</span>
            <button type="button" onclick="moverParadaRota(${i},-1)" title="Subir" ${i===0?'disabled':''}>▲</button>
            <button type="button" onclick="moverParadaRota(${i},1)" title="Descer" ${i===_paradasNovaRota.length-1?'disabled':''}>▼</button>
            <button type="button" class="parada-remover" onclick="removerParadaRota(${i})" title="Remover">✕</button>
        </div>`).join('');
}

async function salvarNovaRota() {
    const msgEl = document.getElementById('mensagemNovaRota');
    if (_paradasNovaRota.length < 2) {
        msgEl.textContent = 'Adicione ao menos 2 paradas (origem e destino).';
        msgEl.className = 'message show error';
        return;
    }
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';

    // Item 16 — ETA = saída real + SLA do corredor
    const corredorId = document.getElementById('rotaCorredor')?.value || null;
    const horaPrev = document.getElementById('rotaHoraPrev')?.value || null;
    const saidaRealRaw = document.getElementById('rotaSaidaReal')?.value || null;
    let etaCalc = null;
    if (saidaRealRaw && corredorId){
        const cor = (corredoresGlobais||[]).find(c => String(c.id) === String(corredorId));
        if (cor && cor.sla_horas){
            etaCalc = new Date(new Date(saidaRealRaw).getTime() + cor.sla_horas*3600000).toISOString();
        }
    }

    const dados = {
        nome: document.getElementById('rotaNome').value.trim() || null,
        placa_cegonha: (document.getElementById('rotaCegonha').value || _rotaCegonhaSel) || null,
        motorista_1: document.getElementById('rotaMotorista')?.value.trim() || null,
        percent_motorista_1: (document.getElementById('rotaMotorista')?.value.trim()) ? 100 : null,
        data_saida: document.getElementById('rotaData').value || null,
        corredor_id: corredorId ? parseInt(corredorId) : null,
        hora_saida_prevista: horaPrev,
        data_hora_saida_real: saidaRealRaw ? new Date(saidaRealRaw).toISOString() : null,
        eta: etaCalc,
        valor_tabela: parseFloat(document.getElementById('rotaValorTabela')?.value) || null,
        valor_excedente: parseFloat(document.getElementById('rotaValorExcedente')?.value) || null,
        valor_previsto: ((parseFloat(document.getElementById('rotaValorTabela')?.value) || 0) + (parseFloat(document.getElementById('rotaValorExcedente')?.value) || 0)) || null,
        paradas: _paradasNovaRota,
        observacao: document.getElementById('rotaObs').value.trim() || null
    };
    try {
        if (_rotaEditandoId) {
            // Modo edição: guarda a cegonha ANTES para saber se mudou
            const rotaAntiga = (rotasGlobais || []).find(r => String(r.id) === String(_rotaEditandoId));
            const cegonhaAntes = rotaAntiga?.placa_cegonha || null;
            const cegonhaAgora = dados.placa_cegonha;

            const { error } = await supabase.from('rotas_planejadas').update(dados).eq('id', _rotaEditandoId);
            if (error) throw error;

            // Se a cegonha mudou, migra os pedidos já vinculados para a nova cegonha.
            // Só toca em pedidos ativos (ignora Entregue/Cancelado, por segurança).
            let migrados = 0;
            if (cegonhaAntes !== cegonhaAgora) {
                const vinculados = (pedidosGlobais || []).filter(p =>
                    String(p.rotaId || p.rota_id) === String(_rotaEditandoId) &&
                    !['Entregue', 'Cancelado'].includes(p.status));
                for (const p of vinculados) {
                    try {
                        const { error: eUpd } = await supabase.from('pedidos')
                            .update({ placa_cegonha: cegonhaAgora }).eq('id', p.id);
                        if (eUpd) continue;
                        await supabase.from('historico_status').insert({
                            pedido_id: p.id,
                            status_anterior: p.status,
                            status_novo: p.status,
                            usuario_nome: usuarioNome,
                            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
                            observacao: `🔄 Cegonha da rota alterada: ${cegonhaAntes || '—'} → ${cegonhaAgora || '—'}`
                        });
                        migrados++;
                    } catch (_) {}
                }
            }

            _rotaEditandoId = null;
            document.getElementById('modalNovaRota').remove();
            await carregarDadosDoSupabase();
            renderizarRotas();
            const suffix = (cegonhaAntes !== cegonhaAgora)
                ? ` · ${migrados} pedido(s) migrados para a nova cegonha`
                : '';
            exibirMensagem('mensagemLogistica', `✅ Rota atualizada.${suffix}`, 'success');
        } else {
            // Modo criação: INSERT
            const { error } = await supabase.from('rotas_planejadas').insert({
                ...dados, status: 'planejada', criado_por: usuarioNome
            });
            if (error) throw error;
            _rotaEditandoId = null;
            document.getElementById('modalNovaRota').remove();
            await carregarDadosDoSupabase();
            renderizarRotas();
            exibirMensagem('mensagemLogistica', '✅ Rota planejada criada! Agora vincule os pedidos compatíveis.', 'success');
        }
    } catch (e) {
        msgEl.textContent = (_rotaEditandoId ? 'Erro ao salvar alterações: ' : 'Erro ao criar rota: ') + e.message;
        msgEl.className = 'message show error';
    }
}

// ---------- Vincular / desvincular pedidos ----------
async function vincularPedidoRota(pedidoId, rotaId) {
    const rota = rotasGlobais.find(r => String(r.id) === String(rotaId));
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!rota || !p || !supabase) return;

    try {
        const update = { rota_id: rotaId };
        // Se a rota já tem cegonha, o pedido entra como intenção agendada nela
        if (rota.placa_cegonha) {
            update.placa_cegonha = rota.placa_cegonha;
            update.status = 'Intenção Agendada';
        }
        const { error } = await supabase.from('pedidos').update(update).eq('id', pedidoId);
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: p.status,
            status_novo: update.status || p.status,
            usuario_nome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
            usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
            observacao: `🛣️ Vinculado à rota planejada "${rota.nome || '#' + rota.id}"${rota.placa_cegonha ? ' — cegonha ' + rota.placa_cegonha : ''}`
        });

        await carregarDadosDoSupabase();
        renderizarRotas();
        if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag();
        exibirMensagem('mensagemLogistica', `✅ Pedido #${pedidoId} vinculado à rota.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemLogistica', 'Erro ao vincular: ' + e.message, 'error');
    }
}

async function desvincularPedidoRota(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;
    if (!confirm(`Tirar o pedido #${p.id} desta rota?\n\nEle volta para Pendente e sai da cegonha.`)) return;

    try {
        const { error } = await supabase.from('pedidos').update({
            rota_id: null, placa_cegonha: null, status: 'Pendente',
            motorista_1: null, motorista_2: null,
            percent_motorista_1: null, percent_motorista_2: null,
            patio_atual: null, patio_desde: null
            // corredor_manual_id é PRESERVADO: se tinha 📌, volta pro mesmo corredor manual;
            // se não tinha, volta pro corredor automático pela geografia.
        }).eq('id', pedidoId);
        if (error) throw error;

        await carregarDadosDoSupabase();
        renderizarRotas();
        if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag();
        exibirMensagem('mensagemLogistica', `Pedido #${pedidoId} removido da rota.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemLogistica', 'Erro ao desvincular: ' + e.message, 'error');
    }
}

async function mudarStatusRota(rotaId, novoStatus) {
    const labels = { em_andamento: 'iniciar a viagem desta rota', concluida: 'concluir esta rota', cancelada: 'cancelar esta rota' };
    if (novoStatus === 'em_andamento'){
        const carros = (pedidosGlobais||[]).filter(p =>
            String(p.rotaId || p.rota_id) === String(rotaId) &&
            !['Entregue','Cancelado','Em Transporte','Transbordo'].includes(p.status||'Pendente'));
        if (!confirm(`Iniciar a viagem desta rota?\n\nOs ${carros.length} carro(s) da carga vão direto para "Em Transporte".`)) return;
        const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
        try {
            const { error } = await supabase.from('rotas_planejadas').update({ status: 'em_andamento' }).eq('id', rotaId);
            if (error) throw error;
            // Todos os carros da rota entram direto em trânsito (fluxo enxuto)
            for (const p of carros){
                await supabase.from('pedidos').update({ status: 'Em Transporte' }).eq('id', p.id);
                try { await supabase.from('historico_status').insert({
                    pedido_id: p.id, status_anterior: p.status, status_novo: 'Em Transporte',
                    usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
                    observacao: `🚚 Viagem iniciada — carro entrou em trânsito.`
                }); } catch(_){}
            }
            await carregarDadosDoSupabase();
            renderizarRotas();
            if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `🚚 Viagem iniciada — ${carros.length} carro(s) em trânsito.`, 'success');
        } catch(e){ alert('Erro: ' + (e.message||e)); }
        return;
    }
    if (!confirm(`Confirma ${labels[novoStatus] || 'alterar esta rota'}?`)) return;
    try {
        const { error } = await supabase.from('rotas_planejadas')
            .update({ status: novoStatus }).eq('id', rotaId);
        if (error) throw error;
        await carregarDadosDoSupabase();
        renderizarRotas();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
}

// ============================================
// PAINEL: CARROS NOS PÁTIOS
// Pátio = LOCALIZAÇÃO FÍSICA do carro, independente do status.
// Pode ser informado/retirado manualmente a qualquer momento.
// O fluxo de Transbordo preenche o pátio automaticamente.
// ============================================

const PATIOS_FIXOS = [
    'Cascavel/PR', 'Curitiba/PR', 'Maringá/PR', 'São José dos Pinhais/PR',
    'Gravataí/RS', 'São José/SC', 'Balneário Camboriú/SC', 'São Bernardo do Campo/SP'
];

// Quanto tempo o carro está no pátio, em texto ("3d 5h" / "6h" / "—")
function tempoNoPatio(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return null;
    const horas = Math.floor(ms / 3600000);
    const dias = Math.floor(horas / 24);
    if (dias > 0) return `${dias}d ${horas % 24}h`;
    if (horas > 0) return `${horas}h`;
    return `${Math.max(1, Math.floor(ms / 60000))}min`;
}

// Registra movimentação de pátio no histórico (sem mudar o status)
async function registrarMovimentacaoPatio(pedido, texto) {
    if (!supabase) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Sistema';
    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica';
    const { error } = await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedido.id),
        status_anterior: pedido.status || 'Pendente',
        status_novo: pedido.status || 'Pendente',
        usuario_nome: usuarioNome,
        usuario_perfil: perfilUsuario,
        observacao: texto
    });
    if (error) console.warn('Movimentação de pátio não registrada no histórico:', error.message);
}

async function renderizarPainelPatios() {
    const painel = document.getElementById('painelPatios');
    if (!painel) return;

    const carros = pedidosGlobais.filter(p =>
        p.patioAtual && !['Entregue', 'Cancelado'].includes(p.status)
    );

    // Agrupar por pátio (pátios fixos sempre aparecem, mesmo vazios)
    const grupos = {};
    PATIOS_FIXOS.forEach(pt => grupos[pt] = []);
    carros.forEach(p => {
        if (!grupos[p.patioAtual]) grupos[p.patioAtual] = [];
        grupos[p.patioAtual].push(p);
    });

    // Alerta de permanência: 48h+ no pátio merece atenção
    const LIMITE_ALERTA_H = 48;
    const emAlerta = carros.filter(p =>
        p.patioDesde && (Date.now() - new Date(p.patioDesde).getTime()) / 3600000 >= LIMITE_ALERTA_H
    ).length;

    const resumoHTML = `
        <div class="patios-resumo">
            <div class="patios-resumo-item">
                <strong>${carros.length}</strong>
                <span>carro${carros.length === 1 ? '' : 's'} em pátio agora</span>
            </div>
            <div class="patios-resumo-item ${emAlerta > 0 ? 'patios-resumo-alerta' : ''}">
                <strong>${emAlerta}</strong>
                <span>há mais de ${LIMITE_ALERTA_H}h parado${emAlerta === 1 ? '' : 's'}</span>
            </div>
        </div>`;

    const patiosHTML = Object.entries(grupos).map(([patio, lista]) => {
        const carrosHTML = lista.length === 0
            ? '<p class="patio-vazio">Pátio vazio</p>'
            : lista.map(p => {
                const tempo = tempoNoPatio(p.patioDesde);
                const alerta = p.patioDesde &&
                    (Date.now() - new Date(p.patioDesde).getTime()) / 3600000 >= LIMITE_ALERTA_H;
                const corStatus = FLUXO_STATUS[p.status || 'Pendente']?.cor || '#888';
                return `
                <div class="carro-patio-card carro-patio-clicavel" onclick="abrirDetalheCarroPatio(${p.id})" title="Clique para ver os detalhes">
                    <div class="carro-patio-topo">
                        <span class="carro-patio-id">#${p.id}</span>
                        <span class="status-badge-inline" style="background:${corStatus}20;color:${corStatus};border:1px solid ${corStatus}40;font-size:0.62rem;padding:0.1rem 0.4rem;border-radius:4px">${p.status || 'Pendente'}</span>
                        <span class="carro-patio-tempo ${alerta ? 'tempo-alerta' : ''}"
                              title="${p.patioDesde ? 'No pátio desde ' + new Date(p.patioDesde).toLocaleString('pt-BR') : 'Entrada não registrada'}">
                            ⏱ ${tempo || '—'}
                        </span>
                    </div>
                    <div class="carro-patio-cliente">${p.cliente || '—'}</div>
                    <div class="carro-patio-veiculo">🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong></div>
                    <div class="carro-patio-rota">${rotaComTransbordoHTML(p)}</div>
                </div>`;
            }).join('');

        return `
        <div class="patio-card ${lista.length === 0 ? 'patio-card-vazio' : ''}">
            <div class="patio-header">
                <span class="patio-nome">🅿️ ${patio}</span>
                <span class="patio-qtd">${lista.length} carro${lista.length === 1 ? '' : 's'}</span>
            </div>
            <div class="patio-carros">${carrosHTML}</div>
        </div>`;
    }).join('');

    painel.innerHTML = resumoHTML +
        `<div class="painel-patios-grid">${patiosHTML}</div>` +
        `<div class="patios-movs">
            <h3>📋 Últimas entradas e saídas</h3>
            <div id="patiosMovsLista"><p class="text-muted text-sm">Carregando movimentações...</p></div>
        </div>`;

    carregarMovimentacoesPatios();
}

// ---------- DETALHES DO CARRO (clique no card) ----------
function abrirDetalheCarroPatio(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p) return;

    const existing = document.getElementById('modalDetalheCarro');
    if (existing) existing.remove();

    const corStatus = FLUXO_STATUS[p.status || 'Pendente']?.cor || '#888';
    const tempo = tempoNoPatio(p.patioDesde);

    const modal = document.createElement('div');
    modal.id = 'modalDetalheCarro';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content modal-detalhe-carro">
            <span class="close" onclick="document.getElementById('modalDetalheCarro').remove()">&times;</span>
            <h2>🚗 Pedido #${p.id}</h2>

            <div class="detalhe-carro-status">
                <span class="status-badge-inline" style="background:${corStatus}20;color:${corStatus};border:1px solid ${corStatus}40;padding:0.2rem 0.7rem;border-radius:5px;font-weight:700">${p.status || 'Pendente'}</span>
                ${p.patioAtual ? `<span class="badge-patio">🅿️ ${p.patioAtual}${tempo ? ' · ⏱ ' + tempo : ''}</span>` : '<span class="text-muted text-sm">Fora de pátio</span>'}
            </div>

            <div class="detalhe-carro-grid">
                <div class="detalhe-item"><span class="detalhe-label">Cliente</span><span>${p.cliente || '—'}</span></div>
                <div class="detalhe-item"><span class="detalhe-label">Veículo</span><span>${p.modelo || '—'} · <strong>${p.placa || '—'}</strong></span></div>
                <div class="detalhe-item detalhe-full"><span class="detalhe-label">Rota</span><span class="detalhe-rota">${rotaComTransbordoHTML(p)}</span></div>
                <div class="detalhe-item"><span class="detalhe-label">Cegonha</span><span>${p.placaCegonha || '—'}</span></div>
                <div class="detalhe-item"><span class="detalhe-label">Motorista</span><span>${p.motorista1 || '—'}${p.motorista2 ? ' + ' + p.motorista2 : ''}</span></div>
                <div class="detalhe-item"><span class="detalhe-label">Frete</span><span>R$ ${Number(p.valorFrete || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span></div>
                <div class="detalhe-item"><span class="detalhe-label">Prev. Coleta</span><span>${p.dataPrevColeta ? new Date(p.dataPrevColeta).toLocaleString('pt-BR') : '—'}</span></div>
                <div class="detalhe-item"><span class="detalhe-label">Prazo de Entrega</span><span>${badgePrazoEntrega(p) || '—'}</span></div>
            </div>

            <div class="detalhe-carro-acoes">
                <button class="btn btn-primary" onclick="document.getElementById('modalDetalheCarro').remove();abrirModalPatio(${p.id})">🅿️ ${p.patioAtual ? 'Alterar Pátio' : 'Informar Pátio'}</button>
                ${p.patioAtual ? `<button class="btn-patio-sair" style="flex:0 0 auto;padding:0 1rem" onclick="retirarDoPatio(${p.id})">📤 Retirar do Pátio</button>` : ''}
                <button class="btn btn-secondary" onclick="document.getElementById('modalDetalheCarro').remove();abrirModalStatus(${p.id})">Avançar Status</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalDetalheCarro').remove();abrirHistorico(${p.id})">Histórico</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ---------- INFORMAR / ALTERAR PÁTIO MANUALMENTE ----------
function abrirModalPatio(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p) return;

    const existing = document.getElementById('modalPatio');
    if (existing) existing.remove();

    const opcoes = PATIOS_FIXOS.map(pt =>
        `<option value="${pt}" ${p.patioAtual === pt ? 'selected' : ''}>${pt}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'modalPatio';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="document.getElementById('modalPatio').remove()">&times;</span>
            <h2>🅿️ Informar Pátio</h2>
            <p class="text-muted" style="margin-bottom:1rem">
                Pedido <strong>#${p.id}</strong> — ${p.cliente || ''} · ${p.modelo || ''} ${p.placa || ''}<br>
                ${p.patioAtual ? `Atualmente no pátio de <strong>${p.patioAtual}</strong>.` : 'Atualmente fora de pátio.'}
            </p>
            <div class="form-group">
                <label>Em qual pátio o carro está? *</label>
                <select id="patioManualSelect"
                    onchange="document.getElementById('patioManualOutro').style.display = this.value==='__outro' ? '' : 'none'">
                    ${p.patioAtual ? '' : '<option value="">Selecione o pátio...</option>'}
                    ${opcoes}
                    <option value="__outro">Outra cidade...</option>
                </select>
                <input type="text" id="patioManualOutro" placeholder="Digite a cidade/UF" style="display:none;margin-top:0.5rem">
            </div>
            <div id="mensagemPatio" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarPatioManual(${p.id})">Confirmar Entrada</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalPatio').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function salvarPatioManual(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !supabase) return;

    let patio = document.getElementById('patioManualSelect').value.trim();
    if (patio === '__outro') patio = document.getElementById('patioManualOutro').value.trim();

    const msgEl = document.getElementById('mensagemPatio');
    if (!patio) {
        msgEl.textContent = 'Selecione o pátio.';
        msgEl.className = 'message show error';
        return;
    }
    if (patio === p.patioAtual) {
        document.getElementById('modalPatio').remove();
        return; // nada mudou
    }

    try {
        const { error } = await supabase.from('pedidos')
            .update({ patio_atual: patio, patio_desde: new Date().toISOString() })
            .eq('id', pedidoId);
        if (error) throw error;

        const texto = p.patioAtual
            ? `🅿️ Transferido do pátio de ${p.patioAtual} para ${patio}`
            : `🅿️ Entrou no pátio de ${patio}`;
        await registrarMovimentacaoPatio(p, texto);

        document.getElementById('modalPatio').remove();
        await carregarDadosDoSupabase();
        renderizarPainelPatios();
        if (typeof carregarPainel === 'function') carregarPainel();
        if (typeof renderizarCarteiraDemanda === 'function') renderizarCarteiraDemanda();
        if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
        exibirMensagem('mensagemLogistica', `✅ ${texto} (pedido #${pedidoId})`, 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.className = 'message show error';
    }
}

async function retirarDoPatio(pedidoId) {
    const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
    if (!p || !p.patioAtual || !supabase) return;
    if (!confirm(`Retirar o pedido #${p.id} (${p.placa || ''}) do pátio de ${p.patioAtual}?`)) return;

    try {
        const { error } = await supabase.from('pedidos')
            .update({ patio_atual: null, patio_desde: null })
            .eq('id', pedidoId);
        if (error) throw error;

        await registrarMovimentacaoPatio(p, `📤 Saiu do pátio de ${p.patioAtual}`);

        const det = document.getElementById('modalDetalheCarro');
        if (det) det.remove();
        await carregarDadosDoSupabase();
        renderizarPainelPatios();
        if (typeof carregarPainel === 'function') carregarPainel();
        exibirMensagem('mensagemLogistica', `✅ Pedido #${pedidoId} retirado do pátio.`, 'success');
    } catch (e) {
        alert('Erro ao retirar do pátio: ' + e.message);
    }
}

// Extrato de entradas e saídas (transbordos + movimentações manuais)
async function carregarMovimentacoesPatios() {
    const el = document.getElementById('patiosMovsLista');
    if (!el || !supabase) return;
    try {
        const { data, error } = await supabase
            .from('historico_status')
            .select('*')
            .or('status_novo.eq.Transbordo,status_anterior.eq.Transbordo,observacao.ilike.*pátio*')
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) throw error;
        if (!data || data.length === 0) {
            el.innerHTML = '<p class="text-muted text-sm">Nenhuma movimentação de pátio registrada ainda.</p>';
            return;
        }

        el.innerHTML = data.map(h => {
            const obs = h.observacao || '';
            const saida = h.status_anterior === 'Transbordo' || obs.includes('📤') || obs.includes('Saiu do pátio');
            const entrada = !saida;
            return `
            <div class="patio-mov ${entrada ? 'mov-entrada' : 'mov-saida'}">
                <span class="mov-tipo">${entrada ? '⬇ ENTROU' : '⬆ SAIU'}</span>
                <span class="mov-info">Pedido <strong>#${h.pedido_id}</strong>${obs ? ' — ' + obs : ''}</span>
                <span class="mov-meta">${h.usuario_nome || ''} · ${h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</span>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('Erro ao carregar movimentações:', e);
        el.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar as movimentações.</p>';
    }
}

// ============================================
// PAINEL DAS CEGONHAS (VISÃO SIMPLIFICADA)
// ============================================

function renderizarPainelCegonhas() {
    renderizarGridVeiculos('painelCegonhas', v => v.propriedade !== 'terceiro');
}

// Painel dos terceiros (cegonhas e guinchos de fora da frota)
function renderizarPainelTerceiros() {
    renderizarGridVeiculos('painelTerceiros', v => v.propriedade === 'terceiro');
}

// Monta a rota que a cegonha está percorrendo. Prioridade:
// 1) Se a cegonha tem uma ROTA PLANEJADA ativa, mostra as cidades da rota
//    (planejamento — como o comercial vai vender e a logística vai executar).
// 2) Senão, cai no cálculo antigo: monta a partir dos pedidos alocados.
function rotaDaCegonha(pedidos, placaCegonha) {
    // (1) Rota planejada da cegonha, se existir
    if (placaCegonha && typeof rotasGlobais !== 'undefined' && rotasGlobais && rotasGlobais.length) {
        const rota = rotasGlobais.find(r => r.placa_cegonha === placaCegonha &&
            !['concluida', 'cancelada'].includes(String(r.status || '').toLowerCase()));
        if (rota) {
            const paradas = paradasDaRota(rota);
            if (paradas && paradas.length) {
                const partes = paradas.map((c, i) => {
                    const cls = i === 0 ? 'rota-coletar' : (i === paradas.length - 1 ? 'rota-destino' : 'rota-patio');
                    const icone = i === 0 ? '📍' : (i === paradas.length - 1 ? '🏁' : '🔁');
                    return `<span class="rota-ponto ${cls}" title="Cidade da rota planejada">${icone} ${c}</span>`;
                }).join('<span class="rota-seta">→</span>');
                return `<span class="rota-planejada-tag" title="Rota planejada">📋</span> ${partes}`;
            }
        }
    }

    // (2) Fallback: monta a partir dos pedidos alocados (comportamento original)
    if (!pedidos || pedidos.length === 0) return '';

    const unicos = arr => [...new Set(arr.filter(Boolean))];
    const origens  = unicos(pedidos.map(p => `${p.cidadeOrigem || ''}/${p.ufOrigem || ''}`.replace(/^\/$/, '')));
    const destinos = unicos(pedidos.map(p => `${p.cidadeDestino || ''}/${p.ufDestino || ''}`.replace(/^\/$/, '')));
    const patios   = unicos(pedidos.map(p => p.cidadeTransbordo));

    const aColetar = unicos(
        pedidos.filter(p => ['Pendente','Intenção Agendada','Aguardando Confirmação','Em Coleta'].includes(p.status))
               .map(p => `${p.cidadeOrigem || ''}/${p.ufOrigem || ''}`)
    );

    const trecho = (lista, icone, cls) => lista.map(c =>
        `<span class="rota-ponto ${cls}">${icone} ${c}</span>`).join('<span class="rota-seta">→</span>');

    const partes = [];
    if (origens.length)  partes.push(trecho(origens, '📍', aColetar.length ? 'rota-coletar' : 'rota-feito'));
    if (patios.length)   partes.push(trecho(patios, '🔁', 'rota-patio'));
    if (destinos.length) partes.push(trecho(destinos, '🏁', 'rota-destino'));

    return partes.join('<span class="rota-seta">→</span>');
}

function renderizarGridVeiculos(idGrid, filtro) {
    const grid = document.getElementById(idGrid);
    if (!grid) return;

    const veiculos = veiculosGlobais.filter(filtro);

    if (veiculos.length === 0) {
        grid.innerHTML = idGrid === 'painelTerceiros'
            ? '<p class="text-center text-muted">Nenhuma cegonha ou guincho de terceiro cadastrado.<br><span class="text-sm">Cadastre em Cadastros → Veículo, marcando a propriedade como <strong>🤝 Cegonha terceira</strong>.</span></p>'
            : '<p class="text-center text-muted">Nenhum veículo da frota própria cadastrado.</p>';
        return;
    }

    grid.innerHTML = '';

    veiculos.forEach(v => {
        const pedidosNaCegonha = pedidosGlobais.filter(p =>
            p.placaCegonha === v.placa && !['Entregue','Cancelado'].includes(p.status)
        );
        const capacidade = v.capacidade || 4;
        const vagas = capacidade - pedidosNaCegonha.length;
        const pct = Math.round((pedidosNaCegonha.length / capacidade) * 100);
        const corPct = pct >= 100 ? '#ef4444' : pct >= 60 ? '#fbbf24' : '#4ade80';
        const motorista = v.motorista_padrao || pedidosNaCegonha[0]?.motorista1 || '—';

        const vagasHTML = Array.from({ length: capacidade }, (_, i) => {
            const p = pedidosNaCegonha[i];
            if (p) {
                const cores = { 'Intenção Agendada': '#60a5fa', 'Em Coleta': '#a78bfa', 'Em Transporte': '#34d399', 'Pendente': '#fbbf24' };
                const cor = cores[p.status] || '#f97316';
                return `<div class="cegonha-vaga ocupada" style="border-color:${cor}40;background:${cor}10" 
                    title="#${p.id} — ${p.cliente} | ${p.modelo || ''} ${p.placa || ''}">
                    <span class="vaga-id">#${p.id}</span>
                    <span class="vaga-modelo">🚗 ${p.modelo || '—'}${p.placa ? ` <span class="vaga-placa">${p.placa}</span>` : ''}</span>
                    <span class="vaga-cliente">${p.cliente || '—'}</span>
                    <span class="vaga-status" style="color:${cor}">${p.status}</span>
                    <div class="vaga-acoes">
                        <button class="btn-vaga-acao" onclick="abrirMoverPedido(${p.id})" title="Mover/Remover">⚙️</button>
                        <button class="btn-vaga-acao" onclick="abrirRegistrarOcorrencia(${p.id})" title="Ocorrência">⚠️</button>
                        <button class="btn-vaga-acao" onclick="verFotosPlaca(${p.id},'${(p.cliente||'').replace(/'/g,"\\'")}')">📸</button>
                    </div>
                </div>`;
            } else {
                return `<div class="cegonha-vaga livre">
                    <span style="color:rgba(255,255,255,0.2);font-size:1.2rem">+</span>
                    <span style="font-size:0.65rem;color:rgba(255,255,255,0.2)">Livre</span>
                </div>`;
            }
        }).join('');

        const manut = typeof manutencaoAtivaDoVeiculo === 'function' ? manutencaoAtivaDoVeiculo(v.placa) : null;
        const card = document.createElement('div');
        card.className = 'cegonha-card' + (manut ? ' cegonha-manutencao' : '');
        card.innerHTML = `
            ${manut ? `<div class="cegonha-manut-selo">🔧 EM MANUTENÇÃO${manut.descricao ? ' — ' + manut.descricao : ''} <span class="cegonha-manut-ate">até ${manut.data_fim ? new Date(manut.data_fim + 'T12:00').toLocaleDateString('pt-BR') : 'conclusão do lembrete'}</span></div>` : ''}
            <div class="cegonha-header">
                <div>
                    <span class="cegonha-placa">${v.placa}</span>
                    <span class="cegonha-tipo">${v.tipo || 'Cegonha'}</span>
                    ${v.propriedade === 'terceiro' ? `<span class="badge-terceiro" title="Cegonha terceira${v.transportador_nome ? ' — ' + v.transportador_nome : ''}">🤝 Terceiro</span>` : ''}
                </div>
                <span class="cegonha-pct" style="color:${corPct}">${pct}% ocupado</span>
            </div>
            ${v.propriedade === 'terceiro' && v.transportador_nome ? `<div class="cegonha-transportador">🏢 ${v.transportador_nome}${v.transportador_contato ? ' · ' + v.transportador_contato : ''}</div>` : ''}
            <div class="cegonha-motorista">
                👤 <span>${motorista}</span>
                <button class="btn-vincular-motorista" onclick="abrirVincularMotorista('${v.placa}','${v.id||''}')">Alterar</button>
            </div>
            ${(() => {
                const html = rotaDaCegonha(pedidosNaCegonha, v.placa);
                return html ? `<div class="cegonha-rota"><span class="cegonha-rota-titulo">🛣️ Rota</span><div class="cegonha-rota-linha">${html}</div></div>` : '';
            })()}
            <div class="cegonha-vagas-grid">${vagasHTML}</div>
            <div class="cegonha-barra">
                <div class="cegonha-barra-inner" style="width:${pct}%;background:${corPct};color:${corPct}"></div>
            </div>
            <div class="cegonha-footer">
                <span>${pedidosNaCegonha.length}/${capacidade} vagas</span>
                <span style="color:#4ade80" title="Receita: soma dos fretes dos pedidos">R$ ${pedidosNaCegonha.reduce((a,p)=>a+(parseFloat(p.valorFrete)||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                <button class="btn-gerar-pdf-cegonha" onclick="gerarEspelhoCarga('${v.placa}')" 
                    ${pedidosNaCegonha.length === 0 ? 'disabled title="Nenhum pedido alocado"' : 'title="Gerar espelho de carga para o fiscal"'}>
                    📄 Espelho de Carga
                </button>
            </div>
            ${v.propriedade === 'terceiro' ? (() => {
                const receita = pedidosNaCegonha.reduce((a,p)=>a+(parseFloat(p.valorFrete)||0),0);
                const custo = parseFloat(v.custo_terceiro) || 0;
                const margem = receita - custo;
                const corMargem = margem > 0 ? '#4ade80' : margem < 0 ? '#ef4444' : '#9ca3af';
                return `
                <div class="cegonha-terceiro-fin">
                    <div class="ct-fin-item">
                        <span class="ct-fin-label">Custo terceiro</span>
                        <span class="ct-fin-val" style="color:#fb923c">R$ ${custo.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                    </div>
                    <div class="ct-fin-item">
                        <span class="ct-fin-label">Margem</span>
                        <span class="ct-fin-val" style="color:${corMargem}">R$ ${margem.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                    </div>
                    <button class="btn-custo-terceiro" onclick="abrirCustoTerceiro('${v.id||''}','${v.placa}')">${custo > 0 ? '✏️ Editar custo' : '💵 Definir custo'}</button>
                </div>`;
            })() : ''}
        `;
        grid.appendChild(card);
    });
}

// ============================================
// MOVER / REMOVER / CANCELAR PEDIDO
// ============================================

// ============================================
// CUSTO DO FRETE TERCEIRO (valor pago ao transportador)
// ============================================

function abrirCustoTerceiro(veiculoId, placa) {
    const v = veiculosGlobais.find(x => String(x.id) === String(veiculoId) || x.placa === placa);
    if (!v) return;

    const existing = document.getElementById('modalCustoTerceiro');
    if (existing) existing.remove();

    const receita = pedidosGlobais.filter(p => p.placaCegonha === v.placa && !['Entregue','Cancelado'].includes(p.status))
        .reduce((a,p)=>a+(parseFloat(p.valorFrete)||0),0);
    const custoAtual = parseFloat(v.custo_terceiro) || 0;

    const modal = document.createElement('div');
    modal.id = 'modalCustoTerceiro';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:440px">
            <span class="close" onclick="document.getElementById('modalCustoTerceiro').remove()">&times;</span>
            <h2>💵 Custo do Transportador</h2>
            <p class="text-muted text-sm" style="margin-bottom:1rem">
                🚛 ${v.placa}${v.transportador_nome ? ' · ' + v.transportador_nome : ''}<br>
                Receita atual desta carga: <strong style="color:#4ade80">R$ ${receita.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
            </p>
            <div class="form-group">
                <label>Valor pago ao transportador (R$)</label>
                <div class="input-moeda-wrap">
                    <span class="input-moeda-prefixo">R$</span>
                    <input type="text" id="inputCustoTerceiro" placeholder="0,00" oninput="mascaraMoeda(this)"
                        value="${custoAtual > 0 ? custoAtual.toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''}">
                </div>
            </div>
            <div id="mensagemCustoTerceiro" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarCustoTerceiro('${v.id}','${v.placa}')">Salvar</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalCustoTerceiro').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function salvarCustoTerceiro(veiculoId, placa) {
    if (!supabase) return;
    const valorStr = document.getElementById('inputCustoTerceiro')?.value || '';
    const custo = valorStr ? valorMoedaParaFloat(valorStr) : 0;
    const msgEl = document.getElementById('mensagemCustoTerceiro');

    try {
        const alvo = veiculoId && veiculoId !== 'undefined'
            ? { col: 'id', val: veiculoId }
            : { col: 'placa', val: placa };
        const { error } = await supabase.from('veiculos')
            .update({ custo_terceiro: custo }).eq(alvo.col, alvo.val);
        if (error) throw error;

        document.getElementById('modalCustoTerceiro').remove();
        await carregarDadosDoSupabase();
        renderizarPainelCegonhas();
        exibirMensagem('mensagemLogistica', `✅ Custo do transportador atualizado para R$ ${custo.toLocaleString('pt-BR',{minimumFractionDigits:2})}.`, 'success');
    } catch (e) {
        if (msgEl) { msgEl.textContent = 'Erro ao salvar: ' + e.message; msgEl.className = 'message show error'; }
    }
}

function abrirMoverPedido(pedidoId) {
    const pedido = pedidosGlobais.find(p => p.id == pedidoId);
    if (!pedido) return;

    document.getElementById('moverPedidoId').value = pedidoId;
    document.getElementById('moverAcao').value = '';
    document.getElementById('moverMotivo').value = '';
    document.getElementById('mensagemMover').className = 'message';
    document.getElementById('grupoSelecionarCegonha').style.display = 'none';
    const _gp = document.getElementById('grupoEditarPlaca'); if (_gp) _gp.style.display = 'none';
    const _np = document.getElementById('moverNovaPlaca'); if (_np) _np.value = pedido.placa || '';

    // Resetar seleção de opções
    document.querySelectorAll('.mover-opcao').forEach(o => o.classList.remove('selecionada'));

    document.getElementById('moverPedidoInfo').innerHTML = `
        <strong>#${pedido.id}</strong>
        <span>${pedido.cliente || '—'}</span>
        <span>${pedido.cidadeOrigem}/${pedido.ufOrigem} → ${pedido.cidadeDestino}/${pedido.ufDestino}</span>
        <span style="color:#f97316">Cegonha: ${pedido.placaCegonha || '—'}</span>
    `;

    // Popular select de cegonhas disponíveis
    const sel = document.getElementById('cegonhaDestino');
    if (sel) {
        sel.innerHTML = '<option value="">Selecione...</option>';
        veiculosGlobais.forEach(v => {
            if (v.placa === pedido.placaCegonha) return;
            const vagas = (v.capacidade || 4) - pedidosGlobais.filter(p => p.placaCegonha === v.placa && !['Entregue','Cancelado'].includes(p.status)).length;
            if (vagas > 0) {
                const opt = document.createElement('option');
                opt.value = v.placa;
                opt.textContent = `${v.placa} (${vagas} vagas livres)`;
                sel.appendChild(opt);
            }
        });
    }

    document.getElementById('modalMoverPedido').classList.add('show');
}

function selecionarAcaoMover(acao) {
    document.getElementById('moverAcao').value = acao;
    document.querySelectorAll('.mover-opcao').forEach(o => o.classList.remove('selecionada'));
    event.currentTarget.classList.add('selecionada');
    document.getElementById('grupoSelecionarCegonha').style.display = acao === 'mover' ? 'block' : 'none';
    const gp = document.getElementById('grupoEditarPlaca');
    if (gp) gp.style.display = acao === 'editarPlaca' ? 'block' : 'none';
}

async function confirmarMoverPedido() {
    const pedidoId = document.getElementById('moverPedidoId').value;
    const acao = document.getElementById('moverAcao').value;
    const motivo = document.getElementById('moverMotivo').value.trim();
    const cegonhaDestino = document.getElementById('cegonhaDestino').value;
    const msgEl = document.getElementById('mensagemMover');
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';

    if (!acao) {
        msgEl.textContent = 'Selecione uma ação.';
        msgEl.className = 'message show error';
        return;
    }

    if (acao === 'mover' && !cegonhaDestino) {
        msgEl.textContent = 'Selecione a cegonha de destino.';
        msgEl.className = 'message show error';
        return;
    }

    try {
        const pedido = pedidosGlobais.find(p => p.id == pedidoId);
        let novoStatus = pedido?.status;
        let atualizacao = {};
        let obsHistorico = '';

        if (acao === 'remover') {
            atualizacao = { status: 'Pendente', placa_cegonha: null, motorista_1: null, motorista_2: null, percent_motorista_1: null, percent_motorista_2: null };
            novoStatus = 'Pendente';
            obsHistorico = `Removido da cegonha ${pedido?.placaCegonha}${motivo ? ' — ' + motivo : ''}`;
        } else if (acao === 'cancelar') {
            atualizacao = { status: 'Cancelado' };
            novoStatus = 'Cancelado';
            obsHistorico = `Pedido cancelado${motivo ? ' — ' + motivo : ''}`;
        } else if (acao === 'mover') {
            atualizacao = { placa_cegonha: cegonhaDestino };
            obsHistorico = `Movido de ${pedido?.placaCegonha} para ${cegonhaDestino}${motivo ? ' — ' + motivo : ''}`;
        } else if (acao === 'editarPlaca') {
            const novaPlaca = (document.getElementById('moverNovaPlaca')?.value.trim() || '').toUpperCase();
            if (!novaPlaca) {
                msgEl.textContent = 'Informe a nova placa do carro.';
                msgEl.className = 'message show error';
                return;
            }
            atualizacao = { placa: novaPlaca };
            obsHistorico = `Placa do carro corrigida: ${pedido?.placa || '—'} → ${novaPlaca}${motivo ? ' — ' + motivo : ''}`;
        }

        const { error } = await supabase.from('pedidos').update(atualizacao).eq('id', pedidoId);
        if (error) throw error;

        await supabase.from('historico_status').insert({
            pedido_id: parseInt(pedidoId),
            status_anterior: pedido?.status,
            status_novo: novoStatus,
            usuario_nome: usuarioNome,
            usuario_perfil: 'logistica',
            observacao: obsHistorico
        });

        await carregarDadosDoSupabase();
        fecharModal('modalMoverPedido');
        exibirMensagem('mensagemLogistica', '✅ Pedido atualizado com sucesso!', 'success');
        renderizarPedidosDrag();
        renderizarVeiculosDrop();
        renderizarPainelCegonhas();
        renderizarKanban();

    } catch(err) {
        msgEl.textContent = 'Erro: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// GALERIA DE FOTOS DAS PLACAS
// ============================================

async function carregarGaleriaFotos(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p class="text-center text-muted">Carregando fotos...</p>';

    try {
        const { data, error } = await supabase
            .from('ocorrencias')
            .select('*')
            .eq('tipo', 'foto_placa')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">Nenhuma foto enviada ainda.</p>';
            return;
        }

        container.innerHTML = data.map(f => {
            const pedido = pedidosGlobais.find(p => p.id == f.pedido_id);
            const data_fmt = f.created_at ? new Date(f.created_at).toLocaleString('pt-BR') : '—';
            return `<div class="foto-card">
                <div class="foto-card-img" onclick="abrirFotoAmpliada('${f.arquivo_url}')">
                    <img src="${f.arquivo_url}" alt="Foto da placa" loading="lazy"
                        onerror="this.parentElement.innerHTML='<span class=\\'foto-erro\\'>Imagem indisponível</span>'">
                    <div class="foto-overlay">🔍 Ampliar</div>
                </div>
                <div class="foto-card-info">
                    <span class="foto-pedido">#${f.pedido_id} — ${pedido?.cliente || '—'}</span>
                    <span class="foto-motorista">👤 ${f.usuario_nome || '—'}</span>
                    <span class="foto-data">${data_fmt}</span>
                    ${f.descricao ? `<span class="foto-obs">${f.descricao}</span>` : ''}
                </div>
            </div>`;
        }).join('');

    } catch(e) {
        container.innerHTML = '<p class="text-center text-muted">Erro ao carregar fotos.</p>';
    }
}

async function verFotosPlaca(pedidoId, clienteNome) {
    const modal = document.getElementById('modalFotoPlaca');
    document.getElementById('modalFotoInfo').textContent = `Pedido #${pedidoId} — ${clienteNome}`;
    document.getElementById('modalFotoConteudo').innerHTML = '<p class="text-center text-muted">Carregando...</p>';
    modal.classList.add('show');

    const { data } = await supabase.from('ocorrencias').select('*')
        .eq('pedido_id', pedidoId).eq('tipo', 'foto_placa').order('created_at', { ascending: false });

    const cont = document.getElementById('modalFotoConteudo');
    if (!data || data.length === 0) {
        cont.innerHTML = '<p class="text-center text-muted">Nenhuma foto enviada para este pedido.</p>';
        return;
    }

    cont.innerHTML = data.map(f => `
        <div class="foto-card">
            <div class="foto-card-img" onclick="abrirFotoAmpliada('${f.arquivo_url}')">
                <img src="${f.arquivo_url}" alt="Foto da placa" loading="lazy">
                <div class="foto-overlay">🔍 Ampliar</div>
            </div>
            <div class="foto-card-info">
                <span class="foto-motorista">👤 ${f.usuario_nome || '—'}</span>
                <span class="foto-data">${new Date(f.created_at).toLocaleString('pt-BR')}</span>
                ${f.descricao ? `<span class="foto-obs">${f.descricao}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function abrirFotoAmpliada(url) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:1rem';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain">`;
    document.body.appendChild(overlay);
}

// Adicionar botão de fotos na listagem do comercial
const _renderOriginal = window.renderizarPedidosComercial;

// ============================================
// PDF FISCAL AUTOMÁTICO AO "EM TRANSPORTE"
// ============================================

async function dispararPDFFiscal(pedidoId) {
    const pedido = pedidosGlobais.find(p => p.id == pedidoId || String(p.id) === String(pedidoId));
    if (!pedido) return;

    // O espelho de carga é POR CEGONHA, não por pedido. Sem cegonha
    // definida não há o que enviar ao fiscal ainda.
    const placaCegonha = pedido.placaCegonha;
    if (!placaCegonha) return;

    try {
        // Todos os pedidos que estão nessa cegonha agora
        const pedidosDaCegonha = pedidosGlobais.filter(p =>
            p.placaCegonha === placaCegonha && !['Entregue','Cancelado'].includes(p.status)
        );
        const totalFrete = pedidosDaCegonha.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);

        // Passa pelo ponto único de registro (mesmo caminho da geração
        // manual), que garante 1 espelho por cegonha sem duplicar.
        await registrarEspelhoFiscal({
            placaCegonha,
            pedidos: pedidosDaCegonha,
            totalFrete,
            usuarioNome: 'Sistema',
            usuarioPerfil: 'sistema'
        });
        console.log(`✅ Espelho da cegonha ${placaCegonha} atualizado (${pedidosDaCegonha.length} veículo(s))`);

    } catch(e) {
        console.warn('Erro ao disparar PDF fiscal:', e);
    }
}

// ============================================
// FILTRO DE STATUS NA LOGÍSTICA
// ============================================

// Sobrescrever renderizarPedidosDrag para usar filtro
const _renderDragOriginal = renderizarPedidosDrag;
renderizarPedidosDrag = function() {
    const filtro = document.getElementById('filtroPedidosLogistica')?.value || '';
    if (filtro) {
        const todos = pedidosGlobais;
        const filtrados = pedidosGlobais.filter(p => p.status === filtro);
        // Temporariamente substituir globais
        window._pedidosFiltrados = filtrados;
    }
    _renderDragOriginal();
}

// ============================================
// ATUALIZAR carregarLogistica para novas abas
// ============================================
const _carregarLogisticaOriginal = carregarLogistica;
carregarLogistica = async function() {
    await _carregarLogisticaOriginal();
    // Atualizar aba ativa
    const abaAtiva = document.querySelector('.log-tab-content[style*="block"]');
    if (abaAtiva?.id === 'logTab-folgas') renderizarFolgas();
    if (abaAtiva?.id === 'logTab-rotas') renderizarRotas();
    if (abaAtiva?.id === 'logTab-cegonhas') renderizarPainelCegonhas();
    if (abaAtiva?.id === 'logTab-terceiros') renderizarPainelTerceiros();
    if (abaAtiva?.id === 'logTab-acompanhamento') renderizarAcompanhamento();
    if (abaAtiva?.id === 'logTab-confirmacoes') { renderizarPainelConfirmacoes(); renderizarSolicitacoesEdicao(); }
    if (abaAtiva?.id === 'logTab-validacaoPlacas') renderizarValidacaoPlacas();
    if (abaAtiva?.id === 'logTab-manifestos') renderizarManifestos();
    if (abaAtiva?.id === 'logTab-patios') renderizarPainelPatios();
    if (abaAtiva?.id === 'logTab-fotos') carregarGaleriaFotos('galeria-fotos-logistica');
}
// ============================================
// ESPELHO DE CARGA — PDF POR CEGONHA
// ============================================

// Monta o "retrato" dos pedidos no momento em que o espelho é gerado.
// Sem isso o documento mudaria depois (carros entregues sumiriam dele),
// o que é inaceitável para um documento fiscal.
async function montarSnapshotEspelho(pedidos) {
    let clientesMap = {};
    try {
        const ids = pedidos.map(p => p.clienteId).filter(Boolean);
        if (ids.length > 0) {
            const { data } = await supabase.from('clientes').select('*').in('id', ids);
            (data || []).forEach(c => { clientesMap[c.id] = c; });
        }
        const nomes = pedidos.map(p => p.cliente).filter(Boolean);
        if (nomes.length > 0) {
            const { data: porNome } = await supabase.from('clientes').select('*').in('nome', nomes);
            (porNome || []).forEach(c => { clientesMap[c.nome] = c; });
        }
    } catch (e) { /* segue sem os dados do cliente */ }

    return pedidos.map(p => {
        const cli = clientesMap[p.clienteId] || clientesMap[p.cliente] || {};
        return {
            id: p.id,
            cliente: p.cliente || '',
            cnpj: cli.cnpj || null,
            cpf: cli.cpf || null,
            inscricao_estadual: cli.inscricao_estadual || null,
            modelo: p.modelo || '',
            placa: p.placa || '',
            referencia: p.referencia || null,
            cidadeOrigem: p.cidadeOrigem || '', ufOrigem: p.ufOrigem || '',
            cidadeDestino: p.cidadeDestino || '', ufDestino: p.ufDestino || '',
            enderecoColeta: p.enderecoColeta || '',
            cnpjColeta: p.cnpjColeta || null,
            enderecoEntrega: p.enderecoEntrega || '',
            cnpjEntrega: p.cnpjEntrega || null,
            freteTipo: p.freteTipo || 'cheio',
            valorFrete: parseFloat(p.valorFrete) || 0
        };
    });
}

// ============================================
// REGISTRO DO ESPELHO FISCAL — ponto único
// Garante 1 espelho por cegonha enquanto o CTE não for emitido.
// Tanto a geração manual quanto a automática passam por aqui.
// ============================================
async function registrarEspelhoFiscal({ placaCegonha, pedidos, totalFrete, usuarioNome, usuarioPerfil }) {
    if (!supabase || !placaCegonha || !pedidos || pedidos.length === 0) return;

    // Retrato imutável dos pedidos + número de documento estável
    const snapshot = await montarSnapshotEspelho(pedidos);
    const hoje = new Date();
    const numeroDoc = `MM-${placaCegonha.replace(/[^A-Z0-9]/gi,'')}-` +
        `${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,'0')}${String(hoje.getDate()).padStart(2,'0')}-` +
        `${String(hoje.getHours()).padStart(2,'0')}${String(hoje.getMinutes()).padStart(2,'0')}`;

    const dadosExtras = JSON.stringify({
        placa_cegonha: placaCegonha,
        total_pedidos: pedidos.length,
        total_frete: totalFrete,
        pedidos_ids: pedidos.map(p => p.id),
        numero_doc: numeroDoc,
        snapshot,
        gerado_em: new Date().toISOString()
    });
    const descricao = `Espelho de carga — Cegonha ${placaCegonha} — ${pedidos.length} veículo(s)`;

    // Existe espelho ABERTO (CTE não emitido) para esta cegonha?
    const { data: existentes } = await supabase.from('ocorrencias')
        .select('id, cte_emitido, espelho_cegonha, dados_extras')
        .eq('tipo', 'pdf_fiscal')
        .order('created_at', { ascending: false })
        .limit(100);

    const aberto = (existentes || []).find(e => {
        if (e.cte_emitido === true) return false;
        if (e.espelho_cegonha) return e.espelho_cegonha === placaCegonha;
        try { return JSON.parse(e.dados_extras || '{}').placa_cegonha === placaCegonha; }
        catch (err) { return false; }
    });

    // Evita duplicata: se TODOS os carros desta carga já têm CTe emitido em
    // espelhos anteriores, não cria um novo registro (já foram faturados).
    const idsAtuais = pedidos.map(p => p.id);
    const idsJaEmitidos = new Set();
    (existentes || []).forEach(e => {
        if (e.cte_emitido !== true) return;
        try {
            const ex = JSON.parse(e.dados_extras || '{}');
            (ex.pedidos_ids || []).forEach(id => idsJaEmitidos.add(id));
        } catch (err) { /* ignora */ }
    });
    const faltaEmitir = idsAtuais.filter(id => !idsJaEmitidos.has(id));
    if (faltaEmitir.length === 0) {
        console.info('Espelho não recriado: todos os carros desta cegonha já têm CTe emitido.');
        return; // não duplica
    }

    if (aberto) {
        // Ao atualizar (mais um carro embarcou), o snapshot é refeito
        // mas o NÚMERO DO DOCUMENTO original é preservado.
        let dadosAtualizados = dadosExtras;
        try {
            const antigo = JSON.parse(aberto.dados_extras || '{}');
            if (antigo.numero_doc) {
                const obj = JSON.parse(dadosExtras);
                obj.numero_doc = antigo.numero_doc;
                dadosAtualizados = JSON.stringify(obj);
            }
        } catch (e) { /* mantém o novo */ }

        const { error } = await supabase.from('ocorrencias')
            .update({ descricao, dados_extras: dadosAtualizados, espelho_cegonha: placaCegonha })
            .eq('id', aberto.id);
        if (error) console.warn('Erro ao atualizar espelho:', error.message);
        return;
    }

    notificar({
        perfil: 'fiscal', tipo: 'acao',
        titulo: 'Espelho de carga disponível para CTE',
        mensagem: `Cegonha ${placaCegonha} · ${pedidos.length} veículo(s) · ${_orcMoeda ? _orcMoeda(totalFrete) : 'R$ ' + totalFrete}`
    });

    // Aviso de seguro CONSOLIDADO: uma vez, agora que a carga está decidida
    // (substitui os antigos avisos por-carro do manifesto).
    notificar({
        perfil: 'fiscal', tipo: 'acao',
        titulo: 'Revisar seguro da carga',
        mensagem: `Cegonha ${placaCegonha} fechada com ${pedidos.length} veículo(s). Confira/atualize o seguro.`
    });

    const { error } = await supabase.from('ocorrencias').insert({
        pedido_id: pedidos[0].id,
        tipo: 'pdf_fiscal',
        espelho_cegonha: placaCegonha,     // coluna real: permite índice único
        descricao,
        usuario_nome: usuarioNome,
        usuario_perfil: usuarioPerfil,
        dados_extras: dadosExtras
    });

    // Se dois pedidos entraram Em Transporte no mesmo instante, o índice
    // único do banco barra o segundo insert — nesse caso, atualizamos.
    if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('unique')) {
            const { data: agora } = await supabase.from('ocorrencias')
                .select('id').eq('tipo', 'pdf_fiscal')
                .eq('espelho_cegonha', placaCegonha)
                .eq('cte_emitido', false).limit(1);
            if (agora && agora[0]) {
                await supabase.from('ocorrencias')
                    .update({ descricao, dados_extras: dadosExtras }).eq('id', agora[0].id);
            }
        } else {
            console.warn('Erro ao registrar espelho:', error.message);
        }
    }
}

async function gerarEspelhoCarga(placaCegonha, opcoes = {}) {
    const registrar = opcoes.registrar !== false;   // visualizar não registra
    const veiculo = veiculosGlobais.find(v => v.placa === placaCegonha);

    // Ao VISUALIZAR um espelho já registrado, usamos o retrato salvo.
    // É o que permite reimprimir uma carga já entregue e garante que o
    // documento seja sempre igual ao que foi emitido.
    let snapshotSalvo = null, numeroDocSalvo = null, dataSalva = null;
    if (opcoes.espelhoId && supabase) {
        try {
            const { data } = await supabase.from('ocorrencias')
                .select('dados_extras, created_at').eq('id', opcoes.espelhoId).maybeSingle();
            const ex = JSON.parse(data?.dados_extras || '{}');
            if (Array.isArray(ex.snapshot) && ex.snapshot.length > 0) {
                snapshotSalvo = ex.snapshot;
                numeroDocSalvo = ex.numero_doc || null;
                dataSalva = ex.gerado_em || data?.created_at || null;
            }
        } catch (e) { /* cai para os dados ao vivo */ }
    }

    const pedidos = snapshotSalvo || pedidosGlobais.filter(p =>
        p.placaCegonha === placaCegonha &&
        !['Entregue', 'Cancelado'].includes(p.status)
    );

    if (pedidos.length === 0) {
        alert('Nenhum pedido nesta carga.\n\nSe a carga já foi entregue, o espelho original só fica disponível se tiver sido gerado antes da entrega.');
        return;
    }

    // Buscar dados dos clientes só quando não há retrato salvo
    let clientesMap = {};
    try {
        if (snapshotSalvo) throw new Error('usa snapshot');
        const ids = pedidos.map(p => p.clienteId).filter(Boolean);
        if (ids.length > 0) {
            const { data } = await supabase.from('clientes').select('*').in('id', ids);
            (data || []).forEach(c => { clientesMap[c.id] = c; });
        }
        // Também buscar por nome
        const nomes = pedidos.map(p => p.cliente).filter(Boolean);
        if (nomes.length > 0) {
            const { data: porNome } = await supabase.from('clientes').select('*').in('nome', nomes);
            (porNome || []).forEach(c => { clientesMap[c.nome] = c; });
        }
    } catch(e) {}

    const motorista = veiculo?.motorista_padrao || pedidos[0]?.motorista1 || '—';
    const totalFrete = pedidos.reduce((a, p) => a + (parseFloat(p.valorFrete) || 0), 0);
    const dataGeracao = dataSalva ? new Date(dataSalva).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
    // Número estável: reimprimir não gera número novo
    const numDoc = numeroDocSalvo || `MM-${placaCegonha.replace(/[^A-Z0-9]/gi,'')}-${Date.now().toString().slice(-6)}`;

    // Encontrar rota principal (mais comum)
    const rotaCount = {};
    pedidos.forEach(p => {
        const r = `${p.cidadeOrigem||''}/${p.ufOrigem||''} → ${p.cidadeDestino||''}/${p.ufDestino||''}`;
        rotaCount[r] = (rotaCount[r] || 0) + 1;
    });
    const rotaPrincipal = Object.entries(rotaCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

    // Linhas dos veículos transportados
    const linhasVeiculos = pedidos.map((p, i) => {
        // No retrato salvo os dados do cliente já vêm no próprio pedido
        const cli = p.cnpj !== undefined || p.cpf !== undefined
            ? p
            : (clientesMap[p.clienteId] || clientesMap[p.cliente] || {});
        const doc = cli.cnpj || cli.cpf || '—';
        const tipoDoc = cli.cnpj ? 'CNPJ' : cli.cpf ? 'CPF' : '—';
        const rota = `${p.cidadeOrigem||''}/${p.ufOrigem||''} → ${p.cidadeDestino||''}/${p.ufDestino||''}`;
        const valor = Number(p.valorFrete||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

        return `
        <tr class="${i % 2 === 0 ? 'par' : 'impar'}">
            <td class="center">${i + 1}</td>
            <td><strong>${p.cliente || '—'}</strong><br>
                <small style="color:#666">${tipoDoc}: ${doc}</small>
                ${cli.inscricao_estadual ? `<br><small style="color:#666">IE: ${cli.inscricao_estadual}</small>` : ''}
            </td>
            <td>${p.modelo || '—'}<br><small style="color:#666">${p.placa || '—'}</small>${p.referencia ? `<br><small style="color:#f97316;font-weight:700">🔖 ${p.referencia}</small>` : ''}</td>
            <td style="font-size:0.82rem">${rota}</td>
            <td style="font-size:0.82rem">${p.enderecoColeta || '—'}${p.cnpjColeta ? `<br><small style="color:#666">CNPJ: ${p.cnpjColeta}</small>` : ''}</td>
            <td style="font-size:0.82rem">${p.enderecoEntrega || '—'}${p.cnpjEntrega ? `<br><small style="color:#666">CNPJ: ${p.cnpjEntrega}</small>` : ''}</td>
            <td class="right"><strong>R$ ${valor}</strong><br><small style="color:#666">${p.freteTipo === 'carro' ? 'valor por carro' : 'parcela da carga'}</small></td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Espelho de Carga — ${placaCegonha}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #222; padding: 2rem; background: white; }

        /* CABEÇALHO */
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 3px solid #f97316; }
        .logo-nome { font-size: 1.6rem; font-weight: 900; color: #f97316; letter-spacing: 0.05em; }
        .logo-sub { font-size: 0.75rem; color: #888; margin-top: 0.2rem; }
        .doc-info { text-align: right; }
        .doc-titulo { font-size: 1.1rem; font-weight: 700; color: #333; }
        .doc-num { font-size: 0.78rem; color: #888; margin-top: 0.2rem; }
        .doc-data { font-size: 0.78rem; color: #888; }

        /* INFO DA CEGONHA */
        .cegonha-info { background: #fef3e8; border: 1px solid #f97316; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.5rem; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; }
        .info-item label { display: block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 0.2rem; }
        .info-item span { font-size: 0.88rem; font-weight: 700; color: #333; }

        /* RESUMO */
        .resumo-box { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
        .resumo-item { flex: 1; background: #f9f9f9; border-radius: 6px; padding: 0.7rem 1rem; text-align: center; border: 1px solid #eee; }
        .resumo-num { font-size: 1.4rem; font-weight: 700; color: #f97316; }
        .resumo-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-top: 0.2rem; }

        /* TABELA */
        h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: #f97316; margin-bottom: 0.6rem; border-bottom: 1px solid #f97316; padding-bottom: 0.3rem; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 11px; }
        thead tr { background: #f97316; color: white; }
        th { padding: 0.5rem 0.6rem; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 0.45rem 0.6rem; border-bottom: 1px solid #eee; vertical-align: top; }
        tr.par { background: #fff; }
        tr.impar { background: #fafafa; }
        .center { text-align: center; }
        .right { text-align: right; }

        /* TOTAL */
        .total-linha { background: #333 !important; color: white; }
        .total-linha td { padding: 0.6rem; font-weight: 700; border: none; color: white; }

        /* ASSINATURAS */
        .assinaturas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 2rem; }
        .assinatura { border-top: 1px solid #333; padding-top: 0.5rem; text-align: center; font-size: 0.75rem; color: #555; }

        /* FOOTER */
        .rodape { margin-top: 1.5rem; padding-top: 0.8rem; border-top: 1px solid #eee; font-size: 0.65rem; color: #aaa; display: flex; justify-content: space-between; }

        /* AVISO FISCAL */
        .aviso-fiscal { background: #fff8e1; border: 1px solid #fbbf24; border-radius: 6px; padding: 0.6rem 1rem; margin-bottom: 1.2rem; font-size: 0.78rem; color: #92400e; }

        @media print {
            body { padding: 1rem; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>

    <!-- CABEÇALHO -->
    <div class="header">
        <div>
            <div class="logo-nome">MOVEMASTER</div>
            <div class="logo-sub">Controle Logístico e Comercial</div>
        </div>
        <div class="doc-info">
            <div class="doc-titulo">ESPELHO DE CARGA</div>
            <div class="doc-num">Nº ${numDoc}</div>
            <div class="doc-data">Emitido em: ${dataGeracao}</div>
        </div>
    </div>

    <!-- DADOS DA CEGONHA -->
    <div class="cegonha-info">
        <div class="info-item">
            <label>Placa da Cegonha</label>
            <span>${placaCegonha}</span>
        </div>
        <div class="info-item">
            <label>Tipo do Veículo</label>
            <span>${veiculo?.tipo || '—'}</span>
        </div>
        <div class="info-item">
            <label>Motorista</label>
            <span>${motorista}</span>
        </div>
        <div class="info-item">
            <label>Rota Principal</label>
            <span style="font-size:0.78rem">${rotaPrincipal}</span>
        </div>
        ${pedidos[0]?.dataPrevColeta ? `
        <div class="info-item">
            <label>Prev. Coleta</label>
            <span>${new Date(pedidos[0].dataPrevColeta).toLocaleString('pt-BR')}</span>
        </div>` : ''}
        ${pedidos[0]?.dataPrevEntrega ? `
        <div class="info-item">
            <label>Prev. Entrega</label>
            <span>${new Date(pedidos[0].dataPrevEntrega).toLocaleString('pt-BR')}</span>
        </div>` : ''}
    </div>

    <!-- RESUMO NUMÉRICO -->
    <div class="resumo-box">
        <div class="resumo-item">
            <div class="resumo-num">${pedidos.length}</div>
            <div class="resumo-label">Veículos</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-num">${new Set(pedidos.map(p => `${p.cidadeOrigem}/${p.ufOrigem}`)).size}</div>
            <div class="resumo-label">Origens</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-num">${new Set(pedidos.map(p => `${p.cidadeDestino}/${p.ufDestino}`)).size}</div>
            <div class="resumo-label">Destinos</div>
        </div>
        <div class="resumo-item">
            <div class="resumo-num" style="color:#16a34a">R$ ${totalFrete.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
            <div class="resumo-label">Valor Total</div>
        </div>
    </div>

    <!-- AVISO FISCAL -->
    <div class="aviso-fiscal">
        ⚠️ <strong>Para emissão de nota fiscal:</strong> Utilize os dados de CPF/CNPJ, valor e rota de cada veículo abaixo conforme necessário.
    </div>

    <!-- TABELA DE VEÍCULOS -->
    <h2>Veículos Transportados</h2>
    <table>
        <thead>
            <tr>
                <th class="center" style="width:30px">#</th>
                <th style="width:200px">Cliente / Documento</th>
                <th style="width:130px">Veículo / Placa</th>
                <th>Rota</th>
                <th>End. Coleta</th>
                <th>End. Entrega</th>
                <th class="right" style="width:90px">Valor Frete</th>
            </tr>
        </thead>
        <tbody>
            ${linhasVeiculos}
            <tr class="total-linha">
                <td colspan="6" style="text-align:right;letter-spacing:0.05em">TOTAL GERAL</td>
                <td class="right">R$ ${totalFrete.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            </tr>
        </tbody>
    </table>

    <!-- ASSINATURAS -->
    <div class="assinaturas">
        <div class="assinatura">
            <br><br>
            Motorista: ${motorista}
        </div>
        <div class="assinatura">
            <br><br>
            Responsável Logística
        </div>
        <div class="assinatura">
            <br><br>
            Fiscal / CTE
        </div>
    </div>

    <!-- RODAPÉ -->
    <div class="rodape">
        <span>MoveMaster — Sistema de Controle Logístico</span>
        <span>${numDoc} · Gerado em ${dataGeracao}</span>
    </div>

    <script>
        // Auto-imprimir ao abrir
        window.onload = function() { window.print(); }
    </script>
</body>
</html>`;

    // Registrar na tabela ocorrencias para o fiscal acessar.
    // Só registra quando é uma GERAÇÃO (não quando é só visualização),
    // e nunca cria duplicata: se já existe espelho aberto desta cegonha,
    // atualiza o existente.
    if (registrar) {
        try {
            await registrarEspelhoFiscal({
                placaCegonha,
                pedidos,
                totalFrete,
                usuarioNome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
                usuarioPerfil: 'logistica'
            });
        } catch(e) {
            console.warn('Erro ao registrar espelho:', e);
        }
    }

    // Abrir PDF em nova aba
    const janela = window.open('', '_blank');
    janela.document.write(html);
    janela.document.close();
}
// ============================================================
// LOTE 2 — MANUTENÇÃO: CHECKLIST DE SEGURANÇA + TAG DE INTEGRIDADE
// (itens 13.2 e 13.7)
// ============================================================
const CHECKLIST_BLOCOS = [
  { grupo: 'Mecânica e Rodagem',      itens: ['Pneus','Freios','Sistema de Direção','Iluminação/Sinalização'] },
  { grupo: 'Segurança e Cegonha',     itens: ['Cintas de Amarração','Catracas','Decks/Rampas Hidráulicas','Pinos de Trava'] },
  { grupo: 'Acessórios Obrigatórios', itens: ['Tacógrafo','Extintor','Triângulo','Cinto de Segurança','Macaco/Chave de Roda'] }
];

function _hojeISO(){ return new Date().toISOString().slice(0,10); }
function _addUmMes(iso){ const d = new Date(iso+'T12:00'); d.setMonth(d.getMonth()+1); return d.toISOString().slice(0,10); }
function _fmtDataChk(iso){ if(!iso) return '—'; return new Date(iso+'T12:00').toLocaleDateString('pt-BR'); }

// Regra da tag (item 13): >=1 crítico OU >=6 atenção => vermelho; 1..5 atenção => amarelo; senão verde
function calcularTagChecklist(qtdAtencao, qtdCritico){
  if (qtdCritico >= 1 || qtdAtencao >= 6) return 'vermelho';
  if (qtdAtencao >= 1) return 'amarelo';
  return 'verde';
}

// Status efetivo considerando a validade mensal: vencido => no mínimo amarelo
function statusIntegridadeEfetivo(v){
  const base = v.status_integridade || 'verde';
  const vencido = v.checklist_valido_ate ? (v.checklist_valido_ate < _hojeISO()) : true; // sem checklist = vencido
  if (base === 'vermelho') return { cor:'vermelho', motivo:'Pendência crítica' };
  if (vencido) return { cor:'amarelo', motivo: v.checklist_valido_ate ? 'Checklist vencido' : 'Sem checklist' };
  return { cor: base, motivo: base === 'amarelo' ? 'Pontos em atenção' : 'Checklist em dia' };
}

const _TAG_META = {
  verde:   { emoji:'🟢', label:'Aprovado' },
  amarelo: { emoji:'🟡', label:'Atenção' },
  vermelho:{ emoji:'🔴', label:'Impedido' }
};

function tagIntegridadeHTML(v){
  const ef = statusIntegridadeEfetivo(v);
  const m = _TAG_META[ef.cor] || _TAG_META.verde;
  const val = v.checklist_valido_ate ? ' (válido até '+_fmtDataChk(v.checklist_valido_ate)+')' : '';
  return `<span class="tag-integridade tag-${ef.cor}" title="${m.label} — ${ef.motivo}${val}">${m.emoji} ${m.label}</span>`;
}

// Só frota própria tem checklist (itens 10/13)
function _veiculosFrotaPropria(){
  return (veiculosGlobais||[]).filter(v => v.propriedade !== 'terceiro');
}

function carregarManutencao(){
  const sel = document.getElementById('checklistVeiculo');
  if (!sel) return;
  const atual = sel.value;
  const lista = _veiculosFrotaPropria();
  sel.innerHTML = '<option value="">Selecione o veículo...</option>' +
    lista.map(v => `<option value="${v.id}">${v.placa} — ${v.modelo || v.tipo || ''}</option>`).join('');
  if (atual) sel.value = atual;
  renderChecklistForm();
  renderEPIForm();
  _preencherMotoristasEPI();
  if (typeof _preencherVeiculosAgendamento === 'function') _preencherVeiculosAgendamento();
  if (typeof listarAgendamentos === 'function') listarAgendamentos();
  if (typeof _preencherVeiculosEmergencia === 'function') _preencherVeiculosEmergencia();
  if (typeof renderizarParadasEmergencia === 'function') renderizarParadasEmergencia();
  aoTrocarVeiculoChecklist();
}

function renderChecklistForm(){
  const cont = document.getElementById('checklistForm');
  if (!cont) return;
  cont.innerHTML = CHECKLIST_BLOCOS.map((bloco, bi) => `
    <div class="checklist-bloco">
      <h4>${bloco.grupo}</h4>
      ${bloco.itens.map((item, ii) => {
        const name = 'chk_'+bi+'_'+ii;
        return `
        <div class="checklist-linha">
          <span class="checklist-item-nome">${item}</span>
          <div class="checklist-opcoes">
            <label class="opt opt-ok"><input type="radio" name="${name}" value="OK" checked> OK</label>
            <label class="opt opt-at"><input type="radio" name="${name}" value="Atencao"> Atenção</label>
            <label class="opt opt-cr"><input type="radio" name="${name}" value="Critico"> Crítico</label>
          </div>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

function _lerChecklistSelecionado(){
  const itens = [];
  let qtdAtencao = 0, qtdCritico = 0;
  CHECKLIST_BLOCOS.forEach((bloco, bi) => {
    bloco.itens.forEach((item, ii) => {
      const val = document.querySelector('input[name="chk_'+bi+'_'+ii+'"]:checked')?.value || 'OK';
      if (val === 'Atencao') qtdAtencao++;
      if (val === 'Critico') qtdCritico++;
      itens.push({ grupo: bloco.grupo, item, status: val });
    });
  });
  return { itens, qtdAtencao, qtdCritico };
}

function aoTrocarVeiculoChecklist(){
  const sel = document.getElementById('checklistVeiculo');
  const tagEl = document.getElementById('checklistTagAtual');
  const id = sel?.value;
  if (!id){ if(tagEl) tagEl.innerHTML=''; carregarHistoricoChecklist(null); return; }
  const v = (veiculosGlobais||[]).find(x => String(x.id) === String(id));
  if (tagEl && v) tagEl.innerHTML = 'Status atual: ' + tagIntegridadeHTML(v);
  if (typeof _preencherMotoristasEPI === 'function') _preencherMotoristasEPI();
  carregarHistoricoChecklist(id);
}

async function salvarChecklist(){
  const msgEl = document.getElementById('mensagemChecklist');
  const sel = document.getElementById('checklistVeiculo');
  const id = sel?.value;
  if (!id){ msgEl.textContent='Selecione um veículo.'; msgEl.className='message show error'; return; }
  const v = (veiculosGlobais||[]).find(x => String(x.id) === String(id));
  if (!v){ msgEl.textContent='Veículo não encontrado.'; msgEl.className='message show error'; return; }

  const { itens, qtdAtencao, qtdCritico } = _lerChecklistSelecionado();
  const cor = calcularTagChecklist(qtdAtencao, qtdCritico);
  const hoje = _hojeISO();
  const validoAte = _addUmMes(hoje);
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';

  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const ins = await supabase.from('checklists_veiculo').insert({
      veiculo_id: parseInt(id), placa: v.placa, data_checklist: hoje, valido_ate: validoAte,
      status_geral: cor, qtd_atencao: qtdAtencao, qtd_critico: qtdCritico,
      itens: itens, realizado_por: usuario
    });
    if (ins.error) throw ins.error;

    const upd = await supabase.from('veiculos').update({
      status_integridade: cor, checklist_ultimo: hoje, checklist_valido_ate: validoAte
    }).eq('id', parseInt(id));
    if (upd.error) throw upd.error;

    v.status_integridade = cor; v.checklist_ultimo = hoje; v.checklist_valido_ate = validoAte;

    const m = _TAG_META[cor];
    msgEl.textContent = 'Checklist salvo. Status do veículo: '+m.emoji+' '+m.label+'. Válido até '+_fmtDataChk(validoAte)+'.';
    msgEl.className = 'message show success';
    aoTrocarVeiculoChecklist();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    msgEl.textContent = 'Erro ao salvar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

async function carregarHistoricoChecklist(veiculoId){
  const cont = document.getElementById('checklistHistorico');
  if (!cont) return;
  if (!veiculoId){ cont.innerHTML = '<p class="text-muted">Selecione um veículo.</p>'; return; }
  cont.innerHTML = '<p class="text-muted">Carregando...</p>';
  try {
    const { data, error } = await supabase.from('checklists_veiculo')
      .select('*').eq('veiculo_id', parseInt(veiculoId))
      .order('data_checklist', { ascending: false }).limit(12);
    if (error) throw error;
    if (!data || data.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum checklist registrado ainda.</p>'; return; }
    cont.innerHTML = data.map(c => {
      const m = _TAG_META[c.status_geral] || _TAG_META.verde;
      return '<div class="checklist-hist-linha">'
        + '<span class="tag-integridade tag-'+c.status_geral+'">'+m.emoji+' '+m.label+'</span>'
        + '<span>'+_fmtDataChk(c.data_checklist)+'</span>'
        + '<span class="text-muted">'+(c.qtd_atencao||0)+' atenção · '+(c.qtd_critico||0)+' crítico</span>'
        + '<span class="text-muted">por '+(c.realizado_por||'—')+'</span>'
        + '<span class="text-muted">válido até '+_fmtDataChk(c.valido_ate)+'</span>'
        + '</div>';
    }).join('');
  } catch(e){
    cont.innerHTML = '<p class="message show error">Erro ao carregar histórico: '+(e.message||e)+'</p>';
  }
}

// ============================================================
// LOTE 3 — EPIs: avaliação (13.3), alerta p/ Compras (13.4) e
// autosserviço do motorista (13.5)
// ============================================================
const EPI_ITENS = ['Uniforme','Colete Refletivo','Talabarte','Capacete','Protetor Solar','Botina de Segurança'];
const _EPI_OPCOES = [
  { val:'OK',         label:'OK',                 cls:'opt-ok' },
  { val:'Reposicao',  label:'Necessita Reposição',cls:'opt-at' },
  { val:'Inadequado', label:'Inadequado',         cls:'opt-cr' }
];

// ---- 13.3 Avaliação de EPIs (perfil Manutenção) ----
function renderEPIForm(){
  const cont = document.getElementById('epiForm');
  if (!cont) return;
  cont.innerHTML = EPI_ITENS.map((item, i) => `
    <div class="checklist-linha">
      <span class="checklist-item-nome">${item}</span>
      <div class="epi-linha-dir">
        <input type="text" class="epi-tamanho" id="epi_tam_${i}" placeholder="Tamanho / especificação">
        <div class="checklist-opcoes">
          ${_EPI_OPCOES.map(o => `
            <label class="opt ${o.cls}"><input type="radio" name="epi_${i}" value="${o.val}" ${o.val==='OK'?'checked':''}> ${o.label}</label>
          `).join('')}
        </div>
      </div>
    </div>`).join('');
}

// popula o select de motorista (default: motorista padrão do veículo do checklist)
function _preencherMotoristasEPI(){
  const sel = document.getElementById('epiMotorista');
  if (!sel) return;
  const lista = motoristasGlobais || [];
  sel.innerHTML = '<option value="">Selecione o motorista...</option>' +
    lista.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
  // tenta casar com o motorista padrão do veículo selecionado no checklist
  const vSel = document.getElementById('checklistVeiculo')?.value;
  const v = (veiculosGlobais||[]).find(x => String(x.id) === String(vSel));
  if (v?.motorista_padrao){
    const m = lista.find(x => (x.nome||'').trim() === (v.motorista_padrao||'').trim());
    if (m) sel.value = m.id;
  }
}

async function salvarAvaliacaoEPI(){
  const msgEl = document.getElementById('mensagemEPI');
  const sel = document.getElementById('epiMotorista');
  const motoristaId = sel?.value;
  if (!motoristaId){ msgEl.textContent='Selecione o motorista.'; msgEl.className='message show error'; return; }
  const motorista = (motoristasGlobais||[]).find(m => String(m.id) === String(motoristaId));
  const urgencia = document.getElementById('epiUrgencia')?.value || 'normal';
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';

  // Coleta itens que precisam de ação: Necessita Reposição OU Inadequado
  const solicitacoes = [];
  EPI_ITENS.forEach((item, i) => {
    const val = document.querySelector(`input[name="epi_${i}"]:checked`)?.value || 'OK';
    if (val === 'OK') return;
    const tamanho = document.getElementById(`epi_tam_${i}`)?.value.trim() || null;
    solicitacoes.push({
      motorista_id: parseInt(motoristaId),
      motorista_nome: motorista?.nome || null,
      item: item + (val === 'Inadequado' ? ' (inadequado)' : ''),
      tamanho,
      urgencia: val === 'Inadequado' ? 'alta' : urgencia, // inadequado = segurança => alta
      origem: 'checklist',
      status: 'pendente',
      solicitado_por: usuario
    });
  });

  if (solicitacoes.length === 0){
    msgEl.textContent='Nenhum item marcado para reposição/inadequado — nada a solicitar.';
    msgEl.className='message show';
    return;
  }

  msgEl.textContent='Enviando...'; msgEl.className='message show';
  try {
    const { error } = await supabase.from('solicitacoes_epi').insert(solicitacoes);
    if (error) throw error;
    msgEl.textContent = `${solicitacoes.length} solicitação(ões) enviada(s) ao Financeiro/Compras.`;
    msgEl.className = 'message show success';
    renderEPIForm();
  } catch(e){
    msgEl.textContent = 'Erro ao enviar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

// ---- 13.4 Fila do Financeiro / Compras ----
async function renderizarSolicitacoesEPI(){
  const cont = document.getElementById('listaSolicitacoesEPI');
  if (!cont) return;
  cont.innerHTML = '<p class="text-muted">Carregando...</p>';
  try {
    const { data, error } = await supabase.from('solicitacoes_epi')
      .select('*').eq('status','pendente')
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhuma solicitação pendente. 👍</p>'; return; }
    cont.innerHTML = `
      <table class="tabela-epi">
        <thead><tr><th>Motorista</th><th>Item</th><th>Tam./Espec.</th><th>Urgência</th><th>Origem</th><th>Ações</th></tr></thead>
        <tbody>
          ${data.map(s => `
            <tr>
              <td>${s.motorista_nome || '—'}</td>
              <td>${s.item}</td>
              <td>${s.tamanho || '—'}</td>
              <td>${s.urgencia === 'alta' ? '<span class="epi-urg-alta">🔴 Alta</span>' : 'Normal'}</td>
              <td>${s.origem === 'autosservico' ? '📱 Motorista' : '🔧 Checklist'}</td>
              <td class="epi-acoes">
                <button class="btn btn-sm btn-primary" onclick="atenderSolicitacaoEPI(${s.id})">✓ Atender</button>
                <button class="btn btn-sm btn-secondary" onclick="recusarSolicitacaoEPI(${s.id})">✕ Recusar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e){
    cont.innerHTML = '<p class="message show error">Erro ao carregar: '+(e.message||e)+'</p>';
  }
}

async function _atualizarStatusEPI(id, status){
  try {
    const patch = { status };
    if (status === 'atendida') patch.atendida_em = new Date().toISOString();
    const { error } = await supabase.from('solicitacoes_epi').update(patch).eq('id', id);
    if (error) throw error;
    renderizarSolicitacoesEPI();
  } catch(e){
    alert('Erro ao atualizar solicitação: ' + (e.message || e));
  }
}
function atenderSolicitacaoEPI(id){ if (confirm('Marcar como atendida (compra/reembolso/liberação feita)?')) _atualizarStatusEPI(id, 'atendida'); }
function recusarSolicitacaoEPI(id){ if (confirm('Recusar esta solicitação?')) _atualizarStatusEPI(id, 'recusada'); }

// ---- 13.5 Autosserviço do motorista ----
function abrirSolicitacaoEPI(){
  const card = document.getElementById('cardSolicitacaoEPI');
  if (!card) return;
  card.style.display = '';
  const selItem = document.getElementById('epiMotItem');
  if (selItem && !selItem.options.length){
    selItem.innerHTML = EPI_ITENS.map(i => `<option value="${i}">${i}</option>`).join('');
  }
  carregarMinhasEPI();
  card.scrollIntoView({ behavior:'smooth', block:'start' });
}

function _motoristaLogadoInfo(){
  if (typeof nomesDoMotoristaLogado === 'function'){
    const { motoristaVinculado } = nomesDoMotoristaLogado();
    if (motoristaVinculado) return { id: motoristaVinculado.id, nome: motoristaVinculado.nome };
  }
  const nome = document.getElementById('usuarioLogado')?.textContent || 'Motorista';
  return { id: null, nome };
}

async function enviarSolicitacaoEPIMotorista(){
  const msgEl = document.getElementById('mensagemEPIMotorista');
  const item = document.getElementById('epiMotItem')?.value;
  const tamanho = document.getElementById('epiMotTamanho')?.value.trim() || null;
  const urgencia = document.getElementById('epiMotUrgencia')?.value || 'normal';
  if (!item){ msgEl.textContent='Selecione o item.'; msgEl.className='message show error'; return; }
  const mot = _motoristaLogadoInfo();

  msgEl.textContent='Enviando...'; msgEl.className='message show';
  try {
    const { error } = await supabase.from('solicitacoes_epi').insert({
      motorista_id: mot.id ? parseInt(mot.id) : null,
      motorista_nome: mot.nome,
      item, tamanho, urgencia,
      origem: 'autosservico', status: 'pendente',
      solicitado_por: mot.nome
    });
    if (error) throw error;
    msgEl.textContent = 'Solicitação enviada ao Financeiro/Compras. 👍';
    msgEl.className = 'message show success';
    document.getElementById('epiMotTamanho').value = '';
    carregarMinhasEPI();
  } catch(e){
    msgEl.textContent = 'Erro ao enviar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

async function carregarMinhasEPI(){
  const cont = document.getElementById('listaMinhasEPI');
  if (!cont) return;
  const mot = _motoristaLogadoInfo();
  cont.innerHTML = '<p class="text-muted">Carregando...</p>';
  try {
    let q = supabase.from('solicitacoes_epi').select('*').order('created_at', { ascending:false }).limit(20);
    q = mot.id ? q.eq('motorista_id', parseInt(mot.id)) : q.eq('motorista_nome', mot.nome);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0){ cont.innerHTML = '<p class="text-muted">Você ainda não fez solicitações.</p>'; return; }
    const rot = { pendente:'⏳ Pendente', atendida:'✅ Atendida', recusada:'✕ Recusada' };
    cont.innerHTML = data.map(s => `
      <div class="checklist-hist-linha">
        <span>${s.item}</span>
        <span class="text-muted">${s.tamanho || ''}</span>
        <span class="text-muted">${rot[s.status] || s.status}</span>
        <span class="text-muted">${new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
      </div>`).join('');
  } catch(e){
    cont.innerHTML = '<p class="message show error">Erro: '+(e.message||e)+'</p>';
  }
}

// ============================================================
// LOTE 4 — AGENDAMENTO DE MANUTENÇÃO + BLOQUEIO NA LOGÍSTICA
// (item 13.6) + regra do 🔴 impedir alocação (13.7) + gancho item 15
// ============================================================

// Decisão CENTRAL de bloqueio de alocação de um veículo.
// Fontes: integridade (checklist 🔴), manutenção via folgas (legado),
// agendamento de manutenção, e (Lote futuro) parada de emergência (item 15).
function statusManutencaoVeiculo(v){
  // 1) Impedido por integridade do checklist (🔴)
  if (typeof statusIntegridadeEfetivo === 'function'){
    const ef = statusIntegridadeEfetivo(v);
    if (ef.cor === 'vermelho' && v.propriedade !== 'terceiro')
      return { bloqueado:true, cor:'vermelho', selo:'🔴 Impedido — '+ef.motivo, motivo:'Impedido — '+ef.motivo };
  }
  // 2) Manutenção via folgas (mecanismo legado já existente)
  const mf = (typeof manutencaoAtivaDoVeiculo === 'function') ? manutencaoAtivaDoVeiculo(v.placa) : null;
  if (mf)
    return { bloqueado:true, cor:'vermelho', selo:'🔧 Em manutenção'+(mf.descricao?' — '+mf.descricao:''), motivo:'Em manutenção' };
  // 3) Agendamento de manutenção
  const ag = (agendamentosManutencaoGlobais||[]).find(a => a.placa === v.placa && a.status !== 'concluido');
  if (ag){
    const dt = new Date(ag.data_hora), agora = new Date();
    const fmt = dt.toLocaleDateString('pt-BR');
    if (dt <= agora)
      return { bloqueado:true, cor:'vermelho', selo:'🔧 Bloqueado — manutenção agendada ('+fmt+')', motivo:'Manutenção agendada / na base', agendamento:ag };
    return { bloqueado:false, cor:'amarelo', selo:'🟡 Manutenção prevista '+fmt, motivo:'Manutenção prevista', agendamento:ag };
  }
  // 4) [item 15] Parada de emergência: ALERTA, nunca bloqueia (decisão fica fora do sistema)
  const emg = (paradasEmergenciaGlobais||[]).find(e => e.placa === v.placa && e.status === 'ativa');
  if (emg)
    return { bloqueado:false, cor:'vermelho', selo:'🚨 Parada de emergência'+(emg.motivo?' — '+emg.motivo:''), motivo:'Parada de emergência (alerta)', emergencia:emg };
  return { bloqueado:false, cor:null, selo:null, motivo:'' };
}

// ---- Cadastro de agendamento (perfil Manutenção) ----
function _preencherVeiculosAgendamento(){
  const sel = document.getElementById('agVeiculo');
  if (!sel) return;
  const atual = sel.value;
  const lista = (veiculosGlobais||[]).filter(v => v.propriedade !== 'terceiro');
  sel.innerHTML = '<option value="">Selecione o veículo...</option>' +
    lista.map(v => `<option value="${v.placa}">${v.placa} — ${v.modelo || v.tipo || ''}</option>`).join('');
  if (atual) sel.value = atual;
}

async function salvarAgendamentoManutencao(){
  const msgEl = document.getElementById('mensagemAgendamento');
  const placa = document.getElementById('agVeiculo')?.value;
  const dataHora = document.getElementById('agDataHora')?.value;
  const prazo = document.getElementById('agPrazo')?.value.trim() || null;
  const obs = document.getElementById('agObs')?.value.trim() || null;
  if (!placa){ msgEl.textContent='Selecione o veículo.'; msgEl.className='message show error'; return; }
  if (!dataHora){ msgEl.textContent='Informe a data/hora da manutenção.'; msgEl.className='message show error'; return; }

  const v = (veiculosGlobais||[]).find(x => x.placa === placa);
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';
  msgEl.textContent='Agendando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('agendamentos_manutencao').insert({
      veiculo_id: v?.id || null, placa, data_hora: new Date(dataHora).toISOString(),
      prazo_estimado: prazo, observacao: obs, status: 'agendado', criado_por: usuario
    }).select();
    if (error) throw error;
    if (data && data[0]) agendamentosManutencaoGlobais.push(data[0]);
    msgEl.textContent = 'Manutenção agendada. A Logística verá o bloqueio/aviso na alocação.';
    msgEl.className = 'message show success';
    document.getElementById('agDataHora').value = '';
    document.getElementById('agPrazo').value = '';
    document.getElementById('agObs').value = '';
    listarAgendamentos();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    msgEl.textContent = 'Erro ao agendar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

function listarAgendamentos(){
  const cont = document.getElementById('listaAgendamentos');
  if (!cont) return;
  const ativos = (agendamentosManutencaoGlobais||[]).filter(a => a.status !== 'concluido')
    .sort((a,b) => new Date(a.data_hora) - new Date(b.data_hora));
  if (ativos.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum agendamento ativo.</p>'; return; }
  const agora = new Date();
  cont.innerHTML = ativos.map(a => {
    const dt = new Date(a.data_hora);
    const venceu = dt <= agora;
    const tag = venceu ? '<span class="tag-integridade tag-vermelho">🔧 Na base/bloqueado</span>'
                       : '<span class="tag-integridade tag-amarelo">🟡 Prevista</span>';
    return `<div class="checklist-hist-linha">
      ${tag}
      <span><strong>${a.placa}</strong></span>
      <span>${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
      <span class="text-muted">${a.prazo_estimado || ''}</span>
      <span class="text-muted">${a.observacao || ''}</span>
      <button class="btn btn-sm btn-secondary" onclick="concluirAgendamento(${a.id})">✓ Concluir</button>
    </div>`;
  }).join('');
}

async function concluirAgendamento(id){
  if (!confirm('Concluir esta manutenção? O veículo volta a ficar disponível para a Logística.')) return;
  try {
    const { error } = await supabase.from('agendamentos_manutencao')
      .update({ status:'concluido' }).eq('id', id);
    if (error) throw error;
    const a = (agendamentosManutencaoGlobais||[]).find(x => x.id === id);
    if (a) a.status = 'concluido';
    listarAgendamentos();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    alert('Erro ao concluir: ' + (e.message || e));
  }
}

// ============================================================
// LOTE 5 — PARADA DE EMERGÊNCIA (item 15)
// Só registro/alerta. Não cancela, não aloca, não desaloca.
// Criação: exclusiva do Gestor de Manutenção (perfil manutencao/admin).
// Conclusão: Manutenção OU Logística.
// ============================================================
function _ehGestorManutencao(){
  const p = (typeof perfilAtual !== 'undefined') ? perfilAtual : null;
  return p === 'manutencao' || p === 'admin';
}
function _podeConcluirEmergencia(){
  const p = (typeof perfilAtual !== 'undefined') ? perfilAtual : null;
  return ['manutencao','logistica','admin'].includes(p);
}

function _preencherVeiculosEmergencia(){
  const sel = document.getElementById('emgVeiculo');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Selecione o veículo...</option>' +
    (veiculosGlobais||[]).map(v => `<option value="${v.placa}">${v.placa} — ${v.modelo || v.tipo || ''}</option>`).join('');
  if (atual) sel.value = atual;
}

async function salvarParadaEmergencia(){
  const msgEl = document.getElementById('mensagemEmergencia');
  if (!_ehGestorManutencao()){
    msgEl.textContent = 'Apenas o Gestor de Manutenção pode registrar uma parada de emergência.';
    msgEl.className = 'message show error'; return;
  }
  const placa = document.getElementById('emgVeiculo')?.value;
  const motivo = document.getElementById('emgMotivo')?.value.trim();
  const previsaoRaw = document.getElementById('emgPrevisao')?.value;
  if (!placa){ msgEl.textContent='Selecione o veículo.'; msgEl.className='message show error'; return; }
  if (!motivo){ msgEl.textContent='Descreva o motivo/defeito.'; msgEl.className='message show error'; return; }

  const v = (veiculosGlobais||[]).find(x => x.placa === placa);
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Manutenção';
  msgEl.textContent='Registrando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('paradas_emergencia').insert({
      veiculo_id: v?.id || null, placa, motivo,
      previsao_retorno: previsaoRaw ? new Date(previsaoRaw).toISOString() : null,
      status: 'ativa', criado_por: usuario
    }).select();
    if (error) throw error;
    if (data && data[0]) paradasEmergenciaGlobais.unshift(data[0]);
    msgEl.textContent = 'Emergência registrada. A Logística já vê o alerta (nenhuma alocação foi alterada).';
    msgEl.className = 'message show success';
    document.getElementById('emgMotivo').value = '';
    document.getElementById('emgPrevisao').value = '';
    renderizarParadasEmergencia();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(e){
    msgEl.textContent = 'Erro ao registrar: ' + (e.message || e);
    msgEl.className = 'message show error';
  }
}

function _linhaEmergenciaHTML(e, comConcluir){
  const dt = e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : '';
  const prev = e.previsao_retorno ? ' · retorno prev.: ' + new Date(e.previsao_retorno).toLocaleString('pt-BR') : '';
  const btn = comConcluir && _podeConcluirEmergencia()
    ? `<button class="btn btn-sm btn-secondary" onclick="concluirEmergencia(${e.id})">✓ Concluir</button>` : '';
  return `<div class="emergencia-linha">
    <span class="emergencia-badge">🚨 ${e.placa}</span>
    <span>${e.motivo || ''}</span>
    <span class="text-muted">${dt}${prev}</span>
    ${btn}
  </div>`;
}

function renderizarParadasEmergencia(){
  const ativas = (paradasEmergenciaGlobais||[]).filter(e => e.status === 'ativa');

  // Painel na aba Manutenção
  const contManut = document.getElementById('listaEmergenciasManut');
  if (contManut){
    contManut.innerHTML = ativas.length === 0
      ? '<p class="text-muted">Nenhuma emergência ativa.</p>'
      : ativas.map(e => _linhaEmergenciaHTML(e, true)).join('');
  }

  // Banner na aba Logística (só aparece se houver emergência)
  const wrapLog = document.getElementById('emergenciasLogWrap');
  if (wrapLog){
    wrapLog.innerHTML = ativas.length === 0 ? '' :
      `<div class="emergencia-banner">
        <div class="emergencia-banner-titulo">🚨 Paradas de emergência ativas (${ativas.length}) — decida a carga com a Manutenção</div>
        ${ativas.map(e => _linhaEmergenciaHTML(e, true)).join('')}
      </div>`;
  }
}

async function concluirEmergencia(id){
  if (!_podeConcluirEmergencia()){ alert('Sem permissão para concluir.'); return; }
  if (!confirm('Marcar esta emergência como concluída?')) return;
  const perfil = (typeof perfilAtual !== 'undefined') ? perfilAtual : null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Sistema';
  try {
    const { error } = await supabase.from('paradas_emergencia').update({
      status:'concluida', concluida_por: usuario, concluida_perfil: perfil,
      concluida_em: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
    const e = (paradasEmergenciaGlobais||[]).find(x => x.id === id);
    if (e) e.status = 'concluida';
    renderizarParadasEmergencia();
    if (typeof renderizarVeiculosDrop === 'function') renderizarVeiculosDrop();
  } catch(err){
    alert('Erro ao concluir: ' + (err.message || err));
  }
}

// ============================================================
// LOTE 6 — INDICADORES DE MANUTENÇÃO NO DASHBOARD (item 14)
// Veículos % e EPIs %, só frota própria. Alerta 🔴 por pendência crítica.
// ============================================================
function _conformidadeSeguranca(){
  // ----- Veículos (frota própria): checklist em dia = 🟢 efetivo -----
  const frota = (veiculosGlobais||[]).filter(v => v.propriedade !== 'terceiro');
  const totalVeic = frota.length;
  let verdes = 0, criticos = 0;
  frota.forEach(v => {
    const cor = (typeof statusIntegridadeEfetivo === 'function') ? statusIntegridadeEfetivo(v).cor : 'verde';
    if (cor === 'verde') verdes++;
    // pendência CRÍTICA = checklist vermelho (crítico/6+ atenção), não apenas vencido
    if (v.status_integridade === 'vermelho') criticos++;
  });
  const veiculosPctNum = totalVeic > 0 ? Math.round((verdes / totalVeic) * 100) : null;

  // ----- EPIs (motoristas): em dia = sem solicitação pendente -----
  const totalMot = (motoristasGlobais||[]).length;
  const pendSet = new Set();
  (episPendentesGlobais||[]).forEach(e => pendSet.add(e.motorista_id != null ? 'id:'+e.motorista_id : 'nome:'+(e.motorista_nome||'')));
  const motComPend = pendSet.size;
  const motEmDia = Math.max(0, totalMot - motComPend);
  const episPctNum = totalMot > 0 ? Math.round((motEmDia / totalMot) * 100) : null;

  const _cor = (pct) => pct === null ? '#9ca3af' : pct >= 90 ? '#4ade80' : pct >= 70 ? '#fbbf24' : '#ef4444';

  return {
    totalVeic, totalMot, criticos,
    veiculosPct: veiculosPctNum === null ? '—' : veiculosPctNum + '%',
    episPct:     episPctNum === null ? '—' : episPctNum + '%',
    corVeic: criticos > 0 ? '#ef4444' : _cor(veiculosPctNum),
    corEpi:  _cor(episPctNum)
  };
}

// ============================================================
// LOTE 7 — ITEM 6: nomenclatura por capacidade + exceção de teto
// 1 a 9 => "Múltiplos Veículos"; 10..capacidade => "Carga Fechada".
// Teto padrão 11; acima disso exige exceção no cadastro do veículo.
// ============================================================
function nomenclaturaCarga(qtd, capacidade){
  const cap = Number(capacidade) || null;
  if ((cap && qtd >= cap) || qtd >= 10) return 'Carga Fechada';
  return 'Múltiplos Veículos';
}

// Ajusta o teto do input de capacidade conforme a exceção (cadastro novo)
function ajustarTetoCapacidade(){
  const chk = document.getElementById('capacidadeExcecao');
  const cap = document.getElementById('capacidadeCegonha');
  if (!cap) return;
  cap.max = (chk && chk.checked) ? 12 : 11;
  if (!(chk && chk.checked) && parseInt(cap.value,10) > 11) cap.value = 11;
}

// ============================================================
// LOTE 8 — ITEM 1: RESERVA COM TIMER GLOBAL + TIPO DE ENTREGA
// ============================================================
function toggleModoReserva(){
  const on = document.getElementById('pedidoReserva')?.checked;
  const wrap = document.getElementById('reservaVagasWrap');
  if (wrap) wrap.style.display = on ? '' : 'none';
  // Em modo reserva, placa/modelo deixam de ser obrigatórios
  ['placa','modelo'].forEach(id => {
    const el = document.getElementById(id);
    if (el){ if (on) el.removeAttribute('required'); else el.setAttribute('required',''); }
  });
}

async function salvarReservaComercial(){
  const cliente = document.getElementById('cliente').value;
  const clienteId = document.getElementById('clienteId')?.value || null;
  const dataSolicitacao = document.getElementById('dataSolicitacao').value;
  const cidadeOrigem = document.getElementById('cidadeOrigem').value;
  const ufOrigem = document.getElementById('ufOrigem').value;
  const cidadeDestino = document.getElementById('cidadeDestino').value;
  const ufDestino = document.getElementById('ufDestino').value;
  const responsavel = _getResponsavelComercial();
  const vagas = parseInt(document.getElementById('reservaVagas')?.value,10) || 1;
  const tipoEntrega = document.getElementById('tipoEntregaPedido')?.value || 'patio';

  if (!cliente || !dataSolicitacao || !cidadeOrigem || !ufOrigem || !cidadeDestino || !ufDestino || !responsavel){
    exibirMensagem('mensagemComercial', 'Reserva precisa de: cliente, data, origem, destino e responsável.', 'error');
    return;
  }

  const expira = new Date(Date.now() + paramReservaTimerMin * 60000).toISOString();
  const grupoId = (typeof gerarGrupoId === 'function' && vagas > 1) ? gerarGrupoId() : null;
  const base = {
    cliente, cliente_id: clienteId ? parseInt(clienteId) : null,
    data_solicitacao: dataSolicitacao,
    modelo: 'A definir', placa: null,
    cidade_origem: cidadeOrigem, uf_origem: ufOrigem,
    cidade_destino: cidadeDestino, uf_destino: ufDestino,
    responsavel_comercial: responsavel,
    tipo_entrega: tipoEntrega,
    origem_lancamento: (typeof perfilAtual !== 'undefined' ? perfilAtual : null),
    criado_por_nome: (document.getElementById('usuarioLogado')?.textContent || null),
    status: 'Pendente',
    is_reserva: true, reserva_status: 'ativa', reserva_expira_em: expira
  };
  const linhas = Array.from({length: vagas}, () => grupoId ? { ...base, grupo_id: grupoId } : { ...base });

  try {
    const { error } = await supabase.from('pedidos').insert(linhas);
    if (error) throw error;
    if (typeof notificar === 'function') notificar({
      perfil:'comercial', tipo:'acao',
      titulo:`🕒 Nova reserva: ${vagas} vaga(s)`,
      mensagem:`${cliente} · ${cidadeOrigem}/${ufOrigem} → ${cidadeDestino}/${ufDestino} · expira em ${paramReservaTimerMin} min`
    });
    await recarregarPedidos();
    exibirMensagem('mensagemComercial', `✅ Reserva de ${vagas} vaga(s) criada. Confirme antes de expirar (${paramReservaTimerMin} min).`, 'success');
    document.getElementById('formComercial').reset();
    toggleModoReserva();
    renderizarReservasAtivas();
  } catch(e){
    exibirMensagem('mensagemComercial', 'Erro ao criar reserva: ' + (e.message||e), 'error');
  }
}

function _reservasAtivas(){
  return (pedidosGlobais||[]).filter(p => p.isReserva && p.reservaStatus === 'ativa');
}

function _fmtRestante(ms){
  if (ms <= 0) return 'expirada';
  const min = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
  return `${min}m ${String(s).padStart(2,'0')}s`;
}

function renderizarReservasAtivas(){
  const wrap = document.getElementById('reservasAtivasWrap');
  if (!wrap) return;
  const ativas = _reservasAtivas();
  if (ativas.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  const agora = Date.now();
  // agrupa por grupo_id (ou id isolado)
  const grupos = {};
  ativas.forEach(p => { const k = p.grupoId || ('p'+p.id); (grupos[k] = grupos[k] || []).push(p); });
  wrap.innerHTML = `<div class="reservas-box">
    <div class="reservas-titulo">🕒 Reservas aguardando confirmação (${ativas.length} vaga(s))</div>
    ${Object.entries(grupos).map(([k, itens]) => {
      const p = itens[0];
      const exp = p.reservaExpiraEm ? new Date(p.reservaExpiraEm).getTime() : agora;
      const restante = exp - agora;
      const critico = restante < 30*60000;
      return `<div class="reserva-linha ${critico?'reserva-critica':''}">
        <span class="reserva-rota">${p.cliente} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span class="reserva-vagas">${itens.length} vaga(s)</span>
        <span class="reserva-timer" data-exp="${exp}">${_fmtRestante(restante)}</span>
        <button class="btn btn-sm btn-primary" onclick="confirmarReserva('${k}')">✓ Confirmar</button>
        <button class="btn btn-sm btn-secondary" onclick="cancelarReserva('${k}')">✕ Cancelar</button>
      </div>`;
    }).join('')}
  </div>`;
}

function _idsDoGrupoReserva(chave){
  if (chave.startsWith('p')) { const id = parseInt(chave.slice(1),10); return _reservasAtivas().filter(p=>p.id===id).map(p=>p.id); }
  return _reservasAtivas().filter(p => p.grupoId === chave).map(p => p.id);
}

async function confirmarReserva(chave){
  const ids = _idsDoGrupoReserva(chave);
  if (ids.length === 0) return;
  try {
    const { error } = await supabase.from('pedidos')
      .update({ is_reserva:false, reserva_status:'confirmada' }).in('id', ids);
    if (error) throw error;
    ids.forEach(id => { const p=(pedidosGlobais||[]).find(x=>x.id===id); if(p){p.isReserva=false;p.reservaStatus='confirmada';} });
    exibirMensagem('mensagemComercial', '✅ Reserva confirmada. Complete os veículos pela edição do pedido.', 'success');
    renderizarReservasAtivas();
  } catch(e){ alert('Erro ao confirmar: '+(e.message||e)); }
}

async function cancelarReserva(chave, automatico){
  const ids = _idsDoGrupoReserva(chave);
  if (ids.length === 0) return;
  if (!automatico && !confirm('Cancelar esta reserva?')) return;
  try {
    const { error } = await supabase.from('pedidos')
      .update({ is_reserva:false, reserva_status:'cancelada', status:'Cancelado' }).in('id', ids);
    if (error) throw error;
    ids.forEach(id => { const p=(pedidosGlobais||[]).find(x=>x.id===id); if(p){p.isReserva=false;p.reservaStatus='cancelada';p.status='Cancelado';} });
    if (automatico && typeof notificar === 'function') notificar({
      perfil:'comercial', tipo:'alerta', titulo:'⏱️ Reserva expirada e cancelada',
      mensagem:'Uma reserva não foi confirmada a tempo e foi cancelada automaticamente.'
    });
    renderizarReservasAtivas();
  } catch(e){ if(!automatico) alert('Erro ao cancelar: '+(e.message||e)); }
}

// Tick de 1s: atualiza contadores e auto-cancela expiradas
let _reservaTickIniciado = false;
function iniciarTickReservas(){
  if (_reservaTickIniciado) return;
  _reservaTickIniciado = true;
  setInterval(() => {
    const timers = document.querySelectorAll('.reserva-timer');
    const agora = Date.now();
    let expirou = false;
    timers.forEach(t => {
      const exp = parseInt(t.dataset.exp,10);
      const restante = exp - agora;
      t.textContent = _fmtRestante(restante);
      if (restante <= 0) expirou = true;
    });
    if (expirou){
      // auto-cancela as vencidas
      const grupos = {};
      _reservasAtivas().forEach(p => { const k=p.grupoId||('p'+p.id); (grupos[k]=grupos[k]||[]).push(p); });
      Object.entries(grupos).forEach(([k, itens]) => {
        const exp = itens[0].reservaExpiraEm ? new Date(itens[0].reservaExpiraEm).getTime() : agora;
        if (exp - agora <= 0) cancelarReserva(k, true);
      });
    }
  }, 1000);
}

// ============================================================
// LOTE 9 — ITEM 5: DESALOCAR / REVERTER ALOCAÇÃO (Logística)
// Remove a cegonha e devolve o pedido à fila, antes do fechamento.
// ============================================================
async function desalocarPedido(pedidoId){
  if (bloquearSeNaoLogistica('a reversão de alocação')) return;
  const pedido = (pedidosGlobais||[]).find(p => String(p.id) === String(pedidoId));
  if (!pedido){ return; }
  if (!['Intenção Agendada','Aguardando Confirmação'].includes(pedido.status)){
    alert('Só é possível desalocar antes do fechamento (status de coleta em diante não pode ser revertido por aqui).');
    return;
  }
  if (!confirm(`Desalocar o pedido #${pedido.id} da cegonha ${pedido.placaCegonha}?\n\nEle volta para a fila de alocação como "Pendente".`)) return;

  const reversao = {
    placa_cegonha: null, rota: null, rota_id: null,
    motorista_1: null, percent_motorista_1: null,
    motorista_2: null, percent_motorista_2: null,
    data_prev_coleta: null, data_prev_entrega: null,
    patio_atual: null, patio_desde: null,
    // corredor_manual_id PRESERVADO: se tinha 📌, volta pro mesmo corredor; senão, automático
    status: 'Pendente'
  };
  try {
    const { error } = await supabase.from('pedidos').update(reversao).eq('id', parseInt(pedidoId));
    if (error) throw error;
    // Limpa os trechos de transbordo, se houver
    try { await supabase.from('pedido_trechos').delete().eq('pedido_id', parseInt(pedidoId)); } catch(e){}
    // Registra no histórico, se a trilha existir
    try {
      const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId), status_novo: 'Pendente',
        usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `↩️ Alocação revertida (desalocado da cegonha) por ${usuario}`
      });
    } catch(e){}

    if (typeof fecharModal === 'function') fecharModal('modalStatus');
    await recarregarPedidos();
    if (typeof carregarLogistica === 'function') carregarLogistica();
    if (typeof exibirMensagem === 'function')
      exibirMensagem('mensagemLogistica', `↩️ Pedido #${pedidoId} desalocado e devolvido à fila.`, 'success');
  } catch(e){
    alert('Erro ao desalocar: ' + (e.message || e));
  }
}

// ============================================================
// LOTE 10 — ITEM 12 (parte 1): CADASTRO DE CORREDORES + SLA
// ============================================================
let corredoresGlobais = [];

async function carregarCorredores(){
  const cont = document.getElementById('listaCorredores');
  try {
    const { data: cors, error } = await supabase.from('corredores')
      .select('*').order('nome');
    if (error) throw error;
    corredoresGlobais = cors || [];
    // paradas de cada corredor
    const { data: paradas } = await supabase.from('corredor_paradas')
      .select('*').order('ordem');
    const porCor = {};
    (paradas||[]).forEach(p => { (porCor[p.corredor_id] = porCor[p.corredor_id] || []).push(p); });
    corredoresGlobais.forEach(c => { c._paradas = porCor[c.id] || []; });
    _renderCorredores();
  } catch(e){
    if (cont) cont.innerHTML = '<p class="message show error">Erro ao carregar corredores: '+(e.message||e)+'</p>';
  }
}

function _renderCorredores(){
  const cont = document.getElementById('listaCorredores');
  if (!cont) return;
  if (corredoresGlobais.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum corredor cadastrado ainda.</p>'; return; }
  cont.innerHTML = corredoresGlobais.map(c => {
    const seq = (c._paradas||[]).map(p => p.cidade).join(' → ') || `${c.origem} → ${c.destino}`;
    return `<div class="corredor-linha">
      <div class="corredor-info">
        <strong>${c.nome}</strong>
        <span class="text-muted">${c.origem} → ${c.destino} · SLA ${c.sla_horas}h</span>
        <span class="corredor-seq">🛣️ ${seq}</span>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="excluirCorredor(${c.id})">🗑️ Excluir</button>
    </div>`;
  }).join('');
}

async function salvarCorredor(){
  const msgEl = document.getElementById('mensagemCorredor');
  const nome = document.getElementById('corNome')?.value.trim();
  const origem = document.getElementById('corOrigem')?.value.trim();
  const destino = document.getElementById('corDestino')?.value.trim();
  const sla = parseInt(document.getElementById('corSla')?.value,10);
  const paradasRaw = document.getElementById('corParadas')?.value.trim();
  if (!nome || !origem || !destino){ msgEl.textContent='Preencha nome, origem e destino.'; msgEl.className='message show error'; return; }
  if (!sla || sla < 1){ msgEl.textContent='Informe um SLA válido (horas).'; msgEl.className='message show error'; return; }

  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('corredores').insert({
      nome, origem, destino, sla_horas: sla, ativo: true
    }).select();
    if (error) throw error;
    const cor = data && data[0];
    // paradas: usa a lista informada; se vazia, usa origem+destino
    let cidades = paradasRaw ? paradasRaw.split(',').map(s => s.trim()).filter(Boolean) : [origem, destino];
    if (cor && cidades.length){
      const linhas = cidades.map((cidade, i) => ({ corredor_id: cor.id, ordem: i+1, cidade }));
      await supabase.from('corredor_paradas').insert(linhas);
    }
    msgEl.textContent = 'Corredor salvo.';
    msgEl.className = 'message show success';
    ['corNome','corOrigem','corDestino','corParadas'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('corSla').value = 24;
    carregarCorredores();
  } catch(e){
    msgEl.textContent = 'Erro ao salvar: ' + (e.message||e);
    msgEl.className = 'message show error';
  }
}

async function excluirCorredor(id){
  if (!confirm('Excluir este corredor? As paradas associadas também serão removidas.')) return;
  try {
    await supabase.from('corredor_paradas').delete().eq('corredor_id', id);
    const { error } = await supabase.from('corredores').delete().eq('id', id);
    if (error) throw error;
    corredoresGlobais = corredoresGlobais.filter(c => c.id !== id);
    _renderCorredores();
  } catch(e){ alert('Erro ao excluir: ' + (e.message||e)); }
}

// ============================================================
// LOTE 11 — ITEM 12 (parte 2): SUGESTÃO INTELIGENTE POR CORREDORES
// Cruza pedidos pendentes com corredores; agrupa por sequência de
// paradas e janela de datas; mostra ocupação p/ validação da Logística.
// ============================================================
const _CEGONHA_CAP_REF = 11;          // capacidade de referência p/ ocupação
const _JANELA_DIAS_SUG = 3;           // janela de datas para agrupar

function _norm(txt){
  return (txt||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// posição de uma cidade na sequência do corredor (-1 se não estiver)
function _posNaSeq(seq, cidade){
  // compara só a parte da cidade, ignorando "/UF" (ex.: "Curitiba/PR" = "Curitiba")
  const soCidade = v => _norm((v || '').toString().split('/')[0]);
  const alvo = soCidade(cidade);
  if (!alvo) return -1;
  return seq.findIndex(s => soCidade(s) === alvo);
}

function gerarSugestoesRota(){
  const wrap = document.getElementById('sugestoesRotaWrap');
  if (!wrap) return;
  // Sugestão é ferramenta da logística — nunca renderiza para outros perfis.
  if (typeof podeAlocarOuTransbordar === 'function' && !podeAlocarOuTransbordar()){ wrap.innerHTML = ''; return; }
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  if (corredores.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }

  // pedidos pendentes, não-reserva, sem cegonha
  const pendentes = (pedidosGlobais||[]).filter(p =>
    !p.isReserva && !p.placaCegonha && !(p.rotaId || p.rota_id) &&
    !['Entregue','Cancelado'].includes(p.status || 'Pendente'));
  if (pendentes.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }

  const sugestoes = [];
  corredores.forEach(cor => {
    const seq = (cor._paradas||[]).length >= 2 ? cor._paradas.map(p=>p.cidade) : [cor.origem, cor.destino];
    // pedidos que "cabem" no corredor: parte do PÁTIO (se houver) ou da origem;
    // aceita origem→destino na ordem, ou encaixe no caminho (destino no trajeto).
    const fits = pendentes.filter(p => {
      const partida = p.patioAtual || p.cidadeOrigem;
      const io = _posNaSeq(seq, partida);
      const id = _posNaSeq(seq, p.cidadeDestino);
      const noPatioDoTronco = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id)
          || (noPatioDoTronco && id === -1);
    });
    if (fits.length === 0) return;

    // agrupa por janela de datas (data_solicitacao)
    const ordenados = fits.slice().sort((a,b) => (a.dataSolicitacao||'').localeCompare(b.dataSolicitacao||''));
    let cluster = [];
    let inicio = null;
    const flush = () => {
      if (cluster.length){ sugestoes.push({ cor, seq, itens: cluster.slice() }); cluster = []; }
    };
    ordenados.forEach(p => {
      const d = p.dataSolicitacao ? new Date(p.dataSolicitacao+'T12:00') : null;
      if (!inicio || !d){ if (cluster.length===0) inicio = d; cluster.push(p); return; }
      const difDias = Math.abs((d - inicio)/86400000);
      if (difDias <= _JANELA_DIAS_SUG){ cluster.push(p); }
      else { flush(); inicio = d; cluster.push(p); }
    });
    flush();
  });

  if (sugestoes.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  _sugestoesCache = sugestoes;

  wrap.innerHTML = `<div class="sugestoes-box">
    <div class="sugestoes-titulo">🧭 Sugestões de rota por corredor (${sugestoes.length}) — para validação da Logística</div>
    ${sugestoes.map((s, idx) => {
      const ocup = Math.min(100, Math.round((s.itens.length / _CEGONHA_CAP_REF) * 100));
      const corPct = ocup >= 80 ? '#4ade80' : ocup >= 50 ? '#fbbf24' : '#fb923c';
      const datas = s.itens.map(p=>p.dataSolicitacao).filter(Boolean).sort();
      const janela = datas.length ? `${_fmtDataChk(datas[0])}${datas.length>1?' a '+_fmtDataChk(datas[datas.length-1]):''}` : '—';
      const paradasComPedido = s.seq.map(cidade => {
        const temColeta = s.itens.some(p => _norm(p.cidadeOrigem) === _norm(cidade));
        const temEntrega = s.itens.some(p => _norm(p.cidadeDestino) === _norm(cidade));
        const marca = temColeta && temEntrega ? '↕' : temColeta ? '↑' : temEntrega ? '↓' : '·';
        return `<span class="sug-parada ${marca!=='·'?'sug-parada-ativa':''}">${marca} ${cidade}</span>`;
      }).join('<span class="sug-seta">→</span>');
      return `<div class="sugestao-card">
        <div class="sugestao-cab">
          <strong>${s.cor.nome}</strong>
          <span class="text-muted">SLA ${s.cor.sla_horas}h · janela ${janela}</span>
          <span class="sug-ocup" style="color:${corPct}">${s.itens.length}/${_CEGONHA_CAP_REF} · ${ocup}% da cegonha</span>
        </div>
        <div class="sug-paradas">${paradasComPedido}</div>
        <div class="sug-pedidos">${s.itens.map(p =>
          `<span class="sug-pedido">#${p.id} ${p.cliente} (${p.cidadeOrigem}→${p.cidadeDestino})</span>`).join('')}</div>
        ${(typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar()) ? `<button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="criarRotaDaSugestao(${idx})">🛣️ Criar rota e alocar ${s.itens.length} carro(s)</button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
  _espelharSugPainel();
}

// Espelha as sugestões de rota também no Painel de Acompanhamento
function _espelharSugPainel(){
  const a = document.getElementById('sugestoesRotaWrap');
  const b = document.getElementById('sugestoesRotaPainel');
  if (a && b) b.innerHTML = a.innerHTML;
}

// ============================================================
// LOTE 12 — ITEM 16: HORÁRIO PREVISTO + ETA AUTOMÁTICO
// ETA = saída real + SLA do corredor. Tags de entrega 🟢🟡🔴.
// ============================================================
const _ETA_ATENCAO_H = 3; // horas antes do ETA em que entra em "Atenção"

function statusETA(etaISO){
  if (!etaISO) return null;
  const eta = new Date(etaISO).getTime();
  const agora = Date.now();
  const restanteH = (eta - agora) / 3600000;
  if (restanteH < 0)  return { cor:'vermelho', emoji:'🔴', label:'Em Atraso',  txt:`atrasado ${Math.abs(Math.round(restanteH))}h` };
  if (restanteH <= _ETA_ATENCAO_H) return { cor:'amarelo', emoji:'🟡', label:'Atenção', txt:`restam ~${Math.max(0,Math.round(restanteH))}h` };
  return { cor:'verde', emoji:'🟢', label:'Na Janela', txt:`restam ~${Math.round(restanteH)}h` };
}

function etaRotaHTML(r){
  if (!r || !r.eta) return '';
  const s = statusETA(r.eta);
  if (!s) return '';
  const etaFmt = new Date(r.eta).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  return ` · <span class="tag-eta tag-${s.cor}" title="ETA ${etaFmt} · ${s.txt}">${s.emoji} ETA ${etaFmt}</span>`;
}

// ============================================================
// LOTE 14 — ITENS 7 e 8: CONFIRMAÇÃO DO COMERCIAL (aviso 4h) +
// FECHAMENTO POR STATUS VERDE (rota) + envio ao motorista
// ============================================================
const _CONFIRM_AVISO_H = 4; // aviso quando faltam <= 4h para a coleta

function _horasAteColeta(p){
  const dt = p.dataPrevColeta || p.data_prev_coleta;
  if (!dt) return null;
  return (new Date(dt).getTime() - Date.now()) / 3600000;
}

function renderizarConfirmacaoComercial(){
  const wrap = document.getElementById('confirmacaoComercialWrap');
  if (!wrap) return;
  const aguardando = (pedidosGlobais||[]).filter(p => p.status === 'Aguardando Confirmação' && p.origemLancamento !== 'logistica');
  if (aguardando.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  wrap.innerHTML = `<div class="confirmacao-box">
    <div class="confirmacao-titulo">✅ Intenções aguardando sua confirmação (${aguardando.length})</div>
    ${aguardando.map(p => {
      const h = _horasAteColeta(p);
      const urgente = h !== null && h <= _CONFIRM_AVISO_H;
      const aviso = h === null ? ''
        : urgente ? `<span class="confirma-urgente">${h < 0 ? '⏰ coleta vencida' : `🔴 faltam ${Math.max(0,Math.round(h))}h p/ coleta`}</span>`
        : `<span class="text-muted">coleta em ~${Math.round(h)}h</span>`;
      return `<div class="confirma-linha ${urgente?'confirma-linha-urgente':''}">
        <span class="confirma-rota">#${p.id} · ${p.cliente} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span>🚛 ${p.placaCegonha || 'A definir'}</span>
        ${aviso}
        <button class="btn btn-sm btn-primary" onclick="abrirModalStatus(${p.id})">Revisar e confirmar</button>
      </div>`;
    }).join('')}
  </div>`;
}

// ---------- Item 8: fechamento da rota quando tudo "verde" ----------
// "verde" = pedido já passou da confirmação (Em Coleta em diante).
function _pedidosDaRota(rotaId, placaCegonha){
  return (pedidosGlobais||[]).filter(p =>
    (String(p.rotaId) === String(rotaId)) ||
    (placaCegonha && p.placaCegonha === placaCegonha && !['Entregue','Cancelado'].includes(p.status))
  );
}
function _rotaStatusVerde(rotaId, placaCegonha){
  const ped = _pedidosDaRota(rotaId, placaCegonha).filter(p => p.status !== 'Cancelado');
  if (ped.length === 0) return { total:0, verdes:0, todosVerdes:false };
  const verdes = ped.filter(p => !['Pendente','Intenção Agendada','Aguardando Confirmação'].includes(p.status)).length;
  return { total: ped.length, verdes, todosVerdes: verdes === ped.length };
}
function fechamentoRotaHTML(r){
  const v = _rotaStatusVerde(r.id, r.placa_cegonha);
  if (v.total === 0) return '';
  if (r.carga_fechada) return ` · <span class="tag-fechada">🔒 Carga fechada</span>`;
  if (v.todosVerdes && (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())){
    return ` · <span class="tag-verde-ok">✅ Tudo validado</span> <button class="btn btn-sm btn-primary" onclick="fecharCargaRota(${r.id})">🔒 Fechar e enviar ao motorista</button>`;
  }
  return ` · <span class="text-muted">${v.verdes}/${v.total} validado(s)</span>`;
}

async function fecharCargaRota(rotaId){
  if (bloquearSeNaoLogistica('o fechamento da carga')) return;
  const r = (rotasGlobais||[]).find(x => String(x.id) === String(rotaId));
  if (!r) return;
  const v = _rotaStatusVerde(r.id, r.placa_cegonha);
  if (!v.todosVerdes){ alert('Ainda há pedidos não validados nesta rota.'); return; }
  if (!confirm(`Fechar a carga da rota "${r.nome || '#'+r.id}" e enviar ao motorista da cegonha ${r.placa_cegonha||'—'}?`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('rotas_planejadas')
      .update({ carga_fechada:true, fechada_em:new Date().toISOString(), fechada_por:usuario })
      .eq('id', rotaId);
    if (error) throw error;
    r.carga_fechada = true;
    // envia ao motorista (notificação) — ele confere as placas no app
    try {
      if (r.placa_cegonha){
        const ped = _pedidosDaRota(r.id, r.placa_cegonha)[0];
        if (ped && typeof notificarMotoristaDoPedido === 'function'){
          await notificarMotoristaDoPedido(ped, {
            titulo: '🔒 Carga fechada — confira as placas',
            corpo: `Rota ${r.nome || '#'+r.id} liberada. Confira as placas dos veículos pelo app.`
          });
        }
      }
    } catch(e){}
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', '🔒 Carga fechada e enviada ao motorista.', 'success');
  } catch(e){
    alert('Erro ao fechar carga: ' + (e.message||e));
  }
}

// ============================================================
// LOTE 17 — ITENS 3-4: LAST MILE (fila da Logística) + EQUIPES
// ============================================================
// ---- Item 4: cadastro de equipes de entrega ----
async function salvarEquipeEntrega(){
  const msgEl = document.getElementById('mensagemEquipe');
  const nome = document.getElementById('eqNome')?.value.trim();
  const responsavel = document.getElementById('eqResponsavel')?.value.trim() || null;
  const cidade_base = document.getElementById('eqCidadeBase')?.value.trim() || null;
  const uf_base = (document.getElementById('eqUfBase')?.value.trim() || '').toUpperCase() || null;
  const membros = document.getElementById('eqMembros')?.value.trim() || null;
  if (!nome){ msgEl.textContent='Informe o nome da equipe.'; msgEl.className='message show error'; return; }
  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('equipes_entrega')
      .insert({ nome, responsavel, cidade_base, uf_base, membros, ativo:true }).select();
    if (error) throw error;
    if (data && data[0]) equipesEntregaGlobais.push(data[0]);
    msgEl.textContent='Equipe salva.'; msgEl.className='message show success';
    ['eqNome','eqResponsavel','eqCidadeBase','eqUfBase','eqMembros'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    renderizarEquipesEntrega();
  } catch(e){ msgEl.textContent='Erro: '+(e.message||e); msgEl.className='message show error'; }
}

function renderizarEquipesEntrega(){
  const cont = document.getElementById('listaEquipes');
  if (!cont) return;
  if (equipesEntregaGlobais.length === 0){ cont.innerHTML='<p class="text-muted">Nenhuma equipe cadastrada.</p>'; return; }
  cont.innerHTML = equipesEntregaGlobais.map(e => `
    <div class="corredor-linha">
      <div class="corredor-info"><strong>${e.nome}</strong>
        ${e.cidade_base ? `<span class="carteira-badge">📍 ${e.cidade_base}${e.uf_base?'/'+e.uf_base:''}</span>` : '<span class="corredor-tag-semrota">sem cidade base</span>'}
        <span class="text-muted">${e.responsavel ? '· Resp.: '+e.responsavel : ''}${e.membros ? ' · 👥 '+e.membros : ''}</span></div>
      <button class="btn btn-sm btn-secondary" onclick="excluirEquipeEntrega(${e.id})">🗑️ Excluir</button>
    </div>`).join('');
}

async function excluirEquipeEntrega(id){
  if (!confirm('Excluir esta equipe?')) return;
  try {
    const { error } = await supabase.from('equipes_entrega').delete().eq('id', id);
    if (error) throw error;
    equipesEntregaGlobais = equipesEntregaGlobais.filter(e => e.id !== id);
    renderizarEquipesEntrega();
  } catch(e){ alert('Erro ao excluir: '+(e.message||e)); }
}

// ---- Item 3: fila de last mile (após a viagem principal) ----
// Entram pedidos "Em Transporte" ainda sem definição de entrega final.
function _pedidosLastMile(){
  return (pedidosGlobais||[]).filter(p =>
    p.status === 'Em Transporte' && !p.fluxoEntrega && p.status !== 'Cancelado');
}

function renderizarLastMile(){
  const wrap = document.getElementById('lastMileWrap');
  if (!wrap) return;
  const fila = _pedidosLastMile();
  if (fila.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  const opcoesEquipe = (equipesEntregaGlobais||[]).map(e => `<option value="${e.id}">${e.nome}${e.responsavel?' ('+e.responsavel+')':''}</option>`).join('');
  wrap.innerHTML = `<div class="lastmile-box">
    <div class="lastmile-titulo">🚚 Last mile — definir entrega final (${fila.length})</div>
    ${fila.map(p => `
      <div class="lastmile-linha" id="lm_${p.id}">
        <span class="lastmile-rota">#${p.id} · ${p.cliente} · → ${p.cidadeDestino}/${p.ufDestino}
          <span class="text-muted">(entrega: ${p.tipoEntrega === 'estabelecimento' ? 'estabelecimento' : 'pátio'})</span></span>
        <select class="lm-fluxo" onchange="_lmToggleEquipe(${p.id})" id="lmFluxo_${p.id}">
          <option value="">Definir…</option>
          <option value="direta">Entrega direta</option>
          <option value="equipe">Via equipe local</option>
        </select>
        <select class="lm-equipe" id="lmEquipe_${p.id}" style="display:none">
          <option value="">Selecione a equipe…</option>${opcoesEquipe}
        </select>
        <select class="lm-modalidade" id="lmModal_${p.id}">
          <option value="patio">Pátio</option>
          <option value="estabelecimento">Estabelecimento</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="definirLastMile(${p.id})">✓ Registrar</button>
      </div>`).join('')}
  </div>`;
  // pré-seleciona a modalidade conforme o tipo de entrega do pedido
  fila.forEach(p => { const m=document.getElementById('lmModal_'+p.id); if(m) m.value = p.tipoEntrega || 'patio'; });
}

function _lmToggleEquipe(id){
  const fluxo = document.getElementById('lmFluxo_'+id)?.value;
  const selEq = document.getElementById('lmEquipe_'+id);
  if (selEq) selEq.style.display = (fluxo === 'equipe') ? '' : 'none';
}

async function definirLastMile(pedidoId){
  if (bloquearSeNaoLogistica('a definição de entrega')) return;
  const fluxo = document.getElementById('lmFluxo_'+pedidoId)?.value;
  const equipeId = document.getElementById('lmEquipe_'+pedidoId)?.value || null;
  const modalidade = document.getElementById('lmModal_'+pedidoId)?.value || 'patio';
  if (!fluxo){ alert('Escolha entrega direta ou via equipe.'); return; }
  if (fluxo === 'equipe' && !equipeId){ alert('Selecione a equipe local.'); return; }
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  const equipe = (equipesEntregaGlobais||[]).find(e => String(e.id) === String(equipeId));
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error: e1 } = await supabase.from('entregas_last_mile').insert({
      pedido_id: parseInt(pedidoId), fluxo_entrega: fluxo,
      equipe_id: equipeId ? parseInt(equipeId) : null,
      responsavel: equipe?.responsavel || null, modalidade,
      concluida_por: usuario, concluida_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      created_at: new Date().toISOString()
    });
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('pedidos')
      .update({ fluxo_entrega: fluxo, equipe_entrega_id: equipeId ? parseInt(equipeId) : null })
      .eq('id', parseInt(pedidoId));
    if (e2) throw e2;
    if (p){ p.fluxoEntrega = fluxo; p.equipeEntregaId = equipeId; }
    renderizarLastMile();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `🚚 Entrega do #${pedidoId} definida: ${fluxo === 'equipe' ? 'via '+(equipe?.nome||'equipe') : 'direta'} (${modalidade}).`, 'success');
  } catch(e){ alert('Erro ao registrar entrega: '+(e.message||e)); }
}

// ============================================================
// LOTE 18 — ITEM 9: FATURAMENTO NA LOGÍSTICA + EXTRATO DO MOTORISTA
// ============================================================
function _fmtBRL(v){
  return (v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

// Extrato simplificado: viagens concluídas + faturamento previsto
function carregarExtratoMotorista(){
  const resumo = document.getElementById('extratoMotoristaResumo');
  const lista = document.getElementById('extratoMotoristaLista');
  if (!lista) return;

  // nomes do motorista logado
  let nomes = [];
  if (typeof nomesDoMotoristaLogado === 'function'){
    try { nomes = (nomesDoMotoristaLogado().nomes || []); } catch(e){}
  }
  if (nomes.length === 0){
    const n = document.getElementById('usuarioLogado')?.textContent; if (n) nomes = [n];
  }
  const norm = t => (t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const alvos = nomes.map(norm).filter(Boolean);
  const ehDoMotorista = p => {
    const m1 = norm(p.motorista1 || p.motorista_1);
    const m2 = norm(p.motorista2 || p.motorista_2);
    return alvos.includes(m1) || alvos.includes(m2);
  };

  const meus = (pedidosGlobais||[]).filter(ehDoMotorista);
  const concluidas = meus.filter(p => p.status === 'Entregue');

  // faturamento previsto: soma do valor_previsto das rotas em que o motorista está
  // (conta cada rota uma vez), considerando pedidos não entregues/cancelados.
  const rotaIds = new Set();
  meus.forEach(p => { if (p.rotaId && !['Entregue','Cancelado'].includes(p.status)) rotaIds.add(String(p.rotaId)); });
  let previsto = 0;
  (rotasGlobais||[]).forEach(r => { if (rotaIds.has(String(r.id)) && r.valor_previsto) previsto += Number(r.valor_previsto); });

  if (resumo){
    resumo.innerHTML = `
      <div class="extrato-cards">
        <div class="extrato-card"><span class="extrato-num">${concluidas.length}</span><span class="extrato-rot">viagens concluídas</span></div>
        <div class="extrato-card"><span class="extrato-num">${_fmtBRL(previsto)}</span><span class="extrato-rot">faturamento previsto</span></div>
      </div>`;
  }

  if (concluidas.length === 0){
    lista.innerHTML = '<p class="text-muted">Nenhuma viagem concluída ainda.</p>';
    return;
  }
  lista.innerHTML = '<h3 class="conf-titulo">Viagens concluídas</h3>' +
    concluidas.slice(0,30).map(p => `
      <div class="extrato-linha">
        <span>#${p.id} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span class="text-muted">${p.cliente || ''}</span>
        <span class="tag-eta tag-verde">✔ Entregue</span>
      </div>`).join('');
}

// ============================================================
// LOTE 19 — ITEM 18: CONFERÊNCIA / AUDITORIA DE FATURAMENTO
// Só conferência (não emite). Previsto x emitido por entrada manual.
// Tela na Logística; leitura na Diretoria; divergência sinalizada.
// ============================================================
const _DIVERGENCIA_TOLERANCIA = 0.01;

function _rotasComFaturamento(){
  return (rotasGlobais||[]).filter(r => r.valor_previsto != null)
    .sort((a,b) => (b.data_saida||'').localeCompare(a.data_saida||''));
}

// Painel editável (Logística)
function renderizarConferenciaFaturamento(){
  const wrap = document.getElementById('conferenciaFatWrap');
  if (!wrap) return;
  const todas = _rotasComFaturamento();
  const rotas = todas.filter(r => r.valor_emitido == null); // só as pendentes de conferência
  const jaConferidas = todas.length - rotas.length;
  if (rotas.length === 0){
    wrap.innerHTML = jaConferidas > 0
      ? `<div class="card"><h2>🧾 Conferência de Faturamento</h2><p class="text-muted" style="margin-top:.4rem">✅ Tudo conferido — nenhuma rota pendente. (${jaConferidas} já conferida(s))</p></div>`
      : '';
    return;
  }
  wrap.innerHTML = `<div class="card">
    <div class="painel-header-bar"><h2>🧾 Conferência de Faturamento (previsto × emitido)</h2>
      <button class="btn btn-secondary btn-sm" onclick="renderizarConferenciaFaturamento()">↻ Atualizar</button></div>
    <p class="text-muted" style="margin:.2rem 0 1rem;font-size:.86rem">
      Confira antes/depois da emissão externa de NFe/CTe. O sistema só compara e sinaliza — não emite nada.${jaConferidas > 0 ? ` · <strong>${jaConferidas}</strong> já conferida(s) saíram da lista.` : ''}</p>
    <table class="tabela-conf">
      <thead><tr><th>Rota</th><th>Previsto</th><th>Emitido (NFe/CTe)</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${rotas.map(r => {
          const prev = Number(r.valor_previsto)||0;
          const emit = r.valor_emitido != null ? Number(r.valor_emitido) : null;
          const div = emit != null && Math.abs(prev - emit) > _DIVERGENCIA_TOLERANCIA;
          const st = emit == null ? '<span class="text-muted">a conferir</span>'
                    : div ? `<span class="conf-divergente">⚠️ divergência ${_fmtBRL(emit-prev)}</span>`
                          : '<span class="conf-ok">✅ confere</span>';
          return `<tr>
            <td>${r.nome || '#'+r.id} <span class="text-muted">${r.placa_cegonha||''}</span></td>
            <td>${_fmtBRL(prev)}</td>
            <td><input type="number" step="0.01" class="conf-input" id="confEmit_${r.id}" value="${emit!=null?emit:''}" placeholder="0,00"></td>
            <td>${st}</td>
            <td><button class="btn btn-sm btn-primary" onclick="salvarConferenciaRota(${r.id})">Salvar</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

async function salvarConferenciaRota(rotaId){
  if (bloquearSeNaoLogistica('a conferência de faturamento')) return;
  const r = (rotasGlobais||[]).find(x => String(x.id) === String(rotaId));
  if (!r) return;
  const emit = parseFloat(document.getElementById('confEmit_'+rotaId)?.value);
  if (isNaN(emit)){ alert('Informe o valor emitido.'); return; }
  const prev = Number(r.valor_previsto)||0;
  const div = Math.abs(prev - emit) > _DIVERGENCIA_TOLERANCIA;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('rotas_planejadas').update({
      valor_emitido: emit, conf_divergencia: div,
      conferido_por: usuario, conferido_em: new Date().toISOString()
    }).eq('id', rotaId);
    if (error) throw error;
    r.valor_emitido = emit; r.conf_divergencia = div;
    renderizarConferenciaFaturamento();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      div ? `⚠️ Divergência registrada na rota ${r.nome||'#'+r.id}.` : `✅ Faturamento da rota ${r.nome||'#'+r.id} confere.`,
      div ? 'error' : 'success');
  } catch(e){ alert('Erro ao salvar conferência: '+(e.message||e)); }
}

// Espelho de leitura (Diretoria)
function renderizarConferenciaDiretoria(){
  const el = document.getElementById('dirConferenciaFat');
  if (!el) return;
  const rotas = _rotasComFaturamento().filter(r => r.valor_emitido != null);
  const divergentes = rotas.filter(r => r.conf_divergencia);
  if (rotas.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="dir-conf-box ${divergentes.length?'dir-conf-alerta':''}">
    <strong>🧾 Conferência de faturamento:</strong>
    ${rotas.length} rota(s) conferida(s) ·
    ${divergentes.length ? `<span class="conf-divergente">${divergentes.length} com divergência</span>` : '<span class="conf-ok">todas conferem</span>'}
  </div>`;
}

// ============================================================
// Diretoria — pedidos por responsável comercial (qtd + período)
// ============================================================
function renderComerciais(){
  const el = document.getElementById('dirComerciais');
  if (!el) return;
  const periodo = document.getElementById('dirComPeriodo')?.value || 'mes';
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);
  const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);
  const dataDoPedido = p => new Date(p.dataSolicitacao || p.data_solicitacao || p.criadoEm || hoje);

  const noPeriodo = (pedidosGlobais||[]).filter(p => {
    if (p.status === 'Cancelado') return false;
    const d = dataDoPedido(p);
    if (periodo === 'mes')         return d >= inicioMes;
    if (periodo === 'mespassado')  return d >= inicioMesPassado && d <= fimMesPassado;
    if (periodo === 'ano')         return d >= inicioAno;
    return true; // tudo
  });

  const _normResp = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                          .toLowerCase().replace(/\s+/g,' ').trim();
  const _tituloResp = s => (s||'').replace(/\s+/g,' ').trim()
                          .replace(/\b\p{L}/gu, c => c.toUpperCase());
  const mapa = {};
  noPeriodo.forEach(p => {
    const original = p.responsavelComercial || '(sem responsável)';
    const chave = _normResp(original) || '(sem responsavel)';
    if (!mapa[chave]) mapa[chave] = { carros: 0, total: 0, nome: _tituloResp(original) || '(sem responsável)' };
    mapa[chave].carros++;
    mapa[chave].total += parseFloat(p.valorFrete) || 0;
  });
  // ordena por QUANTIDADE de carros/pedidos
  const lista = Object.entries(mapa).sort((a,b) => b[1].carros - a[1].carros).slice(0, 10);
  const max = Math.max(...lista.map(l => l[1].carros), 1);

  el.innerHTML = lista.length === 0
    ? '<p class="text-muted text-sm">Nenhum pedido no período.</p>'
    : lista.map(([chave, d]) => `
        <div class="dir-barra-linha">
          <span class="dir-barra-rot" title="${d.nome}">${d.nome}</span>
          <div class="dir-barra-trilho">
            <div class="dir-barra" style="width:${Math.max(2,(d.carros/max)*100)}%;background:#a78bfa"></div>
          </div>
          <span class="dir-barra-val">${d.carros} pedido(s)<small>${_dirMoeda ? _dirMoeda(d.total) : ''}</small></span>
        </div>`).join('');
}

// ============================================================
// Cadastros — sub-abas (abre só a seção escolhida) + restrição por perfil
// ============================================================
const _CAD_GRUPOS = [
  { id:'clientes',   label:'👥 Clientes',   perfis:['comercial','logistica','admin'] },
  { id:'veiculos',   label:'🚛 Veículos',   perfis:['logistica','admin'] },
  { id:'motoristas', label:'🧑‍✈️ Motoristas', perfis:['logistica','admin'] },
  { id:'corredores', label:'🛣️ Corredores', perfis:['logistica','admin'] },
  { id:'equipes',    label:'🚚 Equipes',    perfis:['logistica','admin'] },
  { id:'outros',     label:'⚙️ Outros',     perfis:['admin'] }
];

function _classificarCardCadastro(card){
  const txt = (card.textContent || '').toLowerCase();
  const html = card.innerHTML || '';
  if (card.id === 'cardCadastroClientes' || txt.includes('cadastro de cliente') || html.includes('corpo_listaClientes')) return 'clientes';
  if (txt.includes('corredores')) return 'corredores';
  if (txt.includes('equipes de entrega')) return 'equipes';
  if (txt.includes('cadastro de motorista') || html.includes('corpo_listaMotoristas')) return 'motoristas';
  if (txt.includes('cadastro de veículo') || txt.includes('cadastro de veiculo') || html.includes('corpo_listaVeiculos') || html.includes('listaVeiculos')) return 'veiculos';
  return 'outros';
}

function inicializarCadastrosSubabas(){
  const sec = document.getElementById('cadastros');
  if (!sec) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : 'admin';

  // 1) marca cada card com seu grupo
  const cards = Array.from(sec.querySelectorAll(':scope > .card'));
  cards.forEach(c => { c.dataset.cadsec = _classificarCardCadastro(c); });

  // 2) grupos existentes e permitidos p/ o perfil
  const gruposPresentes = _CAD_GRUPOS.filter(g =>
    g.perfis.includes(perfil) && cards.some(c => c.dataset.cadsec === g.id));

  // 3) (re)constrói a barra de sub-abas
  let bar = sec.querySelector('.cad-subtabs');
  if (bar) bar.remove();
  bar = document.createElement('div');
  bar.className = 'cad-subtabs';
  bar.innerHTML = gruposPresentes.map((g,i) =>
    `<button class="cad-subtab-btn${i===0?' ativo':''}" data-sec="${g.id}" onclick="mostrarCadastroSub('${g.id}')">${g.label}</button>`
  ).join('');
  sec.insertBefore(bar, sec.firstChild);

  // 4) esconde cards de grupos não permitidos e abre o primeiro
  cards.forEach(c => {
    const permitido = gruposPresentes.some(g => g.id === c.dataset.cadsec);
    if (!permitido) c.style.display = 'none';
  });
  if (gruposPresentes.length) mostrarCadastroSub(gruposPresentes[0].id);
}

function mostrarCadastroSub(sec){
  const cont = document.getElementById('cadastros');
  if (!cont) return;
  cont.querySelectorAll(':scope > .card').forEach(c => {
    c.style.display = (c.dataset.cadsec === sec) ? '' : 'none';
  });
  cont.querySelectorAll('.cad-subtab-btn').forEach(b => {
    b.classList.toggle('ativo', b.dataset.sec === sec);
  });
}

// ============================================================
// Responsável comercial — menu de seleção com nomes já usados
// ============================================================
function _tituloResp2(s){ return (s||'').replace(/\s+/g,' ').trim().replace(/\b\p{L}/gu, c => c.toUpperCase()); }
function _normResp2(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }

function popularResponsaveisComercial(){
  const sel = document.getElementById('responsavelComercial');
  if (!sel) return;
  const atual = sel.value;
  // nomes distintos já usados (dedup por normalização) + usuário logado
  const mapa = {};
  (pedidosGlobais||[]).forEach(p => {
    const r = p.responsavelComercial; if (!r) return;
    const k = _normResp2(r); if (!k) return;
    if (!mapa[k]) mapa[k] = _tituloResp2(r);
  });
  const usuarioRaw = document.getElementById('usuarioLogado')?.textContent || '';
  const usuario = /visualizando|admin/i.test(usuarioRaw) ? '' : usuarioRaw;
  if (usuario){ const k=_normResp2(usuario); if(k && !mapa[k]) mapa[k]=_tituloResp2(usuario); }
  const nomes = Object.values(mapa).sort((a,b)=>a.localeCompare(b));

  sel.innerHTML = '<option value="">Selecione…</option>'
    + nomes.map(n => `<option value="${n}">${n}</option>`).join('')
    + '<option value="__outro__">➕ Outro (digitar)</option>';

  // mantém seleção anterior, ou sugere o usuário logado
  if (atual && atual !== '__outro__') sel.value = atual;
  else if (usuario){ const alvo = _tituloResp2(usuario); if (nomes.includes(alvo)) sel.value = alvo; }
  _toggleRespComOutro();
}

function _toggleRespComOutro(){
  const sel = document.getElementById('responsavelComercial');
  const outro = document.getElementById('responsavelComercialOutro');
  if (!sel || !outro) return;
  outro.style.display = (sel.value === '__outro__') ? '' : 'none';
}

function _getResponsavelComercial(){
  const sel = document.getElementById('responsavelComercial');
  if (!sel) return '';
  if (sel.value === '__outro__'){
    return _tituloResp2(document.getElementById('responsavelComercialOutro')?.value || '');
  }
  return sel.value || '';
}

// ============================================================
// Indicador de "processando" — feedback para os cliques
// ============================================================
let _procTimer = null, _procAtivo = 0;
function mostrarProcessando(){
  _procAtivo++;
  // só mostra se demorar mais de 250ms (evita piscar em ações rápidas)
  if (_procTimer) return;
  _procTimer = setTimeout(() => {
    let el = document.getElementById('mm-processando');
    if (!el){
      el = document.createElement('div');
      el.id = 'mm-processando';
      el.innerHTML = '<div class="mm-proc-spin"></div><span>Processando…</span>';
      document.body.appendChild(el);
    }
    el.classList.add('ativo');
  }, 250);
}
function ocultarProcessando(){
  _procAtivo = Math.max(0, _procAtivo - 1);
  if (_procAtivo > 0) return;
  if (_procTimer){ clearTimeout(_procTimer); _procTimer = null; }
  const el = document.getElementById('mm-processando');
  if (el) el.classList.remove('ativo');
}

// Recarga leve: só pedidos + rotas (usado nas ações frequentes)
async function recarregarPedidos(){
  return carregarDadosDoSupabase({ somentePedidos: true });
}

// Máscara de CNPJ para campos avulsos (coleta/entrega)
function mascaraCNPJcampo(input){
  let v = input.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2')
       .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
       .replace(/\.(\d{3})(\d)/, '.$1/$2')
       .replace(/(\d{4})(\d)/, '$1-$2');
  input.value = v;
}

// ============================================================
// Autopreenchimento por CNPJ — API pública cnpj.ws
// (gratuita, ~3 consultas/min por IP; sem token)
// ============================================================
async function consultarCNPJ(cnpjBruto){
  const cnpj = (cnpjBruto || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return null;
  const resp = await fetch('https://publica.cnpj.ws/cnpj/' + cnpj, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error('Muitas consultas seguidas — aguarde 1 minuto e tente de novo.');
    if (resp.status === 404) throw new Error('CNPJ não encontrado.');
    throw new Error('Não foi possível consultar o CNPJ agora.');
  }
  const d = await resp.json();
  const est = d.estabelecimento || {};
  return {
    razaoSocial: d.razao_social || est.nome_fantasia || '',
    logradouro: [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ').trim(),
    numero: est.numero || '',
    complemento: est.complemento || '',
    bairro: est.bairro || '',
    cidade: (est.cidade && est.cidade.nome) || '',
    uf: (est.estado && est.estado.sigla) || '',
    cep: est.cep || '',
    email: est.email || '',
    telefone: (est.ddd1 && est.telefone1) ? `(${est.ddd1}) ${est.telefone1}` : ''
  };
}
function _setVal(id, val){ const el = document.getElementById(id); if (el && val) el.value = val; }
function _fmtCEP(c){ const v=(c||'').replace(/\D/g,''); return v.length===8 ? v.replace(/(\d{5})(\d{3})/, '$1-$2') : (c||''); }

// 1) Cadastro de cliente
async function autoPreencherCNPJCliente(){
  const bruto = document.getElementById('cnpjCliente')?.value || '';
  if (bruto.replace(/\D/g,'').length !== 14) return;
  if (typeof mostrarProcessando === 'function') mostrarProcessando();
  try {
    const dados = await consultarCNPJ(bruto);
    if (!dados) return;
    _setVal('nomeCliente', dados.razaoSocial);
    _setVal('enderecoCliente', dados.logradouro);
    _setVal('numeroCliente', dados.numero);
    _setVal('bairroCliente', dados.bairro);
    _setVal('cidadeCliente', dados.cidade);
    _setVal('ufCliente', dados.uf);
    _setVal('cepCliente', _fmtCEP(dados.cep));
    if (!document.getElementById('emailCliente')?.value) _setVal('emailCliente', dados.email);
    if (!document.getElementById('telefoneCliente')?.value) _setVal('telefoneCliente', dados.telefone);
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemCadastroCliente', '✅ Dados preenchidos pelo CNPJ. Confira e ajuste se precisar.', 'success');
  } catch(e){
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemCadastroCliente', '⚠️ ' + (e.message || 'Falha ao consultar CNPJ') + ' Preencha manualmente.', 'error');
  } finally {
    if (typeof ocultarProcessando === 'function') ocultarProcessando();
  }
}

// 2) CNPJ de coleta/entrega no lançamento comercial
async function autoPreencherCNPJLocal(qual){ // qual = 'Coleta' | 'Entrega'
  const bruto = document.getElementById('cnpj' + qual)?.value || '';
  if (bruto.replace(/\D/g,'').length !== 14) return;
  if (typeof mostrarProcessando === 'function') mostrarProcessando();
  try {
    const dados = await consultarCNPJ(bruto);
    if (!dados) return;
    const endereco = [dados.logradouro, dados.numero, dados.bairro].filter(Boolean).join(', ');
    _setVal('endereco' + qual, endereco);
    _setVal('cep' + qual, _fmtCEP(dados.cep));
    if (qual === 'Coleta'){ _setVal('cidadeOrigem', dados.cidade); _setVal('ufOrigem', dados.uf); }
    else { _setVal('cidadeDestino', dados.cidade); _setVal('ufDestino', dados.uf); }
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', `✅ Endereço de ${qual.toLowerCase()} preenchido pelo CNPJ.`, 'success');
  } catch(e){
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', '⚠️ ' + (e.message || 'Falha ao consultar CNPJ') + ' Preencha manualmente.', 'error');
  } finally {
    if (typeof ocultarProcessando === 'function') ocultarProcessando();
  }
}

// ============================================================
// Preview ao vivo do cálculo de frete (por carro x cheio)
// ============================================================
function atualizarPreviewFrete(){
  const el = document.getElementById('fretePreview');
  if (!el) return;
  const tipo = document.getElementById('freteTipo')?.value || 'cheio';
  const valorBase = valorMoedaParaFloat(document.getElementById('valorFrete')?.value || '');
  const linhasExtra = Array.from(document.querySelectorAll('.veiculo-extra-row'));
  const qtd = 1 + linhasExtra.length;
  const money = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  if (!valorBase || valorBase <= 0){ el.innerHTML = ''; return; }

  if (tipo === 'cheio'){
    const porCarro = valorBase / qtd;
    el.innerHTML = `🧮 Frete cheio: <strong>${money(valorBase)}</strong> ÷ ${qtd} carro(s) = <strong>${money(porCarro)}</strong> por carro`;
  } else {
    // por carro: soma o valor de cada carro (principal + extras, cada um o seu ou o principal)
    let total = valorBase;
    let todosIguais = true;
    linhasExtra.forEach(l => {
      const s = l.querySelector('.veiculo-extra-valor')?.value.trim();
      const v = s ? valorMoedaParaFloat(s) : valorBase;
      total += v;
      if (v !== valorBase) todosIguais = false;
    });
    el.innerHTML = todosIguais
      ? `🧮 Por carro: <strong>${money(valorBase)}</strong> × ${qtd} carro(s) = <strong>${money(total)}</strong> no total`
      : `🧮 Por carro (valores diferentes): total da carga = <strong>${money(total)}</strong>`;
  }
}

// Autopreenchimento por CNPJ no modal de EDIÇÃO de cliente
async function autoPreencherCNPJEdicao(){
  const bruto = document.getElementById('edCliCnpj')?.value || '';
  if (bruto.replace(/\D/g,'').length !== 14) return;
  if (typeof mostrarProcessando === 'function') mostrarProcessando();
  try {
    const dados = await consultarCNPJ(bruto);
    if (!dados) return;
    _setVal('edCliNome', dados.razaoSocial);
    _setVal('edCliEndereco', dados.logradouro);
    _setVal('edCliNumero', dados.numero);
    _setVal('edCliBairro', dados.bairro);
    _setVal('edCliCidade', dados.cidade);
    _setVal('edCliUf', dados.uf);
    _setVal('edCliCep', _fmtCEP(dados.cep));
    if (!document.getElementById('edCliEmail')?.value) _setVal('edCliEmail', dados.email);
    if (!document.getElementById('edCliTelefone')?.value) _setVal('edCliTelefone', dados.telefone);
    const msg = document.getElementById('mensagemEdicaoCliente');
    if (msg){ msg.textContent = '✅ Dados atualizados pelo CNPJ. Confira e salve.'; msg.className = 'message show success'; }
  } catch(e){
    const msg = document.getElementById('mensagemEdicaoCliente');
    if (msg){ msg.textContent = '⚠️ ' + (e.message || 'Falha ao consultar CNPJ'); msg.className = 'message show error'; }
  } finally {
    if (typeof ocultarProcessando === 'function') ocultarProcessando();
  }
}

// Cache das sugestões e criação de rota já alocando os carros sugeridos
let _sugestoesCache = [];
async function criarRotaDaSugestao(idx){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const s = _sugestoesCache[idx];
  if (!s || !supabase) return;
  const seqCidades = (s.seq || []).filter(Boolean);
  if (!confirm(`Criar rota "${s.cor.nome}" e alocar ${s.itens.length} carro(s) sugerido(s)?`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    // 1) cria a rota planejada a partir do corredor
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: s.cor.nome,
      corredor_id: s.cor.id || null,
      paradas: seqCidades,
      status: 'planejada',
      criado_por: usuario
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');

    // 2) vincula os pedidos sugeridos à rota (mesma coluna do vincular manual)
    const ids = s.itens.map(p => parseInt(p.id));
    const { error: e2 } = await supabase.from('pedidos').update({ rota_id: rotaId }).in('id', ids);
    if (e2) throw e2;

    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota "${s.cor.nome}" criada com ${ids.length} carro(s). Agora é só definir a cegonha na aba Gestão Logística.`, 'success');
  } catch(e){
    alert('Erro ao criar rota: ' + (e.message || e));
  }
}

// ============================================================
// Carteira de Demanda — pedidos sem rota, agrupados por origem
// (aba interna do Painel de Acompanhamento; logística e comercial)
// ============================================================
function mostrarViewPainel(view, btn){
  const painel = document.getElementById('painel');
  const carteira = document.getElementById('painelViewCarteira');
  const corredores = document.getElementById('painelViewCorredores');
  const avancar = document.getElementById('painelViewAvancar');
  const historico = document.getElementById('painelViewHistorico');
  if (!painel) return;
  const esconder = painel.querySelectorAll('.ocup-resumo, .ocup-filtros, .tabela-scroll, #sugestoesRotaPainel');
  const ehExtra = (view === 'carteira' || view === 'corredores' || view === 'avancar' || view === 'historico');
  esconder.forEach(e => e.style.display = ehExtra ? 'none' : '');
  if (carteira) carteira.style.display = (view === 'carteira') ? '' : 'none';
  if (corredores) corredores.style.display = (view === 'corredores') ? '' : 'none';
  if (avancar) avancar.style.display = (view === 'avancar') ? '' : 'none';
  if (historico) historico.style.display = (view === 'historico') ? '' : 'none';
  if (view === 'carteira') renderizarCarteiraDemanda();
  if (view === 'corredores') renderizarPainelCorredores();
  if (view === 'avancar') renderizarAvancarPedidos();
  if (view === 'historico'){ historico.innerHTML = _histCargasCasca(); renderizarHistoricoCargas(); }
  document.querySelectorAll('.painel-subtabs .cad-subtab-btn').forEach(b => b.classList.remove('ativo'));
  if (btn) btn.classList.add('ativo');
}

function renderizarCarteiraDemanda(){
  const cont = document.getElementById('painelViewCarteira');
  if (!cont) return;
  if (!document.getElementById('carteiraBusca')){
    cont.innerHTML = `
      <p class="text-muted" style="margin:.2rem 0 .8rem;font-size:.85rem">📋 <strong>Acompanhamento por origem</strong> — todos os carros de cada cidade de origem. Use ➡️ para jogar num corredor. O carro <strong>não sai daqui</strong>: mostra o caminhão alocado e o status até ser entregue.</p>
      <div class="carteira-topo">
        <input type="text" id="carteiraBusca" class="ocup-busca" placeholder="🔍 Filtrar por cliente, cidade, placa..." oninput="_renderCarteiraGrupos()">
        <span id="carteiraTotal" class="text-muted"></span>
      </div>
      <div id="carteiraGrupos"></div>`;
  }
  _renderCarteiraGrupos();
}

function _renderCarteiraGrupos(){
  const alvo = document.getElementById('carteiraGrupos');
  if (!alvo) return;
  const busca = _norm(document.getElementById('carteiraBusca')?.value || '');
  // Acompanhamento: TODOS os carros ativos (não só os sem corredor), agrupados por origem
  let lista = (pedidosGlobais || []).filter(p =>
    !['Entregue','Cancelado'].includes(p.status || 'Pendente'));
  if (busca) lista = lista.filter(p =>
    _norm(`${p.cliente||''} ${p.cidadeOrigem||''} ${p.ufOrigem||''} ${p.cidadeDestino||''} ${p.ufDestino||''} ${p.placa||''} ${p.placaCegonha||''} #${p.id}`).includes(busca));

  const total = document.getElementById('carteiraTotal');
  if (total) total.textContent = `${lista.length} carro(s) em andamento`;

  const grupos = {};
  lista.forEach(p => { const k = `${p.cidadeOrigem || '—'}/${p.ufOrigem || ''}`; (grupos[k] = grupos[k] || []).push(p); });
  const chaves = Object.keys(grupos).sort((a,b) => grupos[b].length - grupos[a].length);

  if (chaves.length === 0){ alvo.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum carro em andamento. 👌</p>'; return; }

  _carteiraCache = grupos;
  _carteiraChaves = chaves;
  const podeJogar = ['logistica','admin','comercial'].includes(typeof perfilAtual!=='undefined'?perfilAtual:'');

  alvo.innerHTML = chaves.map((k, i) => {
    const itens = grupos[k];
    return `<div class="carteira-grupo">
      <div class="carteira-grupo-tit">📍 ${k} <span class="carteira-badge">${itens.length} carro(s)</span></div>
      <table class="corr-tabela">
        <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>${itens.map(p => {
          // Situação: mostra a cegonha quando alocado / transportando; ou o corredor direcionado
          let sit = _statusPill(p.status);
          if (p.placaCegonha){
            sit += ` <span class="corredor-tag-comrota" title="Cegonha alocada">🚛 ${p.placaCegonha}</span>`;
          } else if (p.rotaId || p.rota_id){
            sit += ` <span class="corredor-tag-comrota">alocado</span>`;
          } else {
            const cor = (typeof _corredorDoPedido === 'function') ? _corredorDoPedido(p) : null;
            if (cor){
              const manual = p.corredorManualId ? ' 📌' : '';
              sit += ` <span class="rd-corredor-tag" title="Direcionado para este corredor${p.corredorManualId ? ' (manual)' : ''}">➡️ ${cor.nome}${manual}</span>`;
            }
          }
          const jaAlocado = p.placaCegonha || p.rotaId || p.rota_id;
          return `<tr class="corr-tr">
          <td class="ct-id">#${p.id}</td>
          <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${typeof selCTEDoPedido==='function'?selCTEDoPedido(p.id):''}</td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
          <td class="ct-status">${sit}</td>
          <td class="ct-acoes">
            ${(podeJogar && !jaAlocado) ? `<button class="btn-kanban-patio" onclick="abrirJogarCorredor(${p.id})" title="Jogar num corredor">➡️</button>` : ''}
            ${podeJogar ? `<button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="${p.patioAtual ? 'No pátio de ' + p.patioAtual : 'Informar pátio'}">🅿️${p.patioAtual ? ' ' + p.patioAtual.split('/')[0] : ''}</button>` : ''}
            ${!podeJogar ? '<span class="text-muted">—</span>' : ''}
          </td>
        </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
}

// Verifica se um pedido já se encaixa em ALGUM corredor (automático ou manual)
function _pedidoEmAlgumCorredor(p){
  if (p.corredorManualId) return true;
  const seqs = (corredoresGlobais || []).map(c =>
    ((c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino]).filter(Boolean));
  const partida = p.patioAtual || p.cidadeOrigem;
  return seqs.some(seq => {
    const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
    const noPatio = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
    return (io !== -1 && id !== -1 && io < id) || (noPatio && id === -1);
  });
}

// Retorna o corredor (objeto) em que o pedido está: manual manda; senão o 1º que casa
function _corredorDoPedido(p){
  if (p.corredorManualId){
    return (corredoresGlobais||[]).find(c => String(c.id) === String(p.corredorManualId)) || null;
  }
  const partida = p.patioAtual || p.cidadeOrigem;
  return (corredoresGlobais||[]).find(c => {
    const seq = ((c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino]).filter(Boolean);
    const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
    const noPatio = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
    return (io !== -1 && id !== -1 && io < id) || (noPatio && id === -1);
  }) || null;
}

let _carteiraCache = {};
let _carteiraChaves = [];

function aplicarCarteiraRota(i){
  const chave = _carteiraChaves[i];
  const val = document.getElementById('carteiraSel_' + i)?.value || 'nova';
  if (val === 'nova') return criarRotaCarteira(chave);
  return adicionarCarteiraNaRota(chave, val);
}

// Vincula os carros do grupo a uma rota planejada JÁ EXISTENTE
async function adicionarCarteiraNaRota(chaveOrigem, rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('vincular à rota')) return;
  const itens = _carteiraCache[chaveOrigem];
  const rota = (rotasGlobais || []).find(r => String(r.id) === String(rotaId));
  if (!itens || !itens.length || !rota || !supabase) return;
  if (!confirm(`Adicionar os ${itens.length} carro(s) de ${chaveOrigem} à rota "${rota.nome || '#'+rota.id}"${rota.placa_cegonha ? ' (cegonha '+rota.placa_cegonha+')' : ''}?`)) return;
  try {
    const ids = itens.map(p => parseInt(p.id));
    const update = { rota_id: parseInt(rotaId) };
    // se a rota já tem cegonha, os carros entram como intenção agendada nela
    if (rota.placa_cegonha){ update.placa_cegonha = rota.placa_cegonha; update.status = 'Intenção Agendada'; }
    const { error } = await supabase.from('pedidos').update(update).in('id', ids);
    if (error) throw error;
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    renderizarCarteiraDemanda();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ ${ids.length} carro(s) de ${chaveOrigem} adicionados à rota "${rota.nome || '#'+rota.id}".`, 'success');
  } catch(e){
    alert('Erro ao adicionar à rota: ' + (e.message || e));
  }
}

async function criarRotaCarteira(chaveOrigem){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const itens = _carteiraCache[chaveOrigem];
  if (!itens || itens.length === 0 || !supabase) return;
  if (!confirm(`Criar uma rota com os ${itens.length} carro(s) de ${chaveOrigem}?\n\nDepois é só definir a cegonha na Gestão Logística.`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  // paradas = origem + destinos distintos (na ordem em que aparecem)
  const paradas = [];
  const push = c => { if (c && !paradas.some(x => x.toLowerCase() === c.toLowerCase())) paradas.push(c); };
  push((itens[0].cidadeOrigem || '').trim());
  itens.forEach(p => push((p.cidadeDestino || '').trim()));
  try {
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: `${chaveOrigem} → demanda`,
      paradas, status: 'planejada', criado_por: usuario
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');
    const ids = itens.map(p => parseInt(p.id));
    const { error: e2 } = await supabase.from('pedidos').update({ rota_id: rotaId }).in('id', ids);
    if (e2) throw e2;
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    renderizarCarteiraDemanda();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota criada com ${ids.length} carro(s) de ${chaveOrigem}. Defina a cegonha na Gestão Logística.`, 'success');
  } catch(e){
    alert('Erro ao criar rota: ' + (e.message || e));
  }
}

// ============================================================
// Painel de Corredores — cada corredor com seus pedidos compatíveis
// (espelha a lógica da planilha: faixas por corredor)
// ============================================================
let _corredoresAbertos = new Set();

function renderizarPainelCorredores(){
  const cont = document.getElementById('painelViewCorredores');
  if (!cont) return;
  const corredores = (corredoresGlobais || []).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));

  if (corredores.length === 0){
    cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum corredor cadastrado ainda. Cadastre em <strong>Cadastros → Corredores</strong> (ex.: Curitiba → Imbaú → Apucarana → Maringá).</p>';
    return;
  }

  // pedidos "vivos" (não entregues/cancelados) sem cegonha ainda
  // No corredor só aparecem carros que ainda PRECISAM ser roteirizados.
  // Assim que entram numa carga (cegonha) ou rota, saem do corredor.
  const vivos = (pedidosGlobais || []).filter(p =>
    !['Entregue','Cancelado'].includes(p.status || 'Pendente')
    && !p.placaCegonha
    && !(p.rotaId || p.rota_id));

  const podeVerSugestoes = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  cont.innerHTML = `
    ${podeVerSugestoes ? '<div id="sugestoesRotaWrap" class="sugestoes-wrap"></div>' : ''}
    <div class="carteira-topo">
      <input type="text" id="corredorBusca" class="ocup-busca" placeholder="🔍 Filtrar por cidade, cliente, placa..." oninput="renderizarPainelCorredores()" value="${(document.getElementById('corredorBusca')?.value||'').replace(/"/g,'&quot;')}">
      <span class="text-muted">${corredores.length} corredor(es)</span>
    </div>
    <div class="corredores-grid">
      ${corredores.map((c,ci) => _corredorCardHTML(c, vivos, ci)).join('')}
    </div>
    ${_carrosSemCorredorHTML(corredores, vivos)}`;
  if (podeVerSugestoes && typeof gerarSugestoesRota === 'function') gerarSugestoesRota();
  // inicializa os contadores de seleção de cada corredor aberto
  (corredores||[]).forEach(c => _atualizarContadorCorredor(String(c.id)));
}

// Diagnóstico: carros que não se encaixaram em NENHUM corredor (mostra o que o sistema lê)
function _carrosSemCorredorHTML(corredores, vivos){
  const seqs = corredores.map(c => ((c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino]).filter(Boolean));
  const encaixa = p => {
    const partida = p.patioAtual || p.cidadeOrigem;
    return seqs.some(seq => {
      const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
      const noPatioDoTronco = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id) || (noPatioDoTronco && id === -1);
    });
  };
  const orfaos = (vivos || []).filter(p => !encaixa(p) && !p.placaCegonha && !(p.rotaId||p.rota_id));
  if (orfaos.length === 0) return '';
  return `<div class="corredor-card" style="margin-top:14px">
    <div class="corredor-card-cab" onclick="toggleCorredorCard('__orfaos__')" style="cursor:pointer">
      <div><strong>🔍 Carros fora de qualquer corredor</strong> <span class="text-muted" style="margin-left:6px">(diagnóstico)</span></div>
      <div class="corredor-card-nums"><span class="corredor-semrota">${orfaos.length}</span><span class="corredor-chevron">${_corredoresAbertos.has('__orfaos__')?'▲':'▼'}</span></div>
    </div>
    ${_corredoresAbertos.has('__orfaos__') ? `<div class="corredor-pedidos">
      <p class="text-muted text-sm" style="padding:.3rem 0">O sistema tenta encaixar por <strong>pátio</strong> (se houver) ou <strong>origem</strong> → <strong>destino</strong>. Se a cidade não está nas paradas de nenhum corredor, o carro cai aqui. Confira a grafia ou use ➡️ para jogar num corredor.</p>
      <table class="corr-tabela">
        <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Cliente</th><th>Partida</th><th>Destino</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${orfaos.map(p => `<tr class="corr-tr">
          <td class="ct-id">#${p.id}</td>
          <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
          <td>${p.patioAtual ? '🅿️ '+p.patioAtual.split('/')[0] : (p.cidadeOrigem||'—')}</td>
          <td class="ct-rota"><strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-status">${_statusPill(p.status)}</td>
          <td class="ct-acoes">
            <button class="btn-kanban-patio" onclick="abrirJogarCorredor(${p.id})" title="Jogar num corredor">➡️</button>
            <button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="Informar pátio">🅿️</button>
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
  </div>`;
}

function _corredorCardHTML(c, vivos, ci){
  const seq = (c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino];
  const paradasStr = seq.filter(Boolean);
  const busca = _norm(document.getElementById('corredorBusca')?.value || '');

  // pedidos compatíveis: parte do PÁTIO ATUAL (se houver) ou da origem do pedido;
  // entra se partida→destino couber no corredor (ordem certa) ou for encaixe no caminho.
  let compat = vivos.filter(p => {
    // Corredor manual MANDA e é EXCLUSIVO: se o pedido foi jogado num corredor,
    // ele só aparece nele — some do encaixe automático de qualquer outro.
    if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
    const partida = p.patioAtual || p.cidadeOrigem; // pátio manda quando existe
    const io = _posNaSeq(paradasStr, partida);
    const id = _posNaSeq(paradasStr, p.cidadeDestino);
    const noPatioDoTronco = p.patioAtual && _posNaSeq(paradasStr, p.patioAtual) !== -1;
    return (io !== -1 && id !== -1 && io < id)   // partida e destino no trajeto, na ordem
        || (noPatioDoTronco && id === -1);       // no pátio do tronco, destino é ramal (transborda no hub)
  });
  if (busca) compat = compat.filter(p =>
    _norm(`${p.cliente||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} ${p.placa||''} #${p.id}`).includes(busca));

  const semRota = compat.filter(p => !(p.rotaId || p.rota_id) && !p.placaCegonha).length;
  _corredorCache[String(c.id)] = { nome: c.nome, seq: paradasStr, itens: compat };
  const podeCriar = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  const aberto = _corredoresAbertos.has(String(c.id));
  const paradasHTML = paradasStr.map((cid,i) =>
    `<span class="corredor-parada">${i+1}. ${cid}</span>`).join('<span class="rota-seta">→</span>');

  return `<div class="corredor-card">
    <div class="corredor-card-cab">
      <div onclick="toggleCorredorCard('${c.id}')" style="cursor:pointer;flex:1">
        <strong>🛣️ ${c.nome}</strong>
        <span class="text-muted" style="margin-left:8px">SLA ${c.sla_horas || '?'}h</span>
      </div>
      <div class="corredor-card-nums">
        <span class="carteira-badge">${compat.length} carro(s)</span>
        ${semRota > 0 ? `<span class="corredor-semrota">${semRota} sem rota</span>` : ''}
        <span class="corredor-chevron" onclick="toggleCorredorCard('${c.id}')" style="cursor:pointer">${aberto ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="corredor-paradas-linha">${paradasHTML}</div>
    ${aberto ? `<div class="corredor-pedidos">
      ${compat.length === 0 ? '<p class="text-muted text-sm" style="padding:.5rem 0">Nenhum pedido compatível no momento.</p>'
        : (function(){
            // ponto de divisão (hub) — padrão: destino mais comum; senão última parada
            const divKey = _corredorDivisao[String(c.id)] || _divisaoPadrao(compat, paradasStr);
            const divPos = _posNaSeq(paradasStr, divKey);
            const selDiv = `<div class="corredor-div-sel">🔀 Ponto de divisão (hub):
              <select onchange="_setDivisao('${c.id}', this.value)">
                ${paradasStr.map(cid => `<option value="${cid.replace(/"/g,'&quot;')}" ${_norm(cid)===_norm(divKey)?'selected':''}>${cid}</option>`).join('')}
              </select>
              <span class="text-muted" style="font-size:.76rem">— até aqui vão juntos; depois transbordam</span></div>`;

            const grupos = {};
            compat.forEach(p => { const d = p.cidadeDestino || '—'; (grupos[d] = grupos[d] || []).push(p); });
            const chaves = Object.keys(grupos).sort((a,b) => {
              const pa = _posNaSeq(paradasStr, a), pb = _posNaSeq(paradasStr, b);
              return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
            });
            const blocos = chaves.map(d => {
              const itens = grupos[d];
              const pos = _posNaSeq(paradasStr, d);
              let label, cls;
              if (pos === -1) { label = `🔀 Transbordam em ${divKey} → ${d} (ramal)`; cls = 'drop-transb'; }
              else if (pos > divPos) { label = `🔀 Transbordam em ${divKey} → ${d}`; cls = 'drop-transb'; }
              else { label = `📍 Descem em ${d}`; cls = 'drop-desce'; }
              return `<div class="corredor-drop ${cls}">
                <div class="corredor-drop-tit">${label} <span class="carteira-badge">${itens.length} carro(s)</span></div>
                <table class="corr-tabela">
                  <thead><tr>
                    <th></th><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Ações</th>
                  </tr></thead>
                  <tbody>${itens.map(p => _corredorPedidoLinha(p, c, paradasStr)).join('')}</tbody>
                </table>
              </div>`;
            }).join('');
            return selDiv + blocos;
          })()}
      ${(podeCriar && compat.length > 0) ? `
      <div class="corredor-selbar">
        <span id="corrCont_${c.id}" class="corredor-cont"></span>
        <span class="corredor-selbtns">
          <button class="btn btn-sm btn-secondary" onclick="_selecTodosCorredor('${c.id}', true)">Todos</button>
          <button class="btn btn-sm btn-secondary" onclick="_selecTodosCorredor('${c.id}', false)">Limpar</button>
          <button class="btn btn-sm btn-primary" onclick="criarRotaDoCorredorSelec('${c.id}')">🛣️ Criar rota com selecionados</button>
        </span>
      </div>` : ''}
    </div>` : ''}
  </div>`;
}

function _corredorPedidoLinha(p, c, paradasStr){
  const semR = !(p.rotaId || p.rota_id) && !p.placaCegonha;
  const ehManual = String(p.corredorManualId || '') === String(c.id);
  const podeAgir = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  const rotaTag = semR
    ? '<span class="corredor-tag-semrota">sem rota</span>'
    : `<span class="corredor-tag-comrota">🚛 ${p.placaCegonha||'em rota'}</span>`;
  const frete = Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  return `<tr class="corr-tr">
    <td>${podeAgir ? `<input type="checkbox" class="corr-check" data-corr="${c.id}" value="${p.id}" ${semR ? 'checked' : ''} onchange="_atualizarContadorCorredor('${c.id}')">` : ''}</td>
    <td class="ct-id">#${p.id}</td>
    <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${typeof selCTEDoPedido==='function' ? selCTEDoPedido(p.id) : ''}</td>
    <td class="ct-modelo">${p.modelo||'—'}</td>
    <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
    <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
    <td class="ct-frete">R$ ${frete}</td>
    <td class="ct-status">${_statusPill(p.status)} ${rotaTag}</td>
    <td class="ct-acoes">
      ${podeAvancarPedido(p) ? `<button class="btn-kanban-patio" onclick="abrirModalStatus(${p.id})" title="Avançar status">▶</button>` : ''}
      ${podeAgir ? `
      ${ehManual
        ? `<button class="btn-kanban-patio" onclick="tirarDoCorredorManual(${p.id})" title="Tirar deste corredor">✕</button>`
        : `<button class="btn-kanban-patio" onclick="abrirJogarCorredor(${p.id})" title="Jogar em outro corredor">➡️</button>`}
      <button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="${p.patioAtual ? 'No pátio de ' + p.patioAtual : 'Informar pátio'}">🅿️</button>` : ''}
      ${(!podeAvancarPedido(p) && !podeAgir) ? '<span class="text-muted">—</span>' : ''}
    </td>
  </tr>`;
}

function toggleCorredorCard(id){
  const k = String(id);
  if (_corredoresAbertos.has(k)) _corredoresAbertos.delete(k);
  else _corredoresAbertos.add(k);
  renderizarPainelCorredores();
}

// Cria a rota de um corredor já com os carros sem rota compatíveis
let _corredorCache = {};
async function criarRotaDoCorredor(corredorId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const dados = _corredorCache[String(corredorId)];
  if (!dados || !dados.itens || dados.itens.length === 0 || !supabase) return;
  if (!confirm(`Criar a rota "${dados.nome}" e alocar ${dados.itens.length} carro(s) sem rota deste corredor?`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: dados.nome,
      corredor_id: parseInt(corredorId) || null,
      paradas: dados.seq || [],
      status: 'planejada',
      criado_por: usuario
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');
    const ids = dados.itens.map(p => parseInt(p.id));
    const { error: e2 } = await supabase.from('pedidos').update({ rota_id: rotaId }).in('id', ids);
    if (e2) throw e2;
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota "${dados.nome}" criada com ${ids.length} carro(s). Defina a cegonha na Gestão Logística.`, 'success');
  } catch(e){
    alert('Erro ao criar rota: ' + (e.message || e));
  }
}

// ============================================================
// Jogar/tirar um pedido manualmente de um corredor
// ============================================================
function abrirJogarCorredor(pedidoId){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['logistica','admin','comercial'].includes(perfil)){ alert('Você não tem permissão para mover para um corredor.'); return; }
  const corredores = (corredoresGlobais || []).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  if (corredores.length === 0){ alert('Nenhum corredor cadastrado.'); return; }
  const opcoes = corredores.map((c,i) => `${i+1}. ${c.nome}`).join('\n');
  const escolha = prompt(`Jogar o pedido #${pedidoId} em qual corredor?\n\n${opcoes}\n\nDigite o número:`);
  if (!escolha) return;
  const idx = parseInt(escolha) - 1;
  const cor = corredores[idx];
  if (!cor){ alert('Opção inválida.'); return; }
  _setCorredorManual(pedidoId, cor.id);
}
function tirarDoCorredorManual(pedidoId){
  _setCorredorManual(pedidoId, null);
}
async function _setCorredorManual(pedidoId, corredorId){
  try {
    const { error } = await supabase.from('pedidos').update({ corredor_manual_id: corredorId }).eq('id', parseInt(pedidoId));
    if (error) throw error;
    const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
    if (p) p.corredorManualId = corredorId;
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof renderizarCarteiraDemanda === 'function') renderizarCarteiraDemanda();
  } catch(e){ alert('Erro ao mover para o corredor: ' + (e.message||e)); }
}

// ============================================================
// Ponto de divisão (hub) do corredor — didático tronco+ramificações
// ============================================================
let _corredorDivisao = {}; // corredorId -> cidade do hub (escolha em memória)
function _setDivisao(corredorId, cidade){
  _corredorDivisao[String(corredorId)] = cidade;
  if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
}
// padrão do hub: o destino mais comum entre os carros; senão a última parada
function _divisaoPadrao(compat, paradasStr){
  const cont = {};
  (compat||[]).forEach(p => { const d = p.cidadeDestino; if (d && _posNaSeq(paradasStr, d) !== -1) cont[d] = (cont[d]||0)+1; });
  let melhor = null, max = 0;
  Object.entries(cont).forEach(([d,n]) => { if (n > max){ max = n; melhor = d; } });
  return melhor || paradasStr[paradasStr.length-1] || '';
}

// ============================================================
// Seleção de carros no corredor + criar rota com os selecionados
// ============================================================
function _checksCorredor(corredorId){
  return Array.from(document.querySelectorAll(`.corr-check[data-corr="${corredorId}"]`));
}
function _atualizarContadorCorredor(corredorId){
  const cont = document.getElementById('corrCont_' + corredorId);
  if (!cont) return;
  const marcados = _checksCorredor(corredorId).filter(c => c.checked).length;
  const cap = 11; // referência da cegonha (guincho pode ser menos) — só aviso
  const excede = marcados > cap;
  cont.innerHTML = `<strong class="${excede ? 'cont-excede' : ''}">${marcados}</strong> carro(s) selecionado(s)` +
    (excede ? ` <span class="cont-excede">⚠️ acima de ${cap} (capacidade da cegonha) — pode criar mesmo assim</span>` : '');
}
function _selecTodosCorredor(corredorId, valor){
  _checksCorredor(corredorId).forEach(c => { c.checked = valor; });
  _atualizarContadorCorredor(corredorId);
}
async function criarRotaDoCorredorSelec(corredorId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const dados = _corredorCache[String(corredorId)];
  if (!dados || !supabase) return;
  const ids = _checksCorredor(corredorId).filter(c => c.checked).map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um carro.'); return; }
  // Abre modal para escolher a cegonha (motorista padrão vem junto)
  _corridorRotaCtx = { corredorId, ids, nome: dados.nome, seq: dados.seq || [] };
  const cegonhas = (veiculosGlobais||[]).filter(v => (v.tipo === 'cegonha' || v.categoria === 'cegonha' || (v.capacidade||0) > 1) && v.ativo !== false);
  const old = document.getElementById('modalCriarRotaCorr'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalCriarRotaCorr';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const aviso = ids.length > 11 ? `<p class="cont-excede" style="margin:.3rem 0">⚠️ ${ids.length} carros (acima de 11). Se for guincho/carga maior, tudo bem.</p>` : '';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">🛣️ Criar rota — ${dados.nome}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${ids.length} carro(s) selecionado(s). Escolha a cegonha — o motorista padrão dela já vem junto (pode trocar).</p>
      ${aviso}
      <div class="form-group">
        <label>Cegonha / Guincho</label>
        <select id="rotaCorrCegonha" onchange="_rotaCorrPreencheMotorista()">
          <option value="">— sem cegonha por enquanto —</option>
          ${cegonhas.map(v => `<option value="${v.placa}" data-mot="${(v.motorista_padrao||'').replace(/"/g,'&quot;')}">${v.placa}${v.modelo?' · '+v.modelo:''}${v.motorista_padrao?' · 👤 '+v.motorista_padrao:''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Motorista</label>
        <input type="text" id="rotaCorrMotorista" placeholder="Motorista da viagem" list="listaMotoristasRotaCorr">
        <datalist id="listaMotoristasRotaCorr">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" onclick="_confirmarCriarRotaCorr()">✅ Criar rota</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalCriarRotaCorr').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

let _corridorRotaCtx = null;
function _rotaCorrPreencheMotorista(){
  const sel = document.getElementById('rotaCorrCegonha');
  const opt = sel?.options[sel.selectedIndex];
  const mot = opt?.getAttribute('data-mot') || '';
  const inp = document.getElementById('rotaCorrMotorista');
  if (inp) inp.value = mot;  // motorista padrão da cegonha
}

async function _confirmarCriarRotaCorr(){
  const ctx = _corridorRotaCtx;
  if (!ctx || !supabase) return;
  const cegonha = document.getElementById('rotaCorrCegonha')?.value || null;
  const motorista = document.getElementById('rotaCorrMotorista')?.value.trim() || null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: ctx.nome, corredor_id: parseInt(ctx.corredorId) || null,
      paradas: ctx.seq, status: 'planejada', criado_por: usuario,
      placa_cegonha: cegonha, motorista_1: motorista, percent_motorista_1: motorista ? 100 : null
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');
    // vincula pedidos; se tem cegonha, já entra como Intenção Agendada com a cegonha/motorista
    const upd = { rota_id: rotaId };
    if (cegonha){ upd.placa_cegonha = cegonha; upd.status = 'Intenção Agendada'; if (motorista) upd.motorista_1 = motorista; }
    const { error: e2 } = await supabase.from('pedidos').update(upd).in('id', ctx.ids);
    if (e2) throw e2;
    document.getElementById('modalCriarRotaCorr')?.remove();
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota "${ctx.nome}" criada com ${ctx.ids.length} carro(s)${cegonha ? ' na cegonha '+cegonha+(motorista?' · '+motorista:'') : ''}.`, 'success');
  } catch(e){ alert('Erro ao criar rota: ' + (e.message || e)); }
}

// Decide se o perfil ATUAL pode avançar ESTE pedido (respeita o dono da etapa
// e a regra do pedido feito pela logística, que pula a confirmação do comercial).
function podeAvancarPedido(p){
  const cfg = FLUXO_STATUS[p.status || 'Pendente'];
  if (!cfg || !cfg.proximos || cfg.proximos.length === 0) return false;
  const viewer = (typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
  if (viewer === 'admin' || (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())) return true;
  let dono = (cfg.perfis || []).filter(x => x !== 'admin')[0] || 'logistica';
  // pedido feito pela logística: ela conduz, o comercial não confirma
  if (p.origemLancamento === 'logistica' && dono === 'comercial') dono = 'logistica';
  return viewer === dono;
}

// Pílula de status com a cor oficial do fluxo (igual ao painel)
function _statusPill(status){
  const s = status || 'Pendente';
  const cor = (typeof FLUXO_STATUS !== 'undefined' && FLUXO_STATUS[s]?.cor) || '#888';
  return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${s}</span>`;
}

// ============================================================
// Aba "Avançar Pedidos" — esteira por status (logística)
// Lista tudo que pode avançar, agrupado por status, com 1 clique.
// O botão abre o fluxo de status já validado (abrirModalStatus).
// ============================================================
function renderizarAvancarPedidos(){
  const cont = document.getElementById('painelViewAvancar');
  if (!cont) return;
  const podeAgir = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  // Todos veem a lista (para acompanhar); só logística/admin tem o botão de avançar.
  const vivos = (pedidosGlobais || []).filter(p => {
    const cfg = FLUXO_STATUS[p.status || 'Pendente'];
    return cfg && cfg.proximos && cfg.proximos.length > 0 && !['Entregue','Cancelado'].includes(p.status||'Pendente');
  });

  const busca = _norm(document.getElementById('avancarBusca')?.value || '');
  let lista = vivos;
  if (busca) lista = lista.filter(p =>
    _norm(`${p.cliente||''} ${p.placa||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} #${p.id}`).includes(busca));

  // agrupa por status atual, na ordem do fluxo
  const grupos = {};
  lista.forEach(p => { const s = p.status || 'Pendente'; (grupos[s] = grupos[s] || []).push(p); });
  const ordem = ['Pendente','Intenção Agendada','Aguardando Confirmação','Em Coleta','Em Transporte','Transbordo'];
  const chaves = Object.keys(grupos).sort((a,b) => ordem.indexOf(a) - ordem.indexOf(b));

  cont.innerHTML = `
    <p class="text-muted" style="margin:.2rem 0 .8rem;font-size:.85rem">▶️ Tudo que está esperando um próximo passo, agrupado por status. Clique em <strong>Avançar</strong> para levar o pedido à próxima etapa.</p>
    <div class="carteira-topo">
      <input type="text" id="avancarBusca" class="ocup-busca" placeholder="🔍 Filtrar por cliente, placa, cidade..." oninput="renderizarAvancarPedidos()" value="${busca.replace(/"/g,'&quot;')}">
      <span class="text-muted">${lista.length} pedido(s) para avançar</span>
    </div>
    ${chaves.length === 0 ? '<p class="text-muted" style="padding:1rem 0">Nada para avançar agora. 👌</p>' : chaves.map(s => {
      const itens = grupos[s];
      const prox = (FLUXO_STATUS[s]?.proximos || []).join(' / ');
      return `<div class="carteira-grupo">
        <div class="carteira-grupo-tit">${_statusPill(s)} <span class="text-muted" style="font-size:.8rem">→ ${prox}</span> <span class="carteira-badge">${itens.length}</span></div>
        <table class="corr-tabela">
          <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Cegonha</th><th></th></tr></thead>
          <tbody>${itens.map(p => `<tr class="corr-tr">
            <td class="ct-id">#${p.id}</td>
            <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
            <td class="ct-modelo">${p.modelo||'—'}</td>
            <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
            <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
            <td class="ct-modelo">${p.placaCegonha || '—'}</td>
            <td class="ct-acoes">${podeAvancarPedido(p) ? `<button class="btn btn-primary btn-sm" onclick="abrirModalStatus(${p.id})">▶ Avançar</button>` : '<span class="text-muted">acompanhando</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    }).join('')}`;
}

// ============================================================
// Módulo de Cobrança — comercial marca; financeiro confirma
// Estados: a_cobrar -> cobrado -> pago -> confirmado
// ============================================================
let _cobFiltro = '';
const _COB_LABEL = { a_cobrar:'A cobrar', cobrado:'Cobrado', pago:'Pago', confirmado:'Confirmado' };
const _COB_COR   = { a_cobrar:'#fbbf24', cobrado:'#60a5fa', pago:'#a78bfa', confirmado:'#4ade80' };

function filtrarCobranca(status, btn){
  _cobFiltro = status;
  document.querySelectorAll('.cobranca-filtros .ocup-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderizarCobranca();
}

function _cobPill(st){
  const s = st || 'a_cobrar';
  const cor = _COB_COR[s] || '#888';
  return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${_COB_LABEL[s]||s}</span>`;
}

function renderizarCobranca(){
  const wrap = document.getElementById('cobrancaWrap');
  if (!wrap) return;
  const ehFinanceiro = ['financeiro','admin'].includes(typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
  const ehComercial  = ['comercial','admin'].includes(typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
  const busca = _norm(document.getElementById('cobrancaBusca')?.value || '');

  // só pedidos que já geram receita (entregues ou com frete definido), não cancelados
  let lista = (pedidosGlobais || []).filter(p => (p.status !== 'Cancelado') && Number(p.valorFrete||0) > 0);
  if (_cobFiltro) lista = lista.filter(p => (p.cobrancaStatus||'a_cobrar') === _cobFiltro);
  if (busca) lista = lista.filter(p =>
    _norm(`${p.cliente||''} ${p.placa||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} #${p.id}`).includes(busca));

  // resumo por status
  const soma = {};
  (pedidosGlobais||[]).filter(p => p.status!=='Cancelado' && Number(p.valorFrete||0)>0)
    .forEach(p => { const s = p.cobrancaStatus||'a_cobrar'; soma[s] = (soma[s]||0) + Number(p.valorFrete||0); });
  const resumo = ['a_cobrar','cobrado','pago','confirmado'].map(s =>
    `<span class="cob-resumo-item">${_cobPill(s)} R$ ${Number(soma[s]||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`).join('');

  // Alerta de atrasadas: entregue há +15 dias e ainda não confirmado (mesma régua da Conferência de Receitas)
  const ATRASO = 15;
  const atrasadas = (pedidosGlobais||[]).filter(p => {
    if (p.status !== 'Entregue') return false;
    if ((p.cobrancaStatus||'a_cobrar') === 'confirmado' || p.receitaConfirmada) return false;
    const d = p.dataEntregaReal || p.data_entrega_real || p.dataSolicitacao;
    return d && (Date.now() - new Date(d).getTime())/86400000 >= ATRASO;
  });
  const totalAtras = atrasadas.reduce((s,p)=>s+Number(p.valorFrete||0),0);
  const alertaAtraso = atrasadas.length
    ? `<span class="cob-resumo-item" style="color:#f87171"><strong>⚠️ ${atrasadas.length} atrasada(s) (+${ATRASO}d)</strong> R$ ${totalAtras.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`
    : '';

  if (lista.length === 0){ wrap.innerHTML = `<div class="cob-resumo">${resumo}${alertaAtraso}</div><p class="text-muted" style="padding:1rem 0">Nenhum pedido nesse filtro.</p>`; return; }

  lista.sort((a,b) => b.id - a.id);

  wrap.innerHTML = `<div class="cob-resumo">${resumo}${alertaAtraso}</div>
    <table class="corr-tabela">
      <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Cliente</th><th>Origem → Destino</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>${lista.map(p => {
        const st = p.cobrancaStatus || 'a_cobrar';
        let acoes = '';
        // Comercial conduz até "pago"; Financeiro confirma
        if (ehComercial && st === 'a_cobrar') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'cobrado')">Marcar cobrado</button>`;
        if (ehComercial && st === 'cobrado') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'pago')">Marcar pago</button>`;
        if (ehFinanceiro && st === 'pago') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'confirmado')">✅ Confirmar recebimento</button>`;
        if ((ehComercial || ehFinanceiro) && st !== 'a_cobrar') acoes += `<button class="btn btn-sm btn-secondary" onclick="marcarCobranca(${p.id},'_voltar')" title="Voltar um passo">↩️</button>`;
        return `<tr class="corr-tr">
          <td class="ct-id">#${p.id}</td>
          <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
          <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-frete">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td class="ct-status">${_cobPill(st)}</td>
          <td class="ct-acoes">${acoes || '<span class="text-muted">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

async function marcarCobranca(pedidoId, novo){
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  if (!p || !supabase) return;
  const fluxo = ['a_cobrar','cobrado','pago','confirmado'];
  let alvo = novo;
  if (novo === '_voltar'){
    const i = fluxo.indexOf(p.cobrancaStatus||'a_cobrar');
    alvo = fluxo[Math.max(0, i-1)];
  }
  const usuario = document.getElementById('usuarioLogado')?.textContent || '';
  const upd = { cobranca_status: alvo };
  const agora = new Date().toISOString();
  if (alvo === 'cobrado'){ upd.cobrado_em = agora; upd.cobrado_por = usuario; }
  if (alvo === 'pago'){ upd.pago_em = agora; upd.pago_por = usuario; }
  if (alvo === 'confirmado'){ upd.pagto_confirmado_em = agora; upd.pagto_confirmado_por = usuario;
    // Sincroniza com a Conferência de Receitas (mesma verdade: dinheiro recebido)
    upd.receita_confirmada = true; upd.receita_confirmada_em = agora; upd.receita_confirmada_por = usuario;
  }
  try {
    const { error } = await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    if (error) throw error;
    p.cobrancaStatus = alvo;
    renderizarCobranca();
  } catch(e){ alert('Erro ao atualizar cobrança: ' + (e.message||e)); }
}

// ============================================================
// Inserir qualquer carro disponível numa rota (frete de última hora)
// ============================================================
function abrirInserirCarroRota(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('inserir carro na rota')) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return;
  const old = document.getElementById('modalInserirCarro');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalInserirCarro';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:640px;width:92%;max-height:82vh;overflow:auto;border-radius:14px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h2 style="margin:0">➕ Inserir carro na rota "${rota.nome||('#'+rota.id)}"</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalInserirCarro').remove()">✕</button>
      </div>
      <p class="text-muted" style="font-size:.84rem;margin:.2rem 0 .8rem">Adicione qualquer carro disponível (sem cegonha e sem rota), mesmo que não case com o caminho. Útil para frete de última hora.</p>
      <input type="text" id="inserirCarroBusca" class="ocup-busca" placeholder="🔍 Buscar cliente, placa, cidade..." oninput="_renderInserirCarroLista(${rotaId})" style="width:100%;margin-bottom:10px">
      <div id="inserirCarroLista"></div>
    </div>`;
  document.body.appendChild(div);
  _renderInserirCarroLista(rotaId);
}

function _renderInserirCarroLista(rotaId){
  const alvo = document.getElementById('inserirCarroLista');
  if (!alvo) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  const busca = _norm(document.getElementById('inserirCarroBusca')?.value || '');
  // TODOS os carros ativos (não entregues/cancelados) — inclusive os que já estão em outra carga
  let disp = (pedidosGlobais||[]).filter(p =>
    !['Entregue','Cancelado'].includes(p.status||'Pendente') &&
    !(rota && p.placaCegonha === rota.placa_cegonha)); // já está nesta cegonha
  if (busca) disp = disp.filter(p =>
    _norm(`${p.cliente||''} ${p.placa||''} ${p.modelo||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} #${p.id}`).includes(busca));
  disp.sort((a,b)=>b.id-a.id);
  if (disp.length === 0){ alvo.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum carro disponível.</p>'; return; }
  alvo.innerHTML = `<table class="corr-tabela">
    <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Carga atual</th><th></th></tr></thead>
    <tbody>${disp.slice(0,80).map(p => {
      const emCarga = p.placaCegonha;
      const cargaTxt = emCarga
        ? `<span class="cob-aviso-carga" title="Já está nesta cegonha — será movido (troca de seguro)">⚠️ ${p.placaCegonha}</span>`
        : '<span class="text-muted">livre</span>';
      return `<tr class="corr-tr">
        <td class="ct-id">#${p.id}</td>
        <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${selCTEDoPedido(p.id)}</td>
        <td class="ct-modelo">${p.modelo||'—'}</td>
        <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
        <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
        <td>${cargaTxt}</td>
        <td class="ct-acoes"><button class="btn btn-primary btn-sm" onclick="_inserirCarroNaRota(${p.id}, ${rotaId})">${emCarga ? '🔄 Mover' : '+ Adicionar'}</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

async function _inserirCarroNaRota(pedidoId, rotaId){
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  if (!rota || !p || !supabase) return;
  const cegonhaAntiga = p.placaCegonha || null;
  const cegonhaNova = rota.placa_cegonha || null;
  const cte = cteInfoDoPedido(pedidoId);

  // Se troca de cegonha, confirma mostrando a transição (troca de seguro)
  if (cegonhaAntiga && cegonhaNova && cegonhaAntiga !== cegonhaNova){
    const msgCte = cte ? `\n\n🧾 CTe${cte.numero ? ' nº '+cte.numero : ''} já emitido — será MANTIDO (não emite novo). Só muda o manifesto.` : '';
    if (!confirm(`Mover o carro #${pedidoId} de cegonha?\n\n${cegonhaAntiga}  →  ${cegonhaNova}  (troca de seguro)${msgCte}`)) return;
  }

  try {
    const update = { rota_id: rotaId };
    if (cegonhaNova){
      update.placa_cegonha = cegonhaNova;
      // Se a rota já está em andamento, o carro entra direto em trânsito; senão, Intenção Agendada
      update.status = (rota.status === 'em_andamento') ? 'Em Transporte' : 'Intenção Agendada';
    }
    const { error } = await supabase.from('pedidos').update(update).eq('id', parseInt(pedidoId));
    if (error) throw error;

    // Histórico da troca de seguro / inserção
    let obs;
    if (cegonhaAntiga && cegonhaNova && cegonhaAntiga !== cegonhaNova){
      obs = `🔄 Troca de cegonha (seguro): ${cegonhaAntiga} → ${cegonhaNova}` + (cte ? ` · 🧾 CTe${cte.numero ? ' nº '+cte.numero : ''} mantido (só muda o manifesto)` : '');
    } else {
      obs = `➕ Inserido na rota "${rota.nome || '#'+rota.id}"${cegonhaNova ? ' — cegonha ' + cegonhaNova : ''}`;
    }
    try { await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: update.status || p.status,
      usuario_nome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
      usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica', observacao: obs
    }); } catch(_){}

    await carregarDadosDoSupabase();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    _renderInserirCarroLista(rotaId);
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ ${obs}`, 'success');
  } catch(e){ alert('Erro ao inserir/mover: ' + (e.message||e)); }
}

// ============================================================
// EQUIPES DE COLETA & ENTREGA (last mile das duas pontas)
// ============================================================

// Chegada em lote: seleciona carros e marca "entregue pelo motorista" ou "vai pro pátio".
// Quando todos os carros da rota tiverem chegada registrada, a rota é concluída.
function abrirRegistrarChegada(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('registrar chegada')) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return;
  const carros = (pedidosGlobais||[]).filter(p =>
    String(p.rotaId || p.rota_id) === String(rotaId) &&
    !['Entregue','Cancelado'].includes(p.status||'Pendente'));
  const old = document.getElementById('modalChegada'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalChegada';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const linhas = carros.length ? carros.map(p => `
    <tr class="corr-tr">
      <td><input type="checkbox" class="cheg-check" value="${p.id}" checked></td>
      <td class="ct-id">#${p.id}</td>
      <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
      <td class="ct-modelo">${p.modelo||'—'}</td>
      <td class="ct-rota">→ <strong>${p.cidadeDestino||'—'}</strong></td>
      <td class="ct-cli">${p.cliente||'—'}</td>
    </tr>`).join('') : '';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:680px;width:94%;max-height:86vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="margin:0">🏁 Registrar chegada — ${rota.nome || ('#'+rota.id)}</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalChegada').remove()">✕</button>
      </div>
      ${carros.length === 0 ? '<p class="text-muted" style="padding:1rem 0">Todos os carros desta rota já chegaram. Pode concluir a rota.</p>' : `
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">Selecione os carros e escolha o destino da chegada. Quando todos chegarem, a rota é concluída automaticamente.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="_chegSelTodos(true)">Selecionar todos</button>
        <button class="btn btn-secondary btn-sm" onclick="_chegSelTodos(false)">Limpar</button>
        <span id="chegCont" class="text-muted" style="margin-left:auto"></span>
      </div>
      <table class="corr-tabela">
        <thead><tr><th></th><th>ID</th><th>Placa</th><th>Modelo</th><th>Destino</th><th>Cliente</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-primary" style="flex:1;min-width:220px;padding:13px" onclick="_aplicarChegada(${rotaId}, 'motorista')">
          ✅ Entregue pelo motorista<br><span style="font-size:.76rem;opacity:.85">Finaliza os selecionados</span>
        </button>
        <button class="btn btn-secondary" style="flex:1;min-width:220px;padding:13px" onclick="_aplicarChegada(${rotaId}, 'patio')">
          🅿️ Vai ficar no pátio<br><span style="font-size:.76rem;opacity:.85">Equipe local entrega depois</span>
        </button>
      </div>`}
    </div>`;
  document.body.appendChild(div);
  _chegAtualizaCont();
}

function _chegSelTodos(v){ document.querySelectorAll('.cheg-check').forEach(c => c.checked = v); _chegAtualizaCont(); }
function _chegAtualizaCont(){
  const n = document.querySelectorAll('.cheg-check:checked').length;
  const el = document.getElementById('chegCont'); if (el) el.textContent = `${n} selecionado(s)`;
}
document.addEventListener('change', e => { if (e.target && e.target.classList?.contains('cheg-check')) _chegAtualizaCont(); });

async function _aplicarChegada(rotaId, modo){
  const ids = Array.from(document.querySelectorAll('.cheg-check:checked')).map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um carro.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    for (const id of ids){
      const p = (pedidosGlobais||[]).find(x => String(x.id) === String(id));
      if (!p) continue;
      let upd, obs, novo;
      if (modo === 'motorista'){
        novo = 'Entregue';
        upd = { status: 'Entregue', fluxo_entrega: 'direta' };
        obs = `✅ Entregue pelo motorista direto no cliente (${p.cidadeDestino||''}).`;
      } else {
        const cidade = `${p.cidadeDestino}${p.ufDestino ? '/'+p.ufDestino : ''}`;
        novo = 'Em Transporte';
        upd = { patio_atual: cidade, patio_desde: new Date().toISOString(), placa_cegonha: null, rota_id: null, status: 'Em Transporte' };
        obs = `📍 Chegou em ${cidade} — no pátio para entrega pela equipe local.`;
      }
      await supabase.from('pedidos').update(upd).eq('id', id);
      try { await supabase.from('historico_status').insert({
        pedido_id: id, status_anterior: p.status, status_novo: novo,
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'), observacao: obs
      }); } catch(_){}
    }
    // Recarrega e verifica se a rota ainda tem carros pendentes de chegada
    await carregarDadosDoSupabase();
    const restantes = (pedidosGlobais||[]).filter(p =>
      String(p.rotaId || p.rota_id) === String(rotaId) &&
      !['Entregue','Cancelado'].includes(p.status||'Pendente'));
    if (restantes.length === 0){
      try { await mudarStatusRota(rotaId, 'concluida'); } catch(_){}
      document.getElementById('modalChegada')?.remove();
      if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `🏁 Todos chegaram — rota concluída.`, 'success');
    } else {
      abrirRegistrarChegada(rotaId); // reabre com os que faltam
      if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ ${ids.length} carro(s) registrados. Faltam ${restantes.length}.`, 'success');
    }
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof renderizarEquipesPainel === 'function') renderizarEquipesPainel();
  } catch(e){ alert('Erro ao registrar chegada: '+(e.message||e)); }
}

// Normaliza cidade (ignora /UF)
function _cidadeIgual(a, b){
  const norm = s => (s||'').toString().split('/')[0].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return a && b && norm(a) === norm(b);
}

// Carros "a coletar" por uma equipe: coleta na cidade base, ainda não no pátio nem coletados
function _aColetarDaEquipe(eq){
  return (pedidosGlobais||[]).filter(p =>
    !['Entregue','Cancelado'].includes(p.status||'Pendente') &&
    !p.coletaEquipeEm && !p.patioAtual &&
    _cidadeIgual(p.cidadeOrigem, eq.cidade_base));
}

// Carros "a entregar" por uma equipe: destino na cidade base, já no pátio da cidade, não entregues
function _aEntregarDaEquipe(eq){
  return (pedidosGlobais||[]).filter(p =>
    p.status !== 'Cancelado' && !p.entregaEquipeEm &&
    _cidadeIgual(p.cidadeDestino, eq.cidade_base) &&
    p.patioAtual && _cidadeIgual(p.patioAtual, eq.cidade_base));
}

// Feitas: coletadas ou entregues por esta equipe
function _feitasDaEquipe(eq){
  return (pedidosGlobais||[]).filter(p =>
    (p.coletaEquipeEm && _cidadeIgual(p.cidadeOrigem, eq.cidade_base)) ||
    (p.entregaEquipeEm && _cidadeIgual(p.cidadeDestino, eq.cidade_base)));
}

let _equipeAba = {}; // id -> 'coletar'|'entregar'|'feitas'

function renderizarEquipesPainel(){
  const cont = document.getElementById('equipesPainelWrap');
  if (!cont) return;
  let equipes = (equipesEntregaGlobais||[]).filter(e => e.ativo !== false);
  // Se o usuário é do perfil "equipe", vê só a equipe dele
  if ((typeof perfilAtual !== 'undefined' && perfilAtual === 'equipe') && window._equipeIdLogada){
    equipes = equipes.filter(e => String(e.id) === String(window._equipeIdLogada));
  }
  if (equipes.length === 0){
    cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhuma equipe cadastrada. Cadastre em <strong>Cadastros → Equipes</strong>, definindo a cidade base.</p>';
    return;
  }
  const podeAgir = (typeof podeAgirEquipe === 'function' && podeAgirEquipe());
  cont.innerHTML = equipes.map(eq => {
    const semCidade = !eq.cidade_base;
    const coletar = semCidade ? [] : _aColetarDaEquipe(eq);
    const entregar = semCidade ? [] : _aEntregarDaEquipe(eq);
    const feitas = semCidade ? [] : _feitasDaEquipe(eq);
    const aba = _equipeAba[eq.id] || 'coletar';
    const membros = (eq.membros||'').split(',').map(s=>s.trim()).filter(Boolean);

    const linha = (p, tipo) => {
      const selMembro = membros.length
        ? `<select id="mb_${tipo}_${p.id}" class="eq-membro-sel">${membros.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>`
        : '';
      let btn = '';
      if (podeAgir && tipo === 'coletar') btn = `<button class="btn btn-sm btn-primary" onclick="marcarColetaEquipe(${p.id}, ${eq.id})">✓ Coletado (no pátio)</button>`;
      if (podeAgir && tipo === 'entregar') btn = `<button class="btn btn-sm btn-primary" onclick="marcarEntregaEquipe(${p.id}, ${eq.id})">✓ Entregue</button>`;
      const info = tipo === 'feitas'
        ? `<span class="text-muted">${p.entregaEquipeEm ? '📤 entregue por '+(p.entregaEquipePor||'—') : '📥 coletado por '+(p.coletaEquipePor||'—')}</span>`
        : '';
      return `<tr class="corr-tr">
        <td class="ct-id">#${p.id}</td>
        <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${selCTEDoPedido(p.id)}</td>
        <td class="ct-modelo">${p.modelo||'—'}</td>
        <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
        <td class="ct-cli"><strong>${p.cliente||'—'}</strong></td>
        <td class="ct-acoes">${info}${selMembro} ${btn}</td>
      </tr>`;
    };

    const tabela = (itens, tipo, vazio) => itens.length === 0
      ? `<p class="text-muted" style="padding:.6rem 0">${vazio}</p>`
      : `<table class="corr-tabela"><thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th></th></tr></thead><tbody>${itens.map(p=>linha(p,tipo)).join('')}</tbody></table>`;

    return `<div class="corredor-card" style="margin-bottom:16px">
      <div class="corredor-card-cab">
        <div>
          <strong>🧑‍🔧 ${eq.nome}</strong>
          ${eq.cidade_base ? `<span class="carteira-badge">📍 ${eq.cidade_base}${eq.uf_base?'/'+eq.uf_base:''}</span>` : '<span class="corredor-tag-semrota">defina a cidade base em Cadastros</span>'}
          ${eq.responsavel ? `<span class="text-muted" style="font-size:.8rem"> · resp. ${eq.responsavel}</span>` : ''}
        </div>
        <div style="font-size:.82rem" class="text-muted">📥 ${coletar.length} a coletar · 📤 ${entregar.length} a entregar</div>
      </div>
      <div class="corredor-pedidos">
        <div class="equipe-abas">
          <button class="ocup-chip ${aba==='coletar'?'active':''}" onclick="_setEquipeAba(${eq.id},'coletar')">📥 A coletar (${coletar.length})</button>
          <button class="ocup-chip ${aba==='entregar'?'active':''}" onclick="_setEquipeAba(${eq.id},'entregar')">📤 A entregar (${entregar.length})</button>
          <button class="ocup-chip ${aba==='feitas'?'active':''}" onclick="_setEquipeAba(${eq.id},'feitas')">✅ Feitas (${feitas.length})</button>
        </div>
        ${semCidade ? '<p class="text-muted" style="padding:.6rem 0">⚠️ Defina a <strong>cidade base</strong> desta equipe em Cadastros para o direcionamento automático funcionar.</p>' :
          aba==='coletar' ? tabela(coletar,'coletar','Nenhum carro a coletar nesta cidade agora.') :
          aba==='entregar' ? tabela(entregar,'entregar','Nenhum carro no pátio para entregar agora.') :
          tabela(feitas,'feitas','Nada concluído ainda.')}
      </div>
    </div>`;
  }).join('');
}

function _setEquipeAba(id, aba){ _equipeAba[id] = aba; renderizarEquipesPainel(); }

async function marcarColetaEquipe(pedidoId, equipeId){
  if (typeof bloquearSeNaoEquipe === 'function' && bloquearSeNaoEquipe('marcar coleta')) return;
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  const eq = (equipesEntregaGlobais||[]).find(e => String(e.id) === String(equipeId));
  if (!p || !eq || !supabase) return;
  const membro = document.getElementById(`mb_coletar_${pedidoId}`)?.value || null;
  const cidade = `${eq.cidade_base}${eq.uf_base?'/'+eq.uf_base:''}`;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('pedidos').update({
      coleta_equipe_em: new Date().toISOString(), coleta_equipe_por: membro, coleta_equipe_id: parseInt(equipeId),
      patio_atual: cidade, patio_desde: new Date().toISOString()  // trouxe pro pátio
    }).eq('id', parseInt(pedidoId));
    if (error) throw error;
    try { await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: p.status,
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: `📥 Coletado pela equipe ${eq.nome}${membro?' ('+membro+')':''} — levado ao pátio de ${eq.cidade_base}.`
    }); } catch(_){}
    await carregarDadosDoSupabase();
    renderizarEquipesPainel();
  } catch(e){ alert('Erro ao marcar coleta: '+(e.message||e)); }
}

async function marcarEntregaEquipe(pedidoId, equipeId){
  if (typeof bloquearSeNaoEquipe === 'function' && bloquearSeNaoEquipe('marcar entrega')) return;
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  const eq = (equipesEntregaGlobais||[]).find(e => String(e.id) === String(equipeId));
  if (!p || !eq || !supabase) return;
  const membro = document.getElementById(`mb_entregar_${pedidoId}`)?.value || null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('pedidos').update({
      entrega_equipe_em: new Date().toISOString(), entrega_equipe_por: membro, entrega_equipe_id: parseInt(equipeId),
      status: 'Entregue', patio_atual: null, patio_desde: null
    }).eq('id', parseInt(pedidoId));
    if (error) throw error;
    try { await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: 'Entregue',
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: `📤 Entregue pela equipe ${eq.nome}${membro?' ('+membro+')':''} — do pátio ao cliente.`
    }); } catch(_){}
    await carregarDadosDoSupabase();
    renderizarEquipesPainel();
  } catch(e){ alert('Erro ao marcar entrega: '+(e.message||e)); }
}

// ============================================================
// Avançar status em lote dos carros de uma rota planejada/andamento
// ============================================================
function abrirAvancarStatusRota(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('avançar status')) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return;
  const carros = (pedidosGlobais||[]).filter(p =>
    String(p.rotaId || p.rota_id) === String(rotaId) &&
    !['Entregue','Cancelado'].includes(p.status||'Pendente') &&
    (FLUXO_STATUS[p.status||'Pendente']?.proximos||[]).length > 0);
  const old = document.getElementById('modalAvancarRota'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalAvancarRota';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const linhas = carros.length ? carros.map(p => {
    const prox = (FLUXO_STATUS[p.status||'Pendente']?.proximos||[])[0] || '';
    return `<tr class="corr-tr">
      <td><input type="checkbox" class="avr-check" value="${p.id}" checked></td>
      <td class="ct-id">#${p.id}</td>
      <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
      <td class="ct-modelo">${p.modelo||'—'}</td>
      <td class="ct-status">${_statusPill(p.status)}</td>
      <td class="ct-rota"><span class="cpl-seta">→</span> <strong>${prox}</strong></td>
    </tr>`;
  }).join('') : '';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:680px;width:94%;max-height:86vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="margin:0">⏩ Avançar status — ${rota.nome || ('#'+rota.id)}</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalAvancarRota').remove()">✕</button>
      </div>
      ${carros.length === 0 ? '<p class="text-muted" style="padding:1rem 0">Nenhum carro para avançar nesta rota (ou precisam de ação individual, como confirmação/checklist).</p>' : `
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">Selecione os carros e avance todos para o próximo status de uma vez. Etapas que exigem confirmação individual (checklist, transbordo) continuam pelo botão ▶ de cada carro.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="_avrSelTodos(true)">Selecionar todos</button>
        <button class="btn btn-secondary btn-sm" onclick="_avrSelTodos(false)">Limpar</button>
        <span id="avrCont" class="text-muted" style="margin-left:auto"></span>
      </div>
      <table class="corr-tabela">
        <thead><tr><th></th><th>ID</th><th>Placa</th><th>Modelo</th><th>Status atual</th><th>Próximo</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:1;padding:13px" onclick="_aplicarAvancarRota(${rotaId})">⏩ Avançar selecionados</button>
      </div>`}
    </div>`;
  document.body.appendChild(div);
  _avrAtualizaCont();
}
function _avrSelTodos(v){ document.querySelectorAll('.avr-check').forEach(c => c.checked = v); _avrAtualizaCont(); }
function _avrAtualizaCont(){
  const n = document.querySelectorAll('.avr-check:checked').length;
  const el = document.getElementById('avrCont'); if (el) el.textContent = `${n} selecionado(s)`;
}
document.addEventListener('change', e => { if (e.target && e.target.classList?.contains('avr-check')) _avrAtualizaCont(); });

async function _aplicarAvancarRota(rotaId){
  const ids = Array.from(document.querySelectorAll('.avr-check:checked')).map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um carro.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  let ok = 0, pulados = 0;
  try {
    for (const id of ids){
      const p = (pedidosGlobais||[]).find(x => String(x.id) === String(id));
      if (!p) continue;
      const cfg = FLUXO_STATUS[p.status||'Pendente'];
      const prox = (cfg?.proximos||[])[0];
      if (!prox){ pulados++; continue; }
      // Só avança direto os passos simples; Transbordo e Entregue exigem tela própria
      if (prox === 'Transbordo' || prox === 'Entregue'){ pulados++; continue; }
      // Trava: Intenção Agendada precisa de cegonha para virar Aguardando Confirmação
      if (p.status === 'Intenção Agendada' && !p.placaCegonha){ pulados++; continue; }
      await supabase.from('pedidos').update({ status: prox }).eq('id', id);
      try { await supabase.from('historico_status').insert({
        pedido_id: id, status_anterior: p.status, status_novo: prox,
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `⏩ Status avançado em lote (rota) para ${prox}.`
      }); } catch(_){}
      ok++;
    }
    await carregarDadosDoSupabase();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    document.getElementById('modalAvancarRota')?.remove();
    const msg = `⏩ ${ok} carro(s) avançado(s).` + (pulados ? ` ${pulados} exigem ação individual (checklist/transbordo/cegonha).` : '');
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', msg, 'success');
    if (pulados && ok === 0) alert(msg);
  } catch(e){ alert('Erro ao avançar: '+(e.message||e)); }
}

// ============================================================
// HISTÓRICO DE CARGAS CONCLUÍDAS — por motorista e por dia
// Só visualização. Aparece no Painel (logística) e no Faturamento (financeiro).
// ============================================================
function renderizarHistoricoCargas(containerId){
  const cont = document.getElementById(containerId || 'historicoCargasWrap');
  if (!cont) return;

  const fMot = _norm(document.getElementById('histMotorista')?.value || '');
  const fCeg = _norm(document.getElementById('histCegonha')?.value || '');
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';

  // Cargas concluídas = rotas com status 'concluida'
  let rotas = (rotasGlobais||[]).filter(r => r.status === 'concluida');

  // monta os dados de cada carga (rota + seus pedidos)
  let cargas = rotas.map(r => {
    const pedidos = (pedidosGlobais||[]).filter(p => String(p.rotaId||p.rota_id) === String(r.id));
    const data = r.data_saida || (pedidos[0]?.dataSolicitacao) || null;
    const total = pedidos.reduce((s,p)=>s+Number(p.valorFrete||0),0);
    return {
      id: r.id, nome: r.nome, data,
      motorista: r.motorista_1 || pedidos[0]?.motorista1 || '—',
      cegonha: r.placa_cegonha || '—',
      paradas: Array.isArray(r.paradas) ? r.paradas : [],
      pedidos, total
    };
  });

  // filtros
  if (fMot) cargas = cargas.filter(c => _norm(c.motorista).includes(fMot));
  if (fCeg) cargas = cargas.filter(c => _norm(c.cegonha).includes(fCeg));
  if (fDe) cargas = cargas.filter(c => c.data && c.data >= fDe);
  if (fAte) cargas = cargas.filter(c => c.data && c.data <= fAte);

  // ordena por data desc
  cargas.sort((a,b) => (b.data||'').localeCompare(a.data||''));

  if (cargas.length === 0){ cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhuma carga concluída no filtro.</p>'; return; }

  // agrupa por motorista
  const porMot = {};
  cargas.forEach(c => { (porMot[c.motorista] = porMot[c.motorista] || []).push(c); });
  const motoristas = Object.keys(porMot).sort();

  cont.innerHTML = motoristas.map(mot => {
    const lista = porMot[mot];
    const totalMot = lista.reduce((s,c)=>s+c.total,0);
    const totalCarros = lista.reduce((s,c)=>s+c.pedidos.length,0);
    return `<div class="hist-motorista">
      <div class="hist-mot-cab">
        <strong>👤 ${mot}</strong>
        <span class="text-muted">${lista.length} carga(s) · ${totalCarros} carro(s) · R$ ${totalMot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
      </div>
      ${lista.map(c => `
        <div class="hist-carga">
          <div class="hist-carga-cab">
            <span>📅 ${c.data ? new Date(c.data+'T12:00').toLocaleDateString('pt-BR') : '—'}</span>
            <span>🚛 <strong>${c.cegonha}</strong></span>
            <span class="hist-rota">${c.paradas.length ? c.paradas.join(' → ') : (c.nome||'—')}</span>
            <span class="text-muted">${c.pedidos.length} carro(s)</span>
            <span class="hist-total">R$ ${c.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
          </div>
          <table class="corr-tabela">
            <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Valor</th><th>CTe</th><th>Cobrança</th><th>Entrega</th></tr></thead>
            <tbody>${c.pedidos.map(p => {
              const cte = (typeof cteInfoDoPedido==='function') ? cteInfoDoPedido(p.id) : null;
              const entregaTxt = p.entregaEquipeEm ? `📤 equipe${p.entregaEquipePor?' ('+p.entregaEquipePor+')':''}`
                : (p.fluxoEntrega === 'direta' ? '✅ motorista' : (p.status==='Entregue'?'entregue':'—'));
              const cobr = p.cobrancaStatus ? (typeof _COB_LABEL!=='undefined' ? (_COB_LABEL[p.cobrancaStatus]||p.cobrancaStatus) : p.cobrancaStatus) : 'a cobrar';
              return `<tr class="corr-tr">
                <td class="ct-id">#${p.id}</td>
                <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
                <td class="ct-modelo">${p.modelo||'—'}</td>
                <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
                <td class="ct-cli">${p.cliente||'—'}</td>
                <td class="ct-frete">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td>${cte ? '🧾 '+(cte.numero||'sim') : '—'}</td>
                <td>${cobr}</td>
                <td>${entregaTxt}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`).join('')}
    </div>`;
  }).join('');
}

// casca com filtros (reutilizada nos dois lugares)
function _histCargasCasca(){
  return `
    <div class="hist-filtros">
      <input type="text" id="histMotorista" class="ocup-busca" placeholder="👤 Motorista..." oninput="renderizarHistoricoCargas()">
      <input type="text" id="histCegonha" class="ocup-busca" placeholder="🚛 Cegonha..." oninput="renderizarHistoricoCargas()">
      <label class="hist-data">De <input type="date" id="histDataDe" onchange="renderizarHistoricoCargas()"></label>
      <label class="hist-data">Até <input type="date" id="histDataAte" onchange="renderizarHistoricoCargas()"></label>
    </div>
    <div id="historicoCargasWrap"></div>`;
}
