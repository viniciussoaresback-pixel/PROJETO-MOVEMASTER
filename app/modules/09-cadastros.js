/* ==========================================================================
   MODULE: 09-cadastros.js
   Cadastros + máscaras
   Linhas originais: 3196-4182
   ========================================================================== */

// ============================================
// CADASTROS
// ============================================

async function salvarCadastroCliente(event) {
    event.preventDefault();

    const tipo    = document.getElementById('tipoCliente').value;
    const nome    = document.getElementById('nomeCliente').value;
    const nomeFantasia = document.getElementById('nomeFantasiaCliente')?.value.trim() || null;
    const formaPagamento = document.getElementById('formaPagamentoCliente')?.value || null;
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
            exibirMensagem('mensagemCadastroCliente', `⚠️ Este CNPJ já está cadastrado no cliente: "${existeCnpj.nome}" (procure por ele na lista de clientes e edite, em vez de criar de novo). Se não achar na lista, ele pode ter sido criado automaticamente pela importação do Evo.`, 'error');
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
                nome, nome_fantasia: nomeFantasia, forma_pagamento: formaPagamento, cnpj, cpf, telefone, email,
                inscricao_estadual: inscricaoEstadual,
                tipo_cliente: tipo,
                tipo_entrega_padrao: document.getElementById('tipoEntregaPadrao')?.value || 'patio',
                cep, endereco, numero, complemento, bairro, cidade, uf,
                codigo
            });
            if (error) throw error;
            await aposMutacaoPedidos({ forceFull: true });
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
        await aposMutacaoPedidos({ forceFull: true });
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
        await aposMutacaoPedidos({ forceFull: true });
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
        await aposMutacaoPedidos({ forceFull: true });
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
        await aposMutacaoPedidos({ forceFull: true });
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
    transportadora: 'Transportadora',
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
                <div class="form-group">
                    <label>Nome Fantasia</label>
                    <input type="text" id="edCliNomeFantasia" value="${(c.nome_fantasia||'').replace(/"/g,'&quot;')}" placeholder="Nome fantasia (opcional)">
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
        nome_fantasia: document.getElementById('edCliNomeFantasia')?.value.trim() || null,
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
        await aposMutacaoPedidos({ forceFull: true });
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
        await aposMutacaoPedidos({ forceFull: true });
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

// Máscara de telefone GLOBAL — aceita o elemento (this) ou um evento
function mascaraTelefone(elOuEvento) {
    const el = (elOuEvento && elOuEvento.target) ? elOuEvento.target : elOuEvento;
    if (!el) return;
    let v = el.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    else if (v.length > 0) v = '(' + v;
    el.value = v;
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
            await aposMutacaoPedidos({ forceFull: true });
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

    // Carreta (secundária) + documentos ANTT/CRLV
    const placaCarreta = document.getElementById('placaCarreta')?.value.trim().toUpperCase() || null;
    const renavamCarreta = document.getElementById('renavamCarreta')?.value.trim() || null;
    const antt = document.getElementById('anttVeiculo')?.value.trim() || null;
    const anttProp = document.getElementById('anttProprietario')?.value.trim() || null;
    const crlvCavaloProp = document.getElementById('crlvCavaloProp')?.value.trim() || null;
    const crlvCarretaProp = document.getElementById('crlvCarretaProp')?.value.trim() || null;

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
                placa_carreta: placaCarreta, renavam_carreta: renavamCarreta,
                antt, antt_proprietario: anttProp,
                crlv_cavalo_proprietario: crlvCavaloProp, crlv_carreta_proprietario: crlvCarretaProp,
                propriedade, transportador_nome: transportadorNome, transportador_contato: transportadorContato
            });
            if (error) throw error;
            await aposMutacaoPedidos({ forceFull: true });
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

