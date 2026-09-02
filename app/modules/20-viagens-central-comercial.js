/* ==========================================================================
   MODULE: 20-viagens-central-comercial.js
   Viagens, planejamento, central, comercial
   Linhas originais: 17032-19576
   ========================================================================== */


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
    const pedidos = _planPedidosAguardandoAprovacao();
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Sistema';
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
    const pedidos = _planPedidosAguardandoTransbordo();
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
  const pedidos = _planPedidosSemRota();
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
      upd.aprovado_por = document.getElementById('usuarioLogado')?.textContent || 'Sistema';
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

function _planAbrirModalViagem(cor, pedidos, rotaVazia){
  const cegonhas = (veiculosGlobais||[]).filter(v => v.ativo !== false && v.placa);
  const old = document.getElementById('modalPlanViagem'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPlanViagem';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:560px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">${rotaVazia ? '➕ Nova rota para planejar' : '🚛 Criar viagem'} — ${cor.nome}</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${rotaVazia ? 'Crie a rota e escolha o veículo. Você pode marcar pedidos agora ou deixar para arrastar depois.' : 'Selecione os pedidos que vão nesta viagem e escolha o caminhão/motorista.'}</p>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.plan-viagem-ped').forEach(c=>c.checked=true)">Marcar todos</button>
        <button class="btn btn-secondary btn-sm" onclick="document.querySelectorAll('.plan-viagem-ped').forEach(c=>c.checked=false)">Desmarcar</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px;max-height:220px;overflow:auto">
        ${pedidos.length === 0 ? '<p class="text-muted" style="font-size:.82rem">Nenhum pedido neste corredor ainda. Você pode criar a rota vazia e arrastar pedidos depois.</p>' : pedidos.map(p => `<label class="jv-sel-linha">
          <input type="checkbox" class="plan-viagem-ped" value="${p.id}" ${rotaVazia ? '' : 'checked'}>
          <span><strong>${p.placa||'—'}</strong> · ${p.modelo||''} · ${p.cliente||''} <span class="text-muted">${p.patioAtual||p.cidadeOrigem||''} → ${p.cidadeDestino||''}</span></span>
        </label>`).join('')}
      </div>
      <div class="form-group">
        <label>Tipo de veículo</label>
        <div class="plan-vtipo">
          <button type="button" class="plan-vtipo-btn active" data-vtipo="todos" onclick="_planFiltrarCegonhas(this,'todos')">Todos</button>
          <button type="button" class="plan-vtipo-btn" data-vtipo="propria" onclick="_planFiltrarCegonhas(this,'propria')">🚛 Frota própria</button>
          <button type="button" class="plan-vtipo-btn" data-vtipo="terceiro" onclick="_planFiltrarCegonhas(this,'terceiro')">🤝 Terceiros</button>
        </div>
      </div>
      <div class="form-group">
        <label>Cegonha / Guincho</label>
        <select id="planViagemCegonha" onchange="_planViagemPreencheMot()">
          <option value="">— a definir —</option>
          ${cegonhas.map(v => { const prop = (v.propriedade==='terceiro')?'terceiro':'propria'; return `<option value="${v.placa}" data-mot="${(v.motorista_padrao||'').replace(/"/g,'&quot;')}" data-prop="${prop}">${prop==='terceiro'?'🤝 ':'🚛 '}${v.placa}${v.modelo?' · '+v.modelo:''}${v.motorista_padrao?' · 👤 '+v.motorista_padrao:''}</option>`; }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Motorista</label>
        <input type="text" id="planViagemMotorista" placeholder="Motorista da viagem" list="listaMotPlanViagem">
        <datalist id="listaMotPlanViagem">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" style="flex:1" onclick="_planConfirmarViagem(${cor.id})">✅ Criar viagem</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalPlanViagem').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

// Filtra as opções de cegonha por tipo (todos / frota própria / terceiro)
function _planFiltrarCegonhas(btn, tipo){
  document.querySelectorAll('.plan-vtipo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const sel = document.getElementById('planViagemCegonha');
  if (!sel) return;
  [...sel.options].forEach(op => {
    if (!op.value){ op.hidden = false; return; } // "a definir" sempre visível
    const prop = op.getAttribute('data-prop') || 'propria';
    op.hidden = (tipo === 'todos') ? false : (prop !== tipo);
  });
  // se a opção selecionada ficou escondida, volta pra "a definir"
  if (sel.selectedOptions[0] && sel.selectedOptions[0].hidden){ sel.value = ''; _planViagemPreencheMot(); }
}

function _planViagemPreencheMot(){
  const sel = document.getElementById('planViagemCegonha');
  const opt = sel?.options[sel.selectedIndex];
  const inp = document.getElementById('planViagemMotorista');
  if (inp) inp.value = opt?.getAttribute('data-mot') || '';
}

async function _planConfirmarViagem(corId){
  if (window._criandoViagem){ return; } // trava anti-duplo-clique
  const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(corId));
  const ids = [...document.querySelectorAll('.plan-viagem-ped:checked')].map(c => parseInt(c.value));
  const cegonha = document.getElementById('planViagemCegonha')?.value || null;
  const motorista = document.getElementById('planViagemMotorista')?.value.trim() || null;
  if (ids.length === 0 && !cegonha){ alert('Para criar a rota, selecione ao menos um pedido OU escolha o veículo.'); return; }
  window._criandoViagem = true;
  // desabilita o botão visualmente
  const btnCriar = document.querySelector('#modalPlanViagem .btn-primary, [onclick^="_planConfirmarViagem"]');
  if (btnCriar){ btnCriar.disabled = true; btnCriar.textContent = '⏳ Criando...'; }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  try {
    // cria a rota
    const _perfilCriador = (typeof NOMES_PERFIL!=='undefined' && typeof perfilAtual!=='undefined') ? (NOMES_PERFIL[perfilAtual]||perfilAtual) : 'Logística';
    const ins = { nome: cor.nome, corredor_id: cor.id, status: 'planejada', criado_por: _perfilCriador, criada_por_usuario: usuario };
    if (cegonha) ins.placa_cegonha = cegonha;
    if (motorista) ins.motorista_1 = motorista;
    const { data: rota, error } = await supabase.from('rotas_planejadas').insert(ins).select().single();
    if (error) throw error;
    if (rota) rotasGlobais.push(rota);
    // vincula os pedidos
    for (const id of ids){
      const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
      if (!p) continue;
      const upd = { rota_id: rota.id };
      if (cegonha) upd.placa_cegonha = cegonha;
      if (motorista) upd.motorista_1 = motorista;
      // Se o pedido era um transbordado direcionado a este corredor, ao entrar na nova viagem
      // ele deixa de ser "aguardando próxima perna": limpa o corredor manual e volta a status de transporte.
      const pAtual = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
      if (pAtual && pAtual.status === 'Transbordo'){
        upd.corredor_manual_id = null;
        upd.status = 'Em Transporte';
        upd.status_planilha = null;
      }
      await supabase.from('pedidos').update(upd).eq('id', id);
      p.rotaId = rota.id; p.rota_id = rota.id;
      if (cegonha) p.placaCegonha = cegonha;
      if (motorista) p.motorista1 = motorista;
      if (pAtual && pAtual.status === 'Transbordo'){ p.corredorManualId = null; p.corredor_manual_id = null; p.status = 'Em Transporte'; p.statusPlanilha = null; }
      await _registrarVinculoViagem(rota.id, id); // vínculo histórico permanente
    }
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
    if (['Entregue','Cancelado'].includes(p.status||'')) return false;
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

  const old = document.getElementById('modalPuxarPedido'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalPuxarPedido';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:560px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 4px">➕ Puxar pedido para a viagem</h2>
      <p class="text-muted" style="font-size:.85rem;margin:.2rem 0 1rem">${carros.length}/${cap} na carga · ${vagas} vaga(s). Selecione os pedidos para embarcar nesta viagem. Os marcados com 🔁 estão aguardando transbordo; ⭐ combinam com o destino da viagem.</p>
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px;max-height:340px;overflow:auto">
        ${ordenados.map(({p, noCaminho}) => `<label class="jv-sel-linha">
          <input type="checkbox" class="puxar-ped" value="${p.id}">
          <span>
            ${noCaminho?'⭐ ':''}${p.status==='Transbordo'?'🔁 ':''}<strong>${p.placa||'—'}</strong> · ${p.modelo||''} · ${p.cliente||''}
            <span class="text-muted">${p.patioAtual?('🅿️ '+p.patioAtual.split('/')[0]):(p.cidadeOrigem||'')} → ${p.cidadeDestino||''}</span>
          </span>
        </label>`).join('')}
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:1" onclick="_viagemConfirmarPuxar(${rota.id}, ${cap})">✅ Puxar selecionados</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalPuxarPedido').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _viagemConfirmarPuxar(rotaId, cap){
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
  if (!rota) return;
  const jaNaCarga = _veiculosNaRota(rotaId).length;
  const ids = [...document.querySelectorAll('.puxar-ped:checked')].map(c => parseInt(c.value));
  if (ids.length === 0){ alert('Selecione ao menos um pedido.'); return; }
  if (jaNaCarga + ids.length > cap){
    alert(`Não cabe: a viagem tem ${jaNaCarga}/${cap} e você selecionou ${ids.length}. Reduza a seleção.`); return;
  }
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
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
    if (p.rotaId || p.placaCegonha) return false;    // já em viagem
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
    if (p.entregaEquipeEm) return false;
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
  const coletas = _centralColetas();
  const entregas = _centralEntregas();
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
        <div class="central-kpi central-kpi-laranja"><div class="central-kpi-ic">🚚</div><div><span class="central-kpi-lbl">Coletas pendentes</span><span class="central-kpi-num">${coletas.length}</span></div></div>
        <div class="central-kpi central-kpi-azul"><div class="central-kpi-ic">📦</div><div><span class="central-kpi-lbl">Entregas pendentes</span><span class="central-kpi-num">${entregas.length}</span></div></div>
        <div class="central-kpi central-kpi-amarelo"><div class="central-kpi-ic">⏳</div><div><span class="central-kpi-lbl">Aguardando confirmação</span><span class="central-kpi-num">${aguardando.length}</span></div></div>
        <div class="central-kpi central-kpi-verde"><div class="central-kpi-ic">✅</div><div><span class="central-kpi-lbl">Concluídos hoje</span><span class="central-kpi-num">${concluidos}</span></div></div>
      </div>
    </div>

    <div class="central-colunas">
      ${_centralColunaColetas(coletas)}
      ${_centralColunaEntregas(entregas)}
    </div>

    ${_centralAguardandoHTML(aguardando)}

    <p class="central-rodape">ℹ️ Pedidos saem desta tela após a confirmação da coleta ou entrega.</p>`;
}

function _centralSetBase(b){ _centralBase = b; renderizarCentralOperacao(); }

function _tipoColetaLabel(p){
  if (p.formaColeta === 'cliente') return '🏠 Cliente leva ao pátio';
  if (p.formaColeta === 'coletador') return '🚚 Coletador busca';
  if (p.formaColeta === 'motorista') return '🚛 Motorista coleta';
  return '🚚 A definir';
}
function _tipoEntregaLabel(p){
  return p.tipoEntrega === 'estabelecimento' ? '🏪 Estabelecimento do cliente' : '🏢 Retira no pátio';
}

function _centralColunaColetas(coletas){
  return `<div class="central-col">
    <div class="central-col-cab central-col-coletas">
      <span>🚚 COLETAS PENDENTES</span>
      <button class="central-refresh" onclick="renderizarCentralOperacao()" title="Atualizar">🔄</button>
    </div>
    ${coletas.length === 0 ? '<p class="central-vazio">Nenhuma coleta pendente. 👍</p>' : `
    <div class="central-cards">
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
          <div class="central-card-tipo">${_tipoColetaLabel(p)}</div>
        </div>
      </label>`).join('')}
    </div>
    <div class="central-col-rodape">
      <span class="text-muted">${coletas.length} pedido(s)</span>
      <button class="central-btn central-btn-laranja" onclick="_centralDirecionarEquipe()">👥 Direcionar para equipe</button>
    </div>`}
  </div>`;
}

function _centralColunaEntregas(entregas){
  return `<div class="central-col">
    <div class="central-col-cab central-col-entregas">
      <span>📦 ENTREGAS PENDENTES</span>
      <button class="central-refresh" onclick="renderizarCentralOperacao()" title="Atualizar">🔄</button>
    </div>
    ${entregas.length === 0 ? '<p class="central-vazio">Nenhuma entrega pendente. 👍</p>' : `
    <div class="central-cards">
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  for (const id of ids){
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    if (!p) continue;
    try {
      await supabase.from('pedidos').update({ equipe_coleta_id: parseInt(equipeId), forma_coleta: p.formaColeta || 'coletador' }).eq('id', id);
      p.equipeColetaId = parseInt(equipeId);
      if (!p.formaColeta) p.formaColeta = 'coletador';
    } catch(e){ console.error('Erro ao direcionar coleta', id, e); }
  }
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Logística';
  for (const id of ids){
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    if (!p) continue;
    try {
      await supabase.from('pedidos').update({ entrega_equipe_id: parseInt(equipeId), precisa_equipe_entrega: true }).eq('id', id);
      p.entregaEquipeId = parseInt(equipeId); p.precisaEquipeEntrega = true;
      try { await supabase.from('historico_status').insert({ pedido_id: parseInt(id), status_anterior: p.status, status_novo: p.status, usuario_nome: usuario, observacao: `👥 Entrega direcionada para a equipe ${eq?eq.nome:''}.` }); } catch(_){}
    } catch(e){ console.error('Erro ao direcionar entrega', id, e); }
  }
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
  for (const id of ids){
    const p = (pedidosGlobais||[]).find(x => String(x.id)===String(id));
    if (!p) continue;
    try {
      await supabase.from('pedidos').update({ motorista_1: mot }).eq('id', id);
      p.motorista1 = mot;
    } catch(e){ console.error('Erro ao direcionar entrega', id, e); }
  }
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Operador';
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
  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Comercial';
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
    if (f.dataIni && (p.dataSolicitacao||'') < f.dataIni) return false;
    if (f.dataFim && (p.dataSolicitacao||'') > f.dataFim + 'T23:59') return false;
    return true;
  });
}

function _cgStatusPill(p){
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

function renderizarComercialPedidos(){
  const cont = document.getElementById('comercialPedidosConteudo');
  if (!cont) return;
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
      <div class="cg-filtro cg-filtro-btns"><button class="btn btn-secondary btn-sm" onclick="_cgLimparFiltros()">Limpar</button></div>
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
                <td>${rota ? (rota.nome||('R-'+rota.id)) : '—'}</td>
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
                <td>${rota0 ? (rota0.nome||('R-'+rota0.id)) : '—'}</td>
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
        <button class="cg-acao-btn cg-acao-del" onclick="excluirPedido(${p.id})">🗑️ Excluir</button>
      </div>
      <div class="cg-rastreio-dados">
        <div><span class="cg-rd-lbl">🚗 Veículo</span><span class="cg-rd-val">${p.placa||'—'} ${p.modelo?('· '+p.modelo):''}</span></div>
        <div><span class="cg-rd-lbl">📍 Corredor</span><span class="cg-rd-val">${_cgCorredorDoPedido(p)}</span></div>
        <div><span class="cg-rd-lbl">🛣️ Rota</span><span class="cg-rd-val">${rota?(rota.nome||('R-'+rota.id)):'—'}</span></div>
        <div><span class="cg-rd-lbl">👤 Motorista</span><span class="cg-rd-val">${p.motorista1||'—'}</span></div>
        <div><span class="cg-rd-lbl">Origem</span><span class="cg-rd-val">${p.cidadeOrigem||'—'}/${p.ufOrigem||''}</span></div>
        <div><span class="cg-rd-lbl">Destino</span><span class="cg-rd-val">${p.cidadeDestino||'—'}/${p.ufDestino||''}</span></div>
      </div>

      ${p.observacaoPedido ? `<div style="margin:12px 0;padding:12px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.4);border-radius:10px;font-size:.88rem;color:#f59e0b"><strong>📝 Observação:</strong> <span style="color:inherit">${p.observacaoPedido}</span></div>` : ''}
      ${p.aprovado === false ? `<div style="margin:12px 0;padding:12px;border-radius:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35)">
        <div style="font-size:.85rem;margin-bottom:8px">⏳ Este pedido está <strong>aguardando aprovação</strong>. Aprove para liberá-lo ao planejamento.</div>
        <button class="btn btn-primary btn-sm" style="background:#22c55e" onclick="_aprovarPedidoComercial(${p.id})">✅ Aprovar pedido</button>
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
          <thead><tr><th>Rota</th><th>Corredor</th><th>Motorista</th><th>Pedidos</th><th>Concluída em</th></tr></thead>
          <tbody>
            ${concluidas.map(r => {
              const cor = (corredoresGlobais||[]).find(c => String(c.id)===String(r.corredor_id));
              const np = _veiculosNaRota(r.id).length;
              return `<tr class="cg-tr" onclick="_cgSelViagem(${r.id})">
                <td><strong>${r.nome||('R-'+r.id)}</strong></td>
                <td>${cor?cor.nome:'—'}</td>
                <td>${r.motorista_1||'—'}</td>
                <td>${np}</td>
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
              <td>${transbordou ? `<span style="color:#a855f7;font-size:.75rem">🔀 ${v.motivo_saida||'transbordado'}</span>` : _cgStatusPill(p)}</td>
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