/* ============================================================================
   MOVEMASTER — mod-12.js  (84 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: _planPedidoDatasHTML, _planFmtDataCurta, _planSelCorredor, _planSelSemRota, _planSelTransbordo, _planSelAprovacao, _planAprovacaoListaHTML, _aprovarPedido, ...
   ============================================================================ */
function _planPedidoDatasHTML(p){
  const dataLanc = _dataLancamento(p);
  const criacao = dataLanc ? _planFmtDataCurta(dataLanc) : null;
  const entrega = (p.dataPrevEntrega || p.prazoEntregaEstimado) ? _planFmtDataCurta(p.dataPrevEntrega || p.prazoEntregaEstimado) : null;
  // dias esperando desde o lançamento
  let diasTag = '';
  if (dataLanc){
    const dias = Math.floor((Date.now() - new Date(dataLanc).getTime()) / 86400000);
    if (dias >= 1){ const cor = dias >= 5 ? '#ef4444' : dias >= 3 ? '#f59e0b' : '#9ca3af'; diasTag = ` <span style="color:${cor};font-weight:600">• ${dias}d esperando</span>`; }
  }
  if (!criacao && !entrega) return '';
  return `<div class="plan-pedido-datas">
    ${criacao ? `<span title="Data de lançamento do pedido">📅 Lançado: ${criacao}${diasTag}</span>` : ''}
    ${entrega ? `<span title="Data prevista de entrega">🏁 Entrega: ${entrega}</span>` : ''}
  </div>`;
}
function _planFmtDataCurta(d){
  try { return new Date(d.length<=10 ? d+'T12:00' : d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}); }
  catch(e){ return d; }
}

function _planSelCorredor(id){ _planCorredorSel = id; renderizarPlanejamentoRotas(); }
function _planSelSemRota(){ _planCorredorSel = '__semrota__'; renderizarPlanejamentoRotas(); }
function _planSelTransbordo(){ _planCorredorSel = '__transbordo__'; renderizarPlanejamentoRotas(); }
function _planSelAprovacao(){ _planCorredorSel = '__aprovacao__'; renderizarPlanejamentoRotas(); }

// Lista de pedidos aguardando aprovação — com botão aprovar
function _planAprovacaoListaHTML(){
  try {
    const pedidos = (typeof _planFiltraBusca==='function') ? _planFiltraBusca(_planPedidosAguardandoAprovacao()) : _planPedidosAguardandoAprovacao();
    if (pedidos.length === 0) return '<p class="text-muted" style="padding:1rem;text-align:center;font-size:.85rem">🎉 Nenhum pedido aguardando aprovação.</p>';
    return pedidos.map(p => {
      let datasHTML = '';
      try { datasHTML = _planPedidoDatasHTML(p); } catch(e){ datasHTML = ''; }
      return `<div class="plan-aprov-card" draggable="true" ondragstart="_planDragStart(event, ${p.id})">
        <div class="plan-aprov-top">
          <span><strong>#${p.id}</strong> · ${p.placa||''} <span class="text-muted">${p.modelo||''}</span></span>
          <span class="plan-aprov-selo">⏳ Aguardando</span>
        </div>
        <div class="plan-aprov-sub">${p.cliente||''} · ${p.cidadeOrigem||''} → ${p.cidadeDestino||''}</div>
        ${datasHTML}
        <div class="plan-aprov-acoes">
          <button class="plan-aprov-btn" onclick="_aprovarPedido(${p.id})">✅ Aprovar pedido</button>
        </div>
        <div class="plan-aprov-hint">👉 aprovar joga no fluxo. Ou arraste direto para um corredor (também aprova).</div>
      </div>`;
    }).join('');
  } catch(e){
    return '<p class="text-muted" style="padding:1rem">Erro ao carregar a lista. Recarregue a página (Ctrl+Shift+R).</p>';
  }
}

// Aprova o pedido — entra no fluxo normal
async function _aprovarPedido(pedidoId, corredorId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const usuario = _usuarioAtualNome() || 'Sistema';
  try {
    const upd = { aprovado: true, aprovado_em: new Date().toISOString(), aprovado_por: usuario };
    if (corredorId) upd.corredor_manual_id = parseInt(corredorId);
    await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    p.aprovado = true; p.aprovadoEm = upd.aprovado_em;
    if (corredorId) p.corredorManualId = parseInt(corredorId);
    if (typeof renderizarPlanejamentoRotas === 'function') renderizarPlanejamentoRotas();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ Pedido #${pedidoId} aprovado e liberado para o fluxo.`, 'success');
  } catch(e){ alert('Erro ao aprovar: '+(e.message||e)); }
}

// Lista de pedidos aguardando transbordo — com linha do tempo e comando de próxima ação
function _planTransbordoListaHTML(){
  try {
    const pedidos = (typeof _planFiltraBusca==='function') ? _planFiltraBusca(_planPedidosAguardandoTransbordo()) : _planPedidosAguardandoTransbordo();
    if (pedidos.length === 0) return '<p class="text-muted" style="padding:1rem;text-align:center;font-size:.85rem">🎉 Nenhum pedido aguardando transbordo.</p>';
    return pedidos.map(p => {
      const patio = p.patioAtual || p.cidadeTransbordo || '—';
      let timeline = '';
      try { timeline = _linhaDoTempoPedidoHTML(p); } catch(e){ timeline = ''; }
      return `<div class="plan-transb-card">
        <div class="plan-transb-top">
          <span><strong>#${p.id}</strong> · ${p.placa||''} <span class="text-muted">${p.modelo||''}</span></span>
          <span class="plan-transb-selo">🟣 Transbordo${p.qtdTransbordos>1?` (${p.qtdTransbordos}ª vez)`:''}</span>
        </div>
        <div class="plan-transb-cliente">${p.cliente||''}</div>
        ${timeline}
        <div class="plan-transb-proxima">
          <div class="plan-transb-proxima-lbl">PRÓXIMA AÇÃO</div>
          <div class="plan-transb-proxima-txt">🚛 Direcionar novo transporte a partir de ${String(patio).split('/')[0]} → ${p.cidadeDestino||''}</div>
          <button class="plan-transb-btn" onclick="_abrirModalTransbordoStatus(${p.id}, 'Transbordo')">🔀 DIRECIONAR TRANSBORDO</button>
          <button class="plan-transb-btn" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.4);margin-top:6px" onclick="_desfazerTransbordo(${p.id})">↩️ Não é transbordo (desfazer)</button>
        </div>
      </div>`;
    }).join('');
  } catch(e){
    return '<p class="text-muted" style="padding:1rem">Erro ao carregar a lista de transbordo. Recarregue a página (Ctrl+Shift+R).</p>';
  }
}

// Linha do tempo simples do pedido (só para quem passou/vai passar por transbordo)
function _linhaDoTempoPedidoHTML(p){
  // monta as etapas: origem → (transbordos) → destino
  const etapas = [];
  etapas.push({ nome: p.cidadeOrigem || 'Origem', tipo:'origem', feito:true });
  // paradas de transbordo já ocorridas (a partir de cidade_transbordo / patio_atual)
  if (p.cidadeTransbordo){
    const cidades = String(p.cidadeTransbordo).split(',').map(s=>s.trim()).filter(Boolean);
    cidades.forEach(cid => etapas.push({ nome: cid.replace(/^Cegonha\s+/,'🚛 '), tipo:'transbordo', feito:true }));
  }
  const atualIdx = etapas.length - 1; // a última etapa feita é onde ele está
  etapas.push({ nome: p.cidadeDestino || 'Destino', tipo:'destino', feito: p.status==='Entregue' });
  return `<div class="ltp">
    ${etapas.map((e,i) => `
      <div class="ltp-item ${e.feito?'feito':''} ${i===atualIdx?'atual':''}">
        <div class="ltp-dot"></div>
        <div class="ltp-nome">${e.nome}</div>
        ${i===atualIdx && p.status!=='Entregue' ? '<div class="ltp-aqui">📍 aqui</div>' : ''}
      </div>
      ${i < etapas.length-1 ? '<div class="ltp-linha"></div>' : ''}
    `).join('')}
  </div>`;
}

// Lista os pedidos "sem rota" — arrastáveis para qualquer corredor
function _planSemRotaListaHTML(){
  const pedidos = (typeof _planFiltraBusca==='function') ? _planFiltraBusca(_planPedidosSemRota()) : _planPedidosSemRota();
  if (pedidos.length === 0) return '<p class="text-muted" style="padding:1rem;text-align:center;font-size:.85rem">🎉 Nenhum pedido sem rota. Todos encaixaram em algum corredor.</p>';
  return _planAgruparErenderizar(pedidos);
}

// Stubs do Bloco 1 (o drag & drop completo vem no Bloco 2)
let _planPedidoArrastado = null;
function _planDragStart(ev, pedidoId){ _planPedidoArrastado = pedidoId; ev.dataTransfer.effectAllowed = 'move'; }

// Soltar pedido em OUTRO corredor → joga o pedido para aquele corredor (corredor_manual_id)
function _planDragOverCorr(ev){ ev.preventDefault(); ev.currentTarget.classList.add('plan-corr-hover'); }
function _planDragLeaveCorr(ev){ ev.currentTarget.classList.remove('plan-corr-hover'); }
async function _planDropCorr(ev, corredorId){
  ev.preventDefault();
  ev.currentTarget.classList.remove('plan-corr-hover');
  if (!_planPedidoArrastado) return;
  const pedidoId = _planPedidoArrastado; _planPedidoArrastado = null;
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  // se soltou no mesmo corredor de origem, ignora
  try {
    const upd = { corredor_manual_id: parseInt(corredorId) };
    // se o pedido estava aguardando aprovação, jogar num corredor APROVA
    if (p.aprovado === false){
      upd.aprovado = true; upd.aprovado_em = new Date().toISOString();
      upd.aprovado_por = _usuarioAtualNome() || 'Sistema';
    }
    await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    p.corredorManualId = parseInt(corredorId);
    if (upd.aprovado){ p.aprovado = true; p.aprovadoEm = upd.aprovado_em; }
    _planCorredorSel = corredorId; // segue o pedido para o corredor destino
    renderizarPlanejamentoRotas();
    if (upd.aprovado && typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ Pedido #${pedidoId} aprovado e movido para o corredor.`, 'success');
  } catch(e){ alert('Erro ao mover pedido: '+(e.message||e)); }
}

// BUSCA DE CORREDOR — modal com lista pesquisável, para mover o pedido sem rolar a tela
function _planAbrirBuscaCorredor(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const old = document.getElementById('modalBuscaCorredor'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalBuscaCorredor';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:92%;max-height:80vh;display:flex;flex-direction:column;border-radius:14px;padding:20px">
      <h2 style="margin:0 0 4px">🔀 Mover pedido #${p.id}</h2>
      <p class="text-muted" style="font-size:.84rem;margin:.2rem 0 .8rem">${p.placa||''} · ${(p.patioAtual||p.cidadeOrigem||'')} → ${p.cidadeDestino||''}<br>Escolha o corredor de destino:</p>
      <input type="text" id="buscaCorredorInput" placeholder="🔎 Pesquisar corredor..." oninput="var _v=this.value; _mmDeb('buscaCorredor', function(){ _planFiltrarBuscaCorredor(_v); })" style="padding:9px 12px;border-radius:9px;border:1px solid var(--border,rgba(255,255,255,.15));background:var(--surface-2,rgba(255,255,255,.03));color:inherit;margin-bottom:10px" autofocus>
      <div id="buscaCorredorLista" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px">
        ${_planBuscaCorredorItens(pedidoId, '')}
      </div>
      <button class="btn btn-secondary" style="margin-top:12px" onclick="document.getElementById('modalBuscaCorredor').remove()">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => document.getElementById('buscaCorredorInput')?.focus(), 100);
}

function _planBuscaCorredorItens(pedidoId, termo){
  const t = (termo||'').toLowerCase();
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  const corredores = (corredoresGlobais||[]).filter(c => {
    if (!t) return true;
    return (c.nome||'').toLowerCase().includes(t) || (c.origem||'').toLowerCase().includes(t) || (c.destino||'').toLowerCase().includes(t);
  });
  if (corredores.length === 0) return '<p class="text-muted" style="padding:1rem;text-align:center;font-size:.85rem">Nenhum corredor encontrado.</p>';
  return corredores.map(c => {
    const atual = p && String(p.corredorManualId)===String(c.id);
    return `<button class="plan-busca-corr-item ${atual?'atual':''}" onclick="_planMoverParaCorredor(${pedidoId}, ${c.id})">
      <span class="pbc-nome">${c.nome}${atual?' <span style=\"color:#22c55e\">✓ atual</span>':''}</span>
      <span class="pbc-rota">${c.origem||''} → ${c.destino||''}</span>
    </button>`;
  }).join('');
}

function _planFiltrarBuscaCorredor(termo){
  const modal = document.getElementById('modalBuscaCorredor');
  const lista = document.getElementById('buscaCorredorLista');
  if (!modal || !lista) return;
  // pega o pedidoId do título
  const h2 = modal.querySelector('h2');
  const pid = h2 ? parseInt(h2.textContent.replace(/\D/g,'')) : null;
  lista.innerHTML = _planBuscaCorredorItens(pid, termo);
}

async function _planMoverParaCorredor(pedidoId, corredorId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  // move o grupo todo (carros do mesmo pedido) se houver grupo_id
  const alvos = p.grupoId ? (pedidosGlobais||[]).filter(x => x.grupoId === p.grupoId) : [p];
  try {
    for (const alvo of alvos){
      await supabase.from('pedidos').update({ corredor_manual_id: parseInt(corredorId) }).eq('id', parseInt(alvo.id));
      alvo.corredorManualId = parseInt(corredorId);
    }
    _planCorredorSel = corredorId; // segue o pedido pro corredor destino
    document.getElementById('modalBuscaCorredor')?.remove();
    renderizarPlanejamentoRotas();
    if (typeof exibirMensagem === 'function'){
      const c = (corredoresGlobais||[]).find(x => String(x.id)===String(corredorId));
      const qtd = alvos.length > 1 ? ` (${alvos.length} carros)` : '';
      exibirMensagem('mensagemLogistica', `🔀 Pedido #${pedidoId}${qtd} movido para o corredor "${c?c.nome:''}".`, 'success');
    }
  } catch(e){ alert('Erro ao mover pedido: '+(e.message||e)); }
}

// Criar viagem a partir dos pedidos do corredor — escolhe cegonha/motorista
function _planCriarViagem(corId){
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(corId));
  if (!cor) return;
  const pedidos = _planPedidosDoCorredor(cor);
  if (pedidos.length === 0){ alert('Não há pedidos neste corredor para criar uma viagem.'); return; }
  _planAbrirModalViagem(cor, pedidos);
}

/* Seleção dos carros da viagem.

   O modal era uma caixa de 560px com a lista espremida em 220px de altura.
   Com 40 carros num corredor, escolher quem embarca virava rolagem às cegas
   numa fresta. Agora a tela ocupa a largura disponível, os carros aparecem
   em cartões agrupados por cliente, e há busca, contagem e seleção em bloco.
   Agrupar por cliente não é enfeite: a cegonha costuma levar a carga de um
   cliente inteiro, e é assim que a logística raciocina na hora de montar. */
let _pvPedidos = [];   // universo de pedidos deste modal
let _pvCor = null;
let _pvBusca = '';

// Referência de capacidade quando ainda não há cegonha escolhida.
const _PV_CAP_REF = 11;

function _planAbrirModalViagem(cor, pedidos, rotaVazia){
  const cegonhas = (veiculosGlobais||[]).filter(v => v.ativo !== false && v.placa);
  // Estado de manutenção de cada cegonha, para marcar e recusar as bloqueadas.
  const _manut = (placa) => {
    const v = (veiculosGlobais||[]).find(x => x.placa === placa);
    return (v && typeof statusManutencaoVeiculo === 'function') ? statusManutencaoVeiculo(v) : null;
  };
  _pvPedidos = pedidos || [];
  /* Marcar todos por padrão só faz sentido quando todos cabem. Com 22 pedidos
     no corredor e uma cegonha de 11 vagas, a tela vinha com os 22 marcados e
     um clique criava a viagem inteira — foi como a viagem #137 nasceu com 21
     carros. Acima da capacidade de referência, nada vem marcado: a escolha
     passa a ser deliberada. */
  const _marcarTudo = !rotaVazia && _pvPedidos.length <= _PV_CAP_REF;
  _pvCor = cor;
  _pvBusca = '';
  const old = document.getElementById('modalPlanViagem'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPlanViagem';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box pv-box">
      <div class="pv-cab">
        <div>
          <h2 style="margin:0">${rotaVazia ? '➕ Nova rota para planejar' : '🚛 Criar viagem'} — ${cor.nome}</h2>
          <p class="text-muted" style="font-size:.84rem;margin:.25rem 0 0">${rotaVazia
            ? 'Crie a rota e escolha o veículo. Pode marcar pedidos agora ou arrastar depois.'
            : 'Marque os carros que vão nesta viagem e escolha cegonha e motorista.'}</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalPlanViagem').remove()">✕</button>
      </div>

      <div class="pv-corpo">
        <!-- COLUNA ESQUERDA: os carros -->
        <div class="pv-carros">
          <div class="pv-ferramentas">
            <div class="pv-busca">
              <span class="pv-busca-ic">🔍</span>
              <input type="text" id="pvBusca" placeholder="Placa, modelo, cliente, cidade ou #id"
                     oninput="_pvFiltrar(this.value)">
            </div>
            <div class="pv-acoes-sel">
              <button type="button" class="btn btn-secondary btn-sm" onclick="_pvMarcar(true)">Marcar todos</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="_pvMarcar(false)">Desmarcar</button>
            </div>
          </div>
          ${!_marcarTudo && !rotaVazia && _pvPedidos.length > _PV_CAP_REF
        ? `<div class="pv-aviso-muitos">⚠️ Este corredor tem <strong>${_pvPedidos.length} carros</strong>, mais do que cabe numa cegonha. Nenhum veio marcado — escolha quais vão nesta viagem.</div>`
        : ''}
      <div class="pv-grade" id="pvGrade">${_pvGradeHTML(!_marcarTudo)}</div>
        </div>

        <!-- COLUNA DIREITA: veículo e resumo -->
        <div class="pv-lateral">
          <div class="pv-contador" id="pvContador"></div>

          <div class="form-group">
            <label>Tipo de veículo</label>
            <div class="plan-vtipo">
              <button type="button" class="plan-vtipo-btn active" data-vtipo="todos" onclick="_planFiltrarCegonhas(this,'todos')">Todos</button>
              <button type="button" class="plan-vtipo-btn" data-vtipo="propria" onclick="_planFiltrarCegonhas(this,'propria')">🚛 Própria</button>
              <button type="button" class="plan-vtipo-btn" data-vtipo="terceiro" onclick="_planFiltrarCegonhas(this,'terceiro')">🤝 Terceiros</button>
            </div>
          </div>

          <div class="form-group">
            <label>Cegonha / Guincho</label>
            <div class="plan-cegonha-busca">
              <span class="plan-busca-ic">🔍</span>
              <input type="text" id="planCegonhaBusca"
                     placeholder="Placa ou motorista..."
                     oninput="_planFiltrarCegonhaPorTexto()"
                     onkeydown="if(event.key==='Enter'){event.preventDefault();_planSelecionarPrimeiraCegonha();}">
              <span class="plan-cegonha-cont" id="planCegonhaCont"></span>
            </div>
            <select id="planViagemCegonha" onchange="_planViagemPreencheMot()">
              <option value="">— a definir —</option>
              ${cegonhas.map(v => { const prop = (v.propriedade==='terceiro')?'terceiro':'propria';
                const m = (typeof statusManutencaoVeiculo === 'function') ? statusManutencaoVeiculo(v) : null;
                const bloq = m && m.bloqueado;
                return `<option value="${v.placa}" data-cap="${v.capacidade||''}" data-mot="${(v.motorista_padrao||'').replace(/"/g,'&quot;')}" data-prop="${prop}" data-bloq="${bloq?'1':''}" data-bloqmotivo="${bloq?(m.motivo||'manutenção').replace(/"/g,'&quot;'):''}">${bloq?'⛔ ':(prop==='terceiro'?'🤝 ':'🚛 ')}${v.placa}${v.modelo?' · '+v.modelo:''}${v.motorista_padrao?' · 👤 '+v.motorista_padrao:''}${bloq?' — '+m.selo:(m&&m.cor==='amarelo'?' — '+m.selo:'')}</option>`; }).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>Motorista</label>
            <input type="text" id="planViagemMotorista" placeholder="Motorista da viagem" list="listaMotPlanViagem">
            <datalist id="listaMotPlanViagem">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
          </div>

          <div class="pv-rodape">
            <button class="btn btn-primary" style="width:100%" onclick="_planConfirmarViagem(${cor.id})">✅ Criar viagem</button>
            <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('modalPlanViagem').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  _pvAtualizarContador();
}

// Cartões agrupados por cliente. A busca filtra antes de agrupar.
function _pvGradeHTML(rotaVazia){
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const b = n(_pvBusca);
  const lista = b
    ? _pvPedidos.filter(p => n(`${p.placa||''} ${p.modelo||''} ${p.cliente||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} ${p.patioAtual||''} #${p.id} ${p.id}`).includes(b))
    : _pvPedidos;

  if (lista.length === 0){
    return `<p class="text-muted" style="padding:2rem;text-align:center;font-size:.86rem">${
      _pvPedidos.length === 0
        ? 'Nenhum pedido neste corredor ainda. Dá para criar a rota vazia e arrastar pedidos depois.'
        : 'Nenhum carro encontrado para essa busca.'}</p>`;
  }

  const grupos = {};
  lista.forEach(p => { const c = p.cliente || 'Sem cliente'; (grupos[c] = grupos[c] || []).push(p); });

  return Object.entries(grupos)
    .sort((a,b2) => b2[1].length - a[1].length)   // cliente com mais carros primeiro
    .map(([cliente, itens]) => `
      <div class="pv-grupo">
        <div class="pv-grupo-cab">
          <label class="pv-grupo-todos">
            <input type="checkbox" onchange="_pvMarcarGrupo(this, '${String(cliente).replace(/'/g,"\\'")}')"
                   ${rotaVazia ? '' : 'checked'}>
            <span>👤 ${cliente}</span>
          </label>
          <span class="pv-grupo-cont">${itens.length} carro(s)</span>
        </div>
        <div class="pv-grupo-cards">
          ${itens.map(p => {
            /* Mesmos selos do card do Planejamento (_selosPedidoHTML): transbordo
               com a cidade, CT-e já emitido, observação. Na hora de montar a
               carga isso decide o que entra — um carro que já transbordou em
               Maringá não pode ir numa cegonha que não passa lá, e um com CT-e
               emitido custa retrabalho no fiscal se for tirado depois.
               Aqui a versão é compacta: são dezenas de cartões lado a lado. */
            const selos = (typeof _selosPedidoHTML === 'function') ? _selosPedidoHTML(p) : '';
            const ondeEsta = (p.patioAtual && typeof _norm === 'function'
                && _norm(p.patioAtual) !== _norm(p.cidadeOrigem||''))
              ? String(p.patioAtual).split('/')[0].replace('PÁTIO ','') : '';
            return `
            <label class="pv-card" data-cliente="${String(cliente).replace(/"/g,'&quot;')}">
              <input type="checkbox" class="plan-viagem-ped" value="${p.id}" ${rotaVazia ? '' : 'checked'}
                     onchange="_pvAtualizarContador()">
              <div class="pv-card-corpo">
                <div class="pv-card-placa">${p.placa||'—'}
                  ${p.valorFrete?`<span class="pv-card-valor">R$ ${Number(p.valorFrete).toLocaleString('pt-BR')}</span>`:''}
                </div>
                <div class="pv-card-modelo">${p.modelo||'—'}</div>
                ${p.referencia?`<div class="pv-card-ref" title="Solicitação / referência do cliente">🏷️ ${String(p.referencia).replace(/"/g,'&quot;')}</div>`:''}
                <div class="pv-card-rota">${(p.cidadeOrigem||'—').split('/')[0]} → ${(p.cidadeDestino||'—').split('/')[0]}</div>
                ${ondeEsta?`<div class="pv-card-onde">📍 está em ${ondeEsta}</div>`:''}
                ${selos?`<div class="pv-card-selos">${selos}</div>`:''}
                <div class="pv-card-id">#${p.id}</div>
              </div>
              <button type="button" class="pv-card-trocar" title="Trocar o veículo deste pedido"
                      onclick="event.preventDefault();event.stopPropagation();_planTrocarVeiculo(${p.id})">🔄</button>
            </label>`; }).join('')}
        </div>
      </div>`).join('');
}

function _pvFiltrar(txt){
  _pvBusca = txt || '';
  // guarda o que já estava marcado, para a busca não desfazer a seleção
  const marcados = new Set([...document.querySelectorAll('.plan-viagem-ped:checked')].map(c => c.value));
  const grade = document.getElementById('pvGrade');
  if (!grade) return;
  grade.innerHTML = _pvGradeHTML(false);
  document.querySelectorAll('.plan-viagem-ped').forEach(c => { c.checked = marcados.has(c.value); });
  _pvAtualizarContador();
}
window._pvFiltrar = _pvFiltrar;

function _pvMarcar(valor){
  document.querySelectorAll('.plan-viagem-ped').forEach(c => { c.checked = !!valor; });
  document.querySelectorAll('.pv-grupo-todos input').forEach(c => { c.checked = !!valor; });
  _pvAtualizarContador();
}
window._pvMarcar = _pvMarcar;

function _pvMarcarGrupo(chk, cliente){
  document.querySelectorAll(`.pv-card[data-cliente="${cliente.replace(/"/g,'&quot;')}"] .plan-viagem-ped`)
    .forEach(c => { c.checked = chk.checked; });
  _pvAtualizarContador();
}
window._pvMarcarGrupo = _pvMarcarGrupo;

/* Contador com aviso de capacidade. Estourar a cegonha é o erro que só
   aparece no pátio, na hora de carregar — melhor avisar aqui. */
function _pvAtualizarContador(){
  const el = document.getElementById('pvContador');
  if (!el) return;
  const marcados = document.querySelectorAll('.plan-viagem-ped:checked').length;
  const total = _pvPedidos.length;
  const sel = document.getElementById('planViagemCegonha');
  const cap = parseInt(sel?.selectedOptions?.[0]?.getAttribute('data-cap') || '', 10);
  let aviso = '';
  if (cap && marcados > cap)      aviso = `<div class="pv-cont-alerta">⚠️ ${marcados} carros para ${cap} vagas — ${marcados-cap} a mais</div>`;
  else if (cap && marcados === cap) aviso = `<div class="pv-cont-ok">✅ Cegonha completa (${cap} vagas)</div>`;
  else if (cap)                    aviso = `<div class="pv-cont-info">${cap - marcados} vaga(s) livre(s) de ${cap}</div>`;
  el.innerHTML = `<div class="pv-cont-num"><strong>${marcados}</strong> de ${total} selecionado(s)</div>${aviso}`;
}
window._pvAtualizarContador = _pvAtualizarContador;

// Filtra as opções de cegonha por tipo (todos / frota própria / terceiro)
function _planFiltrarCegonhas(btn, tipo){
  document.querySelectorAll('.plan-vtipo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Delega para o filtro de texto, que já combina tipo + busca — assim os
  // dois filtros se somam em vez de um desfazer o outro.
  _planFiltrarCegonhaPorTexto();
}

// Busca por texto na lista de cegonhas: casa placa, modelo e motorista
// padrão. Digitando a placa, a lista reduz e o Enter já seleciona a única
// que sobrou — sem precisar caçar a opção no meio de dezenas.
function _planFiltrarCegonhaPorTexto(){
  const txt = (document.getElementById('planCegonhaBusca')?.value || '').trim();
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const alvo = n(txt);
  const sel = document.getElementById('planViagemCegonha');
  const cont = document.getElementById('planCegonhaCont');
  if (!sel) return;
  // respeita também o filtro de tipo (própria/terceiro) que estiver ativo
  const tipo = document.querySelector('.plan-vtipo-btn.active')?.getAttribute('data-vtipo') || 'todos';
  let visiveis = 0, primeira = null;
  [...sel.options].forEach(op => {
    if (!op.value){ op.hidden = false; return; }
    const prop = op.getAttribute('data-prop') || 'propria';
    const okTipo = (tipo === 'todos') || (prop === tipo);
    const okTxt = !alvo || n(`${op.value} ${op.textContent} ${op.getAttribute('data-mot')||''}`).includes(alvo);
    op.hidden = !(okTipo && okTxt);
    if (!op.hidden){ visiveis++; if (!primeira) primeira = op; }
  });
  if (cont) cont.textContent = alvo ? `${visiveis} veículo(s)` : '';
  // uma só sobrou: seleciona sozinho e já puxa o motorista padrão
  if (alvo && visiveis === 1 && primeira){ sel.value = primeira.value; _planViagemPreencheMot(); }
  else if (sel.selectedOptions[0] && sel.selectedOptions[0].hidden){ sel.value = ''; _planViagemPreencheMot(); }
}
function _planSelecionarPrimeiraCegonha(){
  const sel = document.getElementById('planViagemCegonha');
  if (!sel) return;
  const op = [...sel.options].find(o => o.value && !o.hidden);
  if (op){ sel.value = op.value; _planViagemPreencheMot(); sel.focus(); }
}
window._planFiltrarCegonhaPorTexto = _planFiltrarCegonhaPorTexto;
window._planSelecionarPrimeiraCegonha = _planSelecionarPrimeiraCegonha;

function _planViagemPreencheMot(){
  // a capacidade da cegonha escolhida muda o aviso de vagas
  if (typeof _pvAtualizarContador === 'function') setTimeout(_pvAtualizarContador, 0);
  const sel = document.getElementById('planViagemCegonha');
  const opt = sel?.options[sel.selectedIndex];
  const inp = document.getElementById('planViagemMotorista');
  if (inp) inp.value = opt?.getAttribute('data-mot') || '';
}

// TROCA DE VEÍCULO de um pedido, direto no modal de criar viagem.
// É raro, mas acontece: o carro que ia embarcar não é o que está ali.
// Não é correção de digitação — é outro veículo — então a troca fica
// registrada no histórico, senão some o rastro de qual carro estava na
// carga quando o CT-e foi emitido.
/* TROCA DE VEÍCULO — modal próprio.

   Era feito com dois prompt() em sequência, e isso criava três armadilhas:
   1) cancelar o segundo prompt devolvia string vazia e APAGAVA o modelo;
   2) quem apertava Enter no segundo, aceitando o valor sugerido, mantinha o
      modelo do carro ANTIGO junto com a placa nova — parecia que só a placa
      tinha trocado;
   3) não dava para validar nada enquanto o usuário digitava, e no celular
      prompt() é péssimo.
   Agora os dois campos ficam visíveis lado a lado, com o de/para na frente. */
function _planTrocarVeiculo(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const placaAntiga = p.placa || '';
  const modeloAntigo = p.modelo || '';
  const temCte = !!(p.numeroCte || p.numero_cte);

  const old = document.getElementById('modalTrocaVeic'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalTrocaVeic';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100060';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:500px;width:94%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">🔄 Trocar veículo — #${p.id}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">
        ${p.cliente||''} · ${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'}<br>
        Hoje na carga: <strong>${placaAntiga||'—'}</strong>${modeloAntigo?` · ${modeloAntigo}`:''}
      </p>

      <div class="troca-veic-grid">
        <div class="form-group">
          <label>Nova placa</label>
          <input type="text" id="trocaPlaca" maxlength="10" placeholder="ABC1D23"
                 value="${placaAntiga.replace(/"/g,'&quot;')}" oninput="this.value=this.value.toUpperCase()">
        </div>
        <div class="form-group">
          <label>Modelo do novo veículo</label>
          <input type="text" id="trocaModelo" placeholder="Ex: HB20, Onix, Strada"
                 value="${modeloAntigo.replace(/"/g,'&quot;')}">
        </div>
      </div>
      <p class="troca-veic-dica">
        ⚠️ Os dois campos vêm preenchidos com o veículo atual. Ajuste <strong>ambos</strong> —
        é comum a placa mudar e o modelo ficar para trás.
      </p>

      ${temCte ? `<div class="dest-cte-aviso">📄 Este pedido já tem CT-e ${p.numeroCte||p.numero_cte}. O fiscal será avisado da troca.</div>` : ''}

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#0ea5e9" id="btnTrocaVeic">🔄 Confirmar troca</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalTrocaVeic').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnTrocaVeic').onclick = () => {
    const placaNova = (document.getElementById('trocaPlaca')?.value || '').trim().toUpperCase();
    const modeloNovo = (document.getElementById('trocaModelo')?.value || '').trim();
    if (!placaNova){ alert('Informe a placa do novo veículo.'); return; }
    if (placaNova === placaAntiga.toUpperCase() && modeloNovo === modeloAntigo){
      alert('Nada mudou — placa e modelo são os mesmos.'); return;
    }
    if (!confirm(`Confirmar a troca no pedido #${p.id}?\n\nDe:   ${placaAntiga||'—'} · ${modeloAntigo||'—'}\nPara: ${placaNova} · ${modeloNovo||'—'}\n\nAltera o pedido no sistema inteiro e fica registrado no histórico.`)) return;
    document.getElementById('modalTrocaVeic').remove();
    _confirmarTrocaVeiculo(p.id, placaNova, modeloNovo, placaAntiga, modeloAntigo);
  };
}
window._planTrocarVeiculo = _planTrocarVeiculo;

async function _confirmarTrocaVeiculo(pedidoId, placaNova, modeloNovo, placaAntiga, modeloAntigo){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const usuario = _usuarioAtualNome() || 'Logística';
  try {
    // modelo vazio não apaga o que já existe — preserva o anterior
    const modeloFinal = modeloNovo || modeloAntigo || null;
    const { error } = await supabase.from('pedidos')
      .update({ placa: placaNova, modelo: modeloFinal })
      .eq('id', parseInt(pedidoId));
    if (error) throw error;
    p.placa = placaNova; p.modelo = modeloFinal;

    try {
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: p.status, status_novo: p.status,
        usuario_nome: usuario,
        usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `🔄 Veículo trocado: ${placaAntiga||'—'} (${modeloAntigo||'—'}) substituído por ${placaNova} (${modeloFinal||'—'}).`
      });
    } catch(_){}

    if (typeof notificar === 'function' && (p.numeroCte || p.numero_cte)){
      try { await notificar({ perfil:'fiscal', tipo:'status', pedidoId: parseInt(pedidoId),
        titulo:'🔄 Veículo trocado em pedido com CT-e',
        mensagem:`#${pedidoId}: ${placaAntiga} (${modeloAntigo||'—'}) → ${placaNova} (${modeloFinal||'—'}). Confira o documento emitido.` }); } catch(_){}
    }

    if (typeof _rmToastConfirmacao === 'function')
      _rmToastConfirmacao(`🔄 Veículo trocado: ${placaNova}${modeloFinal?' · '+modeloFinal:''}.`);

    if (typeof recarregarPedidos === 'function') await recarregarPedidos();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
    // a tabela da viagem mostra placa E modelo — precisa redesenhar as duas
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();

    // se o modal de criar viagem estiver aberto, atualiza a linha nele
    const linha = document.querySelector(`.plan-viagem-ped[value="${pedidoId}"]`)?.closest('label');
    if (linha){
      const span = linha.querySelector('span');
      if (span) span.innerHTML = `<strong>${placaNova}</strong> · ${modeloFinal||''} · ${p.cliente||''} <span class="text-muted">${p.patioAtual||p.cidadeOrigem||''} → ${p.cidadeDestino||''}</span>`;
    }
  } catch(e){ alert('Erro ao trocar o veículo: '+(e.message||e)); }
}
window._confirmarTrocaVeiculo = _confirmarTrocaVeiculo;

async function _planConfirmarViagem(corId){
  if (window._criandoViagem){ return; } // trava anti-duplo-clique
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(corId));
  const ids = [...document.querySelectorAll('.plan-viagem-ped:checked')].map(c => parseInt(c.value));
  const cegonha = document.getElementById('planViagemCegonha')?.value || null;
  const motorista = document.getElementById('planViagemMotorista')?.value.trim() || null;
  if (ids.length === 0 && !cegonha){ alert('Para criar a rota, selecione ao menos um pedido OU escolha o veículo.'); return; }

  /* RECUSA cegonha bloqueada pela manutenção. O seletor já a marca em
     vermelho, mas alguém pode escolher assim mesmo — aqui a viagem não é
     criada. A logística vê o motivo e resolve com a oficina. */
  if (cegonha){
    const veic = (veiculosGlobais||[]).find(v => v.placa === cegonha);
    const m = (veic && typeof statusManutencaoVeiculo === 'function') ? statusManutencaoVeiculo(veic) : null;
    if (m && m.bloqueado){
      alert(
        `A cegonha ${cegonha} está BLOQUEADA pela manutenção e não pode sair.

` +
        `Motivo: ${m.motivo || m.selo}

` +
        `Escolha outro veículo, ou fale com a oficina para liberar este.`
      );
      return;
    }
    if (m && m.cor === 'amarelo'){
      if (!confirm(`⚠️ ${cegonha}: ${m.selo}

Ainda não está bloqueada, mas há manutenção prevista. Criar a viagem mesmo assim?`)) return;
    }
  }

  /* TRAVA DE CAPACIDADE.
     Não havia nenhuma validação: a viagem #137 saiu com 21 carros numa
     cegonha de capacidade menor, e o erro só apareceu quando a carga chegou
     ao fiscal — com espelho e CT-e já gerados em cima de uma composição
     impossível. Corrigir depois disso custa cancelamento de documento.
     Por isso aqui é bloqueio, não aviso. */
  if (cegonha && ids.length > 0){
    const veic = (veiculosGlobais||[]).find(v => v.placa === cegonha);
    const cap = Number(veic?.capacidade) || 0;
    if (cap > 0 && ids.length > cap){
      alert(
        `Não dá para criar esta viagem.\n\n` +
        `Cegonha ${cegonha}${veic?.modelo ? ' ('+veic.modelo+')' : ''}: ${cap} vaga(s)\n` +
        `Carros selecionados: ${ids.length}\n` +
        `Excesso: ${ids.length - cap}\n\n` +
        `Desmarque ${ids.length - cap} carro(s) ou escolha um veículo maior. ` +
        `Se a capacidade cadastrada estiver errada, corrija no cadastro do veículo.`
      );
      return;
    }
    if (!cap){
      // Sem capacidade cadastrada não dá para validar — avisa uma vez, com o
      // número na frente, em vez de deixar passar calado.
      if (!confirm(
        `A cegonha ${cegonha} está sem capacidade cadastrada, então não consigo conferir se a carga cabe.\n\n` +
        `Você está criando a viagem com ${ids.length} carro(s).\n\nContinuar mesmo assim?`
      )) return;
    }
  }
  window._criandoViagem = true;
  // desabilita o botão visualmente
  const btnCriar = document.querySelector('#modalPlanViagem .btn-primary, [onclick^="_planConfirmarViagem"]');
  if (btnCriar){ btnCriar.disabled = true; btnCriar.textContent = '⏳ Criando...'; }
  const usuario = _usuarioAtualNome() || 'Logística';
  try {
    // cria a rota
    const _perfilCriador = (typeof NOMES_PERFIL!=='undefined' && typeof perfilAtual!=='undefined') ? (NOMES_PERFIL[perfilAtual]||perfilAtual) : 'Logística';
    const ins = { nome: cor.nome, corredor_id: cor.id, status: 'planejada', criado_por: _perfilCriador, criada_por_usuario: usuario };
    if (cegonha) ins.placa_cegonha = cegonha;
    if (motorista) ins.motorista_1 = motorista;
    const { data: rota, error } = await supabase.from('rotas_planejadas').insert(ins).select().single();
    if (error) throw error;
    if (rota) rotasGlobais.push(rota);
    // Vincula os pedidos EM LOTE.
    // Antes era um laço com duas idas ao servidor por carro (update +
    // vínculo). Com 11 carros davam 22 esperas em fila, e a tela ia
    // mostrando 6, depois 9, depois os 11. Agora são poucas chamadas,
    // independente da quantidade.
    const alvos = ids
      .map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id)))
      .filter(Boolean);

    // Transbordados voltam a "em transporte" ao entrar na nova viagem —
    // por isso vão num update separado dos demais.
    // Carro com OCORRÊNCIA entra na mesma regra: se está sendo carregado de
    // novo, o problema foi resolvido — senão ele viajaria com o status
    // travado em "Ocorrência" e apareceria como parado no sistema inteiro.
    const _reentrada = ['Transbordo','Ocorrência'];
    const transb = alvos.filter(p => _reentrada.includes(p.status));
    const comuns = alvos.filter(p => !_reentrada.includes(p.status));

    const base = { rota_id: rota.id };
    if (cegonha) base.placa_cegonha = cegonha;
    if (motorista) base.motorista_1 = motorista;

    if (comuns.length){
      await supabase.from('pedidos').update(base).in('id', comuns.map(p => p.id));
    }
    if (transb.length){
      await supabase.from('pedidos')
        .update({ ...base, corredor_manual_id: null, status: 'Em Transporte', status_planilha: null })
        .in('id', transb.map(p => p.id));
    }

    // Memória de uma vez só: a tela redesenha completa, sem etapas
    alvos.forEach(p => {
      p.rotaId = rota.id; p.rota_id = rota.id;
      if (cegonha) p.placaCegonha = cegonha;
      if (motorista) p.motorista1 = motorista;
    });
    transb.forEach(p => {
      p.corredorManualId = null; p.corredor_manual_id = null;
      p.status = 'Em Transporte'; p.statusPlanilha = null;
    });

    await _registrarVinculoViagemLote(rota.id, alvos.map(p => p.id));
    document.getElementById('modalPlanViagem')?.remove();
    renderizarPlanejamentoRotas();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `🚛 Viagem criada no corredor ${cor.nome} com ${ids.length} pedido(s).`, 'success');
    // Ponto 5: oferece enviar o romaneio ao motorista imediatamente
    setTimeout(() => {
      if (confirm('🚛 Viagem criada!\n\nDeseja abrir o romaneio de carga agora para revisar onde estão os carros e enviar ao motorista?')){
        abrirFecharEnviarCarga(rota.id);
      }
    }, 400);
  } catch(e){ alert('Erro ao criar viagem: '+(e.message||e)); }
  finally { window._criandoViagem = false; }
}

// Puxar um pedido (sem rota ou aguardando transbordo) para dentro de uma viagem em andamento
function _viagemPuxarPedido(rota, carros){
  const cap = _capacidadeRota(rota) || 11;
  const vagas = cap - carros.length;
  if (vagas <= 0){ alert(`Esta viagem está cheia (${carros.length}/${cap}). Não há vagas para puxar mais pedidos.`); return; }

  // Candidatos: pedidos ativos, sem rota, OU aguardando transbordo — que não estão já nesta viagem
  const candidatos = (pedidosGlobais||[]).filter(p => {
    // Ocorrência fica de fora: o carro está parado esperando decisão, e só
    // volta ao fluxo quando alguém reverte em Pedidos. Oferecê-lo aqui
    // permitia carregar numa cegonha um carro com problema em aberto.
    if (['Entregue','Cancelado','Ocorrência'].includes(p.status||'')) return false;
    if (String(p.rotaId||p.rota_id) === String(rota.id)) return false; // já está nesta viagem
    const semRota = !p.rotaId && !p.rota_id && !p.placaCegonha;
    const emTransbordo = p.status === 'Transbordo';
    return semRota || emTransbordo;
  });

  if (candidatos.length === 0){ alert('Nenhum pedido disponível para puxar (sem rota ou aguardando transbordo).'); return; }

  // Destaca os que "fazem sentido no caminho": destino do pedido bate com destino de algum carro da viagem,
  // ou a origem/pátio do pedido está no trajeto.
  const destinosViagem = new Set(carros.map(c => (c.cidadeDestino||'').toLowerCase()));
  const ordenados = candidatos.map(p => {
    const noCaminho = destinosViagem.has((p.cidadeDestino||'').toLowerCase());
    return { p, noCaminho };
  }).sort((a,b) => (b.noCaminho?1:0) - (a.noCaminho?1:0));

  /* Mesma tela ampla da criação de viagem. Era uma caixa de 560px com a lista
     espremida em 340px de altura — e aqui a escolha é ainda mais delicada,
     porque a viagem já está montada e o que entra tem de caber nas vagas que
     sobraram. */
  window._pxCandidatos = ordenados;
  window._pxBusca = '';
  window._pxCap = cap;
  window._pxNaCarga = carros.length;

  const old = document.getElementById('modalPuxarPedido'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPuxarPedido';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box pv-box">
      <div class="pv-cab">
        <div>
          <h2 style="margin:0">➕ Puxar pedido para a viagem</h2>
          <p class="text-muted" style="font-size:.84rem;margin:.25rem 0 0">
            ${rota.nome || ('Viagem #'+rota.id)} · ${carros.length}/${cap} na carga ·
            <strong>${vagas} vaga(s) livre(s)</strong>.
            ⭐ combinam com o destino da viagem · 🔁 aguardando transbordo.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalPuxarPedido').remove()">✕</button>
      </div>

      <div class="pv-corpo">
        <div class="pv-carros">
          <div class="pv-ferramentas">
            <div class="pv-busca">
              <span class="pv-busca-ic">🔍</span>
              <input type="text" id="pxBusca" placeholder="Placa, modelo, cliente, cidade ou #id"
                     oninput="_pxFiltrar(this.value)">
            </div>
            <div class="pv-acoes-sel">
              <button type="button" class="btn btn-secondary btn-sm" onclick="_pxMarcar(false)">Desmarcar</button>
            </div>
          </div>
          <div class="pv-grade" id="pxGrade">${_pxGradeHTML()}</div>
        </div>

        <div class="pv-lateral">
          <div class="pv-contador" id="pxContador"></div>
          <div class="pv-rodape">
            <button class="btn btn-primary" style="width:100%" onclick="_viagemConfirmarPuxar(${rota.id}, ${cap})">✅ Puxar selecionados</button>
            <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('modalPuxarPedido').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  _pxAtualizarContador();
}

/* Cartões agrupados: primeiro os que fazem sentido no caminho, depois o resto.
   Aqui o agrupamento é por "faz sentido ou não", não por cliente — a pergunta
   de quem puxa é "o que cabe nesta viagem", não "de quem é a carga". */
function _pxGradeHTML(){
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const b = n(window._pxBusca||'');
  const lista = (window._pxCandidatos||[]).filter(({p}) => !b ||
    n(`${p.placa||''} ${p.modelo||''} ${p.cliente||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} ${p.patioAtual||''} #${p.id}`).includes(b));

  if (!lista.length) return '<p class="text-muted" style="padding:2rem;text-align:center;font-size:.86rem">Nenhum pedido encontrado.</p>';

  const grupos = [
    { tit:'⭐ Combinam com o destino desta viagem', itens: lista.filter(x => x.noCaminho) },
    { tit:'Demais pedidos disponíveis',            itens: lista.filter(x => !x.noCaminho) }
  ].filter(g => g.itens.length);

  return grupos.map(g => `
    <div class="pv-grupo">
      <div class="pv-grupo-cab">
        <span style="font-size:.82rem;font-weight:700">${g.tit}</span>
        <span class="pv-grupo-cont">${g.itens.length}</span>
      </div>
      <div class="pv-grupo-cards">
        ${g.itens.map(({p, noCaminho}) => {
          const selos = (typeof _selosPedidoHTML === 'function') ? _selosPedidoHTML(p) : '';
          return `
          <label class="pv-card ${noCaminho?'px-card-bom':''}">
            <input type="checkbox" class="puxar-ped" value="${p.id}" onchange="_pxAtualizarContador()">
            <div class="pv-card-corpo">
              <div class="pv-card-placa">${noCaminho?'⭐ ':''}${p.status==='Transbordo'?'🔁 ':''}${p.placa||'—'}
                ${p.valorFrete?`<span class="pv-card-valor">R$ ${Number(p.valorFrete).toLocaleString('pt-BR')}</span>`:''}
              </div>
              <div class="pv-card-modelo">${p.modelo||'—'}</div>
              <div class="pv-card-modelo">${p.cliente||''}</div>
              ${p.referencia?`<div class="pv-card-ref">🏷️ ${String(p.referencia).replace(/"/g,'&quot;')}</div>`:''}
              <div class="pv-card-rota">${p.patioAtual?('🅿️ '+p.patioAtual.split('/')[0]):((p.cidadeOrigem||'—').split('/')[0])} → ${(p.cidadeDestino||'—').split('/')[0]}</div>
              ${selos?`<div class="pv-card-selos">${selos}</div>`:''}
              <div class="pv-card-id">#${p.id}</div>
            </div>
          </label>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function _pxFiltrar(txt){
  window._pxBusca = txt || '';
  const marcados = new Set([...document.querySelectorAll('.puxar-ped:checked')].map(c => c.value));
  const grade = document.getElementById('pxGrade');
  if (!grade) return;
  grade.innerHTML = _pxGradeHTML();
  document.querySelectorAll('.puxar-ped').forEach(c => { c.checked = marcados.has(c.value); });
  _pxAtualizarContador();
}
window._pxFiltrar = _pxFiltrar;

function _pxMarcar(v){
  document.querySelectorAll('.puxar-ped').forEach(c => { c.checked = !!v; });
  _pxAtualizarContador();
}
window._pxMarcar = _pxMarcar;

/* O contador aqui é mais importante que no criar viagem: as vagas já estão
   parcialmente ocupadas, e estourar só apareceria no confirm. */
function _pxAtualizarContador(){
  const el = document.getElementById('pxContador');
  if (!el) return;
  const marcados = document.querySelectorAll('.puxar-ped:checked').length;
  const cap = window._pxCap || 0, naCarga = window._pxNaCarga || 0;
  const vagas = cap - naCarga;
  const sobra = vagas - marcados;
  el.innerHTML = `
    <div class="pv-cont-num"><strong>${marcados}</strong> selecionado(s)</div>
    <div class="pv-cont-info">carga ficaria em ${naCarga + marcados} de ${cap}</div>
    ${sobra < 0
      ? `<div class="pv-cont-alerta">⚠️ ${Math.abs(sobra)} a mais do que cabe</div>`
      : sobra === 0
        ? '<div class="pv-cont-ok">✅ completa a cegonha</div>'
        : `<div class="pv-cont-info">${sobra} vaga(s) ainda livre(s)</div>`}`;
}
window._pxAtualizarContador = _pxAtualizarContador;

async function _viagemConfirmarPuxar(rotaId, cap){
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
  if (!rota) return;
  const jaNaCarga = _veiculosNaRota(rotaId).length;
  const ids = [...document.querySelectorAll('.puxar-ped:checked')].map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um pedido.'); return; }
  if (jaNaCarga + ids.length > cap){
    alert(`Não cabe: a viagem tem ${jaNaCarga}/${cap} e você selecionou ${ids.length}. Reduza a seleção.`); return;
  }
  const usuario = _usuarioAtualNome() || 'Logística';
  const perfil = (typeof perfilAtual!=='undefined'?perfilAtual:'logistica');
  for (const id of ids){
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    if (!p) continue;
    const eraTransbordo = p.status === 'Transbordo';
    const antes = statusPlanilhaDoPedido(p);
    try {
      const upd = { rota_id: rota.id, corredor_manual_id: null };
      if (rota.placa_cegonha) upd.placa_cegonha = rota.placa_cegonha;
      if (rota.motorista_1) upd.motorista_1 = rota.motorista_1;
      // se estava em transbordo, ao embarcar sai do pátio e entra em transporte (nova perna começou)
      if (eraTransbordo){ upd.status = 'Em Transporte'; upd.status_planilha = 'Em transporte'; upd.cidade_transbordo = null; }
      await supabase.from('pedidos').update(upd).eq('id', id);
      Object.assign(p, { rotaId: rota.id, rota_id: rota.id });
      if (rota.placa_cegonha) p.placaCegonha = rota.placa_cegonha;
      if (rota.motorista_1) p.motorista1 = rota.motorista_1;
      if (eraTransbordo){ p.status = 'Em Transporte'; p.statusPlanilha = 'Em transporte'; p.cidadeTransbordo = null; }
      await supabase.from('historico_status').insert({
        pedido_id: id, status_anterior: antes, status_novo: statusPlanilhaDoPedido(p),
        usuario_nome: usuario, usuario_perfil: perfil,
        observacao: eraTransbordo ? `➕ Puxado para a viagem ${rota.nome||('#'+rota.id)} (retomou de transbordo)` : `➕ Puxado para a viagem ${rota.nome||('#'+rota.id)} no caminho`
      });
    } catch(e){ console.error('Erro ao puxar', id, e); }
  }
  document.getElementById('modalPuxarPedido')?.remove();
  renderizarViagensAndamento();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `➕ ${ids.length} pedido(s) puxado(s) para a viagem.`, 'success');
}

// ============================================================
// CENTRAL DE OPERAÇÃO — fila de trabalho: só o que precisa de ação agora
// Coletas (→ equipe) | Entregas (→ motorista), filtro por base, saem ao confirmar.
// ============================================================
let _centralBase = '__todas__';
// Busca da Central de Operação — uma para cada coluna (coletas e entregas),
// no mesmo formato do filtro de Pedidos: placa (do carro ou da cegonha),
// ID, referência, cliente e motorista.
let _centralBuscaColeta = '';
let _centralBuscaEntrega = '';
function _centralFiltraBusca(lista, termo){
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const b = n(termo||'');
  if (!b) return lista;
  return lista.filter(p => n(`${p.placa||''} ${p.placaCegonha||''} ${p.referencia||''} ${p.cliente||''} ${p.motorista1||''} #${p.id} ${p.id}`).includes(b));
}

// Bases = cidades-base distintas das equipes
function _centralBases(){
  const set = new Set();
  (equipesEntregaGlobais||[]).forEach(e => { if (e.cidade_base) set.add(e.cidade_base); });
  return [...set].sort();
}

// COLETAS pendentes: precisam ser coletadas e ainda não foram (independe de equipe definida)
function _centralColetas(){
  return (pedidosGlobais||[]).filter(p => {
    if (['Entregue','Cancelado'].includes(p.status||'')) return false;
    if (p.coletaEquipeEm) return false;      // já coletado pela equipe → sai
    if (p.patioAtual) return false;          // já está no pátio → não precisa coletar
    if (p.formaColeta === 'motorista') return false; // motorista coleta direto

    // Direcionado CONTINUA na fila, com a marca de "enviado para coleta".
    // Só sai quando a coleta é confirmada (patioAtual / coletaEquipeEm, já
    // tratados acima). Assim a logística enxerga o que está em andamento e
    // não perde de vista o que foi enviado e ainda não voltou.
    // ANTES existia aqui: if (p.rotaId || p.placaCegonha) return false.
    // Estava errado: alocar numa cegonha NÃO é coletar. O carro podia ser
    // reservado para uma carga hoje e só ser buscado dias depois — e nesse
    // intervalo ele sumia da fila de coleta sem estar no pátio, ficando
    // invisível no sistema inteiro.
    // O que tira da fila é o carro estar FISICAMENTE no pátio, e isso já é
    // tratado acima pelo patioAtual.
    //
    // Mas carro JÁ EM VIAGEM também não é coleta pendente: ele saiu, está na
    // estrada. A distinção é o status, não a alocação:
    //   • alocado e aguardando  → continua na fila (a cegonha espera por ele)
    //   • em transporte/transbordo → saiu, não é mais coleta
    if (['Em Transporte','Transbordo'].includes(p.status||'')) return false;
    // filtro de base: pela cidade de origem
    if (_centralBase !== '__todas__' && !_cidadeIgual(p.cidadeOrigem, _centralBase)) return false;
    return true;
  });
}

// ENTREGAS pendentes: em transporte/no pátio, precisam ser entregues (→ motorista)
function _centralEntregas(){
  return (pedidosGlobais||[]).filter(p => {
    if (['Cancelado'].includes(p.status||'')) return false;
    if (p.status === 'Entregue') return false;      // já entregue → sai
    // Direcionado para EQUIPE — o campo de data nem sempre vem preenchido,
    // então consideramos o vínculo da equipe, que é o que de fato marca o
    // direcionamento. Era por isso que a contagem não baixava.
    if (p.entregaEquipeEm || p.entregaEquipeId || p.precisaEquipeEntrega) return false;
    // Direcionado para MOTORISTA (campo próprio, fora da carga)
    if (p.entregaMotorista) return false;
    if (p.aguardandoRetirada) return false;          // foi pra "aguardando retirada" → sai da fila
    // precisa estar em transporte (a caminho do destino)
    if (p.status !== 'Em Transporte') return false;
    if (_centralBase !== '__todas__' && !_cidadeIgual(p.cidadeDestino, _centralBase)) return false;
    return true;
  });
}

// AGUARDANDO CONFIRMAÇÃO: coletas/entregas que dependem de confirmação externa
function _centralAguardando(){
  return (pedidosGlobais||[]).filter(p => {
    if (['Cancelado'].includes(p.status||'')) return false;
    // cliente leva ao pátio (aguardando chegada) ou aguardando retirada pelo cliente
    const clienteLeva = p.formaColeta === 'cliente' && !p.patioAtual && !['Entregue'].includes(p.status);
    const aguardaRetirada = p.aguardandoRetirada;
    if (_centralBase !== '__todas__'){
      const cidadeRef = aguardaRetirada ? p.cidadeDestino : p.cidadeOrigem;
      if (!_cidadeIgual(cidadeRef, _centralBase)) return false;
    }
    return clienteLeva || aguardaRetirada;
  });
}

function _centralConcluidosHoje(){
  const hoje = new Date().toISOString().slice(0,10);
  return (pedidosGlobais||[]).filter(p => {
    const dt = (p.coletaEquipeEm||p.entregaEquipeEm||'').slice(0,10);
    return dt === hoje;
  }).length;
}

function renderizarCentralOperacao(){
  const cont = document.getElementById('painelViewCentral');
  if (!cont) return;
  const coletasTodas = _centralColetas();
  const entregasTodas = _centralEntregas();
  const coletas = _centralFiltraBusca(coletasTodas, _centralBuscaColeta);
  const entregas = _centralFiltraBusca(entregasTodas, _centralBuscaEntrega);
  const aguardando = _centralAguardando();
  const concluidos = _centralConcluidosHoje();
  const bases = _centralBases();

  cont.innerHTML = `
    <div class="central-topo">
      <div class="central-base">
        <label>BASE</label>
        <select onchange="_centralSetBase(this.value)">
          <option value="__todas__" ${_centralBase==='__todas__'?'selected':''}>Todas</option>
          ${bases.map(b => `<option value="${b}" ${_centralBase===b?'selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="central-kpis">
        <div class="central-kpi central-kpi-laranja"><div class="central-kpi-ic">🚚</div><div><span class="central-kpi-lbl">Coletas pendentes</span><span class="central-kpi-num">${coletasTodas.length}</span></div></div>
        <div class="central-kpi central-kpi-azul"><div class="central-kpi-ic">📦</div><div><span class="central-kpi-lbl">Entregas pendentes</span><span class="central-kpi-num">${entregasTodas.length}</span></div></div>
        <div class="central-kpi central-kpi-amarelo"><div class="central-kpi-ic">⏳</div><div><span class="central-kpi-lbl">Aguardando confirmação</span><span class="central-kpi-num">${aguardando.length}</span></div></div>
        <div class="central-kpi central-kpi-verde"><div class="central-kpi-ic">✅</div><div><span class="central-kpi-lbl">Concluídos hoje</span><span class="central-kpi-num">${concluidos}</span></div></div>
      </div>
    </div>

    <div class="central-colunas">
      ${_centralColunaColetas(coletas, coletasTodas.length)}
      ${_centralColunaEntregas(entregas, entregasTodas.length)}
    </div>

    ${_centralAguardandoHTML(aguardando)}

    <p class="central-rodape">ℹ️ Pedidos saem desta tela após a confirmação da coleta ou entrega.</p>`;
}

function _centralSetBase(b){ _centralBase = b; renderizarCentralOperacao(); }

// Busca de cada coluna — guarda o texto, re-renderiza e devolve o cursor ao
// campo, para que a digitação não seja interrompida pelo redesenho da tela.
function _centralSetBusca(qual){
  const id = qual === 'entrega' ? 'centralBuscaEntrega' : 'centralBuscaColeta';
  const el0 = document.getElementById(id);
  const txt = el0?.value || '';
  const pos = el0?.selectionStart ?? null;
  if (qual === 'entrega') _centralBuscaEntrega = txt; else _centralBuscaColeta = txt;
  renderizarCentralOperacao();
  const el = document.getElementById(id);
  if (el){ el.focus(); if (pos !== null){ try { el.setSelectionRange(pos, pos); } catch(_){} } }
}
function _centralLimparBusca(qual){
  if (qual === 'entrega') _centralBuscaEntrega = ''; else _centralBuscaColeta = '';
  renderizarCentralOperacao();
}

function _tipoColetaLabel(p){
  if (p.formaColeta === 'cliente') return '🏠 Cliente leva ao pátio';
  if (p.formaColeta === 'coletador') return '🚚 Coletador busca';
  if (p.formaColeta === 'motorista') return '🚛 Motorista coleta';
  return '🚚 A definir';
}
function _tipoEntregaLabel(p){
  return p.tipoEntrega === 'estabelecimento' ? '🏪 Estabelecimento do cliente' : '🏢 Retira no pátio';
}

function _centralColunaColetas(coletas, total){
  const busca = _centralBuscaColeta;
  const filtrando = !!busca;
  if (typeof total !== 'number') total = coletas.length;
  return `<div class="central-col">
    <div class="central-col-cab central-col-coletas">
      <span>🚚 COLETAS PENDENTES${filtrando?` <span class="central-col-contagem">${coletas.length} de ${total}</span>`:''}</span>
      <button class="central-refresh" onclick="renderizarCentralOperacao()" title="Atualizar">🔄</button>
    </div>
    <div class="central-col-busca">
      <span class="central-col-busca-ic">🔍</span>
      <input type="text" id="centralBuscaColeta"
             placeholder="Placa, cegonha, ID, referência ou cliente"
             value="${String(busca).replace(/"/g,'&quot;')}"
             oninput="_mmDeb('centralBuscaColeta', function(){ _centralSetBusca('coleta'); })">
      ${filtrando?`<button class="central-col-busca-x" onclick="_centralLimparBusca('coleta')" title="Limpar">✕</button>`:''}
    </div>
    ${coletas.length === 0 ? (filtrando
        ? `<p class="central-vazio">Nenhuma coleta encontrada para essa busca.</p>`
        : '<p class="central-vazio">Nenhuma coleta pendente. 👍</p>') : `
    ${_centralColetasPorViagem(coletas)}
    <div class="central-cards" style="display:none">
      ${coletas.map(p => `<label class="central-card" for="cchk_${p.id}">
        <input type="checkbox" id="cchk_${p.id}" class="central-chk-coleta" value="${p.id}">
        <div class="central-card-body">
          <div class="central-card-linha1">
            <span class="central-card-id">#${p.id}</span>
            <span class="central-card-placa">${p.placa||'—'}</span>
            <span class="central-card-status central-status-laranja">● Disponível</span>
          </div>
          <div class="central-card-cliente">${p.cliente||'—'}${p.modelo?` · <span class="central-sub">${p.modelo}</span>`:''}</div>
          <div class="central-card-rota">${p.cidadeOrigem||'—'}/${p.ufOrigem||''} <span class="central-seta">→</span> ${p.cidadeDestino||'—'}/${p.ufDestino||''}</div>
          <div class="central-card-tipo">${(() => {
            if (p.coletaMotorista)
              return `<span class="col-tag col-enviado">📤 Enviado — ${p.coletaMotorista}</span> `;
            if (p.coletaEquipeId){
              const _eq = (equipesEntregaGlobais||[]).find(e => String(e.id)===String(p.coletaEquipeId));
              return `<span class="col-tag col-enviado">📤 Enviado — equipe ${_eq?_eq.nome:'—'}</span> `;
            }
            return '';
          })()}${_tipoColetaLabel(p)}${
            (p.placaCegonha || p.rotaId)
              ? ` <span class="col-tag col-urgente" title="A cegonha já está reservada para este carro — a coleta é prioridade">🚛 Alocado${p.placaCegonha ? ' na ' + p.placaCegonha : ''} · falta coletar</span>`
              : ''
          }</div>
        </div>
      </label>`).join('')}
    </div>
    <div class="central-col-rodape">
      <span class="text-muted">${coletas.length} pedido(s)</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="central-btn central-btn-azul" onclick="_centralDirecionarMotoristaColeta()">👤 Motorista</button>
        <button class="central-btn central-btn-laranja" onclick="_centralDirecionarEquipe()">👥 Direcionar para equipe</button>
      </div>
    </div>`}
  </div>`;
}

function _centralColunaEntregas(entregas, total){
  const busca = _centralBuscaEntrega;
  const filtrando = !!busca;
  if (typeof total !== 'number') total = entregas.length;
  return `<div class="central-col">
    <div class="central-col-cab central-col-entregas">
      <span>📦 ENTREGAS PENDENTES${filtrando?` <span class="central-col-contagem">${entregas.length} de ${total}</span>`:''}</span>
      <button class="central-refresh" onclick="renderizarCentralOperacao()" title="Atualizar">🔄</button>
    </div>
    <div class="central-col-busca">
      <span class="central-col-busca-ic">🔍</span>
      <input type="text" id="centralBuscaEntrega"
             placeholder="Placa, cegonha, ID, referência ou cliente"
             value="${String(busca).replace(/"/g,'&quot;')}"
             oninput="_mmDeb('centralBuscaEntrega', function(){ _centralSetBusca('entrega'); })">
      ${filtrando?`<button class="central-col-busca-x" onclick="_centralLimparBusca('entrega')" title="Limpar">✕</button>`:''}
    </div>
    ${entregas.length === 0 ? (filtrando
        ? `<p class="central-vazio">Nenhuma entrega encontrada para essa busca.</p>`
        : '<p class="central-vazio">Nenhuma entrega pendente. 👍</p>') : `
    ${_centralEntregasPorViagem(entregas)}
    <div class="central-cards" style="display:none">
      ${entregas.map(p => `<label class="central-card" for="echk_${p.id}">
        <input type="checkbox" id="echk_${p.id}" class="central-chk-entrega" value="${p.id}">
        <div class="central-card-body">
          <div class="central-card-linha1">
            <span class="central-card-id">#${p.id}</span>
            <span class="central-card-placa">${p.placa||'—'}</span>
            <span class="central-card-status central-status-verde">● Disponível</span>
          </div>
          <div class="central-card-cliente">${p.cliente||'—'}${p.modelo?` · <span class="central-sub">${p.modelo}</span>`:''}</div>
          <div class="central-card-rota">${p.cidadeOrigem||'—'}/${p.ufOrigem||''} <span class="central-seta">→</span> ${p.cidadeDestino||'—'}/${p.ufDestino||''}</div>
          ${_centralDataLancamento(p)}
          <div class="central-card-tipo">${_tipoEntregaLabel(p)}${p.precisaEquipeEntrega?' <span style="color:#a855f7;font-size:.72rem;font-weight:700">· 👥 equipe</span>':''}${p.motorista1?` · <span class="central-sub">👤 ${p.motorista1}</span>`:''}</div>
          ${p.tipoEntrega === 'patio' ? `<button class="central-btn-mini" onclick="event.preventDefault();_centralDisponivelRetirada(${p.id})" title="Veículo chegou ao pátio, disponível para o cliente retirar">🏢 Disponível p/ retirada</button>` : ''}
        </div>
      </label>`).join('')}
    </div>
    <div class="central-col-rodape">
      <span class="text-muted">${entregas.length} pedido(s)</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="central-btn central-btn-azul" onclick="_centralDirecionarMotorista()">👤 Motorista</button>
        <button class="central-btn" style="background:#a855f7" onclick="_centralDirecionarEquipeEntrega()">👥 Equipe de entrega</button>
      </div>
    </div>`}
  </div>`;
}

function _centralAguardandoHTML(aguardando){
  return `<div class="central-aguardando">
    <div class="central-aguardando-cab">⏳ AGUARDANDO CONFIRMAÇÃO ${aguardando.length>0?`<span class="central-badge">${aguardando.length}</span>`:''}</div>
    ${aguardando.length === 0 ? '<p class="central-vazio" style="padding:.6rem">Nada aguardando confirmação.</p>' : `
    <div class="central-aguardando-cards">
      ${aguardando.slice(0,8).map(p => {
        const retirada = p.aguardandoRetirada;
        const titulo = retirada ? '🏢 Retira no pátio' : (p.formaColeta==='cliente' ? '🏠 Cliente leva ao pátio' : '📥 Coleta no cliente');
        const sub = retirada ? 'Aguardando retirada pelo cliente' : (p.formaColeta==='cliente' ? 'Aguardando chegada ao pátio' : 'Aguardando confirmação de disponibilidade');
        const cidade = retirada ? p.cidadeDestino : p.cidadeOrigem;
        return `<div class="central-ag-card">
          <div class="central-ag-top"><strong>#${p.id}</strong> · Placa: ${p.placa||'—'}</div>
          <div class="central-ag-tit">${titulo} · ${cidade||''}</div>
          <div class="central-ag-sub">🟡 ${sub}</div>
          ${retirada ? `<button class="central-btn-mini central-btn-mini-verde" onclick="_centralRegistrarRetirada(${p.id})" title="Comercial: cliente retirou o veículo">✅ Registrar retirada</button>` : ''}
        </div>`;
      }).join('')}
    </div>`}
  </div>`;
}

// Ações da Central (Bloco 2)
function _centralDirecionarEquipe(){
  const ids = [...document.querySelectorAll('.central-chk-coleta:checked')].map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos uma coleta.'); return; }
  _centralModalEquipe(ids);
}
function _centralDirecionarMotorista(){
  const ids = [...document.querySelectorAll('.central-chk-entrega:checked')].map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos uma entrega.'); return; }
  _centralModalMotorista(ids);
}

// ---- Direcionar COLETAS para um motorista ----
// Grava em coleta_motorista, e NÃO em motorista_1. O motorista_1 é o
// motorista da cegonha; se usássemos ele, a coleta avulsa entraria na
// carga e se misturaria com os carros que já estão sendo transportados.
function _centralDirecionarMotoristaColeta(){
  const ids = [...document.querySelectorAll('.central-chk-coleta:checked')].map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos uma coleta.'); return; }
  _centralModalMotoristaColeta(ids);
}

function _centralModalMotoristaColeta(ids){
  const old = document.getElementById('modalCentralMotColeta'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalCentralMotColeta';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">👤 Direcionar coleta para motorista</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">
        ${ids.length} coleta(s) selecionada(s). Elas aparecem no app do motorista
        em <strong>Coletas direcionadas</strong>, separadas da carga da cegonha.
      </p>
      <div class="form-group">
        <label>Motorista</label>
        <input type="text" id="centralMotColetaSel" placeholder="Nome do motorista" list="listaMotColeta">
        <datalist id="listaMotColeta">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#2563eb" onclick="_centralConfirmarMotoristaColeta([${ids.join(',')}])">✅ Direcionar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalCentralMotColeta').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _centralConfirmarMotoristaColeta(ids){
  const mot = document.getElementById('centralMotColetaSel')?.value.trim();
  if (!mot){ alert('Informe o motorista.'); return; }
  const usuario = _usuarioAtualNome() || 'Logística';
  let ok = 0;

  // Em lote: um update para todos os carros selecionados
  const _agoraCol = new Date().toISOString();
  const _rc = await mmAtualizarPedidos(ids,
    { coleta_motorista: mot, coleta_direcionada_em: _agoraCol, coleta_direcionada_por: usuario },
    (p) => { p.coletaMotorista = mot; p.coletaDirecionadaEm = _agoraCol; }
  );
  ok = _rc.ok;


  document.getElementById('modalCentralMotColeta')?.remove();
  if (typeof mmToast === 'function') mmToast(`✅ ${ok} coleta(s) direcionada(s) para ${mot}`);
  if (typeof renderizarCentralOperacoes === 'function') renderizarCentralOperacoes();
}

// Modal: direcionar coletas para uma EQUIPE
function _centralModalEquipe(ids){
  const equipes = (equipesEntregaGlobais||[]).filter(e => e.ativo !== false);
  const old = document.getElementById('modalCentralEquipe'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalCentralEquipe';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">👥 Direcionar para equipe</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${ids.length} coleta(s) selecionada(s). Escolha a equipe que fará a coleta.</p>
      <div class="central-modal-peds">
        ${ids.map(id => { const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id)); if(!p) return ''; return `<div class="central-modal-ped"><strong>#${p.id}</strong> · ${p.placa||''} · ${p.cliente||''}${p.enderecoColeta?`<br><span class="central-modal-end">📍 ${p.enderecoColeta}</span>`:''}</div>`; }).join('')}
      </div>
      <div class="form-group">
        <label>Equipe de coleta</label>
        <select id="centralEquipeSel">
          <option value="">Selecione...</option>
          ${equipes.map(e => `<option value="${e.id}">${e.nome}${e.cidade_base?' · 📍 '+e.cidade_base:''}${e.responsavel?' ('+e.responsavel+')':''}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#ff6a00" onclick="_centralConfirmarEquipe([${ids.join(',')}])">✅ Direcionar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalCentralEquipe').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _centralConfirmarEquipe(ids){
  const equipeId = document.getElementById('centralEquipeSel')?.value;
  if (!equipeId){ alert('Selecione uma equipe.'); return; }
  const usuario = _usuarioAtualNome() || 'Logística';
  // Em lote. coleta_equipe_id é o DIRECIONAMENTO da logística;
  // equipe_coleta_id (nome parecido) é a sugestão do comercial e não é mexida.
  const _agoraEq = new Date().toISOString();
  const _usrEq = _usuarioAtualNome() || 'Logística';
  await mmAtualizarPedidos(ids,
    { coleta_equipe_id: parseInt(equipeId), coleta_direcionada_em: _agoraEq, coleta_direcionada_por: _usrEq },
    (p) => { p.coletaEquipeId = parseInt(equipeId); p.coletaDirecionadaEm = _agoraEq; }
  );
  document.getElementById('modalCentralEquipe')?.remove();
  renderizarCentralOperacao();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `👥 ${ids.length} coleta(s) direcionada(s) para a equipe. A equipe confirma no app.`, 'success');
}

// Direcionar ENTREGAS para uma equipe de entrega
function _centralDirecionarEquipeEntrega(){
  const ids = [...document.querySelectorAll('.central-chk-entrega:checked')].map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos uma entrega.'); return; }
  _centralModalEquipeEntrega(ids);
}

function _centralModalEquipeEntrega(ids){
  const equipes = (equipesEntregaGlobais||[]).filter(e => e.ativo !== false);
  const old = document.getElementById('modalCentralEquipeEnt'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalCentralEquipeEnt';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">👥 Direcionar entrega para equipe</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${ids.length} entrega(s) selecionada(s). Escolha a equipe que fará a entrega ao cliente.</p>
      <div class="central-modal-peds">
        ${ids.map(id => { const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id)); if(!p) return ''; return `<div class="central-modal-ped"><strong>#${p.id}</strong> · ${p.placa||''} · ${p.cliente||''}${p.enderecoEntrega?`<br><span class="central-modal-end">🏁 ${p.enderecoEntrega}</span>`:''}</div>`; }).join('')}
      </div>
      <div class="form-group">
        <label>Equipe de entrega</label>
        <select id="centralEquipeEntSel">
          <option value="">Selecione...</option>
          ${equipes.map(e => `<option value="${e.id}">${e.nome}${e.cidade_base?' · 📍 '+e.cidade_base:''}${e.responsavel?' ('+e.responsavel+')':''}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#a855f7" onclick="_centralConfirmarEquipeEntrega([${ids.join(',')}])">✅ Direcionar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalCentralEquipeEnt').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _centralConfirmarEquipeEntrega(ids){
  const equipeId = document.getElementById('centralEquipeEntSel')?.value;
  if (!equipeId){ alert('Selecione uma equipe.'); return; }
  const eq = (equipesEntregaGlobais||[]).find(e => String(e.id)===String(equipeId));
  const usuario = _usuarioAtualNome() || 'Logística';
  // Em lote. Grava o DIRECIONAMENTO (entrega_direcionada_em), nunca a
  // conclusão (entrega_equipe_em) — esse último significa "a equipe já
  // entregou" e é o que tira o pedido da lista da equipe. Gravá-lo aqui
  // fazia o serviço nascer concluído: sumia da Central e nunca chegava na
  // equipe. Quem tira da fila da Central é o entrega_equipe_id.
  const _agoraEnt = new Date().toISOString();
  await mmAtualizarPedidos(ids,
    { entrega_equipe_id: parseInt(equipeId), precisa_equipe_entrega: true,
      entrega_direcionada_em: _agoraEnt, entrega_direcionada_por: usuario },
    (p) => { p.entregaEquipeId = parseInt(equipeId); p.precisaEquipeEntrega = true; p.entregaDirecionadaEm = _agoraEnt; }
  );
  await mmRegistrarHistorico((ids||[]).map(id => {
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    return { pedido_id: parseInt(id), status_anterior: p?.status, status_novo: p?.status,
             usuario_nome: usuario, observacao: `👥 Entrega direcionada para a equipe ${eq?eq.nome:''}.` };
  }));
  document.getElementById('modalCentralEquipeEnt')?.remove();
  renderizarCentralOperacao();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `👥 ${ids.length} entrega(s) direcionada(s) para a equipe ${eq?eq.nome:''}. A equipe confirma no app.`, 'success');
}

// Modal: direcionar entregas para um MOTORISTA
function _centralModalMotorista(ids){
  const old = document.getElementById('modalCentralMotorista'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalCentralMotorista';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">👤 Direcionar para motorista</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${ids.length} entrega(s) selecionada(s). Escolha o motorista responsável pela entrega.</p>
      <div class="form-group">
        <label>Motorista</label>
        <input type="text" id="centralMotoristaSel" placeholder="Nome do motorista" list="listaMotCentral">
        <datalist id="listaMotCentral">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#2563eb" onclick="_centralConfirmarMotorista([${ids.join(',')}])">✅ Direcionar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalCentralMotorista').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _centralConfirmarMotorista(ids){
  const mot = document.getElementById('centralMotoristaSel')?.value.trim();
  if (!mot){ alert('Informe o motorista.'); return; }
  const usuario = _usuarioAtualNome() || 'Logística';

  // Grava em entrega_motorista, e NÃO em motorista_1. Antes escrevia no
  // motorista_1 — o campo do motorista da cegonha —, e por isso a entrega
  // avulsa entrava na carga e se misturava com os carros transportados.
  const _agoraEm = new Date().toISOString();
  await mmAtualizarPedidos(ids,
    { entrega_motorista: mot, entrega_direcionada_em: _agoraEm, entrega_direcionada_por: usuario },
    (p) => { p.entregaMotorista = mot; p.entregaDirecionadaEm = _agoraEm; }
  );
  document.getElementById('modalCentralMotorista')?.remove();
  renderizarCentralOperacao();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `👤 ${ids.length} entrega(s) direcionada(s) para ${mot}. O motorista confirma no app.`, 'success');
}

// ============================================================
// FLUXO 🏢 RETIRA NO PÁTIO — Central de Operação (Bloco 2 final)
// Colaborador marca "disponível para retirada" → avisa comercial →
// 🟡 aguardando retirada → comercial registra a retirada (fecha).
// ============================================================

// Colaborador/logística: veículo chegou ao pátio e está disponível para o cliente retirar
async function _centralDisponivelRetirada(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  if (!confirm(`Confirmar que o veículo #${p.id} (${p.placa||''}) chegou ao pátio e está DISPONÍVEL PARA RETIRADA pelo cliente?\n\nO comercial será avisado para acionar o cliente.`)) return;
  const usuario = _usuarioAtualNome() || 'Operador';
  try {
    await supabase.from('pedidos').update({
      aguardando_retirada: true,
      status_planilha: 'Em transporte'  // logística terminou o transporte, mas não é "Entregue"
    }).eq('id', p.id);
    p.aguardandoRetirada = true;

    // registra na jornada
    await supabase.from('historico_status').insert({
      pedido_id: p.id, status_anterior: statusPlanilhaDoPedido(p), status_novo: 'Aguardando retirada',
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: '🟡 Veículo disponível para retirada no pátio — comercial avisado'
    });

    // avisa o COMERCIAL
    if (typeof notificar === 'function'){
      await notificar({
        perfil: 'comercial', pedidoId: p.id, tipo: 'retirada',
        titulo: `🚨 Veículo disponível para retirada — #${p.id}`,
        mensagem: `${p.placa||''} (${p.modelo||''}) chegou ao pátio de ${p.cidadeDestino||''} e está pronto para o cliente ${p.cliente||''} retirar.`
      });
    }
    renderizarCentralOperacao();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `🟡 #${p.id} marcado como disponível para retirada. Comercial avisado.`, 'success');
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

// Comercial: registra que o cliente retirou o veículo (fecha o processo)
async function _centralRegistrarRetirada(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  if (!confirm(`Confirmar que o cliente ${p.cliente||''} RETIROU o veículo #${p.id} (${p.placa||''})?\n\nIsso conclui o processo (Entregue).`)) return;
  const usuario = _usuarioAtualNome() || 'Comercial';
  try {
    await supabase.from('pedidos').update({
      aguardando_retirada: false,
      status: 'Entregue',
      status_planilha: 'Entregue',
      entrega_equipe_em: new Date().toISOString()
    }).eq('id', p.id);
    p.aguardandoRetirada = false; p.status = 'Entregue'; p.statusPlanilha = 'Entregue';
    p.entregaEquipeEm = new Date().toISOString();

    await supabase.from('historico_status').insert({
      pedido_id: p.id, status_anterior: 'Aguardando retirada', status_novo: 'Entregue',
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'comercial'),
      observacao: '✅ Cliente retirou o veículo no pátio — processo concluído'
    });

    renderizarCentralOperacao();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `✅ Retirada do #${p.id} registrada. Processo concluído.`, 'success');
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

// Faixa de folgas/afastamentos/lembretes no topo do Planejamento (só visualização)
function _planFolgasHTML(){
  const folgas = window.folgasGlobais || (typeof folgasGlobais !== 'undefined' ? folgasGlobais : []);
  if (!folgas || folgas.length === 0) return '';
  const hoje = new Date().toISOString().slice(0,10);
  const em7 = new Date(Date.now() + 7*86400000).toISOString().slice(0,10);
  // ativos hoje + que começam nos próximos 7 dias
  const relevantes = folgas.filter(f => {
    const ini = String(f.data_inicio).slice(0,10);
    const fim = String(f.data_fim || f.data_inicio).slice(0,10);
    const ativoHoje = hoje >= ini && hoje <= fim;
    const proximo = ini > hoje && ini <= em7;
    return ativoHoje || proximo;
  });
  if (relevantes.length === 0) return '';
  const cfgTipo = (typeof TIPOS_FOLGA !== 'undefined') ? TIPOS_FOLGA : {};
  const chips = relevantes.map(f => {
    const cfg = cfgTipo[f.tipo] || { label:'Lembrete', icone:'📌', cor:'#fbbf24' };
    const ini = new Date(String(f.data_inicio).slice(0,10)+'T12:00').toLocaleDateString('pt-BR');
    const fim = f.data_fim && String(f.data_fim).slice(0,10) !== String(f.data_inicio).slice(0,10)
      ? ' a ' + new Date(String(f.data_fim).slice(0,10)+'T12:00').toLocaleDateString('pt-BR') : '';
    const ativoHoje = hoje >= String(f.data_inicio).slice(0,10) && hoje <= String(f.data_fim||f.data_inicio).slice(0,10);
    return `<span class="plan-folga-chip" style="border-color:${cfg.cor}55;background:${cfg.cor}18">
      <span style="color:${cfg.cor}">${cfg.icone} ${cfg.label}</span>
      <strong>${f.motorista_nome||f.titulo||'—'}</strong>
      <span class="plan-folga-data">${ativoHoje?'hoje':ini}${fim}</span>
    </span>`;
  }).join('');
  return `<div class="plan-folgas">
    <span class="plan-folgas-tit">⚠️ Indisponibilidades / lembretes</span>
    <div class="plan-folgas-chips">${chips}</div>
  </div>`;
}

// ============================================================
// ÁREA COMERCIAL (somente visualização) — Visão Global, Pedidos, Viagens, Rastreio
// Tudo que a logística faz aparece aqui; o comercial não altera a operação.
// ============================================================

// Agrupa a situação dos pedidos ativos
function _cgSituacao(){
  const ativos = (pedidosGlobais||[]).filter(p => !['Cancelado'].includes(p.status||''));
  const cont = { aguardandoColeta:0, prontos:0, emViagem:0, chegaram:0, aguardandoRetirada:0, ocorrencias:0, total:0 };
  ativos.forEach(p => {
    const st = statusPlanilhaDoPedido(p);
    if (p.status === 'Entregue') return; // entregue não conta como "em operação"
    cont.total++;
    if (p.status === 'Ocorrência'){ cont.ocorrencias++; return; }
    if (p.aguardandoRetirada){ cont.aguardandoRetirada++; return; }
    if (['Aguardando coleta','Não liberado'].includes(st)) cont.aguardandoColeta++;
    else if (['Enviado coleta','Coletado'].includes(st)) cont.prontos++;
    else if (st === 'Em transporte' || st === 'Transbordo') cont.emViagem++;
  });
  // chegaram ao destino hoje (entregues)
  cont.chegaram = (pedidosGlobais||[]).filter(p => p.status === 'Entregue').length;
  return cont;
}

// Dados por corredor: total, aguardando, em viagem, concluídos
function _cgCorredores(){
  return (corredoresGlobais||[]).map(c => {
    const seq = (c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino];
    const paradasStr = seq.filter(Boolean);
    const pedidos = (pedidosGlobais||[]).filter(p => {
      if (['Cancelado','Entregue'].includes(p.status||'')) return false; // demanda ativa: sem concluídos
      if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
      const partida = p.patioAtual || p.cidadeOrigem;
      const io = (typeof _posNaSeq === 'function') ? _posNaSeq(paradasStr, partida) : -1;
      const id = (typeof _posNaSeq === 'function') ? _posNaSeq(paradasStr, p.cidadeDestino) : -1;
      return (io !== -1 && id !== -1 && io < id);
    });
    let aguardando=0, emViagem=0, concluidos=0;
    pedidos.forEach(p => {
      const st = statusPlanilhaDoPedido(p);
      if (st === 'Em transporte' || st === 'Transbordo') emViagem++;
      else aguardando++;
    });
    return { corredor:c, nome:c.nome, total:pedidos.length, aguardando, emViagem, concluidos };
  }).filter(c => c.total > 0).sort((a,b) => b.aguardando - a.aguardando);
}

function _cgCorCor(total){ return total >= 20 ? '#ef4444' : total >= 10 ? '#f59e0b' : '#22c55e'; }

function renderizarVisaoGlobal(){
  const cont = document.getElementById('visaoGlobalConteudo');
  if (!cont) return;
  const s = _cgSituacao();
  const corredores = _cgCorredores();
  const viagens = (rotasGlobais||[]).filter(r => r.status === 'em_andamento');
  const aguardandoTransporte = (pedidosGlobais||[]).filter(p => {
    const st = statusPlanilhaDoPedido(p);
    return !['Cancelado','Entregue'].includes(p.status||'') && ['Enviado coleta','Coletado'].includes(st);
  }).length;
  const aguardandoRetirada = s.aguardandoRetirada;

  cont.innerHTML = `
    <div class="cg-header">
      <h2>🌐 Visão Global — Comercial</h2>
      <button class="btn btn-secondary btn-sm" onclick="renderizarVisaoGlobal()">🔄 Atualizar</button>
    </div>

    <div class="cg-kpis">
      <div class="cg-kpi cg-kpi-click" onclick="_cgAbrirListaKpi('total')"><span class="cg-kpi-num">${s.total}</span><span class="cg-kpi-lbl">Pedidos em operação</span></div>
      <div class="cg-kpi cg-kpi-click" onclick="_cgAbrirListaKpi('aguardandoColeta')"><span class="cg-kpi-num" style="color:#f59e0b">${s.aguardandoColeta}</span><span class="cg-kpi-lbl">Aguardando coleta</span></div>
      <div class="cg-kpi cg-kpi-click" onclick="_cgAbrirListaKpi('emViagem')"><span class="cg-kpi-num" style="color:#2563eb">${s.emViagem}</span><span class="cg-kpi-lbl">Em viagem</span></div>
      <div class="cg-kpi cg-kpi-click" onclick="_cgAbrirListaKpi('aguardandoRetirada')"><span class="cg-kpi-num" style="color:#a855f7">${aguardandoRetirada}</span><span class="cg-kpi-lbl">Aguardando retirada</span></div>
      <div class="cg-kpi cg-kpi-click" onclick="_cgAbrirListaKpi('ocorrencias')"><span class="cg-kpi-num" style="color:#ef4444">${s.ocorrencias||0}</span><span class="cg-kpi-lbl">⚠️ Ocorrências</span></div>
    </div>
    <div id="cgKpiOverlay"></div>

    <div class="cg-sec-tit">📍 Pedidos por corredor</div>
    <div class="cg-corredores">
      ${corredores.length === 0 ? '<p class="text-muted">Nenhum pedido em corredores no momento.</p>' :
        corredores.map(c => {
          const cor = _cgCorCor(c.aguardando);
          return `<div class="cg-corr-card cg-corr-click" style="border-left:3px solid ${cor}" onclick="_cgAbrirCorredor(${c.corredor.id})">
            <div class="cg-corr-top">
              <span class="cg-corr-nome">${c.nome}</span>
              <span class="cg-corr-chevron">›</span>
            </div>
            <div class="cg-corr-total" style="color:#f59e0b">● ${c.aguardando} aguardando transporte</div>
            <div class="cg-corr-detalhe">
              <div><span class="cg-dot" style="background:#2563eb"></span> ${c.emViagem} já em viagem</div>
            </div>
          </div>`;
        }).join('')}
    </div>

    <div class="cg-duplo">
      <div class="cg-bloco">
        <div class="cg-bloco-tit">🚛 Viagens em andamento</div>
        ${viagens.length === 0 ? '<p class="text-muted" style="font-size:.85rem">Nenhuma viagem em andamento.</p>' :
          viagens.slice(0,6).map(r => {
            const np = _veiculosNaRota(r.id).length;
            return `<div class="cg-viagem-linha" onclick="_irParaViagensComercial()">
              <span class="cg-viagem-rota">${r.nome||('R-'+r.id)}</span>
              <span class="cg-viagem-corr">${r.placa_cegonha||''}</span>
              <span class="cg-viagem-ped">${np} pedidos</span>
              <span class="cg-badge cg-badge-azul">Em viagem</span>
            </div>`;
          }).join('')}
      </div>
      <div class="cg-bloco">
        <div class="cg-bloco-tit">⚠️ Atenção</div>
        <div class="cg-atencao"><span class="cg-at-ic" style="background:#fef3c7">🟠</span> ${aguardandoTransporte} pedidos aguardando transporte</div>
        <div class="cg-atencao"><span class="cg-at-ic" style="background:#ede9fe">🟣</span> ${aguardandoRetirada} pedidos aguardando retirada</div>
        <div class="cg-atencao"><span class="cg-at-ic" style="background:#dbeafe">🔵</span> ${viagens.length} viagens em andamento</div>
      </div>
    </div>`;
}

function _irParaViagensComercial(){
  const btn = document.querySelector('.nav-btn[data-tab="comercialViagens"]');
  if (btn) btn.click();
}

// Ao clicar num KPI da Visão Global, abre a lista lateral dos pedidos daquele grupo
function _cgKpiPedidos(tipo){
  const ativos = (pedidosGlobais||[]).filter(p => !['Cancelado'].includes(p.status||''));
  return ativos.filter(p => {
    const st = statusPlanilhaDoPedido(p);
    if (tipo === 'total') return p.status !== 'Entregue';
    if (tipo === 'aguardandoColeta') return p.status !== 'Entregue' && !p.aguardandoRetirada && ['Aguardando coleta','Não liberado'].includes(st);
    if (tipo === 'emViagem') return p.status !== 'Entregue' && !p.aguardandoRetirada && (st === 'Em transporte' || st === 'Transbordo');
    if (tipo === 'aguardandoRetirada') return p.aguardandoRetirada;
    if (tipo === 'ocorrencias') return p.status === 'Ocorrência';
    if (tipo === 'chegaram') return p.status === 'Entregue';
    return false;
  });
}
const _CG_KPI_TITULOS = { total:'Pedidos em operação', aguardandoColeta:'Aguardando coleta', emViagem:'Em viagem', aguardandoRetirada:'Aguardando retirada', ocorrencias:'⚠️ Pedidos com ocorrência', chegaram:'Chegaram ao destino' };

function _cgAbrirListaKpi(tipo){
  const overlay = document.getElementById('cgKpiOverlay');
  if (!overlay) return;
  const pedidos = _cgKpiPedidos(tipo).sort((a,b) => new Date(a.dataSolicitacao||0) - new Date(b.dataSolicitacao||0));
  overlay.innerHTML = `
    <div class="cg-rastreio-bg" onclick="_cgFecharListaKpi()"></div>
    <div class="cg-rastreio-painel">
      <div class="cg-rastreio-head">
        <h3>${_CG_KPI_TITULOS[tipo]||''} <span class="text-muted" style="font-size:1rem">(${pedidos.length})</span></h3>
        <button class="cg-rastreio-x" onclick="_cgFecharListaKpi()">✕</button>
      </div>
      ${pedidos.length === 0 ? '<p class="text-muted" style="padding:1rem">Nenhum pedido neste grupo.</p>' : `
      <div class="cg-kpi-lista">
        ${pedidos.map(p => `<div class="cg-kpi-item" onclick="_cgAbrirRastreio(${p.id})">
          <div class="cg-ki-top"><strong>#${p.id}</strong>${p.modelo?` · ${p.modelo}`:''} · ${p.placa||'—'} <span class="cg-ki-status">${_cgStatusPill(p)}</span></div>
          <div class="cg-ki-sub">${p.cliente||''} · ${p.cidadeOrigem||''} → ${p.cidadeDestino||''}</div>
          <div class="cg-ki-data">📅 Lançado: ${_dataLancamentoFmt(p)}${p.dataPrevEntrega||p.prazoEntregaEstimado?` · 🏁 Entrega: ${_cgFmtData(p.dataPrevEntrega||p.prazoEntregaEstimado)}`:''}</div>
        </div>`).join('')}
      </div>`}
      <div id="cgRastreioOverlay"></div>
    </div>`;
  overlay.classList.add('aberto');
}
function _cgFecharListaKpi(){
  const overlay = document.getElementById('cgKpiOverlay');
  if (overlay){ overlay.classList.remove('aberto'); overlay.innerHTML = ''; }
}

// Item 4 — clicar num corredor abre painel lateral com pedidos separados: aguardando x em viagem
function _cgPedidosDoCorredorSep(corredorId){
  const c = (corredoresGlobais||[]).find(x => String(x.id)===String(corredorId));
  if (!c) return { aguardando:[], emViagem:[], nome:'' };
  const seq = (c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino];
  const paradasStr = seq.filter(Boolean);
  const pedidos = (pedidosGlobais||[]).filter(p => {
    if (['Cancelado','Entregue'].includes(p.status||'')) return false;
    if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
    const partida = p.patioAtual || p.cidadeOrigem;
    const io = (typeof _posNaSeq === 'function') ? _posNaSeq(paradasStr, partida) : -1;
    const id = (typeof _posNaSeq === 'function') ? _posNaSeq(paradasStr, p.cidadeDestino) : -1;
    return (io !== -1 && id !== -1 && io < id);
  });
  const aguardando = [], emViagem = [];
  pedidos.forEach(p => {
    const st = statusPlanilhaDoPedido(p);
    if (st === 'Em transporte' || st === 'Transbordo') emViagem.push(p);
    else aguardando.push(p);
  });
  return { aguardando, emViagem, nome:c.nome };
}

function _cgAbrirCorredor(corredorId){
  const overlay = document.getElementById('cgKpiOverlay');
  if (!overlay) return;
  const { aguardando, emViagem, nome } = _cgPedidosDoCorredorSep(corredorId);
  const bloco = (titulo, cor, arr) => `
    <div class="cg-corr-sec">
      <div class="cg-corr-sec-tit" style="color:${cor}">${titulo} <span class="cg-corr-sec-num">${arr.length}</span></div>
      ${arr.length === 0 ? '<p class="text-muted" style="font-size:.82rem;padding:.3rem 0">Nenhum pedido.</p>' :
        arr.sort((a,b)=>new Date(a.dataSolicitacao||0)-new Date(b.dataSolicitacao||0)).map(p => `<div class="cg-kpi-item" onclick="_cgAbrirRastreio(${p.id})">
          <div class="cg-ki-top"><strong>#${p.id}</strong>${p.modelo?` · ${p.modelo}`:''} · ${p.placa||'—'} <span class="cg-ki-status">${_cgStatusPill(p)}</span></div>
          <div class="cg-ki-sub">${p.cliente||''} · ${p.cidadeOrigem||''} → ${p.cidadeDestino||''}</div>
          <div class="cg-ki-data">📅 Lançado: ${_dataLancamentoFmt(p)}${p.dataPrevEntrega||p.prazoEntregaEstimado?` · 🏁 Entrega: ${_cgFmtData(p.dataPrevEntrega||p.prazoEntregaEstimado)}`:''}</div>
        </div>`).join('')}
    </div>`;
  overlay.innerHTML = `
    <div class="cg-rastreio-bg" onclick="_cgFecharListaKpi()"></div>
    <div class="cg-rastreio-painel">
      <div class="cg-rastreio-head">
        <h3>📍 ${nome}</h3>
        <button class="cg-rastreio-x" onclick="_cgFecharListaKpi()">✕</button>
      </div>
      <p class="text-muted" style="font-size:.82rem;margin:-6px 0 14px">${aguardando.length + emViagem.length} pedido(s) neste corredor</p>
      ${bloco('🟠 Aguardando transporte', '#f59e0b', aguardando)}
      ${bloco('🔵 Em viagem', '#2563eb', emViagem)}
      <div id="cgRastreioOverlay"></div>
    </div>`;
  overlay.classList.add('aberto');
}

// ===== TELA 2 — PEDIDOS (comercial, só leitura) =====
let _cgPedidoFiltros = { pedido:'', cliente:'', placa:'', origem:'', destino:'', corredor:'', status:'', dataIni:'', dataFim:'', rota:'' };
let _cgPedidoPagina = 1;
const _CG_POR_PAGINA = 12;

// Descobre o corredor de um pedido (nome curto)
function _cgCorredorDoPedido(p){
  const cors = _cgCorredores();
  for (const c of cors){
    const seq = (c.corredor._paradas||[]).length >= 2 ? c.corredor._paradas.map(x=>x.cidade) : [c.corredor.origem, c.corredor.destino];
    const paradasStr = seq.filter(Boolean);
    if (p.corredorManualId && String(p.corredorManualId)===String(c.corredor.id)) return c.nome;
    const partida = p.patioAtual || p.cidadeOrigem;
    const io = (typeof _posNaSeq === 'function') ? _posNaSeq(paradasStr, partida) : -1;
    const id = (typeof _posNaSeq === 'function') ? _posNaSeq(paradasStr, p.cidadeDestino) : -1;
    if (io !== -1 && id !== -1 && io < id) return c.nome;
  }
  return '—';
}

function _cgPedidosFiltrados(){
  const f = _cgPedidoFiltros;
  return (pedidosGlobais||[]).filter(p => {
    if (['Cancelado'].includes(p.status||'')) return false;
    if (f.pedido){
      const termo = f.pedido.toLowerCase().trim();
      const alvo = `${p.id} ${p.referencia||''} ${p.solicitacao||''} ${p.requisicao||''}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    if (f.cliente && !(p.cliente||'').toLowerCase().includes(f.cliente.toLowerCase())) return false;
    if (f.placa && !(p.placa||'').toLowerCase().includes(f.placa.toLowerCase())) return false;
    if (f.origem && !_cidadeIgual(p.cidadeOrigem, f.origem)) return false;
    if (f.destino && !_cidadeIgual(p.cidadeDestino, f.destino)) return false;
    if (f.status){
      const st = statusPlanilhaDoPedido(p);
      if (f.status === 'entregue' && p.status !== 'Entregue') return false;
      if (f.status === 'viagem' && !(st === 'Em transporte' || st === 'Transbordo')) return false;
      if (f.status === 'aguardando' && !['Aguardando coleta','Não liberado','Enviado coleta','Coletado'].includes(st)) return false;
    }
    if (f.rota && String(p.rotaId||p.rota_id||'') !== f.rota) return false;
    // ---- Filtro de período ----
    // Antes: `(p.dataSolicitacao||'') < f.dataIni`. Um pedido SEM data de
    // solicitação virava string vazia, que é menor que qualquer data — e
    // sumia da lista sem explicação assim que alguém preenchia o "de".
    // Agora usamos a data de criação como reserva e normalizamos para
    // AAAA-MM-DD, para a comparação não depender do formato (com T, com
    // espaço, com ou sem hora).
    if (f.dataIni || f.dataFim) {
      const bruto = p.dataSolicitacao || p.createdAt || p.created_at || '';
      const dia = String(bruto).slice(0, 10);   // AAAA-MM-DD
      // Sem data alguma: não escondemos o pedido — melhor aparecer a mais
      // do que sumir sem o usuário entender por quê.
      if (dia.length === 10) {
        if (f.dataIni && dia < f.dataIni) return false;
        if (f.dataFim && dia > f.dataFim) return false;
      }
    }
    return true;
  });
}

function _cgStatusPill(p){
  // Cancelado mostra o motivo ao passar o mouse, e um resumo curto embaixo
  if (p && p.status === 'Cancelado'){
    const m = String(p.motivoCancelamento || 'motivo não informado');
    return `<span class="pill-cancelado" title="Cancelado${p.canceladoPor?' por '+p.canceladoPor:''}${p.canceladoEm?' em '+new Date(p.canceladoEm).toLocaleDateString('pt-BR'):''}: ${m.replace(/"/g,'&quot;')}">🚫 Cancelado</span>` +
           `<div class="pill-cancelado-motivo">${m.length > 38 ? m.slice(0,38)+'…' : m}</div>`;
  }
  return typeof _statusPillPlanilha === 'function' ? _statusPillPlanilha(p) : (statusPlanilhaDoPedido(p)||'—');
}

// Comercial aprova o pedido pelo rastreio
async function _aprovarPedidoComercial(pedidoId){
  if (typeof _aprovarPedido === 'function') await _aprovarPedido(pedidoId);
  _cgFecharRastreio();
  if (typeof renderizarComercialPedidos === 'function') renderizarComercialPedidos();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', `✅ Pedido #${pedidoId} aprovado.`, 'success');
}

// Grupos (carga fechada) expandidos na aba Pedidos
let _cgGruposAbertos = new Set();
function _cgToggleGrupo(gid){
  if (_cgGruposAbertos.has(String(gid))) _cgGruposAbertos.delete(String(gid));
  else _cgGruposAbertos.add(String(gid));
  renderizarComercialPedidos();
}

// Agrupa os pedidos filtrados: cargas fechadas (mesmo grupo_id, 2+) viram 1 item.
// Retorna lista de "itens": { tipo:'grupo', gid, itens } ou { tipo:'avulso', pedido }
function _cgAgrupar(lista){
  const grupos = {}; const ordem = []; const resultado = [];
  lista.forEach(p => {
    const gid = p.grupoId || p.grupo_id;
    if (gid){
      if (!grupos[gid]){ grupos[gid] = []; ordem.push(gid); }
      grupos[gid].push(p);
    } else {
      resultado.push({ tipo:'avulso', pedido:p, _ord: lista.indexOf(p) });
    }
  });
  ordem.forEach(gid => {
    const itens = grupos[gid];
    if (itens.length < 2){ resultado.push({ tipo:'avulso', pedido:itens[0], _ord: lista.indexOf(itens[0]) }); }
    else { resultado.push({ tipo:'grupo', gid, itens, _ord: lista.indexOf(itens[0]) }); }
  });
  // preserva a ordem original (pela posição do primeiro item)
  return resultado.sort((a,b)=>a._ord-b._ord);
}

// Rota + quando a viagem saiu. O comercial precisa responder "saiu quando?"
// sem abrir o pedido nem ligar para a logística.
function _cgRotaComInicio(rota){
  if (!rota) return '—';
  const nome = rota.nome || ('R-' + rota.id);
  if (!rota.iniciada_em){
    /* Sem data, mas já em andamento: são as viagens iniciadas pelo botão da
       tela de Viagens antes da correção, que gravava o status e esquecia o
       iniciada_em. Dizer "não iniciada" nessas é informação errada — o carro
       está na estrada. */
    if (rota.status === 'em_andamento' || rota.status === 'concluida')
      return `${nome}<div class="cg-rota-inicio cg-rota-semdata" title="A viagem saiu, mas a data de início não foi registrada">🛫 em viagem · data não registrada</div>`;
    return `${nome}<div class="cg-rota-inicio cg-rota-naoiniciada" title="A viagem ainda não saiu">🕗 não iniciada</div>`;
  }
  const d = new Date(rota.iniciada_em);
  return `${nome}<div class="cg-rota-inicio" title="Viagem iniciada em ${d.toLocaleString('pt-BR')}">🛫 ${d.toLocaleDateString('pt-BR')}</div>`;
}
window._cgRotaComInicio = _cgRotaComInicio;

function renderizarComercialPedidos(){
  const cont = document.getElementById('comercialPedidosConteudo');
  if (!cont) return;

  // Contorno enquanto os pedidos não chegam
  if (!window.__mmDadosCarregados && typeof mmSkeletonTabela === 'function'){
    mmSkeletonTabela(cont, { linhas: 8, colunas: 8 });
    if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => renderizarComercialPedidos());
    return;
  }
  const todosPedidos = _cgPedidosFiltrados();
  const itens = _cgAgrupar(todosPedidos);           // grupos + avulsos
  const totalPag = Math.max(1, Math.ceil(itens.length / _CG_POR_PAGINA));
  if (_cgPedidoPagina > totalPag) _cgPedidoPagina = 1;
  const ini = (_cgPedidoPagina-1)*_CG_POR_PAGINA;
  const pagina = itens.slice(ini, ini+_CG_POR_PAGINA);
  const todos = itens; // para o texto da paginação

  const cidades = [...new Set((pedidosGlobais||[]).flatMap(p => [p.cidadeOrigem, p.cidadeDestino]).filter(Boolean))].sort();
  const rotas = (rotasGlobais||[]).filter(r => {
    if (!['planejada','em_andamento'].includes(r.status)) return false;
    // só rotas que têm ao menos 1 carro vinculado (evita listar rotas vazias)
    return (pedidosGlobais||[]).some(p => String(p.rotaId||p.rota_id) === String(r.id));
  });

  cont.innerHTML = `
    <div class="cg-header">
      <h2>📋 Pedidos</h2>
      <button class="btn btn-secondary btn-sm" onclick="renderizarComercialPedidos()">🔄 Atualizar</button>
    </div>

    <div class="cg-filtros">
      <div class="cg-filtro"><label>Pedido / ID / Ref.</label><input type="text" value="${_cgPedidoFiltros.pedido}" oninput="var _v=this.value; _mmDeb('cgFiltro_pedido', function(){ _cgSetFiltro('pedido', _v); })" placeholder="Nº, ID, solicitação ou requisição"></div>
      <div class="cg-filtro"><label>Cliente</label><input type="text" value="${_cgPedidoFiltros.cliente}" oninput="var _v=this.value; _mmDeb('cgFiltro_cliente', function(){ _cgSetFiltro('cliente', _v); })" placeholder="Nome do cliente"></div>
      <div class="cg-filtro"><label>Placa</label><input type="text" value="${_cgPedidoFiltros.placa}" oninput="var _v=this.value; _mmDeb('cgFiltro_placa', function(){ _cgSetFiltro('placa', _v); })" placeholder="Placa do veículo"></div>
      <div class="cg-filtro"><label>Origem</label><select onchange="_cgSetFiltro('origem',this.value)"><option value="">Todas</option>${cidades.map(c=>`<option ${_cgPedidoFiltros.origem===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="cg-filtro"><label>Destino</label><select onchange="_cgSetFiltro('destino',this.value)"><option value="">Todos</option>${cidades.map(c=>`<option ${_cgPedidoFiltros.destino===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="cg-filtro"><label>Status</label><select onchange="_cgSetFiltro('status',this.value)">
        <option value="">Todos</option>
        <option value="aguardando" ${_cgPedidoFiltros.status==='aguardando'?'selected':''}>Aguardando</option>
        <option value="viagem" ${_cgPedidoFiltros.status==='viagem'?'selected':''}>Em viagem</option>
        <option value="entregue" ${_cgPedidoFiltros.status==='entregue'?'selected':''}>Chegou ao destino</option>
      </select></div>
      <div class="cg-filtro"><label>Rota</label><select onchange="_cgSetFiltro('rota',this.value)"><option value="">Todas</option>${rotas.map(r=>`<option value="${r.id}" ${_cgPedidoFiltros.rota===String(r.id)?'selected':''}>${r.nome||('R-'+r.id)}</option>`).join('')}</select></div>
      <div class="cg-filtro"><label>Período (de)</label><input type="date" value="${_cgPedidoFiltros.dataIni||''}" onchange="_cgSetFiltro('dataIni', this.value)"></div>
      <div class="cg-filtro"><label>Período (até)</label><input type="date" value="${_cgPedidoFiltros.dataFim||''}" onchange="_cgSetFiltro('dataFim', this.value)"></div>
      <div class="cg-filtro cg-filtro-btns">
        <button class="btn btn-secondary btn-sm" onclick="_cgPeriodoRapido(0)" title="Somente hoje">Hoje</button>
        <button class="btn btn-secondary btn-sm" onclick="_cgPeriodoRapido(7)">7 dias</button>
        <button class="btn btn-secondary btn-sm" onclick="_cgPeriodoRapido(30)">30 dias</button>
        <button class="btn btn-secondary btn-sm" onclick="_cgLimparFiltros()">Limpar</button>
      </div>
    </div>

    <div class="cg-tabela-wrap">
      <table class="cg-tabela">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Veículo</th><th>Origem</th><th>Destino</th><th>Corredor</th><th>Rota</th><th>Status</th><th>Lançado</th><th>Ações</th></tr></thead>
        <tbody>
          ${pagina.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af">Nenhum pedido encontrado.</td></tr>' :
            pagina.map(item => {
              if (item.tipo === 'avulso'){
                const p = item.pedido;
                const rota = (rotasGlobais||[]).find(r => String(r.id)===String(p.rotaId||p.rota_id));
                return `<tr class="cg-tr" onclick="_cgAbrirRastreio(${p.id})">
                <td><strong>#${p.id}</strong></td>
                <td>${p.cliente||'—'}</td>
                <td>${p.modelo?`<div style="font-weight:600;font-size:.82rem">${p.modelo}</div>`:''}<span style="color:${p.modelo?'#9ca3af':'inherit'};font-size:${p.modelo?'.8rem':'inherit'}">${p.placa||'—'}</span>${p.referencia?` <span style="color:#f59e0b;font-size:.72rem">🏷️ ${p.referencia}</span>`:''} ${_selosPedidoHTML(p)}</td>
                <td>${p.cidadeOrigem||'—'}</td>
                <td>${p.cidadeDestino||'—'}</td>
                <td class="cg-corr-cel">${_cgCorredorDoPedido(p)}</td>
                <td>${_cgRotaComInicio(rota)}</td>
                <td>${_cgStatusPill(p)}</td>
                <td class="cg-sub">${_dataLancamentoFmt(p)}</td>
                <td class="cg-acoes-cel" onclick="event.stopPropagation()">
                  <button class="cg-acao-mini" onclick="abrirEdicaoPedido(${p.id})" title="Editar">✏️</button>
                  <button class="cg-acao-mini" onclick="abrirHistorico(${p.id})" title="Histórico">📜</button>
                  <button class="cg-acao-mini cg-acao-mini-del" onclick="excluirPedido(${p.id})" title="Excluir">🗑️</button>
                </td>
              </tr>`;
              }
              // ---- GRUPO (carga fechada) ----
              const itens = item.itens;
              const p0 = itens[0];
              const aberto = _cgGruposAbertos.has(String(item.gid));
              const rota0 = (rotasGlobais||[]).find(r => String(r.id)===String(p0.rotaId||p0.rota_id));
              const ref = p0.referencia ? ` · 🔖 ${p0.referencia}` : '';
              const linhaMestre = `<tr class="cg-tr cg-tr-grupo" onclick="_cgToggleGrupo('${String(item.gid).replace(/'/g,"\\'")}')">
                <td><strong>${aberto?'▾':'▸'} 📦 ${itens.length} carros</strong></td>
                <td>${p0.cliente||'—'}</td>
                <td><span class="cg-sub">carga fechada${ref}</span></td>
                <td>${p0.cidadeOrigem||'—'}</td>
                <td>${p0.cidadeDestino||'—'}</td>
                <td class="cg-corr-cel">${_cgCorredorDoPedido(p0)}</td>
                <td>${_cgRotaComInicio(rota0)}</td>
                <td><span class="cg-sub">${itens.length} veíc.</span></td>
                <td class="cg-sub">${_dataLancamentoFmt(p0)}</td>
                <td class="cg-acoes-cel"></td>
              </tr>`;
              const filhas = !aberto ? '' : itens.map(p => {
                const rota = (rotasGlobais||[]).find(r => String(r.id)===String(p.rotaId||p.rota_id));
                return `<tr class="cg-tr cg-tr-filho" onclick="_cgAbrirRastreio(${p.id})">
                  <td style="padding-left:1.6rem"><strong>#${p.id}</strong></td>
                  <td>${p.cliente||'—'}</td>
                  <td>${p.modelo?`<div style="font-weight:600;font-size:.82rem">${p.modelo}</div>`:''}<span style="color:${p.modelo?'#9ca3af':'inherit'};font-size:${p.modelo?'.8rem':'inherit'}">${p.placa||'—'}</span>${p.referencia?` <span style="color:#f59e0b;font-size:.72rem">🏷️ ${p.referencia}</span>`:''} ${_selosPedidoHTML(p)}</td>
                  <td>${p.cidadeOrigem||'—'}</td>
                  <td>${p.cidadeDestino||'—'}</td>
                  <td class="cg-corr-cel">${_cgCorredorDoPedido(p)}</td>
                  <td>${rota ? (rota.nome||('R-'+rota.id)) : '—'}</td>
                  <td>${_cgStatusPill(p)}</td>
                  <td class="cg-sub">${_dataLancamentoFmt(p)}</td>
                  <td class="cg-acoes-cel" onclick="event.stopPropagation()">
                    <button class="cg-acao-mini" onclick="abrirEdicaoPedido(${p.id})" title="Editar">✏️</button>
                    <button class="cg-acao-mini" onclick="abrirHistorico(${p.id})" title="Histórico">📜</button>
                    <button class="cg-acao-mini cg-acao-mini-del" onclick="excluirPedido(${p.id})" title="Excluir">🗑️</button>
                  </td>
                </tr>`;
              }).join('');
              return linhaMestre + filhas;
            }).join('')}
        </tbody>
      </table>
    </div>

    <div class="cg-paginacao">
      <span class="cg-sub">Mostrando ${todos.length===0?0:ini+1} a ${Math.min(ini+_CG_POR_PAGINA,todos.length)} de ${todos.length} cargas/pedidos</span>
      <div class="cg-pag-btns">
        <button ${_cgPedidoPagina<=1?'disabled':''} onclick="_cgPagina(${_cgPedidoPagina-1})">‹</button>
        <span class="cg-pag-atual">${_cgPedidoPagina} / ${totalPag}</span>
        <button ${_cgPedidoPagina>=totalPag?'disabled':''} onclick="_cgPagina(${_cgPedidoPagina+1})">›</button>
      </div>
    </div>

    <div id="cgRastreioOverlay"></div>`;
}

function _cgSetFiltro(campo, valor){
  _cgPedidoFiltros[campo] = valor;
  _cgPedidoPagina = 1;
  // guarda qual filtro está sendo editado e a posição do cursor
  const ativo = document.activeElement;
  const ehInputFiltro = ativo && ativo.closest && ativo.closest('.cg-filtro');
  const pos = ativo && typeof ativo.selectionStart === 'number' ? ativo.selectionStart : null;
  renderizarComercialPedidos();
  // restaura o foco no mesmo campo (a tela foi redesenhada)
  if (ehInputFiltro){
    // acha o mesmo campo pelo texto do label
    const labels = document.querySelectorAll('.cg-filtro');
    for (const lab of labels){
      const inp = lab.querySelector('input');
      if (inp && inp.getAttribute('oninput') && inp.getAttribute('oninput').includes(`'${campo}'`)){
        inp.focus();
        if (pos !== null){ try { inp.setSelectionRange(pos, pos); } catch(e){} }
        break;
      }
    }
  }
}
// Atalhos de período. dias=0 significa só hoje.
function _cgPeriodoRapido(dias){
  const hoje = new Date();
  const ini = new Date(hoje);
  ini.setDate(ini.getDate() - (Number(dias)||0));
  const iso = (d) => d.toISOString().slice(0,10);
  _cgPedidoFiltros.dataIni = iso(ini);
  _cgPedidoFiltros.dataFim = iso(hoje);
  _cgPedidoPagina = 1;
  renderizarComercialPedidos();
}

function _cgLimparFiltros(){ _cgPedidoFiltros = { pedido:'', cliente:'', placa:'', origem:'', destino:'', corredor:'', status:'', dataIni:'', dataFim:'', rota:'' }; _cgPedidoPagina = 1; renderizarComercialPedidos(); }
function _cgPagina(n){ _cgPedidoPagina = n; renderizarComercialPedidos(); }
function _cgFmtData(d){ if(!d) return '—'; try { return new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch(e){ return d; } }

// Painel lateral de RASTREIO (só leitura) — usa os eventos reais da jornada
async function _cgAbrirRastreio(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(p.rotaId||p.rota_id));
  // Overlay ÚNICO dedicado no body (evita conflito de IDs duplicados e z-index de painéis).
  let overlay = document.getElementById('cgRastreioOverlayGlobal');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'cgRastreioOverlayGlobal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100050;pointer-events:none';
    document.body.appendChild(overlay);
  }
  overlay.style.pointerEvents = 'auto';
  if (!overlay) return;

  // busca o histórico real do banco
  let hist = [];
  try {
    const { data } = await supabase.from('historico_status').select('*').eq('pedido_id', parseInt(pedidoId)).order('created_at', { ascending: true });
    hist = data || [];
  } catch(e){ hist = []; }

  // Na timeline do rastreio mostramos só os eventos de OPERAÇÃO (mudanças de status).
  // Os eventos de edição/auditoria (✏️ editado, solicitações etc.) ficam no botão 📜 Histórico.
  const histOperacao = hist.filter(h => {
    const obs = h.observacao || '';
    const ehEdicao = obs.startsWith('✏️') || (h.status_anterior && h.status_novo && h.status_anterior === h.status_novo);
    return !ehEdicao;
  });

  overlay.innerHTML = `
    <div class="cg-rastreio-bg" onclick="_cgFecharRastreio()"></div>
    <div class="cg-rastreio-painel">
      <div class="cg-rastreio-head">
        <h3>Pedido #${p.id} ${_selosPedidoHTML(p)}</h3>
        <div style="display:flex;gap:8px;align-items:center">${_cgStatusPill(p)}<button class="cg-rastreio-x" onclick="_cgFecharRastreio()">✕</button></div>
      </div>
      <div class="cg-rastreio-acoes">
        <button class="cg-acao-btn" onclick="abrirEdicaoPedido(${p.id})">✏️ Editar</button>
        <button class="cg-acao-btn" onclick="abrirHistorico(${p.id})">📜 Histórico</button>
        <button class="cg-acao-btn" onclick="abrirTrajetoriaPedido(${p.id})" title="Por onde o pedido passou, caminhão e motorista de cada trecho">🗺️ Trajetória</button>
        <button class="cg-acao-btn cg-acao-del" onclick="excluirPedido(${p.id})">🗑️ Excluir</button>
      </div>
      <div class="cg-rastreio-dados">
        <div><span class="cg-rd-lbl">🚗 Veículo</span><span class="cg-rd-val">${p.placa||'—'} ${p.modelo?('· '+p.modelo):''}</span></div>
        <div><span class="cg-rd-lbl">📍 Corredor</span><span class="cg-rd-val">${_cgCorredorDoPedido(p)}</span></div>
        <div><span class="cg-rd-lbl">🛣️ Rota</span><span class="cg-rd-val">${rota?(rota.nome||('R-'+rota.id)):'—'}</span></div>
        <div><span class="cg-rd-lbl">👤 Motorista</span><span class="cg-rd-val">${p.motorista1||'—'}</span></div>
        <div><span class="cg-rd-lbl">Origem</span><span class="cg-rd-val">${p.cidadeOrigem||'—'}/${p.ufOrigem||''}</span></div>
        <div><span class="cg-rd-lbl">Destino</span><span class="cg-rd-val">${p.cidadeDestino||'—'}/${p.ufDestino||''}</span></div>
        <div><span class="cg-rd-lbl">💰 Valor do frete</span><span class="cg-rd-val" style="color:#4ade80;font-weight:700">${
          (p.valorFrete != null && p.valorFrete !== '')
            ? 'R$ ' + Number(p.valorFrete).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : '—'
        }</span></div>
      </div>

      ${p.observacaoPedido ? `<div style="margin:12px 0;padding:12px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);border-radius:10px;font-size:.88rem;color:#f59e0b"><strong>📝 Observação:</strong> <span style="color:inherit">${p.observacaoPedido}</span></div>` : ''}
      ${p.aprovado === false ? `<div style="margin:12px 0;padding:12px;border-radius:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35)">
        <div style="font-size:.85rem;margin-bottom:8px">⏳ Este pedido está <strong>aguardando aprovação</strong>. Aprove para liberá-lo ao planejamento.</div>
        <button class="btn btn-primary btn-sm" style="background:#22c55e" onclick="_aprovarPedidoComercial(${p.id})">✅ Aprovar pedido</button>
      </div>` : ''}

      ${(() => {
        const _r = (rotasGlobais||[]).find(r => String(r.id)===String(p.rotaId||p.rota_id));
        if (!_r) return '';
        return `<div class="cg-info-viagem">🚛 <strong>${_r.nome||('R-'+_r.id)}</strong> · ${
          _r.iniciada_em
            ? `🛫 iniciada em <strong>${new Date(_r.iniciada_em).toLocaleString('pt-BR')}</strong>`
            : '<span class="cg-rota-naoiniciada">🕗 viagem ainda não iniciada</span>'}</div>`;
      })()}

      ${!['Entregue','Cancelado','Ocorrência'].includes(p.status) ? `<div class="cg-acoes-rapidas">
        <button class="btn btn-sm btn-secondary" onclick="_abrirModalAlterarDestino(${p.id}, (rotasGlobais||[]).find(r=>String(r.id)===String(${p.rotaId||p.rota_id||0})))">📍 Alterar destino</button>
      </div>` : ''}

      ${p.status === 'Cancelado' ? `<div class="cg-canc-bloco">
        <div class="cg-canc-tit">🚫 Pedido cancelado</div>
        <div class="cg-canc-motivo">${p.motivoCancelamento || 'Motivo não informado.'}</div>
        <div class="cg-canc-meta">${p.canceladoPor ? 'por ' + p.canceladoPor : ''}${p.canceladoEm ? ' em ' + new Date(p.canceladoEm).toLocaleString('pt-BR') : ''}${p.statusAntesCancelar ? ' · estava em ' + p.statusAntesCancelar : ''}</div>
      </div>` : ''}

      ${p.status === 'Ocorrência' ? `<div class="cg-ocor-bloco">
        <div class="cg-ocor-tit">⚠️ Pedido parado por ocorrência</div>
        <div class="cg-ocor-txt">
          O carro foi retirado da viagem e está fora do planejamento${p.patioAtual?` — consta em <strong>${p.patioAtual}</strong>`:''}.
          Resolvido o problema, devolva-o ao fluxo escolhendo o corredor da próxima perna.
        </div>
        <button class="btn btn-sm" style="background:#22c55e;color:#08130c;font-weight:700" onclick="_reverterOcorrencia(${p.id})">↩️ Reverter ocorrência e devolver ao fluxo</button>
      </div>` : ''}

      ${(p.qtdTransbordos>0 || p.aguardandoTransbordo || p.status==='Transbordo') ? `<div style="margin:12px 0;padding:12px;border-radius:10px;background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.3)">
        <div style="font-size:.85rem;margin-bottom:8px;color:#fb923c">🔀 Este pedido está marcado como <strong>transbordo</strong>${p.cidadeTransbordo?` em ${p.cidadeTransbordo}`:''}. Se foi por engano, desfaça abaixo.</div>
        <button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.4)" onclick="_desfazerTransbordo(${p.id})">↩️ Não é transbordo (desfazer)</button>
      </div>` : ''}

      ${(p.qtdTransbordos>0 || p.aguardandoTransbordo) ? `<div class="cg-rastreio-tit">🚚 Jornada do veículo</div>${_linhaDoTempoPedidoHTML(p)}${p.aguardandoTransbordo?'<p style="font-size:.8rem;color:#a855f7;margin:4px 0 0">🟣 Aguardando transbordo — o veículo está no pátio aguardando a próxima etapa do transporte.</p>':''}` : ''}

      <div class="cg-rastreio-tit">📍 Histórico da viagem</div>
      <div class="cg-timeline">
        ${histOperacao.length === 0 ? '<p class="text-muted" style="font-size:.85rem">Ainda sem eventos de operação registrados para este pedido.</p>' :
          histOperacao.map((h,i) => {
            const ultimo = i === histOperacao.length-1;
            return `<div class="cg-tl-item ${ultimo?'atual':''}">
              <div class="cg-tl-marker"></div>
              <div class="cg-tl-conteudo">
                <div class="cg-tl-data">${_cgFmtData(h.created_at||h.data)}</div>
                <div class="cg-tl-status">${h.status_novo||'—'}</div>
                ${h.observacao?`<div class="cg-tl-obs">${h.observacao}</div>`:''}
                ${h.usuario_nome?`<div class="cg-tl-quem">por ${h.usuario_nome}</div>`:''}
              </div>
            </div>`;
          }).join('')}
      </div>

      <div class="cg-rastreio-status">
        <div class="cg-rs-lbl">Status atual</div>
        <div class="cg-rs-val">${_cgStatusPill(p)}</div>
      </div>
    </div>`;
  overlay.classList.add('aberto');
}
function _cgFecharRastreio(){
  const g = document.getElementById('cgRastreioOverlayGlobal');
  if (g){ g.classList.remove('aberto'); g.innerHTML = ''; g.style.pointerEvents = 'none'; }
  const overlay = document.getElementById('cgRastreioOverlay');
  if (overlay){ overlay.classList.remove('aberto'); overlay.innerHTML = ''; }
}
// ===== TELA 3 — VIAGENS (comercial, só leitura) =====
let _cgViagemFiltroStatus = 'todas';
let _cgViagemFiltroCorredor = '';
let _cgViagemSel = null;

function renderizarComercialViagens(){
  const cont = document.getElementById('comercialViagensConteudo');
  if (!cont) return;

  // ATIVAS = em andamento + planejadas (concluídas saem daqui)
  let viagens = (rotasGlobais||[]).filter(r => ['em_andamento','planejada'].includes(r.status));
  if (_cgViagemFiltroStatus === 'andamento') viagens = viagens.filter(r => r.status === 'em_andamento');
  else if (_cgViagemFiltroStatus === 'planejada') viagens = viagens.filter(r => r.status === 'planejada');
  if (_cgViagemFiltroCorredor) viagens = viagens.filter(r => String(r.corredor_id)===String(_cgViagemFiltroCorredor));

  viagens.sort((a,b) => (a.status==='em_andamento'?0:1) - (b.status==='em_andamento'?0:1));

  const corredores = corredoresGlobais || [];

  cont.innerHTML = `
    <div class="cg-header">
      <h2>🚛 Viagens</h2>
      <button class="btn btn-secondary btn-sm" onclick="renderizarComercialViagens()">🔄 Atualizar</button>
    </div>

    <div class="cg-filtros" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <div class="cg-filtro"><label>Status</label><select onchange="_cgViagemSetStatus(this.value)">
        <option value="todas" ${_cgViagemFiltroStatus==='todas'?'selected':''}>Ativas (todas)</option>
        <option value="andamento" ${_cgViagemFiltroStatus==='andamento'?'selected':''}>Em andamento</option>
        <option value="planejada" ${_cgViagemFiltroStatus==='planejada'?'selected':''}>Planejadas</option>
      </select></div>
      <div class="cg-filtro"><label>Corredor</label><select onchange="_cgViagemSetCorredor(this.value)">
        <option value="">Todos</option>
        ${corredores.map(c=>`<option value="${c.id}" ${String(_cgViagemFiltroCorredor)===String(c.id)?'selected':''}>${c.nome}</option>`).join('')}
      </select></div>
    </div>

    ${viagens.length === 0 ? '<p class="text-muted" style="padding:2rem;text-align:center">Nenhuma viagem ativa no momento.</p>' : `
    <div class="cg-viagens-cards">
      ${viagens.map(r => {
        const np = _veiculosNaRota(r.id).length;
        const cor = corredores.find(c => String(c.id)===String(r.corredor_id));
        const stInfo = _cgViagemStatusInfo(r.status);
        // status de emissão de CTe da carga
        const pedsViagem = _pedidosHistoricoDaViagem(r.id).filter(x => x.status !== 'Cancelado');
        const comCte = pedsViagem.filter(x => x.numeroCte).length;
        const cteBadge = pedsViagem.length > 0
          ? (comCte === pedsViagem.length
              ? '<span class="cg-cte-badge cte-ok">🧾 CTe completo</span>'
              : (comCte > 0
                  ? `<span class="cg-cte-badge cte-parcial">🧾 CTe ${comCte}/${pedsViagem.length}</span>`
                  : '<span class="cg-cte-badge cte-pend">🧾 CTe pendente</span>'))
          : '';
        return `<div class="cg-viagem-card" onclick="_cgSelViagem(${r.id})">
          <div class="cg-vc-top"><span class="cg-vc-rota">${r.nome||('R-'+r.id)}</span><span class="cg-badge" style="background:${stInfo.bg};color:${stInfo.cor}">${stInfo.label}</span></div>
          <div class="cg-vc-corr">${cor?cor.nome:'—'}</div>
          <div class="cg-vc-info">
            <span>👤 ${r.motorista_1||'—'}</span>
            <span>🚛 ${np} pedido(s)</span>
          </div>
          <div class="cg-vc-data">${r.iniciada_em
            ? `🛫 Saiu em <strong>${new Date(r.iniciada_em).toLocaleDateString('pt-BR')}</strong> às ${new Date(r.iniciada_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`
            : '<span class="cg-vc-data-pend">🕗 Ainda não iniciada</span>'}</div>
          <div class="cg-vc-selos">${cteBadge}</div>
          ${r.placa_cegonha?`<div class="cg-vc-cegonha">${r.placa_cegonha}</div>`:''}
        </div>`;
      }).join('')}
    </div>`}

    ${_cgViagensConcluidasHTML()}
    <div id="cgViagemOverlay"></div>`;
}

// Consulta de viagens CONCLUÍDAS por período (recolhível, não polui a tela)
let _cgConcluidasAberto = false;
let _cgConcluidasIni = '';
let _cgConcluidasFim = '';
function _cgViagensConcluidasHTML(){
  const concluidas = (rotasGlobais||[]).filter(r => r.status === 'concluida').filter(r => {
    const dt = (r.concluida_em || r.updated_at || '').slice(0,10);
    if (_cgConcluidasIni && dt && dt < _cgConcluidasIni) return false;
    if (_cgConcluidasFim && dt && dt > _cgConcluidasFim) return false;
    return true;
  }).sort((a,b) => new Date(b.concluida_em||b.updated_at||0) - new Date(a.concluida_em||a.updated_at||0));

  return `<div class="cg-concluidas">
    <div class="cg-concluidas-head" onclick="_cgToggleConcluidas()">
      <span>✅ Viagens concluídas ${!_cgConcluidasAberto?`<span class="cg-conc-badge">${concluidas.length}</span>`:''}</span>
      <span>${_cgConcluidasAberto?'▲':'▼'}</span>
    </div>
    ${!_cgConcluidasAberto ? '' : `
      <div class="cg-conc-filtros">
        <div class="cg-filtro"><label>De</label><input type="date" value="${_cgConcluidasIni}" onchange="_cgConcluidasSetData('ini',this.value)"></div>
        <div class="cg-filtro"><label>Até</label><input type="date" value="${_cgConcluidasFim}" onchange="_cgConcluidasSetData('fim',this.value)"></div>
        <div class="cg-filtro cg-filtro-btns"><button class="btn btn-secondary btn-sm" onclick="_cgConcluidasLimpar()">Limpar</button></div>
      </div>
      ${concluidas.length === 0 ? '<p class="text-muted" style="padding:1rem;font-size:.85rem">Nenhuma viagem concluída no período.</p>' : `
      <div class="cg-tabela-wrap">
        <table class="cg-tabela">
          <thead><tr><th>Rota</th><th>Corredor</th><th>Motorista</th><th>Pedidos</th><th>Iniciada em</th><th>Concluída em</th></tr></thead>
          <tbody>
            ${concluidas.map(r => {
              const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(r.corredor_id));
              const np = _veiculosNaRota(r.id).length;
              return `<tr class="cg-tr" onclick="_cgSelViagem(${r.id})">
                <td><strong>${r.nome||('R-'+r.id)}</strong></td>
                <td>${cor?cor.nome:'—'}</td>
                <td>${r.motorista_1||'—'}</td>
                <td>${np}</td>
                <td class="cg-sub">${r.iniciada_em ? _cgFmtData(r.iniciada_em) : '—'}</td>
                <td class="cg-sub">${_cgFmtData(r.concluida_em||r.updated_at)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    `}
  </div>`;
}
function _cgToggleConcluidas(){ _cgConcluidasAberto = !_cgConcluidasAberto; renderizarComercialViagens(); }
function _cgConcluidasSetData(campo, v){ if(campo==='ini') _cgConcluidasIni=v; else _cgConcluidasFim=v; renderizarComercialViagens(); }
function _cgConcluidasLimpar(){ _cgConcluidasIni=''; _cgConcluidasFim=''; renderizarComercialViagens(); }

function _cgViagemStatusInfo(st){
  if (st === 'em_andamento') return { label:'Em viagem', cor:'#2563eb', bg:'rgba(37,99,235,.15)' };
  if (st === 'concluida') return { label:'Concluída', cor:'#22c55e', bg:'rgba(34,197,94,.15)' };
  if (st === 'planejada') return { label:'Planejada', cor:'#f59e0b', bg:'rgba(245,158,11,.15)' };
  return { label:st||'—', cor:'#9ca3af', bg:'rgba(255,255,255,.08)' };
}

function _cgViagemDetalheHTML(rota){
  if (!rota) return '';
  // usa o vínculo histórico: mostra todos os pedidos que fizeram parte (mesmo transbordados)
  const carros = _pedidosHistoricoDaViagem(rota.id);
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(rota.corredor_id));
  const stInfo = _cgViagemStatusInfo(rota.status);
  return `
    <div class="cg-rastreio-bg" onclick="_cgFecharViagem()"></div>
    <div class="cg-rastreio-painel">
      <div class="cg-rastreio-head">
        <h3>${rota.nome||('R-'+rota.id)}</h3>
        <div style="display:flex;gap:8px;align-items:center"><span class="cg-badge" style="background:${stInfo.bg};color:${stInfo.cor}">${stInfo.label}</span><button class="cg-rastreio-x" onclick="_cgFecharViagem()">✕</button></div>
      </div>
      <div class="cg-rastreio-dados">
        <div><span class="cg-rd-lbl">📍 Corredor</span><span class="cg-rd-val">${cor?cor.nome:'—'}</span></div>
        <div><span class="cg-rd-lbl">👤 Motorista</span><span class="cg-rd-val">${rota.motorista_1||'—'}</span></div>
        <div><span class="cg-rd-lbl">🚛 Cegonha</span><span class="cg-rd-val">${rota.placa_cegonha||'—'}</span></div>
        <div><span class="cg-rd-lbl">📦 Pedidos</span><span class="cg-rd-val">${carros.length}</span></div>
        ${rota.iniciada_em ? `<div style="grid-column:1/-1"><span class="cg-rd-lbl">🕐 Viagem iniciada em</span><span class="cg-rd-val">${_cgFmtData(rota.iniciada_em)}</span></div>` : ''}
      </div>

      <div class="cg-rastreio-tit">📋 Pedidos desta viagem</div>
      ${carros.length === 0 ? '<p class="text-muted" style="font-size:.85rem">Nenhum pedido nesta viagem.</p>' : `
      <div class="cg-tabela-wrap">
        <table class="cg-tabela" style="min-width:0">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Veículo</th><th>Destino</th><th>Lançado</th><th>CTe</th><th>Status</th></tr></thead>
          <tbody>
            ${carros.map(p => {
              const v = _vinculoViagemPedido(rota.id, p.id);
              const transbordou = v && v.saiu_em;
              return `<tr class="cg-tr" onclick="_cgAbrirRastreio(${p.id})">
              <td><strong>#${p.id}</strong></td>
              <td>${p.cliente||'—'}</td>
              <td>${p.placa||'—'}</td>
              <td>${p.cidadeDestino||'—'}</td>
              <td class="cg-sub" style="white-space:nowrap">${_dataLancamentoFmt(p)}</td>
              <td>${p.numeroCte?`<span style="color:#22c55e;font-size:.75rem;white-space:nowrap">🧾 ${p.numeroCte}</span>`:'<span class="text-muted" style="font-size:.72rem">—</span>'}</td>
              <td>${transbordou ? (() => {
                // mesma correção da tabela de carga: diz ONDE o carro saiu
                const onde = v.cidade_transbordo || p.cidadeTransbordo || '';
                return `<span style="color:#a855f7;font-size:.75rem" title="${v.motivo_saida||'transbordo'}">🔀 saiu${onde?` em ${String(onde).split('/')[0]}`:' da carga'}</span>`;
              })() : _cgStatusPill(p)}</td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
      <div id="cgRastreioOverlay"></div>
    </div>`;
}

function _cgViagemSetStatus(v){ _cgViagemFiltroStatus = v; _cgViagemSel = null; renderizarComercialViagens(); }
function _cgViagemSetCorredor(v){ _cgViagemFiltroCorredor = v; _cgViagemSel = null; renderizarComercialViagens(); }
function _cgSelViagem(id){
  _cgViagemSel = id;
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(id));
  const overlay = document.getElementById('cgViagemOverlay');
  if (overlay && rota){ overlay.innerHTML = _cgViagemDetalheHTML(rota); overlay.classList.add('aberto'); }
}
function _cgFecharViagem(){
  const overlay = document.getElementById('cgViagemOverlay');
  if (overlay){ overlay.classList.remove('aberto'); overlay.innerHTML = ''; }
  _cgViagemSel = null;
}


/* =========================================================================
   CENTRAL DE OPERAÇÕES — ajustes
   ========================================================================= */

// Data em que o pedido foi lançado (item pedido pela operação)
function _centralDataLancamento(p){
  const bruto = p.dataSolicitacao || p.createdAt || p.created_at;
  if (!bruto) return '';
  const d = new Date(bruto);
  if (isNaN(d)) return '';
  return `<div class="central-card-data">📅 Lançado em ${d.toLocaleDateString('pt-BR')}</div>`;
}

/* Entregas agrupadas POR VIAGEM.
   Antes era uma lista solta de carros: com 3 cargas na rua (7 + 11 + 3
   carros) viravam 21 cartões sem dizer de quem era cada um. Agrupando pela
   viagem, a logística vê "carga do Claudemir — 7 carros" e decide de uma
   vez, ou abre e escolhe carro a carro. */
function _centralEntregasPorViagem(entregas){
  const grupos = {};
  entregas.forEach(p => {
    const chave = p.rotaId || p.rota_id || 'sem-viagem';
    (grupos[chave] = grupos[chave] || []).push(p);
  });

  return `<div class="central-viagens">` + Object.keys(grupos).map(chave => {
    const itens = grupos[chave];
    const r = (rotasGlobais||[]).find(x => String(x.id) === String(chave));
    const motorista = r?.motorista_1 || itens[0]?.motorista1 || 'sem motorista';
    const cegonha   = r?.placa_cegonha || itens[0]?.placaCegonha || '—';
    const titulo    = chave === 'sem-viagem' ? 'Sem viagem vinculada' : (r?.nome || ('Viagem #' + chave));
    const ids       = itens.map(p => p.id);
    // Corredor e rota são coisas diferentes: o corredor é o eixo planejado
    // (Cascavel x Foz), a rota é a viagem real que esse carro pegou. Mostrar
    // só um dos dois deixava quem olha sem saber por onde o carro andou.
    const _corId = itens[0]?.corredorManualId || r?.corredor_id || null;
    const _cor = _corId ? (corredoresGlobais||[]).find(c => String(c.id)===String(_corId)) : null;
    const _trajeto = r ? [r.origem, r.destino].filter(Boolean).join(' → ') : '';

    return `<div class="central-viagem-bloco">
      <div class="central-viagem-cab" onclick="this.parentNode.classList.toggle('aberto')">
        <span class="cvb-seta">▸</span>
        <div class="cvb-info">
          <div class="cvb-tit">👤 ${motorista}</div>
          <div class="cvb-sub">🚛 ${cegonha} · ${itens.length} carro(s) · ${titulo}</div>
          <div class="cvb-sub cvb-sub-rota">
            ${_trajeto ? `<span class="cvb-chip-rota">🛣️ ${_trajeto}</span>` : ''}
            ${_cor ? `<span class="cvb-chip-corredor">🧭 ${_cor.nome}</span>` : ''}
          </div>
          ${_centralInicioViagem(r)}
        </div>
        <div class="cvb-acoes" onclick="event.stopPropagation()">
          <button class="central-btn-mini" onclick="_centralModalMotorista([${ids.join(',')}])" title="Direcionar a carga toda para um motorista">👤 Todos</button>
          <button class="central-btn-mini" onclick="_centralModalEquipeEntrega([${ids.join(',')}])" title="Direcionar a carga toda para uma equipe">👥 Todos</button>
        </div>
      </div>
      <div class="central-viagem-itens">
        ${itens.map(p => { const _tag = _centralTagDirecionado(p, 'entrega'); return `<div class="cvb-item ${_tag?'cvb-item-enviado':''}">
          <div class="cvb-item-info">
            <strong>#${p.id}</strong> ${p.placa||'—'} · ${p.cliente||'—'}
            <div class="cvb-item-rota">${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'}${_centralDataLancamento(p).replace(/<[^>]+>/g,' ')}</div>
            ${_tag}
          </div>
          <div class="cvb-item-acoes">
            <button class="central-btn-mini" onclick="_centralModalMotorista([${p.id}])" title="Só este carro para um motorista">👤</button>
            <button class="central-btn-mini" onclick="_centralModalEquipeEntrega([${p.id}])" title="Só este carro para uma equipe">👥</button>
          </div>
        </div>`; }).join('')}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

window._centralDataLancamento = _centralDataLancamento;
window._centralEntregasPorViagem = _centralEntregasPorViagem;


/* Coletas agrupadas, mesma lógica das entregas.
   Diferença: aqui a maioria dos carros ainda NÃO tem viagem — eles estão
   justamente esperando entrar numa. Por isso o agrupamento é:
     • por viagem, quando já alocado (a cegonha está reservada, é prioridade)
     • num bloco "aguardando alocação" para o restante */
// Para onde este carro já foi direcionado (equipe ou motorista) e quando.
// Sem isto, um carro já enviado ficava visualmente igual a um que ninguém
// tocou — e a logística acabava direcionando duas vezes o mesmo veículo.
function _centralTagDirecionado(p, tipo){
  const ehColeta = tipo !== 'entrega';
  const motorista = ehColeta ? p.coletaMotorista : p.entregaMotorista;
  const equipeId  = ehColeta ? p.coletaEquipeId  : p.entregaEquipeId;
  const quando    = ehColeta ? p.coletaDirecionadaEm : p.entregaDirecionadaEm;
  let quem = '';
  if (motorista) quem = `👤 ${motorista}`;
  else if (equipeId){
    const eq = (equipesEntregaGlobais||[]).find(e => String(e.id)===String(equipeId));
    quem = `👥 equipe ${eq ? eq.nome : '—'}${eq && eq.cidade_base ? ' · '+eq.cidade_base : ''}`;
  }
  if (!quem) return '';
  const dt = quando ? ` · ${new Date(quando).toLocaleDateString('pt-BR')}` : '';
  return `<span class="cvb-tag-enviado" title="Já direcionado — aguardando confirmação">📤 Enviado para ${quem}${dt}</span>`;
}

function _centralColetasPorViagem(coletas){
  const grupos = {};
  coletas.forEach(p => {
    const chave = (p.rotaId || p.rota_id || p.placaCegonha) ? (p.rotaId || p.rota_id || p.placaCegonha) : '__livre__';
    (grupos[chave] = grupos[chave] || []).push(p);
  });

  // Os alocados vêm primeiro: têm cegonha esperando
  const chaves = Object.keys(grupos).sort((a,b) => (a === '__livre__' ? 1 : 0) - (b === '__livre__' ? 1 : 0));

  return `<div class="central-viagens">` + chaves.map(chave => {
    const itens = grupos[chave];
    const livre = chave === '__livre__';
    const r = livre ? null : (rotasGlobais||[]).find(x => String(x.id) === String(chave));
    const motorista = livre ? '' : (r?.motorista_1 || itens[0]?.motorista1 || 'sem motorista');
    const cegonha   = livre ? '' : (r?.placa_cegonha || itens[0]?.placaCegonha || '—');
    const ids = itens.map(p => p.id);

    return `<div class="central-viagem-bloco ${livre ? '' : 'aberto'}">
      <div class="central-viagem-cab" onclick="this.parentNode.classList.toggle('aberto')">
        <span class="cvb-seta">▸</span>
        <div class="cvb-info">
          <div class="cvb-tit">${livre ? '📋 Aguardando alocação' : '🚛 ' + cegonha}</div>
          <div class="cvb-sub">${livre
            ? itens.length + ' carro(s) sem carga definida'
            : '👤 ' + motorista + ' · ' + itens.length + ' carro(s) · <span style="color:#fbbf24">a cegonha espera</span>'}
            ${(() => { const enviados = itens.filter(p => p.coletaMotorista || p.coletaEquipeId).length;
               return enviados ? `<span class="cvb-sub-enviados">📤 ${enviados} de ${itens.length} já direcionado(s)</span>` : ''; })()}
            ${_centralPeriodoLancamento(itens)}</div>
        </div>
        <div class="cvb-acoes" onclick="event.stopPropagation()">
          <button class="central-btn-mini" onclick="_centralModalMotoristaColeta([${ids.join(',')}])" title="Direcionar todos para um motorista">👤 Todos</button>
          <button class="central-btn-mini" onclick="_centralModalEquipe([${ids.join(',')}])" title="Direcionar todos para uma equipe">👥 Todos</button>
        </div>
      </div>
      <div class="central-viagem-itens">
        ${itens.map(p => { const _tag = _centralTagDirecionado(p, 'coleta'); return `<div class="cvb-item ${_tag?'cvb-item-enviado':''}">
          <div class="cvb-item-info">
            <strong>#${p.id}</strong> ${p.placa||'—'} · ${p.cliente||'—'}
            <div class="cvb-item-rota">${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'}${_centralDataLancamento(p).replace(/<[^>]+>/g,' ')}</div>
            ${_tag}
          </div>
          <div class="cvb-item-acoes">
            <button class="central-btn-mini" onclick="_centralModalMotoristaColeta([${p.id}])" title="Só este carro para um motorista">👤</button>
            <button class="central-btn-mini" onclick="_centralModalEquipe([${p.id}])" title="Só este carro para uma equipe">👥</button>
          </div>
        </div>`; }).join('')}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

window._centralColetasPorViagem = _centralColetasPorViagem;


/* Data de início da viagem — ajuda a localizar a carga na lista.
   Usa iniciada_em (o clique em "Iniciar viagem"); se for registro antigo
   sem esse campo, cai na data de saída planejada. */
function _centralInicioViagem(r){
  if (!r) return '';
  const bruto = r.iniciada_em || r.data_saida;
  if (!bruto) return '';
  const d = new Date(bruto);
  if (isNaN(d)) return '';
  const planejada = !r.iniciada_em;
  return `<div class="cvb-sub">${planejada ? '📅 Saída prevista' : '🚚 Em viagem desde'} ${d.toLocaleDateString('pt-BR')}</div>`;
}

/* Período de lançamento dos carros do bloco. Com vários pedidos mostra o
   intervalo, que é o que ajuda a achar "aquela carga da semana passada". */
function _centralPeriodoLancamento(itens){
  const datas = (itens||[])
    .map(p => String(p.dataSolicitacao || p.createdAt || p.created_at || '').slice(0,10))
    .filter(d => d.length === 10)
    .sort();
  if (!datas.length) return '';
  const fmt = (iso) => iso.split('-').reverse().join('/');
  const primeira = fmt(datas[0]);
  const ultima   = fmt(datas[datas.length-1]);
  return `<div class="cvb-sub">📅 Lançado ${primeira === ultima ? 'em ' + primeira : 'entre ' + primeira + ' e ' + ultima}</div>`;
}

window._centralInicioViagem = _centralInicioViagem;
window._centralPeriodoLancamento = _centralPeriodoLancamento;
