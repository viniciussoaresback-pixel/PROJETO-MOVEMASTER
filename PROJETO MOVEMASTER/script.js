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

// FUNÇÃO ADICIONADA: era chamada em vários lugares (salvarPedidoComercial,
// carregarCidadesIBGE, salvarAlteracoesLogistica, cadastros...) mas nunca
// tinha sido definida. Sem ela, qualquer tentativa de salvar algo quebrava
// o script inteiro.
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
    inicializarAplicacao();
});

function inicializarAplicacao() {
    carregarEstadosIBGE();
    carregarDadosDoSheets();

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

// BUG CORRIGIDO: os códigos "id" (código IBGE da UF) estavam errados e
// havia duplicidade (26 aparecia tanto para Distrito Federal quanto para
// Pernambuco). Os códigos abaixo são os códigos oficiais do IBGE por UF.
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

// BUG CORRIGIDO: usava event.target, que pode ser um elemento filho do
// botão (ícone, span, etc.) sem o atributo data-tab, quebrando a troca de
// aba. event.currentTarget sempre é o elemento que tem o listener.
function trocarAba(event) {
    const tabName = event.currentTarget.getAttribute('data-tab');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// ============================================
// INTEGRAÇÃO COM GOOGLE SHEETS
// ============================================

function carregarDadosDoSheets() {
    if (typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(processarDadosSheets).obterDadosDoSheets();
    } else {
        carregarDadosExemplo();
    }
}

// BUG CORRIGIDO: o Code.gs devolve "cegonhas" (lista simples de placas),
// mas aqui se esperava "veiculos" (lista de objetos {placa,tipo,capacidade}).
// Também normaliza os pedidos: quando vêm do Sheets, as chaves são os
// cabeçalhos em português ("Cliente", "Valor do Frete"...); quando vêm de
// salvarPedidoComercial em modo local, as chaves já são camelCase
// (cliente, valorFrete...). Sem essa normalização, renderizarPainel() e
// o faturamento quebram dependendo de onde o pedido veio.
function processarDadosSheets(dados) {
    if (dados) {
        clientesGlobais = dados.clientes || [];
        motoristasGlobais = dados.motoristas || [];

        const veiculosBrutos = dados.veiculos || dados.cegonhas || [];
        veiculosGlobais = veiculosBrutos.map(normalizarVeiculo);

        const pedidosBrutos = dados.pedidos || [];
        pedidosGlobais = pedidosBrutos.map(p =>
            p.cliente !== undefined ? p : normalizarPedidoDoSheets(p)
        );

        preencherSelects();
    }
}

function normalizarVeiculo(v) {
    if (typeof v === 'object' && v !== null && v.placa) return v;
    return { placa: v, tipo: 'Cegonha', capacidade: 4 };
}

function normalizarPedidoDoSheets(pedidoBruto) {
    return {
        id: pedidoBruto['ID do Pedido'],
        dataInsercao: pedidoBruto['Data de Inserção'],
        cliente: pedidoBruto['Cliente'],
        dataSolicitacao: pedidoBruto['Data de Solicitação'],
        modelo: pedidoBruto['Modelo'],
        placa: pedidoBruto['Placa'],
        cidadeOrigem: pedidoBruto['Cidade Origem'],
        ufOrigem: pedidoBruto['UF Origem'],
        cidadeDestino: pedidoBruto['Cidade Destino'],
        ufDestino: pedidoBruto['UF Destino'],
        enderecoColeta: pedidoBruto['Endereço Coleta'],
        enderecoEntrega: pedidoBruto['Endereço Entrega'],
        valorFrete: parseFloat(pedidoBruto['Valor do Frete']) || 0,
        responsavelComercial: pedidoBruto['Responsável Comercial'],
        status: pedidoBruto['Status'] || 'Pendente',
        rota: pedidoBruto['Rota'] || '',
        motorista1: pedidoBruto['Motorista 1'] || '',
        percentMotorista1: parseFloat(pedidoBruto['% Motorista 1']) || 0,
        motorista2: pedidoBruto['Motorista 2'] || '',
        percentMotorista2: parseFloat(pedidoBruto['% Motorista 2']) || 0,
        placaCegonha: pedidoBruto['Placa Cegonha'] || '',
        dataPrevColeta: pedidoBruto['Data Previsão Coleta'] || '',
        dataPrevEntrega: pedidoBruto['Data Previsão Entrega'] || ''
    };
}

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

function salvarPedidoComercial(event) {
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
        valorFrete: parseFloat(document.getElementById('valorFrete').value),
        responsavelComercial: document.getElementById('responsavelComercial').value
    };

    if (!validarPedido(pedido)) {
        exibirMensagem('mensagemComercial', 'Preencha todos os campos obrigatórios!', 'error');
        return;
    }

    if (typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(function(resultado) {
            if (resultado.sucesso) {
                exibirMensagem('mensagemComercial', 'Pedido salvo com sucesso! ID: ' + resultado.id, 'success');
                document.getElementById('formComercial').reset();
                document.getElementById('dataSolicitacao').valueAsDate = new Date();

                const novoPedido = Object.assign({}, pedido, {
                    id: resultado.id,
                    status: 'Pendente'
                });
                pedidosGlobais.push(novoPedido);
            } else {
                exibirMensagem('mensagemComercial', 'Erro ao salvar pedido: ' + resultado.erro, 'error');
            }
        }).salvarPedidoNoSheets(pedido);
    } else {
        const novoID = Math.max(...pedidosGlobais.map(p => p.id || 0), 0) + 1;
        pedido.id = novoID;
        pedido.status = 'Pendente';
        pedidosGlobais.push(pedido);
        exibirMensagem('mensagemComercial', 'Pedido salvo com sucesso (modo local)! ID: ' + novoID, 'success');
        document.getElementById('formComercial').reset();
        document.getElementById('dataSolicitacao').valueAsDate = new Date();
    }
}

// BUG CORRIGIDO: "pedido.valorFrete &&" tratava 0 (frete gratuito, um
// valor numérico válido) como campo vazio, já que 0 é falsy em JS.
// Agora valida separadamente com isNaN, que só rejeita valor ausente/inválido.
function validarPedido(pedido) {
    return pedido.cliente && pedido.dataSolicitacao && pedido.modelo && pedido.placa &&
           pedido.cidadeOrigem && pedido.ufOrigem && pedido.cidadeDestino && pedido.ufDestino &&
           pedido.enderecoColeta && pedido.enderecoEntrega &&
           !isNaN(pedido.valorFrete) && pedido.responsavelComercial;
}

// ============================================
// PAINEL DE OCUPAÇÃO
// ============================================

function carregarPainel() {
    if (typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(function(dados) {
            if (dados) {
                pedidosGlobais = dados.pedidos || [];
                veiculosGlobais = dados.veiculos || [];
                renderizarPainel();
            }
        }).obterDadosDoSheets();
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

function carregarPedidosPendentes() {
    if (typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(function(dados) {
            if (dados) {
                processarDadosSheets(dados);
                renderizarTabelaPedidosPendentes();
            }
        }).obterDadosDoSheets();
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

function configurarModal() {
    const modal = document.getElementById('modalEdicao');
    if (!modal) return;

    const btnFechar = document.getElementById('btnFecharModal');
    const spanFechar = modal.querySelector('.close');

    function fecharModal() {
        modal.classList.remove('show');
    }

    if (btnFechar) btnFechar.addEventListener('click', fecharModal);
    if (spanFechar) spanFechar.addEventListener('click', fecharModal);

    modal.addEventListener('click', function(event) {
        if (event.target === modal) fecharModal();
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

function salvarAlteracoesLogistica(event) {
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

    if (typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(function(resultado) {
            if (resultado.sucesso) {
                aplicarLocalmente();
                exibirMensagem('mensagemLogistica', 'Pedido alocado com sucesso!', 'success');
                document.getElementById('modalEdicao').classList.remove('show');
                renderizarTabelaPedidosPendentes();
            } else {
                exibirMensagem('mensagemLogistica', 'Erro ao salvar: ' + resultado.erro, 'error');
            }
        }).atualizarPedidoNoSheets(pedidoID, alteracoes);
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

function carregarFaturamento() {
    const selectMotorista = document.getElementById('motoristaSelecionado');
    const motoristaFiltro = selectMotorista ? selectMotorista.value : '';

    if (typeof google !== 'undefined' && google.script) {
        google.script.run.withSuccessHandler(function(dados) {
            if (dados) {
                processarDadosSheets(dados);
                renderizarTabelaFaturamento(motoristaFiltro);
            }
        }).obterDadosDoSheets();
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
// ATENÇÃO: o Code.gs enviado só tem salvarPedidoNoSheets e
// atualizarPedidoNoSheets — não existe ainda uma função no backend para
// persistir clientes, motoristas ou veículos no Sheets. Por isso, os três
// cadastros abaixo funcionam em modo local (ficam disponíveis nos selects
// durante a sessão), mas não gravam na planilha. Se você quiser persistir
// de verdade, eu posso te ajudar a criar salvarClienteNoSheets,
// salvarMotoristaNoSheets e salvarVeiculoNoSheets no Code.gs.

function salvarCadastroCliente(event) {
    event.preventDefault();

    const nome = document.getElementById('nomeCliente').value;
    const cnpj = document.getElementById('cnpjCliente').value;

    if (!nome || !cnpj) {
        exibirMensagem('mensagemCadastroCliente', 'Preencha os campos obrigatórios!', 'error');
        return;
    }

    if (!clientesGlobais.includes(nome)) {
        clientesGlobais.push(nome);
        preencherSelects();
    }

    exibirMensagem('mensagemCadastroCliente', 'Cliente salvo (modo local)!', 'success');
    document.getElementById('formCadastroCliente').reset();
}

function salvarCadastroMotorista(event) {
    event.preventDefault();

    const nome = document.getElementById('nomeMotorista').value;
    const cpf = document.getElementById('cpfMotorista').value;

    if (!nome || !cpf) {
        exibirMensagem('mensagemCadastroMotorista', 'Preencha os campos obrigatórios!', 'error');
        return;
    }

    if (!motoristasGlobais.includes(nome)) {
        motoristasGlobais.push(nome);
        preencherSelects();
    }

    exibirMensagem('mensagemCadastroMotorista', 'Motorista salvo (modo local)!', 'success');
    document.getElementById('formCadastroMotorista').reset();
}

function salvarCadastroVeiculo(event) {
    event.preventDefault();

    const placa = document.getElementById('placaCegonha').value;
    const tipo = document.getElementById('tipoCegonha').value;
    const capacidade = parseInt(document.getElementById('capacidadeCegonha').value, 10);

    if (!placa || !tipo || !capacidade) {
        exibirMensagem('mensagemCadastroVeiculo', 'Preencha os campos obrigatórios!', 'error');
        return;
    }

    const jaExiste = veiculosGlobais.some(v => v.placa === placa);
    if (!jaExiste) {
        veiculosGlobais.push({ placa: placa, tipo: tipo, capacidade: capacidade });
        preencherSelects();
    }

    exibirMensagem('mensagemCadastroVeiculo', 'Veículo salvo (modo local)!', 'success');
    document.getElementById('formCadastroVeiculo').reset();
}