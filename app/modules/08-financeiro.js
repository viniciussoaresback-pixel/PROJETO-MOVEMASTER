/* ==========================================================================
   MODULE: 08-financeiro.js
   Faturamento + receitas
   Linhas originais: 2638-3195
   ========================================================================== */

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
    if (supabase) { try { await aposMutacaoPedidos(); } catch (e) {} }

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
    if (supabase) { try { await aposMutacaoPedidos(); } catch (e) {} }
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

