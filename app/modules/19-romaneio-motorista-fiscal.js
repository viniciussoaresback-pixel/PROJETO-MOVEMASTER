/* ==========================================================================
   MODULE: 19-romaneio-motorista-fiscal.js
   Romaneio, motorista, fiscal
   Linhas originais: 16104-17031
   ========================================================================== */

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
    const chave = (p.grupoId && ref) ? ('g'+p.grupoId+'|r'+_norm(ref)) : 'p'+p.id;
    if (!vistos[chave]){ vistos[chave] = { chave, itens:[], lider:p }; grupos.push(vistos[chave]); }
    vistos[chave].itens.push(p);
  });
  return `<div style="margin-top:10px;border-top:1px dashed var(--border,rgba(255,255,255,.12));padding-top:10px">
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
