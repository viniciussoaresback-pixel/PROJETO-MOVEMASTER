/* ============================================================================
   MOVEMASTER — mod-10.js  (62 funções)
   Carregado em ordem numérica pelo index.html. NÃO reordenar.
   Funções: _confSalvarFrete, _confMarcarConferida, _confDesmarcarConferida, renderizarHistoricoCargas, _histSelViagem, _histVerMais, _histViagensFiltradas, _histAbrirRelatorio, ...
   ============================================================================ */
async function _confSalvarFrete(viagemId){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  if ((window._fechamentosPeriodo||{})[chavePeriodo]){ alert('🔒 Este período está fechado. Reabra o fechamento para editar a conferência.'); return; }
  const r = (rotasGlobais||[]).find(x=>String(x.id)===String(viagemId));
  if (!r) return;
  const v = _histDadosViagem(r);
  const justificativa = document.getElementById('confJustificativa')?.value.trim() || null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  try {
    await Promise.all(v.pedidos.map(p => {
      const esperado = _confValoresEsperados[p.id];
      if (esperado == null) return Promise.resolve();
      const pg = (pedidosGlobais||[]).find(x=>String(x.id)===String(p.id));
      if (pg){ pg.freteEsperado = esperado; }
      return supabase.from('pedidos').update({
        frete_esperado: esperado,
        frete_conferido_em: new Date().toISOString(),
        frete_conferido_por: usuario,
        frete_justificativa: justificativa
      }).eq('id', p.id);
    }));
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Valores conferidos salvos!');
    _confRenderPainel();
  } catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
}

async function _confMarcarConferida(viagemId){
  const chavePeriodo = `${_confFiltros.de}|${_confFiltros.ate}`;
  if ((window._fechamentosPeriodo||{})[chavePeriodo]){ alert('🔒 Este período está fechado. Reabra o fechamento para alterar a conferência.'); return; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  try {
    await supabase.from('rotas_planejadas').update({ conferida_em: new Date().toISOString(), conferida_por: usuario }).eq('id', viagemId);
    const r = (rotasGlobais||[]).find(x=>String(x.id)===String(viagemId));
    if (r){ r.conferida_em = new Date().toISOString(); r.conferida_por = usuario; }
    if (typeof _rmToastConfirmacao==='function') _rmToastConfirmacao('✅ Viagem marcada como conferida!');
    _confRenderPainel();
    renderizarCentralConferencia();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

async function _confDesmarcarConferida(viagemId){
  if (!confirm('Reabrir a conferência desta viagem?')) return;
  try {
    await supabase.from('rotas_planejadas').update({ conferida_em: null, conferida_por: null }).eq('id', viagemId);
    const r = (rotasGlobais||[]).find(x=>String(x.id)===String(viagemId));
    if (r){ r.conferida_em = null; r.conferida_por = null; }
    _confRenderPainel();
    renderizarCentralConferencia();
  } catch(e){ alert('Erro: '+(e.message||e)); }
}

function renderizarHistoricoCargas(containerId){
  const lista = document.getElementById('histvLista');
  if (!lista) return;

  const fBusca = _norm(document.getElementById('histBusca')?.value || '');
  const fMot = _norm(document.getElementById('histMotorista')?.value || '');
  const fCeg = _norm(document.getElementById('histCegonha')?.value || '');
  const fDest = _norm(document.getElementById('histDestino')?.value || '');
  const fOrig = _norm(document.getElementById('histOrigem')?.value || '');
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';

  // Histórico mostra viagens concluídas E em andamento (registro do que aconteceu)
  let rotas = (rotasGlobais||[]).filter(r => ['concluida','em_andamento','planejada'].includes(r.status));

  let viagens = rotas.map(_histDadosViagem);

  // filtros
  if (fMot) viagens = viagens.filter(v => _norm(v.motorista).includes(fMot));
  if (fCeg) viagens = viagens.filter(v => _norm(v.cegonha).includes(fCeg));
  if (fDest) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeDestino||'').includes(fDest)));
  if (fOrig) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeOrigem||'').includes(fOrig)));
  if (fDe) viagens = viagens.filter(v => v.data && v.data >= fDe);
  if (fAte) viagens = viagens.filter(v => v.data && v.data <= fAte);
  if (fBusca) viagens = viagens.filter(v =>
    _norm('#'+v.id).includes(fBusca) || _norm(v.motorista).includes(fBusca) ||
    _norm(v.cegonha).includes(fBusca) || v.pedidos.some(p => _norm(p.placa||'').includes(fBusca)));

  // ordena por data desc
  viagens.sort((a,b) => String(b.data||'').localeCompare(String(a.data||'')));

  if (viagens.length === 0){
    lista.innerHTML = '<p class="text-muted" style="padding:1rem">Nenhuma viagem no filtro.</p>';
    const det = document.getElementById('histvDetalhe'); if (det) det.innerHTML = '';
    return;
  }

  // seleção padrão: primeira viagem
  if (!_histViagemSel || !viagens.some(v => String(v.id)===String(_histViagemSel))){
    _histViagemSel = viagens[0].id;
  }

  const mostradas = viagens.slice(0, _histLimite);
  lista.innerHTML = `
    <div class="histv-lista-cab">VIAGENS (${viagens.length})</div>
    ${mostradas.map(v => {
      const st = _histStatusInfo(v.status);
      const sel = String(v.id)===String(_histViagemSel);
      const rotaTxt = v.paradas.length ? `${v.paradas[0]} → ${v.paradas[v.paradas.length-1]}` :
        (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));
      return `<div class="histv-card ${sel?'sel':''}" onclick="_histSelViagem(${v.id})">
        <div class="histv-card-top">
          <span class="histv-card-id">#${v.id}</span>
          <span class="histv-badge ${st.cls}">${st.label}</span>
        </div>
        <div class="histv-card-lin">🚛 <strong>${v.cegonha}</strong> <span class="text-muted">· 📅 ${v.data ? new Date(v.data+(v.data.length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}</span></div>
        <div class="histv-card-rota">${rotaTxt}</div>
        <div class="histv-card-mot">Motorista: ${v.motorista}</div>
        <div class="histv-card-rod">
          <span class="text-muted">${v.pedidos.length} veículo(s)</span>
          <span class="histv-card-total">R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
        </div>
      </div>`;
    }).join('')}
    ${viagens.length > _histLimite ? `<button class="histv-vermais" onclick="_histVerMais()">Ver mais viagens</button>` : ''}`;

  _histRenderDetalhe();
}

function _histSelViagem(id){ _histViagemSel = id; renderizarHistoricoCargas(); }
function _histVerMais(){ _histLimite += 8; renderizarHistoricoCargas(); }

// Coleta as viagens conforme os filtros atuais (reutiliza a mesma lógica da lista)
function _histViagensFiltradas(){
  const fBusca = _norm(document.getElementById('histBusca')?.value || '');
  const fMot = _norm(document.getElementById('histMotorista')?.value || '');
  const fCeg = _norm(document.getElementById('histCegonha')?.value || '');
  const fDest = _norm(document.getElementById('histDestino')?.value || '');
  const fOrig = _norm(document.getElementById('histOrigem')?.value || '');
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';

  let rotas = (rotasGlobais||[]).filter(r => ['concluida','em_andamento','planejada'].includes(r.status));
  let viagens = rotas.map(_histDadosViagem);
  if (fMot) viagens = viagens.filter(v => _norm(v.motorista).includes(fMot));
  if (fCeg) viagens = viagens.filter(v => _norm(v.cegonha).includes(fCeg));
  if (fDest) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeDestino||'').includes(fDest)));
  if (fOrig) viagens = viagens.filter(v => v.pedidos.some(p => _norm(p.cidadeOrigem||'').includes(fOrig)));
  if (fDe) viagens = viagens.filter(v => v.data && v.data >= fDe);
  if (fAte) viagens = viagens.filter(v => v.data && v.data <= fAte);
  if (fBusca) viagens = viagens.filter(v =>
    _norm('#'+v.id).includes(fBusca) || _norm(v.motorista).includes(fBusca) ||
    _norm(v.cegonha).includes(fBusca) || v.pedidos.some(p => _norm(p.placa||'').includes(fBusca)));
  viagens.sort((a,b) => String(b.data||'').localeCompare(String(a.data||'')));
  return viagens;
}

// RELATÓRIO CONSOLIDADO — visão gerencial de todas as viagens do período
function _histAbrirRelatorio(){
  const viagens = _histViagensFiltradas();
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';
  const periodo = (fDe || fAte) ? `${fDe?new Date(fDe+'T12:00').toLocaleDateString('pt-BR'):'início'} a ${fAte?new Date(fAte+'T12:00').toLocaleDateString('pt-BR'):'hoje'}` : 'Todas as viagens';

  // totais
  const totViagens = viagens.length;
  const totVeiculos = viagens.reduce((s,v)=>s+v.pedidos.length,0);
  const totFat = viagens.reduce((s,v)=>s+v.total,0);
  const totMot = viagens.reduce((s,v)=>s+v.totalMotorista,0);
  const totCteOk = viagens.reduce((s,v)=>s+v.comCte,0);
  const totPend = totVeiculos - totCteOk;

  const old = document.getElementById('histRelatOverlay'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'histRelatOverlay';
  div.className = 'histrelat-overlay';
  div.innerHTML = `
    <div class="histrelat-bg" onclick="document.getElementById('histRelatOverlay').remove()"></div>
    <div class="histrelat-painel">
      <div class="histrelat-head">
        <div>
          <h2>📊 Relatório Consolidado</h2>
          <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 0">${periodo}</p>
        </div>
        <div class="histrelat-head-acoes">
          <button class="btn btn-secondary btn-sm" onclick="_histExportarRelatorioCSV()">⬇️ Excel/CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="_histExportarRelatorioPDF()">📄 PDF</button>
          <button class="histrelat-x" onclick="document.getElementById('histRelatOverlay').remove()">✕</button>
        </div>
      </div>

      <div class="histrelat-totais">
        <div class="histrelat-tz"><strong>${totViagens}</strong><span>Viagens</span></div>
        <div class="histrelat-tz"><strong>${totVeiculos}</strong><span>Veículos</span></div>
        <div class="histrelat-tz"><strong class="v-verde">R$ ${totFat.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>Faturamento</span></div>
        <div class="histrelat-tz"><strong class="v-laranja">R$ ${totMot.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>Motoristas</span></div>
        <div class="histrelat-tz"><strong class="v-azul">R$ ${(totFat-totMot).toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>Resultado</span></div>
        <div class="histrelat-tz"><strong class="${totPend?'v-laranja':'v-verde'}">${totCteOk}/${totVeiculos}</strong><span>CTes conferidos</span></div>
      </div>

      <div class="histrelat-tabwrap">
        <table class="histrelat-tab">
          <thead><tr><th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Veíc.</th><th>Faturamento</th><th>Motorista</th><th>CTe</th></tr></thead>
          <tbody>
            ${viagens.length===0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#9ca3af">Nenhuma viagem no período.</td></tr>' :
              viagens.map(v => {
                const rotaTxt = v.paradas.length ? `${v.paradas[0]} → ${v.paradas[v.paradas.length-1]}` :
                  (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));
                const cteOk = v.comCte === v.pedidos.length && v.pedidos.length>0;
                return `<tr>
                  <td><strong>#${v.id}</strong></td>
                  <td>${v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>${v.motorista}</td>
                  <td>${v.cegonha}</td>
                  <td>${rotaTxt}</td>
                  <td style="text-align:center">${v.pedidos.length}</td>
                  <td>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  <td>R$ ${v.totalMotorista.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  <td>${cteOk?'<span class="histv-ok">✅ '+v.comCte+'/'+v.pedidos.length+'</span>':'<span style="color:#f59e0b">⚠️ '+v.comCte+'/'+v.pedidos.length+'</span>'}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Exporta o relatório para CSV (abre no Excel)
function _histExportarRelatorioCSV(){
  const viagens = _histViagensFiltradas();
  const linhas = [['Viagem','Data','Motorista','Cegonha','Rota','Veiculos','Faturamento','Motorista','CTe_conferidos','CTe_total']];
  viagens.forEach(v => {
    const rotaTxt = v.paradas.length ? `${v.paradas[0]} > ${v.paradas[v.paradas.length-1]}` :
      (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} > ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'-'));
    linhas.push([
      '#'+v.id,
      v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '-',
      v.motorista, v.cegonha, rotaTxt, v.pedidos.length,
      v.total.toFixed(2).replace('.',','), v.totalMotorista.toFixed(2).replace('.',','),
      v.comCte, v.pedidos.length
    ]);
  });
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `relatorio_viagens_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Exporta o relatório em PDF no estilo do sistema (usa o template _abrirPDF)
function _histExportarRelatorioPDF(){
  const viagens = _histViagensFiltradas();
  const fDe = document.getElementById('histDataDe')?.value || '';
  const fAte = document.getElementById('histDataAte')?.value || '';
  const periodo = (fDe || fAte)
    ? `${fDe?new Date(fDe+'T12:00').toLocaleDateString('pt-BR'):'início'} a ${fAte?new Date(fAte+'T12:00').toLocaleDateString('pt-BR'):'hoje'}`
    : 'Todas as viagens';

  const totViagens = viagens.length;
  const totVeiculos = viagens.reduce((s,v)=>s+v.pedidos.length,0);
  const totFat = viagens.reduce((s,v)=>s+v.total,0);
  const totMot = viagens.reduce((s,v)=>s+v.totalMotorista,0);
  const totCteOk = viagens.reduce((s,v)=>s+v.comCte,0);

  const linhas = viagens.map(v => {
    const rotaTxt = v.paradas.length ? `${v.paradas[0]} → ${v.paradas[v.paradas.length-1]}` :
      (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));
    const cteOk = v.comCte === v.pedidos.length && v.pedidos.length>0;
    return `<tr>
      <td><strong>#${v.id}</strong></td>
      <td>${v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${v.motorista}</td>
      <td>${v.cegonha}</td>
      <td>${rotaTxt}</td>
      <td style="text-align:center">${v.pedidos.length}</td>
      <td>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td>R$ ${v.totalMotorista.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td style="text-align:center">${cteOk?'✅':'⚠️'} ${v.comCte}/${v.pedidos.length}</td>
    </tr>`;
  }).join('');

  const corpo = `
    <div class="filtros">
      <span><strong>Período:</strong> ${periodo}</span>
    </div>
    <div class="rescards">
      <div class="rescard"><div class="restopo"><span>Viagens</span><span>${totViagens}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Veículos</span><span>${totVeiculos}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Faturamento</span><span>R$ ${totFat.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Motoristas</span><span>R$ ${totMot.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="rescard"><div class="restopo"><span>Resultado</span><span>R$ ${(totFat-totMot).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span></div></div>
      <div class="rescard"><div class="restopo"><span>CTes conferidos</span><span>${totCteOk}/${totVeiculos}</span></div></div>
    </div>
    <h3>Viagens do período</h3>
    <table>
      <thead><tr><th>Viagem</th><th>Data</th><th>Motorista</th><th>Cegonha</th><th>Rota</th><th>Veíc.</th><th>Faturamento</th><th>Motorista</th><th>CTe</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="9" style="text-align:center">Nenhuma viagem no período.</td></tr>'}</tbody>
    </table>
    <div class="totalgeral">Total faturado: R$ ${totFat.toLocaleString('pt-BR',{minimumFractionDigits:2})} · Resultado: R$ ${(totFat-totMot).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`;

  if (typeof _abrirPDF === 'function') _abrirPDF('Relatório de Viagens', corpo);
}

// Aba selecionada no detalhe
let _histAbaSel = 'carga';
function _histSelAba(aba){ _histAbaSel = aba; _histRenderDetalhe(); }

function _histRenderDetalhe(){
  const det = document.getElementById('histvDetalhe');
  if (!det) return;
  const r = (rotasGlobais||[]).find(x => String(x.id)===String(_histViagemSel));
  if (!r){ det.innerHTML = ''; return; }
  const v = _histDadosViagem(r);
  const st = _histStatusInfo(v.status);
  const saida = r.iniciada_em ? new Date(r.iniciada_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
  const chegada = r.concluida_em ? new Date(r.concluida_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
  const rotaTxt = v.paradas.length ? v.paradas.join(' → ') :
    (v.pedidos[0] ? `${v.pedidos[0].cidadeOrigem||''} → ${v.pedidos[0].cidadeDestino||''}` : (v.nome||'—'));

  det.innerHTML = `
    <div class="histv-det-cab">
      <div class="histv-det-vnum">
        <div class="histv-det-hash">VIAGEM</div>
        <div class="histv-det-num">#${v.id}</div>
        <span class="histv-badge ${st.cls}">${st.label}</span>
        ${r.criada_por_usuario ? `<div style="margin-top:6px;font-size:.72rem;color:#9ca3af">🧑‍💼 Criada por <strong style="color:inherit">${r.criada_por_usuario}</strong>${r.criado_por?` (${r.criado_por})`:''}</div>` : (r.criado_por ? `<div style="margin-top:6px;font-size:.72rem;color:#9ca3af">🧑‍💼 Criada por ${r.criado_por}</div>` : '')}
        ${r.conferida_em ? `<div style="margin-top:6px;font-size:.72rem;color:#22c55e;font-weight:700">✅ Conferida${r.conferida_por?` por ${r.conferida_por}`:''}<br><span style="font-weight:400;color:#9ca3af">${new Date(r.conferida_em).toLocaleString('pt-BR')}</span></div>` : ''}
      </div>
      <div class="histv-det-info">
        <div class="histv-di"><span class="histv-di-lbl">👤 MOTORISTA</span><span class="histv-di-val">${v.motorista}</span></div>
        <div class="histv-di"><span class="histv-di-lbl">🚛 CEGONHA</span><span class="histv-di-val">${v.cegonha}${v.modelo?`<br><span class="text-muted" style="font-size:.75rem">Modelo: ${v.modelo}</span>`:''}</span></div>
        <div class="histv-di"><span class="histv-di-lbl">📅 DATA</span><span class="histv-di-val">${v.data ? new Date(v.data+(String(v.data).length<=10?'T12:00':'')).toLocaleDateString('pt-BR') : '—'}<br><span class="text-muted" style="font-size:.75rem">Saída: ${saida} · Chegada: ${chegada}</span></span></div>
        <div class="histv-di"><span class="histv-di-lbl">📍 ROTA</span><span class="histv-di-val">${rotaTxt}</span></div>
      </div>
      <div class="histv-resumo">
        <div class="histv-resumo-tit">RESUMO DA VIAGEM</div>
        <div class="histv-resumo-grid">
          <div class="histv-rz"><strong>${v.pedidos.length}</strong><span>VEÍCULOS</span></div>
          <div class="histv-rz histv-rz-fat"><strong>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>FATURAMENTO</span></div>
          <div class="histv-rz histv-rz-mot"><strong>R$ ${v.totalMotorista.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>MOTORISTA</span></div>
          <div class="histv-rz histv-rz-res"><strong>R$ ${v.resultado.toLocaleString('pt-BR',{minimumFractionDigits:0})}</strong><span>RESULTADO</span></div>
        </div>
      </div>
    </div>

    <div class="histv-abas">
      <button class="histv-aba ${_histAbaSel==='carga'?'sel':''}" onclick="_histSelAba('carga')">CARGA DA VIAGEM</button>
      <button class="histv-aba ${_histAbaSel==='timeline'?'sel':''}" onclick="_histSelAba('timeline')">LINHA DO TEMPO</button>
      <button class="histv-aba ${_histAbaSel==='conferencia'?'sel':''}" onclick="_histSelAba('conferencia')">CONFERÊNCIA E DOCUMENTOS</button>
      <button class="histv-aba ${_histAbaSel==='financeiro'?'sel':''}" onclick="_histSelAba('financeiro')">FINANCEIRO</button>
    </div>

    <div class="histv-aba-conteudo">${_histAbaConteudo(v)}</div>

    <div class="histv-rodape-info">ℹ️ Esta viagem está registrada no histórico. Transbordos, ocorrências e alterações ficam registrados na linha do tempo.</div>`;
}

// Conteúdo de cada aba
function _histAbaConteudo(v){
  if (_histAbaSel === 'carga') return _histAbaCarga(v);
  if (_histAbaSel === 'timeline') return _histAbaTimeline(v);
  if (_histAbaSel === 'conferencia') return _histAbaConferencia(v);
  if (_histAbaSel === 'financeiro') return _histAbaFinanceiro(v);
  return `<p class="text-muted" style="padding:2rem;text-align:center">Esta aba será construída na próxima etapa.</p>`;
}

// ABA FINANCEIRO — Status + Resumo financeiro + Detalhamento da remuneração
function _histAbaFinanceiro(v){
  const st = _histStatusInfo(v.status);
  const chegada = v.rota.concluida_em ? new Date(v.rota.concluida_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : null;

  // Remuneração: soma dos valores por pedido (com origem)
  let temPendente = false;
  const detPed = v.pedidos.map(p => {
    const vm = (typeof valorMotoristaPedido==='function') ? valorMotoristaPedido(p) : {valor:null,origem:'pendente'};
    if (vm.valor == null) temPendente = true;
    return { p, vm };
  });
  const valorBase = detPed.reduce((s,d)=> s + (d.vm.valor||0), 0);

  // status textual
  const statusTxt = v.status === 'concluida' ? `Viagem concluída com sucesso.${chegada?` Entregas finalizadas às ${chegada}.`:''}`
    : v.status === 'em_andamento' ? 'Viagem em andamento.'
    : 'Viagem aguardando início.';
  const statusIc = v.status === 'concluida' ? '✅' : v.status === 'em_andamento' ? '🚛' : '⏳';

  return `<div class="histv-fin">
    <div class="histv-fin-col">
      <div class="histv-sec-tit">STATUS DA VIAGEM</div>
      <div class="histv-fin-status ${st.cls}">
        <div class="histv-fin-status-ic">${statusIc}</div>
        <div>
          <div class="histv-fin-status-lbl">${st.label}</div>
          <div class="histv-fin-status-sub">${statusTxt}</div>
        </div>
      </div>
    </div>

    <div class="histv-fin-col">
      <div class="histv-sec-tit">RESUMO FINANCEIRO</div>
      <div class="histv-fin-linha"><span>Faturamento bruto</span><strong class="v-verde">R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      <div class="histv-fin-linha"><span>Remuneração do motorista</span><strong class="v-laranja">− R$ ${valorBase.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      <div class="histv-fin-linha"><span>Despesas operacionais</span><strong class="text-muted">− R$ 0,00</strong></div>
      <div class="histv-fin-linha histv-fin-resultado"><span>Resultado operacional</span><strong class="v-azul">R$ ${(v.total - valorBase).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      ${temPendente?'<div class="histv-fin-aviso">⚠️ Há pedido(s) com remuneração a definir — o total do motorista pode mudar.</div>':''}
    </div>

    <div class="histv-fin-col histv-fin-full">
      <div class="histv-sec-tit">DETALHAMENTO DA REMUNERAÇÃO</div>
      <table class="histv-tab">
        <thead><tr><th>PEDIDO</th><th>TRECHO</th><th>ORIGEM DO VALOR</th><th>VALOR</th></tr></thead>
        <tbody>
          ${detPed.map(({p,vm}) => `<tr>
            <td><strong>#${p.id}</strong> ${p.placa||''}</td>
            <td>${p.cidadeOrigem||'—'} → ${p.cidadeDestino||'—'}</td>
            <td>${_histOrigemValorLabel(vm.origem)}</td>
            <td>${vm.valor!=null ? 'R$ '+vm.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '<span style="color:#f87171">a definir</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="histv-tab-total"><span>TOTAL MOTORISTA</span><strong class="v-azul">R$ ${valorBase.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
      <div class="histv-fin-nota">💡 Excedente e bônus por meta ainda não são calculados automaticamente — quando essa regra for definida, entra aqui.</div>
    </div>
  </div>`;
}

function _histOrigemValorLabel(origem){
  if (origem === 'pedido') return '✏️ Ajuste do pedido';
  if (origem === 'tabela') return '📋 Tabela oficial';
  if (origem === 'manual') return '✍️ Valor do trecho';
  return '⏳ Pendente';
}

// ABA LINHA DO TEMPO — agrega os eventos reais (historico_status) de todos os pedidos da viagem
function _histAbaTimeline(v){
  // dispara a busca async e renderiza quando chegar
  _histCarregarTimeline(v);
  return `<div class="histv-timeline" id="histvTimeline"><p class="text-muted" style="padding:2rem;text-align:center">Carregando linha do tempo...</p></div>`;
}

// Mapeia o tipo de evento para ícone e cor
function _histEventoVisual(ev){
  const txt = ((ev.observacao||'') + ' ' + (ev.status_novo||'')).toLowerCase();
  if (txt.includes('coleta')) return { ic:'📥', cls:'ev-verde', titulo:'Coleta' };
  if (txt.includes('transbordo')) return { ic:'🔀', cls:'ev-roxo', titulo:'Transbordo' };
  if (txt.includes('entreg')) return { ic:'✅', cls:'ev-verde', titulo:'Entrega' };
  if (txt.includes('conferid') || txt.includes('cte')) return { ic:'📄', cls:'ev-azul', titulo:'Documento' };
  if (txt.includes('início') || txt.includes('inicio') || txt.includes('em transporte') || txt.includes('viagem')) return { ic:'🚛', cls:'ev-azul', titulo:'Transporte' };
  if (txt.includes('pátio') || txt.includes('patio')) return { ic:'📍', cls:'ev-cinza', titulo:'Pátio' };
  if (txt.includes('aprovad')) return { ic:'✅', cls:'ev-verde', titulo:'Aprovação' };
  return { ic:'🟢', cls:'ev-cinza', titulo:'Evento' };
}

async function _histCarregarTimeline(v){
  const alvo = document.getElementById('histvTimeline');
  if (!alvo) return;
  const ids = v.pedidos.map(p => parseInt(p.id));
  let eventos = [];

  // marcos da própria rota (saída/chegada) quando existem
  if (v.rota.iniciada_em) eventos.push({ created_at: v.rota.iniciada_em, _marco:true, ic:'🚛', cls:'ev-azul', titulo:'Início da viagem', obs: (v.paradas[0]||'') , quem: v.motorista });
  if (v.rota.concluida_em) eventos.push({ created_at: v.rota.concluida_em, _marco:true, ic:'🏁', cls:'ev-verde', titulo:'Viagem concluída', obs:'', quem: v.motorista });

  try {
    if (ids.length){
      const { data } = await supabase.from('historico_status').select('*').in('pedido_id', ids).order('created_at', { ascending: true });
      (data||[]).forEach(ev => {
        // ignora ruído: eventos sem observação e sem mudança real
        if (!ev.observacao && ev.status_anterior === ev.status_novo) return;
        const vis = _histEventoVisual(ev);
        eventos.push({ created_at: ev.created_at, ic:vis.ic, cls:vis.cls, titulo:vis.titulo, obs: ev.observacao || ev.status_novo || '', quem: ev.usuario_nome || '', pedido: ev.pedido_id });
      });
    }
  } catch(e){ /* silencioso */ }

  if (eventos.length === 0){
    alvo.innerHTML = '<p class="text-muted" style="padding:2rem;text-align:center">Nenhum evento registrado nesta viagem ainda.<br><span style="font-size:.8rem">Os eventos aparecem conforme a operação executa as ações (coleta, transbordo, entrega...).</span></p>';
    return;
  }

  eventos.sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));

  alvo.innerHTML = `<div class="histv-sec-tit">LINHA DO TEMPO DA VIAGEM</div>
    <div class="histv-tl">
      ${eventos.map(ev => {
        const d = ev.created_at ? new Date(ev.created_at) : null;
        const dia = d ? d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '--';
        const hora = d ? d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
        return `<div class="histv-tl-item">
          <div class="histv-tl-data">${dia}<br><span>${hora}</span></div>
          <div class="histv-tl-linha"><span class="histv-tl-dot ${ev.cls}">${ev.ic}</span></div>
          <div class="histv-tl-conteudo">
            <div class="histv-tl-tit">${ev.titulo}${ev.pedido?` <span class="histv-tl-ped">#${ev.pedido}</span>`:''}</div>
            <div class="histv-tl-obs">${ev.obs||''}</div>
            ${ev.quem?`<div class="histv-tl-quem">${ev.quem}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ABA CONFERÊNCIA E DOCUMENTOS
function _histAbaConferencia(v){
  const total = v.pedidos.length;
  const comCte = v.comCte;
  const pend = total - comCte;
  const pct = total ? Math.round(comCte/total*100) : 0;
  const okConf = pend === 0 && total > 0;
  const docs = (documentosRotaGlobais||[]).filter(d => String(d.rota_id)===String(v.id));
  const mans = docs.filter(d => d.tipo==='manifesto');
  const ctes = docs.filter(d => d.tipo==='cte');

  // donut simples via conic-gradient
  const donut = `conic-gradient(#22c55e ${pct*3.6}deg, rgba(148,163,184,.2) ${pct*3.6}deg)`;

  return `<div class="histv-conf">
    <div class="histv-conf-col">
      <div class="histv-sec-tit">CONFERÊNCIA DE CTes</div>
      <div class="histv-donut-wrap">
        <div class="histv-donut" style="background:${donut}">
          <div class="histv-donut-centro"><strong>${comCte}</strong><span>de ${total}</span></div>
        </div>
        <div class="histv-donut-leg">
          <div><span class="histv-dot-v"></span> Conferidos: ${comCte} (${pct}%)</div>
          <div><span class="histv-dot-c"></span> Pendentes: ${pend} (${100-pct}%)</div>
        </div>
      </div>
      <div class="histv-conf-status ${okConf?'ok':'pend'}">
        ${okConf ? '🟢 CONFERÊNCIA OK<br><span>Todos os CTes foram conferidos.</span>'
                 : `🟠 PENDÊNCIA DE CONFERÊNCIA<br><span>${pend} pedido(s) sem CTe registrado.</span>`}
      </div>
      ${pend>0 ? `<div class="histv-conf-pendentes">
        <div class="histv-sec-tit" style="margin-top:12px">Pendentes:</div>
        ${v.pedidos.filter(p => !(p.numeroCte || ((typeof cteInfoDoPedido==='function') && cteInfoDoPedido(p.id)))).map(p =>
          `<div class="histv-conf-pend-item">⚠️ #${p.id} · ${p.placa||''} · ${p.cliente||''} → ${p.cidadeDestino||''}</div>`).join('')}
      </div>` : ''}
    </div>

    <div class="histv-conf-col">
      <div class="histv-sec-tit">DOCUMENTOS DA VIAGEM</div>
      <div class="histv-docs">
        <div class="histv-doc-lin"><span>🧾 CTes da viagem (${ctes.length})</span>${ctes.length?`<a href="${ctes[0].url}" target="_blank" class="histv-doc-ver">VER</a>`:'<span class="text-muted">—</span>'}</div>
        <div class="histv-doc-lin"><span>📋 Manifestos (${mans.length})</span>${mans.length?`<a href="${mans[0].url}" target="_blank" class="histv-doc-ver">VER</a>`:'<span class="text-muted">—</span>'}</div>
        <div class="histv-doc-lin"><span>📄 Romaneio de carga</span><button class="histv-doc-ver" onclick="abrirFecharEnviarCarga(${v.id})">VER</button></div>
      </div>
      ${docs.length ? `<div class="histv-docs-todos">
        <div class="histv-sec-tit" style="margin-top:12px">Arquivos enviados</div>
        ${docs.map(d => `<div class="histv-doc-arq"><a href="${d.url}" target="_blank">📎 ${d.nome_arquivo||'documento'}</a> <span class="text-muted" style="font-size:.72rem">${d.tipo}</span></div>`).join('')}
      </div>` : '<p class="text-muted" style="font-size:.8rem;margin-top:10px">Nenhum documento enviado ainda.</p>'}
    </div>
  </div>`;
}

function _histAbaCarga(v){
  return `<div class="histv-carga">
    <div class="histv-veiculos">
      <div class="histv-sec-tit">VEÍCULOS TRANSPORTADOS (${v.pedidos.length})</div>
      <table class="histv-tab">
        <thead><tr><th>PEDIDO</th><th>PLACA</th><th>MODELO</th><th>CLIENTE</th><th>ORIGEM</th><th>DESTINO</th><th>FRETE</th><th>CTe</th><th>ENTREGA</th></tr></thead>
        <tbody>
          ${v.pedidos.map(p => {
            const vinc = _vinculoViagemPedido(v.id, p.id);
            const transb = vinc && vinc.saiu_em;
            const temCte = p.numeroCte || ((typeof cteInfoDoPedido==='function') && cteInfoDoPedido(p.id));
            return `<tr>
              <td><strong>#${p.id}</strong></td>
              <td>${p.placa||'—'}</td>
              <td>${p.modelo||'—'}</td>
              <td>${p.cliente||'—'}</td>
              <td>${p.cidadeOrigem||'—'}</td>
              <td>${p.cidadeDestino||'—'}${transb?`<br><span style="font-size:.7rem;color:#a855f7">🔀 transbordado</span>`:''}</td>
              <td>R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td>${temCte?'<span class="histv-ok">✅ OK</span>':'<span class="histv-pend">— </span>'}</td>
              <td>${p.status==='Entregue'?'<span class="histv-ok">✅ OK</span>':'<span class="text-muted">—</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="histv-tab-total"><span>TOTAL DA VIAGEM</span><strong>R$ ${v.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
    </div>
  </div>`;
}

// ===== HISTÓRICO DE CARGAS — visão viagem (master-detail) =====
let _histViagemSel = null;
let _histLimite = 8;

function _histCargasCasca(){
  return `
    <div class="histv-filtros">
      <input type="text" id="histBusca" class="histv-busca" placeholder="🔎 Buscar viagem, motorista, placa..." oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histMotorista" class="histv-fil" placeholder="👤 Motorista" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histCegonha" class="histv-fil" placeholder="🚛 Cegonha" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histOrigem" class="histv-fil" placeholder="📍 Origem" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <input type="text" id="histDestino" class="histv-fil" placeholder="🏁 Destino" oninput="_mmDeb('renderizarHistoricoCargas', renderizarHistoricoCargas)">
      <div class="hist-datas-grupo">
        <label class="hist-data">De <input type="date" id="histDataDe" onchange="renderizarHistoricoCargas()"></label>
        <label class="hist-data">Até <input type="date" id="histDataAte" onchange="renderizarHistoricoCargas()"></label>
      </div>
      <button class="histv-btn-relatorio" onclick="_histAbrirRelatorio()">📊 Relatório do período</button>
    </div>
    <div class="histv-layout">
      <div class="histv-lista" id="histvLista"></div>
      <div class="histv-detalhe" id="histvDetalhe"></div>
    </div>`;
}

// Monta os dados de uma viagem (rota + pedidos vinculados) — só dados reais
function _histDadosViagem(r){
  const pedidos = _pedidosHistoricoDaViagem(r.id).filter(p => p.status !== 'Cancelado');
  const total = pedidos.reduce((s,p)=>s+Number(p.valorFrete||0),0);
  const totalMotorista = pedidos.reduce((s,p)=>{
    const vm = (typeof valorMotoristaPedido==='function') ? valorMotoristaPedido(p) : {valor:null};
    return s + (vm.valor||0);
  }, 0);
  const comCte = pedidos.filter(p => p.numeroCte || ((typeof cteInfoDoPedido==='function') && cteInfoDoPedido(p.id))).length;
  const entregues = pedidos.filter(p => p.status === 'Entregue').length;
  const data = r.data_saida || r.iniciada_em || (pedidos[0] && _dataLancamento(pedidos[0])) || null;
  return {
    id: r.id, nome: r.nome, rota: r,
    motorista: r.motorista_1 || (pedidos[0]&&pedidos[0].motorista1) || '—',
    cegonha: r.placa_cegonha || '—',
    modelo: (veiculosGlobais||[]).find(v => v.placa === r.placa_cegonha)?.tipo || '',
    data, status: r.status,
    paradas: Array.isArray(r.paradas) ? r.paradas : [],
    pedidos, total, totalMotorista, comCte, entregues,
    resultado: total - totalMotorista
  };
}

function _histStatusInfo(st){
  if (st === 'concluida') return { label:'CONCLUÍDA', cls:'histv-st-ok' };
  if (st === 'em_andamento') return { label:'EM VIAGEM', cls:'histv-st-viagem' };
  if (st === 'planejada') return { label:'AGUARDANDO', cls:'histv-st-aguard' };
  return { label:(st||'—').toUpperCase(), cls:'' };
}

// Popula o seletor de corredor no lançamento, marcando os que combinam com origem→destino
function _popularCorredoresPedido(){
  const sel = document.getElementById('pedidoCorredor');
  if (!sel) return;
  const origVal = document.getElementById('cidadeOrigem')?.value || '';
  const destVal = document.getElementById('cidadeDestino')?.value || '';
  const corredores = (corredoresGlobais||[]).filter(c => (c._paradas||[]).length >= 2 || (c.origem && c.destino));
  const combina = (c) => {
    const seq = ((c._paradas||[]).length >= 2 ? c._paradas.map(x=>x.cidade) : [c.origem, c.destino]).filter(Boolean);
    const io = _posNaSeq(seq, origVal), id = _posNaSeq(seq, destVal);
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
  // popula equipes
  if (forma === 'coletador'){
    const sel = document.getElementById('equipeColeta');
    if (sel){
      const eqs = (equipesEntregaGlobais||[]).filter(e=>e.ativo!==false);
      sel.innerHTML = eqs.length
        ? '<option value="">Selecione a equipe...</option>'+eqs.map(e=>`<option value="${e.id}">${e.nome}${e.cidade_base?' — '+e.cidade_base:''}</option>`).join('')
        : '<option value="">Cadastre uma equipe primeiro</option>';
    }
  }
}

// ============================================================
// ROMANEIO DE CARREGAMENTO
// Mostra os carros da carga divididos: prontos no pátio × aguardando coleta.
// Logística fecha e envia; motorista vê no perfil dele.
// ============================================================
function _romaneioDados(rotaId){
  const rota = (rotasGlobais||[]).find(r => String(r.id) === String(rotaId));
  if (!rota) return null;
  const carros = (pedidosGlobais||[]).filter(p =>
    String(p.rotaId||p.rota_id) === String(rotaId) && p.status !== 'Cancelado');
  const prontos = carros.filter(p => p.noPatio || p.patioAtual || p.coletaEquipeEm || p.formaColeta === 'motorista');
  const aguardando = carros.filter(p => !p.noPatio && !p.patioAtual && !p.coletaEquipeEm && p.formaColeta !== 'motorista');
  return { rota, carros, prontos, aguardando };
}

function _romaneioHTML(rotaId){
  const d = _romaneioDados(rotaId);
  if (!d) return '<p class="text-muted">Carga não encontrada.</p>';
  const { rota, prontos, aguardando } = d;
  const linha = (p, pronto) => {
    let ondeColeta = '';
    if (!pronto){
      if (p.equipeColetaId){
        const eq = (equipesEntregaGlobais||[]).find(e => String(e.id)===String(p.equipeColetaId));
        ondeColeta = eq ? `equipe ${eq.nome}` : 'equipe de coleta';
      } else if (p.formaColeta === 'coletador'){ ondeColeta = 'coletador'; }
      else { ondeColeta = 'aguardando'; }
    }
    const local = pronto
      ? (p.localCarro ? `📍 ${p.localCarro}` : (p.patioAtual ? `🅿️ ${p.patioAtual}` : (p.formaColeta==='motorista' ? '🚚 você coleta direto' : '✅ pronto')))
      : (p.localCarro ? `📍 ${p.localCarro}` : `⏳ ${ondeColeta}`);
    return `<tr class="corr-tr">
      <td class="ct-id">#${p.id}</td>
      <td class="ct-placa"><strong>${p.placa||'—'}</strong></td>
      <td class="ct-modelo">${p.modelo||'—'}</td>
      <td class="ct-rota">${p.cidadeOrigem||'—'} <span class="cpl-seta">→</span> <strong>${p.cidadeDestino||'—'}</strong></td>
      <td class="ct-cli">${p.cliente||'—'}</td>
      <td>${local}</td>
      ${p.obsColeta ? `<td style="font-size:.8rem;color:var(--text-secondary,#9ca3af)">${p.obsColeta}</td>` : '<td>—</td>'}
    </tr>`;
  };
  const tabela = (titulo, arr, pronto, vazio) => `
    <h4 style="margin:1rem 0 .5rem;font-size:.9rem">${titulo} <span class="text-muted">(${arr.length})</span></h4>
    ${arr.length ? `<table class="corr-tabela">
      <thead><tr><th>ID</th><th>Placa</th><th>Modelo</th><th>Origem → Destino</th><th>Cliente</th><th>Situação</th><th>Obs. coleta</th></tr></thead>
      <tbody>${arr.map(p => linha(p, pronto)).join('')}</tbody></table>` : `<p class="text-muted" style="font-size:.85rem">${vazio}</p>`}`;
  return `
    <div class="romaneio-cab">
      <div><strong>🚛 ${rota.placa_cegonha||'—'}</strong>${rota.motorista_1?' · 👤 '+rota.motorista_1:''}${rota.data_saida?' · 🕒 '+new Date(rota.data_saida+'T12:00').toLocaleDateString('pt-BR'):''}</div>
      <div class="text-muted" style="font-size:.85rem">${rota.nome||''}${rota.carga_enviada_em?' · ✅ enviada '+new Date(rota.carga_enviada_em).toLocaleString('pt-BR'):''}</div>
    </div>
    ${tabela('✅ Prontos no pátio (pode carregar)', prontos, true, 'Nenhum carro pronto ainda.')}
    ${tabela('⏳ Aguardando coleta (equipe vai trazer)', aguardando, false, 'Nada pendente de coleta. 👌')}`;
}

// Logística: abre o romaneio EDITÁVEL e envia a carga
function abrirFecharEnviarCarga(rotaId){
  if (typeof bloquearSeNaoLogistica === 'function' && bloquearSeNaoLogistica('fechar e enviar a carga')) return;
  const d = _romaneioDados(rotaId);
  if (!d){ alert('Carga não encontrada.'); return; }
  const old = document.getElementById('modalRomaneio'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalRomaneio';
  div.className = 'modal-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  const linhaEdit = (p) => {
    // "onde está o carro" = localização física (pátio ou local definido). NÃO cai mais para
    // o endereço de coleta — esse já aparece no campo "Coletar em" acima (evita duplicação).
    const local = p.localCarro || p.patioAtual || '';
    // detecta se o local salvo corresponde a um pátio (pelo valor real OU pelo label)
    const patioReal = PATIOS_FIXOS.find(pt => local === pt || local === _labelPatio(pt).replace('🅿️ ',''));
    const ehPatioFixo = !!patioReal;
    const chips = PATIOS_FIXOS.map(pt => {
      const lbl = _labelPatio(pt).replace('🅿️ ',''); // ex: "PÁTIO MARINGÁ"
      return `<button type="button" class="rm-patio-chip ${ehPatioFixo && patioReal===pt?'sel':''}" data-patio="${lbl.replace(/"/g,'&quot;')}" onclick="_rmSelecionarPatio(${p.id}, '${lbl.replace(/'/g,"\\'")}')">🅿️ ${lbl.replace('PÁTIO ','')}</button>`;
    }).join('');
    return `<div class="rm-carro" id="rmCarro_${p.id}">
      <div class="rm-carro-head">
        <span><strong>#${p.id}</strong> · <strong>${p.placa||'—'}</strong> ${p.modelo?('· '+p.modelo):''}</span>
        <span class="text-muted" style="font-size:.8rem">${p.cidadeOrigem||'—'} → <strong>${p.cidadeDestino||'—'}</strong></span>
      </div>
      ${p.cliente?`<div class="rm-carro-cliente">👤 ${p.cliente}</div>`:''}
      ${p.observacaoPedido?`<div class="rm-carro-obs">📝 <strong>Observação:</strong> ${p.observacaoPedido}</div>`:''}
      <div class="rm-end-campo">
        <label>📍 Coletar em / onde pegar o carro (editável)</label>
        <div class="rm-coleta-linha">
          <input type="text" id="rmColeta_${p.id}" value="${(p.romaneioEnderecoColeta || p.enderecoColeta || local || '').replace(/"/g,'&quot;')}" placeholder="endereço de coleta ou pátio" class="rm-local-input" oninput="_rmColetaDigitado(${p.id})">
          <details class="rm-patio-det rm-patio-inline">
            <summary title="Selecionar um pátio">🅿️</summary>
            <div class="rm-patio-chips">${chips}</div>
          </details>
        </div>
        <div class="rm-local-hint">Clique no 🅿️ se o carro estiver num pátio — preenche o campo automaticamente.</div>
      </div>
      <div class="rm-end-campo">
        <label>🏁 Entregar em (editável para este romaneio)</label>
        <input type="text" id="rmEntrega_${p.id}" value="${(p.romaneioEnderecoEntrega || p.enderecoEntrega || '').replace(/"/g,'&quot;')}" placeholder="endereço de entrega" class="rm-local-input">
      </div>
      <input type="hidden" id="rmLocal_${p.id}" value="${(ehPatioFixo ? _labelPatio(patioReal).replace('🅿️ ','') : '').replace(/"/g,'&quot;')}">
      <input type="hidden" id="rmPatio_${p.id}" value="${ehPatioFixo?'1':'0'}">
    </div>`;
  };
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:820px;width:96%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h2 style="margin:0">📋 Romaneio de carregamento</h2>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalRomaneio').remove()">✕</button>
      </div>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">Marque quais carros já estão <strong>no pátio</strong> e informe <strong>onde está</strong> cada um. Salve e envie ao motorista — ele verá esta lista (e o PDF) para saber onde coletar/pegar cada carro.</p>
      <div class="romaneio-cab" style="margin-bottom:10px"><strong>🚛 ${d.rota.placa_cegonha||'—'}</strong>${d.rota.motorista_1?' · 👤 '+d.rota.motorista_1:''}${d.rota.nome?' · '+d.rota.nome:''}</div>
      <div class="rm-carros-lista">${d.carros.map(linhaEdit).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="_salvarLocaisRomaneio(${rotaId})">💾 Salvar localização</button>
        <button class="btn btn-primary" style="flex:1;min-width:180px" onclick="_salvarLocaisRomaneio(${rotaId}, true)">📤 Salvar e enviar ao motorista</button>
        <button class="btn btn-secondary" onclick="_gerarPdfRomaneio(${rotaId})">📄 Gerar PDF</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Rótulo amigável do pátio para os chips: "Maringá/PR" -> "PÁTIO MARINGÁ"
function _labelPatio(pt){
  const cidade = String(pt).split('/')[0].trim().toUpperCase();
  return '🅿️ PÁTIO ' + cidade;
}

// Romaneio Opção B: chips de pátio + endereço editável
function _rmSelecionarPatio(pedidoId, patio){
  // Preenche o campo unificado "Coletar em" com o pátio
  const campo = document.getElementById('rmColeta_'+pedidoId);
  if (campo) campo.value = patio;
  const cont = document.getElementById('rmCarro_'+pedidoId);
  if (cont){
    cont.querySelectorAll('.rm-patio-chip').forEach(b => b.classList.toggle('sel', b.getAttribute('data-patio') === patio));
    // fecha o dropdown do pátio
    const det = cont.querySelector('.rm-patio-inline'); if (det) det.removeAttribute('open');
  }
  const hidden = document.getElementById('rmPatio_'+pedidoId);
  if (hidden) hidden.value = '1';
  const local = document.getElementById('rmLocal_'+pedidoId);
  if (local) local.value = patio;
}

// Quando digita manualmente no "Coletar em", detecta se é um pátio conhecido
function _rmColetaDigitado(pedidoId){
  const campo = document.getElementById('rmColeta_'+pedidoId);
  const cont = document.getElementById('rmCarro_'+pedidoId);
  if (!campo || !cont) return;
  const val = campo.value.trim();
  const ehPatio = PATIOS_FIXOS.some(pt => _labelPatio(pt).replace('🅿️ ','') === val);
  cont.querySelectorAll('.rm-patio-chip').forEach(b => b.classList.toggle('sel', b.getAttribute('data-patio') === val));
  const hidden = document.getElementById('rmPatio_'+pedidoId);
  if (hidden) hidden.value = ehPatio ? '1' : '0';
  const local = document.getElementById('rmLocal_'+pedidoId);
  if (local) local.value = ehPatio ? val : '';
}

// (compat) limpar pátio — não usado no layout novo, mantido por segurança
function _rmLimparPatio(pedidoId){
  const campo = document.getElementById('rmColeta_'+pedidoId);
  if (campo) campo.value = '';
  const hidden = document.getElementById('rmPatio_'+pedidoId);
  if (hidden) hidden.value = '0';
  const local = document.getElementById('rmLocal_'+pedidoId);
  if (local) local.value = '';
  const cont = document.getElementById('rmCarro_'+pedidoId);
  if (cont){ cont.querySelectorAll('.rm-patio-chip').forEach(b => b.classList.remove('sel')); }
}

// Se a pessoa digita um endereço manual, desmarca os chips (não é mais um pátio fixo)
function _rmLocalDigitado(pedidoId){
  const input = document.getElementById('rmLocal_'+pedidoId);
  const cont = document.getElementById('rmCarro_'+pedidoId);
  if (!input || !cont) return;
  const val = input.value.trim();
  // reconhece "PÁTIO X" (label) como pátio
  const ehPatio = PATIOS_FIXOS.some(pt => _labelPatio(pt).replace('🅿️ ','') === val);
  cont.querySelectorAll('.rm-patio-chip').forEach(b => b.classList.toggle('sel', b.getAttribute('data-patio') === val));
  const hidden = document.getElementById('rmPatio_'+pedidoId);
  if (hidden) hidden.value = ehPatio ? '1' : '0';
}

async function _salvarLocaisRomaneio(rotaId, enviar){
  const d = _romaneioDados(rotaId);
  if (!d) return;
  try {
    // Otimização: 1 update por carro (não 2) e todos em paralelo (não em fila).
    const updates = d.carros.map(p => {
      const noPatio = document.getElementById('rmPatio_'+p.id)?.value === '1';
      const local = document.getElementById('rmLocal_'+p.id)?.value.trim() || null;
      const rColeta = document.getElementById('rmColeta_'+p.id)?.value.trim() || null;
      const rEntrega = document.getElementById('rmEntrega_'+p.id)?.value.trim() || null;
      const pg = (pedidosGlobais||[]).find(x => String(x.id)===String(p.id));
      const patch = { local_carro: local, romaneio_endereco_coleta: rColeta, romaneio_endereco_entrega: rEntrega };
      if (pg){ pg.romaneioEnderecoColeta = rColeta; pg.romaneioEnderecoEntrega = rEntrega; }
      if (noPatio){
        patch.patio_atual = local || p.patioAtual || (p.cidadeOrigem?`${p.cidadeOrigem}${p.ufOrigem?'/'+p.ufOrigem:''}`:null);
        if (pg){ pg.localCarro = local; if (!pg.patioAtual) pg.patioAtual = patch.patio_atual; }
      } else {
        patch.patio_atual = null; patch.patio_desde = null;
        if (pg){ pg.localCarro = local; pg.patioAtual = null; }
      }
      return supabase.from('pedidos').update(patch).eq('id', p.id);
    });
    await Promise.all(updates);
    if (enviar){
      const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
      await supabase.from('rotas_planejadas').update({ carga_enviada_em: new Date().toISOString(), carga_enviada_por: usuario }).eq('id', rotaId);
      const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
      if (rota){ rota.carga_enviada_em = new Date().toISOString(); rota.carga_enviada_por = usuario; }
      // Notifica motorista + logística em paralelo (não trava o clique)
      if (rota && typeof notificar === 'function'){
        const notifs = [];
        if (rota.motorista_1){
          notifs.push(notificar({
            nome: rota.motorista_1, tipo: 'romaneio',
            titulo: '📋 Romaneio da sua carga',
            mensagem: `Você recebeu o romaneio da carga ${rota.placa_cegonha||''}${rota.nome?(' · '+rota.nome):''}. Veja onde pegar cada carro na sua área.`
          }));
        }
        notifs.push(notificar({
          perfil: 'logistica', tipo: 'romaneio',
          titulo: '✅ Romaneio enviado',
          mensagem: `Romaneio da carga ${rota.placa_cegonha||''}${rota.nome?(' · '+rota.nome):''} enviado${rota.motorista_1?(' ao motorista '+rota.motorista_1):''}.`
        }));
        Promise.all(notifs); // não aguarda — roda em segundo plano
      }
      document.getElementById('modalRomaneio')?.remove();
      if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', `📤 Carga enviada ao motorista${rota&&rota.motorista_1?' ('+rota.motorista_1+')':''} com a localização de cada carro.`, 'success');
      _rmToastConfirmacao(`✅ Salvo e enviado ao motorista${rota&&rota.motorista_1?' ('+rota.motorista_1+')':''}!`);
      if (typeof renderizarRotas === 'function') renderizarRotas();
    } else {
      if (typeof exibirMensagem === 'function') exibirMensagem('mensagemLogistica', '💾 Localização salva.', 'success');
      _rmToastConfirmacao('💾 Localização salva!');
    }
  } catch(e){ alert('Erro ao salvar: '+(e.message||e)); }
}

// Toast de confirmação central (rápido e visível)
