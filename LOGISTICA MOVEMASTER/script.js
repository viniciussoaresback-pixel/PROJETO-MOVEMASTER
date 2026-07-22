// ============================================
// CONFIGURAÇÃO GLOBAL E VARIÁVEIS
// ============================================

let pedidosGlobais = [];
let clientesGlobais = [];
let motoristasGlobais = [];
let veiculosGlobais = [];
let rotasGlobais = [];
let estadosBrasil = [];
let cidadesPorEstado = {};
let notificacoesEnviadas = new Set();

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

    if (tabAlvo === 'painel') carregarPainel();
    if (tabAlvo === 'logistica') carregarLogistica();
    if (tabAlvo === 'cadastros') { renderizarListaClientes(); renderizarListaMotoristas(); renderizarListaVeiculos(); }
    if (tabAlvo === 'meusPedidos') {
        renderizarPedidosComercial();
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

async function carregarDadosDoSupabase() {
    if (!supabase) return;
    try {
        const [resClientes, resMotoristas, resVeiculos, resPedidos] = await Promise.all([
            supabase.from('clientes').select('*').order('nome'),
            supabase.from('motoristas').select('*').order('nome'),
            supabase.from('veiculos').select('*').order('placa'),
            supabase.from('pedidos').select('*').order('created_at', {ascending:false})
        ]);

        // Rotas planejadas (tabela opcional — se não existir, segue sem quebrar)
        try {
            const { data: rotas } = await supabase.from('rotas_planejadas')
                .select('*').order('data_saida', { ascending: true });
            rotasGlobais = rotas || [];
        } catch (e) { rotasGlobais = []; }

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
                ufOrigem: p.uf_origem,
                cidadeDestino: p.cidade_destino,
                ufDestino: p.uf_destino,
                enderecoColeta: p.endereco_coleta,
                enderecoEntrega: p.endereco_entrega,
                valorFrete: p.valor_frete,
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
                patioDesde: p.patio_desde || null,
                grupoId: p.grupo_id || null,
                rotaId: p.rota_id || null,
                confLogisticaEm: p.confirmacao_logistica_em || null,
                confLogisticaPor: p.confirmacao_logistica_por || null,
                confComercialEm: p.confirmacao_comercial_em || null,
                confComercialPor: p.confirmacao_comercial_por || null,
                createdAt: p.created_at
            }));
        }
        preencherSelects();
        if (typeof renderizarListaClientes === 'function') renderizarListaClientes();
        if (typeof renderizarListaMotoristas === 'function') renderizarListaMotoristas();
        if (typeof renderizarListaVeiculos === 'function') renderizarListaVeiculos();
        renderizarPedidosComercial();
        atualizarDashboardComercial();
        if (typeof renderizarLiberacoesComercial === 'function') renderizarLiberacoesComercial();
        if (typeof renderizarOcorrenciasComercial === 'function') renderizarOcorrenciasComercial();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
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
    const sel = document.getElementById('motoristaSelecionado');
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Todos os motoristas</option>';
    motoristasGlobais.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.nome || m; opt.textContent = m.nome || m;
        sel.appendChild(opt);
    });
    sel.value = val;
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
    div.className = 'form-row veiculo-extra-row';
    div.id = `veiculoExtra_${idx}`;
    div.innerHTML = `
        <div class="form-group">
            <label>Modelo do Veículo (adicional) *</label>
            <input type="text" class="veiculo-extra-modelo" placeholder="Ex: Toyota Corolla">
        </div>
        <div class="form-group">
            <label>Placa *</label>
            <input type="text" class="veiculo-extra-placa" placeholder="Ex: XYZ9876" maxlength="8" style="text-transform:uppercase">
        </div>
        <div class="form-group" style="max-width:180px">
            <label>Valor Frete (R$)</label>
            <div class="input-moeda-wrap">
                <span class="input-moeda-prefixo">R$</span>
                <input type="text" class="veiculo-extra-valor" placeholder="Igual ao 1º" oninput="mascaraMoeda(this)">
            </div>
        </div>
        <button type="button" class="btn-remover-veiculo" onclick="removerVeiculoExtra(${idx})" title="Remover este veículo">✕</button>
    `;
    container.appendChild(div);
    div.querySelector('.veiculo-extra-modelo').focus();
}

function removerVeiculoExtra(idx) {
    const div = document.getElementById(`veiculoExtra_${idx}`);
    if (div) div.remove();
}

function limparVeiculosExtras() {
    const container = document.getElementById('veiculosExtras');
    if (container) container.innerHTML = '';
    contadorVeiculosExtras = 0;
}

// Retorna [{modelo, placa, valorFrete|null}] ou null se houver linha incompleta
function coletarVeiculosExtras() {
    const linhas = document.querySelectorAll('.veiculo-extra-row');
    const veiculos = [];
    for (const linha of linhas) {
        const modelo = linha.querySelector('.veiculo-extra-modelo')?.value.trim() || '';
        const placa  = (linha.querySelector('.veiculo-extra-placa')?.value.trim() || '').toUpperCase();
        const valorStr = linha.querySelector('.veiculo-extra-valor')?.value.trim() || '';
        if (!modelo && !placa) continue; // linha vazia, ignora
        if (!modelo || !placa) return null; // linha incompleta
        veiculos.push({
            modelo,
            placa,
            valorFrete: valorStr ? valorMoedaParaFloat(valorStr) : null
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

    const pedido = {
        cliente: document.getElementById('cliente').value,
        dataSolicitacao: document.getElementById('dataSolicitacao').value,
        prazoEntregaEstimado: document.getElementById('prazoEntregaEstimado')?.value || null,
        modelo: document.getElementById('modelo').value,
        placa: document.getElementById('placa').value,
        cidadeOrigem: document.getElementById('cidadeOrigem').value,
        ufOrigem: document.getElementById('ufOrigem').value,
        cidadeDestino: document.getElementById('cidadeDestino').value,
        ufDestino: document.getElementById('ufDestino').value,
        enderecoColeta: document.getElementById('enderecoColeta').value,
        enderecoEntrega: document.getElementById('enderecoEntrega').value,
        valorFrete: valorMoedaParaFloat(document.getElementById('valorFrete').value),
        responsavelComercial: document.getElementById('responsavelComercial').value,
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
                uf_origem: pedido.ufOrigem,
                cidade_destino: pedido.cidadeDestino,
                uf_destino: pedido.ufDestino,
                cep_coleta: document.getElementById('cepColeta')?.value || null,
                endereco_coleta: pedido.enderecoColeta,
                cep_entrega: document.getElementById('cepEntrega')?.value || null,
                endereco_entrega: pedido.enderecoEntrega,
                valor_frete: pedido.valorFrete,
                responsavel_comercial: pedido.responsavelComercial,
                referencia: pedido.referencia,
                observacao_pedido: pedido.observacao,
                status: 'Pendente'
            };

            // Monta 1 pedido por veículo; se houver mais de 1, vincula por grupo_id
            let linhasParaInserir;
            if (veiculosExtras.length > 0) {
                const grupoId = gerarGrupoId();
                linhasParaInserir = [
                    { ...dadosParaSalvar, grupo_id: grupoId },
                    ...veiculosExtras.map(v => ({
                        ...dadosParaSalvar,
                        modelo: v.modelo,
                        placa: v.placa,
                        valor_frete: v.valorFrete !== null ? v.valorFrete : dadosParaSalvar.valor_frete,
                        grupo_id: grupoId
                    }))
                ];
            } else {
                linhasParaInserir = [dadosParaSalvar];
            }

            const { error } = await supabase.from('pedidos').insert(linhasParaInserir);
            if (error) throw error;

            await carregarDadosDoSupabase();
            const qtd = linhasParaInserir.length;
            exibirMensagem('mensagemComercial',
                qtd > 1 ? `✅ ${qtd} pedidos salvos com sucesso (1 por veículo, mesmo grupo)!` : '✅ Pedido salvo com sucesso!',
                'success');
            document.getElementById('formComercial').reset();
            limparVeiculosExtras();
            await carregarPainel();
            await carregarFaturamento();
            renderizarPedidosComercial();
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

    // Contagens dos cards de resumo
    const cont = { total: 0, Pendente: 0, 'Em Rota': 0, Entregue: 0 };
    pedidosGlobais.forEach(p => {
        const g = grupoOcupacao(p.status || 'Pendente');
        if (g === 'Cancelado') return;
        cont.total++;
        if (cont[g] !== undefined) cont[g]++;
    });
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('ocupTotal', cont.total);
    setTxt('ocupPendente', cont.Pendente);
    setTxt('ocupEmRota', cont['Em Rota']);
    setTxt('ocupEntregue', cont.Entregue);

    // Filtro + busca
    const busca = (document.getElementById('ocupBusca')?.value || '').trim().toLowerCase();
    let lista = pedidosGlobais.filter(p => grupoOcupacao(p.status || 'Pendente') !== 'Cancelado');
    if (_ocupFiltroStatus) lista = lista.filter(p => grupoOcupacao(p.status || 'Pendente') === _ocupFiltroStatus);
    if (busca) lista = lista.filter(p =>
        `${p.cliente||''} ${p.placa||''} ${p.modelo||''} ${p.placaCegonha||''} ${p.motorista1||''} ${p.referencia||''} #${p.id}`.toLowerCase().includes(busca)
    );

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

    corpo.innerHTML = lista.map(p => {
        const cor = FLUXO_STATUS[p.status||'Pendente']?.cor || '#888';
        const qtdGrupo = p.grupoId ? pedidosGlobais.filter(x => x.grupoId === p.grupoId).length : 0;
        const cegonhaLinha = p.placaCegonha
            ? `${p.placaCegonha}${p.motorista1 ? ' · ' + p.motorista1 : ' · <span class="tag-adefinir">A DEFINIR</span>'}`
            : (['Intenção Agendada','Aguardando Confirmação'].includes(p.status) ? '<span class="tag-adefinir">A DEFINIR</span>' : '—');
        const grupo = grupoOcupacao(p.status||'Pendente');
        const pulse = grupo === 'Em Rota' ? '<span class="ocup-pulse"></span>' : '';
        return `
        <tr style="--row-cor:${cor}">
            <td data-label="Pedido"><span class="ocup-id">#${p.id}</span><br><span class="ocup-cliente">${p.cliente || '—'}</span></td>
            <td data-label="Rota" class="ocup-rota-cell">${rotaComTransbordoHTML(p)}</td>
            <td data-label="Veículo / Cegonha">
                <div>🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong>${qtdGrupo > 1 ? ` <span class="badge-grupo">🔗 ${qtdGrupo}</span>` : ''}${p.patioAtual ? ` <span class="badge-patio">🅿️ ${p.patioAtual}</span>` : ''}${p.referencia ? ` <span class="badge-ref" title="Referência: ${p.referencia}">🔖 ${p.referencia}</span>` : ''}</div>
                <div class="ocup-sub">🚛 ${cegonhaLinha}</div>
            </td>
            <td data-label="Coleta prev." class="ocup-sub">${p.dataPrevColeta ? formatarDataHora(p.dataPrevColeta) : '—'}${badgePrazoEntrega(p) ? '<br>' + badgePrazoEntrega(p) : ''}</td>
            <td data-label="Status"><span class="status-pill-vivo" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${pulse}${p.status || 'Pendente'}</span></td>
            <td data-label="Frete" style="text-align:right;font-weight:600;white-space:nowrap">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td data-label="Ações" class="ocup-acoes-cell">
                ${(FLUXO_STATUS[p.status||'Pendente']?.proximos?.length > 0) ? `<button class="btn-kanban-status" onclick="abrirModalStatus(${p.id})">Avançar</button>` : ''}
                <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Hist.</button>
                ${!['Entregue','Cancelado'].includes(p.status||'Pendente') ? `<button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="${p.patioAtual ? 'No pátio de ' + p.patioAtual : 'Informar pátio'}">🅿️</button>` : ''}
                ${['Em Coleta','Em Transporte'].includes(p.status) ? `<button class="btn-kanban-ocorr" onclick="abrirRegistrarOcorrencia(${p.id})" title="Ocorrência">⚠️</button>` : ''}
                ${p.status === 'Entregue' ? `<button class="btn-kanban-receita" onclick="abrirConfirmarReceita(${p.id})" title="Confirmar Receita">💰</button>` : ''}
            </td>
        </tr>`;
    }).join('');
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

    const contador = document.getElementById('contadorPendentesAlocar');
    if (contador) contador.textContent = pendentes.length;

    if (pendentes.length === 0) {
        lista.innerHTML = '<p class="text-center text-muted">Nenhum pedido para alocar 🎉<br><span class="text-sm">Acompanhe os alocados na aba 📊 Acompanhamento</span></p>';
        return;
    }

    lista.innerHTML = '';
    pendentes.forEach(p => {
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

function renderizarVeiculosDrop() {
    const lista = document.getElementById('listaVeiculosDrop');
    if (!lista) return;

    if (veiculosGlobais.length === 0) {
        lista.innerHTML = '<p class="text-center text-muted">Nenhum veículo cadastrado.</p>';
        return;
    }

    lista.innerHTML = '';
    veiculosGlobais.forEach(v => {
        const pedidosNoVeiculo = pedidosGlobais.filter(p =>
            p.placaCegonha === v.placa && p.status === 'Em Rota'
        );
        const vagas = (v.capacidade || 4) - pedidosNoVeiculo.length;
        const motoristaPadrao = v.motorista_padrao || '';

        const card = document.createElement('div');
        card.className = 'veiculo-drop-card';
        card.dataset.veiculoPlaca = v.placa;

        // Indicador de vagas
        const vagasClass = vagas <= 0 ? 'vagas-cheio' : vagas <= 1 ? 'vagas-quase' : 'vagas-livre';

        card.innerHTML = `
            <div class="veiculo-drop-header">
                <div class="veiculo-drop-title">
                    <span class="veiculo-placa">${v.placa}</span>
                    <span class="veiculo-tipo">${v.tipo || 'Cegonha'}</span>
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
                        <span>${p.cidadeOrigem}→${p.cidadeDestino}</span>
                    </div>
                `).join('') || '<span class="text-muted text-sm">Nenhum pedido alocado</span>'}
            </div>
            <div class="drop-zone ${vagas <= 0 ? 'drop-zone-cheio' : ''}" data-placa="${v.placa}">
                ${vagas <= 0 ? '🔒 Veículo lotado' : '⬇ Arraste um pedido aqui'}
            </div>
        `;

        // Drag events na drop zone
        const dropZone = card.querySelector('.drop-zone');
        if (vagas > 0) {
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
                if (pedidoArrastando) {
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

function abrirModalAlocacao(pedido, veiculo) {
    const modal = document.getElementById('modalAlocacao');
    if (!modal) return;

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

    // Pré-selecionar motorista padrão do veículo
    const selMot1 = document.getElementById('alocMotorista1');
    if (selMot1 && veiculo.motorista_padrao) {
        selMot1.value = veiculo.motorista_padrao;
    }

    modal.classList.add('show');
}

async function confirmarAlocacao(event) {
    event.preventDefault();

    const pedidoId = document.getElementById('alocPedidoId').value;
    const veiculoPlaca = document.getElementById('alocVeiculoId').value;
    const motorista1 = document.getElementById('alocMotorista1').value;
    const percent1 = parseFloat(document.getElementById('alocPercent1').value) || 0;
    const motorista2 = document.getElementById('alocMotorista2').value;
    const percent2 = parseFloat(document.getElementById('alocPercent2').value) || 0;
    const dataColeta = document.getElementById('alocDataColeta').value;
    const dataEntrega = document.getElementById('alocDataEntrega').value;

    if (percent1 + percent2 > 100) {
        alert('A soma dos percentuais não pode passar de 100%.');
        return;
    }

    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const rota = `${pedido.cidadeOrigem}/${pedido.ufOrigem} - ${pedido.cidadeDestino}/${pedido.ufDestino}`;

    const atualizacao = {
        rota,
        placa_cegonha: veiculoPlaca,
        motorista_1: motorista1,
        percent_motorista_1: percent1,
        motorista_2: motorista2 || null,
        percent_motorista_2: percent2 || null,
        data_prev_coleta: dataColeta,
        data_prev_entrega: dataEntrega,
        status: 'Intenção Agendada'
    };

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
            // Registrar histórico
            const pedidoAtual = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
            await supabase.from('historico_status').insert({
                pedido_id: parseInt(pedidoId),
                status_anterior: pedidoAtual?.status || 'Pendente',
                status_novo: 'Intenção Agendada',
                usuario_nome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
                usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica',
                observacao: `Alocado no veículo ${veiculoPlaca} com motorista ${motorista1}`
            });
            await carregarDadosDoSupabase();
            fecharModal('modalAlocacao');
            exibirMensagem('mensagemLogistica', '✅ Pedido alocado com sucesso!', 'success');
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
        status: 'Em Rota'
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

async function carregarFaturamento() {
    const selectMotorista = document.getElementById('motoristaSelecionado');
    const motoristaFiltro = selectMotorista ? selectMotorista.value : '';

    if (supabase) {
        try { await carregarDadosDoSupabase(); } catch(e) {}
    }
    renderizarTabelaFaturamento(motoristaFiltro);
}

function renderizarTabelaFaturamento(motoristaFiltro) {
    const corpo = document.getElementById('corpoTabelaFaturamento');
    const resumo = document.getElementById('resumoFaturamento');
    if (!corpo || !resumo) return;

    const linhas = [];
    const totalPorMotorista = {};

    pedidosGlobais.forEach(p => {
        [
            { motorista: p.motorista1, percent: p.percentMotorista1 },
            { motorista: p.motorista2, percent: p.percentMotorista2 }
        ].forEach(item => {
            if (!item.motorista || !item.percent) return;
            if (motoristaFiltro && item.motorista !== motoristaFiltro) return;

            const valorRecebido = (parseFloat(p.valorFrete) || 0) * (item.percent / 100);

            linhas.push({
                data: p.dataSolicitacao || '',
                pedidoId: p.id,
                cliente: p.cliente || '',
                rota: `${p.cidadeOrigem || ''}/${p.ufOrigem || ''} - ${p.cidadeDestino || ''}/${p.ufDestino || ''}`,
                valorFrete: parseFloat(p.valorFrete) || 0,
                motorista: item.motorista,
                percent: item.percent,
                valorRecebido
            });

            if (!totalPorMotorista[item.motorista]) totalPorMotorista[item.motorista] = 0;
            totalPorMotorista[item.motorista] += valorRecebido;
        });
    });

    if (linhas.length === 0) {
        corpo.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum dado de faturamento.</td></tr>';
        resumo.innerHTML = '';
        return;
    }

    corpo.innerHTML = linhas.map(l => {
        // Verificar se já tem pagamento registrado
        const pedidoObj = pedidosGlobais.find(p => p.id == l.pedidoId);
        return `
        <tr>
            <td>${l.data}</td>
            <td>${l.pedidoId}</td>
            <td>${l.cliente}</td>
            <td>${l.rota}</td>
            <td>R$ ${l.valorFrete.toFixed(2)}</td>
            <td>${l.percent}%</td>
            <td>R$ ${l.valorRecebido.toFixed(2)}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="abrirRegistrarPagamento(${l.pedidoId})">🏦 Pagamento</button></td>
        </tr>`;
    }).join('');

    resumo.innerHTML = Object.entries(totalPorMotorista).map(([mot, total]) => `
        <div class="resumo-card">
            <p>${mot}</p>
            <strong>R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong>
        </div>
    `).join('');
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

    // Ao abrir, garante que a lista está renderizada
    if (!aberto) {
        if (alvo === 'listaClientes'   && typeof renderizarListaClientes === 'function')   renderizarListaClientes();
        if (alvo === 'listaMotoristas' && typeof renderizarListaMotoristas === 'function') renderizarListaMotoristas();
        if (alvo === 'listaVeiculos'   && typeof renderizarListaVeiculos === 'function')   renderizarListaVeiculos();
    }
}

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
    const dados = {
        placa,
        tipo: document.getElementById('edVeiTipo').value,
        capacidade: parseInt(document.getElementById('edVeiCapacidade').value) || null,
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
                <div class="form-group" id="edGrupoCnpj" style="display:${ehPJ ? '' : 'none'}">
                    <label>CNPJ</label>
                    <input type="text" id="edCliCnpj" value="${c.cnpj||''}" maxlength="18" oninput="mascaraCNPJ(this)">
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
    const set = (id, mostrar) => { const el = document.getElementById(id); if (el) el.style.display = mostrar ? '' : 'none'; };
    set('edGrupoCnpj', ehPJ);
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

    const dados = {
        nome,
        tipo_cliente: tipo,
        cnpj: ehPJ ? (document.getElementById('edCliCnpj').value.trim() || null) : null,
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
        grupoCnpj.style.display = 'none';
        grupoCpf.style.display = '';
        document.getElementById('cnpjCliente').value = '';
        if (grupoIE) {
            grupoIE.style.display = 'none';
            const ie = document.getElementById('inscricaoEstadual');
            if (ie) ie.value = '';
        }
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

    if (!placa || !tipo || !capacidade) {
        exibirMensagem('mensagemCadastroVeiculo', 'Preencha os campos obrigatórios!', 'error');
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
    document.getElementById('modalStatusResumo').innerHTML = `
        <div class="status-resumo-info">
            <span><strong>#${pedido.id}</strong> — ${pedido.cliente || '—'}</span>
            <span>${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''} → ${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}</span>
            <span class="status-badge-inline" style="background:${config.cor}20;color:${config.cor};border:1px solid ${config.cor}40">
                ${statusAtual}
            </span>
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
    const chkVerif = document.getElementById('checklistVerificado');
    if (chkVerif) chkVerif.checked = false;

    if (novoStatus === 'Transbordo') {
        // Transbordo exige: tipo (pátio/caminhão) + checklist verificado
        grupoObs.style.display = 'block';
        grupoTipoTransb.style.display = 'block';
        grupoChecklist.style.display = 'block';
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

    if (!statusNovo) {
        msgEl.textContent = 'Selecione o próximo status.';
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

        // 3. Atualizar dados locais
        await carregarDadosDoSupabase();
        fecharModal('modalStatus');
        exibirMensagem('mensagemLogistica', `✅ Status atualizado: ${statusAnterior} → ${statusNovo}`, 'success');
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

function renderizarPedidosComercial() {
    const corpo = document.getElementById('corpoTabelaPedidosComercial');
    if (!corpo) return;

    const filtroStatus = document.getElementById('filtroPedidosComercial')?.value || '';
    const filtroRota   = document.getElementById('filtroPedidosRota')?.value || '';
    const filtroTexto  = (document.getElementById('filtroPedidosTexto')?.value || '').toLowerCase();

    // Popular dropdown de rotas
    popularFiltroRotas();

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Transbordo': '#fb923c', 'Entregue': '#4ade80'
    };

    let pedidos = [...pedidosGlobais].sort((a, b) => b.id - a.id);

    if (filtroStatus) pedidos = pedidos.filter(p => p.status === filtroStatus);
    if (filtroRota) pedidos = pedidos.filter(p => {
        const r = `${p.cidadeOrigem||''}/${p.ufOrigem||''} → ${p.cidadeDestino||''}/${p.ufDestino||''}`;
        return r === filtroRota;
    });
    if (filtroTexto) pedidos = pedidos.filter(p =>
        (p.cliente || '').toLowerCase().includes(filtroTexto) ||
        (p.placa || '').toLowerCase().includes(filtroTexto) ||
        String(p.id).includes(filtroTexto)
    );

    if (pedidos.length === 0) {
        corpo.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    corpo.innerHTML = pedidos.map(p => {
        const cor = cores[p.status] || '#888';
        const podeChecklist = p.status === 'Aguardando Confirmação';
        return `<tr>
            <td><strong>#${p.id}</strong></td>
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
    }).join('');

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

        await carregarDadosDoSupabase();
        fecharModal('modalChecklist');
        renderizarPedidosComercial();
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

function renderizarResumoRotas() {
    const grid = document.getElementById('gridResumoRotas');
    if (!grid) return;

    const cores = {
        'Pendente': '#fbbf24', 'Intenção Agendada': '#60a5fa',
        'Aguardando Confirmação': '#f97316', 'Em Coleta': '#a78bfa',
        'Em Transporte': '#34d399', 'Transbordo': '#fb923c', 'Entregue': '#4ade80'
    };

    const rotaMap = {};
    pedidosGlobais.forEach(p => {
        if (!p.cidadeOrigem || !p.cidadeDestino) return;
        const chave = `${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}`;
        if (!rotaMap[chave]) rotaMap[chave] = { pedidos: [], total: 0, statuses: {} };
        rotaMap[chave].pedidos.push(p);
        rotaMap[chave].total += parseFloat(p.valorFrete) || 0;
        const st = p.status || 'Pendente';
        rotaMap[chave].statuses[st] = (rotaMap[chave].statuses[st] || 0) + 1;
    });

    const rotas = Object.entries(rotaMap).sort((a, b) => b[1].pedidos.length - a[1].pedidos.length);

    if (rotas.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted">Nenhuma rota encontrada.</p>';
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
                <span class="rota-total-badge">${dados.pedidos.length} pedido${dados.pedidos.length > 1 ? 's' : ''}</span>
            </div>
            <div class="rota-statuses">${statusBadges}</div>
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
    ['acompFiltroCaminhao', 'acompFiltroDe', 'acompFiltroAte', 'acompFiltroStatus'].forEach(id => {
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

    lista.sort((a, b) => {
        if (!a.dataPrevColeta) return 1;
        if (!b.dataPrevColeta) return -1;
        return new Date(a.dataPrevColeta) - new Date(b.dataPrevColeta);
    });

    if (lista.length === 0) {
        corpo.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Nenhum pedido com esses filtros.</td></tr>';
        return;
    }

    corpo.innerHTML = lista.map(p => {
        const cor = FLUXO_STATUS[p.status || 'Pendente']?.cor || '#888';
        const temProximo = FLUXO_STATUS[p.status]?.proximos?.length > 0;
        return `
        <tr>
            <td>#${p.id}</td>
            <td>${p.cliente || '—'}</td>
            <td style="font-size:0.78rem">${p.modelo || ''}<br><strong>${p.placa || ''}</strong></td>
            <td style="font-size:0.75rem">${p.cidadeOrigem || ''}/${p.ufOrigem || ''}${p.cidadeTransbordo ? ` → 🔁 ${p.cidadeTransbordo}` : ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td>${p.placaCegonha || '<span class="tag-adefinir">A DEFINIR</span>'}</td>
            <td style="font-size:0.78rem">${p.motorista1 || '<span class="tag-adefinir">A DEFINIR</span>'}</td>
            <td style="font-size:0.78rem">${p.dataPrevColeta ? new Date(p.dataPrevColeta).toLocaleString('pt-BR') : '—'}</td>
            <td><span class="status-badge-inline" style="background:${cor}20;color:${cor};border:1px solid ${cor}40;padding:0.15rem 0.5rem;border-radius:5px;font-size:0.7rem;white-space:nowrap">${p.status}</span>
                ${p.patioAtual ? `<br><span class="badge-patio" style="margin:0.2rem 0 0">🅿️ ${p.patioAtual}</span>` : ''}</td>
            <td class="acomp-acoes">
                ${temProximo ? `<button class="btn-kanban-status" onclick="abrirModalStatus(${p.id})">Avançar</button>` : ''}
                <button class="btn-kanban-editar" onclick="abrirEdicaoPedido(${p.id})" title="Editar pedido (logística edita sem mudar o status)">✏️</button>
                <button class="btn-kanban-ocorr" onclick="abrirRegistrarOcorrencia(${p.id})" title="Registrar ocorrência (vai para o comercial responsável)">⚠️</button>
                <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Hist.</button>
            </td>
        </tr>`;
    }).join('');
}

// ============================================
// OCORRÊNCIAS → COMERCIAL RESPONSÁVEL (com retorno)
// Não trava o fluxo do pedido; fica tudo em histórico.
// ============================================

async function renderizarOcorrenciasComercial() {
    const painel = document.getElementById('ocorrenciasComercial');
    if (!painel || !supabase) return;

    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : null;
    if (!['comercial', 'admin'].includes(perfilUsuario)) { painel.innerHTML = ''; return; }

    try {
        const { data, error } = await supabase
            .from('ocorrencias')
            .select('*')
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
                ${validadas.map(o => card(o, `<div class="conf-card-linha">${o.validacao_logistica === 'auto_ok' ? '✅ Confirmada automaticamente pelo OCR' : o.validacao_logistica === 'aprovada' ? '✔ Aprovada manualmente' : '✘ Reprovada'} ${o.validado_por ? '— ' + o.validado_por : ''}</div>`)).join('')}
            ` : ''}`;
    } catch (e) {
        console.warn('Validação de placas não carregada:', e.message);
        painel.innerHTML = '<p class="text-muted text-sm">Não foi possível carregar. Rode a migração do OCR.</p>';
    }
}

async function validarPlaca(ocorrenciaId, resultado) {
    if (!supabase) return;
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Logística';
    try {
        const { error } = await supabase.from('ocorrencias').update({
            validacao_logistica: resultado,
            validado_por: usuarioNome,
            validado_em: new Date().toISOString()
        }).eq('id', ocorrenciaId);
        if (error) throw error;
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

function renderizarRotas() {
    const painel = document.getElementById('painelRotas');
    if (!painel) return;

    const ativas = (rotasGlobais || []).filter(r => ['planejada','em_andamento'].includes(r.status));

    if (ativas.length === 0) {
        painel.innerHTML = '<p class="text-center text-muted">Nenhuma rota planejada.<br><span class="text-sm">Clique em <strong>➕ Nova Rota</strong> para planejar o caminho de uma cegonha e ir vinculando os pedidos.</span></p>';
        return;
    }

    painel.innerHTML = ativas.map(r => {
        const paradas = paradasDaRota(r);
        const vinculados = pedidosGlobais.filter(p => String(p.rotaId) === String(r.id) && !['Entregue','Cancelado'].includes(p.status));
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
                🚛 ${r.placa_cegonha || '<span class="tag-adefinir">A DEFINIR</span>'}
                ${r.data_saida ? ` · 📅 ${new Date(r.data_saida + 'T12:00').toLocaleDateString('pt-BR')}` : ''}
                ${vagas > 0 ? ` · <strong style="color:${corPct}">faltam ${vagas} carro(s)</strong>` : ' · <strong style="color:#4ade80">carreta cheia ✔</strong>'}
            </div>

            <div class="cegonha-rota-linha" style="margin:0.5rem 0">${paradasHTML}</div>
            ${r.observacao ? `<div class="text-muted text-sm">📝 ${r.observacao}</div>` : ''}

            <div class="rota-barra"><div class="rota-barra-inner" style="width:${Math.min(pct,100)}%;background:${corPct}"></div></div>

            <div class="rota-secao">
                <div class="rota-secao-titulo">Pedidos vinculados (${vinculados.length})</div>
                ${vinculados.length === 0
                    ? '<p class="text-muted text-sm">Nenhum pedido vinculado ainda.</p>'
                    : vinculados.map(p => `
                        <div class="rota-pedido-item">
                            <span>#${p.id} · <strong>${p.cliente || ''}</strong> · ${p.modelo || ''} ${p.placa || ''}</span>
                            <span class="rota-pedido-rota">${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
                            <button class="btn-kanban-cancelar" onclick="desvincularPedidoRota(${p.id})" title="Tirar desta rota">✕</button>
                        </div>`).join('')}
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
                ${r.status === 'planejada' ? `<button class="btn btn-primary btn-sm" onclick="mudarStatusRota(${r.id}, 'em_andamento')">▶️ Iniciar viagem</button>` : ''}
                ${r.status === 'em_andamento' ? `<button class="btn btn-primary btn-sm" onclick="mudarStatusRota(${r.id}, 'concluida')">✔ Concluir</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="mudarStatusRota(${r.id}, 'cancelada')">Cancelar rota</button>
            </div>
        </div>`;
    }).join('');
}

// ---------- Criar rota ----------
let _paradasNovaRota = [];

function abrirNovaRota() {
    _paradasNovaRota = [];
    const existing = document.getElementById('modalNovaRota');
    if (existing) existing.remove();

    const cegonhas = veiculosGlobais.map(v =>
        `<option value="${v.placa}">${v.placa} — ${v.tipo || 'Cegonha'} (${v.capacidade || 11} vagas)${v.propriedade === 'terceiro' ? ' 🤝' : ''}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'modalNovaRota';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:560px">
            <span class="close" onclick="document.getElementById('modalNovaRota').remove()">&times;</span>
            <h2>🛣️ Nova Rota Planejada</h2>
            <div class="form-row">
                <div class="form-group">
                    <label>Nome da rota</label>
                    <input type="text" id="rotaNome" placeholder="Ex: Quinta — PR Sul">
                </div>
                <div class="form-group">
                    <label>Data de saída</label>
                    <input type="date" id="rotaData">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Cegonha</label>
                    <select id="rotaCegonha">
                        <option value="">A definir</option>
                        ${cegonhas}
                    </select>
                </div>
                <div class="form-group"></div>
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

            <div class="form-group">
                <label>Observação</label>
                <input type="text" id="rotaObs" placeholder="Opcional">
            </div>

            <div id="mensagemNovaRota" class="message"></div>
            <div class="form-actions">
                <button class="btn btn-primary" onclick="salvarNovaRota()">Criar Rota</button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalNovaRota').remove()">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    renderizarParadasRota();
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
    try {
        const { error } = await supabase.from('rotas_planejadas').insert({
            nome: document.getElementById('rotaNome').value.trim() || null,
            placa_cegonha: document.getElementById('rotaCegonha').value || null,
            data_saida: document.getElementById('rotaData').value || null,
            paradas: _paradasNovaRota,
            observacao: document.getElementById('rotaObs').value.trim() || null,
            status: 'planejada',
            criado_por: usuarioNome
        });
        if (error) throw error;
        document.getElementById('modalNovaRota').remove();
        await carregarDadosDoSupabase();
        renderizarRotas();
        exibirMensagem('mensagemLogistica', '✅ Rota planejada criada! Agora vincule os pedidos compatíveis.', 'success');
    } catch (e) {
        msgEl.textContent = 'Erro ao criar rota: ' + e.message;
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
            motorista_1: null, motorista_2: null
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
    'Maringá/PR', 'Cascavel/PR', 'São José dos Pinhais/PR',
    'Balneário Camboriú/SC', 'São José/SC', 'Gravataí/RS', 'São Paulo/SP'
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

// Monta a rota que a cegonha está percorrendo, a partir dos pedidos alocados:
// pontos de coleta → pátios de transbordo (se houver) → pontos de entrega
function rotaDaCegonha(pedidos) {
    if (!pedidos || pedidos.length === 0) return '';

    const unicos = arr => [...new Set(arr.filter(Boolean))];
    const origens  = unicos(pedidos.map(p => `${p.cidadeOrigem || ''}/${p.ufOrigem || ''}`.replace(/^\/$/, '')));
    const destinos = unicos(pedidos.map(p => `${p.cidadeDestino || ''}/${p.ufDestino || ''}`.replace(/^\/$/, '')));
    const patios   = unicos(pedidos.map(p => p.cidadeTransbordo));

    // Coletas ainda pendentes (o motorista ainda precisa passar lá)
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

        const card = document.createElement('div');
        card.className = 'cegonha-card';
        card.innerHTML = `
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
            ${pedidosNaCegonha.length > 0 ? `
            <div class="cegonha-rota">
                <span class="cegonha-rota-titulo">🛣️ Rota</span>
                <div class="cegonha-rota-linha">${rotaDaCegonha(pedidosNaCegonha)}</div>
            </div>` : ''}
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

    try {
        // Buscar histórico e ocorrências
        const { data: historico } = await supabase.from('historico_status').select('*')
            .eq('pedido_id', pedidoId).order('created_at', { ascending: true });

        const { data: ocorrencias } = await supabase.from('ocorrencias').select('*')
            .eq('pedido_id', pedidoId).order('created_at', { ascending: true });

        const fotoPlaca = ocorrencias?.find(o => o.tipo === 'foto_placa');
        const ocorrenciasReais = ocorrencias?.filter(o => o.tipo === 'ocorrencia') || [];

        // Registrar na tabela ocorrencias como pdf_fiscal (para o fiscal acessar)
        const { error } = await supabase.from('ocorrencias').insert({
            pedido_id: parseInt(pedidoId),
            tipo: 'pdf_fiscal',
            descricao: `PDF gerado automaticamente — pedido em transporte`,
            usuario_nome: 'Sistema',
            usuario_perfil: 'sistema',
            dados_extras: JSON.stringify({
                pedido, historico, ocorrencias,
                gerado_em: new Date().toISOString()
            })
        });

        if (error) console.warn('Erro ao salvar PDF fiscal:', error.message);
        else console.log('✅ PDF fiscal registrado para pedido #' + pedidoId);

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

async function gerarEspelhoCarga(placaCegonha) {
    const veiculo = veiculosGlobais.find(v => v.placa === placaCegonha);
    const pedidos = pedidosGlobais.filter(p =>
        p.placaCegonha === placaCegonha &&
        !['Entregue', 'Cancelado'].includes(p.status)
    );

    if (pedidos.length === 0) {
        alert('Nenhum pedido alocado nesta cegonha.');
        return;
    }

    // Buscar dados completos dos clientes para CPF/CNPJ
    let clientesMap = {};
    try {
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
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const numDoc = `MM-${placaCegonha.replace(/[^A-Z0-9]/gi,'')}-${Date.now().toString().slice(-6)}`;

    // Encontrar rota principal (mais comum)
    const rotaCount = {};
    pedidos.forEach(p => {
        const r = `${p.cidadeOrigem||''}/${p.ufOrigem||''} → ${p.cidadeDestino||''}/${p.ufDestino||''}`;
        rotaCount[r] = (rotaCount[r] || 0) + 1;
    });
    const rotaPrincipal = Object.entries(rotaCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

    // Linhas dos veículos transportados
    const linhasVeiculos = pedidos.map((p, i) => {
        const cli = clientesMap[p.clienteId] || clientesMap[p.cliente] || {};
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
            <td style="font-size:0.82rem">${p.enderecoColeta || '—'}</td>
            <td style="font-size:0.82rem">${p.enderecoEntrega || '—'}</td>
            <td class="right"><strong>R$ ${valor}</strong></td>
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

    // Registrar na tabela ocorrencias para o fiscal acessar
    try {
        await supabase.from('ocorrencias').insert({
            pedido_id: pedidos[0].id, // referência ao primeiro pedido
            tipo: 'pdf_fiscal',
            descricao: `Espelho de carga — Cegonha ${placaCegonha} — ${pedidos.length} veículo(s)`,
            usuario_nome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
            usuario_perfil: 'logistica',
            dados_extras: JSON.stringify({
                placa_cegonha: placaCegonha,
                total_pedidos: pedidos.length,
                total_frete: totalFrete,
                pedidos_ids: pedidos.map(p => p.id),
                gerado_em: new Date().toISOString()
            })
        });
    } catch(e) {
        console.warn('Erro ao registrar PDF:', e);
    }

    // Abrir PDF em nova aba
    const janela = window.open('', '_blank');
    janela.document.write(html);
    janela.document.close();
}