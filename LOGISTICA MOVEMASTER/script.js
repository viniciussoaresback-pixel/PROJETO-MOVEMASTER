// ============================================
// CONFIGURAÇÃO GLOBAL E VARIÁVEIS
// ============================================

let pedidosGlobais = [];
let clientesGlobais = [];
let motoristasGlobais = [];
let veiculosGlobais = [];
let estadosBrasil = [];
let cidadesPorEstado = {};

// ============================================
// UTILITÁRIOS
// ============================================

function exibirMensagem(elementId, texto, tipo) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.textContent = texto;
    el.className = 'message show ' + tipo;

    clearTimeout(el._timeoutId);
    el._timeoutId = setTimeout(() => {
        el.classList.remove('show');
    }, 5000);
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // A função inicializarSupabase() já existe no seu supabase-config.js
    if (typeof inicializarSupabase === 'function') {
        inicializarSupabase();
    }
    inicializarAplicacao();
});

function inicializarAplicacao() {
    carregarEstadosIBGE();
    carregarDadosDoSupabase();

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', trocarAba);
    });

    const formComercial = document.getElementById('formComercial');
    if (formComercial) {
        formComercial.addEventListener('submit', salvarPedidoComercial);
    }

    const ufOrigem = document.getElementById('ufOrigem');
    const ufDestino = document.getElementById('ufDestino');
    if (ufOrigem) ufOrigem.addEventListener('change', function() { carregarCidadesIBGE(this.value, 'cidadeOrigem'); });
    if (ufDestino) ufDestino.addEventListener('change', function() { carregarCidadesIBGE(this.value, 'cidadeDestino'); });

    const btnCarregarPainel = document.getElementById('btnCarregarPainel');
    if (btnCarregarPainel) {
        btnCarregarPainel.addEventListener('click', carregarPainel);
    }

    const btnCarregarPedidos = document.getElementById('btnCarregarPedidos');
    if (btnCarregarPedidos) {
        btnCarregarPedidos.addEventListener('click', carregarPedidosPendentes);
    }

    const btnCarregarFaturamento = document.getElementById('btnCarregarFaturamento');
    if (btnCarregarFaturamento) {
        btnCarregarFaturamento.addEventListener('click', carregarFaturamento);
    }

    configurarModal();

    const formLogistica = document.getElementById('formLogistica');
    if (formLogistica) {
        formLogistica.addEventListener('submit', salvarAlteracoesLogistica);
    }

    const formCadastroCliente = document.getElementById('formCadastroCliente');
    if (formCadastroCliente) {
        formCadastroCliente.addEventListener('submit', salvarCadastroCliente);
    }

    const formCadastroMotorista = document.getElementById('formCadastroMotorista');
    if (formCadastroMotorista) {
        formCadastroMotorista.addEventListener('submit', salvarCadastroMotorista);
    }

    const formCadastroVeiculo = document.getElementById('formCadastroVeiculo');
    if (formCadastroVeiculo) {
        formCadastroVeiculo.addEventListener('submit', salvarCadastroVeiculo);
    }

    const dataSolicitacao = document.getElementById('dataSolicitacao');
    if (dataSolicitacao) {
        dataSolicitacao.valueAsDate = new Date();
    }

    preencherSelects();
    aplicarMascaras();
}

// ============================================
// INTEGRAÇÃO COM SUPABASE
// ============================================

async function carregarDadosDoSupabase() {
    // A variável 'supabase' vem do seu arquivo supabase-config.js
    if (!supabase) {
        console.warn('Supabase não inicializado ou sem chaves configuradas. Carregando dados de exemplo...');
        carregarDadosExemplo();
        return;
    }

    try {
        // Carregar clientes
        const { data: clientes, error: erroClientes } = await supabase
            .from('clientes')
            .select('*')
            .order('nome', { ascending: true });

        if (!erroClientes) {
            clientesGlobais = (clientes || []).map(c => c.nome); // Adaptado para seu código que usa array de strings
        }

        // Carregar motoristas
        const { data: motoristas, error: erroMotoristas } = await supabase
            .from('motoristas')
            .select('*')
            .order('nome', { ascending: true });

        if (!erroMotoristas) {
            motoristasGlobais = (motoristas || []).map(m => m.nome); // Adaptado para seu código que usa array de strings
        }

        // Carregar veículos
        const { data: veiculos, error: erroVeiculos } = await supabase
            .from('veiculos')
            .select('*')
            .order('placa', { ascending: true });

        if (!erroVeiculos) {
            veiculosGlobais = (veiculos || []).map(v => ({
                placa: v.placa,
                tipo: v.tipo || 'Cegonha',
                capacidade: v.capacidade || 4
            }));
        }

        // Carregar pedidos
        const { data: pedidos, error: erroPedidos } = await supabase
            .from('pedidos')
            .select('*')
            .order('created_at', { ascending: false });

        if (!erroPedidos) {
            pedidosGlobais = (pedidos || []).map(normalizarPedidoDoSupabase);
        }

        preencherSelects();
    } catch (error) {
        console.error('Erro geral ao carregar dados do Supabase:', error);
        carregarDadosExemplo();
    }
}

function normalizarPedidoDoSupabase(pedido) {
    return {
        id: pedido.id,
        cliente: pedido.cliente,
        dataSolicitacao: pedido.data_solicitacao,
        modelo: pedido.modelo,
        placa: pedido.placa,
        cidadeOrigem: pedido.cidade_origem,
        ufOrigem: pedido.uf_origem,
        cidadeDestino: pedido.cidade_destino,
        ufDestino: pedido.uf_destino,
        enderecoColeta: pedido.endereco_coleta || '',
        enderecoEntrega: pedido.endereco_entrega || '',
        valorFrete: parseFloat(pedido.valor_frete) || 0,
        responsavelComercial: pedido.responsavel_comercial || '',
        status: pedido.status || 'Pendente',
        rota: pedido.rota || '',
        motorista1: pedido.motorista_1 || '',
        percentMotorista1: parseFloat(pedido.percent_motorista_1) || 0,
        motorista2: pedido.motorista_2 || '',
        percentMotorista2: parseFloat(pedido.percent_motorista_2) || 0,
        placaCegonha: pedido.placa_cegonha || '',
        dataPrevColeta: pedido.data_prev_coleta || '',
        dataPrevEntrega: pedido.data_prev_entrega || ''
    };
}

// ============================================
// INTEGRAÇÃO COM API DO IBGE
// ============================================

function carregarEstadosIBGE() {
    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados')
        .then(response => response.json())
        .then(data => {
            estadosBrasil = data.sort((a, b) => a.nome.localeCompare(b.nome));
            preencherSelectEstados();
        })
        .catch(error => {
            console.error('Erro ao carregar estados:', error);
            carregarEstadosManual();
        });
}

function carregarEstadosManual() {
    estadosBrasil = [
        { id: 35, nome: 'São Paulo', sigla: 'SP' },
        { id: 33, nome: 'Rio de Janeiro', sigla: 'RJ' },
        { id: 31, nome: 'Minas Gerais', sigla: 'MG' },
        { id: 29, nome: 'Bahia', sigla: 'BA' },
        { id: 43, nome: 'Rio Grande do Sul', sigla: 'RS' },
        { id: 41, nome: 'Paraná', sigla: 'PR' },
        { id: 42, nome: 'Santa Catarina', sigla: 'SC' },
        { id: 52, nome: 'Goiás', sigla: 'GO' },
        { id: 53, nome: 'Distrito Federal', sigla: 'DF' },
        { id: 32, nome: 'Espírito Santo', sigla: 'ES' },
        { id: 26, nome: 'Pernambuco', sigla: 'PE' },
        { id: 23, nome: 'Ceará', sigla: 'CE' },
        { id: 15, nome: 'Pará', sigla: 'PA' },
        { id: 21, nome: 'Maranhão', sigla: 'MA' },
        { id: 25, nome: 'Paraíba', sigla: 'PB' },
        { id: 24, nome: 'Rio Grande do Norte', sigla: 'RN' },
        { id: 27, nome: 'Alagoas', sigla: 'AL' },
        { id: 28, nome: 'Sergipe', sigla: 'SE' },
        { id: 22, nome: 'Piauí', sigla: 'PI' },
        { id: 17, nome: 'Tocantins', sigla: 'TO' },
        { id: 12, nome: 'Acre', sigla: 'AC' },
        { id: 13, nome: 'Amazonas', sigla: 'AM' },
        { id: 16, nome: 'Amapá', sigla: 'AP' },
        { id: 11, nome: 'Rondônia', sigla: 'RO' },
        { id: 14, nome: 'Roraima', sigla: 'RR' },
        { id: 51, nome: 'Mato Grosso', sigla: 'MT' },
        { id: 50, nome: 'Mato Grosso do Sul', sigla: 'MS' }
    ];
    preencherSelectEstados();
}

function preencherSelectEstados() {
    const ufOrigem = document.getElementById('ufOrigem');
    const ufDestino = document.getElementById('ufDestino');

    [ufOrigem, ufDestino].forEach(select => {
        if (select) {
            while (select.options.length > 1) {
                select.remove(1);
            }

            estadosBrasil.forEach(estado => {
                const option = document.createElement('option');
                option.value = estado.sigla;
                option.textContent = estado.nome;
                select.appendChild(option);
            });
        }
    });
}

function carregarCidadesIBGE(sigla, selectID) {
    if (!sigla) {
        document.getElementById(selectID).innerHTML = '<option value="">Selecione a cidade</option>';
        return;
    }

    if (cidadesPorEstado[sigla]) {
        preencherSelectCidades(cidadesPorEstado[sigla], selectID);
        return;
    }

    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`)
        .then(response => response.json())
        .then(data => {
            const cidades = data.map(m => m.nome).sort();
            cidadesPorEstado[sigla] = cidades;
            preencherSelectCidades(cidades, selectID);
        })
        .catch(error => {
            console.error('Erro ao carregar cidades:', error);
            exibirMensagem('mensagemComercial', 'Erro ao carregar cidades. Tente novamente.', 'error');
        });
}

function preencherSelectCidades(cidades, selectID) {
    const select = document.getElementById(selectID);
    if (!select) return;

    select.innerHTML = '<option value="">Selecione a cidade</option>';

    cidades.forEach(cidade => {
        const option = document.createElement('option');
        option.value = cidade;
        option.textContent = cidade;
        select.appendChild(option);
    });
}

// ============================================
// NAVEGAÇÃO ENTRE ABAS
// ============================================

function trocarAba(event) {
    const tabName = event.currentTarget.getAttribute('data-tab');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// ============================================
// DADOS DE EXEMPLO (FALLBACK)
// ============================================

function carregarDadosExemplo() {
    clientesGlobais = ['Transportadora ABC', 'Logística XYZ', 'Fretes Rápidos'];
    motoristasGlobais = ['João Silva', 'Maria Santos', 'Pedro Oliveira'];
    veiculosGlobais = [
        { placa: 'ABC-1234', tipo: 'Cegonha', capacidade: 4 },
        { placa: 'DEF-5678', tipo: 'Guincho', capacidade: 2 },
        { placa: 'GHI-9012', tipo: 'Prancha', capacidade: 2 }
    ];
    pedidosGlobais = [];
}

// ============================================
// PREENCHIMENTO DE SELECTS
// ============================================

function preencherSelects() {
    const selectCliente = document.getElementById('cliente');
    if (selectCliente) {
        while (selectCliente.options.length > 1) {
            selectCliente.remove(1);
        }
        clientesGlobais.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente;
            option.textContent = cliente;
            selectCliente.appendChild(option);
        });
    }

    const selectMotorista1 = document.getElementById('motorista1');
    const selectMotorista2 = document.getElementById('motorista2');

    [selectMotorista1, selectMotorista2].forEach(select => {
        if (select) {
            while (select.options.length > 1) {
                select.remove(1);
            }
            motoristasGlobais.forEach(motorista => {
                const option = document.createElement('option');
                option.value = motorista;
                option.textContent = motorista;
                select.appendChild(option);
            });
        }
    });

    const selectVeiculo1 = document.getElementById('veiculo1');
    const selectVeiculo2 = document.getElementById('veiculo2');

    [selectVeiculo1, selectVeiculo2].forEach(select => {
        if (select) {
            while (select.options.length > 1) {
                select.remove(1);
            }
            veiculosGlobais.forEach(veiculo => {
                const option = document.createElement('option');
                option.value = veiculo.placa;
                option.textContent = `${veiculo.placa} (${veiculo.tipo} - ${veiculo.capacidade} vagas)`;
                select.appendChild(option);
            });
        }
    });

    preencherSelectMotoristasFaturamento();
}

function preencherSelectMotoristasFaturamento() {
    const selectMotorista = document.getElementById('motoristaSelecionado');
    if (selectMotorista) {
        while (selectMotorista.options.length > 1) {
            selectMotorista.remove(1);
        }
        motoristasGlobais.forEach(motorista => {
            const option = document.createElement('option');
            option.value = motorista;
            option.textContent = motorista;
            selectMotorista.appendChild(option);
        });
    }
}

// ============================================
// LANÇAMENTO COMERCIAL
// ============================================

async function salvarPedidoComercial(event) {
    if (event) event.preventDefault();

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
        valorFrete: parseFloat(document.getElementById('valorFrete').value) || 0,
        responsavelComercial: document.getElementById('responsavelComercial').value
    };

    if (!pedido.cliente || !pedido.dataSolicitacao || !pedido.modelo || !pedido.placa || !pedido.valorFrete) {
        exibirMensagem('mensagemComercial', 'Preencha os campos obrigatórios!', 'error');
        return;
    }

    if (supabase) {
        try {
            // Montamos o objeto de salvamento usando apenas as colunas existentes na tabela
            const dadosParaSalvar = {
                cliente: pedido.cliente,
                data_solicitacao: pedido.dataSolicitacao,
                modelo: pedido.modelo,
                placa: pedido.placa,
                cidade_origem: pedido.cidadeOrigem,
                uf_origem: pedido.ufOrigem,
                cidade_destino: pedido.cidadeDestino,
                uf_destino: pedido.ufDestino,
                endereco_coleta: pedido.enderecoColeta,
                endereco_entrega: pedido.enderecoEntrega,
                valor_frete: pedido.valorFrete,
                responsavel_comercial: pedido.responsavelComercial,
                status: 'Pendente'
            };

            // Enviamos o objeto direto (sem colchetes)
            const { data, error } = await supabase
                .from('pedidos')
                .insert(dadosParaSalvar)
                .select();

            if (error) throw error;

            pedidosGlobais.push(data[0]);

            await carregarPainel();
            await carregarPedidosPendentes();
            await carregarFaturamento();

            exibirMensagem('mensagemComercial', 'Pedido comercial salvo com sucesso!', 'success');
            document.getElementById('formComercial').reset();
            fecharModal('modalNovoPedido');

        } catch (error) {
            console.error('Erro ao salvar pedido:', error);
            exibirMensagem('mensagemComercial', 'Erro ao salvar no banco: ' + error.message, 'error');
        }
    } else {
        // Fallback local se estiver offline
        pedidosGlobais.push(pedido);
        carregarPainel();
        carregarPedidosPendentes();
        carregarFaturamento();
        exibirMensagem('mensagemComercial', 'Pedido salvo localmente (Offline)!', 'success');
        document.getElementById('formComercial').reset();
        fecharModal('modalNovoPedido');
    }
}

function validarPedido(pedido) {
    return pedido.cliente && pedido.dataSolicitacao && pedido.modelo && pedido.placa &&
           pedido.cidadeOrigem && pedido.ufOrigem && pedido.cidadeDestino && pedido.ufDestino &&
           pedido.enderecoColeta && pedido.enderecoEntrega &&
           !isNaN(pedido.valorFrete) && pedido.responsavelComercial;
}

// ============================================
// PAINEL DE OCUPAÇÃO
// ============================================

async function carregarPainel() {
    if (supabase) {
        try {
            await carregarDadosDoSupabase();
            renderizarPainel();
        } catch (error) {
            console.error('Erro ao carregar painel:', error);
            renderizarPainel();
        }
    } else {
        renderizarPainel();
    }
}

function renderizarPainel() {
    const painelContainer = document.getElementById('painelOcupacao');
    if (!painelContainer) return;

    painelContainer.innerHTML = '';

    if (veiculosGlobais.length === 0) {
        painelContainer.innerHTML = '<p class="text-center">Nenhum veículo cadastrado.</p>';
        return;
    }

    veiculosGlobais.forEach(veiculo => {
        const pedidosDoVeiculo = pedidosGlobais.filter(p =>
            p.placaCegonha === veiculo.placa &&
            p.status !== 'Entregue' && p.status !== 'Cancelado'
        );

        const ocupadas = pedidosDoVeiculo.length;
        const capacidade = veiculo.capacidade || 4;
        const livres = Math.max(capacidade - ocupadas, 0);
        const percentOcupacao = capacidade > 0 ? Math.round((ocupadas / capacidade) * 100) : 0;

        let corBadge = 'badge-success';
        if (percentOcupacao >= 100) corBadge = 'badge-danger';
        else if (percentOcupacao >= 50) corBadge = 'badge-warning';

        const listaPedidos = pedidosDoVeiculo.map(p =>
            `<p>• ${p.cliente || 'Cliente não informado'} — ${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''} <span class="badge badge-pending">${p.status}</span></p>`
        ).join('');

        const card = document.createElement('div');
        card.className = 'painel-card';
        card.innerHTML = `
            <div class="painel-header">
                <h3>${veiculo.placa} (${veiculo.tipo || 'Cegonha'})</h3>
                <span class="badge ${corBadge}">${ocupadas}/${capacidade} vagas</span>
            </div>
            <div class="painel-body">
                <p><strong>Ocupação:</strong> ${percentOcupacao}%</p>
                <p><strong>Vagas livres:</strong> ${livres}</p>
                ${listaPedidos || '<p>Nenhum veículo alocado nesta cegonha.</p>'}
            </div>
        `;

        painelContainer.appendChild(card);
    });
}

// ============================================
// GESTÃO LOGÍSTICA — PEDIDOS PENDENTES E MODAL
// ============================================

async function carregarPedidosPendentes() {
    if (supabase) {
        try {
            await carregarDadosDoSupabase();
            renderizarTabelaPedidosPendentes();
        } catch (error) {
            console.error('Erro ao carregar pedidos:', error);
            renderizarTabelaPedidosPendentes();
        }
    } else {
        renderizarTabelaPedidosPendentes();
    }
}

function renderizarTabelaPedidosPendentes() {
    const corpo = document.getElementById('corpoTabelaPedidos');
    if (!corpo) return;

    const pendentes = pedidosGlobais.filter(p => p.status === 'Pendente');

    if (pendentes.length === 0) {
        corpo.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum pedido pendente.</td></tr>';
        return;
    }

    corpo.innerHTML = '';
    pendentes.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.id}</td>
            <td>${p.cliente || ''}</td>
            <td>${p.modelo || ''}</td>
            <td>${p.placa || ''}</td>
            <td>${p.cidadeOrigem || ''}/${p.ufOrigem || ''}</td>
            <td>${p.cidadeDestino || ''}/${p.ufDestino || ''}</td>
            <td>R$ ${Number(p.valorFrete || 0).toFixed(2)}</td>
            <td><span class="badge badge-pending">${p.status}</span></td>
            <td><button type="button" class="btn btn-primary">Editar</button></td>
        `;
        tr.querySelector('button').addEventListener('click', function() {
            abrirModalEdicao(p);
        });
        corpo.appendChild(tr);
    });
}

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
}

function abrirModalEdicao(pedido) {
    const modal = document.getElementById('modalEdicao');
    if (!modal) return;

    document.getElementById('pedidoID').value = pedido.id;
    document.getElementById('trechoRota').value =
        `${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''} - ${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}`;
    document.getElementById('veiculo1').value = pedido.placaCegonha || '';
    document.getElementById('motorista1').value = pedido.motorista1 || '';
    document.getElementById('percentMotorista1').value = pedido.percentMotorista1 || 100;
    document.getElementById('veiculo2').value = '';
    document.getElementById('motorista2').value = pedido.motorista2 || '';
    document.getElementById('percentMotorista2').value = pedido.percentMotorista2 || 0;
    document.getElementById('dataPrevColeta').value = pedido.dataPrevColeta || '';
    document.getElementById('dataPrevEntrega').value = pedido.dataPrevEntrega || '';

    modal.classList.add('show');
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
        placaCegonha: document.getElementById('veiculo1').value,
        motorista1: document.getElementById('motorista1').value,
        percentMotorista1: percent1,
        motorista2: document.getElementById('motorista2').value,
        percentMotorista2: percent2,
        dataPrevColeta: document.getElementById('dataPrevColeta').value,
        dataPrevEntrega: document.getElementById('dataPrevEntrega').value,
        status: 'Em Rota'
    };

    function aplicarLocalmente() {
        const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoID));
        if (pedido) Object.assign(pedido, alteracoes);
    }

    if (supabase) {
        try {
            const { error } = await supabase
                .from('pedidos')
                .update({
                    rota: alteracoes.rota,
                    placa_cegonha: alteracoes.placaCegonha,
                    motorista_1: alteracoes.motorista1,
                    percent_motorista_1: alteracoes.percentMotorista1,
                    motorista_2: alteracoes.motorista2,
                    percent_motorista_2: alteracoes.percentMotorista2,
                    data_prev_coleta: alteracoes.dataPrevColeta,
                    data_prev_entrega: alteracoes.dataPrevEntrega,
                    status: alteracoes.status
                })
                .eq('id', pedidoID);

            if (error) throw error;

            aplicarLocalmente();
            exibirMensagem('mensagemLogistica', 'Pedido alocado com sucesso!', 'success');
            document.getElementById('modalEdicao').classList.remove('show');
            renderizarTabelaPedidosPendentes();
        } catch (error) {
            console.error('Erro ao salvar alterações:', error);
            exibirMensagem('mensagemLogistica', 'Erro ao salvar: ' + error.message, 'error');
        }
    } else {
        aplicarLocalmente();
        exibirMensagem('mensagemLogistica', 'Pedido alocado com sucesso (modo local)!', 'success');
        document.getElementById('modalEdicao').classList.remove('show');
        renderizarTabelaPedidosPendentes();
    }
}

// ============================================
// FATURAMENTO POR MOTORISTA
// ============================================

async function carregarFaturamento() {
    const selectMotorista = document.getElementById('motoristaSelecionado');
    const motoristaFiltro = selectMotorista ? selectMotorista.value : '';

    if (supabase) {
        try {
            await carregarDadosDoSupabase();
            renderizarTabelaFaturamento(motoristaFiltro);
        } catch (error) {
            console.error('Erro ao carregar faturamento:', error);
            renderizarTabelaFaturamento(motoristaFiltro);
        }
    } else {
        renderizarTabelaFaturamento(motoristaFiltro);
    }
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
                data: p.dataPrevColeta || p.dataSolicitacao || '',
                id: p.id,
                cliente: p.cliente,
                trecho: `${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → ${p.cidadeDestino || ''}/${p.ufDestino || ''}`,
                valorFrete: p.valorFrete,
                percent: item.percent,
                valorRecebido: valorRecebido
            });

            totalPorMotorista[item.motorista] = (totalPorMotorista[item.motorista] || 0) + valorRecebido;
        });
    });

    if (linhas.length === 0) {
        corpo.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum faturamento encontrado.</td></tr>';
    } else {
        corpo.innerHTML = '';
        linhas.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${l.data}</td>
                <td>${l.id}</td>
                <td>${l.cliente || ''}</td>
                <td>${l.trecho}</td>
                <td>R$ ${Number(l.valorFrete || 0).toFixed(2)}</td>
                <td>${l.percent}%</td>
                <td>R$ ${l.valorRecebido.toFixed(2)}</td>
            `;
            corpo.appendChild(tr);
        });
    }

    resumo.innerHTML = '';
    const totalGeral = Object.values(totalPorMotorista).reduce((acc, v) => acc + v, 0);

    Object.keys(totalPorMotorista).forEach(motorista => {
        const item = document.createElement('div');
        item.className = 'resumo-item';
        item.innerHTML = `<span>${motorista}</span><strong>R$ ${totalPorMotorista[motorista].toFixed(2)}</strong>`;
        resumo.appendChild(item);
    });

    const totalItem = document.createElement('div');
    totalItem.className = 'resumo-item destaque';
    totalItem.innerHTML = '<span>Total Geral</span><strong>R$ ' + totalGeral.toFixed(2) + '</strong>';
    resumo.appendChild(totalItem);
}

// ============================================
// CADASTROS (CLIENTE, MOTORISTA, VEÍCULO)
// ============================================

async function salvarCadastroCliente(event) {
    event.preventDefault();

    const nome = document.getElementById('nomeCliente').value;
    const cnpj = document.getElementById('cnpjCliente').value || null;
    const cpf  = document.getElementById('cpfCliente').value  || null;
    const telefone = document.getElementById('telefoneCliente').value || null;
    const email    = document.getElementById('emailCliente').value    || null;

    if (!nome || (!cnpj && !cpf)) {
        exibirMensagem('mensagemCadastroCliente', 'Preencha o nome e ao menos CNPJ ou CPF!', 'error');
        return;
    }

    if (supabase) {
        try {
            const { error } = await supabase
    .from('clientes')
    .insert({ nome, cnpj, cpf, telefone, email });

            if (error) throw error;

            clientesGlobais.push(nome);
            preencherSelects();
            exibirMensagem('mensagemCadastroCliente', 'Cliente salvo com sucesso!', 'success');
            document.getElementById('formCadastroCliente').reset();
        } catch (error) {
            console.error('Erro ao salvar cliente:', error);
            exibirMensagem('mensagemCadastroCliente', 'Erro ao salvar: ' + error.message, 'error');
        }
    } else {
        if (!clientesGlobais.includes(nome)) {
            clientesGlobais.push(nome);
            preencherSelects();
        }
        exibirMensagem('mensagemCadastroCliente', 'Cliente salvo (modo local)!', 'success');
        document.getElementById('formCadastroCliente').reset();
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
            const { error } = await supabase
                .from('motoristas')
                .insert({ nome, cpf });

            if (error) throw error;

            motoristasGlobais.push(nome);
            preencherSelects();
            exibirMensagem('mensagemCadastroMotorista', 'Motorista salvo com sucesso!', 'success');
            document.getElementById('formCadastroMotorista').reset();
        } catch (error) {
            console.error('Erro ao salvar motorista:', error);
            exibirMensagem('mensagemCadastroMotorista', 'Erro ao salvar: ' + error.message, 'error');
        }
    } else {
        if (!motoristasGlobais.includes(nome)) {
            motoristasGlobais.push(nome);
            preencherSelects();
        }
        exibirMensagem('mensagemCadastroMotorista', 'Motorista salvo (modo local)!', 'success');
        document.getElementById('formCadastroMotorista').reset();
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

    if (supabase) {
        try {
            const { error } = await supabase
                .from('veiculos')
                .insert({ placa, tipo, capacidade });

            if (error) throw error;

            veiculosGlobais.push({ placa, tipo, capacidade });
            preencherSelects();
            exibirMensagem('mensagemCadastroVeiculo', 'Veículo salvo com sucesso!', 'success');
            document.getElementById('formCadastroVeiculo').reset();
        } catch (error) {
            console.error('Erro ao salvar veículo:', error);
            exibirMensagem('mensagemCadastroVeiculo', 'Erro ao salvar: ' + error.message, 'error');
        }
    } else {
        const jaExiste = veiculosGlobais.some(v => v.placa === placa);
        if (!jaExiste) {
            veiculosGlobais.push({ placa, tipo, capacidade });
            preencherSelects();
        }
        exibirMensagem('mensagemCadastroVeiculo', 'Veículo salvo (modo local)!', 'success');
        document.getElementById('formCadastroVeiculo').reset();
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