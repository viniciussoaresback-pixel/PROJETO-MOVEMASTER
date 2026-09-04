/* ============================================================================
   MOVEMASTER — mod-05.js  (47 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: abrirEdicaoPedido, salvarEdicaoPedido, renderizarValidacaoPlacas, notificarMotoristaDoPedido, descartarFotoReprovada, _avancarParaColeta, _varrerAutoOkParaColeta, validarPlaca, ...
   ============================================================================ */
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

    // Agrupa os campos por seção
    const secoes = {};
    CAMPOS_EDITAVEIS.forEach(c => { (secoes[c.sec || 'Outros'] = secoes[c.sec || 'Outros'] || []).push(c); });

    const iconSec = { 'Cliente':'👤', 'Veículo':'🚗', 'Origem':'📍', 'Destino':'🏁', 'Frete e Datas':'💰', 'Motorista Terceiro':'🤝', 'Outros':'📝' };

    const seccoesHTML = Object.keys(secoes).map(nomeSec => {
        const campos = secoes[nomeSec].map(c => `
            <div class="ep-campo ${c.k==='observacaoPedido'||c.k==='enderecoColeta'||c.k==='enderecoEntrega'?'ep-campo-full':''}">
                <label>${c.label}</label>
                <input type="${c.tipo}" id="edit_${c.k}" value="${String(val(c)).replace(/"/g, '&quot;')}"
                    ${c.tipo === 'number' ? 'step="0.01"' : ''}>
            </div>`).join('');
        return `<div class="ep-secao">
            <div class="ep-secao-tit">${iconSec[nomeSec]||'•'} ${nomeSec}</div>
            <div class="ep-secao-grid">${campos}</div>
        </div>`;
    }).join('');

    // Seção especial: Corredor (select). Só faz sentido se o pedido ainda não está numa viagem.
    const _corrAtual = p.corredorManualId || p.corredor_manual_id || '';
    const _corredores = (corredoresGlobais||[]).slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
    const _emViagem = !!(p.rotaId || p.rota_id || p.placaCegonha);
    const corredorSecHTML = `<div class="ep-secao">
        <div class="ep-secao-tit">📍 Corredor / Rota</div>
        <div class="ep-secao-grid">
            <div class="ep-campo ep-campo-full">
                <label>Colocar em qual corredor${_emViagem?' (pedido já está numa viagem — alterar com cuidado)':''}</label>
                <select id="edit_corredorManualId">
                    <option value="">— Sem corredor —</option>
                    ${_corredores.map(c=>`<option value="${c.id}" ${String(_corrAtual)===String(c.id)?'selected':''}>${c.nome||('corredor #'+c.id)}</option>`).join('')}
                </select>
            </div>
        </div>
    </div>`;

    const modal = document.createElement('div');
    modal.id = 'modalEdicaoPedido';
    modal.className = 'modal show ep-modal';
    modal.innerHTML = `
        <div class="modal-content ep-content">
            <div class="ep-header">
                <div>
                    <h2 style="margin:0">✏️ Editar Pedido #${p.id}</h2>
                    <p class="text-muted" style="font-size:.82rem;margin:.3rem 0 0">
                        ${p.cliente||'—'} · ${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'} · Status: <strong>${p.status || '—'}</strong>
                    </p>
                </div>
                <span class="ep-close" onclick="document.getElementById('modalEdicaoPedido').remove()">&times;</span>
            </div>
            <div class="ep-aviso">💡 Ao mudar a cidade de destino, confira também o <strong>endereço de entrega</strong> abaixo — eles não mudam sozinhos. A edição não altera o status do pedido.</div>
            ${p.observacaoPedido ? `<div style="margin:0 24px 8px;padding:10px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);border-radius:8px;font-size:.84rem;color:#f59e0b"><strong>📝 Observação atual:</strong> ${p.observacaoPedido}</div>` : ''}
            <div class="ep-body">${seccoesHTML}${corredorSecHTML}</div>
            <div id="mensagemEdicaoPedido" class="message"></div>
            <div class="ep-actions">
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

    // Corredor (campo especial - select)
    const corrEl = document.getElementById('edit_corredorManualId');
    if (corrEl){
        const novoCorr = corrEl.value ? parseInt(corrEl.value) : null;
        const atualCorr = p.corredorManualId || p.corredor_manual_id || null;
        if (String(novoCorr||'') !== String(atualCorr||'')){
            update.corredor_manual_id = novoCorr;
            mudancas.push('Corredor');
        }
    }

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
            observacao: `✏️ Pedido editado (${mudancas.length} ${mudancas.length===1?'campo':'campos'})`
        });

        document.getElementById('modalEdicaoPedido').remove();
        await aposMutacaoPedidos();
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
    if (n > 0) { try { await aposMutacaoPedidos(); } catch (e) {} }
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

        await aposMutacaoPedidos();
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
    const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
    if (!['comercial','logistica','admin'].includes(perfil)){ alert('Você não tem permissão para excluir pedidos.'); return; }
    const temCte = (typeof cteInfoDoPedido === 'function') ? !!cteInfoDoPedido(p.id) : false;
    const comprometido = p.placaCegonha || p.rotaId || p.rota_id || p.status === 'Entregue' || temCte;
    let msg;
    if (comprometido){
        msg = `⚠️ ATENÇÃO: o pedido #${p.id} (${p.cliente||''}) já está COMPROMETIDO`
            + `${p.placaCegonha?'\n• Em carga na cegonha '+p.placaCegonha:''}`
            + `${(p.rotaId||p.rota_id)?'\n• Vinculado a uma rota':''}`
            + `${p.status==='Entregue'?'\n• Já foi ENTREGUE':''}`
            + `${temCte?'\n• Tem CTe emitido':''}`
            + `\n\nExcluir vai REMOVER este pedido do histórico, das cargas e do faturamento. NÃO pode ser desfeito.`
            + `\n\nSe foi combinado e depois desmarcado, prefira CANCELAR (mantém o histórico).`
            + `\n\nTem certeza absoluta que quer EXCLUIR?`;
    } else {
        msg = `⚠️ EXCLUIR DEFINITIVAMENTE o pedido #${p.id} (${p.cliente || ''})?\n\nUse isto apenas para pedidos criados por engano. Esta ação NÃO pode ser desfeita.\n\nSe o transporte foi combinado e depois desmarcado, prefira CANCELAR (mantém o histórico).`;
    }
    if (!confirm(msg)) return;
    try {
        await supabase.from('historico_status').delete().eq('pedido_id', pedidoId);
        await supabase.from('ocorrencias').delete().eq('pedido_id', pedidoId);
        const { error } = await supabase.from('pedidos').delete().eq('id', pedidoId);
        if (error) throw error;
        await aposMutacaoPedidos();
        if (typeof renderizarPedidosDrag === 'function') renderizarPedidosDrag();
        if (typeof renderizarOcupacao === 'function') renderizarOcupacao();
        if (typeof renderizarPedidosComercial === 'function') renderizarPedidosComercial();
        if (typeof renderizarRotas === 'function') renderizarRotas();
        const alvoMsg = perfil === 'comercial' ? 'mensagemComercial' : 'mensagemLogistica';
        if (typeof exibirMensagem === 'function') exibirMensagem(alvoMsg, `🗑️ Pedido #${pedidoId} excluído definitivamente.`, 'success');
    } catch (e) {
        alert('Erro ao excluir: ' + (e.message||e));
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

        await aposMutacaoPedidos({ forceFull: true });
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
    painel.innerHTML = ''; // fluxo de liberação/coleta aposentado — status agora é livre (dropdown)
    return;
}
function _renderizarLiberacoesComercial_desativado() {
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

    // O push para o celular sai sozinho: um Database Webhook no INSERT desta
    // tabela chama a Edge Function 'notificar-push'. Nada a fazer aqui.
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
        try { await aposMutacaoPedidos(); } catch (e) {}
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
    moto:        'Moto',
    furgao:      'Furgão',
    capota:      'Veículo com capota',
    utilitario:  'Utilitário'
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
    // usa a data de REGISTRO (confiável), não a prev. de coleta (editável, pode ter erro de digitação).
    return String(p.dataSolicitacao || p.createdAt || p.created_at || p.dataPrevColeta || '').slice(0, 10);
}

function _dirMoeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function _dirMesLabel(ym) {
    const [a, m] = ym.split('-');
    const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${nomes[parseInt(m, 10) - 1]}/${a.slice(2)}`;
}

// Resumo geral consolidado de TODOS os meses (visão macro para a diretoria)
function _dirMostrarGeral(){
  const validos = pedidosGlobais.filter(p => p.status !== 'Cancelado');
  const soma = arr => arr.reduce((s,p)=> s + Number(p.valorFrete||0), 0);
  const moeda = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  // agrupa por mês
  const porMes = {};
  validos.forEach(p => { const m = _dirMes(_dirDataPedido(p)); if(!m) return; (porMes[m]=porMes[m]||[]).push(p); });
  const meses = Object.keys(porMes).sort().reverse();
  const totalGeral = soma(validos);
  const carrosGeral = validos.length;
  const entreguesGeral = validos.filter(p=>p.status==='Entregue').length;
  const mediaMes = meses.length ? totalGeral/meses.length : 0;
  const linhas = meses.map(m => {
    const ps = porMes[m];
    const ent = ps.filter(p=>p.status==='Entregue').length;
    return `<tr>
      <td><strong>${_dirMesLabel(m)}</strong></td>
      <td style="text-align:center">${ps.length}</td>
      <td style="text-align:center">${ent}</td>
      <td style="text-align:right"><strong>${moeda(soma(ps))}</strong></td>
    </tr>`;
  }).join('');
  const old = document.getElementById('dirGeralOverlay'); if(old) old.remove();
  const div = document.createElement('div');
  div.id = 'dirGeralOverlay';
  div.style.cssText = 'position:fixed;inset:0;z-index:100060;display:flex;align-items:center;justify-content:center';
  div.innerHTML = `
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.6)" onclick="document.getElementById('dirGeralOverlay').remove()"></div>
    <div style="position:relative;background:var(--surface-1,#14141a);border:1px solid rgba(255,255,255,.12);border-radius:16px;width:92%;max-width:640px;max-height:88vh;overflow-y:auto;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div><h2 style="margin:0">📊 Resumo Geral</h2><p style="color:#9ca3af;font-size:.85rem;margin:.3rem 0 0">Consolidado de todos os meses (${meses.length} ${meses.length===1?'mês':'meses'})</p></div>
        <button onclick="document.getElementById('dirGeralOverlay').remove()" style="background:none;border:none;color:#9ca3af;font-size:1.4rem;cursor:pointer">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:18px">
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Faturamento total</div><div style="font-size:1.4rem;font-weight:800;color:#22c55e">${moeda(totalGeral)}</div></div>
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Média por mês</div><div style="font-size:1.4rem;font-weight:800">${moeda(mediaMes)}</div></div>
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Carros transportados</div><div style="font-size:1.4rem;font-weight:800">${carrosGeral}</div></div>
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px"><div style="font-size:.7rem;color:#9ca3af;text-transform:uppercase">Entregues</div><div style="font-size:1.4rem;font-weight:800">${entreguesGeral}</div></div>
      </div>
      <div style="font-size:.78rem;font-weight:700;color:#9ca3af;margin-bottom:8px">DETALHAMENTO POR MÊS</div>
      <table style="width:100%;border-collapse:collapse;font-size:.85rem">
        <thead><tr style="border-bottom:1px solid rgba(255,255,255,.1)"><th style="text-align:left;padding:8px;font-size:.7rem;color:#9ca3af">Mês</th><th style="text-align:center;padding:8px;font-size:.7rem;color:#9ca3af">Carros</th><th style="text-align:center;padding:8px;font-size:.7rem;color:#9ca3af">Entregues</th><th style="text-align:right;padding:8px;font-size:.7rem;color:#9ca3af">Faturamento</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr style="border-top:2px solid rgba(255,255,255,.15)"><td style="padding:8px"><strong>TOTAL</strong></td><td style="text-align:center;padding:8px"><strong>${carrosGeral}</strong></td><td style="text-align:center;padding:8px"><strong>${entreguesGeral}</strong></td><td style="text-align:right;padding:8px"><strong>${moeda(totalGeral)}</strong></td></tr></tfoot>
      </table>
    </div>`;
  document.body.appendChild(div);
}

function renderizarDiretoria() {
    const hoje = _dirHoje();
    const mesReal = _dirMes(hoje);
    const mesAtual = (typeof _dirMesSel !== 'undefined' && _dirMesSel) ? _dirMesSel : mesReal;
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
    if (elPeriodo) {
        // meses disponíveis (com dados) para o seletor
        const _anoMin = 2024;
        const mesesDisp = [...new Set(validos.map(p => _dirMes(_dirDataPedido(p))).filter(Boolean))]
          .filter(m => { const a = parseInt(m.slice(0,4),10); return a >= _anoMin && a <= (new Date().getFullYear()+1); })
          .sort().reverse();
        if (!mesesDisp.includes(mesReal)) mesesDisp.unshift(mesReal);
        elPeriodo.innerHTML = '<span style=\'font-size:.85rem;color:#9ca3af\'>Mês de referência:</span> ' +
          '<select onchange=\'_dirMesSel=this.value; renderizarDiretoria();\' style=\'margin:0 8px;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);color:inherit;font-weight:700\'>' +
          mesesDisp.map(m => `<option value="${m}" ${m===mesAtual?'selected':''}>${_dirMesLabel(m)}</option>`).join('') + '</select>' +
          `<button onclick="_dirMostrarGeral()" style="margin-left:8px;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,106,0,.4);background:rgba(255,106,0,.1);color:#ff6a00;font-weight:700;cursor:pointer">📊 Resumo geral (todos os meses)</button>`;
    }

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
