/* ============================================================================
   MOVEMASTER — mod-08.js  (83 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: carregarCorredores, _renderCorredores, _editarNomeCorredor, salvarCorredor, excluirCorredor, _norm, _posNaSeq, gerarSugestoesRota, ...
   ============================================================================ */
let corredoresGlobais = [];

async function carregarCorredores(){
  const cont = document.getElementById('listaCorredores');
  try {
    const { data: cors, error } = await supabase.from('corredores')
      .select('*').order('nome');
    if (error) throw error;
    corredoresGlobais = cors || [];
    // paradas de cada corredor
    const { data: paradas } = await supabase.from('corredor_paradas')
      .select('*').order('ordem');
    const porCor = {};
    (paradas||[]).forEach(p => { (porCor[p.corredor_id] = porCor[p.corredor_id] || []).push(p); });
    corredoresGlobais.forEach(c => { c._paradas = porCor[c.id] || []; });
    _renderCorredores();
  } catch(e){
    if (cont) cont.innerHTML = '<p class="message show error">Erro ao carregar corredores: '+(e.message||e)+'</p>';
  }
}

function _renderCorredores(){
  const cont = document.getElementById('listaCorredores');
  if (!cont) return;
  if (corredoresGlobais.length === 0){ cont.innerHTML = '<p class="text-muted">Nenhum corredor cadastrado ainda.</p>'; return; }
  cont.innerHTML = corredoresGlobais.map(c => {
    const seq = (c._paradas||[]).map(p => p.cidade).join(' → ') || `${c.origem} → ${c.destino}`;
    return `<div class="corredor-linha">
      <div class="corredor-info">
        <strong>${c.nome}</strong>
        <span class="text-muted">${c.origem} → ${c.destino} · SLA ${c.sla_horas}h</span>
        <span class="corredor-seq">🛣️ ${seq}</span>
      </div>
      <div class="corredor-acoes">
        <button class="btn btn-sm btn-secondary" onclick="_editarNomeCorredor(${c.id})">✏️ Nome</button>
        <button class="btn btn-sm btn-secondary" onclick="excluirCorredor(${c.id})">🗑️ Excluir</button>
      </div>
    </div>`;
  }).join('');
}

// Editar o nome de um corredor (caso tenha digitado errado)
async function _editarNomeCorredor(id){
  const c = (corredoresGlobais||[]).find(x => String(x.id)===String(id));
  if (!c) return;
  const novo = prompt(`Editar o nome do corredor:`, c.nome || '');
  if (novo === null) return;
  const nome = novo.trim();
  if (!nome){ alert('O nome não pode ficar vazio.'); return; }
  try {
    await supabase.from('corredores').update({ nome }).eq('id', id);
    c.nome = nome;
    _renderCorredores();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemCorredor', `✅ Nome do corredor atualizado para "${nome}".`, 'success');
  } catch(e){ alert('Erro ao editar: '+(e.message||e)); }
}

async function salvarCorredor(){
  const msgEl = document.getElementById('mensagemCorredor');
  const nome = document.getElementById('corNome')?.value.trim();
  const origem = document.getElementById('corOrigem')?.value.trim();
  const destino = document.getElementById('corDestino')?.value.trim();
  const sla = parseInt(document.getElementById('corSla')?.value,10);
  const paradasRaw = document.getElementById('corParadas')?.value.trim();
  if (!nome || !origem || !destino){ msgEl.textContent='Preencha nome, origem e destino.'; msgEl.className='message show error'; return; }
  if (!sla || sla < 1){ msgEl.textContent='Informe um SLA válido (horas).'; msgEl.className='message show error'; return; }

  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('corredores').insert({
      nome, origem, destino, sla_horas: sla, ativo: true
    }).select();
    if (error) throw error;
    const cor = data && data[0];
    // paradas: usa a lista informada; se vazia, usa origem+destino
    let cidades = paradasRaw ? paradasRaw.split(',').map(s => s.trim()).filter(Boolean) : [origem, destino];
    if (cor && cidades.length){
      const linhas = cidades.map((cidade, i) => ({ corredor_id: cor.id, ordem: i+1, cidade }));
      await supabase.from('corredor_paradas').insert(linhas);
    }
    msgEl.textContent = 'Corredor salvo.';
    msgEl.className = 'message show success';
    ['corNome','corOrigem','corDestino','corParadas'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('corSla').value = 24;
    carregarCorredores();
  } catch(e){
    msgEl.textContent = 'Erro ao salvar: ' + (e.message||e);
    msgEl.className = 'message show error';
  }
}

async function excluirCorredor(id){
  if (!confirm('Excluir este corredor? As paradas associadas também serão removidas.')) return;
  try {
    await supabase.from('corredor_paradas').delete().eq('corredor_id', id);
    const { error } = await supabase.from('corredores').delete().eq('id', id);
    if (error) throw error;
    corredoresGlobais = corredoresGlobais.filter(c => c.id !== id);
    _renderCorredores();
  } catch(e){ alert('Erro ao excluir: ' + (e.message||e)); }
}

// ============================================================
// LOTE 11 — ITEM 12 (parte 2): SUGESTÃO INTELIGENTE POR CORREDORES
// Cruza pedidos pendentes com corredores; agrupa por sequência de
// paradas e janela de datas; mostra ocupação p/ validação da Logística.
// ============================================================
const _CEGONHA_CAP_REF = 11;          // capacidade de referência p/ ocupação
const _JANELA_DIAS_SUG = 3;           // janela de datas para agrupar

function _norm(txt){
  return (txt||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// posição de uma cidade na sequência do corredor (-1 se não estiver)
function _posNaSeq(seq, cidade){
  // compara só a parte da cidade, ignorando "/UF" (ex.: "Curitiba/PR" = "Curitiba")
  const soCidade = v => _norm((v || '').toString().split('/')[0]);
  const alvo = soCidade(cidade);
  if (!alvo) return -1;
  return seq.findIndex(s => soCidade(s) === alvo);
}

function gerarSugestoesRota(){
  const wrap = document.getElementById('sugestoesRotaWrap');
  if (!wrap) return;
  // Sugestão é ferramenta da logística — nunca renderiza para outros perfis.
  if (typeof podeAlocarOuTransbordar === 'function' && !podeAlocarOuTransbordar()){ wrap.innerHTML = ''; return; }
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  if (corredores.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }

  // pedidos pendentes, não-reserva, sem cegonha
  const pendentes = (pedidosGlobais||[]).filter(p =>
    !p.isReserva && !p.placaCegonha && !(p.rotaId || p.rota_id) &&
    !['Entregue','Cancelado'].includes(p.status || 'Pendente'));
  if (pendentes.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }

  const sugestoes = [];
  corredores.forEach(cor => {
    const seq = (cor._paradas||[]).length >= 2 ? cor._paradas.map(p=>p.cidade) : [cor.origem, cor.destino];
    // pedidos que "cabem" no corredor: parte do PÁTIO (se houver) ou da origem;
    // aceita origem→destino na ordem, ou encaixe no caminho (destino no trajeto).
    const fits = pendentes.filter(p => {
      const partida = p.patioAtual || p.cidadeOrigem;
      const io = _posNaSeq(seq, partida);
      const id = _posNaSeq(seq, p.cidadeDestino);
      const noPatioDoTronco = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id)
          || (noPatioDoTronco && id === -1);
    });
    if (fits.length === 0) return;

    // agrupa por janela de datas (data_solicitacao)
    const ordenados = fits.slice().sort((a,b) => (a.dataSolicitacao||'').localeCompare(b.dataSolicitacao||''));
    let cluster = [];
    let inicio = null;
    const flush = () => {
      if (cluster.length){ sugestoes.push({ cor, seq, itens: cluster.slice() }); cluster = []; }
    };
    ordenados.forEach(p => {
      const d = p.dataSolicitacao ? new Date(p.dataSolicitacao+'T12:00') : null;
      if (!inicio || !d){ if (cluster.length===0) inicio = d; cluster.push(p); return; }
      const difDias = Math.abs((d - inicio)/86400000);
      if (difDias <= _JANELA_DIAS_SUG){ cluster.push(p); }
      else { flush(); inicio = d; cluster.push(p); }
    });
    flush();
  });

  if (sugestoes.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  _sugestoesCache = sugestoes;

  wrap.innerHTML = `<div class="sugestoes-box">
    <div class="sugestoes-titulo sugestoes-toggle" onclick="_toggleSugestoes()" style="cursor:pointer;user-select:none">
      <span id="sugChevron">${_sugestoesAbertas?'▾':'▸'}</span> 🧭 Sugestões de rota por corredor (${sugestoes.length}) — para validação da Logística
    </div>
    <div id="sugestoesLista" style="display:${_sugestoesAbertas?'block':'none'}">
    ${sugestoes.map((s, idx) => {
      const ocup = Math.min(100, Math.round((s.itens.length / _CEGONHA_CAP_REF) * 100));
      const corPct = ocup >= 80 ? '#4ade80' : ocup >= 50 ? '#fbbf24' : '#fb923c';
      const datas = s.itens.map(p=>p.dataSolicitacao).filter(Boolean).sort();
      const janela = datas.length ? `${_fmtDataChk(datas[0])}${datas.length>1?' a '+_fmtDataChk(datas[datas.length-1]):''}` : '—';
      const paradasComPedido = s.seq.map(cidade => {
        const temColeta = s.itens.some(p => _norm(p.cidadeOrigem) === _norm(cidade));
        const temEntrega = s.itens.some(p => _norm(p.cidadeDestino) === _norm(cidade));
        const marca = temColeta && temEntrega ? '↕' : temColeta ? '↑' : temEntrega ? '↓' : '·';
        return `<span class="sug-parada ${marca!=='·'?'sug-parada-ativa':''}">${marca} ${cidade}</span>`;
      }).join('<span class="sug-seta">→</span>');
      return `<div class="sugestao-card">
        <div class="sugestao-cab">
          <strong>${s.cor.nome}</strong>
          <span class="text-muted">SLA ${s.cor.sla_horas}h · janela ${janela}</span>
          <span class="sug-ocup" style="color:${corPct}">${s.itens.length}/${_CEGONHA_CAP_REF} · ${ocup}% da cegonha</span>
        </div>
        <div class="sug-paradas">${paradasComPedido}</div>
        <div class="sug-pedidos">${s.itens.map(p =>
          `<span class="sug-pedido">#${p.id} ${p.cliente} (${p.cidadeOrigem}→${p.cidadeDestino})</span>`).join('')}</div>
        ${(typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar()) ? `<button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="criarRotaDaSugestao(${idx})">🛣️ Criar rota e alocar ${s.itens.length} carro(s)</button>` : ''}
      </div>`;
    }).join('')}
    </div>
  </div>`;
  _espelharSugPainel();
}

let _sugestoesAbertas = false;
function _toggleSugestoes(){
  _sugestoesAbertas = !_sugestoesAbertas;
  document.querySelectorAll('#sugestoesLista').forEach(el => el.style.display = _sugestoesAbertas ? 'block' : 'none');
  document.querySelectorAll('#sugChevron').forEach(el => el.textContent = _sugestoesAbertas ? '▾' : '▸');
}

// Espelha as sugestões de rota também no Painel de Acompanhamento
function _espelharSugPainel(){
  const a = document.getElementById('sugestoesRotaWrap');
  const b = document.getElementById('sugestoesRotaPainel');
  if (a && b) b.innerHTML = a.innerHTML;
}

// ============================================================
// LOTE 12 — ITEM 16: HORÁRIO PREVISTO + ETA AUTOMÁTICO
// ETA = saída real + SLA do corredor. Tags de entrega 🟢🟡🔴.
// ============================================================
const _ETA_ATENCAO_H = 3; // horas antes do ETA em que entra em "Atenção"

function statusETA(etaISO){
  if (!etaISO) return null;
  const eta = new Date(etaISO).getTime();
  const agora = Date.now();
  const restanteH = (eta - agora) / 3600000;
  if (restanteH < 0)  return { cor:'vermelho', emoji:'🔴', label:'Em Atraso',  txt:`atrasado ${Math.abs(Math.round(restanteH))}h` };
  if (restanteH <= _ETA_ATENCAO_H) return { cor:'amarelo', emoji:'🟡', label:'Atenção', txt:`restam ~${Math.max(0,Math.round(restanteH))}h` };
  return { cor:'verde', emoji:'🟢', label:'Na Janela', txt:`restam ~${Math.round(restanteH)}h` };
}

function etaRotaHTML(r){
  if (!r || !r.eta) return '';
  const s = statusETA(r.eta);
  if (!s) return '';
  const etaFmt = new Date(r.eta).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  return ` · <span class="tag-eta tag-${s.cor}" title="ETA ${etaFmt} · ${s.txt}">${s.emoji} ETA ${etaFmt}</span>`;
}

// ============================================================
// LOTE 14 — ITENS 7 e 8: CONFIRMAÇÃO DO COMERCIAL (aviso 4h) +
// FECHAMENTO POR STATUS VERDE (rota) + envio ao motorista
// ============================================================
const _CONFIRM_AVISO_H = 4; // aviso quando faltam <= 4h para a coleta

function _horasAteColeta(p){
  const dt = p.dataPrevColeta || p.data_prev_coleta;
  if (!dt) return null;
  return (new Date(dt).getTime() - Date.now()) / 3600000;
}

function renderizarConfirmacaoComercial(){
  const wrap = document.getElementById('confirmacaoComercialWrap');
  if (!wrap) return;
  wrap.innerHTML = ''; // fluxo de confirmação de intenção aposentado — status agora é livre
  if (typeof _espelharSugPainel === 'function') _espelharSugPainel();
  return;
}
function _renderizarConfirmacaoComercial_desativado(){
  const wrap = document.getElementById('confirmacaoComercialWrap');
  if (!wrap) return;
  const aguardando = (pedidosGlobais||[]).filter(p => p.status === 'Aguardando Confirmação' && p.origemLancamento !== 'logistica');
  if (aguardando.length === 0){ wrap.innerHTML = ''; _espelharSugPainel(); return; }
  wrap.innerHTML = `<div class="confirmacao-box">
    <div class="confirmacao-titulo">✅ Intenções aguardando sua confirmação (${aguardando.length})</div>
    ${aguardando.map(p => {
      const h = _horasAteColeta(p);
      const urgente = h !== null && h <= _CONFIRM_AVISO_H;
      const aviso = h === null ? ''
        : urgente ? `<span class="confirma-urgente">${h < 0 ? '⏰ coleta vencida' : `🔴 faltam ${Math.max(0,Math.round(h))}h p/ coleta`}</span>`
        : `<span class="text-muted">coleta em ~${Math.round(h)}h</span>`;
      return `<div class="confirma-linha ${urgente?'confirma-linha-urgente':''}">
        <span class="confirma-rota">#${p.id} · ${p.cliente} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span>🚛 ${p.placaCegonha || 'A definir'}</span>
        ${aviso}
        <button class="btn btn-sm btn-primary" onclick="mudarStatusPlanilha(${p.id}, 'Enviado coleta')">✅ Confirmar (libera coleta)</button>
      </div>`;
    }).join('')}
  </div>`;
}

// ---------- Item 8: fechamento da rota quando tudo "verde" ----------
// "verde" = pedido já passou da confirmação (Em Coleta em diante).
function _pedidosDaRota(rotaId, placaCegonha){
  return (pedidosGlobais||[]).filter(p =>
    (String(p.rotaId) === String(rotaId)) ||
    (placaCegonha && p.placaCegonha === placaCegonha && !['Entregue','Cancelado'].includes(p.status))
  );
}
function _rotaStatusVerde(rotaId, placaCegonha){
  const ped = _pedidosDaRota(rotaId, placaCegonha).filter(p => p.status !== 'Cancelado');
  if (ped.length === 0) return { total:0, verdes:0, todosVerdes:false };
  const verdes = ped.filter(p => !['Pendente','Intenção Agendada','Aguardando Confirmação'].includes(p.status)).length;
  return { total: ped.length, verdes, todosVerdes: verdes === ped.length };
}
function fechamentoRotaHTML(r){
  const v = _rotaStatusVerde(r.id, r.placa_cegonha);
  if (v.total === 0) return '';
  if (r.carga_fechada) return ` · <span class="tag-fechada">🔒 Carga fechada</span>`;
  if (v.todosVerdes && (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())){
    return ` · <span class="tag-verde-ok">✅ Tudo validado</span>`;
  }
  return ` · <span class="text-muted">${v.verdes}/${v.total} validado(s)</span>`;
}

async function fecharCargaRota(rotaId){
  if (bloquearSeNaoLogistica('o fechamento da carga')) return;
  const r = (rotasGlobais||[]).find(x => String(x.id) === String(rotaId));
  if (!r) return;
  const v = _rotaStatusVerde(r.id, r.placa_cegonha);
  if (!v.todosVerdes){ alert('Ainda há pedidos não validados nesta rota.'); return; }
  if (!confirm(`Fechar a carga da rota "${r.nome || '#'+r.id}" e enviar ao motorista da cegonha ${r.placa_cegonha||'—'}?`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('rotas_planejadas')
      .update({ carga_fechada:true, fechada_em:new Date().toISOString(), fechada_por:usuario })
      .eq('id', rotaId);
    if (error) throw error;
    r.carga_fechada = true;
    // envia ao motorista (notificação) — ele confere as placas no app
    try {
      if (r.placa_cegonha){
        const ped = _pedidosDaRota(r.id, r.placa_cegonha)[0];
        if (ped && typeof notificarMotoristaDoPedido === 'function'){
          await notificarMotoristaDoPedido(ped, {
            titulo: '🔒 Carga fechada — confira as placas',
            corpo: `Rota ${r.nome || '#'+r.id} liberada. Confira as placas dos veículos pelo app.`
          });
        }
      }
    } catch(e){}
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', '🔒 Carga fechada e enviada ao motorista.', 'success');
  } catch(e){
    alert('Erro ao fechar carga: ' + (e.message||e));
  }
}

// ============================================================
// LOTE 17 — ITENS 3-4: LAST MILE (fila da Logística) + EQUIPES
// ============================================================
// ---- Item 4: cadastro de equipes de entrega ----
async function salvarEquipeEntrega(){
  const msgEl = document.getElementById('mensagemEquipe');
  const nome = document.getElementById('eqNome')?.value.trim();
  const responsavel = document.getElementById('eqResponsavel')?.value.trim() || null;
  const cidade_base = document.getElementById('eqCidadeBase')?.value.trim() || null;
  const uf_base = (document.getElementById('eqUfBase')?.value.trim() || '').toUpperCase() || null;
  const membros = document.getElementById('eqMembros')?.value.trim() || null;
  if (!nome){ msgEl.textContent='Informe o nome da equipe.'; msgEl.className='message show error'; return; }
  msgEl.textContent='Salvando...'; msgEl.className='message show';
  try {
    const { data, error } = await supabase.from('equipes_entrega')
      .insert({ nome, responsavel, cidade_base, uf_base, membros, ativo:true }).select();
    if (error) throw error;
    if (data && data[0]) equipesEntregaGlobais.push(data[0]);
    msgEl.textContent='Equipe salva.'; msgEl.className='message show success';
    ['eqNome','eqResponsavel','eqCidadeBase','eqUfBase','eqMembros'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    renderizarEquipesEntrega();
  } catch(e){ msgEl.textContent='Erro: '+(e.message||e); msgEl.className='message show error'; }
}

function renderizarEquipesEntrega(){
  const cont = document.getElementById('listaEquipes');
  if (!cont) return;
  if (equipesEntregaGlobais.length === 0){ cont.innerHTML='<p class="text-muted">Nenhuma equipe cadastrada.</p>'; return; }
  cont.innerHTML = equipesEntregaGlobais.map(e => `
    <div class="corredor-linha">
      <div class="corredor-info"><strong>${e.nome}</strong>
        ${e.cidade_base ? `<span class="carteira-badge">📍 ${e.cidade_base}${e.uf_base?'/'+e.uf_base:''}</span>` : '<span class="corredor-tag-semrota">sem cidade base</span>'}
        <span class="text-muted">${e.responsavel ? '· Resp.: '+e.responsavel : ''}${e.membros ? ' · 👥 '+e.membros : ''}</span></div>
      <button class="btn btn-sm btn-secondary" onclick="excluirEquipeEntrega(${e.id})">🗑️ Excluir</button>
    </div>`).join('');
}

async function excluirEquipeEntrega(id){
  if (!confirm('Excluir esta equipe?')) return;
  try {
    const { error } = await supabase.from('equipes_entrega').delete().eq('id', id);
    if (error) throw error;
    equipesEntregaGlobais = equipesEntregaGlobais.filter(e => e.id !== id);
    renderizarEquipesEntrega();
  } catch(e){ alert('Erro ao excluir: '+(e.message||e)); }
}

// ---- Item 3: fila de last mile (após a viagem principal) ----
// Entram pedidos "Em Transporte" ainda sem definição de entrega final.
function _pedidosLastMile(){
  return (pedidosGlobais||[]).filter(p =>
    p.status === 'Em Transporte' && !p.fluxoEntrega && p.status !== 'Cancelado');
}

function renderizarLastMile(){
  const wrap = document.getElementById('lastMileWrap');
  if (!wrap) return;
  // Removido da Gestão Logística — a definição de entrega é feita na Central de Operação.
  wrap.innerHTML = '';
  if (typeof _espelharSugPainel === 'function') _espelharSugPainel();
  return;
}
function _renderizarLastMileAntigo(){
  const opcoesEquipe = (equipesEntregaGlobais||[]).map(e => `<option value="${e.id}">${e.nome}${e.responsavel?' ('+e.responsavel+')':''}</option>`).join('');
  wrap.innerHTML = `<div class="lastmile-box">
    <div class="lastmile-titulo">🚚 Last mile — definir entrega final (${fila.length})</div>
    ${fila.map(p => `
      <div class="lastmile-linha" id="lm_${p.id}">
        <span class="lastmile-rota">#${p.id} · ${p.cliente} · → ${p.cidadeDestino}/${p.ufDestino}
          <span class="text-muted">(entrega: ${p.tipoEntrega === 'estabelecimento' ? 'estabelecimento' : 'pátio'})</span></span>
        <select class="lm-fluxo" onchange="_lmToggleEquipe(${p.id})" id="lmFluxo_${p.id}">
          <option value="">Definir…</option>
          <option value="direta">Entrega direta</option>
          <option value="equipe">Via equipe local</option>
        </select>
        <select class="lm-equipe" id="lmEquipe_${p.id}" style="display:none">
          <option value="">Selecione a equipe…</option>${opcoesEquipe}
        </select>
        <select class="lm-modalidade" id="lmModal_${p.id}">
          <option value="patio">Pátio</option>
          <option value="estabelecimento">Estabelecimento</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="definirLastMile(${p.id})">✓ Registrar</button>
      </div>`).join('')}
  </div>`;
  // pré-seleciona a modalidade conforme o tipo de entrega do pedido
  fila.forEach(p => { const m=document.getElementById('lmModal_'+p.id); if(m) m.value = p.tipoEntrega || 'patio'; });
}

function _lmToggleEquipe(id){
  const fluxo = document.getElementById('lmFluxo_'+id)?.value;
  const selEq = document.getElementById('lmEquipe_'+id);
  if (selEq) selEq.style.display = (fluxo === 'equipe') ? '' : 'none';
}

async function definirLastMile(pedidoId){
  if (bloquearSeNaoLogistica('a definição de entrega')) return;
  const fluxo = document.getElementById('lmFluxo_'+pedidoId)?.value;
  const equipeId = document.getElementById('lmEquipe_'+pedidoId)?.value || null;
  const modalidade = document.getElementById('lmModal_'+pedidoId)?.value || 'patio';
  if (!fluxo){ alert('Escolha entrega direta ou via equipe.'); return; }
  if (fluxo === 'equipe' && !equipeId){ alert('Selecione a equipe local.'); return; }
  const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
  const equipe = (equipesEntregaGlobais||[]).find(e => String(e.id) === String(equipeId));
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error: e1 } = await supabase.from('entregas_last_mile').insert({
      pedido_id: parseInt(pedidoId), fluxo_entrega: fluxo,
      equipe_id: equipeId ? parseInt(equipeId) : null,
      responsavel: equipe?.responsavel || null, modalidade,
      concluida_por: usuario, concluida_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
      created_at: new Date().toISOString()
    });
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('pedidos')
      .update({ fluxo_entrega: fluxo, equipe_entrega_id: equipeId ? parseInt(equipeId) : null })
      .eq('id', parseInt(pedidoId));
    if (e2) throw e2;
    if (p){ p.fluxoEntrega = fluxo; p.equipeEntregaId = equipeId; }
    renderizarLastMile();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `🚚 Entrega do #${pedidoId} definida: ${fluxo === 'equipe' ? 'via '+(equipe?.nome||'equipe') : 'direta'} (${modalidade}).`, 'success');
  } catch(e){ alert('Erro ao registrar entrega: '+(e.message||e)); }
}

// ============================================================
// LOTE 18 — ITEM 9: FATURAMENTO NA LOGÍSTICA + EXTRATO DO MOTORISTA
// ============================================================
function _fmtBRL(v){
  return (v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

// Extrato simplificado: viagens concluídas + faturamento previsto
function carregarExtratoMotorista(){
  const resumo = document.getElementById('extratoMotoristaResumo');
  const lista = document.getElementById('extratoMotoristaLista');
  if (!lista) return;

  // nomes do motorista logado
  let nomes = [];
  if (typeof nomesDoMotoristaLogado === 'function'){
    try { nomes = (nomesDoMotoristaLogado().nomes || []); } catch(e){}
  }
  if (nomes.length === 0){
    const n = document.getElementById('usuarioLogado')?.textContent; if (n) nomes = [n];
  }
  const norm = t => (t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const alvos = nomes.map(norm).filter(Boolean);
  const ehDoMotorista = p => {
    const m1 = norm(p.motorista1 || p.motorista_1);
    const m2 = norm(p.motorista2 || p.motorista_2);
    return alvos.includes(m1) || alvos.includes(m2);
  };

  const meus = (pedidosGlobais||[]).filter(ehDoMotorista);
  const concluidas = meus.filter(p => p.status === 'Entregue');

  // faturamento previsto: soma do valor_previsto das rotas em que o motorista está
  // (conta cada rota uma vez), considerando pedidos não entregues/cancelados.
  const rotaIds = new Set();
  meus.forEach(p => { if (p.rotaId && !['Entregue','Cancelado'].includes(p.status)) rotaIds.add(String(p.rotaId)); });
  let previsto = 0;
  (rotasGlobais||[]).forEach(r => { if (rotaIds.has(String(r.id)) && r.valor_previsto) previsto += Number(r.valor_previsto); });

  if (resumo){
    resumo.innerHTML = `
      <div class="extrato-cards">
        <div class="extrato-card"><span class="extrato-num">${concluidas.length}</span><span class="extrato-rot">viagens concluídas</span></div>
        <div class="extrato-card"><span class="extrato-num">${_fmtBRL(previsto)}</span><span class="extrato-rot">faturamento previsto</span></div>
      </div>`;
  }

  if (concluidas.length === 0){
    lista.innerHTML = '<p class="text-muted">Nenhuma viagem concluída ainda.</p>';
    return;
  }
  lista.innerHTML = '<h3 class="conf-titulo">Viagens concluídas</h3>' +
    concluidas.slice(0,30).map(p => `
      <div class="extrato-linha">
        <span>#${p.id} · ${p.cidadeOrigem}/${p.ufOrigem} → ${p.cidadeDestino}/${p.ufDestino}</span>
        <span class="text-muted">${p.cliente || ''}</span>
        <span class="tag-eta tag-verde">✔ Entregue</span>
      </div>`).join('');
}

// ============================================================
// LOTE 19 — ITEM 18: CONFERÊNCIA / AUDITORIA DE FATURAMENTO
// Só conferência (não emite). Previsto x emitido por entrada manual.
// Tela na Logística; leitura na Diretoria; divergência sinalizada.
// ============================================================
const _DIVERGENCIA_TOLERANCIA = 0.01;

function _rotasComFaturamento(){
  return (rotasGlobais||[]).filter(r => r.valor_previsto != null)
    .sort((a,b) => (b.data_saida||'').localeCompare(a.data_saida||''));
}

// Painel editável (Logística)
function renderizarConferenciaFaturamento(){
  const wrap = document.getElementById('conferenciaFatWrap');
  if (!wrap) return;
  const todas = _rotasComFaturamento();
  const rotas = todas.filter(r => r.valor_emitido == null); // só as pendentes de conferência
  const jaConferidas = todas.length - rotas.length;
  if (rotas.length === 0){
    wrap.innerHTML = jaConferidas > 0
      ? `<div class="card"><h2>🧾 Conferência de Faturamento</h2><p class="text-muted" style="margin-top:.4rem">✅ Tudo conferido — nenhuma rota pendente. (${jaConferidas} já conferida(s))</p></div>`
      : '';
    return;
  }
  wrap.innerHTML = `<div class="card">
    <div class="painel-header-bar"><h2>🧾 Conferência de Faturamento (previsto × emitido)</h2>
      <button class="btn btn-secondary btn-sm" onclick="renderizarConferenciaFaturamento()">↻ Atualizar</button></div>
    <p class="text-muted" style="margin:.2rem 0 1rem;font-size:.86rem">
      Confira antes/depois da emissão externa de NFe/CTe. O sistema só compara e sinaliza — não emite nada.${jaConferidas > 0 ? ` · <strong>${jaConferidas}</strong> já conferida(s) saíram da lista.` : ''}</p>
    <table class="tabela-conf">
      <thead><tr><th>Rota</th><th>Previsto</th><th>Emitido (NFe/CTe)</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${rotas.map(r => {
          const prev = Number(r.valor_previsto)||0;
          const emit = r.valor_emitido != null ? Number(r.valor_emitido) : null;
          const div = emit != null && Math.abs(prev - emit) > _DIVERGENCIA_TOLERANCIA;
          const st = emit == null ? '<span class="text-muted">a conferir</span>'
                    : div ? `<span class="conf-divergente">⚠️ divergência ${_fmtBRL(emit-prev)}</span>`
                          : '<span class="conf-ok">✅ confere</span>';
          return `<tr>
            <td>${r.nome || '#'+r.id} <span class="text-muted">${r.placa_cegonha||''}</span></td>
            <td>${_fmtBRL(prev)}</td>
            <td><input type="number" step="0.01" class="conf-input" id="confEmit_${r.id}" value="${emit!=null?emit:''}" placeholder="0,00"></td>
            <td>${st}</td>
            <td><button class="btn btn-sm btn-primary" onclick="salvarConferenciaRota(${r.id})">Salvar</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

async function salvarConferenciaRota(rotaId){
  if (bloquearSeNaoLogistica('a conferência de faturamento')) return;
  const r = (rotasGlobais||[]).find(x => String(x.id) === String(rotaId));
  if (!r) return;
  const emit = parseFloat(document.getElementById('confEmit_'+rotaId)?.value);
  if (isNaN(emit)){ alert('Informe o valor emitido.'); return; }
  const prev = Number(r.valor_previsto)||0;
  const div = Math.abs(prev - emit) > _DIVERGENCIA_TOLERANCIA;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { error } = await supabase.from('rotas_planejadas').update({
      valor_emitido: emit, conf_divergencia: div,
      conferido_por: usuario, conferido_em: new Date().toISOString()
    }).eq('id', rotaId);
    if (error) throw error;
    r.valor_emitido = emit; r.conf_divergencia = div;
    renderizarConferenciaFaturamento();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      div ? `⚠️ Divergência registrada na rota ${r.nome||'#'+r.id}.` : `✅ Faturamento da rota ${r.nome||'#'+r.id} confere.`,
      div ? 'error' : 'success');
  } catch(e){ alert('Erro ao salvar conferência: '+(e.message||e)); }
}

// Espelho de leitura (Diretoria)
function renderizarConferenciaDiretoria(){
  const el = document.getElementById('dirConferenciaFat');
  if (!el) return;
  const rotas = _rotasComFaturamento().filter(r => r.valor_emitido != null);
  const divergentes = rotas.filter(r => r.conf_divergencia);
  if (rotas.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = `<div class="dir-conf-box ${divergentes.length?'dir-conf-alerta':''}">
    <strong>🧾 Conferência de faturamento:</strong>
    ${rotas.length} rota(s) conferida(s) ·
    ${divergentes.length ? `<span class="conf-divergente">${divergentes.length} com divergência</span>` : '<span class="conf-ok">todas conferem</span>'}
  </div>`;
}

// ============================================================
// Diretoria — pedidos por responsável comercial (qtd + período)
// ============================================================
function renderComerciais(){
  const el = document.getElementById('dirComerciais');
  if (!el) return;
  const periodo = document.getElementById('dirComPeriodo')?.value || 'mes';
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);
  const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);
  const dataDoPedido = p => new Date(p.dataSolicitacao || p.data_solicitacao || p.criadoEm || hoje);

  const noPeriodo = (pedidosGlobais||[]).filter(p => {
    if (p.status === 'Cancelado') return false;
    const d = dataDoPedido(p);
    if (periodo === 'mes')         return d >= inicioMes;
    if (periodo === 'mespassado')  return d >= inicioMesPassado && d <= fimMesPassado;
    if (periodo === 'ano')         return d >= inicioAno;
    return true; // tudo
  });

  const _normResp = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                          .toLowerCase().replace(/\s+/g,' ').trim();
  const _tituloResp = s => (s||'').replace(/\s+/g,' ').trim()
                          .replace(/\b\p{L}/gu, c => c.toUpperCase());
  const mapa = {};
  noPeriodo.forEach(p => {
    const original = p.responsavelComercial || '(sem responsável)';
    const chave = _normResp(original) || '(sem responsavel)';
    if (!mapa[chave]) mapa[chave] = { carros: 0, total: 0, nome: _tituloResp(original) || '(sem responsável)' };
    mapa[chave].carros++;
    mapa[chave].total += parseFloat(p.valorFrete) || 0;
  });
  // ordena por QUANTIDADE de carros/pedidos
  const lista = Object.entries(mapa).sort((a,b) => b[1].carros - a[1].carros).slice(0, 10);
  const max = Math.max(...lista.map(l => l[1].carros), 1);

  el.innerHTML = lista.length === 0
    ? '<p class="text-muted text-sm">Nenhum pedido no período.</p>'
    : lista.map(([chave, d]) => `
        <div class="dir-barra-linha">
          <span class="dir-barra-rot" title="${d.nome}">${d.nome}</span>
          <div class="dir-barra-trilho">
            <div class="dir-barra" style="width:${Math.max(2,(d.carros/max)*100)}%;background:#a78bfa"></div>
          </div>
          <span class="dir-barra-val">${d.carros} pedido(s)<small>${_dirMoeda ? _dirMoeda(d.total) : ''}</small></span>
        </div>`).join('');
}

// ============================================================
// Cadastros — sub-abas (abre só a seção escolhida) + restrição por perfil
// ============================================================
const _CAD_GRUPOS = [
  { id:'clientes',   label:'👥 Clientes',   perfis:['comercial','logistica','admin'] },
  { id:'veiculos',   label:'🚛 Veículos',   perfis:['logistica','admin'] },
  { id:'motoristas', label:'🧑‍✈️ Motoristas', perfis:['logistica','admin'] },
  { id:'corredores', label:'🛣️ Corredores', perfis:['logistica','admin'] },
  { id:'equipes',    label:'🚚 Equipes',    perfis:['logistica','admin'] },
  { id:'outros',     label:'⚙️ Outros',     perfis:['admin'] }
];

function _classificarCardCadastro(card){
  const txt = (card.textContent || '').toLowerCase();
  const html = card.innerHTML || '';
  if (card.id === 'cardCadastroClientes' || txt.includes('cadastro de cliente') || html.includes('corpo_listaClientes')) return 'clientes';
  if (txt.includes('corredores')) return 'corredores';
  if (txt.includes('equipes de entrega')) return 'equipes';
  if (txt.includes('cadastro de motorista') || html.includes('corpo_listaMotoristas')) return 'motoristas';
  if (txt.includes('cadastro de veículo') || txt.includes('cadastro de veiculo') || html.includes('corpo_listaVeiculos') || html.includes('listaVeiculos')) return 'veiculos';
  return 'outros';
}

function inicializarCadastrosSubabas(){
  const sec = document.getElementById('cadastros');
  if (!sec) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : 'admin';

  // 1) marca cada card com seu grupo
  const cards = Array.from(sec.querySelectorAll(':scope > .card'));
  cards.forEach(c => { c.dataset.cadsec = _classificarCardCadastro(c); });

  // 2) grupos existentes e permitidos p/ o perfil
  const gruposPresentes = _CAD_GRUPOS.filter(g =>
    g.perfis.includes(perfil) && cards.some(c => c.dataset.cadsec === g.id));

  // 3) (re)constrói a barra de sub-abas
  let bar = sec.querySelector('.cad-subtabs');
  if (bar) bar.remove();
  bar = document.createElement('div');
  bar.className = 'cad-subtabs';
  bar.innerHTML = gruposPresentes.map((g,i) =>
    `<button class="cad-subtab-btn${i===0?' ativo':''}" data-sec="${g.id}" onclick="mostrarCadastroSub('${g.id}')">${g.label}</button>`
  ).join('');
  sec.insertBefore(bar, sec.firstChild);

  // 4) esconde cards de grupos não permitidos e abre o primeiro
  cards.forEach(c => {
    const permitido = gruposPresentes.some(g => g.id === c.dataset.cadsec);
    if (!permitido) c.style.display = 'none';
  });
  if (gruposPresentes.length) mostrarCadastroSub(gruposPresentes[0].id);
}

function mostrarCadastroSub(sec){
  const cont = document.getElementById('cadastros');
  if (!cont) return;
  cont.querySelectorAll(':scope > .card').forEach(c => {
    c.style.display = (c.dataset.cadsec === sec) ? '' : 'none';
  });
  cont.querySelectorAll('.cad-subtab-btn').forEach(b => {
    b.classList.toggle('ativo', b.dataset.sec === sec);
  });
}

// ============================================================
// Responsável comercial — menu de seleção com nomes já usados
// ============================================================
function _tituloResp2(s){ return (s||'').replace(/\s+/g,' ').trim().replace(/\b\p{L}/gu, c => c.toUpperCase()); }
function _normResp2(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }

function popularResponsaveisComercial(){
  const sel = document.getElementById('responsavelComercial');
  if (!sel) return;
  const atual = sel.value;
  // nomes distintos já usados (dedup por normalização) + usuário logado
  const mapa = {};
  (pedidosGlobais||[]).forEach(p => {
    const r = p.responsavelComercial; if (!r) return;
    const k = _normResp2(r); if (!k) return;
    if (!mapa[k]) mapa[k] = _tituloResp2(r);
  });
  const usuarioRaw = document.getElementById('usuarioLogado')?.textContent || '';
  const usuario = /visualizando|admin/i.test(usuarioRaw) ? '' : usuarioRaw;
  if (usuario){ const k=_normResp2(usuario); if(k && !mapa[k]) mapa[k]=_tituloResp2(usuario); }
  const nomes = Object.values(mapa).sort((a,b)=>a.localeCompare(b));

  sel.innerHTML = '<option value="">Selecione…</option>'
    + nomes.map(n => `<option value="${n}">${n}</option>`).join('')
    + '<option value="__outro__">➕ Outro (digitar)</option>';

  // mantém seleção anterior, ou sugere o usuário logado
  if (atual && atual !== '__outro__') sel.value = atual;
  else if (usuario){ const alvo = _tituloResp2(usuario); if (nomes.includes(alvo)) sel.value = alvo; }
  _toggleRespComOutro();

  // Perfil que lança no próprio perfil (comercial, logística): não precisa perguntar quem é o
  // responsável — é o próprio usuário logado. Esconde o campo.
  // Admin mantém o campo (pode lançar em nome de terceiros).
  const grupo = document.getElementById('grupoResponsavelComercial');
  if (grupo){
    const lancaNoProprioPerfil = (typeof perfilAtual !== 'undefined' && ['comercial','logistica'].includes(perfilAtual));
    grupo.style.display = lancaNoProprioPerfil ? 'none' : '';
  }
}

function _toggleRespComOutro(){
  const sel = document.getElementById('responsavelComercial');
  const outro = document.getElementById('responsavelComercialOutro');
  if (!sel || !outro) return;
  outro.style.display = (sel.value === '__outro__') ? '' : 'none';
}

function _getResponsavelComercial(){
  // Se o campo está oculto (perfil comercial lançando no próprio perfil), usa o usuário logado.
  const wrap = document.getElementById('grupoResponsavelComercial');
  if (wrap && wrap.style.display === 'none'){
    return document.getElementById('usuarioLogado')?.textContent?.trim() || '';
  }
  const sel = document.getElementById('responsavelComercial');
  if (!sel) return document.getElementById('usuarioLogado')?.textContent?.trim() || '';
  if (sel.value === '__outro__'){
    return _tituloResp2(document.getElementById('responsavelComercialOutro')?.value || '');
  }
  // se não selecionou nada, cai para o usuário logado
  return sel.value || document.getElementById('usuarioLogado')?.textContent?.trim() || '';
}

// ============================================================
// Indicador de "processando" — feedback para os cliques
// ============================================================
let _procTimer = null, _procAtivo = 0;
function mostrarProcessando(){
  _procAtivo++;
  // só mostra se demorar mais de 250ms (evita piscar em ações rápidas)
  if (_procTimer) return;
  _procTimer = setTimeout(() => {
    let el = document.getElementById('mm-processando');
    if (!el){
      el = document.createElement('div');
      el.id = 'mm-processando';
      el.innerHTML = '<div class="mm-proc-spin"></div><span>Processando…</span>';
      document.body.appendChild(el);
    }
    el.classList.add('ativo');
  }, 250);
}
function ocultarProcessando(){
  _procAtivo = Math.max(0, _procAtivo - 1);
  if (_procAtivo > 0) return;
  if (_procTimer){ clearTimeout(_procTimer); _procTimer = null; }
  const el = document.getElementById('mm-processando');
  if (el) el.classList.remove('ativo');
}

// Recarga leve: só pedidos + rotas (usado nas ações frequentes)
async function recarregarPedidos(){
  return carregarDadosDoSupabase({ somentePedidos: true });
}

// Máscara de CNPJ para campos avulsos (coleta/entrega)
function mascaraCNPJcampo(input){
  let v = input.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2')
       .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
       .replace(/\.(\d{3})(\d)/, '.$1/$2')
       .replace(/(\d{4})(\d)/, '$1-$2');
  input.value = v;
}

// ============================================================
// Autopreenchimento por CNPJ — API pública cnpj.ws
// (gratuita, ~3 consultas/min por IP; sem token)
// ============================================================
async function consultarCNPJ(cnpjBruto){
  const cnpj = (cnpjBruto || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return null;
  const resp = await fetch('https://publica.cnpj.ws/cnpj/' + cnpj, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error('Muitas consultas seguidas — aguarde 1 minuto e tente de novo.');
    if (resp.status === 404) throw new Error('CNPJ não encontrado.');
    throw new Error('Não foi possível consultar o CNPJ agora.');
  }
  const d = await resp.json();
  const est = d.estabelecimento || {};
  return {
    razaoSocial: d.razao_social || est.nome_fantasia || '',
    logradouro: [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ').trim(),
    numero: est.numero || '',
    complemento: est.complemento || '',
    bairro: est.bairro || '',
    cidade: (est.cidade && est.cidade.nome) || '',
    uf: (est.estado && est.estado.sigla) || '',
    cep: est.cep || '',
    email: est.email || '',
    telefone: (est.ddd1 && est.telefone1) ? `(${est.ddd1}) ${est.telefone1}` : ''
  };
}
function _setVal(id, val){ const el = document.getElementById(id); if (el && val) el.value = val; }
function _fmtCEP(c){ const v=(c||'').replace(/\D/g,''); return v.length===8 ? v.replace(/(\d{5})(\d{3})/, '$1-$2') : (c||''); }

// 1) Cadastro de cliente
async function autoPreencherCNPJCliente(){
  const bruto = document.getElementById('cnpjCliente')?.value || '';
  if (bruto.replace(/\D/g,'').length !== 14) return;
  if (typeof mostrarProcessando === 'function') mostrarProcessando();
  try {
    const dados = await consultarCNPJ(bruto);
    if (!dados) return;
    _setVal('nomeCliente', dados.razaoSocial);
    _setVal('enderecoCliente', dados.logradouro);
    _setVal('numeroCliente', dados.numero);
    _setVal('bairroCliente', dados.bairro);
    _setVal('cidadeCliente', dados.cidade);
    _setVal('ufCliente', dados.uf);
    _setVal('cepCliente', _fmtCEP(dados.cep));
    if (!document.getElementById('emailCliente')?.value) _setVal('emailCliente', dados.email);
    if (!document.getElementById('telefoneCliente')?.value) _setVal('telefoneCliente', dados.telefone);
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemCadastroCliente', '✅ Dados preenchidos pelo CNPJ. Confira e ajuste se precisar.', 'success');
  } catch(e){
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemCadastroCliente', '⚠️ ' + (e.message || 'Falha ao consultar CNPJ') + ' Preencha manualmente.', 'error');
  } finally {
    if (typeof ocultarProcessando === 'function') ocultarProcessando();
  }
}

// 2) CNPJ de coleta/entrega no lançamento comercial
async function autoPreencherCNPJLocal(qual){ // qual = 'Coleta' | 'Entrega'
  const bruto = document.getElementById('cnpj' + qual)?.value || '';
  if (bruto.replace(/\D/g,'').length !== 14) return;
  if (typeof mostrarProcessando === 'function') mostrarProcessando();
  try {
    const dados = await consultarCNPJ(bruto);
    if (!dados) return;
    const endereco = [dados.logradouro, dados.numero, dados.bairro].filter(Boolean).join(', ');
    _setVal('endereco' + qual, endereco);
    _setVal('cep' + qual, _fmtCEP(dados.cep));
    if (qual === 'Coleta'){ _setVal('cidadeOrigem', dados.cidade); _setVal('ufOrigem', dados.uf); }
    else { _setVal('cidadeDestino', dados.cidade); _setVal('ufDestino', dados.uf); }
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', `✅ Endereço de ${qual.toLowerCase()} preenchido pelo CNPJ.`, 'success');
  } catch(e){
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', '⚠️ ' + (e.message || 'Falha ao consultar CNPJ') + ' Preencha manualmente.', 'error');
  } finally {
    if (typeof ocultarProcessando === 'function') ocultarProcessando();
  }
}

// ITEM 3 — Autocomplete de cliente cadastrado nos endereços de Coleta/Entrega.
// Cada campo (Coleta/Entrega) busca independente e preenche endereço + cidade/uf + CNPJ.
function _buscarClienteEndereco(qual, termo){
  const lista = document.getElementById('listaCliente' + qual);
  if (!lista) return;
  const t = (termo||'').trim().toLowerCase();
  if (t.length < 2){ lista.innerHTML = ''; lista.classList.remove('aberta'); return; }
  const achados = (clientesGlobais||[]).filter(c => {
    const alvo = `${c.nome||''} ${c.nome_fantasia||''} ${c.cidade||''} ${c.cnpj||''} ${c.cpf||''} ${_soDigitos(c.cnpj)} ${_soDigitos(c.cpf)} ${c.bairro||''}`.toLowerCase();
    return t.split(/\s+/).every(parte => alvo.includes(parte));
  }).slice(0, 8);
  if (achados.length === 0){ lista.innerHTML = '<div class="cli-auto-vazio">Nenhum cliente encontrado</div>'; lista.classList.add('aberta'); return; }
  lista.innerHTML = achados.map(c => {
    const endResumo = [c.endereco, c.numero, c.bairro].filter(Boolean).join(', ');
    const cidadeUf = `${c.cidade||''}${c.uf?('/'+c.uf):''}`;
    const doc = c.cnpj || c.cpf || '';
    const fantasia = (c.nome_fantasia && _norm(c.nome_fantasia) !== _norm(c.nome||'')) ? ` <span class="cai-cidade" style="color:#f59e0b">🏷️ ${c.nome_fantasia}</span>` : '';
    return `<div class="cli-auto-item" onmousedown="event.preventDefault();_selecionarClienteEndereco('${qual}', ${c.id})">
      <div class="cai-nome">${c.nome||''}${fantasia}${cidadeUf?` <span class="cai-cidade">📍 ${cidadeUf}</span>`:''}</div>
      <div class="cai-end">${doc?`🏢 ${doc}`:''}${doc&&endResumo?' · ':''}${endResumo||''}</div>
    </div>`;
  }).join('');
  lista.classList.add('aberta');
}

function _selecionarClienteEndereco(qual, clienteId){
  const c = (clientesGlobais||[]).find(x => String(x.id)===String(clienteId));
  if (!c) return;
  const endereco = [c.endereco, c.numero, c.bairro].filter(Boolean).join(', ');
  _setVal('endereco' + qual, endereco);
  if (c.cep) _setVal('cep' + qual, c.cep);
  if (c.cnpj) _setVal('cnpj' + qual, c.cnpj);
  // cidade/uf são <select> — usa helper que cria a opção se não existir
  if (qual === 'Coleta'){ _setSelectVal('ufOrigem', c.uf); setTimeout(()=>_setSelectVal('cidadeOrigem', c.cidade), 350); }
  else { _setSelectVal('ufDestino', c.uf); setTimeout(()=>_setSelectVal('cidadeDestino', c.cidade), 350); }
  _setVal('buscaCliente' + qual, c.nome || '');
  _fecharClienteEndereco(qual);
  if (typeof _popularCorredoresPedido === 'function') { try { _popularCorredoresPedido(); } catch(e){} }
  if (typeof exibirMensagem === 'function') exibirMensagem('mensagemComercial', `✅ Endereço de ${qual.toLowerCase()} preenchido com os dados de ${c.nome}.`, 'success');
}

// Seleciona valor num <select>; se a opção não existir, cria. Serve para input também.
function _setSelectVal(id, val){
  if (!val) return;
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'SELECT'){
    let existe = [...el.options].some(o => o.value === val || o.text === val);
    if (!existe){ const opt = document.createElement('option'); opt.value = val; opt.text = val; el.appendChild(opt); }
    // seleciona por valor OU texto
    const alvo = [...el.options].find(o => o.value === val || o.text === val);
    if (alvo) el.value = alvo.value;
    el.dispatchEvent(new Event('change'));
  } else {
    el.value = val;
  }
}

function _fecharClienteEndereco(qual){
  const lista = document.getElementById('listaCliente' + qual);
  if (lista){ lista.classList.remove('aberta'); lista.innerHTML = ''; }
}

// ============================================================
// Preview ao vivo do cálculo de frete (por carro x cheio)
// ============================================================
function atualizarPreviewFrete(){
  const el = document.getElementById('fretePreview');
  if (!el) return;
  const tipo = document.getElementById('freteTipo')?.value || 'cheio';
  const valorBase = valorMoedaParaFloat(document.getElementById('valorFrete')?.value || '');
  const linhasExtra = Array.from(document.querySelectorAll('.veiculo-extra-row'));
  const qtd = 1 + linhasExtra.length;
  const money = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  if (!valorBase || valorBase <= 0){ el.innerHTML = ''; return; }

  if (tipo === 'cheio'){
    const porCarro = valorBase / qtd;
    el.innerHTML = `🧮 Frete cheio: <strong>${money(valorBase)}</strong> ÷ ${qtd} carro(s) = <strong>${money(porCarro)}</strong> por carro`;
  } else {
    // por carro: soma o valor de cada carro (principal + extras, cada um o seu ou o principal)
    let total = valorBase;
    let todosIguais = true;
    linhasExtra.forEach(l => {
      const s = l.querySelector('.veiculo-extra-valor')?.value.trim();
      const v = s ? valorMoedaParaFloat(s) : valorBase;
      total += v;
      if (v !== valorBase) todosIguais = false;
    });
    el.innerHTML = todosIguais
      ? `🧮 Por carro: <strong>${money(valorBase)}</strong> × ${qtd} carro(s) = <strong>${money(total)}</strong> no total`
      : `🧮 Por carro (valores diferentes): total da carga = <strong>${money(total)}</strong>`;
  }
}

// Autopreenchimento por CNPJ no modal de EDIÇÃO de cliente
async function autoPreencherCNPJEdicao(){
  const bruto = document.getElementById('edCliCnpj')?.value || '';
  if (bruto.replace(/\D/g,'').length !== 14) return;
  if (typeof mostrarProcessando === 'function') mostrarProcessando();
  try {
    const dados = await consultarCNPJ(bruto);
    if (!dados) return;
    _setVal('edCliNome', dados.razaoSocial);
    _setVal('edCliEndereco', dados.logradouro);
    _setVal('edCliNumero', dados.numero);
    _setVal('edCliBairro', dados.bairro);
    _setVal('edCliCidade', dados.cidade);
    _setVal('edCliUf', dados.uf);
    _setVal('edCliCep', _fmtCEP(dados.cep));
    if (!document.getElementById('edCliEmail')?.value) _setVal('edCliEmail', dados.email);
    if (!document.getElementById('edCliTelefone')?.value) _setVal('edCliTelefone', dados.telefone);
    const msg = document.getElementById('mensagemEdicaoCliente');
    if (msg){ msg.textContent = '✅ Dados atualizados pelo CNPJ. Confira e salve.'; msg.className = 'message show success'; }
  } catch(e){
    const msg = document.getElementById('mensagemEdicaoCliente');
    if (msg){ msg.textContent = '⚠️ ' + (e.message || 'Falha ao consultar CNPJ'); msg.className = 'message show error'; }
  } finally {
    if (typeof ocultarProcessando === 'function') ocultarProcessando();
  }
}

// Cache das sugestões e criação de rota já alocando os carros sugeridos
let _sugestoesCache = [];
async function criarRotaDaSugestao(idx){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const s = _sugestoesCache[idx];
  if (!s || !supabase) return;
  const seqCidades = (s.seq || []).filter(Boolean);
  const ids = s.itens.map(p => parseInt(p.id));
  // Abre o mesmo modal de escolha de cegonha/motorista usado na criação por seleção
  _corridorRotaCtx = { corredorId: s.cor.id, ids, nome: s.cor.nome, seq: seqCidades };
  _abrirModalCegonhaRotaCorr(s.cor.nome, ids.length);
}

// ============================================================
// Carteira de Demanda — pedidos sem rota, agrupados por origem
// (aba interna do Painel de Acompanhamento; logística e comercial)
// ============================================================
function mostrarViewPainel(view, btn){
  const painel = document.getElementById('painel');
  const corredores = document.getElementById('painelViewCorredores');
  const avancar = document.getElementById('painelViewAvancar');
  const historico = document.getElementById('painelViewHistorico');
  const vagas = document.getElementById('painelViewVagas');
  const viagens = document.getElementById('painelViewViagens');
  const planejamento = document.getElementById('painelViewPlanejamento');
  const central = document.getElementById('painelViewCentral');
  if (!painel) return;
  const esconder = painel.querySelectorAll('.ocup-resumo, .ocup-filtros, .tabela-scroll, #sugestoesRotaPainel');
  const ehExtra = (view === 'corredores' || view === 'avancar' || view === 'historico' || view === 'vagas' || view === 'viagens' || view === 'planejamento' || view === 'central');
  esconder.forEach(e => e.style.display = ehExtra ? 'none' : '');
  if (corredores) corredores.style.display = (view === 'corredores') ? '' : 'none';
  if (avancar) avancar.style.display = (view === 'avancar') ? '' : 'none';
  if (historico) historico.style.display = (view === 'historico') ? '' : 'none';
  if (vagas) vagas.style.display = (view === 'vagas') ? '' : 'none';
  if (viagens) viagens.style.display = (view === 'viagens') ? '' : 'none';
  if (planejamento) planejamento.style.display = (view === 'planejamento') ? '' : 'none';
  if (central) central.style.display = (view === 'central') ? '' : 'none';
  if (view === 'corredores') renderizarPainelCorredores();
  if (view === 'avancar') renderizarAvancarPedidos();
  if (view === 'historico'){ historico.innerHTML = _histCargasCasca(); renderizarHistoricoCargas(); }
  if (view === 'viagens') renderizarViagensAndamento();
  if (view === 'planejamento') renderizarPlanejamentoRotas();
  if (view === 'central') renderizarCentralOperacao();
  if (view === 'vagas'){ vagas.innerHTML = `<div class="carteira-topo"><input type="text" id="vagasBusca" class="ocup-busca" placeholder="🔍 Filtrar por rota, cegonha, motorista..." oninput="_mmDeb('renderizarVagasPorRota', renderizarVagasPorRota)"><span class="text-muted">onde há vaga para vender</span></div><div id="vagasPorRotaWrap"></div>`; renderizarVagasPorRota(); }
  document.querySelectorAll('.painel-subtabs .cad-subtab-btn').forEach(b => b.classList.remove('ativo'));
  if (btn) btn.classList.add('ativo');
}

function renderizarCarteiraDemanda(){
  const cont = document.getElementById('painelViewCarteira');
  if (!cont) return;
  if (!document.getElementById('carteiraBusca')){
    cont.innerHTML = `
      <p class="text-muted" style="margin:.2rem 0 .8rem;font-size:.85rem">📋 <strong>Acompanhamento por origem</strong> — todos os carros de cada cidade de origem. Use ➡️ para jogar num corredor. O carro <strong>não sai daqui</strong>: mostra o caminhão alocado e o status até ser entregue.</p>
      <div class="carteira-topo">
        <input type="text" id="carteiraBusca" class="ocup-busca" placeholder="🔍 Filtrar por cliente, cidade, placa..." oninput="_mmDeb('_renderCarteiraGrupos', _renderCarteiraGrupos)">
        <span id="carteiraTotal" class="text-muted"></span>
      </div>
      <div id="carteiraGrupos"></div>`;
  }
  _renderCarteiraGrupos();
}

function _renderCarteiraGrupos(){
  const alvo = document.getElementById('carteiraGrupos');
  if (!alvo) return;
  const busca = _norm(document.getElementById('carteiraBusca')?.value || '');
  // Acompanhamento: TODOS os carros ativos (não só os sem corredor), agrupados por origem
  let lista = (pedidosGlobais || []).filter(p =>
    !['Entregue','Cancelado'].includes(p.status || 'Pendente'));
  if (busca) lista = lista.filter(p =>
    _norm(`${p.cliente||''} ${p.cidadeOrigem||''} ${p.ufOrigem||''} ${p.cidadeDestino||''} ${p.ufDestino||''} ${p.placa||''} ${p.placaCegonha||''} #${p.id}`).includes(busca));

  const total = document.getElementById('carteiraTotal');
  if (total) total.textContent = `${lista.length} carro(s) em andamento`;

  const grupos = {};
  lista.forEach(p => { const k = `${p.cidadeOrigem || '—'}/${p.ufOrigem || ''}`; (grupos[k] = grupos[k] || []).push(p); });
  const chaves = Object.keys(grupos).sort((a,b) => grupos[b].length - grupos[a].length);

  if (chaves.length === 0){ alvo.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum carro em andamento. 👌</p>'; return; }

  _carteiraCache = grupos;
  _carteiraChaves = chaves;
  const podeJogar = ['logistica','admin','comercial'].includes(typeof perfilAtual!=='undefined'?perfilAtual:'');

  alvo.innerHTML = chaves.map((k, i) => {
    const itens = grupos[k];
    return `<div class="carteira-grupo">
      <div class="carteira-grupo-tit">📍 ${k} <span class="carteira-badge">${itens.length} carro(s)</span></div>
      <table class="corr-tabela">
        <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>${itens.map(p => {
          // Situação: mostra a cegonha quando alocado / transportando; ou o corredor direcionado
          let sit = statusDropdownHTML(p);
          if (p.placaCegonha){
            sit += ` <span class="corredor-tag-comrota" title="Cegonha alocada">🚛 ${p.placaCegonha}</span>`;
          } else if (p.rotaId || p.rota_id){
            sit += ` <span class="corredor-tag-comrota">alocado</span>`;
          } else {
            const cor = (typeof _corredorDoPedido === 'function') ? _corredorDoPedido(p) : null;
            if (cor){
              const manual = p.corredorManualId ? ' 📌' : '';
              sit += ` <span class="rd-corredor-tag" title="Direcionado para este corredor${p.corredorManualId ? ' (manual)' : ''}">➡️ ${cor.nome}${manual}</span>`;
            }
          }
          const jaAlocado = p.placaCegonha || p.rotaId || p.rota_id;
          return `<tr class="corr-tr">
          <td class="ct-id">#${p.id}</td>
          <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${typeof selCTEDoPedido==='function'?selCTEDoPedido(p.id):''}</td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
          <td class="ct-status">${sit}</td>
          <td class="ct-acoes">
            ${(podeJogar && !jaAlocado) ? `<button class="btn-kanban-patio" onclick="abrirJogarCorredor(${p.id})" title="Jogar num corredor">➡️</button>` : ''}
            ${podeJogar ? `<button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="${p.patioAtual ? 'No pátio de ' + p.patioAtual : 'Informar pátio'}">🅿️${p.patioAtual ? ' ' + p.patioAtual.split('/')[0] : ''}</button>` : ''}
            ${!podeJogar ? '<span class="text-muted">—</span>' : ''}
          </td>
        </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
}

// Verifica se um pedido já se encaixa em ALGUM corredor (automático ou manual)
function _pedidoEmAlgumCorredor(p){
  if (p.corredorManualId) return true;
  const seqs = (corredoresGlobais || []).map(c =>
    ((c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino]).filter(Boolean));
  const partida = p.patioAtual || p.cidadeOrigem;
  return seqs.some(seq => {
    const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
    const noPatio = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
    return (io !== -1 && id !== -1 && io < id) || (noPatio && id === -1);
  });
}

// Retorna o corredor (objeto) em que o pedido está: manual manda; senão o 1º que casa
function _corredorDoPedido(p){
  if (p.corredorManualId){
    return (corredoresGlobais||[]).find(c => String(c.id) === String(p.corredorManualId)) || null;
  }
  const partida = p.patioAtual || p.cidadeOrigem;
  return (corredoresGlobais||[]).find(c => {
    const seq = ((c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino]).filter(Boolean);
    const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
    const noPatio = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
    return (io !== -1 && id !== -1 && io < id) || (noPatio && id === -1);
  }) || null;
}

let _carteiraCache = {};
let _carteiraChaves = [];

function aplicarCarteiraRota(i){
  const chave = _carteiraChaves[i];
  const val = document.getElementById('carteiraSel_' + i)?.value || 'nova';
  if (val === 'nova') return criarRotaCarteira(chave);
  return adicionarCarteiraNaRota(chave, val);
}

// Vincula os carros do grupo a uma rota planejada JÁ EXISTENTE
async function adicionarCarteiraNaRota(chaveOrigem, rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('vincular à rota')) return;
  const itens = _carteiraCache[chaveOrigem];
  const rota = (rotasGlobais || []).find(r => String(r.id) === String(rotaId));
  if (!itens || !itens.length || !rota || !supabase) return;
  if (!confirm(`Adicionar os ${itens.length} carro(s) de ${chaveOrigem} à rota "${rota.nome || '#'+rota.id}"${rota.placa_cegonha ? ' (cegonha '+rota.placa_cegonha+')' : ''}?`)) return;
  try {
    const ids = itens.map(p => parseInt(p.id));
    const update = { rota_id: parseInt(rotaId), aguardando_transbordo: false };
    // se a rota já tem cegonha, os carros entram como intenção agendada nela
    if (rota.placa_cegonha){ update.placa_cegonha = rota.placa_cegonha; update.status = 'Intenção Agendada'; }
    const { error } = await supabase.from('pedidos').update(update).in('id', ids);
    if (error) throw error;
    for (const pid of ids){ await _registrarVinculoViagem(rotaId, pid); } // vínculo histórico
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    renderizarCarteiraDemanda();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ ${ids.length} carro(s) de ${chaveOrigem} adicionados à rota "${rota.nome || '#'+rota.id}".`, 'success');
  } catch(e){
    alert('Erro ao adicionar à rota: ' + (e.message || e));
  }
}

async function criarRotaCarteira(chaveOrigem){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const itens = _carteiraCache[chaveOrigem];
  if (!itens || itens.length === 0 || !supabase) return;
  if (!confirm(`Criar uma rota com os ${itens.length} carro(s) de ${chaveOrigem}?\n\nDepois é só definir a cegonha na Gestão Logística.`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  // paradas = origem + destinos distintos (na ordem em que aparecem)
  const paradas = [];
  const push = c => { if (c && !paradas.some(x => x.toLowerCase() === c.toLowerCase())) paradas.push(c); };
  push((itens[0].cidadeOrigem || '').trim());
  itens.forEach(p => push((p.cidadeDestino || '').trim()));
  try {
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: `${chaveOrigem} → demanda`,
      paradas, status: 'planejada', criado_por: usuario
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');
    const ids = itens.map(p => parseInt(p.id));
    const { error: e2 } = await supabase.from('pedidos').update({ rota_id: rotaId }).in('id', ids);
    if (e2) throw e2;
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    renderizarCarteiraDemanda();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota criada com ${ids.length} carro(s) de ${chaveOrigem}. Defina a cegonha na Gestão Logística.`, 'success');
  } catch(e){
    alert('Erro ao criar rota: ' + (e.message || e));
  }
}

// ============================================================
// Painel de Corredores — cada corredor com seus pedidos compatíveis
// (espelha a lógica da planilha: faixas por corredor)
// ============================================================
let _corredoresAbertos = new Set();

function renderizarPainelCorredores(){
  const cont = document.getElementById('painelViewCorredores');
  if (!cont) return;
  const corredores = (corredoresGlobais || []).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));

  if (corredores.length === 0){
    cont.innerHTML = '<p class="text-muted" style="padding:1rem 0">Nenhum corredor cadastrado ainda. Cadastre em <strong>Cadastros → Corredores</strong> (ex.: Curitiba → Imbaú → Apucarana → Maringá).</p>';
    return;
  }

  // pedidos "vivos" (não entregues/cancelados) sem cegonha ainda
  // No corredor só aparecem carros que ainda PRECISAM ser roteirizados.
  // Assim que entram numa carga (cegonha) ou rota, saem do corredor.
  const vivos = (pedidosGlobais || []).filter(p =>
    !['Entregue','Cancelado'].includes(p.status || 'Pendente')
    && !p.placaCegonha
    && !(p.rotaId || p.rota_id));

  const podeVerSugestoes = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  cont.innerHTML = `
    ${podeVerSugestoes ? '<div id="sugestoesRotaWrap" class="sugestoes-wrap"></div>' : ''}
    <div class="carteira-topo">
      <input type="text" id="corredorBusca" class="ocup-busca" placeholder="🔍 Filtrar por cidade, cliente, placa..." oninput="_mmDeb('renderizarPainelCorredores', renderizarPainelCorredores)" value="${(document.getElementById('corredorBusca')?.value||'').replace(/"/g,'&quot;')}">
      <span class="text-muted">${corredores.length} corredor(es)</span>
    </div>
    <div class="corredores-grid">
      ${corredores.map((c,ci) => _corredorCardHTML(c, vivos, ci)).join('')}
    </div>
    ${_carrosSemCorredorHTML(corredores, vivos)}`;
  if (podeVerSugestoes && typeof gerarSugestoesRota === 'function') gerarSugestoesRota();
  // inicializa os contadores de seleção de cada corredor aberto
  (corredores||[]).forEach(c => _atualizarContadorCorredor(String(c.id)));
}

// Diagnóstico: carros que não se encaixaram em NENHUM corredor (mostra o que o sistema lê)
function _carrosSemCorredorHTML(corredores, vivos){
  const seqs = corredores.map(c => ((c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino]).filter(Boolean));
  const encaixa = p => {
    const partida = p.patioAtual || p.cidadeOrigem;
    return seqs.some(seq => {
      const io = _posNaSeq(seq, partida), id = _posNaSeq(seq, p.cidadeDestino);
      const noPatioDoTronco = p.patioAtual && _posNaSeq(seq, p.patioAtual) !== -1;
      return (io !== -1 && id !== -1 && io < id) || (noPatioDoTronco && id === -1);
    });
  };
  // Órfão = não encaixa em nenhum corredor E não foi jogado manualmente em um (corredorManualId)
  // E não está já em cegonha/rota.
  const orfaos = (vivos || []).filter(p =>
    !encaixa(p) && !p.corredorManualId && !p.placaCegonha && !(p.rotaId||p.rota_id));
  if (orfaos.length === 0) return '';
  return `<div class="corredor-card" style="margin-top:14px">
    <div class="corredor-card-cab" onclick="toggleCorredorCard('__orfaos__')" style="cursor:pointer">
      <div><strong>🔍 Carros fora de qualquer corredor</strong> <span class="text-muted" style="margin-left:6px">(diagnóstico)</span></div>
      <div class="corredor-card-nums"><span class="corredor-semrota">${orfaos.length}</span><span class="corredor-chevron">${_corredoresAbertos.has('__orfaos__')?'▲':'▼'}</span></div>
    </div>
    ${_corredoresAbertos.has('__orfaos__') ? `<div class="corredor-pedidos">
      <p class="text-muted text-sm" style="padding:.3rem 0">O sistema tenta encaixar por <strong>pátio</strong> (se houver) ou <strong>origem</strong> → <strong>destino</strong>. Se a cidade não está nas paradas de nenhum corredor, o carro cai aqui. Confira a grafia ou use ➡️ para jogar num corredor.</p>
      <table class="corr-tabela">
        <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Cliente</th><th>Partida</th><th>Destino</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${orfaos.map(p => `<tr class="corr-tr">
          <td class="ct-id">#${p.id}</td>
          <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
          <td class="ct-modelo">${p.modelo||'—'}</td>
          <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
          <td>${p.patioAtual ? '🅿️ '+p.patioAtual.split('/')[0] : (p.cidadeOrigem||'—')}</td>
          <td class="ct-rota"><strong>${p.cidadeDestino||'—'}</strong></td>
          <td class="ct-status">${_statusPillPlanilha(p)}</td>
          <td class="ct-acoes">
            <button class="btn-kanban-patio" onclick="abrirJogarCorredor(${p.id})" title="Jogar num corredor">➡️</button>
            <button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="Informar pátio">🅿️</button>
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
  </div>`;
}

function _corredorCardHTML(c, vivos, ci){
  const seq = (c._paradas||[]).length >= 2 ? c._paradas.map(p=>p.cidade) : [c.origem, c.destino];
  const paradasStr = seq.filter(Boolean);
  const busca = _norm(document.getElementById('corredorBusca')?.value || '');

  // pedidos compatíveis: parte do PÁTIO ATUAL (se houver) ou da origem do pedido;
  // entra se partida→destino couber no corredor (ordem certa) ou for encaixe no caminho.
  let compat = vivos.filter(p => {
    // Corredor manual MANDA e é EXCLUSIVO: se o pedido foi jogado num corredor,
    // ele só aparece nele — some do encaixe automático de qualquer outro.
    if (p.corredorManualId) return String(p.corredorManualId) === String(c.id);
    const partida = p.patioAtual || p.cidadeOrigem; // pátio manda quando existe
    const io = _posNaSeq(paradasStr, partida);
    const id = _posNaSeq(paradasStr, p.cidadeDestino);
    const noPatioDoTronco = p.patioAtual && _posNaSeq(paradasStr, p.patioAtual) !== -1;
    return (io !== -1 && id !== -1 && io < id)   // partida e destino no trajeto, na ordem
        || (noPatioDoTronco && id === -1);       // no pátio do tronco, destino é ramal (transborda no hub)
  });
  if (busca) compat = compat.filter(p =>
    _norm(`${p.cliente||''} ${p.cidadeOrigem||''} ${p.cidadeDestino||''} ${p.placa||''} #${p.id}`).includes(busca));

  const semRota = compat.filter(p => !(p.rotaId || p.rota_id) && !p.placaCegonha).length;
  _corredorCache[String(c.id)] = { nome: c.nome, seq: paradasStr, itens: compat };
  const podeCriar = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  const aberto = _corredoresAbertos.has(String(c.id));
  const paradasHTML = paradasStr.map((cid,i) =>
    `<span class="corredor-parada">${i+1}. ${cid}</span>`).join('<span class="rota-seta">→</span>');

  return `<div class="corredor-card">
    <div class="corredor-card-cab">
      <div onclick="toggleCorredorCard('${c.id}')" style="cursor:pointer;flex:1">
        <strong>🛣️ ${c.nome}</strong>
        <span class="text-muted" style="margin-left:8px">SLA ${c.sla_horas || '?'}h</span>
      </div>
      <div class="corredor-card-nums">
        <span class="carteira-badge">${compat.length} carro(s)</span>
        ${semRota > 0 ? `<span class="corredor-semrota">${semRota} sem rota</span>` : ''}
        <span class="corredor-chevron" onclick="toggleCorredorCard('${c.id}')" style="cursor:pointer">${aberto ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="corredor-paradas-linha">${paradasHTML}</div>
    ${aberto ? `<div class="corredor-pedidos">
      ${compat.length === 0 ? '<p class="text-muted text-sm" style="padding:.5rem 0">Nenhum pedido compatível no momento.</p>'
        : (function(){
            // ponto de divisão (hub) — padrão: destino mais comum; senão última parada
            const divKey = _corredorDivisao[String(c.id)] || _divisaoPadrao(compat, paradasStr);
            const divPos = _posNaSeq(paradasStr, divKey);
            const selDiv = `<div class="corredor-div-sel">🔀 Ponto de divisão (hub):
              <select onchange="_setDivisao('${c.id}', this.value)">
                ${paradasStr.map(cid => `<option value="${cid.replace(/"/g,'&quot;')}" ${_norm(cid)===_norm(divKey)?'selected':''}>${cid}</option>`).join('')}
              </select>
              <span class="text-muted" style="font-size:.76rem">— até aqui vão juntos; depois transbordam</span></div>`;

            const grupos = {};
            compat.forEach(p => { const d = p.cidadeDestino || '—'; (grupos[d] = grupos[d] || []).push(p); });
            const chaves = Object.keys(grupos).sort((a,b) => {
              const pa = _posNaSeq(paradasStr, a), pb = _posNaSeq(paradasStr, b);
              return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
            });
            const blocos = chaves.map(d => {
              const itens = grupos[d];
              const pos = _posNaSeq(paradasStr, d);
              let label, cls;
              if (pos === -1) { label = `🔀 Transbordam em ${divKey} → ${d} (ramal)`; cls = 'drop-transb'; }
              else if (pos > divPos) { label = `🔀 Transbordam em ${divKey} → ${d}`; cls = 'drop-transb'; }
              else { label = `📍 Descem em ${d}`; cls = 'drop-desce'; }
              return `<div class="corredor-drop ${cls}">
                <div class="corredor-drop-tit">${label} <span class="carteira-badge">${itens.length} carro(s)</span></div>
                <table class="corr-tabela">
                  <thead><tr>
                    <th></th><th>ID</th><th>Solicitado</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Ações</th>
                  </tr></thead>
                  <tbody>${[...itens].sort((a,b)=>(a.dataSolicitacao||'').localeCompare(b.dataSolicitacao||'')).map(p => _corredorPedidoLinha(p, c, paradasStr)).join('')}</tbody>
                </table>
              </div>`;
            }).join('');
            return selDiv + blocos;
          })()}
      ${(podeCriar && compat.length > 0) ? `
      <div class="corredor-selbar">
        <span id="corrCont_${c.id}" class="corredor-cont"></span>
        <span class="corredor-selbtns">
          <button class="btn btn-sm btn-secondary" onclick="_selecTodosCorredor('${c.id}', true)">Todos</button>
          <button class="btn btn-sm btn-secondary" onclick="_selecTodosCorredor('${c.id}', false)">Limpar</button>
          <button class="btn btn-sm btn-primary" onclick="criarRotaDoCorredorSelec('${c.id}')">🛣️ Criar rota com selecionados</button>
        </span>
      </div>` : ''}
    </div>` : ''}
  </div>`;
}

function _corredorPedidoLinha(p, c, paradasStr){
  const semR = !(p.rotaId || p.rota_id) && !p.placaCegonha;
  const ehManual = String(p.corredorManualId || '') === String(c.id);
  const podeAgir = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar());
  const rotaTag = semR
    ? '<span class="corredor-tag-semrota">sem rota</span>'
    : `<span class="corredor-tag-comrota">🚛 ${p.placaCegonha||'em rota'}</span>`;
  const frete = Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
  return `<tr class="corr-tr">
    <td>${podeAgir ? `<input type="checkbox" class="corr-check" data-corr="${c.id}" value="${p.id}" ${semR ? 'checked' : ''} onchange="_atualizarContadorCorredor('${c.id}')">` : ''}</td>
    <td class="ct-id">#${p.id}</td>
    <td class="ct-data">${_fmtDataSolic(p.dataSolicitacao)}</td>
    <td class="ct-placa"><strong>${p.placa||'—'}</strong> ${typeof selCTEDoPedido==='function' ? selCTEDoPedido(p.id) : ''}</td>
    <td class="ct-modelo">${p.modelo||'—'}</td>
    <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
    <td class="ct-cli" title="${(p.cliente||'').replace(/"/g,'&quot;')}"><strong>${p.cliente||'—'}</strong></td>
    <td class="ct-frete">R$ ${frete}</td>
    <td class="ct-status">${statusDropdownHTML(p)} ${rotaTag}</td>
    <td class="ct-acoes">
      ${podeAgir ? `
      ${ehManual
        ? `<button class="btn-kanban-patio" onclick="tirarDoCorredorManual(${p.id})" title="Tirar deste corredor">✕</button>`
        : `<button class="btn-kanban-patio" onclick="abrirJogarCorredor(${p.id})" title="Jogar em outro corredor">➡️</button>`}
      <button class="btn-kanban-patio" onclick="abrirModalPatio(${p.id})" title="${p.patioAtual ? 'No pátio de ' + p.patioAtual : 'Informar pátio'}">🅿️</button>` : ''}
      ${(!podeAvancarPedido(p) && !podeAgir) ? '<span class="text-muted">—</span>' : ''}
    </td>
  </tr>`;
}

function toggleCorredorCard(id){
  const k = String(id);
  if (_corredoresAbertos.has(k)) _corredoresAbertos.delete(k);
  else _corredoresAbertos.add(k);
  renderizarPainelCorredores();
}

// Cria a rota de um corredor já com os carros sem rota compatíveis
let _corredorCache = {};
async function criarRotaDoCorredor(corredorId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const dados = _corredorCache[String(corredorId)];
  if (!dados || !dados.itens || dados.itens.length === 0 || !supabase) return;
  if (!confirm(`Criar a rota "${dados.nome}" e alocar ${dados.itens.length} carro(s) sem rota deste corredor?`)) return;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    const { data: nova, error: e1 } = await supabase.from('rotas_planejadas').insert({
      nome: dados.nome,
      corredor_id: parseInt(corredorId) || null,
      paradas: dados.seq || [],
      status: 'planejada',
      criado_por: usuario
    }).select();
    if (e1) throw e1;
    const rotaId = nova && nova[0] && nova[0].id;
    if (!rotaId) throw new Error('Falha ao criar a rota.');
    const ids = dados.itens.map(p => parseInt(p.id));
    const { error: e2 } = await supabase.from('pedidos').update({ rota_id: rotaId }).in('id', ids);
    if (e2) throw e2;
    await recarregarPedidos();
    if (typeof renderizarRotas === 'function') renderizarRotas();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica',
      `✅ Rota "${dados.nome}" criada com ${ids.length} carro(s). Defina a cegonha na Gestão Logística.`, 'success');
  } catch(e){
    alert('Erro ao criar rota: ' + (e.message || e));
  }
}

// ============================================================
// Jogar/tirar um pedido manualmente de um corredor
// ============================================================
function abrirJogarCorredor(pedidoId){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['logistica','admin','comercial'].includes(perfil)){ alert('Você não tem permissão para mover para um corredor.'); return; }
  const corredores = (corredoresGlobais || []).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  if (corredores.length === 0){ alert('Nenhum corredor cadastrado.'); return; }
  const opcoes = corredores.map((c,i) => `${i+1}. ${c.nome}`).join('\n');
  const escolha = prompt(`Jogar o pedido #${pedidoId} em qual corredor?\n\n${opcoes}\n\nDigite o número:`);
  if (!escolha) return;
  const idx = parseInt(escolha) - 1;
  const cor = corredores[idx];
  if (!cor){ alert('Opção inválida.'); return; }
  _setCorredorManual(pedidoId, cor.id);
}
function tirarDoCorredorManual(pedidoId){
  _setCorredorManual(pedidoId, null);
}
async function _setCorredorManual(pedidoId, corredorId){
  try {
    const { error } = await supabase.from('pedidos').update({ corredor_manual_id: corredorId }).eq('id', parseInt(pedidoId));
    if (error) throw error;
    const p = (pedidosGlobais||[]).find(x => String(x.id) === String(pedidoId));
    if (p) p.corredorManualId = corredorId;
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
    if (typeof renderizarCarteiraDemanda === 'function') renderizarCarteiraDemanda();
  } catch(e){ alert('Erro ao mover para o corredor: ' + (e.message||e)); }
}

// ============================================================
// Ponto de divisão (hub) do corredor — didático tronco+ramificações
// ============================================================
let _corredorDivisao = {}; // corredorId -> cidade do hub (escolha em memória)
function _setDivisao(corredorId, cidade){
  _corredorDivisao[String(corredorId)] = cidade;
  if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();
}
// padrão do hub: o destino mais comum entre os carros; senão a última parada
function _divisaoPadrao(compat, paradasStr){
  const cont = {};
  (compat||[]).forEach(p => { const d = p.cidadeDestino; if (d && _posNaSeq(paradasStr, d) !== -1) cont[d] = (cont[d]||0)+1; });
  let melhor = null, max = 0;
  Object.entries(cont).forEach(([d,n]) => { if (n > max){ max = n; melhor = d; } });
  return melhor || paradasStr[paradasStr.length-1] || '';
}

// ============================================================
// Seleção de carros no corredor + criar rota com os selecionados
// ============================================================
function _checksCorredor(corredorId){
  return Array.from(document.querySelectorAll(`.corr-check[data-corr="${corredorId}"]`));
}
function _atualizarContadorCorredor(corredorId){
  const cont = document.getElementById('corrCont_' + corredorId);
  if (!cont) return;
  const marcados = _checksCorredor(corredorId).filter(c => c.checked).length;
  const cap = 11; // referência da cegonha (guincho pode ser menos) — só aviso
  const excede = marcados > cap;
  cont.innerHTML = `<strong class="${excede ? 'cont-excede' : ''}">${marcados}</strong> carro(s) selecionado(s)` +
    (excede ? ` <span class="cont-excede">⚠️ acima de ${cap} (capacidade da cegonha) — pode criar mesmo assim</span>` : '');
}
function _selecTodosCorredor(corredorId, valor){
  _checksCorredor(corredorId).forEach(c => { c.checked = valor; });
  _atualizarContadorCorredor(corredorId);
}
async function criarRotaDoCorredorSelec(corredorId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('criar rota')) return;
  const dados = _corredorCache[String(corredorId)];
  if (!dados || !supabase) return;
  const ids = _checksCorredor(corredorId).filter(c => c.checked).map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um carro.'); return; }
  _corridorRotaCtx = { corredorId, ids, nome: dados.nome, seq: dados.seq || [] };
  _abrirModalCegonhaRotaCorr(dados.nome, ids.length);
}

// Modal reutilizável de escolha de cegonha/motorista ao criar rota do corredor
function _abrirModalCegonhaRotaCorr(nome, qtd){
  const cegonhas = (veiculosGlobais||[]).filter(v => v.ativo !== false && v.placa);
  const old = document.getElementById('modalCriarRotaCorr'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalCriarRotaCorr';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const aviso = qtd > 11 ? `<p class="cont-excede" style="margin:.3rem 0">⚠️ ${qtd} carros (acima de 11). Se for guincho/carga maior, tudo bem.</p>` : '';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:92%;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">🛣️ Criar rota — ${nome}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${qtd} carro(s). Escolha a cegonha — o motorista padrão dela já vem junto (pode trocar). <strong>Ou deixe em branco</strong> para criar a rota como <strong>"A definir"</strong> e escolher o caminhão depois.</p>
      ${aviso}
      <div class="form-group">
        <label>Cegonha / Guincho</label>
        <select id="rotaCorrCegonha" onchange="_rotaCorrPreencheMotorista()">
          <option value="">— sem cegonha por enquanto —</option>
          ${cegonhas.map(v => `<option value="${v.placa}" data-mot="${(v.motorista_padrao||'').replace(/"/g,'&quot;')}">${v.placa}${v.modelo?' · '+v.modelo:''}${v.motorista_padrao?' · 👤 '+v.motorista_padrao:''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Motorista</label>
        <input type="text" id="rotaCorrMotorista" placeholder="Motorista da viagem" list="listaMotoristasRotaCorr">
        <datalist id="listaMotoristasRotaCorr">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" onclick="_confirmarCriarRotaCorr()">✅ Criar rota</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalCriarRotaCorr').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function _rotaCorrPreencheMotorista(){
  const sel = document.getElementById('rotaCorrCegonha');
  const opt = sel?.options[sel.selectedIndex];
  const mot = opt?.getAttribute('data-mot') || '';
  const inp = document.getElementById('rotaCorrMotorista');
  if (inp) inp.value = mot;  // motorista padrão da cegonha
}

