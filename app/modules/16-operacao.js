/* ==========================================================================
   MODULE: 16-operacao.js
   Equipes, cobrança, central
   Linhas originais: 11759-13778
   ========================================================================== */

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
    const alvo = `${c.nome||''} ${c.nome_fantasia||''} ${c.cidade||''} ${c.cnpj||''} ${c.cpf||''} ${c.bairro||''}`.toLowerCase();
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
