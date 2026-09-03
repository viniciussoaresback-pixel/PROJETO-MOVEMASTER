/* ============================================================================
   MOVEMASTER — mod-03.js  (40 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: toggleCardLista, restaurarEstadoListas, renderizarListaMotoristas, abrirEdicaoMotorista, salvarEdicaoMotorista, excluirMotorista, renderizarListaVeiculos, abrirEdicaoVeiculo, ...
   ============================================================================ */
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
        const buscaDigitos = busca.replace(/\D/g,'');
        lista = lista.filter(c => {
            const alvo = `${c.nome||''} ${c.nome_fantasia||''} ${c.cnpj||''} ${c.cpf||''} ${c.cidade||''} ${c.uf||''} ${c.email||''} ${c.telefone||''} ${c.inscricao_estadual||''}`.toLowerCase();
            if (alvo.includes(busca)) return true;
            // se o termo tem dígitos, compara também com os dígitos do documento
            if (buscaDigitos.length >= 3 && (_soDigitos(c.cnpj).includes(buscaDigitos) || _soDigitos(c.cpf).includes(buscaDigitos))) return true;
            return false;
        });
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

// ============================================================
// STATUS ESTILO PLANILHA (#3) — preparação
// Lista fixa que o usuário altera livremente. Mapeada sobre os status
// internos para não quebrar faturamento/cobrança/equipes.
// _para_interno: como cada status planilha é guardado internamente.
// ============================================================
const STATUS_PLANILHA = {
  'Aguardando coleta': { cor:'#ef4444', interno:'Aguardando Confirmação' },
  'Não liberado':      { cor:'#a78bfa', interno:'Aguardando Confirmação' },
  'Enviado coleta':    { cor:'#eab308', interno:'Em Coleta' },
  'Coletado':          { cor:'#84cc16', interno:'Em Coleta' },
  'Em transporte':     { cor:'#34d399', interno:'Em Transporte' },
  'Transbordo':        { cor:'#fb923c', interno:'Transbordo' },
  'Ocorrência':        { cor:'#ef4444', interno:'Ocorrência' },
  'Entregue':          { cor:'#4ade80', interno:'Entregue' }
};
const STATUS_PLANILHA_LISTA = Object.keys(STATUS_PLANILHA);

// Status planilha "visível" a partir do estado real do pedido.
// Guarda o rótulo escolhido em p.statusPlanilha (coluna status_planilha);
// se não houver, deduz do status interno.
// Item 8 — a data do pedido considerada em todo o sistema é a do LANÇAMENTO (criação real).
// Usa created_at (data real em que foi lançado); cai para data_solicitacao se não houver.
function _dataLancamento(p){
  if (!p) return null;
  return p.createdAt || p.created_at || p.dataSolicitacao || p.data_solicitacao || null;
}
function _dataLancamentoFmt(p){
  const d = _dataLancamento(p);
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch(e){ return String(d); }
}

function statusPlanilhaDoPedido(p){
  if (!p) return 'Aguardando coleta';
  if (p.statusPlanilha && STATUS_PLANILHA[p.statusPlanilha]) return p.statusPlanilha;
  // dedução a partir do interno
  const st = p.status || 'Pendente';
  if (st === 'Entregue') return 'Entregue';
  if (st === 'Em Transporte') return 'Em transporte';
  if (st === 'Transbordo') return 'Transbordo';
  if (st === 'Em Coleta') return p.patioAtual ? 'Coletado' : 'Enviado coleta';
  return 'Aguardando coleta';
}

// Dropdown de status estilo planilha — altera em qualquer tela, sem ordem obrigatória
function statusDropdownHTML(p){
  // Princípio 2: o status é SOMENTE LEITURA nas telas de consulta.
  // Quem muda o status são os EVENTOS (ações na tela de Viagens em Andamento).
  // Mantém a etiqueta colorida consistente em todo o sistema.
  return _statusPillPlanilha(p);
}

// Aplica a mudança de status planilha: grava o rótulo + reflete no status interno
// Ordem oficial dos status planilha (para detectar pulos)
const STATUS_PLANILHA_ORDEM = ['Aguardando coleta','Não liberado','Enviado coleta','Coletado','Em transporte','Transbordo','Entregue'];
// Etapas que geram DADO de auditoria e que, se puladas, precisam ser preenchidas
const STATUS_ETAPAS_DADOS = ['Coletado','Em transporte'];

async function mudarStatusPlanilha(pedidoId, novoRotulo){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p || !STATUS_PLANILHA[novoRotulo]) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['logistica','admin','comercial'].includes(perfil)){ alert('Você não tem permissão para alterar o status.'); renderizarAcompanhamento(); return; }
  const rotuloAntes = statusPlanilhaDoPedido(p);

  // Transbordo tem fluxo próprio: escolher pátio → sugerir/escolher corredor da próxima perna
  if (novoRotulo === 'Transbordo'){
    _abrirModalTransbordoStatus(pedidoId, rotuloAntes);
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    return;
  }

  // Detecta pulo: se avança mais de 1 etapa para frente, cobra os dados intermediários
  const iAntes = STATUS_PLANILHA_ORDEM.indexOf(rotuloAntes);
  const iNovo = STATUS_PLANILHA_ORDEM.indexOf(novoRotulo);
  const saltou = (iNovo - iAntes) > 1;
  const etapasCobrar = saltou ? STATUS_PLANILHA_ORDEM.slice(iAntes+1, iNovo+1).filter(s => STATUS_ETAPAS_DADOS.includes(s)) : [];

  if (etapasCobrar.length > 0){
    // Abre o modal de cobrança de dados das etapas puladas
    _abrirModalPuloEtapas(pedidoId, rotuloAntes, novoRotulo, etapasCobrar);
    // reverte o dropdown visualmente até confirmar
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    return;
  }

  await _aplicarStatusPlanilha(pedidoId, novoRotulo, rotuloAntes, perfil, '✏️ status alterado');
}

// Aplica de fato a mudança de status (usado direto ou após preencher o pulo)
async function _aplicarStatusPlanilha(pedidoId, novoRotulo, rotuloAntes, perfil, obs){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const interno = STATUS_PLANILHA[novoRotulo].interno;
  try {
    await supabase.from('pedidos').update({ status: interno, status_planilha: novoRotulo }).eq('id', parseInt(pedidoId));
    p.status = interno; p.statusPlanilha = novoRotulo;
    try {
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: rotuloAntes,
        status_novo: novoRotulo,
        usuario_nome: document.getElementById('usuarioLogado')?.textContent || '',
        usuario_perfil: perfil,
        observacao: obs || '✏️ status alterado'
      });
    } catch(_){}
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();

    // Se marcou Entregue e ERA o último carro da rota, sugere concluir (opção B — só sugere, nunca automático)
    if (novoRotulo === 'Entregue'){
      const rotaId = p.rotaId || p.rota_id;
      if (rotaId){
        const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
        if (rota && rota.status !== 'concluida' && rota.status !== 'cancelada'){
          // Carros em Transbordo "saíram" desta rota (seguem a jornada em outra perna/caminhão),
          // então NÃO contam para a conclusão. Só contam os que ainda pertencem a esta perna.
          const carrosRota = (pedidosGlobais||[]).filter(x =>
            String(x.rotaId||x.rota_id)===String(rotaId) &&
            x.status !== 'Cancelado' && x.status !== 'Transbordo');
          const todosEntregues = carrosRota.length > 0 && carrosRota.every(x => (x.status||'') === 'Entregue');
          if (todosEntregues){
            const qtdTransb = (pedidosGlobais||[]).filter(x =>
              String(x.rotaId||x.rota_id)===String(rotaId) && x.status === 'Transbordo').length;
            const avisoTransb = qtdTransb > 0 ? `\n\n(${qtdTransb} carro(s) fizeram transbordo e seguem em outra perna — não dependem desta rota.)` : '';
            setTimeout(() => {
              if (confirm(`✅ Todos os ${carrosRota.length} carro(s) desta perna foram entregues.\n\nDeseja CONCLUIR a rota "${rota.nome||('#'+rota.id)}"?${avisoTransb}\n\n(Se ainda vai adicionar mais carros, clique em Cancelar e conclua depois.)`)){
                mudarStatusRota(rotaId, 'concluida');
              }
            }, 300);
          }
        }
      }
    }
  } catch(e){
    alert('Erro ao alterar status: ' + (e.message||e));
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
  }
}

// Voltar 1 etapa (desfazer) — volta ao status imediatamente anterior na ordem
async function voltarUmaEtapa(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['logistica','admin','comercial'].includes(perfil)){ alert('Sem permissão.'); return; }
  const atual = statusPlanilhaDoPedido(p);
  const i = STATUS_PLANILHA_ORDEM.indexOf(atual);
  if (i <= 0){ alert('Já está na primeira etapa — não há para onde voltar.'); return; }
  const anterior = STATUS_PLANILHA_ORDEM[i-1];
  if (!confirm(`↩️ Voltar o pedido #${pedidoId} de "${atual}" para "${anterior}"?`)) return;
  await _aplicarStatusPlanilha(pedidoId, anterior, atual, perfil, '↩️ voltou 1 etapa (correção)');
}

// Modal que cobra os dados das etapas puladas (obrigatório)
function _abrirModalPuloEtapas(pedidoId, rotuloAntes, novoRotulo, etapas){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const temTransbordo = !!p.cidadeTransbordo;
  const old = document.getElementById('modalPulo'); if (old) old.remove();
  const hoje = new Date().toISOString().slice(0,10);
  const campoEtapa = (et) => {
    if (et === 'Coletado'){
      return `<div class="pulo-etapa">
        <div class="pulo-etapa-tit">📥 Coletado</div>
        <label>Quem coletou?</label>
        <select id="puloColetaQuem">
          <option value="">Selecione...</option>
          <option value="equipe">Equipe de coleta</option>
          <option value="motorista">Motorista (direto)</option>
          <option value="cliente">Cliente levou ao pátio</option>
        </select>
        <label>Quando?</label>
        <input type="date" id="puloColetaData" value="${hoje}">
      </div>`;
    }
    if (et === 'Em transporte'){
      const cegonhas = (veiculosGlobais||[]).filter(v => (v.tipo==='cegonha'||v.categoria==='cegonha'||(v.capacidade||0)>1));
      return `<div class="pulo-etapa">
        <div class="pulo-etapa-tit">🚛 Em transporte</div>
        <label>Qual cegonha transportou?</label>
        <select id="puloTranspCegonha">
          <option value="">Selecione...</option>
          ${p.placaCegonha?`<option value="${p.placaCegonha}" selected>${p.placaCegonha} (atual)</option>`:''}
          ${cegonhas.filter(v=>v.placa!==p.placaCegonha).map(v=>`<option value="${v.placa}">${v.placa}${v.modelo?' · '+v.modelo:''}</option>`).join('')}
        </select>
        <label>Qual motorista?</label>
        <input type="text" id="puloTranspMotorista" value="${(p.motorista1||'').replace(/"/g,'&quot;')}" placeholder="Motorista" list="puloMotoristas">
        <datalist id="puloMotoristas">${(motoristasGlobais||[]).map(m=>`<option value="${m.nome||m}">`).join('')}</datalist>
        <label>Quando saiu?</label>
        <input type="date" id="puloTranspData" value="${hoje}">
      </div>`;
    }
    return '';
  };
  const div = document.createElement('div');
  div.id = 'modalPulo';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">⚠️ Você pulou etapas</h2>
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">De <strong>${rotuloAntes}</strong> para <strong>${novoRotulo}</strong>. Para a conferência ficar correta (inclusive o valor do motorista), registre o que realmente aconteceu nas etapas puladas:</p>
      ${temTransbordo ? `<div class="pulo-transbordo-aviso">🔁 Este carro tem <strong>transbordo em ${p.cidadeTransbordo}</strong>. Depois de registrar, confira as pernas (motorista/cegonha de cada trecho) na tela de <strong>🛣️ Trechos</strong> — é de lá que sai o valor por perna.</div>` : ''}
      ${etapas.map(campoEtapa).join('')}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" style="flex:1" onclick="_confirmarPuloEtapas(${pedidoId}, '${rotuloAntes.replace(/'/g,"\\'")}', '${novoRotulo.replace(/'/g,"\\'")}', ${JSON.stringify(etapas).replace(/"/g,'&quot;')})">✅ Registrar e aplicar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalPulo').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _confirmarPuloEtapas(pedidoId, rotuloAntes, novoRotulo, etapas){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || '';
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  // valida obrigatórios
  const registros = [];
  if (etapas.includes('Coletado')){
    const quem = document.getElementById('puloColetaQuem')?.value;
    const data = document.getElementById('puloColetaData')?.value;
    if (!quem || !data){ alert('Preencha quem coletou e quando.'); return; }
    const label = quem==='equipe'?'equipe de coleta':(quem==='motorista'?'motorista (direto)':'cliente levou ao pátio');
    registros.push({ etapa:'Coletado', obs:`📥 Coletado por ${label} em ${new Date(data+'T12:00').toLocaleDateString('pt-BR')} (registrado retroativamente)` });
  }
  if (etapas.includes('Em transporte')){
    const cegonha = document.getElementById('puloTranspCegonha')?.value;
    const mot = document.getElementById('puloTranspMotorista')?.value.trim();
    const data = document.getElementById('puloTranspData')?.value;
    if (!cegonha || !mot || !data){ alert('Preencha cegonha, motorista e data do transporte.'); return; }
    registros.push({ etapa:'Em transporte', obs:`🚛 Transportado por ${cegonha} / ${mot} desde ${new Date(data+'T12:00').toLocaleDateString('pt-BR')} (registrado retroativamente)` });
    // atualiza cegonha/motorista do pedido se não tinha
    try {
      const upd = {};
      if (!p.placaCegonha) upd.placa_cegonha = cegonha;
      if (!p.motorista1) upd.motorista_1 = mot;
      if (Object.keys(upd).length){ await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
        if (upd.placa_cegonha) p.placaCegonha = cegonha; if (upd.motorista_1) p.motorista1 = mot; }
    } catch(_){}
  }
  // grava cada etapa pulada no histórico (a verdade da auditoria)
  for (const r of registros){
    try {
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: rotuloAntes,
        status_novo: r.etapa,
        usuario_nome: usuario, usuario_perfil: perfil,
        observacao: r.obs
      });
    } catch(_){}
  }
  document.getElementById('modalPulo')?.remove();
  // aplica o status final
  await _aplicarStatusPlanilha(pedidoId, novoRotulo, registros.length?registros[registros.length-1].etapa:rotuloAntes, perfil, `⏩ avançou para ${novoRotulo} (etapas puladas registradas)`);
}



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
        // guarda a rota de origem ANTES de zerar, para preservar o vínculo histórico
        atualizacao._rotaOrigemTransbordo = pedidoObj.rotaId || pedidoObj.rota_id || null;
        // incrementa a contagem de transbordos (jornada com múltiplas pernas)
        atualizacao.qtd_transbordos = (pedidoObj.qtdTransbordos || pedidoObj.qtd_transbordos || 0) + 1;
        // flag para o pedido aparecer na área "Aguardando Transbordo" (não em "sem rota")
        atualizacao.aguardando_transbordo = true;
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

    // extrai o campo auxiliar (não é coluna do banco)
    const _rotaOrigemTransbordo = atualizacao._rotaOrigemTransbordo;
    delete atualizacao._rotaOrigemTransbordo;

    const { error: errPedido } = await supabase.from('pedidos').update(atualizacao).eq('id', pedidoId);
    if (errPedido) throw errPedido;

    // Transbordo: preserva o vínculo histórico (marca saída, NÃO apaga) da viagem de origem
    if (d.statusNovo === 'Transbordo' && _rotaOrigemTransbordo){
        await _marcarSaidaTransbordo(_rotaOrigemTransbordo, pedidoId, `transbordo em ${d.cidadeTransbordo || d.cegonhaDestino || ''}`, d.cidadeTransbordo || null);
    }

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
            `<div class="lote-aviso">⏩ Avançando <strong>${doStatus.length} carros</strong> de múltiplos veículos juntos${fora ? ` · ${fora} em outro status ficam de fora` : ''}.</div>`);
    }
}

