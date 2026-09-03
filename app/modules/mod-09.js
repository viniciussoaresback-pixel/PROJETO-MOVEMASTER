/* ============================================================================
   MOVEMASTER — mod-09.js  (65 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: _confirmarCriarRotaCorr, podeAvancarPedido, _statusPill, _statusPillPlanilha, renderizarAvancarPedidos, filtrarCobranca, _cobPill, renderizarCobranca, ...
   ============================================================================ */
async function _confirmarCriarRotaCorr(){
  const ctx = _corridorRotaCtx;
  if (!ctx || !supabase) return;
  const cegonha = document.getElementById('rotaCorrCegonha')?.value || null;
  const motorista = document.getElementById('rotaCorrMotorista')?.value.trim() || null;
  if (!cegonha){
    if (!confirm('Criar a rota SEM cegonha? Ela ficará como "A definir" e aparecerá na seção "Rotas a definir" das Vagas por Rota, até você escolher o caminhão.')) return;
  }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: ctx.nome, corredor_id: parseInt(ctx.corredorId) || null,
      paradas: ctx.seq, status: 'planejada', criado_por: usuario,
      placa_cegonha: cegonha, motorista_1: motorista, percent_motorista_1: motorista ? 100 : null
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');
    // vincula pedidos; se tem cegonha, já entra como Intenção Agendada com a cegonha/motorista
    const upd = { rota_id: rotaId };
    if (cegonha){ upd.placa_cegonha = cegonha; upd.status = 'Intenção Agendada'; if (motorista) upd.motorista_1 = motorista; }
    const { error: e2 } = await supabase.from('pedidos').update(upd).in('id', ctx.ids);
    if (e2) throw e2;
    document.getElementById('modalCriarRotaCorr')?.remove();
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota "${ctx.nome}" criada com ${ctx.ids.length} carro(s)${cegonha ? ' na cegonha '+cegonha+(motorista?' · '+motorista:'') : ''}.`, 'success');
  } catch(e){ alert('Erro ao criar rota: ' + (e.message || e)); }
}

// Decide se o perfil ATUAL pode avançar ESTE pedido (respeita o dono da etapa
// e a regra do pedido feito pela logística, que pula a confirmação do comercial).
function podeAvancarPedido(p){
  const cfg = FLUXO_STATUS[p.status || 'Pendente'];
  if (!cfg || !cfg.proximos || cfg.proximos.length === 0) return false;
  const viewer = (typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
  if (viewer === 'admin' || (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())) return true;
  let dono = (cfg.perfis || []).filter(x => x !== 'admin')[0] || 'logistica';
  // pedido feito pela logística: ela conduz, o comercial não confirma
  if (p.origemLancamento === 'logistica' && dono === 'comercial') dono = 'logistica';
  return viewer === dono;
}

// Pílula de status com a cor oficial do fluxo (igual ao painel)
function _statusPill(status){
  const s = status || 'Pendente';
  const cor = (typeof FLUXO_STATUS !== 'undefined' && FLUXO_STATUS[s]?.cor) || '#888';
  return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${s}</span>`;
}

// Pill de status no MESMO padrão do dropdown planilha (mesmo texto e cor em todo o sistema)
function _statusPillPlanilha(p){
  // Aguardando aprovação tem etiqueta própria (âmbar)
  if (p && p.aprovado === false){
    const cor = '#f59e0b';
    return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">⏳ Aguardando aprovação</span>`;
  }
  // Aguardando transbordo tem etiqueta própria (roxo), para o comercial e a logística
  if (p && p.aguardandoTransbordo){
    const cor = '#a855f7';
    return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">🟣 Aguardando transbordo</span>`;
  }
  const rotulo = (typeof statusPlanilhaDoPedido === 'function') ? statusPlanilhaDoPedido(p) : (p.status||'—');
  const cor = (typeof STATUS_PLANILHA !== 'undefined' && STATUS_PLANILHA[rotulo]?.cor) || '#888';
  return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${rotulo}</span>`;
}

// ============================================================
// Aba "Avançar Pedidos" — esteira por status (logística)
// Lista tudo que pode avançar, agrupado por status, com 1 clique.
// O botão abre o fluxo de status já validado (abrirModalStatus).
// ============================================================
function renderizarAvancarPedidos(){
  const cont = document.getElementById('painelViewAvancar');
  if (!cont) return;
  const podeAgir = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  // Todos veem a lista (para acompanhar); só logística/admin tem o botão de avançar.
  const vivos = (pedidosGlobais || []).filter(p => {
    const cfg = FLUXO_STATUS[p.status || 'Pendente'];
    return cfg && cfg.proximos && cfg.proximos.length > 0 && !['Entregue','Cancelado'].includes(p.status||'Pendente');
  });

  const busca = _norm(document.getElementById('avancarBusca')?.value || '');
  let lista = vivos;
  if (busca) lista = lista.filter(p =>
    _norm(`${p.cliente||''} ${p.placa||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} #${p.id}`).includes(busca));

  // agrupa por status atual, na ordem do fluxo
  const grupos = {};
  lista.forEach(p => { const s = (typeof statusPlanilhaDoPedido==='function') ? statusPlanilhaDoPedido(p) : (p.status || 'Pendente'); (grupos[s] = grupos[s] || []).push(p); });
  const ordem = (typeof STATUS_PLANILHA_LISTA !== 'undefined') ? STATUS_PLANILHA_LISTA : [];
  const chaves = Object.keys(grupos).sort((a,b) => ordem.indexOf(a) - ordem.indexOf(b));

  cont.innerHTML = `
    <p class="text-muted" style="margin:.2rem 0 .8rem;font-size:.85rem">📋 Todos os pedidos agrupados por status. Use o seletor de status em cada linha para alterar livremente.</p>
    <div class="carteira-topo">
      <input type="text" id="avancarBusca" class="ocup-busca" placeholder="🔍 Filtrar por cliente, placa, cidade..." oninput="_mmDeb('renderizarAvancarPedidos', renderizarAvancarPedidos)" value="${busca.replace(/"/g,'&quot;')}">
      <span class="text-muted">${lista.length} pedido(s) para avançar</span>
    </div>
    ${chaves.length === 0 ? '<p class="text-muted" style="padding:1rem 0">Nada para avançar agora. 👌</p>' : chaves.map(s => {
      const itens = grupos[s];
      const corG = (typeof STATUS_PLANILHA !== 'undefined' && STATUS_PLANILHA[s]?.cor) || '#888';
      return `<div class="carteira-grupo">
        <div class="carteira-grupo-tit"><span class="status-pill-cor" style="background:${corG}22;color:${corG};border:1px solid ${corG}55">${s}</span> <span class="carteira-badge">${itens.length}</span></div>
        <table class="corr-tabela">
          <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Cegonha</th><th></th></tr></thead>
          <tbody>${itens.map(p => `<tr class="corr-tr">
            <td class="ct-id">#${p.id}</td>
            <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
            <td class="ct-modelo">${p.modelo||'—'}</td>
            <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
            <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
            <td class="ct-modelo">${p.placaCegonha || '—'}</td>
            <td class="ct-acoes">${statusDropdownHTML(p)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    }).join('')}`;
}

// ============================================================
// Módulo de Cobrança — comercial marca; financeiro confirma
// Estados: a_cobrar -> cobrado -> pago -> confirmado
// ============================================================
let _cobFiltro = '';
const _COB_LABEL = { a_cobrar:'A cobrar', cobrado:'Cobrado', pago:'Pago', confirmado:'Confirmado', nao_cobro:'Financeiro cobra', cortesia:'Cortesia' };
const _COB_COR   = { a_cobrar:'#fbbf24', cobrado:'#60a5fa', pago:'#a78bfa', confirmado:'#4ade80', nao_cobro:'#fb923c', cortesia:'#9ca3af' };

function filtrarCobranca(status, btn){
  _cobFiltro = status;
  document.querySelectorAll('.cobranca-filtros .ocup-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderizarCobranca();
}

function _cobPill(st){
  const s = st || 'a_cobrar';
  const cor = _COB_COR[s] || '#888';
  return `<span class="status-pill-cor" style="background:${cor}22;color:${cor};border:1px solid ${cor}55">${_COB_LABEL[s]||s}</span>`;
}

function renderizarCobranca(){
  const wrap = document.getElementById('cobrancaWrap');
  if (!wrap) return;
  const ehFinanceiro = ['financeiro','admin'].includes(typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
  const ehComercial  = ['comercial','admin'].includes(typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin');
  const busca = _norm(document.getElementById('cobrancaBusca')?.value || '');

  // Cortesia sai da receita: não aparece na cobrança nem nos totais (fica só auditável em filtro próprio)
  let lista = (pedidosGlobais || []).filter(p => (p.status !== 'Cancelado') && Number(p.valorFrete||0) > 0 && (p.cobrancaStatus||'a_cobrar') !== 'cortesia');
  if (_cobFiltro) lista = lista.filter(p => (p.cobrancaStatus||'a_cobrar') === _cobFiltro);
  if (busca) lista = lista.filter(p =>
    _norm(`${p.cliente||''} ${p.placa||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} #${p.id}`).includes(busca));
  // filtro por período (data de entrega/solicitação)
  const fDe = document.getElementById('cobDataDe')?.value || '';
  const fAte = document.getElementById('cobDataAte')?.value || '';
  const dataDoPedido = p => (p.dataEntregaReal || p.data_entrega_real || p.dataSolicitacao || '').slice(0,10);
  if (fDe) lista = lista.filter(p => { const d = dataDoPedido(p); return d && d >= fDe; });
  if (fAte) lista = lista.filter(p => { const d = dataDoPedido(p); return d && d <= fAte; });
  // filtro por categoria de cliente
  const fCat = document.getElementById('cobCategoria')?.value || '';
  if (fCat){
    const tipoPorCliente = {};
    (clientesGlobais||[]).forEach(c => { if (c.nome) tipoPorCliente[c.nome] = c.tipo_cliente || ''; });
    lista = lista.filter(p => (tipoPorCliente[p.cliente]||'') === fCat);
  }

  // resumo por status (cortesia fora — não gera receita)
  const soma = {};
  (pedidosGlobais||[]).filter(p => p.status!=='Cancelado' && Number(p.valorFrete||0)>0 && (p.cobrancaStatus||'a_cobrar')!=='cortesia')
    .forEach(p => { const s = p.cobrancaStatus||'a_cobrar'; soma[s] = (soma[s]||0) + Number(p.valorFrete||0); });
  const resumo = ['a_cobrar','nao_cobro','cobrado','pago','confirmado'].map(s =>
    `<span class="cob-resumo-item">${_cobPill(s)} R$ ${Number(soma[s]||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`).join('');

  // Alerta de atrasadas: entregue há +15 dias e ainda não confirmado (ignora cortesia)
  const ATRASO = 15;
  const atrasadas = (pedidosGlobais||[]).filter(p => {
    if (p.status !== 'Entregue') return false;
    const st = p.cobrancaStatus||'a_cobrar';
    if (st === 'confirmado' || st === 'cortesia' || p.receitaConfirmada) return false;
    const d = p.dataEntregaReal || p.data_entrega_real || p.dataSolicitacao;
    return d && (Date.now() - new Date(d).getTime())/86400000 >= ATRASO;
  });
  const totalAtras = atrasadas.reduce((s,p)=>s+Number(p.valorFrete||0),0);
  const alertaAtraso = atrasadas.length
    ? `<span class="cob-resumo-item" style="color:#f87171"><strong>⚠️ ${atrasadas.length} atrasada(s) (+${ATRASO}d)</strong> R$ ${totalAtras.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>`
    : '';

  if (lista.length === 0){ wrap.innerHTML = `<div class="cob-resumo">${resumo}${alertaAtraso}</div><p class="text-muted" style="padding:1rem 0">Nenhum pedido nesse filtro.</p>`; return; }

  lista.sort((a,b) => b.id - a.id);

  wrap.innerHTML = `<div class="cob-resumo">${resumo}${alertaAtraso}</div>
    <table class="corr-tabela">
      <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Cliente</th><th>Origem → Destino</th><th>Valor</th><th>Forma pgto</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>${lista.map(p => {
        const st = p.cobrancaStatus || 'a_cobrar';
        const cliObj = (clientesGlobais||[]).find(c => c.id === p.clienteId || _norm(c.nome)===_norm(p.cliente||''));
        const formaPg = cliObj && cliObj.forma_pagamento ? _formaPagamentoLabel(cliObj.forma_pagamento) : '<span class="text-muted">—</span>';
        const pagoData = (st==='pago'||st==='confirmado') && p.pagoEm ? `<br><span style="font-size:.72rem;color:#22c55e">💰 pago em ${new Date(p.pagoEm).toLocaleDateString('pt-BR')}</span>` : '';
        let acoes = '';
        // Comercial conduz até "pago"; Financeiro confirma
        if (ehComercial && st === 'a_cobrar') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'cobrado')">Marcar cobrado</button>`;
        if (ehComercial && st === 'cobrado') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'pago')">Marcar pago</button>`;
        // Comercial passa a cobrança pro financeiro
        if (ehComercial && st === 'a_cobrar') acoes += `<button class="btn btn-sm btn-secondary" onclick="marcarCobranca(${p.id},'nao_cobro')" title="Eu não cobro este cliente — o financeiro cobra">🟠 Não cobro</button>`;
        // Financeiro assume os "não cobro"
        if (ehFinanceiro && st === 'nao_cobro') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'cobrado')" title="Financeiro assume a cobrança">Assumir cobrança</button>`;
        if (ehFinanceiro && st === 'pago') acoes += `<button class="btn btn-sm btn-primary" onclick="marcarCobranca(${p.id},'confirmado')">✅ Confirmar recebimento</button>`;
        if ((ehComercial || ehFinanceiro) && !['a_cobrar','cortesia'].includes(st)) acoes += `<button class="btn btn-sm btn-secondary" onclick="marcarCobranca(${p.id},'_voltar')" title="Voltar um passo">↩️</button>`;
        // Cortesia (discreto): só comercial, só quando ainda a cobrar
        if (ehComercial && st === 'a_cobrar') acoes += `<button class="btn btn-sm" style="opacity:.55;font-size:.72rem" onclick="marcarCobranca(${p.id},'cortesia')" title="Cortesia — serviço gratuito, não gera receita">cortesia</button>`;
        return `<tr class="corr-tr">
          <td class="ct-id">#${p.id}</td>
          <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
          <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-frete">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td>${formaPg}</td>
          <td class="ct-status">${_cobPill(st)}${pagoData}</td>
          <td class="ct-acoes">${acoes || '<span class="text-muted">—</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function _formaPagamentoLabel(fp){
  const map = { boleto:'🧾 Boleto', pix:'⚡ PIX', transferencia:'🏦 Transferência' };
  return map[fp] || fp || '—';
}

async function marcarCobranca(pedidoId, novo){
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  if (!p || !supabase) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  // Só o comercial marca "não cobro" e "cortesia"
  if ((novo === 'nao_cobro' || novo === 'cortesia') && !['comercial','admin'].includes(perfil)){
    alert('Apenas o Comercial pode marcar esta opção.'); return;
  }
  if (novo === 'cortesia' && !confirm(`Marcar #${p.id} como CORTESIA?\n\nServiço gratuito — sai da receita e não será cobrado. Use apenas em casos raros.`)) return;
  const fluxo = ['a_cobrar','cobrado','pago','confirmado'];
  let alvo = novo;
  if (novo === '_voltar'){
    const st = p.cobrancaStatus||'a_cobrar';
    if (st === 'nao_cobro') alvo = 'a_cobrar'; // devolve pro comercial
    else { const i = fluxo.indexOf(st); alvo = fluxo[Math.max(0, i-1)]; }
  }
  const usuario = document.getElementById('usuarioLogado')?.textContent || '';
  const agora = new Date().toISOString();
  // Item 3: ao marcar como pago, permite escolher a data do pagamento (padrão: hoje)
  let dataPagamento = agora;
  if (alvo === 'pago'){
    const hoje = new Date().toISOString().slice(0,10);
    const escolha = prompt('Data do pagamento (AAAA-MM-DD):', hoje);
    if (escolha === null) return; // cancelou
    const dt = escolha.trim();
    if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)){ dataPagamento = new Date(dt+'T12:00:00').toISOString(); }
    else if (dt){ alert('Data inválida. Use o formato AAAA-MM-DD.'); return; }
  }
  const upd = { cobranca_status: alvo };
  if (alvo === 'nao_cobro'){ upd.cobrado_por = usuario; } // registra quem passou pro financeiro
  if (alvo === 'cortesia'){ upd.cobrado_por = usuario; }
  if (alvo === 'cobrado'){ upd.cobrado_em = agora; upd.cobrado_por = usuario; }
  if (alvo === 'pago'){ upd.pago_em = dataPagamento; upd.pago_por = usuario; }
  if (alvo === 'confirmado'){ upd.pagto_confirmado_em = agora; upd.pagto_confirmado_por = usuario;
    upd.receita_confirmada = true; upd.receita_confirmada_em = agora; upd.receita_confirmada_por = usuario;
  }
  try {
    const { error } = await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    if (error) throw error;
    p.cobrancaStatus = alvo;
    renderizarCobranca();
  } catch(e){ alert('Erro ao atualizar cobrança: ' + (e.message||e)); }
}

// ============================================================
// Inserir qualquer carro disponível numa rota (frete de última hora)
// ============================================================
function abrirInserirCarroRota(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('inserir carro na rota')) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return;
  const old = document.getElementById('modalInserirCarro');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalInserirCarro';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:640px;width:92%;max-height:82vh;overflow:auto;border-radius:14px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h2 style="margin:0">➕ Inserir carro na rota "${rota.nome||('#'+rota.id)}"</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalInserirCarro').remove()">✕</button>
      </div>
      <p class="text-muted" style="font-size:.84rem;margin:.2rem 0 .8rem">Adicione qualquer carro disponível (sem cegonha e sem rota), mesmo que não case com o caminho. Útil para frete de última hora.</p>
      <input type="text" id="inserirCarroBusca" class="ocup-busca" placeholder="🔍 Buscar cliente, placa, cidade..." oninput="_mmDeb('inserirCarro', function(){ _renderInserirCarroLista(${rotaId}); })" style="width:100%;margin-bottom:10px">
      <div id="inserirCarroLista"></div>
    </div>`;
  document.body.appendChild(div);
  _renderInserirCarroLista(rotaId);
}

function _renderInserirCarroLista(rotaId){
  const alvo = document.getElementById('inserirCarroLista');
  if (!alvo) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  const busca = _norm(document.getElementById('inserirCarroBusca')?.value || '');
  // TODOS os carros ativos (não entregues/cancelados) — inclusive os que já estão em outra carga
  let disp = (pedidosGlobais||[]).filter(p =>
    !['Entregue','Cancelado'].includes(p.status||'Pendente') &&
    !(rota && p.placaCegonha === rota.placa_cegonha)); // já está nesta cegonha
  if (busca) disp = disp.filter(p =>
    _norm(`${p.cliente||''} ${p.placa||''} ${p.modelo||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} #${p.id}`).includes(busca));
  disp.sort((a,b)=>b.id-a.id);
  if (disp.length === 0){ alvo.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum carro disponível.</p>'; return; }
  alvo.innerHTML = `<table class="corr-tabela">
    <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Carga atual</th><th></th></tr></thead>
    <tbody>${disp.slice(0,80).map(p => {
      const emCarga = p.placaCegonha;
      const cargaTxt = emCarga
        ? `<span class="cob-aviso-carga" title="Já está nesta cegonha — será movido (troca de seguro)">⚠️ ${p.placaCegonha}</span>`
        : '<span class="text-muted">livre</span>';
      return `<tr class="corr-tr">
        <td class="ct-id">#${p.id}</td>
        <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${selCTEDoPedido(p.id)}</td>
        <td class="ct-modelo">${p.modelo||'—'}</td>
        <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
        <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
        <td>${cargaTxt}</td>
        <td class="ct-acoes"><button class="btn btn-primary btn-sm" onclick="_inserirCarroNaRota(${p.id}, ${rotaId})">${emCarga ? '🔄 Mover' : '+ Adicionar'}</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

async function _inserirCarroNaRota(pedidoId, rotaId){
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  if (!rota || !p || !supabase) return;
  const cegonhaAntiga = p.placaCegonha || null;
  const cegonhaNova = rota.placa_cegonha || null;
  const cte = cteInfoDoPedido(pedidoId);

  // Se troca de cegonha, confirma mostrando a transição (troca de seguro)
  if (cegonhaAntiga && cegonhaNova && cegonhaAntiga !== cegonhaNova){
    const msgCte = cte ? `\n\n🧾 CTe${cte.numero ? ' nº '+cte.numero : ''} já emitido — será MANTIDO (não emite novo). Só muda o manifesto.` : '';
    if (!confirm(`Mover o carro #${pedidoId} de cegonha?\n\n${cegonhaAntiga}  →  ${cegonhaNova}  (troca de seguro)${msgCte}`)) return;
  }

  try {
    const update = { rota_id: rotaId };
    if (cegonhaNova){
      update.placa_cegonha = cegonhaNova;
      // Se a rota já está em andamento, o carro entra direto em trânsito; senão, Intenção Agendada
      update.status = (rota.status === 'em_andamento') ? 'Em Transporte' : 'Intenção Agendada';
    }
    const { error } = await supabase.from('pedidos').update(update).eq('id', parseInt(pedidoId));
    if (error) throw error;

    // Histórico da troca de seguro / inserção
    let obs;
    if (cegonhaAntiga && cegonhaNova && cegonhaAntiga !== cegonhaNova){
      obs = `🔄 Troca de cegonha (seguro): ${cegonhaAntiga} → ${cegonhaNova}` + (cte ? ` · 🧾 CTe${cte.numero ? ' nº '+cte.numero : ''} mantido (só muda o manifesto)` : '');
    } else {
      obs = `➕ Inserido na rota "${rota.nome || '#'+rota.id}"${cegonhaNova ? ' — cegonha ' + cegonhaNova : ''}`;
    }
    try { await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: update.status || p.status,
      usuario_nome: document.getElementById('usuarioLogado')?.textContent || 'Logística',
      usuario_perfil: typeof perfilAtual !== 'undefined' ? perfilAtual : 'logistica', observacao: obs
    }); } catch(_){}

    await aposMutacaoPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    _renderInserirCarroLista(rotaId);
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ ${obs}`, 'success');
  } catch(e){ alert('Erro ao inserir/mover: ' + (e.message||e)); }
}

// ============================================================
// EQUIPES DE COLETA & ENTREGA (last mile das duas pontas)
// ============================================================

// Chegada em lote: seleciona carros e marca "entregue pelo motorista" ou "vai pro pátio".
// Quando todos os carros da rota tiverem chegada registrada, a rota é concluída.
function abrirRegistrarChegada(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('registrar chegada')) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return;
  const carros = (pedidosGlobais||[]).filter(p =>
    String(p.rotaId || p.rota_id) === String(rotaId) &&
    !['Entregue','Cancelado'].includes(p.status||'Pendente'));
  const old = document.getElementById('modalChegada'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalChegada';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const linhas = carros.length ? carros.map(p => `
    <tr class="corr-tr">
      <td><input type="checkbox" class="cheg-check" value="${p.id}" checked></td>
      <td class="ct-id">#${p.id}</td>
      <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
      <td class="ct-modelo">${p.modelo||'—'}</td>
      <td class="ct-rota">→ <strong>${p.cidadeDestino||'—'}</strong></td>
      <td class="ct-cli">${p.cliente||'—'}</td>
    </tr>`).join('') : '';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:680px;width:94%;max-height:86vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="margin:0">🏁 Registrar chegada — ${rota.nome || ('#'+rota.id)}</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalChegada').remove()">✕</button>
      </div>
      ${carros.length === 0 ? '<p class="text-muted" style="padding:1rem 0">Todos os carros desta rota já chegaram. Pode concluir a rota.</p>' : `
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">Selecione os carros e escolha o destino da chegada. Quando todos chegarem, a rota é concluída automaticamente.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="_chegSelTodos(true)">Selecionar todos</button>
        <button class="btn btn-secondary btn-sm" onclick="_chegSelTodos(false)">Limpar</button>
        <span id="chegCont" class="text-muted" style="margin-left:auto"></span>
      </div>
      <table class="corr-tabela">
        <thead><tr><th></th><th>ID</th><th>Placa</th><th>Modelo</th><th>Destino</th><th>Cliente</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-primary" style="flex:1;min-width:220px;padding:13px" onclick="_aplicarChegada(${rotaId}, 'motorista')">
          ✅ Entregue pelo motorista<br><span style="font-size:.76rem;opacity:.85">Finaliza os selecionados</span>
        </button>
        <button class="btn btn-secondary" style="flex:1;min-width:220px;padding:13px" onclick="_aplicarChegada(${rotaId}, 'patio')">
          🅿️ Vai ficar no pátio<br><span style="font-size:.76rem;opacity:.85">Equipe local entrega depois</span>
        </button>
      </div>`}
    </div>`;
  document.body.appendChild(div);
  _chegAtualizaCont();
}

function _chegSelTodos(v){ document.querySelectorAll('.cheg-check').forEach(c => c.checked = v); _chegAtualizaCont(); }
function _chegAtualizaCont(){
  const n = document.querySelectorAll('.cheg-check:checked').length;
  const el = document.getElementById('chegCont'); if (el) el.textContent = `${n} selecionado(s)`;
}
document.addEventListener('change', e => { if (e.target && e.target.classList?.contains('cheg-check')) _chegAtualizaCont(); });

async function _aplicarChegada(rotaId, modo){
  const ids = Array.from(document.querySelectorAll('.cheg-check:checked')).map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um carro.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    for (const id of ids){
      const p = (pedidosGlobais||[]).find(x => String(x.id) === String(id));
      if (!p) continue;
      let upd, obs, novo;
      if (modo === 'motorista'){
        novo = 'Entregue';
        upd = { status: 'Entregue', fluxo_entrega: 'direta' };
        obs = `✅ Entregue pelo motorista direto no cliente (${p.cidadeDestino||''}).`;
      } else {
        const cidade = `${p.cidadeDestino}${p.ufDestino ? '/'+p.ufDestino : ''}`;
        novo = 'Em Transporte';
        upd = { patio_atual: cidade, patio_desde: new Date().toISOString(), placa_cegonha: null, rota_id: null, status: 'Em Transporte' };
        obs = `📍 Chegou em ${cidade} — no pátio para entrega pela equipe local.`;
      }
      await supabase.from('pedidos').update(upd).eq('id', id);
      try { await supabase.from('historico_status').insert({
        pedido_id: id, status_anterior: p.status, status_novo: novo,
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'), observacao: obs
      }); } catch(_){}
    }
    // Recarrega e verifica se a rota ainda tem carros pendentes de chegada
    await aposMutacaoPedidos();
    const restantes = (pedidosGlobais||[]).filter(p =>
      String(p.rotaId || p.rota_id) === String(rotaId) &&
      !['Entregue','Cancelado'].includes(p.status||'Pendente'));
    if (restantes.length === 0){
      try { await mudarStatusRota(rotaId, 'concluida'); } catch(_){}
      document.getElementById('modalChegada')?.remove();
      if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `🏁 Todos chegaram — rota concluída.`, 'success');
    } else {
      abrirRegistrarChegada(rotaId); // reabre com os que faltam
      if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ ${ids.length} carro(s) registrados. Faltam ${restantes.length}.`, 'success');
    }
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof renderizarEquipesPainel === 'function') renderizarEquipesPainel();
  } catch(e){ alert('Erro ao registrar chegada: '+(e.message||e)); }
}

// Normaliza cidade (ignora /UF)
function _cidadeIgual(a, b){
  const norm = s => (s||'').toString().split('/')[0].trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return a && b && norm(a) === norm(b);
}

// Carros "a coletar" por uma equipe: coleta na cidade base, ainda não no pátio nem coletados
function _aColetarDaEquipe(eq){
  return (pedidosGlobais||[]).filter(p => {
    if (['Entregue','Cancelado'].includes(p.status||'Pendente')) return false;
    if (p.coletaEquipeEm || p.patioAtual) return false;
    if (p.formaColeta === 'motorista') return false; // motorista coleta direto: não passa por equipe
    // 1) combinado explícito: equipe de coleta escolhida no pedido
    if (p.equipeColetaId) return String(p.equipeColetaId) === String(eq.id);
    // 2) marcado "coletador busca" sem equipe explícita: cai pela cidade base
    if (p.formaColeta === 'coletador') return _cidadeIgual(p.cidadeOrigem, eq.cidade_base);
    // 3) fallback antigo: sem combinado, usa a geografia (origem = cidade base)
    if (!p.formaColeta) return _cidadeIgual(p.cidadeOrigem, eq.cidade_base);
    return false;
  });
}

// Carros "a entregar" por uma equipe: destino na cidade base, já no pátio da cidade, não entregues
function _aEntregarDaEquipe(eq){
  return (pedidosGlobais||[]).filter(p =>
    p.status !== 'Cancelado' && !p.entregaEquipeEm &&
    _cidadeIgual(p.cidadeDestino, eq.cidade_base) &&
    p.patioAtual && _cidadeIgual(p.patioAtual, eq.cidade_base));
}

// Feitas: coletadas ou entregues por esta equipe
function _feitasDaEquipe(eq){
  return (pedidosGlobais||[]).filter(p =>
    (p.coletaEquipeEm && _cidadeIgual(p.cidadeOrigem, eq.cidade_base)) ||
    (p.entregaEquipeEm && _cidadeIgual(p.cidadeDestino, eq.cidade_base)));
}

let _equipeAba = {}; // id -> 'coletar'|'entregar'|'feitas'

function renderizarEquipesPainel(){
  const cont = document.getElementById('equipesPainelWrap');
  if (!cont) return;
  let equipes = (equipesEntregaGlobais||[]).filter(e => e.ativo !== false);
  // Se o usuário é do perfil "equipe", vê só a equipe dele
  if ((typeof perfilAtual !== 'undefined' && perfilAtual === 'equipe') && window._equipeIdLogada){
    equipes = equipes.filter(e => String(e.id) === String(window._equipeIdLogada));
  }
  if (equipes.length === 0){
    cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhuma equipe cadastrada. Cadastre em <strong>Cadastros → Equipes</strong>, definindo a cidade base.</p>';
    return;
  }
  const podeAgir = (typeof podeAgirEquipe === 'function' && podeAgirEquipe());
  cont.innerHTML = equipes.map(eq => {
    const semCidade = !eq.cidade_base;
    const coletar = semCidade ? [] : _aColetarDaEquipe(eq);
    const entregar = semCidade ? [] : _aEntregarDaEquipe(eq);
    const feitas = semCidade ? [] : _feitasDaEquipe(eq);
    const aba = _equipeAba[eq.id] || 'coletar';
    const membros = (eq.membros||'').split(',').map(s=>s.trim()).filter(Boolean);

    const linha = (p, tipo) => {
      const selMembro = membros.length
        ? `<select id="mb_${tipo}_${p.id}" class="eq-membro-sel">${membros.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>`
        : '';
      let btn = '';
      if (podeAgir && tipo === 'coletar') btn = `<button class="btn btn-sm btn-primary" onclick="marcarColetaEquipe(${p.id}, ${eq.id})">✓ Coletado (no pátio)</button>`;
      if (podeAgir && tipo === 'entregar') btn = `<button class="btn btn-sm btn-primary" onclick="marcarEntregaEquipe(${p.id}, ${eq.id})">✓ Entregue</button>`;
      const info = tipo === 'feitas'
        ? `<span class="text-muted">${p.entregaEquipeEm ? '📤 entregue por '+(p.entregaEquipePor||'—') : '📥 coletado por '+(p.coletaEquipePor||'—')}</span>`
        : '';
      // endereço relevante conforme a atividade
      const endereco = tipo === 'coletar'
        ? (p.enderecoColeta ? `📍 <strong>Coletar em:</strong> ${p.enderecoColeta}` : '')
        : tipo === 'entregar'
        ? (p.enderecoEntrega ? `🏁 <strong>Entregar em:</strong> ${p.enderecoEntrega}` : '')
        : '';
      const endLinha = endereco ? `<tr class="eq-end-linha"><td colspan="6" class="eq-end-cel">${endereco}</td></tr>` : '';
      return `<tr class="corr-tr">
        <td class="ct-id">#${p.id}</td>
        <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${selCTEDoPedido(p.id)}</td>
        <td class="ct-modelo">${p.modelo||'—'}</td>
        <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
        <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
        <td class="ct-acoes">${info}${selMembro} ${btn}</td>
      </tr>${endLinha}`;
    };

    const tabela = (itens, tipo, vazio) => itens.length === 0
      ? `<p class="text-muted" style="padding:.6rem 0">${vazio}</p>`
      : `<table class="corr-tabela"><thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th></th></tr></thead><tbody>${itens.map(p=>linha(p,tipo)).join('')}</tbody></table>`;

    return `<div class="corredor-card" style="margin-bottom:16px">
      <div class="corredor-card-cab">
        <div>
          <strong>🧑‍🔧 ${eq.nome}</strong>
          ${eq.cidade_base ? `<span class="carteira-badge">📍 ${eq.cidade_base}${eq.uf_base?'/'+eq.uf_base:''}</span>` : '<span class="corredor-tag-semrota">defina a cidade base em Cadastros</span>'}
          ${eq.responsavel ? `<span class="text-muted" style="font-size:.8rem"> · resp. ${eq.responsavel}</span>` : ''}
        </div>
        <div style="font-size:.82rem" class="text-muted">📥 ${coletar.length} a coletar · 📤 ${entregar.length} a entregar</div>
      </div>
      <div class="corredor-pedidos">
        <div class="equipe-abas">
          <button class="ocup-chip ${aba==='coletar'?'active':''}" onclick="_setEquipeAba(${eq.id},'coletar')">📥 A coletar (${coletar.length})</button>
          <button class="ocup-chip ${aba==='entregar'?'active':''}" onclick="_setEquipeAba(${eq.id},'entregar')">📤 A entregar (${entregar.length})</button>
          <button class="ocup-chip ${aba==='feitas'?'active':''}" onclick="_setEquipeAba(${eq.id},'feitas')">✅ Feitas (${feitas.length})</button>
        </div>
        ${semCidade ? '<p class="text-muted" style="padding:.6rem 0">⚠️ Defina a <strong>cidade base</strong> desta equipe em Cadastros para o direcionamento automático funcionar.</p>' :
          aba==='coletar' ? tabela(coletar,'coletar','Nenhum carro a coletar nesta cidade agora.') :
          aba==='entregar' ? tabela(entregar,'entregar','Nenhum carro no pátio para entregar agora.') :
          tabela(feitas,'feitas','Nada concluído ainda.')}
      </div>
    </div>`;
  }).join('');
}

function _setEquipeAba(id, aba){ _equipeAba[id] = aba; renderizarEquipesPainel(); }

async function marcarColetaEquipe(pedidoId, equipeId){
  if (typeof bloquearSeNaoEquipe === 'function' && bloquearSeNaoEquipe('marcar coleta')) return;
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  const eq = (equipesEntregaGlobais||[]).find(e => String(e.id) === String(equipeId));
  if (!p || !eq || !supabase) return;
  const membro = document.getElementById(`mb_coletar_${pedidoId}`)?.value || null;
  // Usa o pátio combinado no pedido (se o vendedor definiu); senão o pátio base da equipe
  const cidade = p.patioColeta || `${eq.cidade_base}${eq.uf_base?'/'+eq.uf_base:''}`;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('pedidos').update({
      coleta_equipe_em: new Date().toISOString(), coleta_equipe_por: membro, coleta_equipe_id: parseInt(equipeId),
      patio_atual: cidade, patio_desde: new Date().toISOString()  // trouxe pro pátio
    }).eq('id', parseInt(pedidoId));
    if (error) throw error;
    try { await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: p.status,
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: `📥 Coletado pela equipe ${eq.nome}${membro?' ('+membro+')':''} — levado ao pátio de ${eq.cidade_base}.`
    }); } catch(_){}
    await aposMutacaoPedidos();
    renderizarEquipesPainel();
  } catch(e){ alert('Erro ao marcar coleta: '+(e.message||e)); }
}

async function marcarEntregaEquipe(pedidoId, equipeId){
  if (typeof bloquearSeNaoEquipe === 'function' && bloquearSeNaoEquipe('marcar entrega')) return;
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  const eq = (equipesEntregaGlobais||[]).find(e => String(e.id) === String(equipeId));
  if (!p || !eq || !supabase) return;
  const membro = document.getElementById(`mb_entregar_${pedidoId}`)?.value || null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('pedidos').update({
      entrega_equipe_em: new Date().toISOString(), entrega_equipe_por: membro, entrega_equipe_id: parseInt(equipeId),
      status: 'Entregue', patio_atual: null, patio_desde: null
    }).eq('id', parseInt(pedidoId));
    if (error) throw error;
    try { await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: 'Entregue',
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: `📤 Entregue pela equipe ${eq.nome}${membro?' ('+membro+')':''} — do pátio ao cliente.`
    }); } catch(_){}
    await aposMutacaoPedidos();
    renderizarEquipesPainel();
  } catch(e){ alert('Erro ao marcar entrega: '+(e.message||e)); }
}

// ============================================================
// Avançar status em lote dos carros de uma rota planejada/andamento
// ============================================================
function abrirAvancarStatusRota(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('avançar status')) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return;
  const carros = (pedidosGlobais||[]).filter(p =>
    String(p.rotaId || p.rota_id) === String(rotaId) &&
    !['Entregue','Cancelado'].includes(p.status||'Pendente') &&
    (FLUXO_STATUS[p.status||'Pendente']?.proximos||[]).length > 0);
  const old = document.getElementById('modalAvancarRota'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalAvancarRota';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const linhas = carros.length ? carros.map(p => {
    const prox = (FLUXO_STATUS[p.status||'Pendente']?.proximos||[])[0] || '';
    return `<tr class="corr-tr">
      <td><input type="checkbox" class="avr-check" value="${p.id}" checked></td>

      <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
      <td class="ct-modelo">${p.modelo||'—'}</td>
      <td class="ct-status">${_statusPillPlanilha(p)}</td>
      <td class="ct-rota"><span class="cpl-seta">→</span> <strong>${prox}</strong></td>
    </tr>`;
  }).join('') : '';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:680px;width:94%;max-height:86vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="margin:0">⏩ Avançar status — ${rota.nome || ('#'+rota.id)}</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalAvancarRota').remove()">✕</button>
      </div>
      ${carros.length === 0 ? '<p class="text-muted" style="padding:1rem 0">Nenhum carro para avançar nesta rota (ou precisam de ação individual, como confirmação/checklist).</p>' : `
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">Selecione os carros e avance todos para o próximo status de uma vez. Etapas que exigem confirmação individual (checklist, transbordo) continuam pelo botão ▶ de cada carro.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="_avrSelTodos(true)">Selecionar todos</button>
        <button class="btn btn-secondary btn-sm" onclick="_avrSelTodos(false)">Limpar</button>
        <span id="avrCont" class="text-muted" style="margin-left:auto"></span>
      </div>
      <table class="corr-tabela">
        <thead><tr><th></th><th>ID</th><th>Placa</th><th>Modelo</th><th>Status atual</th><th>Próximo</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:1;padding:13px" onclick="_aplicarAvancarRota(${rotaId})">⏩ Avançar selecionados</button>
      </div>`}
    </div>`;
  document.body.appendChild(div);
  _avrAtualizaCont();
}
function _avrSelTodos(v){ document.querySelectorAll('.avr-check').forEach(c => c.checked = v); _avrAtualizaCont(); }
function _avrAtualizaCont(){
  const n = document.querySelectorAll('.avr-check:checked').length;
  const el = document.getElementById('avrCont'); if (el) el.textContent = `${n} selecionado(s)`;
}
document.addEventListener('change', e => { if (e.target && e.target.classList?.contains('avr-check')) _avrAtualizaCont(); });

async function _aplicarAvancarRota(rotaId){
  const ids = Array.from(document.querySelectorAll('.avr-check:checked')).map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um carro.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  let ok = 0, pulados = 0;
  try {
    for (const id of ids){
      const p = (pedidosGlobais||[]).find(x => String(x.id) === String(id));
      if (!p) continue;
      const cfg = FLUXO_STATUS[p.status||'Pendente'];
      const prox = (cfg?.proximos||[])[0];
      if (!prox){ pulados++; continue; }
      // Só avança direto os passos simples; Transbordo e Entregue exigem tela própria
      if (prox === 'Transbordo' || prox === 'Entregue'){ pulados++; continue; }
      // Trava: Intenção Agendada precisa de cegonha para virar Aguardando Confirmação
      if (p.status === 'Intenção Agendada' && !p.placaCegonha){ pulados++; continue; }
      await supabase.from('pedidos').update({ status: prox }).eq('id', id);
      try { await supabase.from('historico_status').insert({
        pedido_id: id, status_anterior: p.status, status_novo: prox,
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `⏩ Status avançado em lote (rota) para ${prox}.`
      }); } catch(_){}
      ok++;
    }
    await aposMutacaoPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    document.getElementById('modalAvancarRota')?.remove();
    const msg = `⏩ ${ok} carro(s) avançado(s).` + (pulados ? ` ${pulados} exigem ação individual (checklist/transbordo/cegonha).` : '');
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', msg, 'success');
    if (pulados && ok === 0) alert(msg);
  } catch(e){ alert('Erro ao avançar: '+(e.message||e)); }
}

// ============================================================
// HISTÓRICO DE CARGAS CONCLUÍDAS — por motorista e por dia
// Só visualização. Aparece no Painel (logística) e no Faturamento (financeiro).
// ============================================================
// ============================================================
// TABELA DE FRETE (Fase 2b) — valores de referência por cliente/rota/vigência
// Usada pela Central de Conferência para comparar frete lançado × valor esperado.
// ============================================================
let tabelaFreteGlobais = [];
let _tabFreteEdit = null; // linha em edição (ou null)

async function _carregarTabelaFrete(){
  try {
    const { data } = await supabase.from('tabela_frete').select('*').order('cliente', { ascending:true });
    tabelaFreteGlobais = data || [];
  } catch(e){ tabelaFreteGlobais = []; }
}

// Busca o valor de referência vigente para um pedido (cliente + origem + destino [+ categoria])
// Retorna { valor, vigencia } ou null se não houver cadastro aplicável.
function valorTabelaFretePedido(p){
  if (!p) return null;
  const cli = _norm(p.cliente || '');
  const orig = _norm(p.cidadeOrigem || '');
  const dest = _norm(p.cidadeDestino || '');
  const cat = _norm(p.categoriaVeiculo || p.categoria_veiculo || '');
  const dataRef = p.createdAt || p.created_at || p.dataSolicitacao || new Date().toISOString();
  const dRef = new Date(dataRef);

  const candidatos = (tabelaFreteGlobais||[]).filter(t => {
    if (_norm(t.cliente||'') !== cli) return false;
    if (_norm(t.origem||'') !== orig) return false;
    if (_norm(t.destino||'') !== dest) return false;
    // categoria: se a linha tem categoria definida, precisa bater; se vazia, serve pra qualquer uma
    if (t.categoria && _norm(t.categoria) !== cat) return false;
    // vigência: a partir de vigencia_de (se preenchida)
    if (t.vigencia_de && new Date(t.vigencia_de) > dRef) return false;
    return true;
  });
  if (candidatos.length === 0) return null;
  // pega o mais específico (com categoria) e mais recente na vigência
  candidatos.sort((a,b) => {
    const espA = a.categoria ? 1 : 0, espB = b.categoria ? 1 : 0;
    if (espA !== espB) return espB - espA;
    return new Date(b.vigencia_de||0) - new Date(a.vigencia_de||0);
  });
  const t = candidatos[0];
  return { valor: Number(t.valor)||0, vigencia: t.vigencia_de };
}

function renderizarTabelaFrete(){
  const cont = document.getElementById('tabelaFreteConteudo');
  if (!cont) return;
  if (tabelaFreteGlobais.length === 0 && !window._tabFreteCarregada){
    window._tabFreteCarregada = true;
    _carregarTabelaFrete().then(()=>renderizarTabelaFrete());
  }
  const linhas = (tabelaFreteGlobais||[]).slice().sort((a,b)=>(a.cliente||'').localeCompare(b.cliente||''));
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

  const confCSS = `<style id="confEstilosInline">
    #conferenciaConteudo .conf-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
    #conferenciaConteudo .conf-titulo { font-size:1.5rem; font-weight:800; margin:0; }
    #conferenciaConteudo .conf-sub { color:#9ca3af; font-size:.9rem; margin:.3rem 0 0; }
    #conferenciaConteudo .conf-header-acoes { display:flex; gap:8px; flex-wrap:wrap; }
    #conferenciaConteudo .conf-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:18px; }
    @media (max-width:1000px){ #conferenciaConteudo .conf-kpis { grid-template-columns:repeat(2,1fr); } }
    #conferenciaConteudo .conf-kpi { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px 16px; }
    #conferenciaConteudo .conf-kpi-lbl { font-size:.68rem; font-weight:700; letter-spacing:.4px; color:#9ca3af; text-transform:uppercase; }
    #conferenciaConteudo .conf-kpi-num { font-size:1.5rem; font-weight:800; margin:6px 0 2px; }
    #conferenciaConteudo .conf-kpi-hint { font-size:.72rem; color:#9ca3af; }
    #conferenciaConteudo .conf-verde { color:#22c55e; } #conferenciaConteudo .conf-laranja { color:#f59e0b; }
    #conferenciaConteudo .conf-filtros { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:14px 16px; margin-bottom:16px; }
    #conferenciaConteudo .conf-filtro { display:flex; flex-direction:column; gap:4px; }
    #conferenciaConteudo .conf-filtro label { font-size:.7rem; color:#9ca3af; font-weight:600; }
    #conferenciaConteudo .conf-filtro input, #conferenciaConteudo .conf-filtro select { padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.04); color:inherit; font-size:.85rem; }
    #conferenciaConteudo .conf-tabela-wrap { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; overflow:hidden; margin-bottom:16px; }
    #conferenciaConteudo .conf-tabela-titulo { font-size:.78rem; font-weight:800; letter-spacing:.5px; color:#9ca3af; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08); }
    #conferenciaConteudo .conf-tabela { width:100%; border-collapse:collapse; font-size:.85rem; }
    #conferenciaConteudo .conf-tabela th { text-align:left; padding:10px 12px; font-size:.72rem; color:#9ca3af; font-weight:700; border-bottom:1px solid rgba(255,255,255,.08); }
    #conferenciaConteudo .conf-tabela td { padding:11px 12px; border-bottom:1px solid rgba(255,255,255,.05); }
    #conferenciaConteudo .conf-tabela td.center, #conferenciaConteudo .conf-tabela th.center { text-align:center; }
    #conferenciaConteudo .conf-tabela td.right { text-align:right; }
    #conferenciaConteudo .conf-status-pill { font-size:.72rem; font-weight:700; padding:3px 10px; border-radius:999px; }
    #conferenciaConteudo .conf-ver-btn { background:none; border:1px solid rgba(255,255,255,.15); border-radius:6px; padding:4px 8px; cursor:pointer; color:inherit; }
    #conferenciaConteudo .conf-fechamento { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:18px 20px; margin-bottom:16px; }
    #conferenciaConteudo .conf-fech-tit { font-size:.95rem; font-weight:800; margin-bottom:14px; }
    #conferenciaConteudo .conf-fech-resumo { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
    @media (max-width:800px){ #conferenciaConteudo .conf-fech-resumo { grid-template-columns:repeat(2,1fr); } }
    #conferenciaConteudo .conf-fech-resumo > div { display:flex; flex-direction:column; gap:3px; }
    #conferenciaConteudo .conf-fech-resumo span { font-size:.72rem; color:#9ca3af; }
    #conferenciaConteudo .conf-fech-resumo strong { font-size:1.05rem; }
    #conferenciaConteudo .conf-fech-status { padding:12px 14px; border-radius:8px; font-size:.85rem; margin-bottom:12px; }
    #conferenciaConteudo .conf-fech-ok { background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25); color:#22c55e; }
    #conferenciaConteudo .conf-fech-bloq { background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.3); color:#f59e0b; }
    #conferenciaConteudo .conf-fech-fechado { background:rgba(239,68,68,.06); border:1px solid rgba(239,68,68,.25); color:#ef4444; }
    #conferenciaConteudo .conf-nota { font-size:.82rem; color:#9ca3af; background:rgba(59,130,246,.06); border:1px solid rgba(59,130,246,.2); border-radius:10px; padding:12px 16px; }
  </style>`;

  cont.innerHTML = confCSS + `
    <div class="conf-header">
      <div>
        <h1 class="conf-titulo">💵 Frete do Cliente</h1>
        <p class="conf-sub">Valor que cobramos do cliente por trecho — usado na conferência do frete. (Receita)</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_tabFreteNovo()">➕ Nova linha</button>
    </div>

    <div id="tabFreteForm"></div>

    <div class="conf-tabela-wrap">
      <div class="conf-tabela-titulo">VALORES CADASTRADOS (${linhas.length})</div>
      ${linhas.length === 0 ? '<p class="text-muted" style="padding:1.5rem;text-align:center">Nenhum valor cadastrado ainda. Clique em "Nova linha" para começar.<br><span style="font-size:.82rem">Enquanto não houver cadastro, a conferência continua sendo feita manualmente.</span></p>' : `
      <table class="conf-tabela">
        <thead><tr>
          <th>Cliente</th><th>Origem</th><th>Destino</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Vigência</th><th></th>
        </tr></thead>
        <tbody>
          ${linhas.map(t => `<tr>
            <td><strong>${t.cliente||'—'}</strong></td>
            <td>${t.origem||'—'}</td>
            <td>${t.destino||'—'}</td>
            <td>${t.categoria||'<span class="text-muted">todas</span>'}</td>
            <td>${t.tipo_operacao||'<span class="text-muted">—</span>'}</td>
            <td class="right"><strong>${fmt(t.valor)}</strong></td>
            <td>${t.vigencia_de?new Date(t.vigencia_de+'T12:00').toLocaleDateString('pt-BR'):'<span class="text-muted">sempre</span>'}</td>
            <td style="white-space:nowrap">
              <button class="conf-ver-btn" onclick="_tabFreteEditar(${t.id})" title="Editar">✏️</button>
              <button class="conf-ver-btn" onclick="_tabFreteExcluir(${t.id})" title="Excluir">🗑️</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>

    <div class="conf-nota">
      💡 A conferência busca o valor por <strong>cliente + origem + destino</strong> (e categoria, se preenchida), respeitando a vigência.
      Onde não houver valor cadastrado, a Central de Conferência mantém o preenchimento manual.
    </div>`;
}

function _tabFreteNovo(){ _tabFreteEdit = { id:null }; _tabFreteRenderForm(); }
function _tabFreteEditar(id){ _tabFreteEdit = (tabelaFreteGlobais||[]).find(t=>t.id===id) || {id:null}; _tabFreteRenderForm(); }

function _tabFreteRenderForm(){
  const wrap = document.getElementById('tabFreteForm');
  if (!wrap) return;
  if (!_tabFreteEdit){ wrap.innerHTML = ''; return; }
  const t = _tabFreteEdit;
  // datalist de clientes para facilitar
  const clientes = [...new Set((clientesGlobais||[]).map(c=>c.nome).filter(Boolean))].sort();
  wrap.innerHTML = `
    <div class="tabfrete-form">
      <div class="tabfrete-form-tit">${t.id?'✏️ Editar valor':'➕ Novo valor de referência'}</div>
      <div class="tabfrete-grid">
        <div class="conf-filtro"><label>Cliente *</label><input list="tabFreteClientes" id="tfCliente" value="${(t.cliente||'').replace(/"/g,'&quot;')}" placeholder="nome do cliente"></div>
        <datalist id="tabFreteClientes">${clientes.map(c=>`<option value="${c.replace(/"/g,'&quot;')}">`).join('')}</datalist>
        <div class="conf-filtro"><label>Origem (cidade) *</label><input id="tfOrigem" value="${(t.origem||'').replace(/"/g,'&quot;')}" placeholder="cidade origem"></div>
        <div class="conf-filtro"><label>Destino (cidade) *</label><input id="tfDestino" value="${(t.destino||'').replace(/"/g,'&quot;')}" placeholder="cidade destino"></div>
        <div class="conf-filtro"><label>Categoria (opcional)</label><input id="tfCategoria" value="${(t.categoria||'').replace(/"/g,'&quot;')}" placeholder="hatch/sedan/suv... (vazio=todas)"></div>
        <div class="conf-filtro"><label>Tipo de operação (opcional)</label><input id="tfTipo" value="${(t.tipo_operacao||'').replace(/"/g,'&quot;')}" placeholder="normal/especial..."></div>
        <div class="conf-filtro"><label>Valor de referência (R$) *</label><input type="number" step="0.01" id="tfValor" value="${t.valor!=null?t.valor:''}" placeholder="0,00"></div>
        <div class="conf-filtro"><label>Vigência a partir de</label><input type="date" id="tfVigencia" value="${t.vigencia_de||''}"></div>
      </div>
      <div class="tabfrete-form-acoes">
        <button class="btn btn-primary btn-sm" onclick="_tabFreteSalvar()">💾 Salvar</button>
        <button class="btn btn-secondary btn-sm" onclick="_tabFreteCancelar()">Cancelar</button>
      </div>
    </div>`;
}

function _tabFreteCancelar(){ _tabFreteEdit = null; _tabFreteRenderForm(); }

async function _tabFreteSalvar(){
  const cliente = document.getElementById('tfCliente')?.value.trim();
  const origem = document.getElementById('tfOrigem')?.value.trim();
  const destino = document.getElementById('tfDestino')?.value.trim();
  const valor = parseFloat(document.getElementById('tfValor')?.value);
  if (!cliente || !origem || !destino || isNaN(valor)){ alert('Preencha cliente, origem, destino e valor.'); return; }
  const registro = {
    cliente, origem, destino,
    categoria: document.getElementById('tfCategoria')?.value.trim() || null,
    tipo_operacao: document.getElementById('tfTipo')?.value.trim() || null,
    valor,
    vigencia_de: document.getElementById('tfVigencia')?.value || null
  };
  try {
    if (_tabFreteEdit && _tabFreteEdit.id){
      await supabase.from('tabela_frete').update(registro).eq('id', _tabFreteEdit.id);
      const i = tabelaFreteGlobais.findIndex(t=>t.id===_tabFreteEdit.id);
      if (i>=0) tabelaFreteGlobais[i] = { ...tabelaFreteGlobais[i], ...registro };
    } else {
      const { data } = await supabase.from('tabela_frete').insert(registro).select();
      if (data && data[0]) tabelaFreteGlobais.push(data[0]);
    }
    _tabFreteEdit = null;
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Valor salvo na tabela de frete!');
    renderizarTabelaFrete();
  } catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
}

async function _tabFreteExcluir(id){
  if (!confirm('Excluir este valor da tabela de frete?')) return;
  try {
    await supabase.from('tabela_frete').delete().eq('id', id);
    tabelaFreteGlobais = tabelaFreteGlobais.filter(t=>t.id!==id);
    renderizarTabelaFrete();
  } catch(e){ alert('Erro ao excluir: '+(e.message||e)); }
}

// ============================================================
// CENTRAL DE CONFERÊNCIA (perfil financeiro) — Fase 1: estrutura base
// Reusa a base de viagens do Histórico de Cargas, adicionando a camada de conferência.
// ============================================================
let _confFiltros = { de:null, ate:null, motorista:'', cliente:'', status:'' };
let _confViagemSel = null;

// Viagens candidatas à conferência: concluídas (viagens realizadas)
function _confViagens(){
  const rotas = (rotasGlobais||[]).filter(r => r.status === 'concluida' || r.status === 'em_andamento');
  return rotas.map(r => _histDadosViagem(r)).filter(v => v.pedidos.length > 0);
}

// Aplica filtros de período/motorista/cliente
function _confViagensFiltradas(){
  let lista = _confViagens();
  const f = _confFiltros;
  if (f.de){ const d = new Date(f.de+'T00:00:00'); lista = lista.filter(v => v.data && new Date(v.data) >= d); }
  if (f.ate){ const d = new Date(f.ate+'T23:59:59'); lista = lista.filter(v => v.data && new Date(v.data) <= d); }
  if (f.motorista) lista = lista.filter(v => _norm(v.motorista).includes(_norm(f.motorista)));
  if (f.cliente) lista = lista.filter(v => v.pedidos.some(p => _norm(p.cliente||'').includes(_norm(f.cliente))));
  if (f.status) lista = lista.filter(v => _confStatusViagem(v).chave === f.status);
  // ordena por data desc
  return lista.sort((a,b) => new Date(b.data||0) - new Date(a.data||0));
}

// Status de conferência de uma viagem (Fase 1: baseado em CTe e no que já existe;
// a conferência de frete×tabela vem na Fase 2)
function _confStatusViagem(v){
  const totalCarros = v.pedidos.length;
  const cteFaltando = totalCarros - v.comCte;
  // marca de conferência salva na rota (quando existir)
  const conferida = v.rota && v.rota.conferida_em;
  if (conferida) return { chave:'conferida', label:'Conferida', cor:'#22c55e' };
  if (cteFaltando > 0) return { chave:'cte_pendente', label:'CT-e pendente', cor:'#ef4444' };
  return { chave:'pendente', label:'Pendente', cor:'#f59e0b' };
}

function renderizarCentralConferencia(){
  const cont = document.getElementById('conferenciaConteudo');
  if (!cont) return;
  // carrega fechamentos uma vez
  if (window._fechamentosPeriodo === undefined){ window._fechamentosPeriodo = {}; _confCarregarFechamentos().then(()=>renderizarCentralConferencia()); }
  // carrega a tabela de frete uma vez (para conferência automática)
  if (!window._tabFreteCarregada){ window._tabFreteCarregada = true; if (typeof _carregarTabelaFrete==='function') _carregarTabelaFrete().then(()=>renderizarCentralConferencia()); }
  // carrega valores de pernas salvos uma vez
  if (window._pernasCarregadas === undefined){ window._pernasCarregadas = false; _confCarregarPernas().then(()=>renderizarCentralConferencia()); }
  // período padrão: mês atual, se ainda não definido
  if (!_confFiltros.de && !_confFiltros.ate){
    const hoje = new Date();
    _confFiltros.de = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
    _confFiltros.ate = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().slice(0,10);
  }
  const viagens = _confViagensFiltradas();

  // KPIs do período
  const totViagens = viagens.length;
  const totVeiculos = viagens.reduce((s,v)=>s+v.pedidos.length,0);
  const fatBruto = viagens.reduce((s,v)=>s+v.total,0);
  const conferidas = viagens.filter(v => _confStatusViagem(v).chave === 'conferida').length;
  const pendencias = viagens.filter(v => _confStatusViagem(v).chave !== 'conferida').length;

  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

  cont.innerHTML = `
    <div class="conf-header">
      <div>
        <h1 class="conf-titulo">Central de Conferência</h1>
        <p class="conf-sub">Validação de viagens, fretes, CT-es e cálculo de remuneração</p>
      </div>
      <div class="conf-header-acoes">
        <button class="btn btn-secondary btn-sm" onclick="_confExportarCSV()">📊 Exportar Excel/CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="_confExportarPDF()">📄 Exportar PDF</button>
      </div>
    </div>

    <div class="conf-kpis">
      <div class="conf-kpi"><div class="conf-kpi-lbl">VIAGENS</div><div class="conf-kpi-num">${totViagens}</div><div class="conf-kpi-hint">Total no período</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">VEÍCULOS</div><div class="conf-kpi-num">${totVeiculos}</div><div class="conf-kpi-hint">Transportados</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">FATURAMENTO (BRUTO)</div><div class="conf-kpi-num conf-verde">${fmt(fatBruto)}</div><div class="conf-kpi-hint">No período</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">CONFERIDOS</div><div class="conf-kpi-num">${conferidas}</div><div class="conf-kpi-hint">${totViagens?Math.round(conferidas/totViagens*100):0}% do total</div></div>
      <div class="conf-kpi"><div class="conf-kpi-lbl">PENDÊNCIAS</div><div class="conf-kpi-num conf-laranja">${pendencias}</div><div class="conf-kpi-hint">A revisar</div></div>
    </div>

    <div class="conf-filtros">
      <div class="conf-filtro"><label>Período inicial</label><input type="date" id="confDe" value="${_confFiltros.de||''}" onchange="_confSetFiltro('de', this.value)"></div>
      <div class="conf-filtro"><label>Período final</label><input type="date" id="confAte" value="${_confFiltros.ate||''}" onchange="_confSetFiltro('ate', this.value)"></div>
      <div class="conf-filtro"><label>Motorista</label><input type="text" id="confMot" value="${_confFiltros.motorista||''}" placeholder="todos" oninput="var _v=this.value; _mmDeb('confFiltro_motorista', function(){ _confSetFiltro('motorista', _v); })"></div>
      <div class="conf-filtro"><label>Cliente</label><input type="text" id="confCli" value="${_confFiltros.cliente||''}" placeholder="todos" oninput="var _v=this.value; _mmDeb('confFiltro_cliente', function(){ _confSetFiltro('cliente', _v); })"></div>
      <div class="conf-filtro"><label>Status</label>
        <select id="confStatus" onchange="_confSetFiltro('status', this.value)">
          <option value="">Todos</option>
          <option value="pendente" ${_confFiltros.status==='pendente'?'selected':''}>Pendente</option>
          <option value="cte_pendente" ${_confFiltros.status==='cte_pendente'?'selected':''}>CT-e pendente</option>
          <option value="conferida" ${_confFiltros.status==='conferida'?'selected':''}>Conferida</option>
        </select>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_confLimparFiltros()">🧹 Limpar filtros</button>
    </div>

    <div class="conf-tabela-wrap">
      <div class="conf-tabela-titulo">VIAGENS DO PERÍODO</div>
      ${viagens.length === 0 ? '<p class="text-muted" style="padding:1.5rem;text-align:center">Nenhuma viagem realizada no período selecionado.</p>' : `
      <table class="conf-tabela">
        <thead><tr>
          <th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Cliente</th>
          <th>Veíc.</th><th>Frete lançado</th><th>CT-e</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${viagens.map(v => {
            const st = _confStatusViagem(v);
            const cli = v.pedidos[0]?.cliente || '—';
            const rota = `${v.pedidos[0]?.cidadeOrigem||'—'} → ${v.pedidos[v.pedidos.length-1]?.cidadeDestino||'—'}`;
            return `<tr>
              <td><strong>#${v.id}</strong></td>
              <td>${v.data?new Date(v.data).toLocaleDateString('pt-BR'):'—'}</td>
              <td>${v.motorista}</td>
              <td>${v.cegonha}</td>
              <td style="font-size:.82rem">${rota}</td>
              <td>${cli}</td>
              <td class="center">${v.pedidos.length}</td>
              <td class="right">${fmt(v.total)}</td>
              <td class="center">${v.comCte}/${v.pedidos.length}</td>
              <td><span class="conf-status-pill" style="background:${st.cor}22;color:${st.cor}">${st.label}</span></td>
              <td><button class="conf-ver-btn" onclick="_confAbrirDetalhe(${v.id})">👁️</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>

    ${_confPainelFechamento(viagens)}`;
}

// Painel de fechamento do período (Fase 4)
function _confPainelFechamento(viagens){
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const totViagens = viagens.length;
  const conferidas = viagens.filter(v => _confStatusViagem(v).chave === 'conferida').length;
  const naoConferidas = totViagens - conferidas;
  const ctePendentes = viagens.filter(v => _confStatusViagem(v).chave === 'cte_pendente').length;
  const fatBruto = viagens.reduce((s,v)=>s+v.total,0);
  const remunTotal = viagens.reduce((s,v)=>{
    return s + v.pedidos.reduce((ss,p)=>{ const vm=(typeof valorMotoristaPedido==='function')?valorMotoristaPedido(p):{valor:0}; return ss+(vm.valor||0); },0);
  },0);

  // status de fechamento do período (chave = de|ate)
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  const fechado = (window._fechamentosPeriodo||{})[chavePeriodo];

  const pendencias = [];
  if (naoConferidas > 0) pendencias.push(`${naoConferidas} viagem(ns) não conferida(s)`);
  if (ctePendentes > 0) pendencias.push(`${ctePendentes} viagem(ns) com CT-e pendente`);
  const podeFechar = pendencias.length === 0 && totViagens > 0;

  return `
    <div class="conf-fechamento">
      <div class="conf-fech-tit">🔒 Fechamento do período</div>
      <div class="conf-fech-resumo">
        <div><span>Faturamento bruto</span><strong>${fmt(fatBruto)}</strong></div>
        <div><span>Remuneração motoristas</span><strong>${fmt(remunTotal)}</strong></div>
        <div><span>Resultado operacional</span><strong style="color:#22c55e">${fmt(fatBruto - remunTotal)}</strong></div>
        <div><span>Viagens conferidas</span><strong>${conferidas}/${totViagens}</strong></div>
      </div>
      ${fechado ? `
        <div class="conf-fech-status conf-fech-fechado">
          🔒 <strong>FECHAMENTO CONCLUÍDO</strong> — fechado por ${fechado.por} em ${new Date(fechado.em).toLocaleString('pt-BR')}.
          <div style="margin-top:4px;font-size:.8rem">As viagens deste período estão travadas para conferência.</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="_confReabrirFechamento()">🔓 Reabrir fechamento</button>
      ` : podeFechar ? `
        <div class="conf-fech-status conf-fech-ok">🟢 Tudo conferido — pronto para fechar o período.</div>
        <button class="btn btn-primary" onclick="_confLiberarFechamento()">🔒 Liberar para fechamento</button>
      ` : `
        <div class="conf-fech-status conf-fech-bloq">
          ⚠️ <strong>FECHAMENTO BLOQUEADO</strong> — resolva as pendências antes:
          <ul style="margin:6px 0 0;padding-left:20px">${pendencias.map(p=>`<li>${p}</li>`).join('')}</ul>
        </div>
      `}
    </div>`;
}

async function _confLiberarFechamento(){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  if (!confirm(`Fechar o período de ${_confFiltros.de} a ${_confFiltros.ate}?\n\nAs viagens deste período ficarão travadas para conferência (só reabrindo o fechamento).`)) return;
  try {
    const registro = { periodo_de:_confFiltros.de, periodo_ate:_confFiltros.ate, fechado_por:usuario, fechado_em:new Date().toISOString(), status:'fechado' };
    await supabase.from('fechamentos').insert(registro);
    window._fechamentosPeriodo = window._fechamentosPeriodo || {};
    window._fechamentosPeriodo[chavePeriodo] = { por:usuario, em:registro.fechado_em };
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('🔒 Período fechado com sucesso!');
    renderizarCentralConferencia();
  } catch(e){ alert('Erro ao fechar período: '+(e.message||e)); }
}

async function _confReabrirFechamento(){
  const motivo = prompt('Motivo da reabertura do fechamento:\n(será registrado com seu nome, data e hora)');
  if (motivo === null || !motivo.trim()) return;
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  try {
    await supabase.from('fechamentos').insert({
      periodo_de:_confFiltros.de, periodo_ate:_confFiltros.ate,
      fechado_por:usuario, fechado_em:new Date().toISOString(),
      status:'reaberto', motivo_reabertura:motivo.trim()
    });
    delete (window._fechamentosPeriodo||{})[chavePeriodo];
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('🔓 Fechamento reaberto (registrado).');
    renderizarCentralConferencia();
  } catch(e){ alert('Erro ao reabrir: '+(e.message||e)); }
}

// Carrega os fechamentos existentes (chamado no boot / ao abrir a central)
async function _confCarregarFechamentos(){
  try {
    const { data } = await supabase.from('fechamentos').select('*').order('fechado_em', { ascending:true });
    window._fechamentosPeriodo = {};
    (data||[]).forEach(f => {
      const chave = `${f.periodo_de}|${f.periodo_ate}`;
      if (f.status === 'fechado') window._fechamentosPeriodo[chave] = { por:f.fechado_por, em:f.fechado_em };
      else if (f.status === 'reaberto') delete window._fechamentosPeriodo[chave];
    });
  } catch(e){ /* tabela pode não existir ainda */ }
}

// ===== Fase 5: Relatório consolidado (CSV/Excel e PDF) =====
function _confLinhasRelatorio(){
  const viagens = _confViagensFiltradas();
  return viagens.map(v => {
    const st = _confStatusViagem(v);
    const cli = v.pedidos[0]?.cliente || '—';
    const rota = `${v.pedidos[0]?.cidadeOrigem||'—'} → ${v.pedidos[v.pedidos.length-1]?.cidadeDestino||'—'}`;
    const esperado = v.pedidos.reduce((s,p)=> s + (p.freteEsperado!=null?Number(p.freteEsperado):0), 0);
    const temEsperado = v.pedidos.some(p => p.freteEsperado != null);
    const diferenca = temEsperado ? (v.total - esperado) : null;
    return { v, st, cli, rota, esperado, temEsperado, diferenca };
  });
}

function _confExportarCSV(){
  const linhas = _confLinhasRelatorio();
  const head = ['Viagem','Data','Motorista','Cegonha','Rota','Cliente','Veiculos','Frete_lancado','Valor_tabela','Diferenca','CTe_conferidos','CTe_total','Status'];
  const rows = [head];
  linhas.forEach(({v,st,cli,rota,esperado,temEsperado,diferenca}) => {
    rows.push([
      '#'+v.id,
      v.data?new Date(v.data).toLocaleDateString('pt-BR'):'-',
      v.motorista, v.cegonha, rota, cli, v.pedidos.length,
      v.total.toFixed(2).replace('.',','),
      temEsperado?esperado.toFixed(2).replace('.',','):'-',
      diferenca!=null?diferenca.toFixed(2).replace('.',','):'-',
      v.comCte, v.pedidos.length, st.label
    ]);
  });
  const csv = rows.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `conferencia_${_confFiltros.de||''}_a_${_confFiltros.ate||''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function _confExportarPDF(){
  const linhas = _confLinhasRelatorio();
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const periodo = `${_confFiltros.de?new Date(_confFiltros.de+'T12:00').toLocaleDateString('pt-BR'):'início'} a ${_confFiltros.ate?new Date(_confFiltros.ate+'T12:00').toLocaleDateString('pt-BR'):'hoje'}`;
  const totFat = linhas.reduce((s,l)=>s+l.v.total,0);
  const totVeic = linhas.reduce((s,l)=>s+l.v.pedidos.length,0);
  const conferidas = linhas.filter(l=>l.st.chave==='conferida').length;

  const corpo = `
    <div class="filtros"><strong>Período:</strong> ${periodo} &nbsp;·&nbsp; <strong>${linhas.length}</strong> viagens · <strong>${totVeic}</strong> veículos · <strong>${conferidas}</strong> conferidas</div>
    <table>
      <thead><tr>
        <th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Cliente</th>
        <th>Veíc.</th><th>Frete</th><th>Tabela</th><th>Dif.</th><th>CT-e</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${linhas.map(({v,st,cli,rota,esperado,temEsperado,diferenca})=>`<tr>
          <td><strong>#${v.id}</strong></td>
          <td>${v.data?new Date(v.data).toLocaleDateString('pt-BR'):'—'}</td>
          <td>${v.motorista}</td>
          <td>${v.cegonha}</td>
          <td>${rota}</td>
          <td>${cli}</td>
          <td style="text-align:center">${v.pedidos.length}</td>
          <td>${fmt(v.total)}</td>
          <td>${temEsperado?fmt(esperado):'—'}</td>
          <td>${diferenca!=null?fmt(diferenca):'—'}</td>
          <td style="text-align:center">${v.comCte}/${v.pedidos.length}</td>
          <td>${st.label}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="totalgeral">Faturamento bruto do período: ${fmt(totFat)}</div>`;

  if (typeof _abrirPDF === 'function') _abrirPDF('Central de Conferência — Relatório do período', corpo);
  else alert('Template de PDF indisponível.');
}



function _confSetFiltro(campo, valor){
  _confFiltros[campo] = valor;
  const ativo = document.activeElement;
  const id = ativo?.id;
  const pos = ativo && typeof ativo.selectionStart==='number' ? ativo.selectionStart : null;
  renderizarCentralConferencia();
  if (id){ const el = document.getElementById(id); if (el){ el.focus(); if(pos!==null){ try{el.setSelectionRange(pos,pos);}catch(e){} } } }
}

function _confLimparFiltros(){
  _confFiltros = { de:null, ate:null, motorista:'', cliente:'', status:'' };
  renderizarCentralConferencia();
}

let _confAbaDetalhe = 'veiculos';
// valores esperados de frete digitados manualmente (memória local até salvar): { pedidoId: valor }
let _confValoresEsperados = {};

function _confAbrirDetalhe(viagemId){
  _confViagemSel = viagemId;
  _confAbaDetalhe = 'veiculos';
  _confValoresEsperados = {};
  _confRenderPainel();
}

function _confFecharPainel(){
  document.getElementById('confPainelOverlay')?.remove();
  _confViagemSel = null;
}

function _confSelAbaDetalhe(aba){ _confAbaDetalhe = aba; _confRenderPainel(); }

function _confRenderPainel(){
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(_confViagemSel));
  if (!r){ _confFecharPainel(); return; }
  const v = _histDadosViagem(r);
  const st = _confStatusViagem(v);
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  const cli = v.pedidos[0]?.cliente || '—';
  const rota = `${v.pedidos[0]?.cidadeOrigem||'—'} → ${v.pedidos[v.pedidos.length-1]?.cidadeDestino||'—'}`;

  const old = document.getElementById('confPainelOverlay'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'confPainelOverlay';
  div.className = 'conf-painel-overlay';
  div.innerHTML = `
    <div class="conf-painel-bg" onclick="_confFecharPainel()"></div>
    <div class="conf-painel">
      <div class="conf-painel-head">
        <div>
          <div class="conf-painel-tit">Detalhes da Viagem #${v.id}</div>
          <span class="conf-status-pill" style="background:${st.cor}22;color:${st.cor}">${st.label}</span>
        </div>
        <button class="conf-painel-x" onclick="_confFecharPainel()">✕</button>
      </div>

      <div class="conf-painel-info">
        <div><span class="conf-info-lbl">👤 Motorista</span><strong>${v.motorista}</strong></div>
        <div><span class="conf-info-lbl">🚛 Cegonha</span><strong>${v.cegonha}</strong></div>
        <div><span class="conf-info-lbl">📅 Data</span><strong>${v.data?new Date(v.data).toLocaleDateString('pt-BR'):'—'}</strong></div>
        <div><span class="conf-info-lbl">🗺️ Rota</span><strong>${rota}</strong></div>
        <div><span class="conf-info-lbl">🏢 Cliente</span><strong>${cli}</strong></div>
      </div>

      <div class="conf-painel-abas">
        <button class="conf-aba ${_confAbaDetalhe==='veiculos'?'ativo':''}" onclick="_confSelAbaDetalhe('veiculos')">Veículos (${v.pedidos.length})</button>
        <button class="conf-aba ${_confAbaDetalhe==='frete'?'ativo':''}" onclick="_confSelAbaDetalhe('frete')">Frete e Tabela</button>
        <button class="conf-aba ${_confAbaDetalhe==='ctes'?'ativo':''}" onclick="_confSelAbaDetalhe('ctes')">CT-es (${v.comCte}/${v.pedidos.length})</button>
        <button class="conf-aba ${_confAbaDetalhe==='remuneracao'?'ativo':''}" onclick="_confSelAbaDetalhe('remuneracao')">Remuneração</button>
      </div>

      <div class="conf-painel-corpo">${_confAbaConteudo(v)}</div>

      <div class="conf-painel-rodape">
        ${st.chave==='conferida'
          ? `<div class="conf-conferida-info">✅ Conferida ${r.conferida_por?('por '+r.conferida_por):''} ${r.conferida_em?('em '+new Date(r.conferida_em).toLocaleString('pt-BR')):''}</div>
             <button class="btn btn-secondary btn-sm" onclick="_confDesmarcarConferida(${v.id})">Reabrir conferência</button>`
          : `<button class="btn btn-primary" onclick="_confMarcarConferida(${v.id})">✅ Marcar viagem como conferida</button>`}
      </div>
    </div>`;
  document.body.appendChild(div);
}

// ============================================================
// CONFERÊNCIA POR PERNA (trecho a trecho do pedido transbordado)
// ============================================================
// Monta a lista de pernas que um pedido percorreu, usando o vínculo histórico
// (viagem_pedidos) + a rota de cada perna. Cada perna tem trecho, motorista,
// cegonha, status (concluída/andamento) e valor (tabela ou manual/definido).
function _confPernasDoPedido(p){
  if (!p) return { pernas: [], finalizado: false };
  const vinculos = (viagemPedidosGlobais||[])
    .filter(vp => String(vp.pedido_id) === String(p.id))
    .sort((a,b) => new Date(a.entrou_em||a.created_at||0) - new Date(b.entrou_em||b.created_at||0));

  // Se não há vínculo histórico (pedido nunca transbordou / tabela vazia), trata como perna única.
  if (vinculos.length === 0){
    const rotaAtual = (rotasGlobais||[]).find(r => String(r.id) === String(p.rotaId || p.rota_id));
    const unica = {
      trechoOrigem: p.cidadeOrigem || '—',
      trechoDestino: p.cidadeDestino || '—',
      motorista: (rotaAtual && rotaAtual.motorista_1) || p.motorista1 || '—',
      cegonha: (rotaAtual && rotaAtual.placa_cegonha) || p.placaCegonha || '—',
      concluida: p.status === 'Entregue',
      rotaId: rotaAtual ? rotaAtual.id : null
    };
    const finalizado = p.status === 'Entregue';
    return { pernas: [unica], finalizado };
  }

  // Monta cada perna a partir das viagens que o pedido passou
  const pernas = vinculos.map((vp, i) => {
    const rota = (rotasGlobais||[]).find(r => String(r.id) === String(vp.rota_id));
    // origem da perna: para a 1ª usa a origem do pedido; para as seguintes, o pátio de transbordo anterior
    const origemPerna = (i === 0)
      ? (p.cidadeOrigem || '—')
      : (vinculos[i-1].cidade_transbordo || p.cidadeTransbordo || rota && rota.nome || '—');
    // destino da perna: se saiu por transbordo, o destino é o ponto de transbordo; senão, o destino final
    const destinoPerna = vp.saiu_em
      ? (vp.cidade_transbordo || p.cidadeTransbordo || '(transbordo)')
      : (p.cidadeDestino || '—');
    return {
      trechoOrigem: origemPerna,
      trechoDestino: destinoPerna,
      motorista: (rota && rota.motorista_1) || '—',
      cegonha: (rota && rota.placa_cegonha) || '—',
      concluida: !!vp.saiu_em || (rota && rota.status === 'concluida') || p.status === 'Entregue',
      transbordo: !!vp.saiu_em,
      rotaId: vp.rota_id
    };
  });

  // Trajeto finalizado? Só quando a última perna chegou ao destino final E o pedido está Entregue.
  const ultima = pernas[pernas.length - 1];
  const chegouDestinoFinal = ultima && _cidadeIgual(ultima.trechoDestino, p.cidadeDestino);
  const finalizado = (p.status === 'Entregue') && chegouDestinoFinal;

  return { pernas, finalizado };
}

// Valor de uma perna: tabela do trecho > manual do trecho > valor definido na conferência > null
function _confValorPerna(perna, p){
  const cat = p.categoriaVeiculo || p.categoria_veiculo || '';
  const chaveManual = `${p.id}|${perna.trechoOrigem}|${perna.trechoDestino}`;
  if (window._confValoresPerna && window._confValoresPerna[chaveManual] != null){
    return { valor: Number(window._confValoresPerna[chaveManual])||0, origem: 'definido' };
  }
  const tab = (typeof valorTabelaTrecho==='function') ? valorTabelaTrecho(perna.trechoOrigem, perna.trechoDestino, cat) : null;
  if (tab != null) return { valor: tab, origem: 'tabela' };
  const man = (typeof valorManualTrecho==='function') ? valorManualTrecho(perna.trechoOrigem, perna.trechoDestino, cat) : null;
  if (man != null) return { valor: man, origem: 'manual' };
  return { valor: null, origem: 'pendente' };
}

// Guarda o valor definido para uma perna (sem re-renderizar, pra não perder foco)
function _confSetValorPerna(chave, valor){
  window._confValoresPerna = window._confValoresPerna || {};
  window._confValoresPerna[chave] = valor === '' ? null : parseFloat(valor);
}

// Carrega os valores de pernas já salvos no banco
async function _confCarregarPernas(){
  window._pernasCarregadas = true;
  window._confValoresPerna = window._confValoresPerna || {};
  try {
    const { data } = await supabase.from('remuneracao_pernas').select('*');
    (data||[]).forEach(r => {
      const chave = `${r.pedido_id}|${r.trecho_origem}|${r.trecho_destino}`;
      window._confValoresPerna[chave] = Number(r.valor);
    });
  } catch(e){ /* tabela pode não existir ainda */ }
}

// Salva os valores das pernas definidos manualmente
async function _confSalvarPernas(viagemId){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  if ((window._fechamentosPeriodo||{})[chavePeriodo]){ alert('🔒 Este período está fechado. Reabra o fechamento para editar.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  const valores = window._confValoresPerna || {};
  try {
    for (const chave of Object.keys(valores)){
      const val = valores[chave];
      if (val == null) continue;
      const [pedidoId, origem, destino] = chave.split('|');
      await supabase.from('remuneracao_pernas').upsert({
        pedido_id: parseInt(pedidoId),
        trecho_origem: origem,
        trecho_destino: destino,
        valor: val,
        definido_por: usuario,
        definido_em: new Date().toISOString()
      }, { onConflict: 'pedido_id,trecho_origem,trecho_destino' });
    }
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Valores das pernas salvos!');
  } catch(e){ alert('Erro ao salvar pernas: '+(e.message||e)); }
}

function _confAbaConteudo(v){
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});

  if (_confAbaDetalhe === 'veiculos'){
    return `<table class="conf-det-tabela">
      <thead><tr><th>#</th><th>Placa</th><th>Modelo</th><th>Origem</th><th>Destino</th><th>Frete</th><th>CT-e</th></tr></thead>
      <tbody>${v.pedidos.map((p,i)=>`<tr>
        <td>${i+1}</td>
        <td><strong>${p.placa||'—'}</strong></td>
        <td>${p.modelo||'—'}</td>
        <td>${p.cidadeOrigem||'—'}</td>
        <td>${p.cidadeDestino||'—'}</td>
        <td class="right">${fmt(p.valorFrete)}</td>
        <td class="center">${(p.numeroCte||cteInfoDoPedido(p.id))?'🟢':'🔴'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5"><strong>Total da viagem</strong></td><td class="right"><strong>${fmt(v.total)}</strong></td><td class="center">${v.comCte}/${v.pedidos.length}</td></tr></tfoot>
    </table>`;
  }

  if (_confAbaDetalhe === 'frete'){
    let totalLancado = 0, totalEsperado = 0, temEsperado = false;
    const linhas = v.pedidos.map((p,i)=>{
      const lancado = Number(p.valorFrete||0);
      totalLancado += lancado;
      const esperadoSalvo = (p.freteEsperado != null ? p.freteEsperado : null);
      // Fase 2b: busca automática na tabela de frete cadastrada
      const daTabela = (typeof valorTabelaFretePedido==='function') ? valorTabelaFretePedido(p) : null;
      const esperado = _confEsperadoDoPedido(p);
      const fonteAuto = (esperadoSalvo == null && !_confEsperadoEditado(p.id) && daTabela);
      if (esperado != null && esperado !== ''){ temEsperado = true; totalEsperado += Number(esperado); }
      const dif = (esperado != null && esperado !== '') ? (lancado - Number(esperado)) : null;
      const difCor = dif === null ? '' : (Math.abs(dif) < 0.01 ? '#22c55e' : '#f59e0b');
      const difTxt = dif === null ? '—' : (Math.abs(dif) < 0.01 ? 'R$ 0,00 🟢' : fmt(dif)+' 🟠');
      return `<tr>
        <td><strong>${p.placa||'—'}</strong><br><span class="text-muted" style="font-size:.75rem">${p.cidadeOrigem||''}→${p.cidadeDestino||''}</span></td>
        <td class="right">${fmt(lancado)}</td>
        <td><input type="number" step="0.01" class="conf-esperado-input" value="${esperado!=null?esperado:''}" placeholder="valor tabela" oninput="_confSetEsperado(${p.id}, this.value)">${fonteAuto?'<br><span style="font-size:.68rem;color:#3b82f6">🔵 da tabela</span>':''}</td>
        <td class="right" id="confDif_${p.id}" style="color:${difCor};font-weight:700">${difTxt}</td>
      </tr>`;
    }).join('');
    const difTotal = temEsperado ? (totalLancado - totalEsperado) : null;
    return `
      <div class="conf-frete-aviso">💡 Valores marcados <span style="color:#3b82f6">🔵 da tabela</span> vieram do cadastro automático. Onde não há cadastro, digite o <strong>valor esperado</strong> manualmente — ou cadastre na aba <strong>Tabela de Frete</strong> para automatizar.</div>
      <table class="conf-det-tabela">
        <thead><tr><th>Carro</th><th>Frete lançado</th><th>Valor esperado (tabela)</th><th>Diferença</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td class="right"><strong>${fmt(totalLancado)}</strong></td><td class="right"><strong id="confTotEsperado">${temEsperado?fmt(totalEsperado):'—'}</strong></td><td class="right"><strong id="confTotDif">${difTotal!==null?fmt(difTotal):'—'}</strong></td></tr></tfoot>
      </table>
      <div class="conf-frete-acoes">
        <label style="font-size:.8rem;color:var(--text-secondary,#9ca3af)">Justificativa do ajuste (opcional)</label>
        <input type="text" id="confJustificativa" class="conf-just-input" placeholder="ex: ajuste conforme tabela vigente para o cliente">
        <button class="btn btn-primary btn-sm" onclick="_confSalvarFrete(${v.id})">💾 Salvar valores conferidos</button>
      </div>`;
  }

  if (_confAbaDetalhe === 'ctes'){
    return `<table class="conf-det-tabela">
      <thead><tr><th>Placa</th><th>Nº CT-e</th><th>Status</th></tr></thead>
      <tbody>${v.pedidos.map(p=>{
        const info = cteInfoDoPedido(p.id);
        const num = p.numeroCte || (info && info.numero) || null;
        const temCte = num || info;
        return `<tr>
          <td><strong>${p.placa||'—'}</strong></td>
          <td>${num || '<span class="text-muted">—</span>'}</td>
          <td>${temCte?'<span style="color:#22c55e;font-weight:700">🟢 Emitido</span>':'<span style="color:#ef4444;font-weight:700">🔴 Pendente</span>'}</td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="2"><strong>Conferidos</strong></td><td><strong>${v.comCte}/${v.pedidos.length}</strong></td></tr></tfoot>
    </table>`;
  }

  if (_confAbaDetalhe === 'remuneracao'){
    // Conferência POR PERNA: cada pedido mostra as pernas que percorreu, com o valor
    // de cada trecho (tabela ou definido manualmente) e o status (finalizado ou não).
    let totalGeral = 0, temPendente = false, temNaoFinalizado = false;
    const origemLabel = { tabela:'🟢 Tabela do trecho', manual:'🟠 Manual do trecho', definido:'🔵 Definido por você', pendente:'🔴 Sem valor' };

    const blocos = v.pedidos.map(p => {
      const { pernas, finalizado } = _confPernasDoPedido(p);
      if (!finalizado) temNaoFinalizado = true;
      let totalPedido = 0, pedidoPendente = false;
      const linhasPernas = pernas.map((perna,i) => {
        const vp = _confValorPerna(perna, p);
        if (vp.valor == null){ pedidoPendente = true; temPendente = true; } else { totalPedido += Number(vp.valor); }
        const chaveManual = `${p.id}|${perna.trechoOrigem}|${perna.trechoDestino}`;
        const podeDefinir = vp.origem === 'pendente' || vp.origem === 'definido';
        return `<tr>
          <td style="font-size:.78rem;color:#9ca3af">Perna ${i+1}</td>
          <td><strong>${perna.trechoOrigem}</strong> → <strong>${perna.trechoDestino}</strong>
            ${perna.transbordo?'<span style="color:#fb923c;font-size:.7rem"> 🔀 transbordo</span>':''}
            ${!perna.concluida?'<span style="color:#f59e0b;font-size:.7rem"> ⏳ em andamento</span>':''}
          </td>
          <td style="font-size:.8rem">👤 ${perna.motorista}<br><span class="text-muted" style="font-size:.72rem">🚛 ${perna.cegonha}</span></td>
          <td>${podeDefinir
            ? `<input type="number" step="0.01" class="conf-perna-input" value="${vp.origem==='definido'?vp.valor:''}" placeholder="definir R$" oninput="_confSetValorPerna('${chaveManual.replace(/'/g,"\\'")}', this.value)" style="width:110px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.04);color:inherit;font-size:.82rem">`
            : `<span style="font-size:.74rem;color:#22c55e">${origemLabel[vp.origem]}</span>`}
          </td>
          <td class="right"><strong>${vp.valor!=null?fmt(vp.valor):'—'}</strong></td>
        </tr>`;
      }).join('');
      totalGeral += totalPedido;

      return `<div style="margin-bottom:16px;border:1px solid rgba(255,255,255,.1);border-radius:10px;overflow:hidden">
        <div style="padding:10px 12px;background:rgba(255,255,255,.03);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div><strong>#${p.id}</strong> · ${p.placa||'—'} <span class="text-muted" style="font-size:.78rem">${p.modelo||''}</span>
            <span class="text-muted" style="font-size:.75rem"> · ${p.cidadeOrigem||''} → ${p.cidadeDestino||''}</span></div>
          <div>${finalizado
            ? '<span style="color:#22c55e;font-size:.75rem;font-weight:700">✅ Trajeto completo</span>'
            : '<span style="color:#f59e0b;font-size:.75rem;font-weight:700">⚠️ Trajeto NÃO finalizado</span>'}</div>
        </div>
        <table class="conf-det-tabela" style="margin:0">
          <thead><tr><th></th><th>Trecho da perna</th><th>Motorista / Cegonha</th><th>Valor</th><th>Total</th></tr></thead>
          <tbody>${linhasPernas}</tbody>
          <tfoot><tr><td colspan="4"><strong>Total do pedido #${p.id}${pedidoPendente?' <span style="color:#ef4444;font-size:.72rem">(perna sem valor)</span>':''}</strong></td><td class="right"><strong>${fmt(totalPedido)}</strong></td></tr></tfoot>
        </table>
      </div>`;
    }).join('');

    return `
      <div class="conf-frete-aviso">💡 Cada pedido mostra as <strong>pernas</strong> que percorreu. O valor vem da <strong>tabela do trecho</strong> quando existe; onde não há preço tabelado, <strong>defina o valor</strong> daquela perna. ${temNaoFinalizado?'<br><strong style="color:#f59e0b">⚠️ Há pedido(s) com trajeto não finalizado — confira só quando o trajeto estiver completo.</strong>':''}</div>
      ${blocos}
      <div style="margin-top:14px;padding:12px 14px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:8px;font-size:.85rem">
        <div style="display:flex;justify-content:space-between"><span>Faturamento da viagem</span><strong>${fmt(v.total)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Remuneração total (todas as pernas)${temPendente?' <span style="color:#ef4444;font-size:.72rem">(há pendências)</span>':''}</span><strong>${fmt(totalGeral)}</strong></div>
      </div>
      <div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="_confSalvarPernas(${v.id})">💾 Salvar valores das pernas</button></div>`;
  }
  return '';
}

// Guarda o que o usuário digitou. hasOwnProperty permite distinguir
// "campo apagado de propósito" (null) de "nunca foi tocado" (undefined).
function _confEsperadoEditado(pedidoId){
  return Object.prototype.hasOwnProperty.call(_confValoresEsperados || {}, pedidoId);
}

function _confEsperadoDoPedido(p){
  if (_confEsperadoEditado(p.id)) return _confValoresEsperados[p.id];
  if (p.freteEsperado != null) return p.freteEsperado;
  const daTabela = (typeof valorTabelaFretePedido==='function') ? valorTabelaFretePedido(p) : null;
  return daTabela ? daTabela.valor : null;
}

// Digitar NÃO redesenha mais o painel: só recalcula a coluna "Diferença"
// e os totais do rodapé. Assim o campo não perde o foco nem o cursor.
function _confSetEsperado(pedidoId, valor){
  const num = (valor === '' || valor == null) ? null : parseFloat(valor);
  _confValoresEsperados[pedidoId] = (num != null && isNaN(num)) ? null : num;
  _confAtualizarDiferencasFrete();
}

function _confAtualizarDiferencasFrete(){
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(_confViagemSel));
  if (!r) return;
  const v = _histDadosViagem(r);
  const fmt = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  let totalLancado = 0, totalEsperado = 0, temEsperado = false;
  v.pedidos.forEach(p => {
    const lancado = Number(p.valorFrete||0);
    totalLancado += lancado;
    const esp = _confEsperadoDoPedido(p);
    const valido = (esp != null && esp !== '' && !isNaN(Number(esp)));
    if (valido){ temEsperado = true; totalEsperado += Number(esp); }
    const cel = document.getElementById('confDif_' + p.id);
    if (cel){
      const dif = valido ? (lancado - Number(esp)) : null;
      cel.style.color = dif === null ? '' : (Math.abs(dif) < 0.01 ? '#22c55e' : '#f59e0b');
      cel.textContent = dif === null ? '—' : (Math.abs(dif) < 0.01 ? 'R$ 0,00 🟢' : fmt(dif)+' 🟠');
    }
  });
  const tE = document.getElementById('confTotEsperado');
  if (tE) tE.textContent = temEsperado ? fmt(totalEsperado) : '—';
  const tD = document.getElementById('confTotDif');
  if (tD) tD.textContent = temEsperado ? fmt(totalLancado - totalEsperado) : '—';
}

