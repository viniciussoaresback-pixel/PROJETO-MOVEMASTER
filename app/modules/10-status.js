/* ==========================================================================
   MODULE: 10-status.js
   Fluxo de status e validações
   Linhas originais: 4183-5386
   ========================================================================== */

// ============================================
// FLUXO DE STATUS DOS PEDIDOS
// ============================================

// Definição do fluxo por status atual
const FLUXO_STATUS = {
    'Pendente': {
        label: 'Pendente',
        cor: '#fbbf24',
        proximos: ['Intenção Agendada'],
        perfis: ['logistica', 'admin']
    },
    'Intenção Agendada': {
        label: 'Intenção Agendada',
        cor: '#60a5fa',
        proximos: ['Aguardando Confirmação'],
        perfis: ['logistica', 'admin']
    },
    'Aguardando Confirmação': {
        label: 'Aguardando Confirmação',
        cor: '#f97316',
        proximos: ['Em Coleta'],
        perfis: ['comercial', 'admin']
    },
    'Em Coleta': {
        label: 'Em Coleta',
        cor: '#a78bfa',
        proximos: ['Em Transporte', 'Transbordo'],
        perfis: ['logistica', 'admin']
    },
    'Em Transporte': {
        label: 'Em Transporte',
        cor: '#34d399',
        proximos: ['Entregue', 'Transbordo'],
        perfis: ['logistica', 'admin']
    },
    'Transbordo': {
        label: 'Transbordo',
        cor: '#fb923c',
        proximos: ['Intenção Agendada'],
        perfis: ['logistica', 'admin']
    },
    'Entregue': {
        label: 'Entregue',
        cor: '#4ade80',
        proximos: [],
        perfis: ['logistica', 'admin']
    }
};

// ============================================================
// STATUS ESTILO PLANILHA (#3) — preparação
// Lista fixa que o usuário altera livremente. Mapeada sobre os status
// internos para não quebrar faturamento/cobrança/equipes.
// _para_interno: como cada status planilha é guardado internamente.
// ============================================================
const STATUS_PLANILHA = {
  'Aguardando coleta': { cor:'#ef4444', interno:'Aguardando Confirmação' },
  'Não liberado':      { cor:'#a78bfa', interno:'Aguardando Confirmação' },
  'Enviado coleta':    { cor:'#eab308', interno:'Em Coleta' },
  'Coletado':          { cor:'#84cc16', interno:'Em Coleta' },
  'Em transporte':     { cor:'#34d399', interno:'Em Transporte' },
  'Transbordo':        { cor:'#fb923c', interno:'Transbordo' },
  'Ocorrência':        { cor:'#ef4444', interno:'Ocorrência' },
  'Entregue':          { cor:'#4ade80', interno:'Entregue' }
};
const STATUS_PLANILHA_LISTA = Object.keys(STATUS_PLANILHA);

// Status planilha "visível" a partir do estado real do pedido.
// Guarda o rótulo escolhido em p.statusPlanilha (coluna status_planilha);
// se não houver, deduz do status interno.
// Item 8 — a data do pedido considerada em todo o sistema é a do LANÇAMENTO (criação real).
// Usa created_at (data real em que foi lançado); cai para data_solicitacao se não houver.
function _dataLancamento(p){
  if (!p) return null;
  return p.createdAt || p.created_at || p.dataSolicitacao || p.data_solicitacao || null;
}
function _dataLancamentoFmt(p){
  const d = _dataLancamento(p);
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch(e){ return String(d); }
}

function statusPlanilhaDoPedido(p){
  if (!p) return 'Aguardando coleta';
  if (p.statusPlanilha && STATUS_PLANILHA[p.statusPlanilha]) return p.statusPlanilha;
  // dedução a partir do interno
  const st = p.status || 'Pendente';
  if (st === 'Entregue') return 'Entregue';
  if (st === 'Em Transporte') return 'Em transporte';
  if (st === 'Transbordo') return 'Transbordo';
  if (st === 'Em Coleta') return p.patioAtual ? 'Coletado' : 'Enviado coleta';
  return 'Aguardando coleta';
}

// Dropdown de status estilo planilha — altera em qualquer tela, sem ordem obrigatória
function statusDropdownHTML(p){
  // Princípio 2: o status é SOMENTE LEITURA nas telas de consulta.
  // Quem muda o status são os EVENTOS (ações na tela de Viagens em Andamento).
  // Mantém a etiqueta colorida consistente em todo o sistema.
  return _statusPillPlanilha(p);
}

// Aplica a mudança de status planilha: grava o rótulo + reflete no status interno
// Ordem oficial dos status planilha (para detectar pulos)
const STATUS_PLANILHA_ORDEM = ['Aguardando coleta','Não liberado','Enviado coleta','Coletado','Em transporte','Transbordo','Entregue'];
// Etapas que geram DADO de auditoria e que, se puladas, precisam ser preenchidas
const STATUS_ETAPAS_DADOS = ['Coletado','Em transporte'];

async function mudarStatusPlanilha(pedidoId, novoRotulo){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p || !STATUS_PLANILHA[novoRotulo]) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['logistica','admin','comercial'].includes(perfil)){ alert('Você não tem permissão para alterar o status.'); renderizarAcompanhamento(); return; }
  const rotuloAntes = statusPlanilhaDoPedido(p);

  // Transbordo tem fluxo próprio: escolher pátio → sugerir/escolher corredor da próxima perna
  if (novoRotulo === 'Transbordo'){
    _abrirModalTransbordoStatus(pedidoId, rotuloAntes);
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    return;
  }

  // Detecta pulo: se avança mais de 1 etapa para frente, cobra os dados intermediários
  const iAntes = STATUS_PLANILHA_ORDEM.indexOf(rotuloAntes);
  const iNovo = STATUS_PLANILHA_ORDEM.indexOf(novoRotulo);
  const saltou = (iNovo - iAntes) > 1;
  const etapasCobrar = saltou ? STATUS_PLANILHA_ORDEM.slice(iAntes+1, iNovo+1).filter(s => STATUS_ETAPAS_DADOS.includes(s)) : [];

  if (etapasCobrar.length > 0){
    // Abre o modal de cobrança de dados das etapas puladas
    _abrirModalPuloEtapas(pedidoId, rotuloAntes, novoRotulo, etapasCobrar);
    // reverte o dropdown visualmente até confirmar
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    return;
  }

  await _aplicarStatusPlanilha(pedidoId, novoRotulo, rotuloAntes, perfil, '✏️ status alterado');
}

// Aplica de fato a mudança de status (usado direto ou após preencher o pulo)
async function _aplicarStatusPlanilha(pedidoId, novoRotulo, rotuloAntes, perfil, obs){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const interno = STATUS_PLANILHA[novoRotulo].interno;
  try {
    await supabase.from('pedidos').update({ status: interno, status_planilha: novoRotulo }).eq('id', parseInt(pedidoId));
    p.status = interno; p.statusPlanilha = novoRotulo;
    try {
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: rotuloAntes,
        status_novo: novoRotulo,
        usuario_nome: document.getElementById('usuarioLogado')?.textContent || '',
        usuario_perfil: perfil,
        observacao: obs || '✏️ status alterado'
      });
    } catch(_){}
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
    if (typeof renderizarPainelCorredores === 'function') renderizarPainelCorredores();

    // Se marcou Entregue e ERA o último carro da rota, sugere concluir (opção B — só sugere, nunca automático)
    if (novoRotulo === 'Entregue'){
      const rotaId = p.rotaId || p.rota_id;
      if (rotaId){
        const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
        if (rota && rota.status !== 'concluida' && rota.status !== 'cancelada'){
          // Carros em Transbordo "saíram" desta rota (seguem a jornada em outra perna/caminhão),
          // então NÃO contam para a conclusão. Só contam os que ainda pertencem a esta perna.
          const carrosRota = (pedidosGlobais||[]).filter(x =>
            String(x.rotaId||x.rota_id)===String(rotaId) &&
            x.status !== 'Cancelado' && x.status !== 'Transbordo');
          const todosEntregues = carrosRota.length > 0 && carrosRota.every(x => (x.status||'') === 'Entregue');
          if (todosEntregues){
            const qtdTransb = (pedidosGlobais||[]).filter(x =>
              String(x.rotaId||x.rota_id)===String(rotaId) && x.status === 'Transbordo').length;
            const avisoTransb = qtdTransb > 0 ? `\n\n(${qtdTransb} carro(s) fizeram transbordo e seguem em outra perna — não dependem desta rota.)` : '';
            setTimeout(() => {
              if (confirm(`✅ Todos os ${carrosRota.length} carro(s) desta perna foram entregues.\n\nDeseja CONCLUIR a rota "${rota.nome||('#'+rota.id)}"?${avisoTransb}\n\n(Se ainda vai adicionar mais carros, clique em Cancelar e conclua depois.)`)){
                mudarStatusRota(rotaId, 'concluida');
              }
            }, 300);
          }
        }
      }
    }
  } catch(e){
    alert('Erro ao alterar status: ' + (e.message||e));
    if (typeof renderizarAcompanhamento === 'function') renderizarAcompanhamento();
  }
}

// Voltar 1 etapa (desfazer) — volta ao status imediatamente anterior na ordem
async function voltarUmaEtapa(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  if (!['logistica','admin','comercial'].includes(perfil)){ alert('Sem permissão.'); return; }
  const atual = statusPlanilhaDoPedido(p);
  const i = STATUS_PLANILHA_ORDEM.indexOf(atual);
  if (i <= 0){ alert('Já está na primeira etapa — não há para onde voltar.'); return; }
  const anterior = STATUS_PLANILHA_ORDEM[i-1];
  if (!confirm(`↩️ Voltar o pedido #${pedidoId} de "${atual}" para "${anterior}"?`)) return;
  await _aplicarStatusPlanilha(pedidoId, anterior, atual, perfil, '↩️ voltou 1 etapa (correção)');
}

// Modal que cobra os dados das etapas puladas (obrigatório)
function _abrirModalPuloEtapas(pedidoId, rotuloAntes, novoRotulo, etapas){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  const temTransbordo = !!p.cidadeTransbordo;
  const old = document.getElementById('modalPulo'); if (old) old.remove();
  const hoje = new Date().toISOString().slice(0,10);
  const campoEtapa = (et) => {
    if (et === 'Coletado'){
      return `<div class="pulo-etapa">
        <div class="pulo-etapa-tit">📥 Coletado</div>
        <label>Quem coletou?</label>
        <select id="puloColetaQuem">
          <option value="">Selecione...</option>
          <option value="equipe">Equipe de coleta</option>
          <option value="motorista">Motorista (direto)</option>
          <option value="cliente">Cliente levou ao pátio</option>
        </select>
        <label>Quando?</label>
        <input type="date" id="puloColetaData" value="${hoje}">
      </div>`;
    }
    if (et === 'Em transporte'){
      const cegonhas = (veiculosGlobais||[]).filter(v => (v.tipo==='cegonha'||v.categoria==='cegonha'||(v.capacidade||0)>1));
      return `<div class="pulo-etapa">
        <div class="pulo-etapa-tit">🚛 Em transporte</div>
        <label>Qual cegonha transportou?</label>
        <select id="puloTranspCegonha">
          <option value="">Selecione...</option>
          ${p.placaCegonha?`<option value="${p.placaCegonha}" selected>${p.placaCegonha} (atual)</option>`:''}
          ${cegonhas.filter(v=>v.placa!==p.placaCegonha).map(v=>`<option value="${v.placa}">${v.placa}${v.modelo?' · '+v.modelo:''}</option>`).join('')}
        </select>
        <label>Qual motorista?</label>
        <input type="text" id="puloTranspMotorista" value="${(p.motorista1||'').replace(/"/g,'&quot;')}" placeholder="Motorista" list="puloMotoristas">
        <datalist id="puloMotoristas">${(motoristasGlobais||[]).map(m=>`<option value="${m.nome||m}">`).join('')}</datalist>
        <label>Quando saiu?</label>
        <input type="date" id="puloTranspData" value="${hoje}">
      </div>`;
    }
    return '';
  };
  const div = document.createElement('div');
  div.id = 'modalPulo';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div class="modal-box" style="background:var(--surface-1,#1a1c20);max-width:520px;width:94%;max-height:88vh;overflow:auto;border-radius:14px;padding:22px">
      <h2 style="margin:0 0 6px">⚠️ Você pulou etapas</h2>
      <p class="text-muted" style="font-size:.86rem;margin:.2rem 0 1rem">De <strong>${rotuloAntes}</strong> para <strong>${novoRotulo}</strong>. Para a conferência ficar correta (inclusive o valor do motorista), registre o que realmente aconteceu nas etapas puladas:</p>
      ${temTransbordo ? `<div class="pulo-transbordo-aviso">🔁 Este carro tem <strong>transbordo em ${p.cidadeTransbordo}</strong>. Depois de registrar, confira as pernas (motorista/cegonha de cada trecho) na tela de <strong>🛣️ Trechos</strong> — é de lá que sai o valor por perna.</div>` : ''}
      ${etapas.map(campoEtapa).join('')}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" style="flex:1" onclick="_confirmarPuloEtapas(${pedidoId}, '${rotuloAntes.replace(/'/g,"\\'")}', '${novoRotulo.replace(/'/g,"\\'")}', ${JSON.stringify(etapas).replace(/"/g,'&quot;')})">✅ Registrar e aplicar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('modalPulo').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

async function _confirmarPuloEtapas(pedidoId, rotuloAntes, novoRotulo, etapas){
  const perfil = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : null;
  const usuario = document.getElementById('usuarioLogado')?.textContent || '';
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;
  // valida obrigatórios
  const registros = [];
  if (etapas.includes('Coletado')){
    const quem = document.getElementById('puloColetaQuem')?.value;
    const data = document.getElementById('puloColetaData')?.value;
    if (!quem || !data){ alert('Preencha quem coletou e quando.'); return; }
    const label = quem==='equipe'?'equipe de coleta':(quem==='motorista'?'motorista (direto)':'cliente levou ao pátio');
    registros.push({ etapa:'Coletado', obs:`📥 Coletado por ${label} em ${new Date(data+'T12:00').toLocaleDateString('pt-BR')} (registrado retroativamente)` });
  }
  if (etapas.includes('Em transporte')){
    const cegonha = document.getElementById('puloTranspCegonha')?.value;
    const mot = document.getElementById('puloTranspMotorista')?.value.trim();
    const data = document.getElementById('puloTranspData')?.value;
    if (!cegonha || !mot || !data){ alert('Preencha cegonha, motorista e data do transporte.'); return; }
    registros.push({ etapa:'Em transporte', obs:`🚛 Transportado por ${cegonha} / ${mot} desde ${new Date(data+'T12:00').toLocaleDateString('pt-BR')} (registrado retroativamente)` });
    // atualiza cegonha/motorista do pedido se não tinha
    try {
      const upd = {};
      if (!p.placaCegonha) upd.placa_cegonha = cegonha;
      if (!p.motorista1) upd.motorista_1 = mot;
      if (Object.keys(upd).length){ await supabase.from('pedidos').update(upd).eq('id', parseInt(pedidoId));
        if (upd.placa_cegonha) p.placaCegonha = cegonha; if (upd.motorista_1) p.motorista1 = mot; }
    } catch(_){}
  }
  // grava cada etapa pulada no histórico (a verdade da auditoria)
  for (const r of registros){
    try {
      await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: rotuloAntes,
        status_novo: r.etapa,
        usuario_nome: usuario, usuario_perfil: perfil,
        observacao: r.obs
      });
    } catch(_){}
  }
  document.getElementById('modalPulo')?.remove();
  // aplica o status final
  await _aplicarStatusPlanilha(pedidoId, novoRotulo, registros.length?registros[registros.length-1].etapa:rotuloAntes, perfil, `⏩ avançou para ${novoRotulo} (etapas puladas registradas)`);
}



const ORDEM_STATUS = [
    'Pendente',
    'Intenção Agendada',
    'Aguardando Confirmação',
    'Em Coleta',
    'Em Transporte',
    'Entregue'
];

function abrirModalStatus(pedidoId) {
    _statusGrupoIds = []; // avanço individual não é lote
    const pedido = pedidosGlobais.find(p => String(p.id) === String(pedidoId));
    if (!pedido) return;

    const statusAtual = pedido.status || 'Pendente';
    const config = FLUXO_STATUS[statusAtual];
    if (!config) return;

    // Verificar permissão
    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin';
    const temPermissao = config.perfis.includes(perfilUsuario);
    if (!temPermissao) {
        alert('Seu perfil não tem permissão para alterar este status.');
        return;
    }

    document.getElementById('statusPedidoId').value = pedidoId;
    document.getElementById('statusAtual').value = statusAtual;

    // Resumo do pedido
    const _podeReverter = (typeof podeAlocarOuTransbordar === 'function' && podeAlocarOuTransbordar())
        && pedido.placaCegonha
        && ['Intenção Agendada','Aguardando Confirmação'].includes(statusAtual);
    document.getElementById('modalStatusResumo').innerHTML = `
        <div class="status-resumo-info">
            <span><strong>#${pedido.id}</strong> — ${pedido.cliente || '—'}</span>
            ${pedido.origemLancamento ? `<span class="status-origem-inline" title="Quem lançou o pedido">📝 ${(typeof NOMES_PERFIL!=='undefined' && NOMES_PERFIL[pedido.origemLancamento]) || pedido.origemLancamento}${pedido.criadoPorNome ? ' · '+pedido.criadoPorNome : ''}</span>` : ''}
            <span>${pedido.cidadeOrigem || ''}/${pedido.ufOrigem || ''} → ${pedido.cidadeDestino || ''}/${pedido.ufDestino || ''}</span>
            <span class="status-badge-inline" style="background:${config.cor}20;color:${config.cor};border:1px solid ${config.cor}40">
                ${statusAtual}
            </span>
            ${pedido.placaCegonha ? `<span class="status-cegonha-inline">🚛 ${pedido.placaCegonha}</span>` : ''}
            ${pedido.etaReprogramado ? `<span class="tag-eta tag-${pedido.statusReprogramacao==='atrasado'?'vermelho':'amarelo'}" title="ETA reprogramado no transbordo">${pedido.statusReprogramacao==='atrasado'?'🔴':'🟡'} ETA ${new Date(pedido.etaReprogramado).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>` : ''}
            ${_podeReverter ? `<button type="button" class="btn btn-sm btn-reverter" onclick="desalocarPedido(${pedido.id})" title="Remove a cegonha e devolve o pedido para a fila">↩️ Desalocar</button>` : ''}
        </div>
    `;

    // Fluxo visual de etapas
    const flowEl = document.getElementById('statusFlow');
    flowEl.innerHTML = ORDEM_STATUS.map((s, i) => {
        const idx = ORDEM_STATUS.indexOf(statusAtual);
        const isAtual = s === statusAtual;
        const isPast = i < idx;
        const cls = isAtual ? 'flow-step atual' : isPast ? 'flow-step passado' : 'flow-step futuro';
        return `<div class="${cls}">
            <div class="flow-dot"></div>
            <span>${s}</span>
        </div>`;
    }).join('<div class="flow-linha"></div>');

    // Botões de ação
    const btnsEl = document.getElementById('statusAcoesBtns');
    if (config.proximos.length === 0) {
        btnsEl.innerHTML = '<p class="text-muted text-center">Pedido finalizado. Nenhuma ação disponível.</p>';
    } else {
        btnsEl.innerHTML = config.proximos.map(proximo => `
            <button type="button" class="btn btn-status" 
                style="border-color:${FLUXO_STATUS[proximo]?.cor || '#fff'}40;color:${FLUXO_STATUS[proximo]?.cor || '#fff'}"
                onclick="selecionarProximoStatus('${proximo}')">
                → ${proximo}
            </button>
        `).join('');
    }

    // Resetar campos opcionais
    document.getElementById('grupoObservacao').style.display = 'none';
    document.getElementById('grupoCidadeTransbordo').style.display = 'none';
    document.getElementById('statusObservacao').value = '';
    document.getElementById('statusNovo').value = '';
    document.getElementById('mensagemStatus').className = 'message';

    document.getElementById('modalStatus').classList.add('show');
}

function selecionarProximoStatus(novoStatus) {
    document.getElementById('statusNovo').value = novoStatus;

    // Resetar visual dos botões
    document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('btn-status-selecionado'));
    const btnSelecionado = [...document.querySelectorAll('.btn-status')].find(b => b.textContent.includes(novoStatus));
    if (btnSelecionado) btnSelecionado.classList.add('btn-status-selecionado');

    // Mostrar campos extras conforme status
    const grupoObs = document.getElementById('grupoObservacao');
    const grupoTransbordo = document.getElementById('grupoCidadeTransbordo');
    const grupoTipoTransb = document.getElementById('grupoTipoTransbordo');
    const grupoCegonhaDest = document.getElementById('grupoCegonhaDestino');
    const grupoChecklist = document.getElementById('grupoChecklistVerif');
    const statusAtualVal = document.getElementById('statusAtual').value;

    // Reset
    grupoTipoTransb.style.display = 'none';
    grupoCegonhaDest.style.display = 'none';
    grupoChecklist.style.display = 'none';
    const _grupoReprog = document.getElementById('grupoReprogTransbordo');
    if (_grupoReprog) _grupoReprog.style.display = 'none';
    const chkVerif = document.getElementById('checklistVerificado');
    if (chkVerif) chkVerif.checked = false;

    if (novoStatus === 'Transbordo') {
        // Transbordo exige: tipo (pátio/caminhão) + checklist verificado
        grupoObs.style.display = 'block';
        grupoTipoTransb.style.display = 'block';
        grupoChecklist.style.display = 'block';
        if (_grupoReprog) _grupoReprog.style.display = 'block';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Motivo do Transbordo';
        ajustarCamposTransbordo(); // decide pátio vs cegonha destino
    } else if (novoStatus === 'Entregue') {
        // Entrega ao cliente exige checklist verificado
        grupoObs.style.display = 'block';
        grupoTransbordo.style.display = 'none';
        grupoChecklist.style.display = 'block';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Observação da entrega';
    } else if (novoStatus === 'Intenção Agendada' && statusAtualVal === 'Transbordo') {
        grupoObs.style.display = 'block';
        grupoTransbordo.style.display = 'none';
        document.getElementById('grupoObservacao').querySelector('label').textContent = 'Observação';
    } else {
        grupoObs.style.display = 'none';
        grupoTransbordo.style.display = 'none';
    }

    // Mostrar botão de confirmar
    const btnsEl = document.getElementById('statusAcoesBtns');
    const jaTemConfirmar = btnsEl.querySelector('.btn-confirmar-status');
    if (!jaTemConfirmar) {
        const btnConfirmar = document.createElement('button');
        btnConfirmar.type = 'button';
        btnConfirmar.className = 'btn btn-primary btn-confirmar-status';
        btnConfirmar.textContent = 'Confirmar';
        btnConfirmar.onclick = confirmarMudancaStatus;
        btnsEl.appendChild(btnConfirmar);
    }
}

// Alterna os campos do transbordo entre PÁTIO e CAMINHÃO→CAMINHÃO
function ajustarCamposTransbordo() {
    const tipo = document.querySelector('input[name="tipoTransbordo"]:checked')?.value || 'patio';
    const grupoPatio = document.getElementById('grupoCidadeTransbordo');
    const grupoCegonha = document.getElementById('grupoCegonhaDestino');

    if (tipo === 'patio') {
        grupoPatio.style.display = 'block';
        grupoCegonha.style.display = 'none';
    } else {
        grupoPatio.style.display = 'none';
        grupoCegonha.style.display = 'block';
        // Popular cegonhas disponíveis (exceto a atual do pedido)
        const pedidoId = document.getElementById('statusPedidoId').value;
        const p = pedidosGlobais.find(x => String(x.id) === String(pedidoId));
        const sel = document.getElementById('cegonhaDestinoTransbordo');
        const cegonhas = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
            .map(v => v.placa).filter(Boolean);
        // fallback: cegonhas já usadas em pedidos
        const usadas = [...new Set(pedidosGlobais.map(x => x.placaCegonha).filter(Boolean))];
        const todas = [...new Set([...cegonhas, ...usadas])].filter(c => c !== p?.placaCegonha).sort();
        sel.innerHTML = '<option value="">Selecione a cegonha...</option>' +
            todas.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

// ============================================
// AVANÇAR STATUS EM LOTE (carga fechada)
// _statusGrupoIds guarda os pedidos que devem avançar juntos.
// O caminho individual continua intacto; o lote reaproveita a mesma lógica.
// ============================================
let _statusGrupoIds = [];

// Aplica UM avanço de status a um pedido, replicando o núcleo do fluxo
// (atualização, histórico, manifesto e notificação). Usado só no lote.
async function _aplicarStatusEmPedidoLote(pedidoObj, d) {
    const pedidoId = pedidoObj.id;
    const atualizacao = { status: d.statusNovo };
    let saidaPatioObs = '';

    if (d.statusAnterior === 'Intenção Agendada' && d.statusNovo === 'Aguardando Confirmação') {
        atualizacao.confirmacao_logistica_em = new Date().toISOString();
        atualizacao.confirmacao_logistica_por = d.usuarioNome;
    }
    if (d.statusAnterior === 'Aguardando Confirmação' && d.statusNovo === 'Em Coleta') {
        atualizacao.confirmacao_comercial_em = new Date().toISOString();
        atualizacao.confirmacao_comercial_por = d.usuarioNome;
    }
    if (d.statusNovo === 'Transbordo') {
        // guarda a rota de origem ANTES de zerar, para preservar o vínculo histórico
        atualizacao._rotaOrigemTransbordo = pedidoObj.rotaId || pedidoObj.rota_id || null;
        // incrementa a contagem de transbordos (jornada com múltiplas pernas)
        atualizacao.qtd_transbordos = (pedidoObj.qtdTransbordos || pedidoObj.qtd_transbordos || 0) + 1;
        // flag para o pedido aparecer na área "Aguardando Transbordo" (não em "sem rota")
        atualizacao.aguardando_transbordo = true;
        if (d.tipoTransbordo === 'patio') {
            atualizacao.cidade_transbordo = d.cidadeTransbordo;
            atualizacao.transbordo_em = new Date().toISOString();
            atualizacao.patio_atual = d.cidadeTransbordo;
            atualizacao.patio_desde = atualizacao.transbordo_em;
            atualizacao.placa_cegonha = null;
            atualizacao.motorista_1 = null; atualizacao.motorista_2 = null;
            atualizacao.percent_motorista_1 = null; atualizacao.percent_motorista_2 = null;
            // Perna 1 concluída: sai do corredor/rota antigos e renasce no pátio (perna 2)
            atualizacao.rota_id = null;
            atualizacao.corredor_manual_id = null;
        } else {
            atualizacao.cidade_transbordo = `Cegonha ${d.cegonhaDestino}`;
            atualizacao.transbordo_em = new Date().toISOString();
            atualizacao.placa_cegonha = d.cegonhaDestino;
            atualizacao.motorista_1 = null; atualizacao.motorista_2 = null;
            atualizacao.percent_motorista_1 = null; atualizacao.percent_motorista_2 = null;
            atualizacao.patio_atual = null; atualizacao.patio_desde = null;
        }
    }
    if (['Em Transporte', 'Entregue'].includes(d.statusNovo) && pedidoObj.patioAtual) {
        atualizacao.patio_atual = null; atualizacao.patio_desde = null;
        saidaPatioObs = ` — 📤 Saiu do pátio de ${pedidoObj.patioAtual}`;
    }

    // extrai o campo auxiliar (não é coluna do banco)
    const _rotaOrigemTransbordo = atualizacao._rotaOrigemTransbordo;
    delete atualizacao._rotaOrigemTransbordo;

    const { error: errPedido } = await supabase.from('pedidos').update(atualizacao).eq('id', pedidoId);
    if (errPedido) throw errPedido;

    // Transbordo: preserva o vínculo histórico (marca saída, NÃO apaga) da viagem de origem
    if (d.statusNovo === 'Transbordo' && _rotaOrigemTransbordo){
        await _marcarSaidaTransbordo(_rotaOrigemTransbordo, pedidoId, `transbordo em ${d.cidadeTransbordo || d.cegonhaDestino || ''}`, d.cidadeTransbordo || null);
    }

    let descTransbordo = '';
    if (d.statusNovo === 'Transbordo') {
        descTransbordo = d.tipoTransbordo === 'patio'
            ? `Transbordo para pátio de ${d.cidadeTransbordo}`
            : `Transbordo caminhão → caminhão (nova cegonha ${d.cegonhaDestino})`;
    }
    const seloChecklist = (d.statusNovo === 'Entregue' || d.statusNovo === 'Transbordo') ? ' [✅ checklist verificado]' : '';
    const obsCompleta = ((d.statusNovo === 'Transbordo'
        ? `${descTransbordo}${d.observacao ? ' — ' + d.observacao : ''}`
        : (d.observacao || '')) + saidaPatioObs + seloChecklist).trim() || null;

    await supabase.from('historico_status').insert({
        pedido_id: parseInt(pedidoId),
        status_anterior: d.statusAnterior,
        status_novo: d.statusNovo,
        usuario_nome: d.usuarioNome,
        usuario_perfil: d.perfilUsuario,
        observacao: obsCompleta
    });

    try {
        if (d.statusNovo === 'Em Coleta' && pedidoObj.placaCegonha) {
            await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'coleta', +1);
        } else if (d.statusNovo === 'Entregue') {
            if (pedidoObj.placaCegonha) await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'entrega', -1);
        } else if (d.statusNovo === 'Transbordo') {
            if (pedidoObj.placaCegonha) await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'transbordo_saida', -1);
            if (d.tipoTransbordo === 'caminhao' && d.cegonhaDestino) await registrarEventoManifesto(d.cegonhaDestino, pedidoObj, 'transbordo_entrada', +1);
        }
    } catch (e) { console.warn('Manifesto (lote) não atualizado:', e.message); }

    if (d.statusNovo === 'Transbordo') { await _registrarTrechosTransbordo(pedidoObj, d); }

    try { notificarMudancaStatus(pedidoObj, d.statusAnterior, d.statusNovo); } catch (e) {}
    if (d.statusNovo === 'Em Transporte') { try { await dispararPDFFiscal(pedidoId); } catch (e) {} }
}

// PARTE 1 do Financeiro · No transbordo, fecha a perna do motorista atual
// (origem → transbordo) e abre a próxima (transbordo → destino), redividindo
// o frete por km. Isso alimenta o faturamento por motorista/caminhão.
// É blindado: qualquer falha aqui não interrompe a mudança de status.
async function _registrarTrechosTransbordo(pedidoObj, d) {
    if (!supabase || d.statusNovo !== 'Transbordo') return;
    try {
        const pid = parseInt(pedidoObj.id);
        const freteTotal = Number(pedidoObj.valorFrete) || 0;
        const cidadeTransb = d.tipoTransbordo === 'patio'
            ? d.cidadeTransbordo
            : `Cegonha ${d.cegonhaDestino}`;
        const origemPedido = `${pedidoObj.cidadeOrigem || ''}/${pedidoObj.ufOrigem || ''}`;
        const destinoFinal = `${pedidoObj.cidadeDestino || ''}/${pedidoObj.ufDestino || ''}`;

        let { data: existentes } = await supabase.from('pedido_trechos')
            .select('*').eq('pedido_id', pid).order('ordem', { ascending: true });
        existentes = existentes || [];

        let trechos;
        if (existentes.length === 0) {
            // Semeia a perna já executada com quem estava tocando o carro
            trechos = [{
                origem: origemPedido, destino: cidadeTransb,
                motorista: pedidoObj.motorista1 || '', placa_cegonha: pedidoObj.placaCegonha || '', km: 0
            }];
        } else {
            trechos = existentes.map(r => ({
                origem: [r.origem_cidade, r.origem_uf].filter(Boolean).join('/'),
                destino: [r.destino_cidade, r.destino_uf].filter(Boolean).join('/'),
                motorista: r.motorista_nome || '', placa_cegonha: r.placa_cegonha || '', km: Number(r.km) || 0
            }));
            // Fecha a última perna no ponto do transbordo, atribuindo ao executor atual
            const ult = trechos[trechos.length - 1];
            ult.destino = cidadeTransb;
            if (!ult.motorista) ult.motorista = pedidoObj.motorista1 || '';
            if (!ult.placa_cegonha) ult.placa_cegonha = pedidoObj.placaCegonha || '';
        }

        // Abre a próxima perna (transbordo → destino final)
        // No transbordo caminhão→caminhão, já atribui o motorista padrão da cegonha B,
        // para o rateio do faturamento sair completo (motorista A/cegonha A + motorista B/cegonha B).
        const motoristaCegonhaB = d.tipoTransbordo === 'caminhao'
            ? ((veiculosGlobais || []).find(v => v.placa === d.cegonhaDestino)?.motorista_padrao || '')
            : '';
        trechos.push({
            origem: cidadeTransb, destino: destinoFinal,
            motorista: motoristaCegonhaB, // cegonha B: motorista padrão; pátio: A DEFINIR
            placa_cegonha: d.tipoTransbordo === 'caminhao' ? (d.cegonhaDestino || '') : '',
            km: 0
        });

        // Redistribui o frete por km (km 0 → divisão igual até preencher)
        const valores = _alocDividirPorKm(Math.round(freteTotal * 100), trechos);
        const linhas = trechos.map((t, i) => {
            const [oc, ou] = (t.origem || '').split('/');
            const [dc, du] = (t.destino || '').split('/');
            return {
                pedido_id: pid, ordem: i + 1,
                origem_cidade: (oc || '').trim() || null, origem_uf: (ou || '').trim() || null,
                destino_cidade: (dc || '').trim() || null, destino_uf: (du || '').trim() || null,
                motorista_nome: t.motorista || null, placa_cegonha: t.placa_cegonha || null,
                km: Number(t.km) || 0, valor_frete: (valores[i] || 0) / 100, status: 'pendente'
            };
        });
        await supabase.from('pedido_trechos').delete().eq('pedido_id', pid);
        if (linhas.length) await supabase.from('pedido_trechos').insert(linhas);
    } catch (e) {
        console.warn('Trecho de transbordo não registrado:', e.message);
    }
}

// Abre a janela de status já preparada para avançar a carga fechada inteira.
function abrirModalStatusGrupo(grupoId) {
    const membros = pedidosGlobais.filter(p => String(p.grupoId) === String(grupoId));
    if (membros.length === 0) return;

    // Status predominante do grupo (o mais comum entre os carros)
    const cont = {};
    membros.forEach(m => { const s = m.status || 'Pendente'; cont[s] = (cont[s] || 0) + 1; });
    const statusPred = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
    const doStatus = membros.filter(m => (m.status || 'Pendente') === statusPred);

    const config = FLUXO_STATUS[statusPred];
    if (!config || !config.proximos || config.proximos.length === 0) {
        alert('Esta carga já está finalizada neste status — não há próximo passo.');
        return;
    }

    // Reaproveita a janela normal (constrói UI, valida permissão) no 1º carro do passo
    abrirModalStatus(doStatus[0].id);
    // abrirModalStatus zera _statusGrupoIds; agora marcamos o lote:
    _statusGrupoIds = doStatus.map(m => m.id);

    const resumo = document.getElementById('modalStatusResumo');
    if (resumo) {
        const fora = membros.length - doStatus.length;
        resumo.insertAdjacentHTML('afterbegin',
            `<div class="lote-aviso">⏩ Avançando <strong>${doStatus.length} carros</strong> de múltiplos veículos juntos${fora ? ` · ${fora} em outro status ficam de fora` : ''}.</div>`);
    }
}

async function confirmarMudancaStatus() {
    const pedidoId = document.getElementById('statusPedidoId').value;
    const statusAnterior = document.getElementById('statusAtual').value;
    const statusNovo = document.getElementById('statusNovo').value;
    const observacao = document.getElementById('statusObservacao').value.trim();
    let cidadeTransbordo = document.getElementById('cidadeTransbordo').value.trim();
    if (cidadeTransbordo === '__outro') {
        cidadeTransbordo = document.getElementById('cidadeTransbordoOutra').value.trim();
    }
    const msgEl = document.getElementById('mensagemStatus');

    // Tipo de transbordo e cegonha destino (caminhão→caminhão)
    const tipoTransbordo = document.querySelector('input[name="tipoTransbordo"]:checked')?.value || 'patio';
    const cegonhaDestino = document.getElementById('cegonhaDestinoTransbordo')?.value || '';
    const checklistVerificado = document.getElementById('checklistVerificado')?.checked || false;
    const motivoTransbordo = document.getElementById('motivoTransbordo')?.value || 'planejado';
    const novoEtaTransbordoRaw = document.getElementById('novoEtaTransbordo')?.value || null;

    if (!statusNovo) {
        msgEl.textContent = 'Selecione o próximo status.';
        msgEl.className = 'message show error';
        return;
    }

    // ITEM 2 — Definição de Transbordo é exclusiva da Logística
    if (statusNovo === 'Transbordo' && !podeAlocarOuTransbordar()) {
        msgEl.textContent = 'Apenas o Setor de Logística pode definir transbordo.';
        msgEl.className = 'message show error';
        return;
    }

    // Transbordo: valida conforme o tipo
    if (statusNovo === 'Transbordo') {
        if (tipoTransbordo === 'patio' && !cidadeTransbordo) {
            msgEl.textContent = 'Selecione o pátio do transbordo.';
            msgEl.className = 'message show error';
            return;
        }
        if (tipoTransbordo === 'caminhao' && !cegonhaDestino) {
            msgEl.textContent = 'Selecione a cegonha de destino do transbordo.';
            msgEl.className = 'message show error';
            return;
        }
    }

    // Checklist do motorista: obrigatório na ENTREGA e em TODO TRANSBORDO
    if ((statusNovo === 'Entregue' || statusNovo === 'Transbordo') && !checklistVerificado) {
        msgEl.textContent = '✅ Confirme que verificou o checklist do motorista na plataforma da empresa antes de concluir.';
        msgEl.className = 'message show error';
        return;
    }

    const perfilUsuario = typeof perfilAtual !== 'undefined' ? perfilAtual : 'admin';
    const usuarioNome = document.getElementById('usuarioLogado')?.textContent || 'Sistema';

    try {
        const pedidoObj = pedidosGlobais.find(p => String(p.id) === String(pedidoId));

        // ============ GATES DO FLUXO DE CONFIRMAÇÃO ============
        // Checkpoint 1 (logística, até 4h antes da coleta): confirmar a intenção
        // exige caminhão E motorista definidos — bloqueia até estar completo.
        if (statusAnterior === 'Intenção Agendada' && statusNovo === 'Aguardando Confirmação') {
            if (!pedidoObj?.placaCegonha) {
                msgEl.textContent = '🚛 Caminhão ainda A DEFINIR. Aloque o pedido em uma cegonha antes de confirmar a intenção.';
                msgEl.className = 'message show error';
                return;
            }
            if (!pedidoObj?.motorista1) {
                msgEl.textContent = '👤 Motorista ainda A DEFINIR. Defina o motorista da cegonha antes de confirmar a intenção.';
                msgEl.className = 'message show error';
                return;
            }
        }

        // 1. Atualizar status no pedido
        const atualizacao = { status: statusNovo };
        let saidaPatioObs = '';

        // Carimbo do checkpoint 1: confirmação da logística
        if (statusAnterior === 'Intenção Agendada' && statusNovo === 'Aguardando Confirmação') {
            atualizacao.confirmacao_logistica_em = new Date().toISOString();
            atualizacao.confirmacao_logistica_por = usuarioNome;
        }
        // Carimbo do checkpoint 2: liberação do comercial para coleta
        if (statusAnterior === 'Aguardando Confirmação' && statusNovo === 'Em Coleta') {
            atualizacao.confirmacao_comercial_em = new Date().toISOString();
            atualizacao.confirmacao_comercial_por = usuarioNome;
        }

        if (statusNovo === 'Transbordo') {
            if (tipoTransbordo === 'patio') {
                // Caminhão → Pátio: carro fica no pátio, cegonha segue
                atualizacao.cidade_transbordo = cidadeTransbordo;
                atualizacao.transbordo_em = new Date().toISOString();
                atualizacao.patio_atual = cidadeTransbordo;
                atualizacao.patio_desde = atualizacao.transbordo_em;
                atualizacao.placa_cegonha = null;
                atualizacao.motorista_1 = null;
                atualizacao.motorista_2 = null;
                atualizacao.percent_motorista_1 = null;
                atualizacao.percent_motorista_2 = null;
                // Perna 1 concluída: sai do corredor/rota antigos e renasce no pátio (perna 2)
                atualizacao.rota_id = null;
                atualizacao.corredor_manual_id = null;
            } else {
                // Caminhão → Caminhão: passa direto para a nova cegonha, sem pátio
                atualizacao.cidade_transbordo = `Cegonha ${cegonhaDestino}`;
                atualizacao.transbordo_em = new Date().toISOString();
                atualizacao.placa_cegonha = cegonhaDestino;
                // motoristas da nova cegonha entram na próxima alocação/definição
                atualizacao.motorista_1 = null;
                atualizacao.motorista_2 = null;
                atualizacao.percent_motorista_1 = null;
                atualizacao.percent_motorista_2 = null;
                atualizacao.patio_atual = null;
                atualizacao.patio_desde = null;
            }
        }

        // Carro voltou a rodar (ou finalizou): sai do pátio automaticamente
        if (['Em Transporte', 'Entregue'].includes(statusNovo) && pedidoObj?.patioAtual) {
            atualizacao.patio_atual = null;
            atualizacao.patio_desde = null;
            saidaPatioObs = ` — 📤 Saiu do pátio de ${pedidoObj.patioAtual}`;
        }

        const { error: errPedido } = await supabase
            .from('pedidos')
            .update(atualizacao)
            .eq('id', pedidoId);
        if (errPedido) throw errPedido;

        // ITEM 17.3 — Reprogramação de ETA no transbordo.
        // Por padrão o ETA original é PRESERVADO (nada muda). Só recalcula se a
        // Logística digitou um novo ETA final. Aplica ao grupo (carga fechada) se houver.
        if (statusNovo === 'Transbordo' && novoEtaTransbordoRaw) {
            try {
                const novoEtaISO = new Date(novoEtaTransbordoRaw).toISOString();
                const atrasado = new Date(novoEtaISO).getTime() < Date.now();
                const patchReprog = {
                    eta_reprogramado: novoEtaISO,
                    status_reprogramacao: atrasado ? 'atrasado' : 'reprogramado'
                };
                const idsReprog = (_statusGrupoIds && _statusGrupoIds.length > 1)
                    ? _statusGrupoIds.map(x => parseInt(x)) : [parseInt(pedidoId)];
                await supabase.from('pedidos').update(patchReprog).in('id', idsReprog);
                // Avisa o Comercial
                if (typeof notificar === 'function') notificar({
                    perfil: 'comercial', tipo: 'alerta',
                    titulo: atrasado ? '🔴 Entrega atrasada (transbordo)' : '🟡 Entrega reprogramada (transbordo)',
                    mensagem: `Pedido #${pedidoId}: novo ETA ${new Date(novoEtaISO).toLocaleString('pt-BR')}`
                });
            } catch(e){ console.warn('Reprogramação de ETA não aplicada:', e.message); }
        }

        // 2. Registrar no histórico
        let descTransbordo = '';
        if (statusNovo === 'Transbordo') {
            descTransbordo = tipoTransbordo === 'patio'
                ? `Transbordo para pátio de ${cidadeTransbordo}`
                : `Transbordo caminhão → caminhão (nova cegonha ${cegonhaDestino})`;
        }
        const seloChecklist = (statusNovo === 'Entregue' || statusNovo === 'Transbordo')
            ? ' [✅ checklist verificado]' : '';
        const obsCompleta = ((statusNovo === 'Transbordo'
            ? `${descTransbordo}${observacao ? ' — ' + observacao : ''}`
            : (observacao || '')) + saidaPatioObs + seloChecklist).trim() || null;

        const { error: errHist } = await supabase
            .from('historico_status')
            .insert({
                pedido_id: parseInt(pedidoId),
                status_anterior: statusAnterior,
                status_novo: statusNovo,
                usuario_nome: usuarioNome,
                usuario_perfil: perfilUsuario,
                observacao: obsCompleta
            });
        if (errHist) console.warn('Histórico não salvo:', errHist.message);

        // 2b. MANIFESTO + APONTAMENTO FISCAL
        // Eventos que ALTERAM a quantidade de veículos na carga de um caminhão:
        //  • Em Coleta  → +1 no caminhão (carro embarca)
        //  • Entregue   → -1 (carro sai da carga)
        //  • Transbordo pátio    → -1 no caminhão de origem
        //  • Transbordo caminhão → -1 na origem e +1 no destino
        try {
            if (statusNovo === 'Em Coleta' && pedidoObj?.placaCegonha) {
                await registrarEventoManifesto(pedidoObj.placaCegonha, pedidoObj, 'coleta', +1);
            } else if (statusNovo === 'Entregue') {
                const cam = pedidoObj?.placaCegonha;
                if (cam) await registrarEventoManifesto(cam, pedidoObj, 'entrega', -1);
            } else if (statusNovo === 'Transbordo') {
                const camOrigem = pedidoObj?.placaCegonha;
                if (camOrigem) await registrarEventoManifesto(camOrigem, pedidoObj, 'transbordo_saida', -1);
                if (tipoTransbordo === 'caminhao' && cegonhaDestino) {
                    await registrarEventoManifesto(cegonhaDestino, pedidoObj, 'transbordo_entrada', +1);
                }
            }
        } catch (e) {
            console.warn('Manifesto/fiscal não atualizado:', e.message);
        }

        // Transbordo → registra as pernas (fecha a atual, abre a próxima) p/ faturamento
        if (statusNovo === 'Transbordo') {
            await _registrarTrechosTransbordo(pedidoObj, { statusNovo, tipoTransbordo, cidadeTransbordo, cegonhaDestino });
        }

        // 3b. Notificar o setor certo conforme a etapa do fluxo
        try { notificarMudancaStatus(pedidoObj, statusAnterior, statusNovo); } catch (e) {}

        // Carga fechada: aplica o MESMO avanço aos demais carros do grupo
        // que estão no mesmo status (statusAnterior). Os que estão em outro
        // status ficam de fora (decisão A + A).
        let avancadosLote = 0;
        if (_statusGrupoIds && _statusGrupoIds.length > 1) {
            const dados = { statusAnterior, statusNovo, tipoTransbordo, cidadeTransbordo, cegonhaDestino, observacao, usuarioNome, perfilUsuario };
            for (const outroId of _statusGrupoIds) {
                if (String(outroId) === String(pedidoId)) continue;
                const outro = pedidosGlobais.find(p => String(p.id) === String(outroId));
                if (!outro || (outro.status || 'Pendente') !== statusAnterior) continue;
                try { await _aplicarStatusEmPedidoLote(outro, dados); avancadosLote++; }
                catch (e) { console.warn('Lote: falha ao avançar', outroId, e.message); }
            }
        }
        _statusGrupoIds = [];

        // 3. Atualizar dados locais
        await aposMutacaoPedidos();
        fecharModal('modalStatus');
        exibirMensagem('mensagemLogistica', `✅ Status atualizado: ${statusAnterior} → ${statusNovo}${avancadosLote ? ` · +${avancadosLote} carros do grupo` : ''}`, 'success');
        renderizarPedidosDrag();
        renderizarVeiculosDrop();
        renderizarKanban();
        renderizarPainelCegonhas();
        // Disparar PDF fiscal automaticamente ao entrar Em Transporte
        if (statusNovo === 'Em Transporte') {
            await dispararPDFFiscal(pedidoId);
        }

    } catch (err) {
        msgEl.textContent = 'Erro ao atualizar: ' + err.message;
        msgEl.className = 'message show error';
    }
}

// ============================================
// HISTÓRICO DO PEDIDO
// ============================================

async function abrirHistorico(pedidoId) {
    document.getElementById('historicoPedidoId').textContent = '#' + pedidoId;
    document.getElementById('listaHistorico').innerHTML = '<p class="text-center text-muted">Carregando...</p>';
    document.getElementById('modalHistorico').classList.add('show');

    try {
        const { data, error } = await supabase
            .from('historico_status')
            .select('*')
            .eq('pedido_id', pedidoId)
            .order('created_at', { ascending: false });

        const lista = document.getElementById('listaHistorico');

        if (error || !data || data.length === 0) {
            lista.innerHTML = '<p class="text-center text-muted">Nenhuma alteração registrada.</p>';
            return;
        }

        lista.innerHTML = data.map(h => {
            const corAnterior = FLUXO_STATUS[h.status_anterior]?.cor || '#888';
            const corNovo = FLUXO_STATUS[h.status_novo]?.cor || '#4ade80';
            const data_fmt = h.created_at
                ? new Date(h.created_at).toLocaleString('pt-BR')
                : '—';
            return `
                <div class="historico-item">
                    <div class="historico-linha">
                        <span class="hist-status" style="color:${corAnterior}">${h.status_anterior || '—'}</span>
                        <span class="hist-seta">→</span>
                        <span class="hist-status" style="color:${corNovo}">${h.status_novo}</span>
                    </div>
                    <div class="historico-meta">
                        <span>👤 ${h.usuario_nome || '—'} (${h.usuario_perfil || '—'})</span>
                        <span>🕐 ${data_fmt}</span>
                    </div>
                    ${h.observacao ? `<div class="historico-obs">📝 ${h.observacao}</div>` : ''}
                </div>
            `;
        }).join('');

    } catch(e) {
        document.getElementById('listaHistorico').innerHTML = '<p class="text-center text-muted">Erro ao carregar histórico.</p>';
    }
}

// ============================================
// BUSCA DE CLIENTE NO FORMULÁRIO DE PEDIDO
// ============================================

let clientesBuscaTimer = null;

function filtrarClientes(termo) {
    const lista = document.getElementById('listaClientesBusca');
    if (!lista) return;

    if (!termo || termo.length < 1) {
        lista.style.display = 'none';
        return;
    }

    const termoLower = termo.toLowerCase();
    const filtrados = clientesGlobais.filter(c => {
        const nome = (c.nome || '').toLowerCase();
        const fantasia = (c.nome_fantasia || '').toLowerCase();
        const cnpj = (c.cnpj || '').replace(/\D/g,'');
        const cpf  = (c.cpf  || '').replace(/\D/g,'');
        const cod  = (c.codigo || '').toLowerCase();
        const cidade = (c.cidade || '').toLowerCase();
        const termoDigits = termo.replace(/\D/g,'');
        return nome.includes(termoLower) ||
               fantasia.includes(termoLower) ||
               (termoDigits && (cnpj.includes(termoDigits) || cpf.includes(termoDigits))) ||
               cod.includes(termoLower) ||
               cidade.includes(termoLower);
    }).slice(0, 8);

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="cliente-item-vazio">Nenhum cliente encontrado</div>';
        lista.style.display = 'block';
        return;
    }

    lista.innerHTML = filtrados.map(c => {
        const doc = c.cnpj || c.cpf || '';
        const tipo = c.tipo_cliente ? `<span class="cliente-tipo-badge">${c.tipo_cliente}</span>` : '';
        const cod = c.codigo ? `<span class="cliente-cod">${c.codigo}</span>` : '';
        const cidadeUf = `${c.cidade||''}${c.uf?('/'+c.uf):''}`;
        const fantasia = (c.nome_fantasia && _norm(c.nome_fantasia) !== _norm(c.nome||'')) ? `<span class="cliente-fantasia">🏷️ ${c.nome_fantasia}</span>` : '';
        return `<div class="cliente-item" onmousedown="selecionarCliente(${c.id}, '${(c.nome||'').replace(/'/g,"\'")}', '${doc}', '${c.tipo_cliente||''}', '${c.codigo||''}')">
            <div class="cliente-item-nome">${c.nome || '—'} ${tipo} ${cod}</div>
            <div class="cliente-item-doc">${fantasia}${fantasia&&(cidadeUf||doc)?' · ':''}${cidadeUf?`📍 ${cidadeUf}`:''}${cidadeUf&&doc?' · ':''}${doc || ''}</div>
        </div>`;
    }).join('');
    lista.style.display = 'block';
}

function selecionarCliente(id, nome, doc, tipo, codigo) {
    document.getElementById('clienteBusca').value = nome;
    document.getElementById('cliente').value = nome;
    document.getElementById('clienteId').value = id;

    // Item 1 — tipo de entrega padrão do cliente (editável por exceção)
    try {
        const cli = (clientesGlobais||[]).find(c => String(c.id) === String(id));
        const selTE = document.getElementById('tipoEntregaPedido');
        if (cli && selTE && cli.tipo_entrega_padrao) selTE.value = cli.tipo_entrega_padrao;
    } catch(e){}

    const info = document.getElementById('clienteSelecionadoInfo');
    if (info) {
        info.style.display = 'flex';
        info.innerHTML = `
            <span class="cliente-sel-nome">✅ ${nome}</span>
            ${tipo ? `<span class="cliente-sel-tipo">${tipo}</span>` : ''}
            ${doc ? `<span class="cliente-sel-doc">${doc}</span>` : ''}
            ${codigo ? `<span class="cliente-sel-cod">${codigo}</span>` : ''}
            <button type="button" class="btn-hist-cliente" onclick="abrirHistoricoCliente()">📊 Histórico</button>
            <button type="button" class="cliente-sel-limpar" onclick="limparClienteSelecionado()">×</button>
        `;
    }

    const lista = document.getElementById('listaClientesBusca');
    if (lista) lista.style.display = 'none';
}

function limparClienteSelecionado() {
    document.getElementById('clienteBusca').value = '';
    document.getElementById('cliente').value = '';
    document.getElementById('clienteId').value = '';
    const info = document.getElementById('clienteSelecionadoInfo');
    if (info) info.style.display = 'none';
}

function fecharListaClientes() {
    setTimeout(() => {
        const lista = document.getElementById('listaClientesBusca');
        if (lista) lista.style.display = 'none';
    }, 200);
}

// ============================================
// CEP NO PEDIDO (COLETA E ENTREGA)
// ============================================

async function buscarCEPPedido(cep, tipo) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await resp.json();
        if (data.erro) return;

        const endereco = `${data.logradouro || ''}, ${data.bairro || ''} — ${data.localidade || ''}/${data.uf || ''}`;

        if (tipo === 'Coleta') {
            const el = document.getElementById('enderecoColeta');
            if (el) { el.value = endereco; el.focus(); }
            // Preencher UF e cidade de origem automaticamente
            const ufSel = document.getElementById('ufOrigem');
            if (ufSel && data.uf) {
                ufSel.value = data.uf;
                ufSel.dispatchEvent(new Event('change'));
                setTimeout(() => {
                    const cidSel = document.getElementById('cidadeOrigem');
                    if (cidSel) {
                        // Aguarda cidades carregar e seleciona
                        const tentarSelecionar = setInterval(() => {
                            const opts = [...cidSel.options];
                            const match = opts.find(o => o.value.toLowerCase() === (data.localidade||'').toLowerCase());
                            if (match) { cidSel.value = match.value; clearInterval(tentarSelecionar); }
                            else if (opts.length > 1) clearInterval(tentarSelecionar);
                        }, 300);
                        setTimeout(() => clearInterval(tentarSelecionar), 5000);
                    }
                }, 800);
            }
        } else {
            const el = document.getElementById('enderecoEntrega');
            if (el) { el.value = endereco; el.focus(); }
            const ufSel = document.getElementById('ufDestino');
            if (ufSel && data.uf) {
                ufSel.value = data.uf;
                ufSel.dispatchEvent(new Event('change'));
                setTimeout(() => {
                    const cidSel = document.getElementById('cidadeDestino');
                    if (cidSel) {
                        const tentarSelecionar = setInterval(() => {
                            const opts = [...cidSel.options];
                            const match = opts.find(o => o.value.toLowerCase() === (data.localidade||'').toLowerCase());
                            if (match) { cidSel.value = match.value; clearInterval(tentarSelecionar); }
                            else if (opts.length > 1) clearInterval(tentarSelecionar);
                        }, 300);
                        setTimeout(() => clearInterval(tentarSelecionar), 5000);
                    }
                }, 800);
            }
        }
    } catch(e) {
        console.warn('Erro ao buscar CEP:', e);
    }
}

// ============================================
// MÁSCARA MOEDA R$
// ============================================

function mascaraMoeda(input) {
    let v = input.value.replace(/\D/g, '');
    v = (parseInt(v) || 0).toString();
    while (v.length < 3) v = '0' + v;
    const reais = v.slice(0, -2);
    const centavos = v.slice(-2);
    const reaisFormatado = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = reaisFormatado + ',' + centavos;
    input.dataset.valor = (parseInt(v) / 100).toFixed(2);
}

function valorMoedaParaFloat(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/\./g,'').replace(',','.')) || 0;
}

// ============================================
// AJUSTE DE CAPACIDADE POR TIPO DE VEÍCULO
// ============================================

function ajustarCapacidadeVeiculo(tipo) {
    const cap = document.getElementById('capacidadeCegonha');
    if (!cap) return;
    const caps = {
        'Carreta 2 Eixos': 6,
        'Cavalo Trucado 3 Eixos': 4,
        'Cavalo Simples 2 Eixos': 3,
        'Caminhão 3/4 2 Eixos': 2,
        'Guincho': 1,
        'Prancha': 2
    };
    if (caps[tipo]) cap.value = caps[tipo];
}

// ============================================
// VALIDAÇÃO UNIQUE CPF/CNPJ NO CADASTRO
// ============================================

async function verificarDocumentoUnico(campo, valor, ignorarId) {
    if (!supabase || !valor) return true;
    const digits = String(valor).replace(/\D/g, '');
    if (digits.length < 11) return true;

    try {
        // Compara só dígitos (ignora máscara) — evita falso positivo/negativo de CNPJ/CPF
        const { data, error } = await supabase
            .from('clientes')
            .select('id, nome, cnpj, cpf')
            .not(campo, 'is', null)
            .limit(5000);

        if (error) {
            console.warn('verificarDocumentoUnico:', error);
            return true;
        }

        const encontrado = (data || []).find(function (c) {
            if (ignorarId != null && Number(c.id) === Number(ignorarId)) return false;
