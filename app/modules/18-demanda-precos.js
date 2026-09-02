/* ==========================================================================
   MODULE: 18-demanda-precos.js
   Demanda, preços, relatórios
   Linhas originais: 15318-16103
   ========================================================================== */

    return io !== -1 && id !== -1 && io < id;
  };
  const atual = sel.value;
  // possíveis primeiro (com ✅), depois os demais
  const possiveis = corredores.filter(combina);
  const outros = corredores.filter(c => !combina(c));
  sel.innerHTML = '<option value="">— deixar o sistema encaixar automaticamente —</option>'
    + (possiveis.length ? `<optgroup label="✅ Corredores que combinam">${possiveis.map(c=>`<option value="${c.id}">✅ ${c.nome}</option>`).join('')}</optgroup>` : '')
    + (outros.length ? `<optgroup label="Outros corredores">${outros.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</optgroup>` : '');
  if (atual) sel.value = atual;
}

// ============================================================
// KANBAN GESTÃO DA DEMANDA (comercial) — 4 colunas
// Col 1: corredores (demanda, sem capacidade)
// Col 2/3/4: rotas (capacidade = cegonha vinculada)
// ============================================================
const _KANBAN_CORTE_AMARELO = 4; // restam <= 4 vagas = amarelo

function _capacidadeRota(r){
  // soma a capacidade das cegonhas vinculadas (por enquanto 1 cegonha por rota)
  if (!r.placa_cegonha) return 0;
  const v = (veiculosGlobais||[]).find(x => x.placa === r.placa_cegonha);
  return (v?.capacidade) || 11;
}
function _veiculosNaRota(rotaId){
  return (pedidosGlobais||[]).filter(p => String(p.rotaId||p.rota_id) === String(rotaId) && p.status !== 'Cancelado');
}

// HISTÓRICO: todos os pedidos que já fizeram parte da viagem (mesmo que transbordados).
// Usa o vínculo histórico (viagem_pedidos); cai para o atual se a tabela ainda não existir.
function _pedidosHistoricoDaViagem(rotaId){
  const vinculos = (viagemPedidosGlobais||[]).filter(v => String(v.rota_id) === String(rotaId));
  if (vinculos.length === 0) return _veiculosNaRota(rotaId); // fallback
  const ids = new Set(vinculos.map(v => String(v.pedido_id)));
  return (pedidosGlobais||[]).filter(p => ids.has(String(p.id)));
}

// Info do vínculo (para saber se o pedido saiu por transbordo)
function _vinculoViagemPedido(rotaId, pedidoId){
  return (viagemPedidosGlobais||[]).find(v => String(v.rota_id)===String(rotaId) && String(v.pedido_id)===String(pedidoId));
}

// Registra que um pedido entrou numa viagem (vínculo histórico permanente)
async function _registrarVinculoViagem(rotaId, pedidoId){
  if (!rotaId || !pedidoId) return;
  const jaTem = _vinculoViagemPedido(rotaId, pedidoId);
  if (jaTem) return;
  try {
    const { data } = await supabase.from('viagem_pedidos').insert({ rota_id: parseInt(rotaId), pedido_id: parseInt(pedidoId) }).select().single();
    if (data) viagemPedidosGlobais.push(data);
  } catch(e){ /* tabela pode não existir ainda */ }
}

// Marca a saída do pedido de uma viagem por transbordo (não apaga o vínculo)
async function _marcarSaidaTransbordo(rotaId, pedidoId, motivo, cidadeTransbordo){
  const v = _vinculoViagemPedido(rotaId, pedidoId);
  if (!v) return;
  try {
    const upd = { saiu_em: new Date().toISOString(), motivo_saida: motivo || 'transbordo' };
    if (cidadeTransbordo) upd.cidade_transbordo = cidadeTransbordo;
    await supabase.from('viagem_pedidos').update(upd).eq('id', v.id);
    v.saiu_em = upd.saiu_em; v.motivo_saida = upd.motivo_saida;
    if (cidadeTransbordo) v.cidade_transbordo = cidadeTransbordo;
  } catch(e){}
}

let _kanbanExpandido = new Set();
function _toggleKanbanCard(chave){
  if (_kanbanExpandido.has(chave)) _kanbanExpandido.delete(chave); else _kanbanExpandido.add(chave);
  renderizarKanbanDemanda();
}

function _cardCarrosHTML(pedidos, corTxt, corBorda, chave){
  const expandido = chave && _kanbanExpandido.has(chave);
  const limite = 3;
  const mostra = expandido ? pedidos : pedidos.slice(0, limite);
  const resto = pedidos.length - mostra.length;
  const cor = corTxt || 'var(--text-primary)';
  const sec = corTxt || 'var(--text-secondary)';
  let html = mostra.map(p => `
    <div style="border-left:2px solid ${corBorda||'var(--border-strong)'};padding:2px 0 2px 8px;margin-bottom:6px">
      <div style="font-size:12px;font-weight:600;color:${cor}">${p.modelo||'—'} · <span style="font-family:monospace">${p.placa||''}</span></div>
      <div style="font-size:11px;color:${sec};opacity:.85">${p.cliente||'—'}</div>
    </div>`).join('');
  if (chave && (resto > 0 || expandido)){
    html += `<div onclick="_toggleKanbanCard('${chave}')" style="font-size:11px;color:var(--accent,#ff6a00);margin-top:2px;cursor:pointer;user-select:none">${expandido ? '− recolher' : '+ '+resto+' veículo(s)'}</div>`;
  }
  return html;
}

function renderizarKanbanDemanda(){
  const cont = document.getElementById('kanbanDemandaWrap');
  if (!cont) return;

  // ---- Coluna 1: corredores com demanda (pedidos ainda não roteirizados) ----
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  const col1 = corredores.map(c => {
    const paradasStr = (c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino];
    const pedidos = (pedidosGlobais||[]).filter(p => {
      if (['Entregue','Cancelado'].includes(p.status||'Pendente')) return false;
      if (p.placaCegonha || p.rotaId || p.rota_id) return false; // já virou rota
      if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
      const partida = p.patioAtual || p.cidadeOrigem;
      const io = _posNaSeq(paradasStr, partida), id = _posNaSeq(paradasStr, p.cidadeDestino);
      const noPatio = p.patioAtual && _posNaSeq(paradasStr, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id) || (noPatio && id === -1);
    });
    return { nome: c.nome, pedidos };
  }).filter(c => c.pedidos.length > 0);

  // ---- Rotas com cegonha (capacidade existe) ----
  const rotas = (rotasGlobais||[]).filter(r => r.status !== 'cancelada' && r.status !== 'concluida' && r.placa_cegonha);
  const col2 = [], col3 = [], col4 = [];
  rotas.forEach(r => {
    const cap = _capacidadeRota(r);
    const veic = _veiculosNaRota(r.id);
    const vagas = cap - veic.length;
    const programada = r.placa_cegonha && r.motorista_1 && r.data_saida;
    const dados = { nome: r.nome, rota: r, cap, veic, vagas };
    if (programada) col4.push(dados);
    else if (vagas <= 0) col3.push(dados);
    else if (vagas <= _KANBAN_CORTE_AMARELO) col2.push(dados);
    // rotas com muitas vagas e sem programação não aparecem (ainda são "demanda aberta")
  });

  const coluna = (titulo, icone, cor, conteudo, vazio) => `
    <div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <span style="color:${cor}">${icone}</span>
        <span style="font-size:13px;font-weight:600;color:var(--text-secondary,#9ca3af)">${titulo}</span>
      </div>
      ${conteudo || `<p class="text-muted" style="font-size:12px;padding:.5rem 0">${vazio}</p>`}
    </div>`;

  const c1 = col1.map(c => `
    <div style="background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <span style="font-size:14px;font-weight:600">${c.nome}</span>
        <span style="font-size:11px;color:var(--text-secondary,#9ca3af)">${c.pedidos.length} veíc</span>
      </div>
      ${_cardCarrosHTML(c.pedidos, null, null, 'corr_'+c.nome.replace(/[^a-zA-Z0-9]/g,''))}
    </div>`).join('');

  const cardRota = (d, bg, bd, tx) => `
    <div style="background:${bg};border:1px solid ${bd};border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <span style="font-size:14px;font-weight:600;color:${tx}">${d.nome}</span>
        <span style="font-size:11px;font-weight:600;color:${tx}">${d.veic.length}/${d.cap}${d.vagas>0?' · restam '+d.vagas:''}</span>
      </div>
      ${_cardCarrosHTML(d.veic, tx, tx, 'rota_'+d.rota.id)}
      ${d.rota.motorista_1 || d.rota.data_saida ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid ${bd};font-size:11px;color:${tx};display:flex;flex-direction:column;gap:3px">
        ${d.rota.data_saida ? `<span>🕒 Saída ${new Date(d.rota.data_saida+'T12:00').toLocaleDateString('pt-BR')}${d.rota.hora_saida_prevista?' · '+d.rota.hora_saida_prevista:''}</span>` : ''}
        ${d.rota.motorista_1 ? `<span>👤 ${d.rota.motorista_1} · 🚛 ${d.rota.placa_cegonha}</span>` : ''}
      </div>` : ''}
      ${d.vagas<=0 && !(d.rota.motorista_1&&d.rota.data_saida) ? `<div style="margin-top:6px;font-size:11px;font-weight:600;color:${tx}">Carga fechada · aguardando programação</div>` : ''}
      ${(d.rota.motorista_1&&d.rota.data_saida) ? `<div style="margin-top:8px"><span style="font-size:11px;font-weight:600;color:${tx};background:var(--surface-2,#fff);padding:2px 8px;border-radius:6px">Em planejamento</span></div>` : ''}
    </div>`;

  cont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:start">
    ${coluna('Corredores disponíveis','🛣️','var(--text-secondary)', c1, 'Sem demanda aberta.')}
    ${coluna('Próximos de fechar','⚠️','#fbbf24', col2.map(d=>cardRota(d,'rgba(251,191,36,.12)','rgba(251,191,36,.4)','#d99e18')).join(''), 'Nenhuma rota quase cheia.')}
    ${coluna('Fechados','✅','#4ade80', col3.map(d=>cardRota(d,'rgba(74,222,128,.12)','rgba(74,222,128,.4)','#3aa563')).join(''), 'Nenhuma carga fechada.')}
    ${coluna('Programados','📅','#60a5fa', col4.map(d=>cardRota(d,'rgba(96,165,250,.12)','rgba(96,165,250,.4)','#4084d4')).join(''), 'Nada programado ainda.')}
  </div>`;
}


// ============================================================
// VAGAS POR ROTA — onde o comercial vê onde vender
// Uma linha por rota da logística: vagas livres + programação + pedidos que encaixam
// ============================================================
let _vagasRotaAberta = new Set();

// Formata a data de solicitação do frete (curta) para as listas de priorização
function _fmtDataSolic(iso){
  if (!iso) return '—';
  try {
    const d = new Date(String(iso).length <= 10 ? iso+'T12:00' : iso);
    if (isNaN(d)) return '—';
    const dias = Math.floor((Date.now() - d.getTime())/86400000);
    const txt = d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
    // destaca em laranja se está esperando há mais de 3 dias
    if (dias >= 3) return `<span style="color:#fb923c;font-weight:600" title="há ${dias} dias">${txt}</span>`;
    return txt;
  } catch(e){ return '—'; }
}

function _pedidosQueEncaixamNaRota(r){
  // pedidos ainda não roteirizados cujo origem→destino casa com as paradas da rota
  const seq = (Array.isArray(r.paradas) && r.paradas.length >= 2) ? r.paradas : [];
  if (seq.length < 2) return [];
  return (pedidosGlobais||[]).filter(p => {
    if (['Entregue','Cancelado'].includes(p.status||'Pendente')) return false;
    if (p.placaCegonha || p.rotaId || p.rota_id) return false;
    const partida = p.patioAtual || p.cidadeOrigem;
    const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
    return io !== -1 && id !== -1 && io < id;
  });
}

function renderizarVagasPorRota(){
  const cont = document.getElementById('vagasPorRotaWrap');
  if (!cont) return;
  const busca = _norm(document.getElementById('vagasBusca')?.value || '');

  // ===== Seção 1: AGUARDANDO CAMINHÃO — demanda por corredor, sem cegonha ainda =====
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  let demanda = corredores.map(c => {
    const paradasStr = (c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino];
    const pedidos = (pedidosGlobais||[]).filter(p => {
      if (['Entregue','Cancelado'].includes(p.status||'Pendente')) return false;
      if (p.placaCegonha || p.rotaId || p.rota_id) return false;
      if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
      const partida = p.patioAtual || p.cidadeOrigem;
      const io = _posNaSeq(paradasStr, partida), id = _posNaSeq(paradasStr, p.cidadeDestino);
      const noPatio = p.patioAtual && _posNaSeq(paradasStr, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id) || (noPatio && id === -1);
    });
    return { nome: c.nome, pedidos };
  }).filter(c => c.pedidos.length > 0);
  if (busca) demanda = demanda.filter(c => _norm(c.nome).includes(busca));
  demanda.sort((a,b) => b.pedidos.length - a.pedidos.length);

  // ===== Seção 2: rotas com cegonha (vagas) =====
  let rotas = (rotasGlobais||[]).filter(r =>
    r.status !== 'cancelada' && r.status !== 'concluida' && r.placa_cegonha);
  if (busca) rotas = rotas.filter(r => _norm(`${r.nome||''} ${r.placa_cegonha||''} ${r.motorista_1||''}`).includes(busca));
  const dados = rotas.map(r => {
    const cap = _capacidadeRota(r);
    const veic = _veiculosNaRota(r.id);
    const vagas = cap - veic.length;
    return { r, cap, ocup: veic.length, vagas, encaixam: _pedidosQueEncaixamNaRota(r) };
  }).sort((a,b) => b.vagas - a.vagas);

  let html = '';

  // Bloco: aguardando caminhão
  html += `<h3 style="font-size:.9rem;color:var(--text-secondary,#9ca3af);margin:.2rem 0 .8rem;text-transform:uppercase;letter-spacing:.4px">🕗 Aguardando caminhão <span class="text-muted" style="text-transform:none">(demanda represada por corredor)</span></h3>`;
  if (demanda.length === 0){
    html += '<p class="text-muted" style="padding:.3rem 0 1rem">Nenhuma demanda solta — tudo já está em rota. 👌</p>';
  } else {
    html += demanda.map(c => {
      const chave = 'dem_'+c.nome.replace(/[^a-zA-Z0-9]/g,'');
      const aberto = _vagasRotaAberta.has(chave);
      return `<div style="background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-left:3px solid var(--border-strong,#666);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-size:15px;font-weight:600">${c.nome}</div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:700;color:var(--text-secondary,#9ca3af)">${c.pedidos.length} carro(s)</div>
            <div style="font-size:11px;color:var(--text-secondary,#9ca3af)">sem caminhão ainda</div>
          </div>
        </div>
        <div style="margin-top:8px">
          <span onclick="_toggleVagasRota('${chave}')" style="font-size:12px;color:var(--accent,#ff6a00);cursor:pointer;user-select:none">${aberto?'▾':'▸'} ver carros</span>
        </div>
        ${aberto ? `<table class="corr-tabela" style="margin-top:10px">
          <thead><tr><th>ID</th><th>Solicitado</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th></tr></thead>
          <tbody>${[...c.pedidos].sort((a,b)=>(a.dataSolicitacao||'').localeCompare(b.dataSolicitacao||'')).map(p => `<tr class="corr-tr">
            <td class="ct-id">#${p.id}</td>
            <td class="ct-data">${_fmtDataSolic(p.dataSolicitacao)}</td>
            <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
            <td class="ct-modelo">${p.modelo||'—'}</td>
            <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
            <td class="ct-cli">${p.cliente||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>` : ''}
      </div>`;
    }).join('');
  }

  // Bloco: com vaga para vender
  html += `<h3 style="font-size:.9rem;color:var(--text-secondary,#9ca3af);margin:1.4rem 0 .8rem;text-transform:uppercase;letter-spacing:.4px">🚛 Rotas com caminhão <span class="text-muted" style="text-transform:none">(vagas para vender)</span></h3>`;
  if (dados.length === 0){
    html += '<p class="text-muted" style="padding:.3rem 0">Nenhuma rota com cegonha no momento.</p>';
  } else {
    html += dados.map(d => {
      const r = d.r;
      let cor, rotulo;
      if (d.vagas <= 0){ cor = '#f87171'; rotulo = 'Lotada'; }
      else if (d.vagas <= _KANBAN_CORTE_AMARELO){ cor = '#fbbf24'; rotulo = d.vagas + (d.vagas===1?' vaga':' vagas'); }
      else { cor = '#4ade80'; rotulo = d.vagas + ' vagas'; }
      const programada = r.motorista_1 && r.data_saida;
      const aberto = _vagasRotaAberta.has(String(r.id));
      return `<div style="background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-left:3px solid ${cor};border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:600">${r.nome||'—'}</div>
            <div style="font-size:12px;color:var(--text-secondary,#9ca3af);margin-top:3px">
              🚛 ${r.placa_cegonha}${r.motorista_1?' · 👤 '+r.motorista_1:''}${r.data_saida?' · 🕒 saída '+new Date(r.data_saida+'T12:00').toLocaleDateString('pt-BR'):''}${r.eta?' · 🏁 entrega prev. '+new Date(r.eta).toLocaleDateString('pt-BR'):''}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:700;color:${cor}">${rotulo}</div>
            <div style="font-size:11px;color:var(--text-secondary,#9ca3af)">${d.ocup}/${d.cap} ocupadas</div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${programada ? '<span style="font-size:11px;font-weight:600;color:#60a5fa;background:rgba(96,165,250,.14);padding:2px 8px;border-radius:6px">Em planejamento</span>' : (d.vagas<=0 ? '<span style="font-size:11px;color:var(--text-secondary,#9ca3af)">aguardando programação</span>' : '')}
          ${d.ocup > 0 ? `<span onclick="_toggleVagasRota('${r.id}')" style="font-size:12px;color:var(--accent,#ff6a00);cursor:pointer;user-select:none">${aberto?'▾':'▸'} ${d.ocup} carro(s) nesta carga</span>` : '<span style="font-size:12px;color:var(--text-secondary,#9ca3af)">carga vazia — vincule carros na Rota Planejada</span>'}
        </div>
        ${aberto && d.ocup > 0 ? `<table class="corr-tabela" style="margin-top:10px">
          <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th></tr></thead>
          <tbody>${_veiculosNaRota(r.id).map(p => `<tr class="corr-tr">
            <td class="ct-id">#${p.id}</td>
            <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
            <td class="ct-modelo">${p.modelo||'—'}</td>
            <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
            <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}">${p.cliente||'—'}</td>
          </tr>`).join('')}</tbody>
        </table>` : ''}
      </div>`;
    }).join('');
  }

  // ===== Seção 3: ROTAS A DEFINIR — criadas sem cegonha ainda =====
  let rotasADefinir = (rotasGlobais||[]).filter(r =>
    r.status !== 'cancelada' && r.status !== 'concluida' && !r.placa_cegonha);
  if (busca) rotasADefinir = rotasADefinir.filter(r => _norm(`${r.nome||''} ${r.motorista_1||''}`).includes(busca));
  html += `<h3 style="font-size:.9rem;color:var(--text-secondary,#9ca3af);margin:1.4rem 0 .8rem;text-transform:uppercase;letter-spacing:.4px">🅿️ Rotas a definir <span class="text-muted" style="text-transform:none">(criadas sem caminhão — escolha a cegonha)</span></h3>`;
  if (rotasADefinir.length === 0){
    html += '<p class="text-muted" style="padding:.3rem 0">Nenhuma rota pendente de caminhão.</p>';
  } else {
    html += rotasADefinir.map(r => {
      const carros = _veiculosNaRota(r.id);
      return `<div style="background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-left:3px solid #a78bfa;border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:600">${r.nome||'—'}</div>
            <div style="font-size:12px;color:var(--text-secondary,#9ca3af);margin-top:3px">
              ⏳ sem cegonha${r.motorista_1?' · 👤 '+r.motorista_1+' (motorista já indicado)':' · motorista a definir'} · ${carros.length} carro(s)
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="abrirEditarRota(${r.id})" title="Escolher a cegonha e o motorista">🚛 Definir caminhão</button>
        </div>
      </div>`;
    }).join('');
  }

  // ===== Seção 4: AGUARDANDO TRANSBORDO — carros parados no pátio esperando a próxima perna =====
  let transb = (pedidosGlobais||[]).filter(p =>
    p.status === 'Transbordo' && !['Entregue','Cancelado'].includes(p.status||''));
  if (busca) transb = transb.filter(p => _norm(`${p.cliente||''} ${p.placa||''} ${p.patioAtual||''} ${p.cidadeDestino||''}`).includes(busca));
  html += `<h3 style="font-size:.9rem;color:var(--text-secondary,#9ca3af);margin:1.4rem 0 .8rem;text-transform:uppercase;letter-spacing:.4px">🔁 Aguardando transbordo <span class="text-muted" style="text-transform:none">(no pátio esperando a próxima cegonha)</span></h3>`;
  if (transb.length === 0){
    html += '<p class="text-muted" style="padding:.3rem 0">Nenhum carro aguardando transbordo.</p>';
  } else {
    html += transb.map(p => {
      const tempo = (typeof tempoNoPatio==='function' && p.patioDesde) ? tempoNoPatio(p.patioDesde) : null;
      const chegouCom = p.placaCegonha || '—';
      return `<div style="background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-left:3px solid #fb923c;border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:600">🚗 ${p.placa||'—'} · ${p.modelo||''} <span class="text-muted" style="font-weight:400">#${p.id}</span></div>
            <div style="font-size:12px;color:var(--text-secondary,#9ca3af);margin-top:3px">
              🅿️ no pátio de <strong>${p.patioAtual||p.cidadeTransbordo||'—'}</strong>${tempo?' ('+tempo+')':''}
              · 🚛 chegou com <strong>${chegouCom}</strong>
              · 🏁 destino final <strong>${p.cidadeDestino||'—'}</strong>
            </div>
            <div style="font-size:12px;color:#fb923c;margin-top:3px">${p.cliente||''}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="abrirJogarCorredor(${p.id})" title="Encaixar num corredor a partir do pátio atual (próxima perna)">➡️ Próxima perna</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  cont.innerHTML = html;
}
function _toggleVagasRota(id){
  const k = String(id);
  if (_vagasRotaAberta.has(k)) _vagasRotaAberta.delete(k); else _vagasRotaAberta.add(k);
  renderizarVagasPorRota();
}

// ============================================================
// TABELA DE PREÇOS — remuneração do motorista por trecho
// ============================================================
async function salvarTabelaPreco(){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['financeiro','admin'].includes(perfil)){ alert('Apenas o Financeiro pode editar a tabela de preços.'); return; }
  const msg = document.getElementById('mensagemTabelaPreco');
  const origem = document.getElementById('tpOrigem')?.value.trim();
  const destino = document.getElementById('tpDestino')?.value.trim();
  const ufO = (document.getElementById('tpUfOrigem')?.value.trim()||'').toUpperCase() || null;
  const ufD = (document.getElementById('tpUfDestino')?.value.trim()||'').toUpperCase() || null;
  const comum = valorMoedaParaFloat(document.getElementById('tpComum')?.value || '0');
  const suv = valorMoedaParaFloat(document.getElementById('tpSuv')?.value || '0');
  if (!origem || !destino){ msg.textContent='Informe origem e destino.'; msg.className='message show error'; return; }
  msg.textContent='Salvando...'; msg.className='message show';
  try {
    const usuario = document.getElementById('usuarioLogado')?.textContent || null;
    const { data, error } = await supabase.from('tabela_precos')
      .insert({ cidade_origem: origem, uf_origem: ufO, cidade_destino: destino, uf_destino: ufD,
                valor_comum: comum, valor_suv: suv, ativo: true, criado_por: usuario }).select();
    if (error) throw error;
    if (data && data[0]) tabelaPrecosGlobais.push(data[0]);
    msg.textContent='Trecho salvo.'; msg.className='message show success';
    ['tpOrigem','tpUfOrigem','tpDestino','tpUfDestino','tpComum','tpSuv'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    renderizarTabelaPrecos();
  } catch(e){
    const dup = (e.message||'').includes('idx_tabela_precos_trecho') || (e.code==='23505');
    msg.textContent = dup ? 'Já existe um trecho com essa origem → destino.' : ('Erro: '+(e.message||e));
    msg.className='message show error';
  }
}

function renderizarTabelaPrecos(){
  const cont = document.getElementById('listaTabelaPrecos');
  if (!cont) return;
  const lista = (tabelaPrecosGlobais||[]).slice().sort((a,b)=>(a.cidade_origem||'').localeCompare(b.cidade_origem||''));
  if (lista.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum trecho cadastrado.</p>'; return; }
  cont.innerHTML = `<table class="corr-tabela" style="margin-top:10px">
    <thead><tr><th>Trecho</th><th>Comum</th><th>SUV/Caminhonete</th><th></th></tr></thead>
    <tbody>${lista.map(t => `<tr class="corr-tr">
      <td class="ct-rota"><strong>${t.cidade_origem}${t.uf_origem?'/'+t.uf_origem:''}</strong> <span class="cpl-seta">→</span> <strong>${t.cidade_destino}${t.uf_destino?'/'+t.uf_destino:''}</strong></td>
      <td class="ct-frete">R$ ${Number(t.valor_comum||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td class="ct-frete">R$ ${Number(t.valor_suv||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td class="ct-acoes"><button class="btn btn-sm btn-secondary" onclick="excluirTabelaPreco(${t.id})">🗑️</button></td>
    </tr>`).join('')}</tbody></table>`;
}

async function excluirTabelaPreco(id){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['financeiro','admin'].includes(perfil)){ alert('Apenas o Financeiro pode editar a tabela de preços.'); return; }
  if (!confirm('Excluir este trecho da tabela de preços?')) return;
  try {
    const { error } = await supabase.from('tabela_precos').delete().eq('id', id);
    if (error) throw error;
    tabelaPrecosGlobais = tabelaPrecosGlobais.filter(t => t.id !== id);
    renderizarTabelaPrecos();
  } catch(e){ alert('Erro ao excluir: '+(e.message||e)); }
}

// Helper: valor da TABELA oficial de um trecho (origem->destino) e categoria
function valorTabelaTrecho(cidadeOrigem, cidadeDestino, categoria){
  const faixaSuv = ['suv','caminhonete'].includes((categoria||'').toLowerCase());
  const t = (tabelaPrecosGlobais||[]).find(x =>
    _cidadeIgual(x.cidade_origem, cidadeOrigem) && _cidadeIgual(x.cidade_destino, cidadeDestino));
  if (!t) return null; // trecho não cadastrado na tabela oficial
  return Number(faixaSuv ? t.valor_suv : t.valor_comum) || 0;
}

// Valor MANUAL de um trecho (avulso, não-rotineiro)
function valorManualTrecho(cidadeOrigem, cidadeDestino, categoria){
  const faixaSuv = ['suv','caminhonete'].includes((categoria||'').toLowerCase());
  const t = (precosManuaisTrechoGlobais||[]).find(x =>
    _cidadeIgual(x.cidade_origem, cidadeOrigem) && _cidadeIgual(x.cidade_destino, cidadeDestino));
  if (!t) return null;
  return Number(faixaSuv ? t.valor_suv : t.valor_comum) || 0;
}

// Valor que o motorista recebe por um pedido, seguindo a hierarquia:
// 1) ajuste manual do pedido  >  2) tabela oficial  >  3) valor manual do trecho  >  pendente(null)
// Retorna { valor, origem: 'pedido'|'tabela'|'manual'|'pendente' }
function valorMotoristaPedido(p){
  const cat = p.categoriaVeiculo || p.categoria_veiculo || '';
  // 1) ajuste pontual do pedido vence tudo
  const ajuste = p.valorMotoristaManual != null ? p.valorMotoristaManual : p.valor_motorista_manual;
  if (ajuste != null && ajuste !== '') return { valor: Number(ajuste)||0, origem: 'pedido' };
  // 2) tabela oficial
  const tab = valorTabelaTrecho(p.cidadeOrigem, p.cidadeDestino, cat);
  if (tab != null) return { valor: tab, origem: 'tabela' };
  // 3) valor manual do trecho
  const man = valorManualTrecho(p.cidadeOrigem, p.cidadeDestino, cat);
  if (man != null) return { valor: man, origem: 'manual' };
  // pendente
  return { valor: null, origem: 'pendente' };
}

// ============================================================
// RELATÓRIO DE FATURAMENTO (fechamento 25→25)
// Considera CTe emitido no período E pedido entregue.
// Cortes: caminhão, motorista, veículo, trecho, cliente, categoria de cliente.
// ============================================================
let _relatFatCache = null; // linhas montadas do período

// Período padrão: dia 25 do mês anterior → dia 25 do mês atual
function _periodoPadrao2525(){
  const hoje = new Date();
  let ini, fim;
  if (hoje.getDate() >= 25){
    ini = new Date(hoje.getFullYear(), hoje.getMonth(), 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 25);
  } else {
    ini = new Date(hoje.getFullYear(), hoje.getMonth()-1, 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 25);
  }
  const fmt = d => d.toISOString().slice(0,10);
  return { de: fmt(ini), ate: fmt(fim) };
}

async function abrirRelatorioFaturamento(){
  const wrap = document.getElementById('relatFatWrap');
  if (!wrap) return;
  if (!document.getElementById('relatFatDe')){
    const per = _periodoPadrao2525();
    wrap.innerHTML = `
      <div class="hist-filtros" style="align-items:flex-end">
        <label class="hist-data">De <input type="date" id="relatFatDe" value="${per.de}"></label>
        <label class="hist-data">Até <input type="date" id="relatFatAte" value="${per.ate}"></label>
        <div class="manut-toolbar-campo" style="max-width:200px">
          <label>Agrupar por</label>
          <select id="relatFatGrupo" onchange="renderizarRelatorioFaturamento()">
            <option value="cliente">Cliente</option>
            <option value="tipoCliente">Categoria de cliente</option>
            <option value="motorista">Motorista</option>
            <option value="cegonha">Caminhão (cegonha)</option>
            <option value="veiculo">Veículo</option>
            <option value="trecho">Trecho</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="carregarRelatorioFaturamento()">🔎 Gerar</button>
        <button class="btn btn-secondary btn-sm" onclick="exportarRelatorioFaturamento()">⬇️ Exportar Excel</button>
      </div>
      <div id="relatFatResumo"></div>
      <div id="relatFatConteudo"><p class="text-muted" style="padding:1rem 0">Escolha o período e clique em <strong>Gerar</strong>.</p></div>`;
  }
  // já gera com o período padrão
  carregarRelatorioFaturamento();
}

async function carregarRelatorioFaturamento(){
  const de = document.getElementById('relatFatDe')?.value;
  const ate = document.getElementById('relatFatAte')?.value;
  const cont = document.getElementById('relatFatConteudo');
  if (!de || !ate){ alert('Informe o período.'); return; }
  if (cont) cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Carregando...</p>';
  try {
    // 1. CTes emitidos no período
    const { data: espelhos, error } = await supabase.from('ocorrencias')
      .select('cte_numero, cte_emitido_em, dados_extras, created_at')
      .eq('tipo','pdf_fiscal').eq('cte_emitido', true);
    if (error) throw error;

    // mapa nome do cliente -> tipo
    const tipoPorCliente = {};
    (clientesGlobais||[]).forEach(c => { if (c.nome) tipoPorCliente[c.nome] = c.tipo_cliente || ''; });

    const linhas = [];
    (espelhos||[]).forEach(e => {
      const dataCte = (e.cte_emitido_em || e.created_at || '').slice(0,10);
      if (!dataCte || dataCte < de || dataCte >= ate) return; // fora do período (por emissão)
      let extras = {}; try { extras = JSON.parse(e.dados_extras||'{}'); } catch(_){}
      const ids = Array.isArray(extras.pedidos_ids) ? extras.pedidos_ids : [];
      ids.forEach(pid => {
        const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pid));
        if (!p) return;
        if ((p.status||'') !== 'Entregue') return; // só entregues
        if ((p.cobrancaStatus||'') === 'cortesia') return; // cortesia não gera receita
        linhas.push({
          id: p.id, cteNumero: e.cte_numero, dataCte,
          cliente: p.cliente || '—', tipoCliente: TIPOS_CLIENTE[tipoPorCliente[p.cliente]] || '—',
          motorista: p.motorista1 || '—', cegonha: p.placaCegonha || '—',
          veiculo: `${p.modelo||''} ${p.placa||''}`.trim() || '—',
          trecho: `${p.cidadeOrigem||'?'} → ${p.cidadeDestino||'?'}`,
          frete: Number(p.valorFrete||0),
          cobrado: (p.cobrancaStatus === 'confirmado' || p.receitaConfirmada) ? 'sim' : 'não',
          cteOk: e.cte_numero ? 'sim' : 'não'
        });
      });
    });
    _relatFatCache = linhas;
    renderizarRelatorioFaturamento();
    if (typeof renderizarRemuneracaoMotorista === 'function') renderizarRemuneracaoMotorista();
  } catch(e){
    if (cont) cont.innerHTML = `<p class="text-muted" style="padding:1rem 0">Erro ao carregar: ${e.message||e}</p>`;
  }
}

// Troca entre as sub-abas da tela Relatórios (Faturamento / Remuneração)
function _relSubaba(qual, btn){
  document.querySelectorAll('#relatoriosFin .cad-subtab-btn').forEach(b => b.classList.remove('ativo'));
  if (btn) btn.classList.add('ativo');
  const fat = document.getElementById('relFaturamentoView');
  const rem = document.getElementById('relRemuneracaoView');
  if (qual === 'faturamento'){
    if (fat) fat.style.display = '';
    if (rem) rem.style.display = 'none';
    if (typeof renderizarRelatorioFaturamento === 'function') renderizarRelatorioFaturamento();
  } else {
    if (fat) fat.style.display = 'none';
    if (rem) rem.style.display = '';
    if (typeof renderizarRemuneracaoMotorista === 'function') renderizarRemuneracaoMotorista();
  }
}

function renderizarRelatorioFaturamento(){
  const cont = document.getElementById('relatFatConteudo');
  const resumo = document.getElementById('relatFatResumo');
  const grupoCampo = document.getElementById('relatFatGrupo')?.value || 'cliente';
  if (!cont) return;
  const linhas = _relatFatCache || [];
  if (linhas.length === 0){
    if (resumo) resumo.innerHTML = '';
    cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum faturamento no período (CTe emitido + entregue).</p>';
    return;
  }
  const total = linhas.reduce((s,l)=>s+l.frete,0);
  const semCobranca = linhas.filter(l => l.cobrado === 'não').length;
  const semCte = linhas.filter(l => l.cteOk === 'não').length;

  if (resumo){
    resumo.innerHTML = `<div class="ocup-resumo" style="margin:14px 0">
      <div class="ocup-resumo-card"><span class="ocup-resumo-label">Faturamento total</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="ocup-resumo-card"><span class="ocup-resumo-label">Pedidos faturados</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">${linhas.length}</span></div></div>
      <div class="ocup-resumo-card ${semCobranca?'patios-resumo-alerta':''}"><span class="ocup-resumo-label">Sem cobrança confirmada</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">${semCobranca}</span></div></div>
    </div>`;
  }

  // agrupa
  const grupos = {};
  linhas.forEach(l => { const k = l[grupoCampo] || '—'; (grupos[k] = grupos[k] || []).push(l); });
  const chaves = Object.keys(grupos).sort((a,b)=> grupos[b].reduce((s,l)=>s+l.frete,0) - grupos[a].reduce((s,l)=>s+l.frete,0));

  cont.innerHTML = chaves.map(k => {
    const itens = grupos[k];
    const sub = itens.reduce((s,l)=>s+l.frete,0);
    return `<div class="hist-motorista">
      <div class="hist-mot-cab">
        <strong>${k}</strong>
        <span class="text-muted">${itens.length} pedido(s) · R$ ${sub.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
      </div>
      <table class="corr-tabela">
        <thead><tr><th>ID</th><th>CTe</th><th>Data</th><th>Cliente</th><th>Categoria</th><th>Motorista</th><th>Cegonha</th><th>Veículo</th><th>Trecho</th><th>Frete</th><th>Cobrança</th></tr></thead>
        <tbody>${itens.map(l => `<tr class="corr-tr">
          <td class="ct-id">#${l.id}</td>
          <td>${l.cteNumero?'🧾 '+l.cteNumero:'—'}</td>
          <td>${l.dataCte ? new Date(l.dataCte+'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
          <td class="ct-cli">${l.cliente}</td>
          <td>${l.tipoCliente}</td>
          <td>${l.motorista}</td>
          <td class="ct-placa">${l.cegonha}</td>
          <td class="ct-modelo">${l.veiculo}</td>
          <td class="ct-rota">${l.trecho}</td>
          <td class="ct-frete">R$ ${l.frete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td>${l.cobrado==='sim'?'✅':'<span style="color:#f87171">pendente</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
}

function exportarRelatorioFaturamento(){
  const linhas = _relatFatCache || [];
  if (linhas.length === 0){ alert('Gere o relatório primeiro.'); return; }
  const cab = ['ID','CTe','Data emissão','Cliente','Categoria','Motorista','Cegonha','Veículo','Trecho','Frete','Cobrança','CTe OK'];
  const linhasCsv = linhas.map(l => [l.id, l.cteNumero||'', l.dataCte, l.cliente, l.tipoCliente, l.motorista, l.cegonha, l.veiculo, l.trecho, String(l.frete).replace('.',','), l.cobrado, l.cteOk]);
  const total = linhas.reduce((s,l)=>s+l.frete,0);
  linhasCsv.push([]);
  linhasCsv.push(['','','','','','','','','TOTAL', String(total).replace('.',','),'','']);
  const csv = [cab, ...linhasCsv].map(r => r.map(c => `"${String(c==null?'':c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const de = document.getElementById('relatFatDe')?.value || '';
  const ate = document.getElementById('relatFatAte')?.value || '';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `faturamento_${de}_a_${ate}.csv`;
  a.click();
}

// ============================================================
// AUDITORIA DE REMUNERAÇÃO DO MOTORISTA (no fechamento)
// Mostra o valor da tabela por pedido e destaca trechos PENDENTES (fora da tabela)
// ============================================================
function renderizarRemuneracaoMotorista(){
  const cont = document.getElementById('remuneracaoWrap');
  if (!cont) return;
  const linhas = _relatFatCache || [];
  if (linhas.length === 0){
    cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Gere o relatório de faturamento primeiro (mesmo período).</p>';
    return;
  }
  // reusa os pedidos do período; recalcula o valor do motorista
  const dados = linhas.map(l => {
    const p = (pedidosGlobais||[]).find(x => String(x.id) === String(l.id));
    const vm = p ? valorMotoristaPedido(p) : { valor:null, origem:'pendente' };
    return { ...l, valorMot: vm.valor, origemMot: vm.origem, p };
  });
  const pendentes = dados.filter(d => d.origemMot === 'pendente');
  const totalTabela = dados.reduce((s,d)=>s+(d.valorMot||0),0);
  const totalFrete = dados.reduce((s,d)=>s+d.frete,0);
  const bonus = totalFrete - totalTabela;

  const selo = o => o==='pedido' ? '<span class="rem-selo rem-selo-ped">ajuste do pedido</span>'
    : o==='tabela' ? '<span class="rem-selo rem-selo-tab">tabela</span>'
    : o==='manual' ? '<span class="rem-selo rem-selo-man">manual do trecho</span>'
    : '<span class="rem-selo rem-selo-pend">⚠️ fora da tabela</span>';

  cont.innerHTML = `
    <div class="ocup-resumo" style="margin:14px 0">
      <div class="ocup-resumo-card"><span class="ocup-resumo-label">Total tabela (motoristas)</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">R$ ${totalTabela.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="ocup-resumo-card"><span class="ocup-resumo-label">Bônus/abatimento empresa</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num" style="color:${bonus>=0?'#4ade80':'#f87171'}">R$ ${bonus.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="ocup-resumo-card ${pendentes.length?'patios-resumo-alerta':''}"><span class="ocup-resumo-label">Trechos fora da tabela</span><div class="ocup-resumo-topo"><span class="ocup-resumo-num">${pendentes.length}</span></div></div>
    </div>
    ${pendentes.length ? `<div class="rem-alerta">⚠️ <strong>${pendentes.length} trecho(s) fora da tabela</strong> — informe o valor abaixo (o botão 💾 salva para todos os pedidos do mesmo trecho).</div>` : ''}
    <table class="corr-tabela">
      <thead><tr><th>ID</th><th>Motorista</th><th>Trecho</th><th>Categoria</th><th>Frete</th><th>Valor motorista</th><th>Origem</th><th>Ação</th></tr></thead>
      <tbody>${dados.map(d => {
        const cat = (d.p?.categoriaVeiculo || d.p?.categoria_veiculo || '—');
        const pend = d.origemMot === 'pendente';
        return `<tr class="corr-tr ${pend?'rem-tr-pend':''}">
          <td class="ct-id">#${d.id}</td>
          <td>${d.motorista}</td>
          <td class="ct-rota">${d.trecho}</td>
          <td>${cat}</td>
          <td class="ct-frete">R$ ${d.frete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td class="ct-frete">${d.valorMot!=null ? 'R$ '+d.valorMot.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—'}</td>
          <td>${selo(d.origemMot)}</td>
          <td class="ct-acoes">
            ${pend
              ? `<input type="text" id="remTrecho_${d.id}" placeholder="valor" style="width:90px" class="ocup-busca"><button class="btn btn-sm btn-primary" onclick="_salvarValorManualTrecho(${d.id})" title="Vale para todos deste trecho">💾</button>`
              : `<button class="btn btn-sm btn-secondary" onclick="_abrirAjustePedido(${d.id})" title="Pagar valor diferente só neste pedido">✏️</button>`}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

// Salva valor manual do trecho (vale pra todos os pedidos do mesmo trecho)
async function _salvarValorManualTrecho(pedidoId){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['financeiro','admin'].includes(perfil)){ alert('Apenas o Financeiro pode informar valores.'); return; }
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  if (!p) return;
  const val = valorMoedaParaFloat(document.getElementById('remTrecho_'+pedidoId)?.value || '0');
  if (!val){ alert('Informe um valor.'); return; }
  const cat = (p.categoriaVeiculo || p.categoria_veiculo || '').toLowerCase();
  const faixaSuv = ['suv','caminhonete'].includes(cat);
  try {
    const usuario = document.getElementById('usuarioLogado')?.textContent || null;
    // upsert: se já existe o trecho, atualiza a faixa; senão cria
    const existente = (precosManuaisTrechoGlobais||[]).find(x =>
      _cidadeIgual(x.cidade_origem, p.cidadeOrigem) && _cidadeIgual(x.cidade_destino, p.cidadeDestino));
    if (existente){
      const upd = faixaSuv ? { valor_suv: val } : { valor_comum: val };
      await supabase.from('precos_manuais_trecho').update(upd).eq('id', existente.id);
      if (faixaSuv) existente.valor_suv = val; else existente.valor_comum = val;
    } else {
      const novo = { cidade_origem: p.cidadeOrigem, cidade_destino: p.cidadeDestino,
        valor_comum: faixaSuv ? 0 : val, valor_suv: faixaSuv ? val : 0, criado_por: usuario };
      const { data } = await supabase.from('precos_manuais_trecho').insert(novo).select();
      if (data && data[0]) precosManuaisTrechoGlobais.push(data[0]);
    }
    renderizarRemuneracaoMotorista();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemFaturamento', `Valor do trecho ${p.cidadeOrigem}→${p.cidadeDestino} salvo.`, 'success');
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

// Ajuste pontual por pedido (vence a tabela)
async function _abrirAjustePedido(pedidoId){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['financeiro','admin'].includes(perfil)){ alert('Apenas o Financeiro pode ajustar valores.'); return; }
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  if (!p) return;
  const atual = p.valorMotoristaManual != null ? p.valorMotoristaManual : (p.valor_motorista_manual || '');
  const nv = prompt(`Valor do motorista SÓ para o pedido #${pedidoId} (${p.cidadeOrigem}→${p.cidadeDestino}).\nDeixe vazio para voltar ao valor da tabela.`, atual || '');
  if (nv === null) return;
  const val = nv.trim() === '' ? null : valorMoedaParaFloat(nv);
  try {
    await supabase.from('pedidos').update({ valor_motorista_manual: val }).eq('id', pedidoId);
    p.valorMotoristaManual = val; p.valor_motorista_manual = val;
    renderizarRemuneracaoMotorista();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

// ============================================================
// COLETA no lançamento (combinado do vendedor)
// ============================================================
function _toggleColetaCampos(){
  const forma = document.getElementById('formaColeta')?.value;
  const gP = document.getElementById('grupoPatioColeta');
  const gE = document.getElementById('grupoEquipeColeta');
  if (gP) gP.style.display = (forma === 'patio') ? '' : 'none';
  if (gE) gE.style.display = (forma === 'coletador') ? '' : 'none';
  // popula pátios
  if (forma === 'patio'){
    const sel = document.getElementById('patioColeta');
    if (sel && !sel.options.length){
      sel.innerHTML = '<option value="">Selecione o pátio...</option>' +
        (typeof PATIOS_FIXOS!=='undefined'?PATIOS_FIXOS:[]).map(p=>`<option value="${p}">${p}</option>`).join('');
    }
  }
