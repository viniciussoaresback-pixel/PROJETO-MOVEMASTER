/* ============================================================================
   MOVEMASTER — mod-07.js  (58 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: selecionarAcaoMover, confirmarMoverPedido, carregarGaleriaFotos, verFotosPlaca, abrirFotoAmpliada, dispararPDFFiscal, montarSnapshotEspelho, registrarEspelhoFiscal, ...
   ============================================================================ */
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

        await aposMutacaoPedidos();
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
        (opcoes.rotaId ? String(p.rotaId||p.rota_id) === String(opcoes.rotaId) : true) &&
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
        // CNPJ de origem/destino: usa o do pedido; se faltar, cai para o do cliente pagador
        const cnpjOrigem = p.cnpjColeta || cli.cnpj || '';
        const cnpjDestino = p.cnpjEntrega || '';
        // Aviso de CTe já emitido (fiscal digitou o número) — evita emitir de novo
        const cteJaEmitido = p.numeroCte || p.numero_cte;
        const avisoCte = cteJaEmitido
          ? `<div style="margin-top:3px;font-size:0.72rem;color:#16a34a;font-weight:700">✅ CTe ${cteJaEmitido} já emitido</div>`
          : `<div style="margin-top:3px;font-size:0.72rem;color:#b45309;font-weight:600">⚠️ CTe ainda não emitido</div>`;

        return `
        <tr class="${i % 2 === 0 ? 'par' : 'impar'}">
            <td class="center">${i + 1}</td>
            <td><strong>${p.cliente || '—'}</strong><br>
                <small style="color:#666">${tipoDoc}: ${doc}</small>
                ${cli.inscricao_estadual ? `<br><small style="color:#666">IE: ${cli.inscricao_estadual}</small>` : ''}
            </td>
            <td>${p.modelo || '—'}<br><small style="color:#666">${p.placa || '—'}</small>${p.referencia ? `<br><small style="color:#f97316;font-weight:700">🔖 ${p.referencia}</small>` : ''}${avisoCte}</td>
            <td style="font-size:0.82rem">${rota}</td>
            <td style="font-size:0.82rem"><strong>${p.cidadeOrigem||''}/${p.ufOrigem||''}</strong><br>${p.enderecoColeta || '—'}${cnpjOrigem ? `<br><small style="color:#666">CNPJ: ${cnpjOrigem}</small>` : ''}</td>
            <td style="font-size:0.82rem"><strong>${p.cidadeDestino||''}/${p.ufDestino||''}</strong><br>${p.enderecoEntrega || '—'}${cnpjDestino ? `<br><small style="color:#666">CNPJ: ${cnpjDestino}</small>` : ''}</td>
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
        <div class="info-item">
            <label>Prev. Saída</label>
            <span>${(() => { const _r = (rotasGlobais||[]).find(x => String(x.id)===String(opcoes.rotaId) || (x.placa_cegonha===placaCegonha && x.status!=='concluida')); return _r && _r.data_saida ? new Date(_r.data_saida+'T12:00').toLocaleDateString('pt-BR') : '—'; })()}</span>
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
// Nomenclatura por capacidade:
// "Carga Fechada" SOMENTE quando fecha a capacidade cheia da cegonha (padrão 11).
// Qualquer quantidade abaixo disso => "Múltiplos Veículos".
function nomenclaturaCarga(qtd, capacidade){
  const cap = Number(capacidade) || 11; // capacidade cheia padrão
  if (qtd >= cap) return 'Carga Fechada';
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
    console.error('Erro ao criar reserva:', e, '| details:', e.details, '| hint:', e.hint, '| code:', e.code);
    exibirMensagem('mensagemComercial', 'Erro ao criar reserva: ' + (e.message||'') + (e.details?(' — '+e.details):''), 'error');
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
