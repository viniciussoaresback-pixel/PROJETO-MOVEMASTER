/* ============================================================================
   MOVEMASTER — mod-11.js  (66 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: _rmToastConfirmacao, _gerarPdfRomaneio, renderizarRomaneiosMotorista, _renderRotaVeiculosEditor, renderizarDocsMotorista, renderizarViagensMotorista, _toggleViagemMot, _renderFiscalPreservandoAbertos, ...
   ============================================================================ */
function _rmToastConfirmacao(texto){
  const old = document.getElementById('rmToast'); if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'rmToast';
  t.className = 'rm-toast';
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('sai'); setTimeout(()=>t.remove(), 400); }, 2400);
}

function _gerarPdfRomaneio(rotaId){
  const d = _romaneioDados(rotaId);
  if (!d) return;
  const carros = d.carros.map(p => {
    const noPatio = document.getElementById('rmPatio_'+p.id)?.checked ?? (p.noPatio || !!p.patioAtual);
    const local = document.getElementById('rmLocal_'+p.id)?.value ?? (p.localCarro || p.patioAtual || '');
    return { ...p, _noPatio: noPatio, _local: local };
  });
  const linhas = carros.map(p => `
    <tr>
      <td>#${p.id}</td><td><strong>${p.placa||'—'}</strong></td><td>${p.modelo||'—'}</td>
      <td>${p.cliente||'—'}</td>
      <td>${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'}</td>
      <td>${p._local || p.romaneioEnderecoColeta || p.enderecoColeta || '—'}</td>
      <td>${p.romaneioEnderecoEntrega || p.enderecoEntrega || '—'}</td>
    </tr>${p.observacaoPedido?`<tr><td colspan="7" style="background:#fff8f0;color:#b45309;font-size:11px;padding:4px 8px">📝 <strong>Obs. #${p.id}:</strong> ${p.observacaoPedido}</td></tr>`:''}`).join('');
  const corpo = `
    <div class="resumo">
      <strong>🚛 Cegonha:</strong> ${d.rota.placa_cegonha||'—'}
      ${d.rota.motorista_1?' &nbsp;·&nbsp; <strong>👤 Motorista:</strong> '+d.rota.motorista_1:''}
      ${d.rota.nome?' &nbsp;·&nbsp; <strong>Rota:</strong> '+d.rota.nome:''}
    </div>
    <h3>Veículos da carga</h3>
    <table>
      <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Cliente</th><th>Origem → Destino</th><th>Onde está o carro</th><th>Entregar em</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="totalgeral">Total: ${carros.length} veículo(s)</div>`;
  if (typeof _abrirPDF === 'function') _abrirPDF('Romaneio da sua carga — Motorista', corpo);
  else alert('Gerador de PDF indisponível.');
}

// Motorista: minhas cargas (romaneios enviados)
function renderizarRomaneiosMotorista(){
  const cont = document.getElementById('romaneiosMotoristaWrap');
  if (!cont) return;
  // Dados ainda não chegaram: mostra o contorno em vez de tela vazia.
  // No 4G da estrada essa espera é a mais longa do sistema — é aqui que o
  // skeleton mais rende.
  if (!window.__mmDadosCarregados && typeof mmSkeletonCards === 'function'){
    mmSkeletonCards(cont, { quantidade: 3 });
    if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => renderizarRomaneiosMotorista());
    return;
  }
  let minhas = [];
  if (typeof nomesDoMotoristaLogado === 'function'){
    const { nomes } = nomesDoMotoristaLogado();
    minhas = (rotasGlobais||[]).filter(r => r.carga_enviada_em && r.status !== 'concluida' && r.status !== 'cancelada' &&
      nomes.has(normNomeMotorista(r.motorista_1||'')));
  }
  if (minhas.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhuma carga enviada para você no momento.</p>'; return; }
  cont.innerHTML = minhas.map(r => `<div style="border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:14px;margin-bottom:12px">${_romaneioHTML(r.id)}<div style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="_gerarPdfRomaneio(${r.id})">📄 Baixar PDF</button></div></div>`).join('');
}

// ============================================================
// EDITOR DE VEÍCULOS DA ROTA (localização por carro → romaneio/PDF)
// ============================================================
function _renderRotaVeiculosEditor(rotaId){
  const cont = document.getElementById('rotaVeiculosEditor');
  if (!cont) return;
  const carros = (pedidosGlobais||[]).filter(p =>
    String(p.rotaId||p.rota_id) === String(rotaId) && p.status !== 'Cancelado');
  if (carros.length === 0){ cont.innerHTML = '<p class="text-muted" style="font-size:.85rem">Nenhum veículo vinculado ainda.</p>'; return; }
  cont.innerHTML = `
    <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 .6rem">${carros.length} veículo(s). Abra o romaneio para marcar quais estão no pátio, informar onde está cada carro e gerar o PDF do motorista.</p>
    <button type="button" class="btn btn-secondary btn-sm" onclick="abrirFecharEnviarCarga(${rotaId})">📋 Abrir romaneio / localização dos carros</button>`;
}

// ============================================================
// ÁREA DO MOTORISTA: documentos (manifesto/CTe) + histórico de viagens
// ============================================================
// Documentos da viagem ATIVA do motorista (some quando a rota é finalizada)
async function renderizarDocsMotorista(){
  const cont = document.getElementById('docsMotoristaWrap');
  if (!cont) return;
  // Dados ainda não chegaram: mostra o contorno em vez de tela vazia.
  // No 4G da estrada essa espera é a mais longa do sistema — é aqui que o
  // skeleton mais rende.
  if (!window.__mmDadosCarregados && typeof mmSkeletonCards === 'function'){
    mmSkeletonCards(cont, { quantidade: 2 });
    if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => renderizarDocsMotorista());
    return;
  }
  try { const { data } = await supabase.from('documentos_rota').select('*').order('enviado_em', { ascending:false }); if (data) documentosRotaGlobais = data; } catch(e){}
  let rotasAtivas = [];
  if (typeof nomesDoMotoristaLogado === 'function'){
    const { nomes } = nomesDoMotoristaLogado();
    rotasAtivas = (rotasGlobais||[]).filter(r =>
      r.status !== 'concluida' && r.status !== 'cancelada' &&
      nomes.has(normNomeMotorista(r.motorista_1||'')));
  }
  const rotaIds = rotasAtivas.map(r => String(r.id));
  const docs = (documentosRotaGlobais||[]).filter(d => rotaIds.includes(String(d.rota_id)));
  if (docs.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum documento na sua viagem atual.</p>'; return; }
  cont.innerHTML = docs.map(d => {
    const rota = rotasAtivas.find(r => String(r.id)===String(d.rota_id));
    const icone = d.tipo === 'cte' ? '🧾' : '📋';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;margin-bottom:8px">
      <span style="font-size:1.4rem">${icone}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${d.tipo === 'cte' ? 'CTe' : 'Manifesto'}${rota?' · '+(rota.nome||('rota #'+rota.id)):''}</div>
        <div style="font-size:.78rem;color:var(--text-secondary,#9ca3af)">${d.nome_arquivo||''} · enviado ${d.enviado_em?new Date(d.enviado_em).toLocaleDateString('pt-BR'):''}</div>
      </div>
      <a class="btn btn-primary btn-sm" href="${d.url}" target="_blank" rel="noopener">📄 Abrir</a>
    </div>`;
  }).join('');
}

// Histórico de viagens do motorista (concluídas) — só leitura
function renderizarViagensMotorista(){
  const cont = document.getElementById('viagensMotoristaWrap');
  if (!cont) return;
  // Dados ainda não chegaram: mostra o contorno em vez de tela vazia.
  // No 4G da estrada essa espera é a mais longa do sistema — é aqui que o
  // skeleton mais rende.
  if (!window.__mmDadosCarregados && typeof mmSkeletonCards === 'function'){
    mmSkeletonCards(cont, { quantidade: 4 });
    if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => renderizarViagensMotorista());
    return;
  }
  let viagens = [];
  if (typeof nomesDoMotoristaLogado === 'function'){
    const { nomes } = nomesDoMotoristaLogado();
    viagens = (rotasGlobais||[]).filter(r =>
      r.status === 'concluida' &&
      nomes.has(normNomeMotorista(r.motorista_1||'')));
  }
  if (viagens.length === 0){ cont.innerHTML = '<p class="text-muted">Você ainda não tem viagens concluídas.</p>'; return; }
  viagens.sort((a,b)=>(b.data_saida||'').localeCompare(a.data_saida||''));
  // Resumo: viagens concluídas + faturamento (pela tabela de preços do motorista)
  let totalCarros = 0, totalFat = 0;
  viagens.forEach(r => {
    const carros = (pedidosGlobais||[]).filter(p => String(p.rotaId||p.rota_id)===String(r.id));
    totalCarros += carros.length;
    carros.forEach(p => {
      const vm = (typeof valorMotoristaPedido==='function') ? valorMotoristaPedido(p) : {valor:null};
      totalFat += (vm.valor||0);
    });
  });
  const resumo = `<div class="ocup-resumo" style="margin-bottom:14px">
    <div class="ocup-resumo-card"><span class="ocup-resumo-label">Viagens concluídas</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">${viagens.length}</span></div></div>
    <div class="ocup-resumo-card"><span class="ocup-resumo-label">Carros transportados</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">${totalCarros}</span></div></div>
    <div class="ocup-resumo-card"><span class="ocup-resumo-label">Faturamento (tabela)</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">R$ ${totalFat.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
  </div>`;
  cont.innerHTML = resumo + viagens.map(r => {
    const carros = (pedidosGlobais||[]).filter(p => String(p.rotaId||p.rota_id)===String(r.id));
    const aberto = _viagensMotAbertas.has(String(r.id));
    return `<div style="border:1px solid var(--border,rgba(255,255,255,.1));border-radius:10px;margin-bottom:8px">
      <div onclick="_toggleViagemMot('${r.id}')" style="cursor:pointer;padding:12px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span style="color:var(--accent,#ff6a00)">${aberto?'▾':'▸'}</span>
        <span>📅 ${r.data_saida?new Date(r.data_saida+'T12:00').toLocaleDateString('pt-BR'):'—'}</span>
        <span>🚛 <strong>${r.placa_cegonha||'—'}</strong></span>
        <span class="text-muted">${r.nome||''}</span>
        <span class="text-muted" style="margin-left:auto">${carros.length} carro(s)</span>
      </div>
      ${aberto ? `<table class="corr-tabela"><thead><tr><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Valor (tabela)</th></tr></thead>
        <tbody>${carros.map(p=>{
          const vm = (typeof valorMotoristaPedido==='function') ? valorMotoristaPedido(p) : {valor:null};
          return `<tr class="corr-tr">
          <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-rota">${p.cidadeOrigem||'—'} → <strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-cli">${p.cliente||'—'}</td>
          <td class="ct-frete">${vm.valor!=null?'R$ '+vm.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):'—'}</td>
        </tr>`;}).join('')}</tbody></table>` : ''}
    </div>`;
  }).join('');
}
let _viagensMotAbertas = new Set();
function _toggleViagemMot(id){
  const k = String(id);
  if (_viagensMotAbertas.has(k)) _viagensMotAbertas.delete(k); else _viagensMotAbertas.add(k);
  renderizarViagensMotorista();
}

// ============================================================
// FISCAL: enviar manifesto/CTe (PDF) ao motorista da rota
// ============================================================
// Re-renderiza a área fiscal preservando quais cards (details) estavam abertos
function _renderFiscalPreservandoAbertos(){
  const abertos = [...document.querySelectorAll('.fisc-card-det[open]')].map(d => d.getAttribute('data-rota'));
  renderizarEnvioDocsFiscal();
  abertos.forEach(id => {
    const d = document.querySelector(`.fisc-card-det[data-rota="${id}"]`);
    if (d) d.setAttribute('open', '');
  });
}

// Resumo dos carros da carga direto no card do fiscal (dados para emitir CTe)
function _fiscalResumoCargaHTML(rotaId){
  const carros = (typeof _veiculosNaRota === 'function') ? _veiculosNaRota(rotaId) : [];
  if (!carros || carros.length === 0) return '<div class="fisc-vazio" style="margin-bottom:12px">Nenhum carro vinculado a esta carga ainda.</div>';
  const clientesMap = {};
  (clientesGlobais||[]).forEach(c => { clientesMap[String(c.id)] = c; if (c.nome) clientesMap[_norm(c.nome)] = c; });
  const linhas = carros.map((p,i) => {
    const cli = clientesMap[String(p.clienteId)] || clientesMap[_norm(p.cliente||'')] || {};
    const cnpjO = p.cnpjColeta || cli.cnpj || '';
    const cnpjD = p.cnpjEntrega || '';
    const cteJa = p.numeroCte || p.numero_cte;
    return `<tr>
      <td>${i+1}</td>
      <td><strong>${p.placa||'—'}</strong><br><span class="text-muted" style="font-size:.72rem">${p.modelo||''}</span></td>
      <td>${p.cliente||'—'}${p.referencia?`<br><span style="color:#f59e0b;font-size:.72rem">🏷️ ${p.referencia}</span>`:''}</td>
      <td style="font-size:.78rem"><strong>${p.cidadeOrigem||'—'}/${p.ufOrigem||''}</strong>${cnpjO?`<br><span class="text-muted">CNPJ: ${cnpjO}</span>`:''}</td>
      <td style="font-size:.78rem"><strong>${p.cidadeDestino||'—'}/${p.ufDestino||''}</strong>${cnpjD?`<br><span class="text-muted">CNPJ: ${cnpjD}</span>`:''}</td>
      <td style="text-align:right">R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td style="text-align:center">${cteJa?`<span style="color:#22c55e;font-weight:700" title="CTe ${cteJa}">✅</span>`:'<span style="color:#ef4444">⚠️</span>'}</td>
    </tr>`;
  }).join('');
  const totalFrete = carros.reduce((s,p)=>s+Number(p.valorFrete||0),0);
  return `<div class="fisc-resumo-carga">
    <div class="fisc-doc-tit" style="margin-bottom:6px">🚗 Carros da carga (${carros.length}) — dados para emissão</div>
    <div style="overflow-x:auto"><table class="fisc-resumo-tab">
      <thead><tr><th>#</th><th>Placa/Modelo</th><th>Cliente</th><th>Origem</th><th>Destino</th><th>Frete</th><th>CTe</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="5"><strong>Total</strong></td><td style="text-align:right"><strong>R$ ${totalFrete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td><td></td></tr></tfoot>
    </table></div>
  </div>`;
}

function renderizarEnvioDocsFiscal(){
  const cont = document.getElementById('envioDocsFiscalWrap');
  if (!cont) return;
  // rotas ativas (planejada ou em andamento) com motorista definido
  const rotas = (rotasGlobais||[]).filter(r =>
    (r.status === 'planejada' || r.status === 'em_andamento') && r.placa_cegonha);
  if (rotas.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhuma rota ativa para enviar documentos.</p>'; return; }
  cont.innerHTML = rotas.map(r => {
    const docs = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)===String(r.id));
    const mans = docs.filter(d => d.tipo==='manifesto');
    const ctes = docs.filter(d => d.tipo==='cte');
    const stLabel = r.status === 'em_andamento' ? 'Em viagem' : 'Planejada';
    const stCor = r.status === 'em_andamento' ? '#2563eb' : '#f59e0b';
    const listaDocs = (arr, cor) => arr.length === 0
      ? '<div class="fisc-vazio">Nenhum arquivo enviado ainda.</div>'
      : `<div class="fisc-arquivos">${arr.map(d => `<div class="fisc-arq"><a href="${d.url}" target="_blank" class="fisc-arq-link">📎 ${d.nome_arquivo||'documento'}</a><button class="fisc-arq-del" onclick="_excluirDocRota(${d.id})" title="Excluir">🗑️</button></div>`).join('')}</div>`;
    const totalDocs = mans.length + ctes.length;
    return `<details class="fisc-card fisc-card-det" data-rota="${r.id}">
      <summary class="fisc-card-summary">
        <div class="fisc-sum-esq">
          <span class="fisc-cegonha">🚛 ${r.placa_cegonha}</span>
          <span class="fisc-rota-nome">${r.nome||('rota #'+r.id)}</span>
          ${r.motorista_1?`<span class="fisc-sum-mot">👤 ${r.motorista_1}</span>`:''}
        </div>
        <div class="fisc-sum-dir">
          ${(() => {
            const dt = r.created_at || r.criado_em || r.data_saida;
            if (!dt) return '';
            const d = new Date(dt);
            if (isNaN(d)) return '';
            return `<span class="fisc-sum-data" title="Viagem criada em ${d.toLocaleString('pt-BR')}">📅 ${d.toLocaleDateString('pt-BR')}</span>`;
          })()}
          ${totalDocs?`<span class="fisc-sum-badge">📎 ${totalDocs}</span>`:''}
          <span class="fisc-status" style="background:${stCor}22;color:${stCor};border:1px solid ${stCor}55">${stLabel}</span>
        </div>
      </summary>
      <div class="fisc-card-corpo">
        ${(() => {
          const fisc = _fiscalDocsCompletos(r.id);
          return fisc.ok
            ? '<div style="margin-bottom:12px;padding:10px 12px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:8px;font-size:.83rem;color:#22c55e">✅ Documentos completos — manifesto, CTe e números preenchidos. A viagem já pode ser finalizada pela logística.</div>'
            : `<div style="margin-bottom:12px;padding:10px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:.83rem;color:#f59e0b"><strong>⚠️ Pendências do fiscal</strong> (a viagem não pode ser finalizada até concluir):<br>• ${fisc.faltas.join('<br>• ')}</div>`;
        })()}
        <div style="margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" onclick="gerarEspelhoCarga('${r.placa_cegonha}', { rotaId: ${r.id} })">📄 Ver espelho da carga (dados para emitir)</button>
          <span class="text-muted" style="font-size:.78rem;margin-left:6px">Placas, modelos, clientes, origem/destino e CNPJs desta carga.</span>
        </div>
        ${_fiscalResumoCargaHTML(r.id)}
        <div class="fisc-docs-grid">
          <div class="fisc-doc-box">
            <div class="fisc-doc-tit">📋 Manifestos ${mans.length?`<span class="fisc-badge">${mans.length}</span>`:''}</div>
            <div class="fisc-upload">
              <input type="file" id="docMan_${r.id}" accept="application/pdf" multiple class="fisc-file">
              <button class="btn btn-primary btn-sm" onclick="_enviarDocRota(${r.id},'manifesto')">📤 Enviar</button>
            </div>
            <div id="listaMan_${r.id}">${listaDocs(mans)}</div>
          </div>
          <div class="fisc-doc-box">
            <div class="fisc-doc-tit">🧾 CTes ${ctes.length?`<span class="fisc-badge">${ctes.length}</span>`:''}</div>
            <div class="fisc-upload">
              <input type="file" id="docCte_${r.id}" accept="application/pdf" multiple class="fisc-file">
              <button class="btn btn-primary btn-sm" onclick="_enviarDocRota(${r.id},'cte')">📤 Enviar</button>
            </div>
            <div id="listaCte_${r.id}">${listaDocs(ctes)}</div>
          </div>
        </div>
        ${_fiscalNumerosCteHTML(r.id)}
      </div>
    </details>`;
  }).join('');
}

// Ponto 2 — selos visuais do pedido, consistentes em todo o sistema.
// 🔀 Transbordado (passou por transbordo) e 🧾 CTe emitida (PDF enviado OU número digitado).
function _selosPedidoHTML(p){
  if (!p) return '';
  const selos = [];
  if ((p.qtdTransbordos||0) > 0 || p.aguardandoTransbordo){
    const cidadeTb = p.cidadeTransbordo || p.patioAtual || '';
    const cidadeCurta = cidadeTb ? String(cidadeTb).split('/')[0].replace('🅿️ ','').replace('PÁTIO ','').trim() : '';
    const label = cidadeCurta ? `🔀 Transbordo em ${cidadeCurta}` : `🔀 Transbordado`;
    selos.push(`<span class="selo-pedido selo-transb" title="Transbordo${cidadeTb?' em '+cidadeTb:''}">${label}</span>`);
  }
  const temCtePdf = (documentosRotaGlobais||[]).some(d => d.tipo==='cte' && String(d.rota_id)===String(p.rotaId||p.rota_id));
  if (p.numeroCte || temCtePdf){
    const num = p.numeroCte ? ` ${p.numeroCte}` : '';
    selos.push(`<span class="selo-pedido selo-cte">🧾 CTe${num}</span>`);
  }
  if (p.observacaoPedido){
    const obs = String(p.observacaoPedido).replace(/"/g,'&quot;');
    selos.push(`<span class="selo-pedido selo-obs" title="${obs}">📝 Obs.</span>`);
  }
  return selos.length ? `<span class="selos-pedido">${selos.join(' ')}</span>` : '';
}

// Ponto 4 — número do CTe por pedido daquela viagem
// Grupos de carros por viagem — lido pelo leitor de DACTE ao casar as placas.
// Declarado aqui de propósito: mod-11 é quem preenche, então não pode depender
// de o dacte-leitor.js ter carregado antes.
var _fiscalGruposPorRota = window._fiscalGruposPorRota || {};
window._fiscalGruposPorRota = _fiscalGruposPorRota;

function _fiscalNumerosCteHTML(rotaId){
  const pedidos = _pedidosHistoricoDaViagem(rotaId).filter(p => p.status !== 'Cancelado');
  if (pedidos.length === 0) return '';
  // Agrupa por grupo_id + referência: carros do mesmo pedido SÓ compartilham CTe se tiverem
  // a MESMA requisição/referência. Requisições (ou valores) diferentes = CTes separados.
  const grupos = [];
  const vistos = {};
  pedidos.forEach(p => {
    const ref = (p.referencia||'').trim();
    // Regra de agrupamento do CTe:
    //  - Carros do mesmo grupo (grupo_id): agrupam por REQUISIÇÃO.
    //    Se não têm requisição (ou têm a mesma), ficam TODOS juntos = 1 CTe.
    //    Se têm requisições DIFERENTES, separam em CTes por requisição.
    //  - Sem grupo_id: cada pedido é individual.
    const chave = p.grupoId ? ('g'+p.grupoId + (ref ? '|r'+_norm(ref) : '')) : 'p'+p.id;
    if (!vistos[chave]){ vistos[chave] = { chave, itens:[], lider:p }; grupos.push(vistos[chave]); }
    vistos[chave].itens.push(p);
  });
  // Guarda os grupos desta viagem para o leitor de DACTE casar as placas
  _fiscalGruposPorRota[rotaId] = grupos.map(g => ({
    chave: g.chave,
    ids: g.itens.map(x => x.id),
    placas: g.itens.map(x => _normPlaca(x.placa))
  }));

  return `<div style="margin-top:10px;border-top:1px dashed var(--border,rgba(255,255,255,.12));padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn btn-sm btn-secondary" onclick="_dacteAbrirLeitor(${rotaId})">📄 Ler DACTE e preencher</button>
      <span style="font-size:.72rem;color:var(--text-secondary,#9ca3af)">anexe o PDF e confira antes de salvar</span>
    </div>
    <div style="font-size:.8rem;color:var(--text-secondary,#9ca3af);margin-bottom:6px">🧾 Número da CTe (carros com a mesma requisição compartilham CTe; requisições diferentes = CTes separados):</div>
    ${grupos.map(g => {
      const lider = g.lider;
      const placas = g.itens.map(x => x.placa||'—').join(', ');
      const multi = g.itens.length > 1;
      return `<div style="border:1px solid var(--border,rgba(255,255,255,.1));border-radius:8px;padding:8px 10px;margin-bottom:6px" id="cteGrupo_${g.chave}">
        <div style="font-size:.82rem;margin-bottom:5px">
          <strong>#${lider.id}</strong>${multi?` <span style="background:rgba(255,106,0,.15);color:#ff6a00;font-size:.68rem;padding:1px 7px;border-radius:999px">🔗 ${g.itens.length} carros</span>`:''} · 🚗 ${placas} ${_selosPedidoHTML(lider)}${lider.referencia?` <span style="color:#f59e0b;font-size:.72rem">🏷️ ${lider.referencia}</span>`:''}<br>
          <span style="color:var(--text-secondary,#9ca3af);font-size:.78rem">${lider.cliente||'—'} · ${lider.cidadeOrigem||'—'} → <strong>${lider.cidadeDestino||'—'}</strong></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="text" id="cteNum_${g.chave}" value="${lider.numeroCte||''}" placeholder="nº da CTe" style="font-size:.8rem;padding:4px 8px;border-radius:6px;border:1px solid var(--border,rgba(255,255,255,.15));background:var(--surface-2,rgba(255,255,255,.03));color:inherit;width:140px">
          <button class="btn btn-sm btn-primary" onclick="_salvarNumeroCteGrupo('${g.chave}', [${g.itens.map(x=>x.id).join(',')}])">Salvar CTe</button>
          <span id="cteOk_${g.chave}" style="font-size:.75rem;color:#22c55e">${lider.numeroCte?`✅ CTe ${lider.numeroCte}`:''}</span>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// Salva o número da CTe para todos os carros do grupo, SEM re-renderizar o card inteiro
async function _salvarNumeroCteGrupo(chave, ids){
  const val = document.getElementById(`cteNum_${chave}`)?.value.trim();
  return _salvarNumeroCteGrupoValor(chave, ids, val);
}

// Mesma gravação, com o valor vindo de fora (usado pelo leitor de DACTE)
async function _salvarNumeroCteGrupoValor(chave, ids, valor){
  const val = (valor == null ? '' : String(valor)).trim();
  const okSpan = document.getElementById(`cteOk_${chave}`);
  try {
    // Em lote: uma chamada para todos os carros do grupo
    const _agoraCte = val ? new Date().toISOString() : null;
    await mmAtualizarPedidos(ids,
      { numero_cte: val || null, cte_emitido_em: _agoraCte },
      (p) => { p.numeroCte = val || null; p.cteEmitidoEm = _agoraCte; }
    );
    if (okSpan) okSpan.textContent = val ? `✅ CTe ${val}` : '';
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemFiscal', val?`✅ CTe ${val} registrada (${ids.length} carro(s)).`:`CTe removida.`, 'success');
    // NÃO re-renderiza o card inteiro (não fecha o container)
  } catch(e){ alert('Erro ao salvar CTe: '+(e.message||e)); }
}

// mantida por compatibilidade
async function _salvarNumeroCte(pedidoId){ return _salvarNumeroCteGrupo('p'+pedidoId, [pedidoId]); }

async function _enviarDocRota(rotaId, tipo){
  const input = document.getElementById((tipo==='cte'?'docCte_':'docMan_')+rotaId);
  const arquivos = input?.files;
  if (!arquivos || arquivos.length === 0){ alert('Escolha um ou mais arquivos PDF.'); return; }
  const usuario = _usuarioAtualNome() || 'Fiscal';
  let enviados = 0;
  try {
    for (const arquivo of arquivos){
      if (arquivo.type !== 'application/pdf'){ alert(`"${arquivo.name}" não é PDF — ignorado.`); continue; }
      const nomeArq = `documentos/${rotaId}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.pdf`;
      const { error: upErr } = await supabase.storage.from('movemaster-arquivos').upload(nomeArq, arquivo, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('movemaster-arquivos').getPublicUrl(nomeArq);
      const url = urlData?.publicUrl || '';
      // múltiplos permitidos: NÃO remove os anteriores do mesmo tipo
      const { data, error } = await supabase.from('documentos_rota').insert({
        rota_id: rotaId, tipo, nome_arquivo: arquivo.name, url, enviado_por: usuario
      }).select();
      if (error) throw error;
      if (data && data[0]) documentosRotaGlobais.push(data[0]);
      enviados++;
    }
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemFiscal', `📄 ${enviados} ${tipo==='cte'?'CTe(s)':'manifesto(s)'} enviado(s) ao motorista.`, 'success');
    // Notifica o motorista da rota que há novos documentos
    const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
    if (rota && rota.motorista_1 && typeof notificar === 'function'){
      await notificar({
        nome: rota.motorista_1, tipo: 'documento',
        titulo: tipo==='cte' ? '🧾 CTe da sua viagem' : '📋 Manifesto da sua viagem',
        mensagem: `O fiscal enviou ${enviados} ${tipo==='cte'?'CTe(s)':'manifesto(s)'} para a sua viagem ${rota.placa_cegonha||''}. Veja em Documentos da Viagem.`
      });
    }
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(`✅ ${enviados} ${tipo==='cte'?'CTe(s)':'manifesto(s)'} enviado(s) ao motorista!`);
    // Atualiza SÓ a lista daquele tipo (não recria o card, pra não limpar o input do outro tipo)
    const listaEl = document.getElementById((tipo==='cte'?'listaCte_':'listaMan_')+rotaId);
    if (listaEl){
      const docs = (documentosRotaGlobais||[]).filter(dd => String(dd.rota_id)===String(rotaId) && dd.tipo===tipo);
      listaEl.innerHTML = docs.length === 0
        ? '<div class="fisc-vazio">Nenhum arquivo enviado ainda.</div>'
        : `<div class="fisc-arquivos">${docs.map(dd => `<div class="fisc-arq"><a href="${dd.url}" target="_blank" class="fisc-arq-link">📎 ${dd.nome_arquivo||'documento'}</a><button class="fisc-arq-del" onclick="_excluirDocRota(${dd.id})" title="Excluir">🗑️</button></div>`).join('')}</div>`;
    }
    // limpa só o input que foi enviado
    if (input) input.value = '';
  } catch(e){ alert('Erro ao enviar: '+(e.message||e)); }
}

async function _excluirDocRota(docId){
  if (!confirm('Remover este documento?')) return;
  try {
    await supabase.from('documentos_rota').delete().eq('id', docId);
    documentosRotaGlobais = documentosRotaGlobais.filter(d=>d.id!==docId);
    _renderFiscalPreservandoAbertos();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

// ============================================================
// Cards minimizáveis (clique no título recolhe/expande o conteúdo)
// Uso: adicionar class="card-minimizavel" no .card; o 1º h2/h3 vira o toggle.
// ============================================================
function _initCardsMinimizaveis(scope){
  const root = scope || document;
  root.querySelectorAll('.card-minimizavel').forEach(card => {
    if (card._minInit) return; card._minInit = true;
    const titulo = card.querySelector('h2, h3');
    if (!titulo) return;
    titulo.style.cursor = 'pointer';
    titulo.style.userSelect = 'none';
    const chev = document.createElement('span');
    chev.className = 'card-chevron';
    chev.textContent = ' ▾';
    titulo.appendChild(chev);
    titulo.addEventListener('click', () => {
      const recolhido = card.classList.toggle('card-recolhido');
      chev.textContent = recolhido ? ' ▸' : ' ▾';
      // recolhe tudo do card menos a barra do título
      Array.from(card.children).forEach(ch => {
        if (ch === titulo || ch.contains(titulo)) return;
        ch.style.display = recolhido ? 'none' : '';
      });
    });
  });
}

// ============================================================
// JORNADA DO CARRO — timeline completa (expande na linha do acompanhamento)
// Reúne: histórico de status (cada mudança) + coleta/entrega por equipe
// + pernas de transbordo (motorista/cegonha de cada trecho).
// ============================================================
const _jornadaAbertas = new Set();
async function _toggleJornada(pedidoId){
  const row = document.getElementById('jornadaRow_'+pedidoId);
  const box = document.getElementById('jornadaBox_'+pedidoId);
  if (!row || !box) return;
  const k = String(pedidoId);
  if (_jornadaAbertas.has(k)){
    _jornadaAbertas.delete(k); row.style.display = 'none'; return;
  }
  _jornadaAbertas.add(k); row.style.display = '';
  box.innerHTML = '<p class="text-muted" style="font-size:.85rem">Carregando jornada...</p>';
  try {
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
    // 1) histórico de status
    let hist = [];
    try {
      const { data } = await supabase.from('historico_status').select('*').eq('pedido_id', parseInt(pedidoId)).order('created_at', { ascending: true });
      hist = data || [];
    } catch(_){}
    // 2) pernas de transbordo
    let trechos = [];
    try {
      const { data } = await supabase.from('pedido_trechos').select('*').eq('pedido_id', parseInt(pedidoId)).order('ordem', { ascending: true });
      trechos = data || [];
    } catch(_){}
    box.innerHTML = _montarJornadaHTML(p, hist, trechos);
  } catch(e){
    box.innerHTML = '<p class="text-muted" style="font-size:.85rem">Não consegui carregar a jornada.</p>';
  }
}

function _montarJornadaHTML(p, hist, trechos){
  const eventos = [];
  const fmt = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '';
  // Criação
  if (p?.dataSolicitacao || p?.createdAt){
    eventos.push({ icone:'📝', cor:'#9ca3af', quando: p.createdAt || (p.dataSolicitacao+'T12:00'),
      titulo:'Pedido criado', detalhe: `${p.cliente||''}${p.responsavelComercial?' · resp. '+p.responsavelComercial:''}` });
  }
  // Cada mudança de status
  (hist||[]).forEach(h => {
    const cor = FLUXO_STATUS[h.status_novo]?.cor || '#4ade80';
    eventos.push({ icone:'🔄', cor, quando: h.created_at,
      titulo: `${h.status_anterior||'—'} → ${h.status_novo}`,
      detalhe: [h.usuario_nome?('👤 '+h.usuario_nome):'', h.usuario_perfil?('('+h.usuario_perfil+')'):'', h.observacao||''].filter(Boolean).join(' ') });
  });
  // Coleta pela equipe
  if (p?.coletaEquipeEm){
    eventos.push({ icone:'📥', cor:'#60a5fa', quando: p.coletaEquipeEm,
      titulo:'Coletado pela equipe', detalhe: p.coletaEquipePor?('👤 '+p.coletaEquipePor):'' });
  }
  // Pernas de transbordo (cada trecho: motorista + cegonha)
  (trechos||[]).forEach((t, i) => {
    eventos.push({ icone:'🚛', cor:'#fb923c', quando: t.created_at,
      titulo:`Trecho ${t.ordem||i+1}: ${t.origem_cidade||'?'}${t.origem_uf?'/'+t.origem_uf:''} → ${t.destino_cidade||'?'}${t.destino_uf?'/'+t.destino_uf:''}`,
      detalhe: [t.placa_cegonha?('🚛 '+t.placa_cegonha):'', t.motorista_nome?('👤 '+t.motorista_nome):'', t.km?(t.km+' km'):''].filter(Boolean).join(' · ') });
  });
  // Transbordo (marco)
  if (p?.cidadeTransbordo){
    eventos.push({ icone:'🔁', cor:'#fbbf24', quando: null,
      titulo:`Transbordo em ${p.cidadeTransbordo}`, detalhe:'troca de cegonha' });
  }
  // Entrega pela equipe
  if (p?.entregaEquipeEm){
    eventos.push({ icone:'📤', cor:'#4ade80', quando: p.entregaEquipeEm,
      titulo:'Entregue pela equipe', detalhe: p.entregaEquipePor?('👤 '+p.entregaEquipePor):'' });
  }
  // Ordena por data (eventos sem data vão pro fim, mantendo ordem)
  eventos.sort((a,b) => {
    if (!a.quando && !b.quando) return 0;
    if (!a.quando) return 1;
    if (!b.quando) return -1;
    return new Date(a.quando) - new Date(b.quando);
  });
  if (eventos.length === 0) return '<p class="text-muted" style="font-size:.85rem">Sem eventos registrados ainda.</p>';
  return `<div class="jornada-tl">
    ${eventos.map(e => `
      <div class="jornada-ev">
        <div class="jornada-ic" style="background:${e.cor}22;color:${e.cor};border:1px solid ${e.cor}55">${e.icone}</div>
        <div class="jornada-ct">
          <div class="jornada-tit">${e.titulo}</div>
          ${e.detalhe?`<div class="jornada-det">${e.detalhe}</div>`:''}
          ${e.quando?`<div class="jornada-data">${fmt(e.quando)}</div>`:''}
        </div>
      </div>`).join('')}
  </div>`;
}

// ============================================================
// TRANSBORDO via dropdown de status: escolher pátio → sugerir corredor da próxima perna
// ============================================================
function _abrirModalTransbordoStatus(pedidoIds, rotuloAntes){
  // Aceita 1 carro (número) ou vários (array / "1,2,3"): a mesma escolha de
  // pátio e corredor é aplicada a todos os selecionados.
  const ids = (Array.isArray(pedidoIds) ? pedidoIds : String(pedidoIds).split(','))
    .map(x => parseInt(x)).filter(n => !isNaN(n));
  const alvos = ids.map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;
  const p = alvos[0];
  const varios = alvos.length > 1;
  const old = document.getElementById('modalTransbStatus'); if (old) old.remove();
  const patios = (typeof PATIOS_FIXOS !== 'undefined') ? PATIOS_FIXOS : [];
  const div = document.createElement('div');
  div.id = 'modalTransbStatus';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">🔁 Transbordo ${varios ? `de ${alvos.length} carros` : `do #${p.id}`}</h2>
      ${varios
        ? `<p class="text-muted" style="font-size:.86rem;margin:.2rem 0 .6rem">O pátio e o corredor escolhidos abaixo valem para <strong>todos os ${alvos.length} carros</strong>. Eles saem do caminhão atual e aguardam a próxima perna.</p>
           <div class="transb-lista-carros" style="display:flex;flex-direction:column;gap:4px;margin-bottom:1rem;max-height:160px;overflow:auto">
             ${alvos.map(c => `<div style="font-size:.82rem"><strong>#${c.id}</strong> · ${c.placa||'—'} · ${c.modelo||''} <span class="text-muted">→ ${c.cidadeDestino||'—'}</span></div>`).join('')}
           </div>`
        : `<p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">${p.placa||''} · ${p.modelo||''} · destino final <strong>${p.cidadeDestino||'—'}</strong>. O carro sai do caminhão atual e aguarda a próxima perna.</p>`}
      <div class="pulo-etapa">
        <div class="pulo-etapa-tit">🅿️ Em qual pátio vai ficar?</div>
        <label>Pátio de transbordo</label>
        <select id="transbPatio" onchange="_transbSugereCorredor()">
          <option value="">Selecione o pátio...</option>
          ${patios.map(pt => `<option value="${pt}">${pt}</option>`).join('')}
        </select>
        <label style="margin-top:10px">Direcionar para qual corredor? (próxima perna)</label>
        <select id="transbCorredor">
          <option value="">— escolher depois (fica em Aguardando transbordo) —</option>
        </select>
        <div id="transbSugestao" style="font-size:.8rem;color:#4ade80;margin-top:6px"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" style="flex:1" onclick="_confirmarTransbordoStatus('${ids.join(',')}', '${String(rotuloAntes||'').replace(/'/g,"\\'")}')">✅ Confirmar transbordo${varios ? ` (${alvos.length})` : ''}</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalTransbStatus').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Sugere o corredor que melhor encaixa a próxima perna (a partir do pátio
// escolhido → destino final).
//
// A comparação de cidade aqui precisa ser tolerante. O pátio vem de uma lista
// fixa ("Maringá/PR"), mas o corredor é cadastrado à mão e aparece de várias
// formas: "Maringa/Londrina x Cascavel" (sem acento), "Maringá / Londrina",
// "Londrina-Maringá". A versão antiga comparava só o primeiro trecho antes da
// barra, com toLowerCase e sem tirar acento — então "Maringá/PR" não casava
// com "Maringa/Londrina", e o corredor sumia das sugestões.
function _transbCidadesDoRotulo(txt){
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  // quebra em todos os separadores usados nos cadastros e descarta as UFs
  return String(txt||'')
    .split(/\s*(?:\/|\bx\b|,|—|–|-|>|→)\s*/i)
    .map(t => n(t))
    .filter(t => t && t.length > 2);   // "pr", "sc", "sp" fora
}

function _transbCorredorPassaPor(c, cidadeNorm){
  const paradas = (c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino];
  // procura a cidade nas paradas E no nome do corredor — em cadastro manual,
  // muita vez a cidade intermediária só existe no nome
  const alvos = [...paradas, c.nome];
  return alvos.some(rot => _transbCidadesDoRotulo(rot).includes(cidadeNorm));
}

function _transbSugereCorredor(){
  const patio = document.getElementById('transbPatio')?.value || '';
  const sel = document.getElementById('transbCorredor');
  const sug = document.getElementById('transbSugestao');
  if (!sel) return;
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  sel.innerHTML = '<option value="">— escolher depois (fica em Aguardando transbordo) —</option>';
  if (!patio){ if (sug) sug.textContent = ''; return; }
  const cidadePatio = n(patio.split('/')[0]);
  const nomeCidade = patio.split('/')[0];
  const todos = (corredoresGlobais||[]);
  const passam = todos.filter(c => _transbCorredorPassaPor(c, cidadePatio));
  const resto = todos.filter(c => !passam.includes(c));

  if (passam.length){
    const g = document.createElement('optgroup');
    g.label = `Passam por ${nomeCidade}`;
    passam.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nome; g.appendChild(o); });
    sel.appendChild(g);
  }
  // Os demais continuam na lista, num grupo separado: se o cadastro do
  // corredor estiver escrito de um jeito que a busca não reconhece, o usuário
  // ainda consegue escolher — antes ele simplesmente não tinha a opção.
  if (resto.length){
    const g2 = document.createElement('optgroup');
    g2.label = passam.length ? 'Demais corredores' : 'Todos os corredores';
    resto.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nome; g2.appendChild(o); });
    sel.appendChild(g2);
  }

  if (sug){
    if (passam.length === 1){
      sel.value = passam[0].id;
      sug.textContent = `💡 Sugestão: ${passam[0].nome} (passa por ${nomeCidade}).`;
    } else if (passam.length > 1){
      sug.textContent = `💡 ${passam.length} corredores passam por ${nomeCidade}. Escolha o que leva ao destino.`;
    } else {
      sug.textContent = `Nenhum corredor cadastrado passando por ${nomeCidade} — a lista abaixo traz todos, caso o cadastro esteja escrito de outra forma.`;
    }
  }
}
window._transbSugereCorredor = _transbSugereCorredor;

// Desfaz um transbordo marcado por engano: volta o pedido ao estado normal.
// Precisa reverter TUDO o que o transbordo gravou — não só o status. Faltando
// alguma peça, o carro fica num meio-termo: sem a marca de transbordo, mas
// preso num pátio ou fora da carga de origem.
async function _desfazerTransbordo(pedidoIds){
  const ids = (Array.isArray(pedidoIds) ? pedidoIds : String(pedidoIds).split(','))
    .map(x => parseInt(x)).filter(n => !isNaN(n));
  const alvos = ids.map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;

  const quem = alvos.length === 1
    ? `do pedido #${alvos[0].id} (${alvos[0].placa||''})`
    : `de ${alvos.length} pedidos`;
  if (!confirm(`Desfazer o transbordo ${quem}?\n\nO carro deixa de contar como transbordado, sai do pátio de transbordo e volta ao estado anterior — se ainda estiver numa viagem, volta para ela; senão, volta ao planejamento.`)) return;

  const usuario = _usuarioAtualNome() || 'Logística';
  const falhas = [];

  for (const p of alvos){
    try {
      const rotaOrigem = p.rotaId || p.rota_id || null;
      const novoStatus = rotaOrigem ? 'Em Transporte' : 'Pendente';
      await supabase.from('pedidos').update({
        status: novoStatus,
        status_planilha: null,
        aguardando_transbordo: false,
        cidade_transbordo: null,
        // o transbordo colocou o carro no pátio e fixou um corredor para a
        // próxima perna; desfazendo, as duas marcas têm de sair junto
        patio_atual: null,
        patio_desde: null,
        corredor_manual_id: null,
        qtd_transbordos: Math.max(0, (p.qtdTransbordos || 0) - 1)
      }).eq('id', parseInt(p.id));

      Object.assign(p, {
        status: novoStatus, statusPlanilha: null, aguardandoTransbordo: false,
        cidadeTransbordo: null, patioAtual: null, corredorManualId: null,
        qtdTransbordos: Math.max(0, (p.qtdTransbordos||0) - 1)
      });

      // o carro nunca chegou a sair da carga — limpa a marca no vínculo
      if (rotaOrigem && typeof _desmarcarSaidaTransbordo === 'function'){
        await _desmarcarSaidaTransbordo(rotaOrigem, p.id);
      }

      await supabase.from('historico_status').insert({
        pedido_id: parseInt(p.id), status_anterior: 'Transbordo', status_novo: novoStatus,
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `↩️ Transbordo desfeito (marcado por engano)${rotaOrigem?' — carro voltou à viagem de origem':' — carro voltou ao planejamento'}.`
      });
    } catch(e){ falhas.push(`#${p.id}: ${e.message||e}`); }
  }

  if (falhas.length) alert(`Não foi possível desfazer alguns transbordos:\n\n• ${falhas.join('\n• ')}`);
  const ok = alvos.length - falhas.length;
  if (ok > 0 && typeof _rmToastConfirmacao === 'function')
    _rmToastConfirmacao(ok === 1 ? '↩️ Transbordo desfeito.' : `↩️ ${ok} transbordos desfeitos.`);

  if (typeof recarregarPedidos === 'function') await recarregarPedidos();
  if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
  if (typeof _cgFecharRastreio === 'function') _cgFecharRastreio();
}
window._desfazerTransbordo = _desfazerTransbordo;

// Aplica o transbordo a UM pedido (update + histórico + saída da viagem de origem).
// Extraído para que a confirmação possa rodar em lote com a mesma escolha de pátio/corredor.
async function _aplicarTransbordoPedido(p, patio, corredorId, rotuloAntes, usuario, perfil){
  const pedidoId = p.id;
  const cegonhaAnterior = p.placaCegonha || '';
  const _rotaOrigem = p.rotaId || p.rota_id || null;
  const upd = {
    status: 'Transbordo',
    status_planilha: 'Transbordo',
    cidade_transbordo: patio,
    transbordo_em: new Date().toISOString(),
    patio_atual: patio,
    patio_desde: new Date().toISOString(),
    aguardando_transbordo: !corredorId,  // se não direcionou a corredor, fica aguardando transbordo
    qtd_transbordos: (p.qtdTransbordos || 0) + 1,
    // Item 2: NÃO sai da viagem agora — fica na viagem antiga até ela finalizar.
    // Mas já pode ser planejado nos corredores (a próxima perna).
    corredor_manual_id: corredorId ? parseInt(corredorId) : null
  };
  await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
  // preserva o vínculo histórico da viagem de origem (marca saída, não apaga)
  if (_rotaOrigem){ await _marcarSaidaTransbordo(_rotaOrigem, pedidoId, `transbordo em ${patio}`, patio); }
  Object.assign(p, {
    status:'Transbordo', statusPlanilha:'Transbordo', cidadeTransbordo:patio,
    patioAtual:patio,
    aguardandoTransbordo: !corredorId, qtdTransbordos: (p.qtdTransbordos||0)+1,
    corredorManualId: corredorId ? parseInt(corredorId) : null
  });
  // registra a perna que acabou (para os trechos automáticos usarem depois)
  try {
    await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: rotuloAntes, status_novo: 'Transbordo',
      usuario_nome: usuario, usuario_perfil: perfil,
      observacao: `🔁 Transbordo no pátio de ${patio}${cegonhaAnterior?' — chegou com '+cegonhaAnterior:''}${corredorId?' — direcionado a um corredor':' — aguardando definição de corredor'}`
    });
  } catch(_){}
  // notifica comercial sobre o transbordo do pedido
  if (typeof notificar === 'function'){
    try { notificar({ perfil:'comercial', tipo:'status', pedidoId: parseInt(pedidoId),
      titulo:'🔁 Transbordo registrado', mensagem:`#${pedidoId} transbordou no pátio de ${patio}.` }); } catch(_){}
  }
}

// Confirma o transbordo de 1 ou vários carros — todos vão para o MESMO pátio
// e o MESMO corredor escolhidos no modal.
async function _confirmarTransbordoStatus(pedidoIds, rotuloAntes){
  const ids = (Array.isArray(pedidoIds) ? pedidoIds : String(pedidoIds).split(','))
    .map(x => parseInt(x)).filter(n => !isNaN(n));
  const alvos = ids.map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;
  const patio = document.getElementById('transbPatio')?.value || '';
  const corredorId = document.getElementById('transbCorredor')?.value || null;
  if (!patio){ alert('Selecione o pátio onde o(s) carro(s) vai(vão) ficar.'); return; }
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  const usuario = _usuarioAtualNome() || '';
  const btn = document.getElementById('modalTransbStatus')?.querySelector('.btn-primary');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Registrando...'; }
  const falhas = [];
  try {
    for (const p of alvos){
      // cada carro pode estar num status diferente; usa o rótulo real quando houver
      const rotulo = (typeof statusPlanilhaDoPedido === 'function')
        ? (statusPlanilhaDoPedido(p) || rotuloAntes) : rotuloAntes;
      try { await _aplicarTransbordoPedido(p, patio, corredorId, rotulo, usuario, perfil); }
      catch(e){ falhas.push(`#${p.id}: ${e.message||e}`); }
    }
    document.getElementById('modalTransbStatus')?.remove();
    await recarregarPedidos();
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof renderizarPlanejamentoRotas === 'function') renderizarPlanejamentoRotas();
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();
    if (typeof renderizarVagasPorRota === 'function') renderizarVagasPorRota();
    const ok = alvos.length - falhas.length;
    if (falhas.length) alert(`Alguns carros não puderam ser transbordados:\n\n• ${falhas.join('\n• ')}`);
    if (ok > 0 && typeof exibirMensagem === 'function'){
      const quem = ok === 1 ? `#${alvos[0].id}` : `${ok} carros`;
      exibirMensagem('mensagemLogistica',
        `🔁 ${quem} em transbordo no pátio de ${patio}${corredorId?' e direcionado(s) ao corredor':''}. ${corredorId?'':'Veja em "Aguardando transbordo".'}`, 'success');
    }
  } catch(e){
    if (btn){ btn.disabled = false; btn.textContent = '✅ Confirmar transbordo'; }
    alert('Erro ao registrar transbordo: '+(e.message||e));
  }
}

// Marca (planejamento) que um pedido vai transbordar em determinada parada — só um lembrete visual
async function _setTransbordoPrevisto(pedidoId, cidade){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const valor = cidade || null;
  try {
    await supabase.from('pedidos').update({ transbordo_previsto: valor }).eq('id', parseInt(pedidoId));
    p.transbordoPrevisto = valor;
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof exibirMensagem === 'function' && valor) exibirMensagem('mensagemLogistica', `🔁 #${pedidoId}: transbordo planejado em ${valor}.`, 'success');
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

// ============================================================
// VIAGENS EM ANDAMENTO — tela principal de acompanhamento de viagens ativas
// Inspirada no layout "Jornada da Viagem". Construída em blocos.
// ============================================================
let _viagemSelecionada = null;

// As 7 etapas da jornada da viagem
const VIAGEM_ETAPAS = [
  { id:'criada',     num:'01', label:'Viagem Criada',  icone:'✓' },
  { id:'fechada',    num:'02', label:'Carga Fechada',  icone:'📦' },
  { id:'coleta',     num:'03', label:'Coleta Iniciada',icone:'🚚' },
  { id:'viagem',     num:'04', label:'Em Viagem',      icone:'🚛' },
  { id:'transbordo', num:'05', label:'Transbordo',     icone:'🔁' },
  { id:'entrega',    num:'06', label:'Entrega Final',  icone:'📥' },
  { id:'encerrada',  num:'07', label:'Viagem Encerrada',icone:'🏁' },
];

// Deduz em qual etapa a viagem está, a partir dos status dos carros da rota
function _viagemEtapaAtual(rota, carros){
  if (rota.status === 'concluida') return 6; // encerrada
  const temTransbordo = carros.some(c => c.status === 'Transbordo');
  const todosEntregues = carros.length > 0 && carros.every(c => ['Entregue','Cancelado'].includes(c.status));
  const algumEmTransporte = carros.some(c => c.status === 'Em Transporte');
  const algumColetado = carros.some(c => ['Em Coleta','Coletado'].includes(statusPlanilhaDoPedido(c)) || c.status === 'Em Coleta');
  const algumEntregue = carros.some(c => c.status === 'Entregue');
  if (todosEntregues) return 5; // entrega final (aguardando encerrar)
  if (algumEntregue && !algumEmTransporte) return 5;
  if (temTransbordo) return 4; // transbordo
  if (algumEmTransporte) return 3; // em viagem
  if (algumColetado) return 2; // coleta iniciada
  if (rota.status === 'em_andamento') return 3;
  return 1; // carga fechada / criada
}

function renderizarViagensAndamento(){
  const cont = document.getElementById('painelViewViagens');
  if (!cont) return;
  // Viagens ativas = rotas em andamento (ou planejadas com carga)
  const rotasAtivas = (rotasGlobais||[]).filter(r =>
    r.status === 'em_andamento' || r.status === 'planejada');

  if (rotasAtivas.length === 0){
    cont.innerHTML = `<p class="text-muted" style="padding:1.5rem;text-align:center">🚚 Nenhuma viagem em andamento no momento.<br><span style="font-size:.85rem">Crie e inicie uma rota para acompanhá-la aqui.</span></p>`;
    return;
  }

  // Se nenhuma selecionada, seleciona a primeira
  if (!_viagemSelecionada || !rotasAtivas.find(r => String(r.id)===String(_viagemSelecionada))){
    _viagemSelecionada = rotasAtivas[0].id;
  }
  const rota = rotasAtivas.find(r => String(r.id)===String(_viagemSelecionada));
  const carros = _veiculosNaRota(rota.id);

  // Lista lateral de viagens + detalhe da selecionada
  cont.innerHTML = `
    <div class="viagens-layout">
      <div class="viagens-lista">
        <div class="viagens-lista-tit">🚚 Viagens ativas (${rotasAtivas.length})</div>
        ${rotasAtivas.map(r => {
          const cs = _veiculosNaRota(r.id);
          const et = _viagemEtapaAtual(r, cs);
          const sel = String(r.id)===String(_viagemSelecionada);
          return `<div class="viagem-item ${sel?'sel':''}" onclick="_selecionarViagem(${r.id})">
            <div class="viagem-item-nome">${r.nome || ('Rota #'+r.id)}</div>
            <div class="viagem-item-sub">🚛 ${r.placa_cegonha||'a definir'} · ${cs.length} carro(s)</div>
            ${(() => {
              // Rota real do caminhão: origem → destino, abreviado para caber
              // na lista. Com destinos diferentes, mostra o primeiro e conta.
              const orig = [...new Set(cs.map(c => c.cidadeOrigem).filter(Boolean))];
              const dest = [...new Set(cs.map(c => c.cidadeDestino).filter(Boolean))];
              if (!orig.length && !dest.length) return '';
              const curto = (t) => String(t||'').length > 14 ? String(t).slice(0,13) + '.' : (t || '?');
              const fim = dest.length > 1 ? `${curto(dest[0])} +${dest.length-1}` : curto(dest[0]);
              return `<div class="viagem-item-rota">🛣️ ${curto(orig[0])} → ${fim}</div>`;
            })()}
            ${(() => {
              const dt = r.data_saida || r.created_at;
              if (!dt) return '';
              const d = new Date(dt);
              if (isNaN(d)) return '';
              return `<div class="viagem-item-data">📅 ${d.toLocaleDateString('pt-BR')}</div>`;
            })()}
            <div class="viagem-item-etapa">${VIAGEM_ETAPAS[et].icone} ${VIAGEM_ETAPAS[et].label}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="viagem-detalhe">
        ${_viagemDetalheHTML(rota, carros)}
      </div>
    </div>`;
}

function _selecionarViagem(rotaId){
  _viagemSelecionada = rotaId;
  renderizarViagensAndamento();
}

// Salva valor do terceiro + guia ICMS em todos os carros da rota
async function _viagemSalvarTerceiro(rotaId){
  const vTerc = document.getElementById('jvValorTerceiro_'+rotaId)?.value.trim();
  const vGuia = document.getElementById('jvGuiaIcms_'+rotaId)?.value.trim();
  const valorTerceiro = vTerc === '' || vTerc == null ? null : parseFloat(vTerc);
  const guiaIcms = vGuia === '' || vGuia == null ? null : parseFloat(vGuia);
  const carros = _veiculosNaRota(rotaId);
  try {
    await Promise.all(carros.map(p => {
      const pg = (pedidosGlobais||[]).find(x => String(x.id)===String(p.id));
      if (pg){ pg.valorMotoristaTerceiro = valorTerceiro; pg.guiaIcmsValor = guiaIcms; }
      return supabase.from('pedidos').update({ valor_motorista_terceiro: valorTerceiro, guia_icms_valor: guiaIcms }).eq('id', p.id);
    }));
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao('✅ Pagamento do terceiro salvo!');
    else alert('Pagamento do terceiro salvo!');
  } catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
}

function _viagemDetalheHTML(rota, carros){
  const etapaAtual = _viagemEtapaAtual(rota, carros);
  const origem = carros[0] ? `${carros[0].cidadeOrigem||''}/${carros[0].ufOrigem||''}` : '—';
  const destinos = [...new Set(carros.map(c => `${c.cidadeDestino||''}/${c.ufDestino||''}`))];
  const destinoFinal = destinos.length === 1 ? destinos[0] : `${destinos.length} destinos`;

  // Timeline horizontal das 7 etapas
  const timeline = `<div class="jv-timeline">
    ${VIAGEM_ETAPAS.map((e, i) => {
      const feito = i < etapaAtual;
      const atual = i === etapaAtual;
      const cls = feito ? 'feito' : (atual ? 'atual' : 'pendente');
      return `<div class="jv-etapa ${cls}">
        <div class="jv-bolha">${feito ? '✓' : e.icone}</div>
        <div class="jv-num">${e.num}</div>
        <div class="jv-label">${e.label}</div>
      </div>${i < VIAGEM_ETAPAS.length-1 ? `<div class="jv-conector ${feito?'feito':''}"></div>` : ''}`;
    }).join('')}
  </div>`;

  // Dados da viagem
  const dados = `<div class="jv-dados">
    <div class="jv-dados-tit">📋 ${rota.nome || ('Viagem #'+rota.id)} <span class="jv-badge">${_labelStatusRota(rota.status)}</span></div>
    <div class="jv-dados-grid">
      <div><span class="jv-dl">Origem</span><span class="jv-dv">${origem}</span></div>
      <div><span class="jv-dl">Destino final</span><span class="jv-dv">${destinoFinal}</span></div>
      <div><span class="jv-dl">Motorista</span><span class="jv-dv">${rota.motorista_1||'<em style="opacity:.6">a definir</em>'}
        <button class="jv-edit-btn" onclick="_viagemDefinirMotorista(${rota.id})" title="${rota.motorista_1?'Trocar o motorista':'Definir o motorista desta viagem'}">✏️</button></span></div>
      <div><span class="jv-dl">Caminhão / Carreta</span><span class="jv-dv">${rota.placa_cegonha||'<em style="opacity:.6">a definir</em>'}
        <button class="jv-edit-btn" onclick="_viagemDefinirCegonha(${rota.id})" title="${rota.placa_cegonha?'Trocar o caminhão':'Definir o caminhão desta viagem'}">✏️</button></span></div>
      <div><span class="jv-dl">Carros na carga</span><span class="jv-dv">${carros.length}</span></div>
      <div><span class="jv-dl">Frete da carga</span><span class="jv-dv" style="color:#4ade80;font-weight:700">${
        'R$ ' + carros.reduce((soma, c) => soma + (Number(c.valorFrete) || 0), 0)
                     .toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      }</span></div>
      <div><span class="jv-dl">Status</span><span class="jv-dv">${VIAGEM_ETAPAS[etapaAtual].label}</span></div>
    </div>
  </div>`;

  // ===== BLOCO Motorista Terceiro (só aparece quando o motorista da rota é terceiro) =====
  const motRota = (motoristasGlobais||[]).find(m => normNomeMotorista(m.nome||'') === normNomeMotorista(rota.motorista_1||''));
  const ehTerceiro = motRota && motRota.vinculo === 'terceiro';
  let blocoTerceiro = '';
  if (ehTerceiro){
    // usa o primeiro carro como referência para o valor (é por viagem)
    const pRef = carros[0];
    const valorTerc = pRef && (pRef.valorMotoristaTerceiro != null ? pRef.valorMotoristaTerceiro : '') || '';
    const guiaIcms = pRef && (pRef.guiaIcmsValor != null ? pRef.guiaIcmsValor : '') || '';
    blocoTerceiro = `<div class="jv-terceiro">
      <div class="jv-terceiro-tit">🤝 Motorista terceiro — pagamento</div>
      <div class="jv-terceiro-grid">
        <div class="jv-terceiro-campo">
          <label>Valor a pagar ao terceiro (R$)</label>
          <input type="number" step="0.01" id="jvValorTerceiro_${rota.id}" value="${valorTerc}" placeholder="0,00">
        </div>
        <div class="jv-terceiro-campo">
          <label>Guia de ICMS (R$) <span class="text-muted">— vazio se não passa no posto</span></label>
          <input type="number" step="0.01" id="jvGuiaIcms_${rota.id}" value="${guiaIcms}" placeholder="sem guia">
        </div>
        <button class="btn btn-sm btn-primary" onclick="_viagemSalvarTerceiro(${rota.id})">💾 Salvar</button>
      </div>
    </div>`;
  }

  // ===== BLOCO 2: Veículos na carga + Resumo com barra de ocupação =====
  const cap = _capacidadeRota(rota) || 11;
  const ocupados = carros.length;
  const pctOcup = Math.round((ocupados / cap) * 100);
  const disponivel = Math.max(0, cap - ocupados);

  const veiculosCarga = `<div class="jv-carga">
    <div class="jv-carga-cab">
      <span class="jv-carga-tit">📦 Veículos na carga <span class="text-muted">(${ocupados}/${cap})</span></span>
      <span class="jv-carga-badge">${ocupados} carregado(s)</span>
    </div>
    ${carros.length === 0 ? '<p class="text-muted" style="padding:.6rem;font-size:.85rem">Nenhum carro nesta carga ainda.</p>' : `
    <div style="overflow-x:auto">
    <table class="jv-tabela">
      <thead><tr><th>Placa</th><th>Modelo</th><th>Cliente</th><th>Origem</th><th>Destino</th><th>Status</th></tr></thead>
      <tbody>
        ${carros.map(c => `<tr>
          <td><strong>${c.placa||'—'}</strong></td>
          <td>${c.modelo||'—'}</td>
          <td title="${(c.cliente||'').replace(/"/g,'&quot;')}">${(c.cliente||'—')}</td>
          <td>${c.patioAtual ? '🅿️ '+(c.patioAtual.split('/')[0]) : (c.cidadeOrigem||'—')}</td>
          <td><strong>${c.cidadeDestino||'—'}</strong>${c.transbordoPrevisto && !c.cidadeTransbordo ? `<br><span class="jv-transb-prev" title="Transbordo planejado para este carro">🔁 transborda em ${c.transbordoPrevisto}</span>` : ''}</td>
          <td>${_statusPillPlanilha(c)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>
    ${disponivel > 0 ? `<div class="jv-vagas-livres">${disponivel} vaga(s) disponível(is)</div>` : ''}`}
  </div>`;

  const resumo = `<div class="jv-resumo">
    <div class="jv-resumo-tit">📊 Resumo da carga</div>
    <div class="jv-resumo-linhas">
      <div class="jv-resumo-item"><span>🚛 Capacidade total</span><strong>${cap} veículos</strong></div>
      <div class="jv-resumo-item"><span>📦 Carregados</span><strong>${ocupados} veículos</strong></div>
      <div class="jv-resumo-item"><span>🅿️ Disponível</span><strong>${disponivel} vaga(s)</strong></div>
    </div>
    <div class="jv-barra-ocup"><div class="jv-barra-fill" style="width:${pctOcup}%;background:${pctOcup>=80?'#4ade80':pctOcup>=40?'#fbbf24':'#fb923c'}"></div></div>
    <div class="jv-barra-pct">${pctOcup}% ocupado</div>
  </div>`;

  // ===== BLOCO 3: Ações rápidas (o coração da operação — eventos movem o status) =====
  const etTransbordo = carros.some(c => c.status === 'Transbordo');
  const podeColeta = carros.some(c => !['Em Transporte','Transbordo','Entregue','Cancelado'].includes(c.status));
  const podeEntrega = carros.some(c => c.status === 'Em Transporte');
  const acoes = `<div class="jv-acoes">
    <div class="jv-acoes-tit">⚡ Ações da viagem</div>
    <button class="jv-acao jv-acao-puxar" onclick="_viagemAcao(${rota.id},'puxar')">➕ Puxar pedido pra viagem</button>
    <button class="jv-acao jv-acao-coleta" onclick="_viagemAcao(${rota.id},'coleta')">🚚 Registrar Coleta</button>
    <button class="jv-acao jv-acao-viagem" onclick="_viagemAcao(${rota.id},'viagem')">🛫 Iniciar Viagem (saiu)</button>
    <button class="jv-acao jv-acao-entrega" onclick="_viagemAcao(${rota.id},'entrega')">📥 Registrar Entrega</button>
    <button class="jv-acao jv-acao-transbordo" onclick="_viagemAcao(${rota.id},'transbordo')">🔁 Registrar Transbordo</button>
    <button class="jv-acao jv-acao-ocorrencia" onclick="_viagemAcao(${rota.id},'ocorrencia')">⚠️ Registrar Ocorrência</button>
    <button class="jv-acao jv-acao-retirar" onclick="_viagemAcao(${rota.id},'retirar')">➖ Tirar carro da viagem</button>
    <button class="jv-acao jv-acao-trocaveic" onclick="_viagemAcao(${rota.id},'trocarveiculo')">🔄 Trocar veículo</button>
    <button class="jv-acao jv-acao-destino" onclick="_viagemAcao(${rota.id},'destino')">📍 Alterar destino</button>
    <button class="jv-acao jv-acao-romaneio" onclick="abrirFecharEnviarCarga(${rota.id})">📋 Romaneio da carga (enviar ao motorista)</button>
    <button class="jv-acao jv-acao-fiscal" onclick="_viagemEnviarFiscal(${rota.id})">📄 Enviar carga ao fiscal (espelho/CTe)</button>
    <button class="jv-acao jv-acao-finalizar" onclick="_viagemAcao(${rota.id},'finalizar')">🏁 Finalizar Viagem</button>
    <button class="jv-acao jv-acao-cancelar" onclick="_viagemAcao(${rota.id},'cancelar')">❌ Cancelar Rota</button>
  </div>`;

  // Documentos da viagem (reaproveita documentos_rota)
  const docs = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)===String(rota.id));
  const documentos = `<div class="jv-docs">
    <div class="jv-docs-tit">📄 Documentos da viagem</div>
    ${docs.length === 0 ? '<p class="text-muted" style="font-size:.82rem;padding:.3rem 0">Nenhum documento enviado ainda.</p>' :
      docs.map(d => `<div class="jv-doc-item"><span>📎 ${_docTipoLabel(d.tipo)}</span><a href="${d.url}" target="_blank" class="jv-doc-ver">abrir</a></div>`).join('')}
  </div>`;

  return `${timeline}
    <div class="jv-corpo">
      <div class="jv-col-esq">${dados}${blocoTerceiro}${resumo}${documentos}</div>
      <div class="jv-col-dir">${veiculosCarga}${acoes}</div>
    </div>`;
}

function _docTipoLabel(t){
  return ({ manifesto:'Manifesto', cte:'CT-e', romaneio:'Romaneio', conhecimento:'Conhecimento', checklist:'Check-list' })[t] || (t||'Documento');
}

// Dispatcher das ações da viagem — cada uma registra o EVENTO real e move o status
async function _viagemAcao(rotaId, acao){
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
  if (!rota) return;
  const carros = _veiculosNaRota(rotaId);
  if (acao === 'coleta')      return _viagemRegistrarColeta(rota, carros);
  if (acao === 'puxar')       return _viagemPuxarPedido(rota, carros);
  if (acao === 'viagem')      return _viagemIniciar(rota, carros);
  if (acao === 'entrega')     return _viagemRegistrarEntrega(rota, carros);
  if (acao === 'transbordo')  return _viagemRegistrarTransbordo(rota, carros);
  if (acao === 'ocorrencia')  return _viagemRegistrarOcorrencia(rota, carros);
  if (acao === 'retirar')     return _viagemRetirarCarro(rota, carros);
  if (acao === 'trocarveiculo') return _viagemTrocarVeiculo(rota, carros);
  if (acao === 'destino')     return _viagemAlterarDestino(rota, carros);
  if (acao === 'finalizar')   return _viagemFinalizar(rota, carros);
  if (acao === 'cancelar')    return _viagemCancelar(rota, carros);
}
// Modal genérico de seleção de carros para uma ação
function _viagemModalCarros(titulo, subtitulo, carros, corBtn, textoBtn, onConfirm){
  const old = document.getElementById('modalViagemAcao'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalViagemAcao';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">${titulo}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${subtitulo}</p>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.jv-sel-carro').forEach(c=>c.checked=true)">Marcar todos</button>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.jv-sel-carro').forEach(c=>c.checked=false)">Desmarcar</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
        ${carros.map(c => `<label class="jv-sel-linha">
          <input type="checkbox" class="jv-sel-carro" value="${c.id}" checked>
          <span><strong>${c.placa||'—'}</strong> · ${c.modelo||''} · ${c.cliente||''} <span class="text-muted">→ ${c.cidadeDestino||''}</span></span>
        </label>`).join('')}
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:1;background:${corBtn}" id="btnConfirmViagemAcao">${textoBtn}</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalViagemAcao').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnConfirmViagemAcao').onclick = () => {
    const ids = [...document.querySelectorAll('.jv-sel-carro:checked')].map(c => parseInt(c.value));
    if (ids.length === 0){ alert('Selecione pelo menos um carro.'); return; }
    onConfirm(ids);
  };
}

async function _viagemMudarStatusCarros(ids, statusInterno, statusPlanilha, obs){
  const usuario = _usuarioAtualNome() || 'Operador';
  const perfil = (typeof perfilAtual!=='undefined'?perfilAtual:'logistica');
  // ANTES: um laço sequencial com DOIS acessos ao servidor por carro
  // (update + histórico), cada um esperando o anterior. Com 11 carros eram
  // 22 idas em fila — 6 a 7 segundos — e a tela ia se preenchendo aos poucos,
  // mostrando 4, depois 6, depois todos.
  //
  // AGORA: uma única chamada para todos os carros (in.(...)) e os históricos
  // num insert só. Duas idas ao servidor, independente da quantidade.
  let ok = 0; const falhas = [];

  const alvos = ids
    .map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id)))
    .filter(Boolean);

  ids.forEach(id => {
    if (!alvos.some(p => String(p.id)===String(id))) falhas.push(id+' (não encontrado)');
  });

  if (alvos.length){
    // Guarda o status anterior de cada um ANTES de alterar, para o histórico
    const antesPorId = {};
    alvos.forEach(p => { antesPorId[p.id] = statusPlanilhaDoPedido(p); });

    try {
      const { error } = await supabase.from('pedidos')
        .update({ status: statusInterno, status_planilha: statusPlanilha })
        .in('id', alvos.map(p => p.id));
      if (error) throw error;

      // Memória atualizada de uma vez: a tela redesenha completa, sem etapas
      alvos.forEach(p => { p.status = statusInterno; p.statusPlanilha = statusPlanilha; });
      ok = alvos.length;

      // Cinto e suspensório: qualquer releitura disparada por outra tela nos
      // próximos segundos precisa ir ao banco, não à resposta guardada antes
      // desta gravação — senão ela sobrescreve a memória com a foto velha e
      // a tela "perde" os carros que acabamos de atualizar.
      if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();

      try {
        await supabase.from('historico_status').insert(
          alvos.map(p => ({
            pedido_id: p.id, status_anterior: antesPorId[p.id], status_novo: statusPlanilha,
            usuario_nome: usuario, usuario_perfil: perfil, observacao: obs
          }))
        );
      } catch(eh){ console.warn('Histórico não gravado:', eh?.message); }

    } catch(e){
      falhas.push((e?.message||'erro ao atualizar os carros'));
      console.error('Falha ao mudar status em lote', e);
    }
  }
  if (falhas.length){
    alert(`${ok} carro(s) atualizado(s). ${falhas.length} não atualizou:\n` + falhas.join('\n') + '\n\nTente novamente; se persistir, me avise a mensagem acima.');
  }
  return { ok, falhas };
}

async function _viagemRegistrarColeta(rota, carros){
  const elegiveis = carros.filter(c => !['Em Transporte','Transbordo','Entregue','Cancelado'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro pendente de coleta nesta viagem.'); return; }
  _viagemModalCarros('🚚 Registrar Coleta', 'Selecione os carros e informe como a coleta foi feita.', elegiveis, '#16a34a', '➡️ Continuar', async (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    _viagemModalFormaColeta(rota, ids);
  });
}

/* -------------------------------------------------------------------------
   COMO FOI A COLETA
   Espelha o "Como foi a entrega?", que já existia. A logística é quem faz o
   direcionamento no dia a dia, então faz sentido poder resolver aqui, na
   viagem, sem voltar ao lançamento do pedido.
   As três saídas são possibilidades a mais — o registro direto continua
   sendo a primeira opção, com um clique.
   ------------------------------------------------------------------------- */
function _viagemModalFormaColeta(rota, ids){
  const old = document.getElementById('modalFormaColeta'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalFormaColeta';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:470px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">🚚 Como foi a coleta?</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${ids.length} veículo(s).</p>

      <button class="forma-entrega-opt" onclick="_viagemColetaFeita(${rota.id}, [${ids.join(',')}])">
        <div class="feo-ic">✅</div>
        <div><div class="feo-tit">Já coletado</div><div class="feo-sub">O carro já está com a cegonha. Registra a coleta agora.</div></div>
      </button>

      <button class="forma-entrega-opt" onclick="_viagemColetaParaEquipe(${rota.id},[${ids.join(',')}])">
        <div class="feo-ic">👥</div>
        <div><div class="feo-tit">Direcionar para equipe de coleta</div><div class="feo-sub">Uma equipe busca o carro e leva até o pátio/base.</div></div>
      </button>

      <button class="forma-entrega-opt" onclick="_viagemColetaParaMotorista([${ids.join(',')}])">
        <div class="feo-ic">👤</div>
        <div><div class="feo-tit">Direcionar para um motorista</div><div class="feo-sub">Aparece no app dele, separado da carga da cegonha.</div></div>
      </button>

      <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('modalFormaColeta').remove()">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
}

async function _viagemColetaFeita(rotaId, ids){
  /* Coleta direta: recupera a rota pelo ID recebido pelo botão.
     Assim a função não depende de window.rotaAtual ou window.rota. */

  const rota = (rotasGlobais || []).find(
    r => String(r.id) === String(rotaId)
  );

  if (!rota){
    alert('Não foi possível localizar a viagem desta coleta.');
    return;
  }

  const _ctx = rota.placa_cegonha
    ? `cegonha ${rota.placa_cegonha}`
    : `viagem ${rota.nome || '#'+rota.id}`;

  try {
    await _viagemMudarStatusCarros(
      ids,
      'Em Coleta',
      'Coletado',
      `🚚 Coleta confirmada — carro carregado na ${_ctx}${rota.motorista_1 ? ' com '+rota.motorista_1 : ''}`
    );

    document.getElementById('modalFormaColeta')?.remove();

    if (typeof renderizarViagensAndamento === 'function'){
      renderizarViagensAndamento();
    }

  } catch(e){
    alert('Erro ao registrar coleta: ' + (e.message || e));
  }
}

// (b) equipe de coleta — reaproveita o modal da Central de Operações
function _viagemColetaParaEquipe(rotaId, ids){
  document.getElementById('modalFormaColeta')?.remove();
  if (typeof _centralModalEquipe === 'function'){ _centralModalEquipe(ids); return; }
  alert('Direcionamento para equipe indisponível nesta tela.');
}

// (c) motorista — grava em coleta_motorista, fora da carga
function _viagemColetaParaMotorista(ids){
  document.getElementById('modalFormaColeta')?.remove();
  if (typeof _centralModalMotoristaColeta === 'function'){ _centralModalMotoristaColeta(ids); return; }
  alert('Direcionamento para motorista indisponível nesta tela.');
}

async function _viagemIniciar(rota, carros){
  const elegiveis = carros.filter(c => {
    const rot = statusPlanilhaDoPedido(c);
    return ['Coletado','Enviado coleta'].includes(rot)
      || ['Em Coleta','Aguardando Confirmação'].includes(c.status||'');
  });
  if (elegiveis.length === 0){ alert('Nenhum carro pronto para iniciar viagem (precisa estar coletado).'); return; }
  _viagemModalCarros('🛫 Iniciar Viagem', 'Confirme os carros que saíram para viagem (Em transporte).', elegiveis, '#2563eb', '✅ Confirmar saída', async (ids) => {
    const _ctxV = `${rota.placa_cegonha ? rota.placa_cegonha : ('#'+rota.id)}`;
    await _viagemMudarStatusCarros(ids, 'Em Transporte', 'Em transporte',
      `🛫 Saiu para viagem na cegonha ${_ctxV}${rota.motorista_1?' com '+rota.motorista_1:''} — ${rota.nome||''}`);
    /* Marca a data de saída. Este botão só gravava o status; quem preenchia
       iniciada_em era o outro caminho (iniciar a rota pela tela de Rotas).
       Quem começava a viagem por aqui deixava o campo vazio, e todas as telas
       que mostram "quando saiu" — comercial, fiscal, linha do tempo — exibiam
       "não iniciada" numa viagem que já estava na estrada.
       Só grava se ainda não houver data: reiniciar a viagem não reescreve a
       saída original. */
    if (rota.status !== 'em_andamento' || !rota.iniciada_em){
      const upd = { status: 'em_andamento' };
      if (!rota.iniciada_em) upd.iniciada_em = new Date().toISOString();
      try {
        await supabase.from('rotas_planejadas').update(upd).eq('id', rota.id);
        rota.status = 'em_andamento';
        if (upd.iniciada_em) rota.iniciada_em = upd.iniciada_em;
      } catch(_){}
    }
    document.getElementById('modalViagemAcao').remove();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
    renderizarViagensAndamento();
  });
}

async function _viagemRegistrarEntrega(rota, carros){
  const elegiveis = carros.filter(c => c.status === 'Em Transporte');
  if (elegiveis.length === 0){ alert('Nenhum carro em transporte para entregar.'); return; }
  _viagemModalCarros('📥 Registrar Entrega', 'Selecione os carros que chegaram ao destino.', elegiveis, '#4ade80', '➡️ Continuar', async (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    _viagemModalFormaEntrega(rota, ids);
  });
}

// Pergunta COMO foi a entrega: motorista entregou na porta OU deixou no pátio para a equipe
function _viagemModalFormaEntrega(rota, ids){
  const old = document.getElementById('modalFormaEntrega'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalFormaEntrega';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:460px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">📥 Como foi a entrega?</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${ids.length} veículo(s). Informe quem finalizou a entrega ao cliente.</p>
      <button class="forma-entrega-opt" onclick="_viagemConfirmarEntregaMotorista([${ids.join(',')}])">
        <div class="feo-ic">🚛</div>
        <div><div class="feo-tit">Motorista entregou na porta do cliente</div><div class="feo-sub">Finaliza a operação por completo (Entregue).</div></div>
      </button>
      <button class="forma-entrega-opt" onclick="_viagemEntregaParaEquipe(${rota.id},[${ids.join(',')}])">
        <div class="feo-ic">👥</div>
        <div><div class="feo-tit">Motorista deixou no pátio/base</div><div class="feo-sub">Uma equipe de entrega leva até o cliente. Direciona para a equipe.</div></div>
      </button>
      <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('modalFormaEntrega').remove()">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
}

// Motorista entregou direto → conclui
async function _viagemConfirmarEntregaMotorista(ids){
  await _viagemMudarStatusCarros(ids, 'Entregue', 'Entregue', '📥 Entregue pelo motorista no cliente');
  document.getElementById('modalFormaEntrega')?.remove();
  const rotaId = (pedidosGlobais.find(p=>String(p.id)===String(ids[0]))||{}).rotaId;
  renderizarViagensAndamento();
  const rest = _veiculosNaRota(rotaId).filter(c => c.status !== 'Cancelado' && c.status !== 'Transbordo');
  if (rest.length && rest.every(c => c.status === 'Entregue')){
    setTimeout(() => { const r = rotasGlobais.find(x=>String(x.id)===String(rotaId)); if (r && confirm('✅ Todos os carros foram entregues. Finalizar a viagem?')) _viagemFinalizar(r, _veiculosNaRota(rotaId)); }, 300);
  }
}

// Motorista deixou no pátio → direciona para equipe de entrega
async function _viagemEntregaParaEquipe(rotaId, ids){
  document.getElementById('modalFormaEntrega')?.remove();
  // marca que chegou ao pátio e precisa de equipe (usa a Central: aguardando_retirada=false, mas fica pendente de entrega pela equipe)
  const _usr = _usuarioAtualNome() || 'Logística';
  // Cada carro tem cidade de destino própria, então o patch é por pedido —
  // o auxiliar agrupa os iguais e faz poucas chamadas em vez de uma por carro.
  await mmAtualizarPedidos(ids,
    (p) => ({ status:'Em Transporte', patio_atual: p.cidadeDestino, precisa_equipe_entrega: true }),
    (p) => { p.patioAtual = p.cidadeDestino; p.precisaEquipeEntrega = true; }
  );
  await mmRegistrarHistorico(ids.map(id => ({
    pedido_id: parseInt(id), status_anterior:'Em Transporte', status_novo:'Em Transporte',
    usuario_nome: _usr, observacao:'🚛→👥 Motorista deixou no pátio; direcionado para equipe de entrega'
  })));
  renderizarViagensAndamento();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `👥 ${ids.length} veículo(s) direcionado(s) para a equipe de entrega. Veja na Central de Operação.`, 'success');
}

// Item 1: registrar ocorrência escolhendo o carro; trava o pedido no status "Ocorrência"
async function _viagemRegistrarOcorrencia(rota, carros){
  const elegiveis = carros.filter(c => !['Entregue','Cancelado'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro elegível para registrar ocorrência.'); return; }
  const escolher = (ids) => _abrirModalOcorrencia(ids, rota);
  if (elegiveis.length === 1){ escolher([elegiveis[0].id]); return; }
  _viagemModalCarros('⚠️ Registrar Ocorrência', 'Selecione os carros que tiveram a ocorrência.', elegiveis, '#ef4444', '➡️ Continuar', (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    escolher(ids);
  });
}

/* Ocorrência com DESTINO definido.

   Antes a ocorrência era um beco sem saída: travava o carro no status
   "Ocorrência" e pronto — a vaga continuava ocupada na cegonha, ninguém
   podia encaixar outro carro no lugar, e não havia ação nenhuma a tomar.
   Agora, ao registrar, decide-se o que acontece com o carro. */
function _abrirModalOcorrencia(ids, rota){
  const alvos = (ids||[]).map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;
  const old = document.getElementById('modalOcorrencia'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalOcorrencia';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:540px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">⚠️ Registrar ocorrência</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 .8rem">
        ${alvos.length === 1 ? `Carro <strong>${alvos[0].placa||('#'+alvos[0].id)}</strong>` : `<strong>${alvos.length} carros</strong> selecionados`} — a ocorrência fica registrada no histórico do pedido.
      </p>
      ${alvos.length > 1 ? `<div class="ocor-lista">${alvos.map(c => `<div class="ocor-lista-item"><strong>#${c.id}</strong> · ${c.placa||'—'} · ${c.cliente||''}</div>`).join('')}</div>` : ''}

      <div class="form-group">
        <label>O que aconteceu?</label>
        <textarea id="ocorDescricao" rows="3" placeholder="Ex: pane mecânica no eixo, avaria no para-choque, sinistro na BR-277..."></textarea>
      </div>

      <div class="form-group">
        <label>Tipo</label>
        <select id="ocorTipo">
          <option value="mecanica">🔧 Pane / problema mecânico</option>
          <option value="avaria">💥 Avaria no veículo</option>
          <option value="sinistro">🚨 Sinistro / acidente</option>
          <option value="atraso">⏰ Atraso</option>
          <option value="documentacao">📄 Documentação</option>
          <option value="outro">❓ Outro</option>
        </select>
      </div>

      <div class="ocor-aviso">
        ⚠️ O carro <strong>sai da viagem e de todo o fluxo</strong>: solta da cegonha, libera a vaga
        e deixa de aparecer no planejamento. Fica em <strong>Pedidos</strong> com status
        <strong>Ocorrência</strong>, esperando decisão — e de lá dá para reverter.
      </div>

      <div class="form-group">
        <label>Onde o carro ficou?</label>
        <select id="ocorPatio">
          <option value="">— não informado —</option>
          ${(typeof PATIOS_FIXOS !== 'undefined' ? PATIOS_FIXOS : []).map(pt => `<option value="${pt}">${pt}</option>`).join('')}
        </select>
        <p class="text-muted" style="font-size:.76rem;margin:.35rem 0 0">
          Registra apenas a localização física do veículo — é o que vai orientar o corredor na hora de reverter.
        </p>
      </div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" style="flex:1;background:#ef4444" id="btnConfirmOcor">⚠️ Registrar ocorrência</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalOcorrencia').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnConfirmOcor').onclick = () => {
    const desc = document.getElementById('ocorDescricao')?.value.trim() || '';
    if (!desc){ alert('Descreva o que aconteceu.'); return; }
    const tipo = document.getElementById('ocorTipo')?.value || 'outro';
    const patio = document.getElementById('ocorPatio')?.value || '';
    document.getElementById('modalOcorrencia').remove();
    _confirmarOcorrencia(alvos.map(a => a.id), desc, rota, { tipo, patio });
  };
}
window._abrirModalOcorrencia = _abrirModalOcorrencia;

async function _confirmarOcorrencia(pedidoIds, descricao, rota, opcoes){
  const ids = Array.isArray(pedidoIds) ? pedidoIds : [pedidoIds];
  const alvos = ids.map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;
  const { tipo = 'outro', patio = '' } = (opcoes || {});
  const usuario = _usuarioAtualNome() || 'Logística';

  try {
    for (const p of alvos){
      const statusAntes = p.status;
      const _rotaOrigem = p.rotaId || p.rota_id || null;

      // O carro com ocorrência SAI DE TUDO: viagem, cegonha, motorista e
      // corredor. Não é planejável enquanto o problema não for resolvido —
      // ele fica só em Pedidos, com status Ocorrência, esperando decisão.
      // A vaga na cegonha abre na hora para outro carro entrar.
      const upd = {
        status: 'Ocorrência', status_planilha: 'Ocorrência',
        rota_id: null, placa_cegonha: null,
        motorista_1: null, motorista_2: null,
        corredor_manual_id: null,
        aguardando_transbordo: false
      };
      // Onde o carro ficou fisicamente — só localização, não muda o destino.
      if (patio){ upd.patio_atual = patio; upd.patio_desde = new Date().toISOString(); }

      await supabase.from('pedidos').update(upd).eq('id', parseInt(p.id));
      Object.assign(p, {
        status:'Ocorrência', statusPlanilha:'Ocorrência',
        rotaId:null, rota_id:null, placaCegonha:null,
        motorista1:null, motorista2:null,
        corredorManualId:null, aguardandoTransbordo:false,
        ...(patio ? { patioAtual: patio } : {})
      });

      // preserva o vínculo histórico com a viagem de origem
      if (_rotaOrigem && typeof _marcarSaidaTransbordo === 'function'){
        try { await _marcarSaidaTransbordo(_rotaOrigem, p.id, `ocorrência: ${descricao}`, patio || null); } catch(_){}
      }

      await supabase.from('ocorrencias').insert({
        tipo: 'ocorrencia', pedido_id: parseInt(p.id), descricao,
        usuario_nome: usuario, status: 'aberta',
        dados_extras: JSON.stringify({
          placa: p.placa, cliente: p.cliente, rota_id: rota?.id, cegonha: rota?.placa_cegonha,
          categoria: tipo, patio: patio || null
        })
      });
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(p.id), status_anterior: statusAntes, status_novo: 'Ocorrência',
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `⚠️ Ocorrência (${tipo}): ${descricao} — carro retirado da viagem${rota?.placa_cegonha?' '+rota.placa_cegonha:''}${patio?`, ficou em ${patio}`:''}. Aguardando decisão.`
      });
    }

    if (typeof notificar === 'function'){
      const quem = alvos.length === 1 ? `#${alvos[0].id} (${alvos[0].placa||''})` : `${alvos.length} carros`;
      notificar({ perfil:'logistica', tipo:'ocorrencia', pedidoId: parseInt(alvos[0].id),
        titulo:'⚠️ Ocorrência registrada', mensagem:`${quem}: ${descricao} — fora do fluxo até alguém reverter.` });
      notificar({ perfil:'comercial', tipo:'ocorrencia', pedidoId: parseInt(alvos[0].id),
        titulo:'⚠️ Ocorrência num pedido', mensagem:`${quem}: ${descricao}` });
      // Carro com CT-e emitido saindo da carga: o fiscal precisa saber.
      if (alvos.some(p => p.numeroCte || p.numero_cte)){
        notificar({ perfil:'fiscal', tipo:'ocorrencia', pedidoId: parseInt(alvos[0].id),
          titulo:'⚠️ Carro com CT-e saiu da carga',
          mensagem:`${quem} saiu da viagem por ocorrência. Confira o documento emitido.` });
      }
    }

    // o Acompanhamento guarda as ocorrências abertas em cache — invalida
    if (typeof _carregarOcorrenciasAbertas === 'function') await _carregarOcorrenciasAbertas(true);
    if (typeof _rmToastConfirmacao === 'function')
      _rmToastConfirmacao(`⚠️ Ocorrência registrada — ${alvos.length} carro(s) fora do fluxo, vaga(s) liberada(s).`);
    if (typeof recarregarPedidos === 'function') await recarregarPedidos();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();
  } catch(e){ alert('Erro ao registrar ocorrência: '+(e.message||e)); }
}

/* REVERTER OCORRÊNCIA — devolve o carro ao fluxo.
   Fica no painel de rastreio do pedido (Pedidos → clique no pedido), que é
   onde se olha quando alguém pergunta "e aquele carro que deu problema?".
   Só existe para ocorrência: tirar carro da viagem por mudança de plano é
   outro caminho, que não trava o pedido. */
async function _reverterOcorrencia(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  if (p.status !== 'Ocorrência'){ alert('Este pedido não está com ocorrência aberta.'); return; }

  // Corredores que fazem sentido a partir de onde o carro está parado.
  const ondeEsta = p.patioAtual || p.cidadeOrigem || '';
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const cidadeAtual = n(String(ondeEsta).split('/')[0]);
  const todos = (corredoresGlobais||[]);
  const sugeridos = todos.filter(c => {
    const paradas = (c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino];
    return paradas.some(cid => n(String(cid||'').split('/')[0]) === cidadeAtual);
  });

  const old = document.getElementById('modalReverterOcor'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalReverterOcor';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100060';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:500px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">↩️ Reverter ocorrência — #${p.id}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">
        <strong>${p.placa||'—'}</strong> · ${p.modelo||''} · destino ${p.cidadeDestino||'—'}.
        ${ondeEsta ? `Consta parado em <strong>${ondeEsta}</strong>.` : 'Localização não registrada.'}
        O carro volta a ser planejável.
      </p>

      <div class="form-group">
        <label>Direcionar para qual corredor?</label>
        <select id="reverterCorredor">
          <option value="">— deixar o sistema encaixar pela geografia —</option>
          ${sugeridos.length ? `<optgroup label="Partem de ${String(ondeEsta).split('/')[0]||'onde o carro está'}">
            ${sugeridos.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
          </optgroup>` : ''}
          ${todos.filter(c => !sugeridos.includes(c)).length ? `<optgroup label="Demais corredores">
            ${todos.filter(c => !sugeridos.includes(c)).map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}
          </optgroup>` : ''}
        </select>
        ${sugeridos.length ? `<p class="text-muted" style="font-size:.76rem;margin:.35rem 0 0">💡 ${sugeridos.length} corredor(es) passam por onde o carro está.</p>` : ''}
      </div>

      <div class="form-group">
        <label>O que foi resolvido? (fica no histórico)</label>
        <textarea id="reverterObs" rows="2" placeholder="Ex: guincho trocou o pneu, veículo liberado pela seguradora..."></textarea>
      </div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#22c55e" onclick="_confirmarReverterOcorrencia(${p.id})">✅ Devolver ao fluxo</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalReverterOcor').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}
window._reverterOcorrencia = _reverterOcorrencia;

async function _confirmarReverterOcorrencia(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const corredorId = document.getElementById('reverterCorredor')?.value || null;
  const obs = document.getElementById('reverterObs')?.value.trim() || '';
  const usuario = _usuarioAtualNome() || 'Logística';
  const cor = corredorId ? (corredoresGlobais||[]).find(c => String(c.id)===String(corredorId)) : null;

  try {
    // Volta ao fluxo normal. Se o carro está num pátio do meio do caminho,
    // ele já foi coletado — por isso não volta para "Pendente", que faria a
    // Central pedir uma coleta que já aconteceu.
    const novoStatus = p.patioAtual ? 'Em Coleta' : 'Pendente';
    const upd = {
      status: novoStatus,
      status_planilha: null,
      corredor_manual_id: corredorId ? parseInt(corredorId) : null
    };
    await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    Object.assign(p, { status: novoStatus, statusPlanilha: null,
      corredorManualId: corredorId ? parseInt(corredorId) : null });

    await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: 'Ocorrência', status_novo: novoStatus,
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: `↩️ Ocorrência revertida — carro devolvido ao planejamento${cor?` (corredor ${cor.nome})`:''}${obs?`. ${obs}`:''}.`
    });
    // fecha a ocorrência aberta deste pedido
    try {
      await supabase.from('ocorrencias')
        .update({ status: 'resolvida' })
        .eq('pedido_id', parseInt(pedidoId)).eq('status', 'aberta');
    } catch(_){}

    if (typeof notificar === 'function'){
      try { notificar({ perfil:'comercial', tipo:'status', pedidoId: parseInt(pedidoId),
        titulo:'↩️ Ocorrência resolvida', mensagem:`#${pedidoId} (${p.placa||''}) voltou ao planejamento.` }); } catch(_){}
    }

    if (typeof _carregarOcorrenciasAbertas === 'function') await _carregarOcorrenciasAbertas(true);
    document.getElementById('modalReverterOcor')?.remove();
    if (typeof _cgFecharRastreio === 'function') _cgFecharRastreio();
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao('↩️ Carro devolvido ao planejamento.');
    if (typeof recarregarPedidos === 'function') await recarregarPedidos();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
  } catch(e){ alert('Erro ao reverter a ocorrência: '+(e.message||e)); }
}
window._confirmarReverterOcorrencia = _confirmarReverterOcorrencia;

/* TIRAR CARRO DA VIAGEM — mudança de planejamento, não problema.

   Diferente da ocorrência de propósito: aqui não aconteceu nada de errado
   com o veículo, só mudou o plano (cliente desistiu, carro não ficou
   pronto, trocaram por outro). Por isso NÃO entra na tabela de ocorrências
   — senão o relatório de ocorrências vira um amontoado de decisões
   comerciais. O carro volta direto para o corredor, disponível para a
   próxima carga. */
async function _viagemRetirarCarro(rota, carros){
  const elegiveis = carros.filter(c => !['Entregue','Cancelado'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro para retirar desta viagem.'); return; }
  const abrir = (ids) => _abrirModalRetirarCarro(ids, rota);
  if (elegiveis.length === 1){ abrir([elegiveis[0].id]); return; }
  _viagemModalCarros('➖ Tirar carro da viagem', 'Selecione os carros que não vão mais nesta viagem.', elegiveis, '#94a3b8', '➡️ Continuar', (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    abrir(ids);
  });
}

function _abrirModalRetirarCarro(ids, rota){
  const alvos = (ids||[]).map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;
  const comCte = alvos.filter(p => p.numeroCte || p.numero_cte);
  const old = document.getElementById('modalRetirarCarro'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalRetirarCarro';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">➖ Tirar da viagem</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 .8rem">
        ${alvos.length === 1 ? `Carro <strong>${alvos[0].placa||('#'+alvos[0].id)}</strong>` : `<strong>${alvos.length} carros</strong>`}
        — sai da cegonha${rota?.placa_cegonha?' '+rota.placa_cegonha:''}, a vaga é liberada e ele
        <strong>volta para o corredor</strong>, pronto para outra carga.
      </p>
      ${alvos.length > 1 ? `<div class="ocor-lista">${alvos.map(c => `<div class="ocor-lista-item"><strong>#${c.id}</strong> · ${c.placa||'—'} · ${c.cliente||''}</div>`).join('')}</div>` : ''}

      <div class="form-group">
        <label>Por que está saindo?</label>
        <select id="retirarMotivo">
          <option value="cliente_desistiu">🙅 Cliente desistiu / cancelou o embarque</option>
          <option value="nao_pronto">🔧 Carro não ficou pronto a tempo</option>
          <option value="trocado">🔄 Trocado por outro carro</option>
          <option value="erro_planejamento">📋 Erro de planejamento</option>
          <option value="outro">❓ Outro</option>
        </select>
      </div>
      <div class="form-group">
        <label>Observação (opcional)</label>
        <input type="text" id="retirarObs" placeholder="Detalhe, se quiser">
      </div>

      ${comCte.length ? `<div class="retirar-alerta">
        📄 ${comCte.length} carro(s) já tem CT-e emitido. O fiscal será avisado de que saiu da carga.
      </div>` : ''}

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#64748b" id="btnConfirmRetirar">➖ Tirar da viagem</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalRetirarCarro').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnConfirmRetirar').onclick = () => {
    const motivo = document.getElementById('retirarMotivo')?.value || 'outro';
    const obs = document.getElementById('retirarObs')?.value.trim() || '';
    document.getElementById('modalRetirarCarro').remove();
    _confirmarRetirarCarro(alvos.map(a => a.id), rota, motivo, obs);
  };
}
window._abrirModalRetirarCarro = _abrirModalRetirarCarro;

async function _confirmarRetirarCarro(ids, rota, motivo, obs){
  const alvos = (ids||[]).map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  if (alvos.length === 0) return;
  const usuario = _usuarioAtualNome() || 'Logística';
  const rotulos = {
    cliente_desistiu: 'cliente desistiu do embarque',
    nao_pronto: 'carro não ficou pronto a tempo',
    trocado: 'trocado por outro carro',
    erro_planejamento: 'erro de planejamento',
    outro: 'outro motivo'
  };
  const rotuloMotivo = rotulos[motivo] || 'outro motivo';

  try {
    for (const p of alvos){
      const statusAntes = p.status;
      const _rotaOrigem = p.rotaId || p.rota_id || null;
      // Sai da cegonha e volta a ser planejável. O corredor_manual_id é
      // PRESERVADO: se o carro tinha um corredor fixado, volta para o mesmo.
      const upd = {
        rota_id: null, placa_cegonha: null,
        motorista_1: null, motorista_2: null,
        percent_motorista_1: null, percent_motorista_2: null,
        // já coletado volta como "Em Coleta"; ainda não coletado volta a Pendente
        status: p.patioAtual ? 'Em Coleta' : 'Pendente',
        status_planilha: null
      };
      await supabase.from('pedidos').update(upd).eq('id', parseInt(p.id));
      Object.assign(p, { rotaId:null, rota_id:null, placaCegonha:null,
        motorista1:null, motorista2:null,
        status: upd.status, statusPlanilha: null });

      if (_rotaOrigem && typeof _marcarSaidaTransbordo === 'function'){
        try { await _marcarSaidaTransbordo(_rotaOrigem, p.id, `retirado da viagem: ${rotuloMotivo}`, p.patioAtual || null); } catch(_){}
      }
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(p.id), status_anterior: statusAntes, status_novo: upd.status,
        usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
        observacao: `➖ Retirado da viagem${rota?.placa_cegonha?' '+rota.placa_cegonha:''} — ${rotuloMotivo}${obs?`. ${obs}`:''}. Voltou ao corredor.`
      });
    }

    if (typeof notificar === 'function'){
      const quem = alvos.length === 1 ? `#${alvos[0].id} (${alvos[0].placa||''})` : `${alvos.length} carros`;
      try { notificar({ perfil:'comercial', tipo:'status', pedidoId: parseInt(alvos[0].id),
        titulo:'➖ Carro saiu da viagem', mensagem:`${quem}: ${rotuloMotivo}. Voltou para o planejamento.` }); } catch(_){}
      const comCte = alvos.filter(p => p.numeroCte || p.numero_cte);
      if (comCte.length){
        try { notificar({ perfil:'fiscal', tipo:'status', pedidoId: parseInt(comCte[0].id),
          titulo:'📄 Carro com CT-e saiu da carga',
          mensagem:`${comCte.length} carro(s) com CT-e emitido saíram da viagem${rota?.placa_cegonha?' '+rota.placa_cegonha:''} (${rotuloMotivo}). Confira os documentos.` }); } catch(_){}
      }
    }

    if (typeof _rmToastConfirmacao === 'function')
      _rmToastConfirmacao(`➖ ${alvos.length} carro(s) fora da viagem — vaga(s) liberada(s).`);
    if (typeof recarregarPedidos === 'function') await recarregarPedidos();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();
  } catch(e){ alert('Erro ao retirar o carro da viagem: '+(e.message||e)); }
}
window._confirmarRetirarCarro = _confirmarRetirarCarro;

/* TROCA DE VEÍCULO na viagem já planejada (item 8).
   Existe também no modal de criar viagem, mas o caso real é este: a carga
   já está montada e, na hora de embarcar, o carro é outro. */
async function _viagemTrocarVeiculo(rota, carros){
  const elegiveis = carros.filter(c => !['Entregue','Cancelado'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro nesta viagem.'); return; }
  const trocar = (ids) => {
    if (typeof _planTrocarVeiculo === 'function') _planTrocarVeiculo(ids[0]);
    else alert('Função de troca indisponível.');
  };
  if (elegiveis.length === 1){ trocar([elegiveis[0].id]); return; }
  // Troca é um-a-um por natureza: cada carro vira um veículo diferente.
  _viagemModalCarros('🔄 Trocar veículo', 'Selecione o carro que será substituído (um por vez — cada troca é de um veículo por outro).', elegiveis, '#38bdf8', '➡️ Continuar', (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    trocar(ids);
  });
}

/* ALTERAR DESTINO — o cliente mudou de ideia no meio do caminho.
   Caso típico: carro de Londrina para Ampére, o cliente desiste e vai
   retirar em Cascavel. Não é ocorrência (nada deu errado) nem retirada da
   viagem (o carro continua indo): é o destino que mudou, e com ele o frete
   e o CT-e. */
async function _viagemAlterarDestino(rota, carros){
  const elegiveis = carros.filter(c => !['Cancelado'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro nesta viagem.'); return; }
  if (elegiveis.length === 1){ _abrirModalAlterarDestino(elegiveis[0].id, rota); return; }
  _viagemModalCarros('📍 Alterar destino', 'Selecione o carro cujo destino mudou (um por vez — cada um tem seu frete).', elegiveis, '#22d3ee', '➡️ Continuar', (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    _abrirModalAlterarDestino(ids[0], rota);
  });
}

function _abrirModalAlterarDestino(pedidoId, rota){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const temCte = !!(p.numeroCte || p.numero_cte);
  const freteAtual = Number(p.valorFrete || 0);
  const old = document.getElementById('modalAlterarDestino'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalAlterarDestino';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100060';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:540px;width:94%;max-height:90vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">📍 Alterar destino — #${p.id}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">
        <strong>${p.placa||'—'}</strong> · ${p.modelo||''} · ${p.cliente||''}<br>
        Hoje: ${p.cidadeOrigem||'—'} → <strong>${p.cidadeDestino||'—'}${p.ufDestino?'/'+p.ufDestino:''}</strong>
        ${p.patioAtual?` · consta em ${p.patioAtual}`:''}
      </p>

      <div class="form-row" style="display:flex;gap:10px">
        <div class="form-group" style="flex:2">
          <label>Novo destino (cidade)</label>
          <input type="text" id="destNovaCidade" placeholder="Ex: Cascavel" value="${(p.patioAtual||'').split('/')[0]||''}">
        </div>
        <div class="form-group" style="flex:1">
          <label>UF</label>
          <input type="text" id="destNovaUf" maxlength="2" placeholder="PR" value="${(p.patioAtual||'').split('/')[1]||''}">
        </div>
      </div>

      <div class="form-group">
        <label>Motivo</label>
        <select id="destMotivo">
          <option value="cliente_retira">🏢 Cliente vai retirar neste ponto</option>
          <option value="mudanca_endereco">🏠 Cliente mudou o endereço de entrega</option>
          <option value="redirecionamento">↪️ Redirecionamento comercial</option>
          <option value="outro">❓ Outro</option>
        </select>
      </div>

      <label class="dest-check">
        <input type="checkbox" id="destRetiraPatio" checked>
        <span>O cliente retira no pátio (entra no fluxo de retirada ao chegar)</span>
      </label>

      <div class="form-row" style="display:flex;gap:10px;margin-top:6px">
        <div class="form-group" style="flex:1">
          <label>Frete atual</label>
          <input type="text" value="R$ ${freteAtual.toLocaleString('pt-BR',{minimumFractionDigits:2})}" disabled>
        </div>
        <div class="form-group" style="flex:1">
          <label>Novo frete</label>
          <input type="number" id="destNovoFrete" step="0.01" value="${freteAtual}">
        </div>
      </div>

      <div class="form-group">
        <label>Como o fiscal/financeiro resolve o documento?</label>
        <select id="destTratativa">
          <option value="reemitir">🧾 Reemitir CT-e com o novo destino</option>
          <option value="desconto">💰 Manter o CT-e e dar desconto no faturamento</option>
          <option value="sem_cte">— ainda não há CT-e emitido —</option>
        </select>
        ${temCte ? `<p class="dest-cte-aviso">📄 Este pedido já tem CT-e ${p.numeroCte||p.numero_cte}. O fiscal será avisado da escolha acima.</p>` : ''}
      </div>

      <div class="form-group">
        <label>Observação (opcional)</label>
        <input type="text" id="destObs" placeholder="Detalhe da negociação, se houver">
      </div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1;background:#22d3ee;color:#04262b;font-weight:800" id="btnConfirmDestino">📍 Alterar destino</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalAlterarDestino').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  if (!temCte){ const sel = document.getElementById('destTratativa'); if (sel) sel.value = 'sem_cte'; }
  document.getElementById('btnConfirmDestino').onclick = () => {
    const cidade = document.getElementById('destNovaCidade')?.value.trim() || '';
    const uf = (document.getElementById('destNovaUf')?.value.trim() || '').toUpperCase();
    if (!cidade){ alert('Informe a cidade do novo destino.'); return; }
    const dados = {
      cidade, uf,
      motivo: document.getElementById('destMotivo')?.value || 'outro',
      retira: !!document.getElementById('destRetiraPatio')?.checked,
      frete: parseFloat(document.getElementById('destNovoFrete')?.value || '0') || 0,
      tratativa: document.getElementById('destTratativa')?.value || 'sem_cte',
      obs: document.getElementById('destObs')?.value.trim() || ''
    };
    document.getElementById('modalAlterarDestino').remove();
    _confirmarAlterarDestino(p.id, dados, rota);
  };
}
window._abrirModalAlterarDestino = _abrirModalAlterarDestino;

async function _confirmarAlterarDestino(pedidoId, d, rota){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const usuario = _usuarioAtualNome() || 'Logística';
  const destinoAntes = `${p.cidadeDestino||'—'}${p.ufDestino?'/'+p.ufDestino:''}`;
  const destinoDepois = `${d.cidade}${d.uf?'/'+d.uf:''}`;
  const freteAntes = Number(p.valorFrete||0);
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  // O carro já está no pátio do novo destino? Então a viagem dele acabou aqui.
  const chegou = !!p.patioAtual && n(String(p.patioAtual).split('/')[0]) === n(d.cidade);

  const rotulos = {
    cliente_retira:'cliente vai retirar neste ponto', mudanca_endereco:'cliente mudou o endereço',
    redirecionamento:'redirecionamento comercial', outro:'outro motivo'
  };
  const tratativas = {
    reemitir:'CT-e a reemitir com o novo destino',
    desconto:'CT-e mantido, desconto no faturamento',
    sem_cte:'sem CT-e emitido'
  };

  try {
    const upd = {
      cidade_destino: d.cidade,
      uf_destino: d.uf || p.ufDestino || null,
      valor_frete: d.frete,
      tipo_entrega: d.retira ? 'patio' : (p.tipoEntrega || 'domicilio')
    };
    // Chegou ao novo destino: o transporte deste pedido terminou aqui. Ele
    // sai da carga e passa a aguardar o cliente — não faz sentido continuar
    // na viagem rumo a um destino que não é mais o dele.
    if (chegou){
      upd.rota_id = null;
      upd.placa_cegonha = null;
      upd.status = 'Em Transporte';
      upd.status_planilha = 'Em transporte';
      if (d.retira) upd.aguardando_retirada = true;
    }
    await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    Object.assign(p, {
      cidadeDestino: d.cidade, ufDestino: d.uf || p.ufDestino,
      valorFrete: d.frete, tipoEntrega: upd.tipo_entrega,
      ...(chegou ? { rotaId:null, rota_id:null, placaCegonha:null, aguardandoRetirada: !!d.retira } : {})
    });

    if (chegou && rota?.id && typeof _marcarSaidaTransbordo === 'function'){
      try { await _marcarSaidaTransbordo(rota.id, p.id, `destino alterado para ${destinoDepois}`, p.patioAtual || null); } catch(_){}
    }

    const linha = `📍 Destino alterado de ${destinoAntes} para ${destinoDepois} — ${rotulos[d.motivo]||'outro motivo'}`
      + ` — frete de R$ ${freteAntes.toLocaleString('pt-BR',{minimumFractionDigits:2})} para R$ ${Number(d.frete).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
      + ` — ${tratativas[d.tratativa]||''}`
      + (chegou ? ` — pedido encerrado em ${d.cidade}${d.retira?', aguardando retirada pelo cliente':''}` : '')
      + (d.obs ? `. ${d.obs}` : '') + '.';
    await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: p.status, status_novo: upd.status || p.status,
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: linha
    });

    if (typeof notificar === 'function'){
      const quem = `#${p.id} (${p.placa||''})`;
      try {
        notificar({ perfil:'comercial', tipo:'status', pedidoId: parseInt(pedidoId),
          titulo:'📍 Destino alterado', mensagem:`${quem}: ${destinoAntes} → ${destinoDepois}. Frete agora R$ ${Number(d.frete).toLocaleString('pt-BR',{minimumFractionDigits:2})}.` });
        if (d.tratativa !== 'sem_cte'){
          notificar({ perfil:'fiscal', tipo:'status', pedidoId: parseInt(pedidoId),
            titulo: d.tratativa === 'reemitir' ? '🧾 CT-e precisa ser reemitido' : '💰 CT-e mantido com desconto',
            mensagem:`${quem}: destino ${destinoAntes} → ${destinoDepois}. ${tratativas[d.tratativa]}.` });
        }
        if (Number(d.frete) !== freteAntes){
          notificar({ perfil:'financeiro', tipo:'status', pedidoId: parseInt(pedidoId),
            titulo:'💰 Frete alterado', mensagem:`${quem}: R$ ${freteAntes.toLocaleString('pt-BR',{minimumFractionDigits:2})} → R$ ${Number(d.frete).toLocaleString('pt-BR',{minimumFractionDigits:2})} (${rotulos[d.motivo]||''}).` });
        }
      } catch(_){}
    }

    if (typeof _rmToastConfirmacao === 'function')
      _rmToastConfirmacao(chegou ? `📍 Destino alterado — pedido encerrado em ${d.cidade}.` : `📍 Destino alterado para ${destinoDepois}.`);
    if (typeof recarregarPedidos === 'function') await recarregarPedidos();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();
  } catch(e){ alert('Erro ao alterar o destino: '+(e.message||e)); }
}
window._confirmarAlterarDestino = _confirmarAlterarDestino;

async function _viagemRegistrarTransbordo(rota, carros){
  const elegiveis = carros.filter(c => !['Entregue','Cancelado','Transbordo'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro elegível para transbordo.'); return; }
  // usa o fluxo de transbordo que já existe (escolhe pátio → corredor).
  // Vários carros podem transbordar juntos: a escolha vale para todos os selecionados.
  if (elegiveis.length === 1){ _abrirModalTransbordoStatus([elegiveis[0].id], statusPlanilhaDoPedido(elegiveis[0])); return; }
  _viagemModalCarros('🔁 Registrar Transbordo', 'Selecione os carros que vão transbordar. O pátio e o corredor escolhidos em seguida valem para todos eles.', elegiveis, '#fb923c', '➡️ Continuar', async (ids) => {
    document.getElementById('modalViagemAcao').remove();
    const primeiro = (pedidosGlobais||[]).find(x => String(x.id)===String(ids[0]));
    _abrirModalTransbordoStatus(ids, primeiro ? statusPlanilhaDoPedido(primeiro) : 'Em Transporte');
  });
}

// Verifica se o fiscal completou os documentos de uma viagem:
// manifesto enviado + CTe enviado + número de CTe preenchido em TODOS os carros.
// Retorna { ok:true } ou { ok:false, faltas:[...] }
function _fiscalDocsCompletos(rotaId){
  const faltas = [];
  const docs = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)===String(rotaId));
  const temManifesto = docs.some(d => d.tipo === 'manifesto');
  const temCtePdf = docs.some(d => d.tipo === 'cte');
  if (!temManifesto) faltas.push('Manifesto não foi enviado');
  if (!temCtePdf) faltas.push('CTe (PDF) não foi enviado');
  // número de CTe em todos os carros (agrupa por grupo, 1 CTe por pedido)
  const carros = (typeof _veiculosNaRota === 'function') ? _veiculosNaRota(rotaId) : [];
  const semNumero = carros.filter(p => !(p.numeroCte || p.numero_cte));
  if (semNumero.length > 0) faltas.push(`${semNumero.length} carro(s) sem número de CTe preenchido`);
  return { ok: faltas.length === 0, faltas };
}

async function _viagemFinalizar(rota, carros){
  // TRAVA FISCAL: não deixa finalizar se o fiscal não completou manifesto + CTe + números.
  const fisc = _fiscalDocsCompletos(rota.id);
  if (!fisc.ok){
    alert('🚫 Não é possível finalizar esta viagem — o setor fiscal ainda não concluiu os documentos:\n\n• '
      + fisc.faltas.join('\n• ')
      + '\n\nSem isso, o motorista fica sem os documentos e o financeiro não consegue conferir. Aguarde o fiscal emitir/enviar tudo.');
    return;
  }
  const emViagem = carros.filter(c => !['Entregue','Cancelado','Transbordo'].includes(c.status));
  if (emViagem.length > 0){
    if (!confirm(`Ainda há ${emViagem.length} carro(s) não entregue(s) nesta viagem. Finalizar mesmo assim?`)) return;
  }
  if (typeof mudarStatusRota === 'function'){ await mudarStatusRota(rota.id, 'concluida', true); }
  _viagemSelecionada = null;
  renderizarViagensAndamento();
}

async function _viagemCancelar(rota, carros){
  const msg = `❌ CANCELAR a rota "${rota.nome||('#'+rota.id)}"?\n\n` +
    `Isso significa que a viagem NÃO aconteceu. Todos os ${carros.length} carro(s) voltam ao estado inicial ` +
    `(Aguardando coleta), sem motorista, cegonha ou rota, e reaparecem nos corredores para novo planejamento.\n\n` +
    `Esta ação fica registrada. Deseja continuar?`;
  if (!confirm(msg)) return;
  if (typeof mudarStatusRota === 'function'){ await mudarStatusRota(rota.id, 'cancelada'); }
  _viagemSelecionada = null;
  renderizarViagensAndamento();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `❌ Rota cancelada. Os carros voltaram para novo planejamento.`, 'success');
}

// Item 5 — Enviar carga ao fiscal (gera o espelho/PDF a partir da cegonha da viagem)
async function _viagemEnviarFiscal(rotaId){
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
  if (!rota){ alert('Rota não encontrada.'); return; }
  if (!rota.placa_cegonha){ alert('Esta viagem ainda não tem cegonha definida. Defina o veículo antes de gerar o espelho para o fiscal.'); return; }
  const carros = _veiculosNaRota(rota.id);
  if (carros.length === 0){ alert('Não há carros nesta viagem para gerar o espelho.'); return; }
  if (typeof gerarEspelhoCarga === 'function'){
    // gera o espelho da carga (mesmo PDF bonito), registrando para o fiscal
    await gerarEspelhoCarga(rota.placa_cegonha, { rotaId: rota.id });
    // Notifica o fiscal que há uma carga para emitir documentos.
    // A mensagem vai no celular, então precisa se bastar sozinha: quem é o
    // motorista, qual a cegonha, quantos carros e para onde vai.
    if (typeof notificar === 'function'){
      // O campo da rota é motorista_1 (e motorista_2 quando vai dupla)
      const motorista = [rota.motorista_1, rota.motorista_2].filter(Boolean).join(' + ');
      const origens  = [...new Set(carros.map(c => c.cidadeOrigem).filter(Boolean))];
      const destinos = [...new Set(carros.map(c => c.cidadeDestino).filter(Boolean))];
      const trecho = (origens.length && destinos.length)
        ? `${origens[0]} → ${destinos.length > 1 ? destinos.length + ' destinos' : destinos[0]}`
        : '';
      const clientes = [...new Set(carros.map(c => c.cliente).filter(Boolean))];
      const quemCliente = clientes.length === 1 ? clientes[0]
                        : clientes.length > 1 ? `${clientes.length} clientes` : '';

      const partes = [
        motorista ? `👤 ${motorista}` : '',
        `🚛 ${rota.placa_cegonha}`,
        `${carros.length} carro(s)`,
        trecho ? `📍 ${trecho}` : '',
        quemCliente ? `🏢 ${quemCliente}` : ''
      ].filter(Boolean);

      await notificar({
        perfil: 'fiscal', tipo: 'fiscal',
        titulo: '📄 Carga para emitir CT-e',
        mensagem: partes.join(' · ')
      });
      // Confirma para a própria logística (fica no sininho)
      await notificar({
        perfil: 'logistica', tipo: 'fiscal',
        titulo: '✅ Carga enviada ao fiscal',
        mensagem: `Você enviou a carga ${rota.placa_cegonha}${rota.nome?(' · '+rota.nome):''} (${carros.length} carro(s)) ao fiscal para emissão de CTe.`
      });
    }
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `📄 Espelho gerado e carga enviada ao fiscal (${carros.length} carro(s)).`, 'success');
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(`✅ Enviado ao setor fiscal (${carros.length} carro(s))!`);
  } else {
    alert('Função de espelho de carga não disponível.');
  }
}

function _labelStatusRota(st){
  return ({ em_andamento:'Em viagem', planejada:'Planejada', concluida:'Concluída', cancelada:'Cancelada' })[st] || st;
}

// ============================================================
// PLANEJAMENTO DE ROTAS — tela visual da logística (drag & drop)
// Substitui (futuramente) Corredores, Gestão Logística, Pedidos por Status e Rota Planejada.
// Bloco 1: estrutura (corredores | pedidos disponíveis | carros) + KPIs + resumo.
// ============================================================
let _planCorredorSel = null;

function _planParadasDoCorredor(c){
  if (!c) return [];
  if (c._paradas && c._paradas.length) return c._paradas.map(p => p.cidade);
  return [c.origem, c.destino].filter(Boolean);
}

// Pedidos que encaixam num corredor (não entregues, sem rota) — parte do pátio atual ou origem
function _planPedidosDoCorredor(c){
  const seq = (c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino];
  const paradasStr = seq.filter(Boolean);
  const vivos = (pedidosGlobais||[]).filter(p => {
    if (['Entregue','Cancelado'].includes(p.status||'')) return false;
    // Ocorrência sai do planejamento inteiro: o carro está parado esperando
    // decisão humana. Ele volta a aparecer aqui ao ser revertido em Pedidos.
    if (p.status === 'Ocorrência') return false;
    if (p.aprovado === false) return false;
    // aguardando transbordo tem área própria (não entra nos corredores por encaixe)
    if (p.aguardandoTransbordo) return false;
    // Transbordado direcionado a um corredor: aparece nele para planejar a PRÓXIMA perna,
    // MESMO ainda estando na viagem antiga (rota_id preenchido). Ele só some quando entra
    // numa nova viagem — momento em que o corredor_manual_id é limpo.
    if (p.status === 'Transbordo'){
      const corrManual = p.corredorManualId || p.corredor_manual_id;
      if (corrManual) return true;               // direcionado → aparece no corredor
      return !p.rotaId && !p.rota_id && !p.placaCegonha; // sem corredor → só se estiver livre
    }
    // demais: só se não estiverem em nenhuma viagem
    return !p.rotaId && !p.rota_id && !p.placaCegonha;
  });
  return vivos.filter(p => {
    // Corredor manual MANDA e é EXCLUSIVO: se o pedido foi jogado num corredor, só aparece nele
    if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
    // Encaixe automático: a carga só aparece no corredor cujo INÍCIO = origem e FIM = destino.
    // (corredor exato). Corredores que só passam pelo trecho no meio NÃO pegam a carga —
    // nesse caso ela cai em "Sem rota" para ser direcionada manualmente.
    const partida = p.patioAtual || p.cidadeOrigem;
    const soCidade = v => _norm((v || '').toString().split('/')[0]);
    const inicioCorr = paradasStr[0];
    const fimCorr = paradasStr[paradasStr.length - 1];
    return soCidade(partida) === soCidade(inicioCorr) && soCidade(p.cidadeDestino) === soCidade(fimCorr);
  });
}

// Rotas (carros) ativas ligadas a um corredor
function _planRotasDoCorredor(c){
  return (rotasGlobais||[]).filter(r =>
    String(r.corredor_id)===String(c.id) &&
    !['concluida','cancelada'].includes(r.status));
}

// Pedidos "sem rota" = ativos, sem rota/cegonha, que NÃO encaixam em nenhum corredor
function _planPedidosSemRota(){
  const corredores = corredoresGlobais || [];
  const vivos = (pedidosGlobais||[]).filter(p =>
    !['Entregue','Cancelado','Ocorrência'].includes(p.status||'')  // ocorrência espera decisão, fora do planejamento
    && !p.rotaId && !p.rota_id && !p.placaCegonha
    && !p.aguardandoTransbordo   // aguardando transbordo tem área própria
    && p.aprovado !== false);    // não-aprovados têm área própria
  return vivos.filter(p => {
    // se está em algum corredor (encaixe ou manual), não é "sem rota"
    return !corredores.some(c => _planPedidosDoCorredor(c).some(x => String(x.id)===String(p.id)));
  });
}

// Pedidos aguardando aprovação (área própria, separada de tudo)
function _planPedidosAguardandoAprovacao(){
  return (pedidosGlobais||[]).filter(p =>
    !['Entregue','Cancelado'].includes(p.status||'') && p.aprovado === false);
}

// Pedidos aguardando transbordo (área própria, separada de "sem rota")
function _planPedidosAguardandoTransbordo(){
  return (pedidosGlobais||[]).filter(p =>
    !['Entregue','Cancelado'].includes(p.status||'') && p.aguardandoTransbordo);
}

// Busca do Planejamento de Rotas — filtra a coluna de pedidos por cliente,
// placa, ID, referência, cidade, cegonha e motorista.
let _planBusca = '';
function _planFiltraBusca(lista){
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const b = n(_planBusca||'');
  if (!b) return lista || [];
  return (lista||[]).filter(p => n(`${p.cliente||''} ${p.placa||''} ${p.modelo||''} ${p.referencia||''} ${p.placaCegonha||''} ${p.motorista1||''} ${p.cidadeOrigem||''} ${p.ufOrigem||''} ${p.cidadeDestino||''} ${p.ufDestino||''} #${p.id} ${p.id}`).includes(b));
}
function _planSetBusca(){
  const el0 = document.getElementById('planBusca');
  _planBusca = el0?.value || '';
  const pos = el0?.selectionStart ?? null;
  renderizarPlanejamentoRotas();
  const el = document.getElementById('planBusca');
  if (el){ el.focus(); if (pos !== null){ try { el.setSelectionRange(pos,pos); } catch(_){} } }
}
function _planLimparBusca(){ _planBusca = ''; renderizarPlanejamentoRotas(); }
window._planSetBusca = _planSetBusca;
window._planLimparBusca = _planLimparBusca;
window._planFiltraBusca = _planFiltraBusca;

function renderizarPlanejamentoRotas(){
  const cont = document.getElementById('painelViewPlanejamento');
  if (!cont) return;
  const corredores = (corredoresGlobais || []).filter(c => {
    if (!c.excepcional) return true; // corredores oficiais sempre aparecem
    // rota excepcional: só aparece enquanto tiver pedido ativo (não concluído)
    return _planPedidosDoCorredor(c).length > 0;
  });
  if (corredores.length === 0){
    cont.innerHTML = `<p class="text-muted" style="padding:1.5rem;text-align:center">🗺️ Nenhum corredor cadastrado.<br><span style="font-size:.85rem">Cadastre corredores para planejar as rotas.</span></p>`;
    return;
  }
  const _modosEspeciais = ['__semrota__','__transbordo__','__aprovacao__'];
  if (!_modosEspeciais.includes(String(_planCorredorSel)) && (!_planCorredorSel || !corredores.find(c => String(c.id)===String(_planCorredorSel)))){
    _planCorredorSel = corredores[0].id;
  }
  const modoSemRota = String(_planCorredorSel) === '__semrota__';
  const modoTransbordo = String(_planCorredorSel) === '__transbordo__';
  const modoAprovacao = String(_planCorredorSel) === '__aprovacao__';
  const cor = (modoSemRota||modoTransbordo||modoAprovacao) ? null : corredores.find(c => String(c.id)===String(_planCorredorSel));
  const pedidosCol = _planFiltraBusca(modoSemRota ? _planPedidosSemRota() : modoTransbordo ? _planPedidosAguardandoTransbordo() : modoAprovacao ? _planPedidosAguardandoAprovacao() : _planPedidosDoCorredor(cor));
  const semRotaLista = _planPedidosSemRota();
  const transbordoLista = _planPedidosAguardandoTransbordo();
  const aprovacaoLista = _planPedidosAguardandoAprovacao();

  // KPIs
  const totalPedidos = (pedidosGlobais||[]).filter(p => !['Entregue','Cancelado'].includes(p.status||'')).length;
  const semRotaTotal = (pedidosGlobais||[]).filter(p => !['Entregue','Cancelado'].includes(p.status||'') && !p.rotaId && !p.rota_id && !p.placaCegonha && !p.aguardandoTransbordo).length;
  const tituloCol = modoSemRota ? '⚠️ Sem rota (não encaixam em corredor)' : modoTransbordo ? '🟣 Aguardando transbordo' : modoAprovacao ? '⏳ Aguardando aprovação' : ('Pedidos · ' + cor.nome);

  cont.innerHTML = `
    ${_planFolgasHTML()}
    <div class="plan-kpis">
      <div class="plan-kpi"><span class="plan-kpi-lbl">Total de pedidos ativos</span><span class="plan-kpi-num">${totalPedidos}</span></div>
      <div class="plan-kpi"><span class="plan-kpi-lbl">Sem rota (geral)</span><span class="plan-kpi-num" style="color:#ef4444">${semRotaTotal}</span></div>
      <div class="plan-kpi"><span class="plan-kpi-lbl">${modoSemRota?'Sem encaixe':'Neste corredor'}</span><span class="plan-kpi-num">${pedidosCol.length}</span></div>
    </div>

    <!-- Corredores em faixa horizontal, acima das colunas de trabalho.
         Como coluna lateral, com uma dúzia de corredores, trocar de corredor
         obrigava a descer a barra de rolagem e voltar. Aqui eles ficam lado a
         lado em duas fileiras, na largura inteira da tela. -->
    <div class="plan-col plan-corr-faixa">
      <div class="plan-col-tit plan-col-tit-corr">
        <span>Corredores</span>
        <button class="plan-novo-corr" onclick="_planAbrirNovaRotaLivre()" title="Criar um novo corredor">➕ Novo</button>
      </div>
      <div class="plan-col-dica">arraste um pedido para um corredor ↴</div>
      <div class="plan-corr-lista">
        <div class="plan-corr-item plan-corr-semrota ${modoSemRota?'sel':''}" onclick="_planSelSemRota()">
          <div class="plan-corr-nome">⚠️ Sem rota</div>
          <div class="plan-corr-sub">${semRotaLista.length} pedido(s) sem corredor</div>
        </div>
        ${transbordoLista.length > 0 ? `<div class="plan-corr-item plan-corr-transbordo ${modoTransbordo?'sel':''}" onclick="_planSelTransbordo()">
          <div class="plan-corr-nome">🟣 Aguardando transbordo</div>
          <div class="plan-corr-sub">${transbordoLista.length} pedido(s) na próxima perna</div>
        </div>` : ''}
        ${aprovacaoLista.length > 0 ? `<div class="plan-corr-item plan-corr-aprovacao ${modoAprovacao?'sel':''}" onclick="_planSelAprovacao()">
          <div class="plan-corr-nome">⏳ Aguardando aprovação</div>
          <div class="plan-corr-sub">${aprovacaoLista.length} pedido(s) a aprovar</div>
        </div>` : ''}
        ${corredores.map(c => {
          const ped = _planPedidosDoCorredor(c);
          const sel = String(c.id)===String(_planCorredorSel);
          return `<div class="plan-corr-item ${sel?'sel':''}" onclick="_planSelCorredor(${c.id})"
                ondragover="_planDragOverCorr(event)" ondragleave="_planDragLeaveCorr(event)" ondrop="_planDropCorr(event,${c.id})">
            <div class="plan-corr-nome">${c.nome}</div>
            <div class="plan-corr-sub">${c.sla_horas?('SLA '+c.sla_horas+'h · '):''}${ped.length} pedido(s)</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="plan-layout2">
      <!-- Coluna 1: Pedidos -->
      <div class="plan-col plan-col-pedidos">
        <div class="plan-col-tit">
          <span>${tituloCol} <span class="plan-col-badge">${pedidosCol.length}</span></span>
          ${modoSemRota
            ? `<button class="plan-criar-viagem" onclick="_planViagemDireta()" title="Cria a rota excepcional e já abre a viagem, num passo só">🚛 Criar viagem</button>`
            : (modoTransbordo||modoAprovacao) ? '' : `<button class="plan-criar-viagem" onclick="_planCriarViagem(${cor.id})">🚛 Criar viagem</button>`}
        </div>
        <div class="plan-busca">
          <span class="plan-busca-ic">🔍</span>
          <input type="text" id="planBusca"
                 placeholder="Cliente, placa, ID, referência, cidade, cegonha..."
                 value="${String(_planBusca).replace(/"/g,'&quot;')}"
                 oninput="_mmDeb('planBusca', _planSetBusca)">
          ${_planBusca ? `<button class="plan-busca-x" onclick="_planLimparBusca()" title="Limpar">✕</button>` : ''}
        </div>
        <div id="planPedidosLista" class="plan-pedidos-lista">
          ${modoSemRota ? _planSemRotaListaHTML() : modoTransbordo ? _planTransbordoListaHTML() : modoAprovacao ? _planAprovacaoListaHTML() : _planPedidosListaHTML(cor)}
        </div>
      </div>
    </div>`;
}

// Cria uma rota nova (vazia) para o corredor — abre pra planejar/escolher veículo
function _planNovaRotaVazia(corId){
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(corId));
  if (!cor) return;
  // reaproveita o modal de criar viagem, mas sem pré-selecionar pedidos
  _planAbrirModalViagem(cor, _planPedidosDoCorredor(cor), true);
}

// NOVO CORREDOR — cria um corredor do zero, com as cidades que o operador quiser
let _rotaLivreParadas = [];
function _planAbrirNovaRotaLivre(){
  _rotaLivreParadas = [];
  const old = document.getElementById('modalRotaLivre'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalRotaLivre';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">➕ Novo corredor</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">Crie um corredor com as cidades que você quiser. Ele passa a aparecer na lista de corredores e recebe pedidos automaticamente.</p>

      <div class="form-group">
        <label>Nome do corredor</label>
        <input type="text" id="rotaLivreNome" placeholder="Ex: Cascavel × Foz">
      </div>
      <div class="form-group">
        <label>SLA (horas)</label>
        <input type="number" id="rotaLivreSla" value="24" min="1" style="max-width:120px">
      </div>

      <div class="form-group">
        <label>Adicionar cidade / parada (na ordem da rota)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="rotaLivreCidade" placeholder="Digite a cidade e clique em +" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();_rotaLivreAddParada();}">
          <button class="btn btn-secondary" onclick="_rotaLivreAddParada()">+ Add</button>
        </div>
        <div style="margin-top:4px;font-size:.72rem;color:var(--text-tertiary,#6b7280)">Sugestões: ${PATIOS_FIXOS.slice(0,6).map(p=>`<a href="#" onclick="_rotaLivreAddSugestao('${p.split('/')[0]}');return false" style="color:#fb923c;margin-right:8px">${p.split('/')[0]}</a>`).join('')}</div>
      </div>

      <div id="rotaLivreParadas" class="rota-livre-paradas"></div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" style="flex:1" onclick="_rotaLivreConfirmar()">✅ Criar corredor</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalRotaLivre').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  _rotaLivreRenderParadas();
}

function _rotaLivreAddParada(){
  const inp = document.getElementById('rotaLivreCidade');
  const val = (inp?.value||'').trim();
  if (!val) return;
  _rotaLivreParadas.push(val);
  inp.value = ''; inp.focus();
  _rotaLivreRenderParadas();
}
function _rotaLivreAddSugestao(cidade){ _rotaLivreParadas.push(cidade); _rotaLivreRenderParadas(); }
function _rotaLivreRemoverParada(i){ _rotaLivreParadas.splice(i,1); _rotaLivreRenderParadas(); }
function _rotaLivreMoverParada(i, dir){
  const j = i + dir;
  if (j < 0 || j >= _rotaLivreParadas.length) return;
  [_rotaLivreParadas[i], _rotaLivreParadas[j]] = [_rotaLivreParadas[j], _rotaLivreParadas[i]];
  _rotaLivreRenderParadas();
}
function _rotaLivreRenderParadas(){
  const el = document.getElementById('rotaLivreParadas');
  if (!el) return;
  if (_rotaLivreParadas.length === 0){ el.innerHTML = '<p class="text-muted" style="font-size:.8rem;padding:.4rem">Nenhuma parada ainda. Adicione ao menos a origem e o destino.</p>'; return; }
  el.innerHTML = _rotaLivreParadas.map((c,i) => `
    <div class="rota-livre-parada">
      <span class="rlp-num">${i+1}</span>
      <span class="rlp-cidade">${c}</span>
      <span class="rlp-acoes">
        <button type="button" onclick="_rotaLivreMoverParada(${i},-1)" ${i===0?'disabled':''}>▲</button>
        <button type="button" onclick="_rotaLivreMoverParada(${i},1)" ${i===_rotaLivreParadas.length-1?'disabled':''}>▼</button>
        <button type="button" onclick="_rotaLivreRemoverParada(${i})" title="Remover">✕</button>
      </span>
    </div>`).join('');
}
function _rotaLivrePreencheMot(){
  const sel = document.getElementById('rotaLivreCegonha');
  const opt = sel?.options[sel.selectedIndex];
  const inp = document.getElementById('rotaLivreMotorista');
  if (inp) inp.value = opt?.getAttribute('data-mot') || '';
}
async function _rotaLivreConfirmar(){
  const nome = document.getElementById('rotaLivreNome')?.value.trim();
  if (!nome){ alert('Dê um nome para o corredor.'); return; }
  if (_rotaLivreParadas.length < 2){ alert('Adicione ao menos 2 cidades (origem e destino).'); return; }
  const sla = parseInt(document.getElementById('rotaLivreSla')?.value, 10) || 24;
  const origem = _rotaLivreParadas[0];
  const destino = _rotaLivreParadas[_rotaLivreParadas.length-1];
  try {
    const { data, error } = await supabase.from('corredores').insert({
      nome, origem, destino, sla_horas: sla, ativo: true, excepcional: true
    }).select();
    if (error) throw error;
    const cor = data && data[0];
    if (cor){
      const linhas = _rotaLivreParadas.map((cidade, i) => ({ corredor_id: cor.id, ordem: i+1, cidade }));
      await supabase.from('corredor_paradas').insert(linhas);
      // adiciona ao array global com as paradas já embutidas
      cor._paradas = linhas.map(l => ({ cidade: l.cidade, ordem: l.ordem }));
      cor.excepcional = true;
      corredoresGlobais.push(cor);
      _planCorredorSel = cor.id; // já seleciona o novo corredor
    }
    document.getElementById('modalRotaLivre')?.remove();
    renderizarPlanejamentoRotas();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `➕ Rota excepcional "${nome}" criada (${_rotaLivreParadas.length} cidades). Ela sai da lista após a viagem ser concluída.`, 'success');
  } catch(e){ alert('Erro ao criar corredor: '+(e.message||e)); }
}

function _planPedidosListaHTML(cor){
  const pedidos = _planFiltraBusca(_planPedidosDoCorredor(cor));
  if (pedidos.length === 0){
    // diagnóstico: por que está vazio?
    const semRotaGeral = (pedidosGlobais||[]).filter(p => !['Entregue','Cancelado'].includes(p.status||'') && !p.rotaId && !p.rota_id && !p.placaCegonha).length;
    const dica = semRotaGeral === 0
      ? 'Todos os pedidos ativos já estão em alguma rota/cegonha.'
      : `Há ${semRotaGeral} pedido(s) sem rota no sistema, mas nenhum encaixa neste corredor (confira as paradas/cidades do corredor).`;
    return `<p class="text-muted" style="padding:1rem;text-align:center;font-size:.85rem">Nenhum pedido neste corredor.<br>${dica}<br><span style="font-size:.78rem">Arraste pedidos de outro corredor para cá, ou verifique as cidades do corredor.</span></p>`;
  }
  return _planAgruparErenderizar(pedidos);
}

// Agrupa carros do mesmo pedido (grupo_id) num card só, expansível
/* ============================================================
   VIAGEM DIRETA A PARTIR DE "SEM ROTA"

   Atalho para o destino fora de rota (Londrina → Cruz Machado e afins).
   O caminho antigo era: criar corredor → jogar os carros nele → criar a
   viagem. Aqui é um passo só: escolhe os carros, o sistema monta a rota
   excepcional por baixo e já abre o modal de viagem.

   Por que criar o corredor em vez de deixar a viagem sem nenhum: o SLA (e
   portanto o ETA que o cliente recebe) vem do corredor, e o Planejamento
   lista as viagens dentro da coluna do corredor. Viagem sem corredor ficaria
   sem prazo e invisível na tela de planejar. Como o corredor nasce marcado
   como excepcional, ele some da lista assim que a viagem termina — não suja
   o cadastro.
   ============================================================ */
let _planVdPedidos = [];   // seleção corrente
let _planVdCidades = [];   // sequência de cidades do corredor a criar

function _planViagemDireta(){
  const disponiveis = (typeof _planFiltraBusca === 'function')
    ? _planFiltraBusca(_planPedidosSemRota()) : _planPedidosSemRota();
  if (!disponiveis.length){ alert('Não há pedidos sem rota para montar uma viagem.'); return; }

  const old = document.getElementById('modalViagemDireta'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalViagemDireta';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100060';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:560px;width:95%;max-height:90vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">🚛 Criar viagem direta</h2>
      <p class="text-muted" style="font-size:.84rem;margin:.2rem 0 1rem">
        Para destinos que não têm corredor. A rota é criada automaticamente a partir
        das cidades dos carros e sai da lista quando a viagem terminar.
      </p>

      <div class="vd-lista">
        ${disponiveis.map(p => `
          <label class="vd-item">
            <input type="checkbox" class="vd-chk" value="${p.id}" checked onchange="_planVdAtualizar()">
            <span>
              <strong>#${p.id}</strong> ${p.placa||'—'}${p.modelo?' · '+p.modelo:''}
              <span class="text-muted"> · ${p.cliente||''}</span>
              <div class="vd-item-rota">${(p.patioAtual||p.cidadeOrigem||'—')} → <strong>${p.cidadeDestino||'—'}</strong></div>
            </span>
          </label>`).join('')}
      </div>

      <div id="vdResumo" class="vd-resumo"></div>

      <div class="form-group" style="margin-top:10px">
        <label>Prazo estimado da viagem (SLA em horas) — usado para calcular o ETA</label>
        <input type="number" id="vdSla" min="1" step="1" value="24">
      </div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" id="btnVdCriar">🚛 Continuar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalViagemDireta').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  _planVdAtualizar();
  document.getElementById('btnVdCriar').onclick = _planVdConfirmar;
}
window._planViagemDireta = _planViagemDireta;

// Monta a sequência de cidades a partir dos carros marcados.
function _planVdAtualizar(){
  const ids = [...document.querySelectorAll('.vd-chk:checked')].map(c => parseInt(c.value));
  _planVdPedidos = ids.map(id => (pedidosGlobais||[]).find(p => String(p.id)===String(id))).filter(Boolean);
  const box = document.getElementById('vdResumo');
  if (!box) return;
  if (_planVdPedidos.length === 0){ box.innerHTML = '<span class="text-muted">Marque ao menos um carro.</span>'; _planVdCidades = []; return; }

  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const soCidade = v => String(v||'').split('/')[0].trim();
  const unicos = (arr) => { const vis = {}; const out = []; arr.forEach(v => { const k = n(soCidade(v)); if (v && !vis[k]){ vis[k]=1; out.push(soCidade(v)); } }); return out; };

  const origens = unicos(_planVdPedidos.map(p => p.patioAtual || p.cidadeOrigem));
  const destinos = unicos(_planVdPedidos.map(p => p.cidadeDestino));
  // origem principal = a mais repetida; as outras entram como paradas iniciais
  const cont = {};
  _planVdPedidos.forEach(p => { const c = n(soCidade(p.patioAtual || p.cidadeOrigem)); cont[c] = (cont[c]||0)+1; });
  origens.sort((a,b) => (cont[n(b)]||0) - (cont[n(a)]||0));

  _planVdCidades = [...origens, ...destinos.filter(d => !origens.some(o => n(o)===n(d)))];

  const precisaOrdenar = destinos.length > 1;
  box.innerHTML = `
    <div class="vd-resumo-tit">Rota que será criada</div>
    <div class="vd-seq" id="vdSeq">${_planVdSeqHTML()}</div>
    ${precisaOrdenar
      ? `<p class="vd-aviso">⚠️ Há <strong>${destinos.length} destinos diferentes</strong>. O sistema não sabe qual é o mais distante — coloque na ordem em que a cegonha vai passar. A última cidade vira o destino final.</p>`
      : `<p class="vd-ok">✅ Destino único — nada a ordenar.</p>`}`;
}
window._planVdAtualizar = _planVdAtualizar;

function _planVdSeqHTML(){
  return _planVdCidades.map((c,i) => `
    <div class="vd-seq-item">
      <span class="vd-seq-num">${i+1}</span>
      <span class="vd-seq-cidade">${c}${i===0?' <span class="vd-seq-tag">origem</span>':''}${i===_planVdCidades.length-1?' <span class="vd-seq-tag vd-seq-tag-fim">destino</span>':''}</span>
      <span class="vd-seq-btns">
        <button type="button" onclick="_planVdMover(${i},-1)" ${i===0?'disabled':''}>▲</button>
        <button type="button" onclick="_planVdMover(${i},1)" ${i===_planVdCidades.length-1?'disabled':''}>▼</button>
      </span>
    </div>`).join('');
}

function _planVdMover(i, dir){
  const j = i + dir;
  if (j < 0 || j >= _planVdCidades.length) return;
  const tmp = _planVdCidades[i]; _planVdCidades[i] = _planVdCidades[j]; _planVdCidades[j] = tmp;
  const seq = document.getElementById('vdSeq');
  if (seq) seq.innerHTML = _planVdSeqHTML();
}
window._planVdMover = _planVdMover;

async function _planVdConfirmar(){
  if (_planVdPedidos.length === 0){ alert('Marque ao menos um carro.'); return; }
  if (_planVdCidades.length < 2){ alert('Não consegui identificar origem e destino desses carros. Confira se os pedidos têm cidade de origem e destino preenchidas.'); return; }
  const sla = parseInt(document.getElementById('vdSla')?.value, 10) || 24;
  const origem = _planVdCidades[0];
  const destino = _planVdCidades[_planVdCidades.length - 1];
  const nome = `${origem} → ${destino}`;

  const btn = document.getElementById('btnVdCriar');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Criando rota...'; }
  try {
    const { data, error } = await supabase.from('corredores').insert({
      nome, origem, destino, sla_horas: sla, ativo: true, excepcional: true
    }).select();
    if (error) throw error;
    const cor = data && data[0];
    if (!cor) throw new Error('A rota não foi criada.');

    const linhas = _planVdCidades.map((cidade, i) => ({ corredor_id: cor.id, ordem: i+1, cidade }));
    await supabase.from('corredor_paradas').insert(linhas);
    cor._paradas = linhas.map(l => ({ cidade: l.cidade, ordem: l.ordem }));
    cor.excepcional = true;
    corredoresGlobais.push(cor);

    // Prende os carros nesta rota. Sem isto, se a viagem for cancelada no
    // meio, o corredor ficaria vazio e os carros voltariam ao "Sem rota"
    // sem nenhum vestígio do que se tentou montar.
    const ids = _planVdPedidos.map(p => p.id);
    await supabase.from('pedidos').update({ corredor_manual_id: cor.id }).in('id', ids);
    _planVdPedidos.forEach(p => { p.corredorManualId = cor.id; });
    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();

    document.getElementById('modalViagemDireta')?.remove();
    _planCorredorSel = cor.id;
    renderizarPlanejamentoRotas();
    // e já abre a viagem com os carros selecionados
    _planAbrirModalViagem(cor, _planVdPedidos);
  } catch(e){
    if (btn){ btn.disabled = false; btn.textContent = '🚛 Continuar'; }
    alert('Erro ao criar a rota: ' + (e.message||e));
  }
}
window._planVdConfirmar = _planVdConfirmar;

function _planAgruparErenderizar(pedidos){
  const grupos = [];
  const vistos = {};
  pedidos.forEach(p => {
    const chave = p.grupoId ? 'g'+p.grupoId : 'p'+p.id;
    if (!vistos[chave]){ vistos[chave] = { chave, itens:[], lider:p }; grupos.push(vistos[chave]); }
    vistos[chave].itens.push(p);
  });

  return grupos.map(g => {
    const p = g.lider;
    const multi = g.itens.length > 1;
    const indicado = p.corredorManualId ? ' <span class="plan-ped-tag" title="Direcionado a este corredor">📌</span>' : '';
    const totalFrete = g.itens.reduce((s,x)=>s+Number(x.valorFrete||0),0);

    if (!multi){
      // card normal (1 carro)
      return `<div class="plan-pedido" draggable="true" data-pedido="${p.id}" ondragstart="_planDragStart(event,${p.id})">
        <div class="plan-pedido-top">
          <span class="plan-pedido-id">#${p.id}</span>
          <span class="plan-pedido-placa">${p.modelo?`<strong>${p.modelo}</strong> · `:''}<strong>${p.placa||'—'}</strong></span>${indicado}
          <span class="plan-pedido-valor">${p.valorFrete?('R$ '+Number(p.valorFrete).toLocaleString('pt-BR')):''}</span>
        </div>
        <div class="plan-pedido-sub">${p.cliente||''} ${_selosPedidoHTML(p)}</div>
        ${p.referencia?`<div class="plan-pedido-ref">🏷️ ID: <strong>${p.referencia}</strong></div>`:''}
        <div class="plan-pedido-rota">${p.cidadeOrigem||''} → <strong>${p.cidadeDestino||''}</strong>${(p.patioAtual && _norm(p.patioAtual)!==_norm(p.cidadeOrigem||''))?` <span style="color:#a855f7;font-size:.72rem">(está em ${String(p.patioAtual).split('/')[0]})</span>`:''}</div>
        ${_planPedidoDatasHTML(p)}
        <div class="plan-pedido-coleta">${(typeof _colDirecionamentoHTML==='function') ? _colDirecionamentoHTML(p) : ''}</div>
        <div class="plan-pedido-acoes">
          <button class="plan-mover-btn" onclick="event.stopPropagation();_planAbrirBuscaCorredor(${p.id})">🔀 Mover para outro corredor →</button>
        </div>
      </div>`;
    }

    // card AGRUPADO (múltiplos carros do mesmo pedido)
    const idsGrupo = g.itens.map(x=>x.id);
    return `<div class="plan-pedido plan-pedido-grupo" draggable="true" data-pedido="${p.id}" ondragstart="_planDragStartGrupo(event, [${idsGrupo.join(',')}])">
      <div class="plan-pedido-top">
        <span class="plan-pedido-id">#${p.id}</span>
        <span class="plan-grupo-badge">🔗 ${g.itens.length} carros</span>${indicado}
        <span class="plan-pedido-valor">${totalFrete?('R$ '+totalFrete.toLocaleString('pt-BR')):''}</span>
      </div>
      <div class="plan-pedido-sub">${p.cliente||''} ${_selosPedidoHTML(p)}</div>
      ${(() => {
        const refs = [...new Set(g.itens.map(x=>x.referencia).filter(Boolean))];
        if (refs.length === 0) return '';
        if (refs.length === 1) return `<div class="plan-pedido-ref">🏷️ ID: <strong>${refs[0]}</strong></div>`;
        return `<div class="plan-pedido-ref">🏷️ ${refs.length} referências (ver nos carros)</div>`;
      })()}
      <div class="plan-pedido-rota">${p.cidadeOrigem||''} → <strong>${p.cidadeDestino||''}</strong>${(p.patioAtual && _norm(p.patioAtual)!==_norm(p.cidadeOrigem||''))?` <span style="color:#a855f7;font-size:.72rem">(está em ${String(p.patioAtual).split('/')[0]})</span>`:''}</div>
      ${_planPedidoDatasHTML(p)}
      <details class="plan-grupo-det" onclick="event.stopPropagation()">
        <summary>Ver os ${g.itens.length} carros</summary>
        ${g.itens.map(x => `<div class="plan-grupo-carro">🚗 <strong>${x.placa||'—'}</strong> · ${x.modelo||''}${x.referencia?` · <span style="color:#f59e0b">🏷️ ${x.referencia}</span>`:''}${x.valorFrete?` · <span style="color:#22c55e">R$ ${Number(x.valorFrete).toLocaleString('pt-BR')}</span>`:''}</div>`).join('')}
      </details>
      <div class="plan-pedido-coleta">${(typeof _colDirecionamentoHTML==='function') ? _colDirecionamentoHTML(p) : ''}</div>
      <div class="plan-pedido-acoes">
        <button class="plan-desmembrar-btn" onclick="event.stopPropagation();_planDesmembrar([${idsGrupo.join(',')}])"
                title="Levar só parte dos carros nesta viagem">✂️ Desmembrar — levar alguns</button>
        <button class="plan-mover-btn" onclick="event.stopPropagation();_planAbrirBuscaCorredor(${p.id})">🔀 Mover o grupo para outro corredor →</button>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   DESMEMBRAR UMA SOLICITAÇÃO

   Uma solicitação da Evo pode vir com 70 carros, e a cegonha leva 11. Antes,
   a saída era apagar 59 da planilha antes de importar — e reimportar depois
   para a próxima carga. Aqui o grupo continua inteiro no sistema: você tira
   os que vão agora e o restante segue no card, esperando a próxima cegonha.
   ============================================================ */
let _pdIds = [];

function _planDesmembrar(ids){
  _pdIds = ids || [];
  const itens = _pdIds.map(id => (pedidosGlobais||[]).find(p => String(p.id)===String(id))).filter(Boolean);
  if (!itens.length) return;
  const lider = itens[0];
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(_planCorredorSel));

  const old = document.getElementById('modalDesmembrar'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalDesmembrar';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:100060;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box pv-box">
      <div class="pv-cab">
        <div>
          <h2 style="margin:0">✂️ Desmembrar solicitação</h2>
          <p class="text-muted" style="font-size:.84rem;margin:.25rem 0 0">
            ${lider.cliente||''} · ${itens.length} carro(s) · ${(lider.cidadeOrigem||'').split('/')[0]} → ${(lider.cidadeDestino||'').split('/')[0]}<br>
            Marque os que vão <strong>agora</strong>. Os demais continuam no card, prontos para a próxima carga.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalDesmembrar').remove()">✕</button>
      </div>
      <div class="pv-corpo">
        <div class="pv-carros">
          <div class="pv-ferramentas">
            <div class="pv-busca">
              <span class="pv-busca-ic">🔍</span>
              <input type="text" id="pdBusca" placeholder="Placa, modelo ou referência" oninput="_pdFiltrar(this.value)">
            </div>
            <div class="pv-acoes-sel">
              <button type="button" class="btn btn-secondary btn-sm" onclick="_pdMarcar(true)">Marcar todos</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="_pdMarcar(false)">Desmarcar</button>
            </div>
          </div>
          <div class="pv-grade" id="pdGrade">${_pdGradeHTML('')}</div>
        </div>
        <div class="pv-lateral">
          <div class="pv-contador" id="pdContador"></div>
          <div class="pv-rodape">
            <button class="btn btn-primary" style="width:100%" onclick="_pdCriarViagem()">🚛 Criar viagem com os marcados</button>
            ${cor ? `<button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="_pdDirecionar()">📌 Direcionar ao corredor ${cor.nome}</button>` : ''}
            <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('modalDesmembrar').remove()">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  _pdAtualizar();
}
window._planDesmembrar = _planDesmembrar;

function _pdGradeHTML(busca){
  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const b = n(busca||'');
  const itens = _pdIds.map(id => (pedidosGlobais||[]).find(p => String(p.id)===String(id))).filter(Boolean)
    .filter(p => !b || n(`${p.placa||''} ${p.modelo||''} ${p.referencia||''} #${p.id}`).includes(b));
  if (!itens.length) return '<p class="text-muted" style="padding:2rem;text-align:center">Nenhum carro encontrado.</p>';
  return `<div class="pv-grupo"><div class="pv-grupo-cards">
    ${itens.map(p => `
      <label class="pv-card">
        <input type="checkbox" class="pd-chk" value="${p.id}" onchange="_pdAtualizar()">
        <div class="pv-card-corpo">
          <div class="pv-card-placa">${p.placa||'—'}
            ${p.valorFrete?`<span class="pv-card-valor">R$ ${Number(p.valorFrete).toLocaleString('pt-BR')}</span>`:''}</div>
          <div class="pv-card-modelo">${p.modelo||'—'}</div>
          ${p.referencia?`<div class="pv-card-ref">🏷️ ${p.referencia}</div>`:''}
          <div class="pv-card-id">#${p.id}</div>
        </div>
      </label>`).join('')}
  </div></div>`;
}

function _pdFiltrar(txt){
  const marcados = new Set([...document.querySelectorAll('.pd-chk:checked')].map(c=>c.value));
  const g = document.getElementById('pdGrade');
  if (g){ g.innerHTML = _pdGradeHTML(txt); document.querySelectorAll('.pd-chk').forEach(c=>{ c.checked = marcados.has(c.value); }); }
  _pdAtualizar();
}
window._pdFiltrar = _pdFiltrar;

function _pdMarcar(v){
  document.querySelectorAll('.pd-chk').forEach(c => { c.checked = !!v; });
  _pdAtualizar();
}
window._pdMarcar = _pdMarcar;

function _pdAtualizar(){
  const el = document.getElementById('pdContador');
  if (!el) return;
  const marcados = document.querySelectorAll('.pd-chk:checked').length;
  const restam = _pdIds.length - marcados;
  el.innerHTML = `
    <div class="pv-cont-num"><strong>${marcados}</strong> vão agora</div>
    <div class="pv-cont-info">${restam} continuam esperando no card</div>`;
}
window._pdAtualizar = _pdAtualizar;

function _pdSelecionados(){
  return [...document.querySelectorAll('.pd-chk:checked')]
    .map(c => (pedidosGlobais||[]).find(p => String(p.id)===String(c.value)))
    .filter(Boolean);
}

function _pdCriarViagem(){
  const sel = _pdSelecionados();
  if (!sel.length){ alert('Marque os carros que vão nesta viagem.'); return; }
  document.getElementById('modalDesmembrar')?.remove();
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(_planCorredorSel));
  if (cor && typeof _planAbrirModalViagem === 'function'){
    _planAbrirModalViagem(cor, sel);
  } else if (typeof _planViagemDireta === 'function'){
    // sem corredor selecionado (modo "Sem rota"): cria a rota excepcional
    _planVdPedidos = sel;
    _planViagemDireta();
  }
}
window._pdCriarViagem = _pdCriarViagem;

async function _pdDirecionar(){
  const sel = _pdSelecionados();
  if (!sel.length){ alert('Marque os carros primeiro.'); return; }
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(_planCorredorSel));
  if (!cor) return;
  try {
    const ids = sel.map(p => p.id);
    await supabase.from('pedidos').update({ corredor_manual_id: cor.id }).in('id', ids);
    sel.forEach(p => { p.corredorManualId = cor.id; });
    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();
    document.getElementById('modalDesmembrar')?.remove();
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao(`📌 ${ids.length} carro(s) no corredor ${cor.nome}.`);
    renderizarPlanejamentoRotas();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}
window._pdDirecionar = _pdDirecionar;

// Arrasta o grupo todo
function _planDragStartGrupo(ev, ids){
  ev.dataTransfer.setData('text/plain', JSON.stringify({ grupo: ids }));
  ev.dataTransfer.effectAllowed = 'move';
}

// Datas do pedido: criação e entrega prevista (para priorização no planejamento)

/* =========================================================================
   COLETAS DIRECIONADAS (motorista)
   Coletas avulsas que a logística mandou para este motorista pela Central
   de Operações. Ficam SEPARADAS da carga da cegonha de propósito: são
   serviços fora da carga, e misturar as duas coisas confunde quem está na
   rua. Por enquanto é informativo — não há ação a confirmar aqui.
   ========================================================================= */
function renderizarColetasDirecionadas(){
  const card = document.getElementById('cardColetasDirecionadas');
  const cont = document.getElementById('coletasDirecionadasWrap');
  if (!card || !cont) return;

  if (!window.__mmDadosCarregados && typeof mmSkeletonCards === 'function'){
    card.style.display = '';
    mmSkeletonCards(cont, { quantidade: 2 });
    if (window.__mmDadosProntos) window.__mmDadosProntos.then(() => renderizarColetasDirecionadas());
    return;
  }

  const { nomes } = (typeof nomesDoMotoristaLogado === 'function')
    ? nomesDoMotoristaLogado() : { nomes: new Set() };

  // Coletas E entregas direcionadas — as duas são serviços avulsos, fora
  // da carga da cegonha, e fazem sentido juntas na mesma lista.
  const minhas = [];
  (pedidosGlobais || []).forEach(p => {
    if (['Entregue','Cancelado'].includes(p.status)) return;
    // O serviço sai da lista quando o motorista CONFIRMA, não quando o
    // status muda. A coleta confirmada vira "Em Transporte", que não é um
    // status final — por isso o card continuava aparecendo depois de
    // confirmado e dava a impressão de que nada tinha acontecido.
    if (p.coletaMotorista && !p.coletaConfirmadaEm && nomes.has(normNomeMotorista(p.coletaMotorista))) {
      minhas.push({ p, tipo: 'coleta' });
    }
    if (p.entregaMotorista && !p.entregaConfirmadaEm && nomes.has(normNomeMotorista(p.entregaMotorista))) {
      minhas.push({ p, tipo: 'entrega' });
    }
  });

  // Card só aparece quando há coleta direcionada — não ocupa espaço à toa
  if (minhas.length === 0){ card.style.display = 'none'; return; }
  card.style.display = '';

  const nColetas = minhas.filter(m => m.tipo === 'coleta').length;
  const nEntregas = minhas.filter(m => m.tipo === 'entrega').length;
  const barraLote = `
    <div class="mav-lote">
      <div class="mav-lote-topo">
        <label class="mav-lote-todos">
          <input type="checkbox" id="mavTodos" onchange="_mavMarcarTodos(this.checked)"> Selecionar todos
        </label>
        <span class="mav-lote-cont" id="mavContagem">${minhas.length} serviço(s)</span>
      </div>
      <div class="mav-lote-btns">
        ${nColetas ? `<button class="btn-motorista-acao mav-btn-coleta" onclick="confirmarServicosAvulsosLote('coleta')">✅ Confirmar coletas marcadas</button>` : ''}
        ${nEntregas ? `<button class="btn-motorista-acao mav-btn-entrega" onclick="confirmarServicosAvulsosLote('entrega')">🏁 Confirmar entregas marcadas</button>` : ''}
      </div>
    </div>`;

  cont.innerHTML = barraLote + minhas.map(({ p, tipo }) => {
    const ehColeta = tipo === 'coleta';
    const cor      = ehColeta ? '#38bdf8' : '#a855f7';
    const rotulo   = ehColeta ? '📍 Coleta avulsa' : '🏁 Entrega avulsa';
    const endereco = ehColeta ? p.enderecoColeta : p.enderecoEntrega;
    const quando   = ehColeta ? p.coletaDirecionadaEm : p.entregaDirecionadaEm;
    return `
    <div class="motorista-pedido-card" style="--mp-cor:${cor}">
      <div class="mpedido-header">
        <label class="mav-chk-wrap" title="Marcar para confirmar em lote">
          <input type="checkbox" class="mav-chk" data-tipo="${tipo}" value="${p.id}" onchange="_mavAtualizarContagem()">
        </label>
        <span class="mpedido-id">#${p.id}</span>
        <span class="mpedido-status" style="color:${cor};background:${cor}20;border:1px solid ${cor}40">${rotulo}</span>
      </div>
      <div class="mpedido-cliente">${p.cliente || '—'}</div>
      <div class="mpedido-rota">📍 ${p.cidadeOrigem || ''}/${p.ufOrigem || ''} → 🏁 ${p.cidadeDestino || ''}/${p.ufDestino || ''}</div>
      <div class="mpedido-veiculo">🚗 ${p.modelo || ''} · <strong>${p.placa || ''}</strong></div>
      ${endereco ? `<div class="mpedido-data">🏠 ${endereco}</div>` : ''}
      ${quando ? `<div class="mpedido-data">📅 Direcionada em ${new Date(quando).toLocaleString('pt-BR')}</div>` : ''}
      <div class="mpedido-acoes">
        <button class="btn-motorista-acao btn-macao-foto"
                onclick="confirmarServicoAvulso(${p.id},'${tipo}')">
          ✅ Confirmar ${ehColeta ? 'coleta' : 'entrega'}
        </button>
      </div>
    </div>`;
  }).join('');
}

window.renderizarColetasDirecionadas = renderizarColetasDirecionadas;


/* =========================================================================
   CONFIRMAÇÃO DE COLETA / ENTREGA AVULSA (motorista)

   Sem isto o serviço direcionado ficava parado: aparecia para o motorista,
   mas ele não tinha como dizer que fez, e o pedido não andava.

   A propagação para o resto do sistema é automática e vem de três camadas
   que já existem:
     1. o espelho local (dedupe-consultas.js) aplica o UPDATE na memória;
     2. aposMutacaoPedidos() redesenha a tela na hora e sincroniza depois;
     3. o Realtime avisa as outras sessões abertas (logística, fiscal...).
   Por isso não é preciso chamar renderizador por renderizador aqui.
   ========================================================================= */
async function confirmarServicoAvulso(pedidoId, tipo){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p || !supabase) return;
  const ehColeta = tipo === 'coleta';

  if (!confirm(`Confirmar ${ehColeta ? 'a COLETA' : 'a ENTREGA'} do veículo ${p.placa||'#'+p.id}?`)) return;

  const usuario = _usuarioAtualNome() || 'Motorista';
  const agora = new Date().toISOString();
  const anterior = (typeof statusPlanilhaDoPedido==='function') ? statusPlanilhaDoPedido(p) : p.status;

  try {
    const upd = ehColeta
      ? { status: 'Em Transporte', status_planilha: 'Coletado',
          coleta_confirmada_em: agora, coleta_confirmada_por: usuario }
      : { status: 'Entregue', status_planilha: 'Entregue',
          entrega_confirmada_em: agora, entrega_confirmada_por: usuario,
          patio_atual: null, patio_desde: null };

    const { error } = await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
    if (error) throw error;

    try {
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: anterior,
        status_novo: ehColeta ? 'Coletado' : 'Entregue',
        usuario_nome: usuario,
        usuario_perfil: (typeof perfilAtual!=='undefined' ? perfilAtual : 'motorista'),
        observacao: `${ehColeta ? '🚚 Coleta avulsa' : '🏁 Entrega avulsa'} confirmada pelo motorista (direcionada pela Central).`
      });
    } catch(_){}

    if (typeof mmToast === 'function')
      mmToast(`✅ ${ehColeta ? 'Coleta' : 'Entrega'} confirmada!`);

    // Atualiza o sistema inteiro: memória, tela atual e demais sessões.
    if (typeof aposMutacaoPedidos === 'function') await aposMutacaoPedidos();
    renderizarColetasDirecionadas();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();

  } catch(e){
    alert('Não foi possível confirmar: ' + (e.message||e));
  }
}

window.confirmarServicoAvulso = confirmarServicoAvulso;

/* Seleção em lote dos serviços avulsos (coletas/entregas direcionadas).
   O motorista costuma receber vários carros do mesmo cliente de uma vez —
   confirmar um por um, com um confirm() em cada, é inviável na rua. */
function _mavMarcarTodos(marcar){
  document.querySelectorAll('.mav-chk').forEach(c => { c.checked = !!marcar; });
  _mavAtualizarContagem();
}
function _mavAtualizarContagem(){
  const marcados = document.querySelectorAll('.mav-chk:checked').length;
  const total = document.querySelectorAll('.mav-chk').length;
  const el = document.getElementById('mavContagem');
  if (el) el.textContent = marcados ? `${marcados} de ${total} marcado(s)` : `${total} serviço(s)`;
  const todos = document.getElementById('mavTodos');
  if (todos) todos.checked = (total > 0 && marcados === total);
}
window._mavMarcarTodos = _mavMarcarTodos;
window._mavAtualizarContagem = _mavAtualizarContagem;

// Confirma de uma vez todos os serviços marcados de um tipo (coleta ou entrega).
async function confirmarServicosAvulsosLote(tipo){
  const ids = [...document.querySelectorAll(`.mav-chk:checked[data-tipo="${tipo}"]`)]
    .map(c => parseInt(c.value)).filter(n => !isNaN(n));
  if (ids.length === 0){
    alert(`Marque ao menos um card de ${tipo === 'coleta' ? 'coleta' : 'entrega'} para confirmar.`);
    return;
  }
  const ehColeta = tipo === 'coleta';
  const alvos = ids.map(id => (pedidosGlobais||[]).find(x => String(x.id)===String(id))).filter(Boolean);
  const placas = alvos.map(p => p.placa || ('#'+p.id)).join(', ');
  if (!confirm(`Confirmar ${ehColeta ? 'a COLETA' : 'a ENTREGA'} de ${ids.length} veículo(s)?\n\n${placas}`)) return;

  const usuario = _usuarioAtualNome() || 'Motorista';
  const agora = new Date().toISOString();
  const upd = ehColeta
    ? { status: 'Em Transporte', status_planilha: 'Coletado',
        coleta_confirmada_em: agora, coleta_confirmada_por: usuario }
    : { status: 'Entregue', status_planilha: 'Entregue',
        entrega_confirmada_em: agora, entrega_confirmada_por: usuario,
        patio_atual: null, patio_desde: null };

  try {
    if (typeof mmAtualizarPedidos === 'function'){
      // mmAtualizarPedidos NÃO lança exceção: devolve { ok, falhas }. Se a
      // gravação falhar e ninguém olhar o retorno, o motorista vê "confirmado"
      // sem nada ter sido gravado — o pior erro possível neste fluxo.
      const res = await mmAtualizarPedidos(ids, upd, (p) => {
        if (ehColeta){ p.status='Em Transporte'; p.statusPlanilha='Coletado'; p.coletaConfirmadaEm=agora; p.coletaConfirmadaPor=usuario; }
        else { p.status='Entregue'; p.statusPlanilha='Entregue'; p.entregaConfirmadaEm=agora; p.entregaConfirmadaPor=usuario; p.patioAtual=null; }
      });
      if (res && res.falhas && res.falhas.length){
        throw new Error(res.falhas.join(' · '));
      }
      if (res && res.ok === 0){
        throw new Error('Nenhum registro foi gravado.');
      }
    } else {
      const { error } = await supabase.from('pedidos').update(upd).in('id', ids);
      if (error) throw error;
    }
    // histórico, um registro por carro
    try {
      const linhas = alvos.map(p => ({
        pedido_id: parseInt(p.id),
        status_anterior: (typeof statusPlanilhaDoPedido==='function') ? statusPlanilhaDoPedido(p) : p.status,
        status_novo: ehColeta ? 'Coletado' : 'Entregue',
        usuario_nome: usuario,
        usuario_perfil: (typeof perfilAtual!=='undefined' ? perfilAtual : 'motorista'),
        observacao: `${ehColeta ? '🚚 Coleta avulsa' : '🏁 Entrega avulsa'} confirmada pelo motorista (em lote, ${ids.length} veículos).`
      }));
      if (typeof mmRegistrarHistorico === 'function') await mmRegistrarHistorico(linhas);
      else await supabase.from('historico_status').insert(linhas);
    } catch(_){}

    if (typeof mmToast === 'function') mmToast(`✅ ${ids.length} ${ehColeta ? 'coleta(s)' : 'entrega(s)'} confirmada(s)!`);
    if (typeof aposMutacaoPedidos === 'function') await aposMutacaoPedidos();
    renderizarColetasDirecionadas();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
  } catch(e){
    alert('Não foi possível confirmar: ' + (e.message||e));
  }
}
window.confirmarServicosAvulsosLote = confirmarServicosAvulsosLote;


/* =========================================================================
   DEFINIR MOTORISTA / CAMINHÃO direto na viagem

   Sem isto, uma viagem criada sem motorista travava: não dava para enviar
   ao fiscal e a única saída era refazer a viagem. Agora dá para completar
   a informação onde ela está faltando.
   ========================================================================= */

async function _viagemDefinirMotorista(rotaId){
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(rotaId));
  if (!r) return;

  const lista = (motoristasGlobais||[]).map(m => m.nome).filter(Boolean);
  const atual = r.motorista_1 || '';
  const nome = prompt(
    `Motorista desta viagem:\n\n${lista.slice(0,25).join('\n')}${lista.length>25?'\n...':''}`,
    atual
  );
  if (nome === null) return;
  const valor = nome.trim();
  if (!valor) return;

  try {
    const { error } = await supabase.from('rotas_planejadas')
      .update({ motorista_1: valor }).eq('id', rotaId);
    if (error) throw error;
    r.motorista_1 = valor;

    // Os carros da carga acompanham o motorista da viagem
    const ids = _veiculosNaRota(rotaId).map(p => p.id);
    if (ids.length && typeof mmAtualizarPedidos === 'function'){
      await mmAtualizarPedidos(ids, { motorista_1: valor }, (p) => { p.motorista1 = valor; });
    }

    if (typeof mmToast === 'function') mmToast(`✅ Motorista definido: ${valor}`);
    renderizarViagensAndamento();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
  } catch(e){
    alert('Não foi possível salvar: ' + (e.message||e));
  }
}

async function _viagemDefinirCegonha(rotaId){
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(rotaId));
  if (!r) return;

  const cegonhas = (veiculosGlobais||[])
    .filter(v => (v.tipo||'').toLowerCase().includes('cegonha') || v.capacidade)
    .map(v => `${v.placa}${v.capacidade?' ('+v.capacidade+' vagas)':''}`);
  const placa = prompt(
    `Caminhão / carreta desta viagem:\n\n${cegonhas.slice(0,25).join('\n')}${cegonhas.length>25?'\n...':''}`,
    r.placa_cegonha || ''
  );
  if (placa === null) return;
  const valor = placa.trim().split(' ')[0].toUpperCase();
  if (!valor) return;

  try {
    const { error } = await supabase.from('rotas_planejadas')
      .update({ placa_cegonha: valor }).eq('id', rotaId);
    if (error) throw error;
    r.placa_cegonha = valor;

    const ids = _veiculosNaRota(rotaId).map(p => p.id);
    if (ids.length && typeof mmAtualizarPedidos === 'function'){
      await mmAtualizarPedidos(ids, { placa_cegonha: valor }, (p) => { p.placaCegonha = valor; });
    }

    // Motorista padrão do veículo, se a viagem ainda não tiver um
    const veic = (veiculosGlobais||[]).find(v => v.placa === valor);
    if (veic?.motorista_padrao && !r.motorista_1){
      await supabase.from('rotas_planejadas').update({ motorista_1: veic.motorista_padrao }).eq('id', rotaId);
      r.motorista_1 = veic.motorista_padrao;
    }

    if (typeof mmToast === 'function') mmToast(`✅ Caminhão definido: ${valor}`);
    renderizarViagensAndamento();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional();
  } catch(e){
    alert('Não foi possível salvar: ' + (e.message||e));
  }
}

window._viagemDefinirMotorista = _viagemDefinirMotorista;
window._viagemDefinirCegonha = _viagemDefinirCegonha;
