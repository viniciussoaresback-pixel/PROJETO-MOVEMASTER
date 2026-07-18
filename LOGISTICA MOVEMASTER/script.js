// ============================================
// CONFIGURAÇÃO GLOBAL E VARIÁVEIS
// ============================================

let pedidosGlobais = [];
let clientesGlobais = [];
let motoristasGlobais = [];
let veiculosGlobais = [];
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

        if (resClientes.data)   clientesGlobais   = resClientes.data;
        if (resMotoristas.data) motoristasGlobais = resMotoristas.data;
        if (resVeiculos.data)   veiculosGlobais   = resVeiculos.data;
        if (resPedidos.data) {
            pedidosGlobais = resPedidos.data.map(p => ({
                id: p.id,
                cliente: p.cliente,
                dataSolicitacao: p.data_solicitacao,
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
                grupoId: p.grupo_id || null,
                createdAt: p.created_at
            }));
        }
        preencherSelects();
        renderizarPedidosComercial();
        atualizarDashboardComercial();
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
            opt.value = m.nome || m; opt.textContent = m.nome || m;
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
        modelo: document.getElementById('modelo').value,
        placa: document.getElementById('placa').value,
        cidadeOrigem: document.getElementById('cidadeOrigem').value,
        ufOrigem: document.getElementById('ufOrigem').value,
        cidadeDestino: document.getElementById('cidadeDestino').value,
        ufDestino: document.getElementById('ufDestino').value,
        enderecoColeta: document.getElementById('enderecoColeta').value,
        enderecoEntrega: document.getElementById('enderecoEntrega').value,
        valorFrete: valorMoedaParaFloat(document.getElementById('valorFrete').value),
        responsavelComercial: document.getElementById('responsavelComercial').value
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

function renderizarKanban() {
    const colunas = {
        'Pendente':  { el: document.getElementById('kanbanPendente'),  count: document.getElementById('countPendente') },
        'Em Rota':   { el: document.getElementById('kanbanEmRota'),    count: document.getElementById('countEmRota') },
        'Entregue':  { el: document.getElementById('kanbanEntregue'),  count: document.getElementById('countEntregue') }
    };

    // Limpar
    Object.values(colunas).forEach(c => { if(c.el) c.el.innerHTML = ''; });

    const contagem = { 'Pendente': 0, 'Em Rota': 0, 'Entregue': 0 };

    pedidosGlobais.forEach(p => {
        const status = p.status || 'Pendente';
        const col = colunas[status] || colunas['Pendente'];
        if (!col.el) return;

        const statusKey = colunas[status] ? status : 'Pendente';
        contagem[statusKey] = (contagem[statusKey] || 0) + 1;

        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.innerHTML = `
            <div class="kanban-card-header">
                <span class="kanban-card-id">#${p.id}</span>
                <span class="status-badge-inline" style="background:${(FLUXO_STATUS[p.status||'Pendente']?.cor||'#888')}20;color:${(FLUXO_STATUS[p.status||'Pendente']?.cor||'#888')};border:1px solid ${(FLUXO_STATUS[p.status||'Pendente']?.cor||'#888')}40;font-size:0.62rem;padding:0.1rem 0.4rem;border-radius:4px">${p.status||'Pendente'}</span>
            </div>
            <div class="kanban-card-cliente">${p.cliente || '—'}</div>
            <div class="kanban-card-rota">
                ${rotaComTransbordoHTML(p)}
            </div>
            <div class="kanban-card-info">🚗 ${p.modelo || ''} · ${p.placa || ''}${p.grupoId ? ` <span class="badge-grupo" title="Cliente com ${pedidosGlobais.filter(x => x.grupoId === p.grupoId).length} veículos neste pedido">🔗 ${pedidosGlobais.filter(x => x.grupoId === p.grupoId).length} carros</span>` : ''}</div>
            ${p.placaCegonha ? `<div class="kanban-card-info">🚛 ${p.placaCegonha}${p.motorista1 ? ' · 👤 ' + p.motorista1 : ''}</div>` : ''}
            ${p.dataPrevColeta ? `<div class="kanban-card-info">📅 ${formatarDataHora(p.dataPrevColeta)}</div>` : ''}
            <div class="kanban-card-footer">
                <span class="kanban-card-valor">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                <div class="kanban-card-acoes">
                    ${(FLUXO_STATUS[p.status||'Pendente']?.proximos?.length > 0) ? `<button class="btn-kanban-status" onclick="abrirModalStatus(${p.id})">Avançar</button>` : ''}
                    <button class="btn-kanban-hist" onclick="abrirHistorico(${p.id})">Histórico</button>
                    ${['Em Coleta','Em Transporte'].includes(p.status) ? `<button class="btn-kanban-ocorr" onclick="abrirRegistrarOcorrencia(${p.id})" title="Registrar Ocorrência">⚠️</button>` : ''}
                    ${p.status === 'Entregue' ? `<button class="btn-kanban-receita" onclick="abrirConfirmarReceita(${p.id})" title="Confirmar Receita">💰</button>` : ''}
                </div>
            </div>
        `;
        col.el.appendChild(card);
    });

    // Atualizar contagens
    Object.entries(contagem).forEach(([status, n]) => {
        const col = colunas[status];
        if (col && col.count) col.count.textContent = n;
    });
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

function renderizarPedidosDrag() {
    const lista = document.getElementById('listaPedidosDrag');
    if (!lista) return;

    const pendentes = pedidosGlobais.filter(p => p.status !== 'Entregue' && p.status !== 'Cancelado');

    if (pendentes.length === 0) {
        lista.innerHTML = '<p class="text-center text-muted">Nenhum pedido pendente 🎉</p>';
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
                <span class="drag-card-valor">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
            </div>
            <div class="drag-card-cliente">${p.cliente || '—'}</div>
            <div class="drag-card-rota">${rotaComTransbordoHTML(p)}</div>
            <div class="drag-card-detalhe">🚗 ${p.modelo || ''} · ${p.placa || ''}</div>
            <div class="drag-card-bottom" draggable="false">
                <span class="status-badge-inline" style="background:${corDrag}20;color:${corDrag};border:1px solid ${corDrag}40;font-size:0.62rem;padding:0.12rem 0.4rem;border-radius:4px">${p.status || 'Pendente'}</span>
                <div class="drag-card-acoes" draggable="false">
                    ${cfgStatus?.proximos?.length > 0 ? `<button draggable="false" class="btn-kanban-status" onclick="event.stopPropagation();event.preventDefault();abrirModalStatus(${p.id})">Avançar</button>` : ''}
                    <button draggable="false" class="btn-kanban-hist" onclick="event.stopPropagation();event.preventDefault();abrirHistorico(${p.id})">Histórico</button>
                    ${['Em Coleta','Em Transporte'].includes(p.status) ? `<button draggable="false" class="btn-kanban-ocorr" onclick="event.stopPropagation();event.preventDefault();abrirRegistrarOcorrencia(${p.id})">⚠️</button>` : ''}
                </div>
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
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            pedidoArrastando = null;
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
                tipo_cliente: tipo,
                cep, endereco, numero, complemento, bairro, cidade, uf,
                codigo
            });
            if (error) throw error;
            await carregarDadosDoSupabase();
            exibirMensagem('mensagemCadastroCliente', '✅ Cliente salvo com sucesso!', 'success');
            document.getElementById('formCadastroCliente').reset();
        } catch (error) {
            exibirMensagem('mensagemCadastroCliente', 'Erro ao salvar: ' + error.message, 'error');
        }
    }
}

// Ajusta label e campos conforme tipo de cliente
function ajustarFormCliente(tipo) {
    const labelNome = document.getElementById('labelNomeCliente');
    const grupoCnpj = document.getElementById('grupoCnpj');
    const grupoCpf  = document.getElementById('grupoCpf');

    const tiposPJ = ['empresa','concessionaria','locadora'];
    const tiposPF = ['garagista','particular'];

    if (tiposPJ.includes(tipo)) {
        labelNome.textContent = 'Razão Social *';
        grupoCnpj.style.display = '';
        grupoCpf.style.display = 'none';
        document.getElementById('cpfCliente').value = '';
    } else if (tiposPF.includes(tipo)) {
        labelNome.textContent = 'Nome Completo *';
        grupoCnpj.style.display = 'none';
        grupoCpf.style.display = '';
        document.getElementById('cnpjCliente').value = '';
    } else {
        labelNome.textContent = 'Nome *';
        grupoCnpj.style.display = '';
        grupoCpf.style.display = '';
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

    if (supabase) {
        try {
            const { error } = await supabase.from('motoristas').insert({ nome, cpf });
            if (error) throw error;
            await carregarDadosDoSupabase();
            exibirMensagem('mensagemCadastroMotorista', 'Motorista salvo com sucesso!', 'success');
            document.getElementById('formCadastroMotorista').reset();
        } catch (error) {
            exibirMensagem('mensagemCadastroMotorista', 'Erro ao salvar: ' + error.message, 'error');
        }
    }
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

    if (supabase) {
        try {
            const { error } = await supabase.from('veiculos').insert({ placa, tipo, capacidade, renavam, chassi, marca, modelo, ano });
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

    if (novoStatus === 'Transbordo') {
        grupoObs.style.display = 'block';
        grupoTransbordo.style.display = 'block';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Motivo do Transbordo';
    } else if (novoStatus === 'Intenção Agendada' && document.getElementById('statusAtual').value === 'Transbordo') {
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

    if (!statusNovo) {
        msgEl.textContent = 'Selecione o próximo status.';
        msgEl.className = 'message show error';
        return;
    }

    if (statusNovo === 'Transbordo' && !cidadeTransbordo) {
        msgEl.textContent = 'Selecione o pátio do transbordo.';
        msgEl.className = 'message show error';
        return;
    }

    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin';
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Sistema';

    try {
        // 1. Atualizar status no pedido
        const atualizacao = { status: statusNovo };
        if (statusNovo === 'Transbordo') {
            // Grava o pátio no próprio pedido (aparece na rota dos cards)
            atualizacao.cidade_transbordo = cidadeTransbordo;
            // O carro fica no pátio e a cegonha segue viagem:
            // libera a vaga e desvincula motoristas para nova alocação
            atualizacao.placa_cegonha = null;
            atualizacao.motorista_1 = null;
            atualizacao.motorista_2 = null;
            atualizacao.percent_motorista_1 = null;
            atualizacao.percent_motorista_2 = null;
        }

        const { error: errPedido } = await supabase
            .from('pedidos')
            .update(atualizacao)
            .eq('id', pedidoId);
        if (errPedido) throw errPedido;

        // 2. Registrar no histórico
        const obsCompleta = statusNovo === 'Transbordo'
            ? `Transbordo em ${cidadeTransbordo}${observacao ? ' — ' + observacao : ''}`
            : observacao || null;

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

    if (tab === 'cegonhas') renderizarPainelCegonhas();
    if (tab === 'fotos') carregarGaleriaFotos('galeria-fotos-logistica');
}

// ============================================
// PAINEL DAS CEGONHAS (VISÃO SIMPLIFICADA)
// ============================================

function renderizarPainelCegonhas() {
    const grid = document.getElementById('painelCegonhas');
    if (!grid) return;

    if (veiculosGlobais.length === 0) {
        grid.innerHTML = '<p class="text-center text-muted">Nenhum veículo cadastrado.</p>';
        return;
    }

    grid.innerHTML = '';

    veiculosGlobais.forEach(v => {
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
                    title="#${p.id} — ${p.cliente}">
                    <span class="vaga-id">#${p.id}</span>
                    <span class="vaga-cliente">${(p.cliente||'').split(' ')[0]}</span>
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
                </div>
                <span class="cegonha-pct" style="color:${corPct}">${pct}% ocupado</span>
            </div>
            <div class="cegonha-motorista">
                👤 <span>${motorista}</span>
                <button class="btn-vincular-motorista" onclick="abrirVincularMotorista('${v.placa}','${v.id||''}')">Alterar</button>
            </div>
            <div class="cegonha-vagas-grid">${vagasHTML}</div>
            <div class="cegonha-barra">
                <div class="cegonha-barra-inner" style="width:${pct}%;background:${corPct}"></div>
            </div>
            <div class="cegonha-footer">
                <span>${pedidosNaCegonha.length}/${capacidade} vagas</span>
                <span style="color:#4ade80">R$ ${pedidosNaCegonha.reduce((a,p)=>a+(parseFloat(p.valorFrete)||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                <button class="btn-gerar-pdf-cegonha" onclick="gerarEspelhoCarga('${v.placa}')" 
                    ${pedidosNaCegonha.length === 0 ? 'disabled title="Nenhum pedido alocado"' : 'title="Gerar espelho de carga para o fiscal"'}>
                    📄 Espelho de Carga
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ============================================
// MOVER / REMOVER / CANCELAR PEDIDO
// ============================================

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
    if (abaAtiva?.id === 'logTab-cegonhas') renderizarPainelCegonhas();
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
            </td>
            <td>${p.modelo || '—'}<br><small style="color:#666">${p.placa || '—'}</small></td>
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