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
    for (const id of ids){
      await supabase.from('pedidos').update({ numero_cte: val||null, cte_emitido_em: val?new Date().toISOString():null }).eq('id', parseInt(id));
      const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
      if (p){ p.numeroCte = val||null; p.cteEmitidoEm = val?new Date().toISOString():null; }
    }
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Fiscal';
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
function _abrirModalTransbordoStatus(pedidoId, rotuloAntes){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const old = document.getElementById('modalTransbStatus'); if (old) old.remove();
  const patios = (typeof PATIOS_FIXOS !== 'undefined') ? PATIOS_FIXOS : [];
  const div = document.createElement('div');
  div.id = 'modalTransbStatus';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">🔁 Transbordo do #${p.id}</h2>
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">${p.placa||''} · ${p.modelo||''} · destino final <strong>${p.cidadeDestino||'—'}</strong>. O carro sai do caminhão atual e aguarda a próxima perna.</p>
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
        <button class="btn btn-primary" style="flex:1" onclick="_confirmarTransbordoStatus(${pedidoId}, '${rotuloAntes.replace(/'/g,"\\'")}')">✅ Confirmar transbordo</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalTransbStatus').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Sugere o corredor que melhor encaixa a próxima perna (a partir do pátio escolhido → destino final)
function _transbSugereCorredor(){
  const patio = document.getElementById('transbPatio')?.value || '';
  const sel = document.getElementById('transbCorredor');
  const sug = document.getElementById('transbSugestao');
  if (!sel) return;
  sel.innerHTML = '<option value="">— escolher depois (fica em Aguardando transbordo) —</option>';
  if (!patio){ if (sug) sug.textContent = ''; return; }
  const cidadePatio = patio.split('/')[0].trim().toLowerCase();
  // corredores cujas paradas incluem o pátio e seguem em frente
  const corredores = (corredoresGlobais||[]).filter(c => {
    const paradas = (c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino];
    return paradas.some(cid => (cid||'').split('/')[0].trim().toLowerCase() === cidadePatio);
  });
  corredores.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.nome;
    sel.appendChild(opt);
  });
  // melhor sugestão: corredor que também passa pelo destino final do carro
  if (sug){
    const destino = null;
    if (corredores.length === 1){ sel.value = corredores[0].id; sug.textContent = `💡 Sugestão: ${corredores[0].nome} (parte de ${patio.split('/')[0]}).`; }
    else if (corredores.length > 1){ sug.textContent = `💡 ${corredores.length} corredores partem de ${patio.split('/')[0]}. Escolha o que leva ao destino.`; }
    else { sug.textContent = `Nenhum corredor cadastrado partindo de ${patio.split('/')[0]}. O carro ficará em "Aguardando transbordo".`; }
  }
}

// Desfaz um transbordo marcado por engano: volta o pedido ao estado normal (sem transbordo)
async function _desfazerTransbordo(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  if (!confirm(`Desfazer o transbordo do pedido #${pedidoId}?\n\nEle volta ao estado normal (deixa de contar como transbordado) e será realocado normalmente nos corredores.`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    // volta status para o fluxo normal e zera as marcas de transbordo
    const novoStatus = (p.rotaId || p.rota_id) ? 'Em Transporte' : 'Pendente';
    await supabase.from('pedidos').update({
      status: novoStatus,
      status_planilha: null,
      aguardando_transbordo: false,
      cidade_transbordo: null,
      qtd_transbordos: Math.max(0, (p.qtdTransbordos || 0) - 1)
    }).eq('id', parseInt(pedidoId));
    Object.assign(p, {
      status: novoStatus, statusPlanilha: null, aguardandoTransbordo: false,
      cidadeTransbordo: null, qtdTransbordos: Math.max(0, (p.qtdTransbordos||0) - 1)
    });
    await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: 'Transbordo', status_novo: novoStatus,
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: '↩️ Transbordo desfeito (marcado por engano)'
    });
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao('↩️ Transbordo desfeito.');
    if (typeof renderizarPlanejamentoRotas === 'function') renderizarPlanejamentoRotas();
    if (typeof renderizarComercialPedidos === 'function') renderizarComercialPedidos();
    if (typeof _cgFecharRastreio === 'function') _cgFecharRastreio();
  } catch(e){ alert('Erro ao desfazer transbordo: '+(e.message||e)); }
}

async function _confirmarTransbordoStatus(pedidoId, rotuloAntes){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const patio = document.getElementById('transbPatio')?.value || '';
  const corredorId = document.getElementById('transbCorredor')?.value || null;
  if (!patio){ alert('Selecione o pátio onde o carro vai ficar.'); return; }
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || '';
  const cegonhaAnterior = p.placaCegonha || '';
  try {
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
    document.getElementById('modalTransbStatus')?.remove();
    await recarregarPedidos();
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof renderizarPlanejamentoRotas === 'function') renderizarPlanejamentoRotas();
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();
    if (typeof renderizarVagasPorRota === 'function') renderizarVagasPorRota();
    // notifica comercial sobre o transbordo do pedido
    if (typeof notificar === 'function'){
      try { notificar({ perfil:'comercial', tipo:'status', pedidoId: parseInt(pedidoId),
        titulo:'🔁 Transbordo registrado', mensagem:`#${pedidoId} transbordou no pátio de ${patio}.` }); } catch(_){}
    }
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `🔁 #${pedidoId} em transbordo no pátio de ${patio}${corredorId?' e direcionado ao corredor':''}. ${corredorId?'':'Veja em "Aguardando transbordo".'}`, 'success');
  } catch(e){ alert('Erro ao registrar transbordo: '+(e.message||e)); }
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
      <div><span class="jv-dl">Motorista</span><span class="jv-dv">${rota.motorista_1||'a definir'}</span></div>
      <div><span class="jv-dl">Caminhão / Carreta</span><span class="jv-dv">${rota.placa_cegonha||'a definir'}</span></div>
      <div><span class="jv-dl">Carros na carga</span><span class="jv-dv">${carros.length}</span></div>
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Operador';
  const perfil = (typeof perfilAtual!=='undefined'?perfilAtual:'logistica');
  let ok = 0; const falhas = [];
  for (const id of ids){
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    if (!p){ falhas.push(id+' (não encontrado)'); continue; }
    const antes = statusPlanilhaDoPedido(p);
    try {
      const { error } = await supabase.from('pedidos').update({ status: statusInterno, status_planilha: statusPlanilha }).eq('id', id);
      if (error) throw error;
      p.status = statusInterno; p.statusPlanilha = statusPlanilha;
      ok++;
      try {
        await supabase.from('historico_status').insert({
          pedido_id: id, status_anterior: antes, status_novo: statusPlanilha,
          usuario_nome: usuario, usuario_perfil: perfil, observacao: obs
        });
      } catch(eh){ console.warn('Histórico não gravado p/', id, eh?.message); }
    } catch(e){
      falhas.push('#'+id+' ('+(e?.message||'erro')+')');
      console.error('Falha ao mudar status do pedido', id, e);
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
  _viagemModalCarros('🚚 Registrar Coleta', 'Selecione os carros que foram coletados. O evento fica registrado na jornada.', elegiveis, '#16a34a', '✅ Confirmar coleta', async (ids) => {
    await _viagemMudarStatusCarros(ids, 'Em Coleta', 'Coletado', '🚚 Coleta registrada (evento na viagem)');
    document.getElementById('modalViagemAcao').remove();
    renderizarViagensAndamento();
  });
}

async function _viagemIniciar(rota, carros){
  const elegiveis = carros.filter(c => {
    const rot = statusPlanilhaDoPedido(c);
    return ['Coletado','Enviado coleta'].includes(rot)
      || ['Em Coleta','Aguardando Confirmação'].includes(c.status||'');
  });
  if (elegiveis.length === 0){ alert('Nenhum carro pronto para iniciar viagem (precisa estar coletado).'); return; }
  _viagemModalCarros('🛫 Iniciar Viagem', 'Confirme os carros que saíram para viagem (Em transporte).', elegiveis, '#2563eb', '✅ Confirmar saída', async (ids) => {
    await _viagemMudarStatusCarros(ids, 'Em Transporte', 'Em transporte', '🛫 Saiu para viagem (evento na viagem)');
    if (rota.status !== 'em_andamento'){ try { await supabase.from('rotas_planejadas').update({ status:'em_andamento' }).eq('id', rota.id); rota.status='em_andamento'; } catch(_){} }
    document.getElementById('modalViagemAcao').remove();
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
  for (const id of ids){
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    if (!p) continue;
    try {
      await supabase.from('pedidos').update({ status:'Em Transporte', patio_atual: p.cidadeDestino, precisa_equipe_entrega: true }).eq('id', id);
      p.patioAtual = p.cidadeDestino; p.precisaEquipeEntrega = true;
      await supabase.from('historico_status').insert({ pedido_id: parseInt(id), status_anterior:'Em Transporte', status_novo:'Em Transporte', usuario_nome: document.getElementById('usuarioLogado')?.textContent||'Logística', observacao:'🚛→👥 Motorista deixou no pátio; direcionado para equipe de entrega' });
    } catch(e){ console.error(e); }
  }
  renderizarViagensAndamento();
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `👥 ${ids.length} veículo(s) direcionado(s) para a equipe de entrega. Veja na Central de Operação.`, 'success');
}

// Item 1: registrar ocorrência escolhendo o carro; trava o pedido no status "Ocorrência"
async function _viagemRegistrarOcorrencia(rota, carros){
  const elegiveis = carros.filter(c => !['Entregue','Cancelado'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro elegível para registrar ocorrência.'); return; }
  const escolher = (ids) => {
    const pedidoId = ids[0];
    const desc = prompt('Descreva a ocorrência com este carro:\n(ex: pane mecânica, avaria, atraso, sinistro...)');
    if (desc === null || !desc.trim()) return;
    _confirmarOcorrencia(pedidoId, desc.trim(), rota);
  };
  if (elegiveis.length === 1){ escolher([elegiveis[0].id]); return; }
  _viagemModalCarros('⚠️ Registrar Ocorrência', 'Selecione o carro que teve a ocorrência.', elegiveis, '#ef4444', '➡️ Continuar', (ids) => {
    document.getElementById('modalViagemAcao')?.remove();
    escolher(ids);
  });
}

async function _confirmarOcorrencia(pedidoId, descricao, rota){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  const statusAntes = p.status;
  try {
    // trava o pedido no status Ocorrência
    await supabase.from('pedidos').update({ status: 'Ocorrência', status_planilha: 'Ocorrência' }).eq('id', parseInt(pedidoId));
    p.status = 'Ocorrência'; p.statusPlanilha = 'Ocorrência';
    // registra a ocorrência (tabela ocorrencias) e no histórico
    await supabase.from('ocorrencias').insert({
      tipo: 'ocorrencia', pedido_id: parseInt(pedidoId), descricao,
      usuario_nome: usuario, status: 'aberta',
      dados_extras: JSON.stringify({ placa: p.placa, cliente: p.cliente, rota_id: rota?.id, cegonha: rota?.placa_cegonha })
    });
    await supabase.from('historico_status').insert({
      pedido_id: parseInt(pedidoId), status_anterior: statusAntes, status_novo: 'Ocorrência',
      usuario_nome: usuario, usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      observacao: `⚠️ Ocorrência: ${descricao}`
    });
    // notifica comercial e logística
    if (typeof notificar === 'function'){
      notificar({ perfil:'logistica', tipo:'ocorrencia', pedidoId: parseInt(pedidoId),
        titulo:'⚠️ Ocorrência registrada', mensagem:`#${pedidoId} (${p.placa||''}): ${descricao}` });
      notificar({ perfil:'comercial', tipo:'ocorrencia', pedidoId: parseInt(pedidoId),
        titulo:'⚠️ Ocorrência num pedido', mensagem:`#${pedidoId} (${p.cliente||''}): ${descricao}` });
    }
    if (typeof _rmToastConfirmacao === 'function') _rmToastConfirmacao('⚠️ Ocorrência registrada — carro travado.');
    if (typeof renderizarViagensAndamento === 'function') renderizarViagensAndamento();
  } catch(e){ alert('Erro ao registrar ocorrência: '+(e.message||e)); }
}

async function _viagemRegistrarTransbordo(rota, carros){
  const elegiveis = carros.filter(c => !['Entregue','Cancelado','Transbordo'].includes(c.status));
  if (elegiveis.length === 0){ alert('Nenhum carro elegível para transbordo.'); return; }
  // usa o fluxo de transbordo que já existe (escolhe pátio → corredor), 1 carro por vez
  if (elegiveis.length === 1){ _abrirModalTransbordoStatus(elegiveis[0].id, statusPlanilhaDoPedido(elegiveis[0])); return; }
  _viagemModalCarros('🔁 Registrar Transbordo', 'Selecione o carro que vai transbordar (um por vez, para escolher pátio e corredor).', elegiveis, '#fb923c', '➡️ Continuar', async (ids) => {
    document.getElementById('modalViagemAcao').remove();
    _abrirModalTransbordoStatus(ids[0], statusPlanilhaDoPedido((pedidosGlobais||[]).find(x=>x.id===ids[0])));
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
    // Notifica o fiscal que há uma carga para emitir documentos
    if (typeof notificar === 'function'){
      await notificar({
        perfil: 'fiscal', tipo: 'fiscal',
        titulo: '📄 Carga enviada para o fiscal',
        mensagem: `A carga ${rota.placa_cegonha}${rota.nome?(' · '+rota.nome):''} (${carros.length} carro(s)) está pronta para emissão de manifesto/CTe.`
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
    !['Entregue','Cancelado'].includes(p.status||'') && !p.rotaId && !p.rota_id && !p.placaCegonha
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
  const pedidosCol = modoSemRota ? _planPedidosSemRota() : modoTransbordo ? _planPedidosAguardandoTransbordo() : modoAprovacao ? _planPedidosAguardandoAprovacao() : _planPedidosDoCorredor(cor);
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

    <div class="plan-layout2">
      <!-- Coluna 1: Corredores + aba Sem Rota -->
      <div class="plan-col plan-col-corredores">
        <div class="plan-col-tit plan-col-tit-corr">
          <span>Corredores</span>
          <button class="plan-novo-corr" onclick="_planAbrirNovaRotaLivre()" title="Criar um novo corredor">➕ Novo</button>
        </div>
        <div class="plan-col-dica">arraste um pedido para cá ↴</div>
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

      <!-- Coluna 2: Pedidos -->
      <div class="plan-col plan-col-pedidos">
        <div class="plan-col-tit">
          <span>${tituloCol} <span class="plan-col-badge">${pedidosCol.length}</span></span>
          ${(modoSemRota||modoTransbordo||modoAprovacao) ? '' : `<button class="plan-criar-viagem" onclick="_planCriarViagem(${cor.id})">🚛 Criar viagem</button>`}
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
  const pedidos = _planPedidosDoCorredor(cor);
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
      <div class="plan-pedido-acoes">
        <button class="plan-mover-btn" onclick="event.stopPropagation();_planAbrirBuscaCorredor(${p.id})">🔀 Mover o grupo para outro corredor →</button>
      </div>
    </div>`;
  }).join('');
}

// Arrasta o grupo todo
function _planDragStartGrupo(ev, ids){
  ev.dataTransfer.setData('text/plain', JSON.stringify({ grupo: ids }));
  ev.dataTransfer.effectAllowed = 'move';
}

// Datas do pedido: criação e entrega prevista (para priorização no planejamento)
