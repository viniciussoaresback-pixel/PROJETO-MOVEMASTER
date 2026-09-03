/* ============================================================================
   MOVEMASTER — mod-06.js  (42 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: carregarFolgas, folgaCobreData, motoristaIndisponivel, renderizarFolgas, abrirNovaFolga, alternarCampoVeiculoFolga, manutencaoAtivaDoVeiculo, salvarFolga, ...
   ============================================================================ */
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
    // Origem = onde o carro está AGORA (pátio atual, se houver) — importante para transbordo.
    // Um carro parado no pátio de transbordo parte dali para a próxima perna.
    const origemBase = p.patioAtual ? p.patioAtual : `${p.cidadeOrigem}/${p.ufOrigem}`;
    const origem  = normalizarCidade(origemBase);
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

        // Pedidos que encaixam nesta rota e ainda não estão em rota nenhuma
        // (qualquer status ativo — não só o antigo 'Pendente')
        const compativeis = pedidosGlobais.filter(p =>
            !['Entregue','Cancelado'].includes(p.status||'') &&
            !p.rotaId && !p.rota_id && !p.placaCegonha &&
            pedidoEncaixaNaRota(p, paradas)
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
                ${r.criado_por ? ` · <span class="rota-criador" title="Perfil que planejou esta rota">👤 criada por ${r.criado_por}</span>` : ''}
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
                        const paradasMeio = paradas.slice(1, -1); // paradas intermediárias (onde pode transbordar)
                        const selTransb = paradasMeio.length > 0 ? `
                            <select class="sel-transb-prev" onchange="_setTransbordoPrevisto(${p.id}, this.value)" title="Planejar transbordo nesta parada" onclick="event.stopPropagation()">
                                <option value="">🔁 transbordo previsto?</option>
                                ${paradasMeio.map(par => `<option value="${par.replace(/"/g,'&quot;')}" ${p.transbordoPrevisto===par?'selected':''}>🔁 transbordar em ${par}</option>`).join('')}
                            </select>` : '';
                        return `
                        <div class="rota-pedido-item">
                            <span>#${p.id} · <strong>${p.cliente || ''}</strong> · ${p.modelo || ''} ${p.placa || ''} ${selCTEDoPedido(p.id)}</span>
                            <span class="rota-pedido-rota">${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino} ${encaixe.selo}${p.transbordoPrevisto?` <span class="selo-transb-prev">🔁 ${p.transbordoPrevisto}</span>`:''}</span>
                            ${selTransb}
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
                ${(r.status === 'planejada' || r.status === 'em_andamento') ? `<button class="btn btn-secondary btn-sm" onclick="abrirFecharEnviarCarga(${r.id})" title="Ver o romaneio e (re)enviar a carga ao motorista — a composição pode ter mudado">📋 ${r.status === 'planejada' ? 'Fechar e enviar carga' : 'Reenviar romaneio'}</button>` : ''}
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
                    <input type="text" id="rotaCegonhaBusca" placeholder="🔎 Buscar por placa, modelo ou transportador..." oninput="_mmDeb('filtrarCegonhasRota', filtrarCegonhasRota)">
                    <select id="rotaCegonha" size="5" style="margin-top:0.5rem" onchange="_rotaCegonhaSel = this.value; _rotaEditPreencheMotorista()"></select>
                    <div id="rotaCegonhaSelecionada" style="font-size:.82rem;color:#4ade80;margin-top:6px">${rota?.placa_cegonha ? '✅ Cegonha selecionada: <strong>'+rota.placa_cegonha+'</strong>' : ''}</div>
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

            <div class="form-group" id="grupoVeiculosRota" style="${_rotaEditandoId ? '' : 'display:none'}">
                <label>🚗 Veículos da carga — localização e romaneio do motorista</label>
                <div id="rotaVeiculosEditor"></div>
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
    if (_rotaEditandoId && typeof _renderRotaVeiculosEditor === 'function') _renderRotaVeiculosEditor(_rotaEditandoId);
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
  const placa = sel?.value || '';
  const inp = document.getElementById('rotaMotorista');
  if (inp && mot) inp.value = mot; // motorista padrão da cegonha
  // Reflete a placa escolhida no campo de busca (confirma a seleção sem depender do destaque)
  const busca = document.getElementById('rotaCegonhaBusca');
  if (busca && placa) busca.value = placa;
  // Selo de confirmação
  let selo = document.getElementById('rotaCegonhaSelecionada');
  if (selo && placa) selo.innerHTML = `✅ Cegonha selecionada: <strong>${placa}</strong>`;
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

    const corredorId = document.getElementById('rotaCorredor')?.value || null;

    const dados = {
        nome: document.getElementById('rotaNome').value.trim() || null,
        placa_cegonha: (document.getElementById('rotaCegonha').value || _rotaCegonhaSel) || null,
        motorista_1: document.getElementById('rotaMotorista')?.value.trim() || null,
        percent_motorista_1: (document.getElementById('rotaMotorista')?.value.trim()) ? 100 : null,
        data_saida: document.getElementById('rotaData').value || null,
        corredor_id: corredorId ? parseInt(corredorId) : null,
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
            await aposMutacaoPedidos();
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
            await aposMutacaoPedidos();
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

        await aposMutacaoPedidos();
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

        await aposMutacaoPedidos({ forceFull: true });
        renderizarRotas();
        if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag();
        exibirMensagem('mensagemLogistica', `Pedido #${pedidoId} removido da rota.`, 'success');
    } catch (e) {
        exibirMensagem('mensagemLogistica', 'Erro ao desvincular: ' + e.message, 'error');
    }
}

async function mudarStatusRota(rotaId, novoStatus, jaConfirmado) {
    const labels = { em_andamento: 'iniciar a viagem desta rota', concluida: 'concluir esta rota', cancelada: 'cancelar esta rota (os carros voltam à etapa anterior — a viagem não aconteceu)' };
    if (novoStatus === 'em_andamento'){
        const carros = (pedidosGlobais||[]).filter(p =>
            String(p.rotaId || p.rota_id) === String(rotaId) &&
            !['Entregue','Cancelado','Em Transporte','Transbordo'].includes(p.status||'Pendente'));
        if (!confirm(`Iniciar a viagem desta rota?\n\nOs ${carros.length} carro(s) da carga vão direto para "Em Transporte".`)) return;
        const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
        try {
            const { error } = await supabase.from('rotas_planejadas').update({ status: 'em_andamento', iniciada_em: new Date().toISOString() }).eq('id', rotaId);
            if (error) throw error;
            const _rotaObj = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
            if (_rotaObj) _rotaObj.iniciada_em = new Date().toISOString();
            // Todos os carros da rota entram direto em trânsito (fluxo enxuto)
            for (const p of carros){
                await supabase.from('pedidos').update({ status: 'Em Transporte' }).eq('id', p.id);
                try { await supabase.from('historico_status').insert({
                    pedido_id: p.id, status_anterior: p.status, status_novo: 'Em Transporte',
                    usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
                    observacao: `🚚 Viagem iniciada — carro entrou em trânsito.`
                }); } catch(_){}
            }
            await aposMutacaoPedidos();
            renderizarRotas();
            if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `🚚 Viagem iniciada — ${carros.length} carro(s) em trânsito.`, 'success');
        } catch(e){ alert('Erro: ' + (e.message||e)); }
        return;
    }
    if (!jaConfirmado && !confirm(`Confirma ${labels[novoStatus] || 'alterar esta rota'}?`)) return;
    try {
        const { error } = await supabase.from('rotas_planejadas')
            .update({ status: novoStatus }).eq('id', rotaId);
        if (error) throw error;

        // Ao CANCELAR a rota: a viagem não aconteceu — os carros voltam à etapa anterior.
        if (novoStatus === 'cancelada'){
            const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
            const perfil = (typeof perfilAtual!=='undefined'?perfilAtual:'logistica');
            const carros = (pedidosGlobais||[]).filter(p =>
                String(p.rotaId || p.rota_id) === String(rotaId) &&
                !['Entregue','Cancelado'].includes(p.status||''));
            for (const p of carros){
                const rotuloAntes = (typeof statusPlanilhaDoPedido==='function') ? statusPlanilhaDoPedido(p) : p.status;
                // Cancelou a rota = como se o planejamento nunca tivesse existido.
                // Volta ao estado inicial: "Aguardando coleta" e SEM nenhum vínculo de motorista/cegonha/rota/pátio.
                const novoRotulo = 'Aguardando coleta';
                const interno = (typeof STATUS_PLANILHA!=='undefined' && STATUS_PLANILHA[novoRotulo]) ? STATUS_PLANILHA[novoRotulo].interno : 'Aguardando Confirmação';
                try {
                    await supabase.from('pedidos').update({
                        status: interno, status_planilha: novoRotulo,
                        rota_id: null,                 // desvincula da rota
                        placa_cegonha: null,           // solta a cegonha
                        motorista_1: null, motorista_2: null,        // solta os motoristas
                        percent_motorista_1: null, percent_motorista_2: null,
                        corredor_manual_id: null,      // volta a encaixar automaticamente
                        patio_atual: null, patio_desde: null  // não está mais em pátio nenhum
                    }).eq('id', p.id);
                    Object.assign(p, {
                        status: interno, statusPlanilha: novoRotulo,
                        rotaId: null, rota_id: null, placaCegonha: null,
                        motorista1: null, motorista2: null,
                        corredorManualId: null, patioAtual: null
                    });
                    await supabase.from('historico_status').insert({
                        pedido_id: p.id, status_anterior: rotuloAntes, status_novo: novoRotulo,
                        usuario_nome: usuario, usuario_perfil: perfil,
                        observacao: '↩️ rota cancelada — pedido voltou ao estado inicial (sem motorista/cegonha/rota).'
                    });
                } catch(_){}
            }
        }

        // Ao concluir, limpa os documentos (manifesto/CTe) da rota — controle do que está em aberto
        if (novoStatus === 'concluida'){
            // Item 2: carros transbordados saem da viagem AGORA (ao finalizar), mas continuam
            // nos corredores para a próxima perna (já têm status Transbordo + corredor definido).
            const transbordados = (pedidosGlobais||[]).filter(p =>
                String(p.rotaId || p.rota_id) === String(rotaId) && p.status === 'Transbordo');
            for (const p of transbordados){
                try {
                    await supabase.from('pedidos').update({
                        rota_id: null, placa_cegonha: null, motorista_1: null, motorista_2: null
                    }).eq('id', p.id);
                    p.rotaId = null; p.rota_id = null; p.placaCegonha = null; p.motorista1 = null;
                } catch(_){}
            }
            const docs = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)===String(rotaId));
            for (const d of docs){
                try {
                    await supabase.from('documentos_rota').delete().eq('id', d.id);
                    // tenta remover o arquivo do storage (caminho após o domínio público)
                    const m = (d.url||'').split('/movemaster-arquivos/')[1];
                    if (m) await supabase.storage.from('movemaster-arquivos').remove([m]);
                } catch(_){}
            }
            documentosRotaGlobais = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)!==String(rotaId));
        }
        await aposMutacaoPedidos();
        renderizarRotas();
        if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
        if (typeof renderizarVagasPorRota === 'function') renderizarVagasPorRota();
        if (novoStatus === 'cancelada' && typeof exibirMensagem === 'function'){
            exibirMensagem('mensagemLogistica', '↩️ Rota cancelada — os carros voltaram para os corredores.', 'success');
        }
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
        p.patioAtual && PATIOS_FIXOS.includes(p.patioAtual) && !['Entregue', 'Cancelado'].includes(p.status)
    );

    // Agrupar por pátio — SOMENTE pátios fixos (evita "pátios fantasma"
    // criados por carros cujo patio_atual é a cidade de destino aguardando equipe).
    const grupos = {};
    PATIOS_FIXOS.forEach(pt => grupos[pt] = []);
    carros.forEach(p => {
        if (grupos[p.patioAtual]) {          // só entra se for um pátio fixo conhecido
            grupos[p.patioAtual].push(p);
        }
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
            ${(() => {
                if (lista.length === 0) return '';
                const cidadePatio = _norm(String(patio).split('/')[0]);
                const entregar = lista.filter(p => _norm(p.cidadeDestino||'') === cidadePatio).length;
                const transbordando = lista.length - entregar;
                return `<div class="patio-discern">
                    <div class="patio-discern-chip patio-discern-entregar">
                        <span class="pd-ico">🏁</span>
                        <span class="pd-txt"><strong>${entregar}</strong> p/ entregar aqui</span>
                    </div>
                    <div class="patio-discern-chip patio-discern-transb">
                        <span class="pd-ico">🔀</span>
                        <span class="pd-txt"><strong>${transbordando}</strong> transbordando</span>
                    </div>
                </div>`;
            })()}
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
        await aposMutacaoPedidos();
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
        await aposMutacaoPedidos();
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
        await aposMutacaoPedidos({ forceFull: true });
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

