/* =========================================================================
   MOVEMASTER — ETAPA B: situação fiscal do CT-e

   O CT-e deixa de ser um número solto e passa a ter estado:
     🟢 emitido · 🔴 cancelado · 🔵 substituído
   mais a carta de correção, que não altera valor nem período mas precisa
   ficar registrada.

   Toda alteração grava um evento em cte_eventos — quem fez, quando, o que
   mudou e de onde veio (manual agora; na etapa C, o relatório do ATUA).

   Esta etapa NÃO mexe em pedido, viagem, transbordo ou entrega, e NÃO
   calcula estorno nem complemento. Ela só estrutura a informação fiscal,
   para ser validada com documentos reais antes do fechamento.
   ========================================================================= */

const CTE_SITUACOES = {
  emitido:     { rotulo: 'Emitido',     icone: '🟢', cor: '#4ade80' },
  cancelado:   { rotulo: 'Cancelado',   icone: '🔴', cor: '#f87171' },
  substituido: { rotulo: 'Substituído', icone: '🔵', cor: '#60a5fa' }
};

function _cteEsc(t){
  return String(t == null ? '' : t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _cteData(v){
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
}

/** Selo da situação, para usar em qualquer tela que mostre CT-e. */
function cteSituacaoHTML(p){
  if (!p || !p.numeroCte) return '';
  const sit = CTE_SITUACOES[p.cteSituacao || 'emitido'] || CTE_SITUACOES.emitido;

  let extra = '';
  if (p.cteSituacao === 'cancelado' && p.cteCanceladoEm)
    extra = `<span class="cte-extra">em ${_cteData(p.cteCanceladoEm)}</span>`;
  if (p.cteSituacao === 'substituido' && p.cteSubstituidoPor)
    extra = `<span class="cte-extra">pelo ${_cteEsc(p.cteSubstituidoPor)}</span>`;
  if (p.cteSubstitui)
    extra += `<span class="cte-extra">substitui o ${_cteEsc(p.cteSubstitui)}</span>`;

  const cce = p.cceNumero
    ? `<span class="cte-cce" title="Carta de correção ${_cteEsc(p.cceNumero)}${p.cceDescricao ? ' — ' + _cteEsc(p.cceDescricao) : ''}">📝 CC-e</span>`
    : '';

  return `<span class="cte-selo" style="--cte-cor:${sit.cor}">${sit.icone} ${sit.rotulo}</span>${extra}${cce}
    <button class="cte-btn" onclick="cteAbrirSituacao(${p.id})" title="Registrar cancelamento, substituição ou carta de correção">⚙️</button>`;
}

/** Painel para registrar o evento fiscal de um CT-e. */
async function cteAbrirSituacao(pedidoId){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p){ alert('Pedido não encontrado.'); return; }
  if (!p.numeroCte){ alert('Este carro ainda não tem CT-e salvo.'); return; }

  const old = document.getElementById('modalCteSituacao'); if (old) old.remove();
  const sit = p.cteSituacao || 'emitido';

  const div = document.createElement('div');
  div.id = 'modalCteSituacao';
  div.className = 'cte-overlay';
  div.innerHTML = `
    <div class="cte-painel">
      <div class="cte-topo">
        <strong>🧾 CT-e ${_cteEsc(p.numeroCte)}</strong>
        <button class="cte-fechar" onclick="document.getElementById('modalCteSituacao').remove()">✕</button>
      </div>
      <div class="cte-corpo">
        <div class="cte-resumo">
          <div><span class="cte-lbl">Carro</span> ${_cteEsc(p.placa||'—')} · ${_cteEsc(p.modelo||'')}</div>
          <div><span class="cte-lbl">Cliente</span> ${_cteEsc(p.cliente||'—')}</div>
          <div><span class="cte-lbl">Situação atual</span> ${cteSituacaoHTML(p).replace(/<button[\s\S]*?<\/button>/,'')}</div>
        </div>

        ${sit === 'emitido' ? `
          <div class="cte-sec">
            <div class="cte-sec-tit">🔴 Registrar cancelamento</div>
            <p class="cte-ajuda">O documento deixa de valer. Se o período já estiver fechado, o valor permanece lá e o acerto será feito no período atual.</p>
            <input type="date" id="cteCancData" value="${new Date().toISOString().slice(0,10)}">
            <input type="text" id="cteCancMotivo" placeholder="Motivo do cancelamento">
            <button class="btn btn-primary btn-sm" onclick="cteRegistrar(${p.id},'cancelamento')">Registrar cancelamento</button>
          </div>

          <div class="cte-sec">
            <div class="cte-sec-tit">🔵 Registrar substituição</div>
            <p class="cte-ajuda">Este CT-e foi substituído por outro. O vínculo entre os dois fica registrado.</p>
            <input type="text" id="cteSubstNumero" placeholder="Número do CT-e que substituiu">
            <input type="date" id="cteSubstData" value="${new Date().toISOString().slice(0,10)}">
            <button class="btn btn-primary btn-sm" onclick="cteRegistrar(${p.id},'substituicao')">Registrar substituição</button>
          </div>
        ` : `
          <div class="cte-aviso">
            Este CT-e está como <strong>${CTE_SITUACOES[sit]?.rotulo || sit}</strong>.
            ${p.cteCanceladoMotivo ? '<br>Motivo: ' + _cteEsc(p.cteCanceladoMotivo) : ''}
            <br><button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="cteRegistrar(${p.id},'reverter')">↩️ Voltar para emitido</button>
          </div>
        `}

        <div class="cte-sec">
          <div class="cte-sec-tit">📝 Carta de correção</div>
          <p class="cte-ajuda">Corrige dados acessórios. <strong>Não altera valor nem período</strong> — por isso não afeta o faturamento, só fica registrada.</p>
          <input type="text" id="cteCceNumero" placeholder="Número da CC-e" value="${_cteEsc(p.cceNumero||'')}">
          <input type="text" id="cteCceDesc" placeholder="O que foi corrigido" value="${_cteEsc(p.cceDescricao||'')}">
          <button class="btn btn-secondary btn-sm" onclick="cteRegistrar(${p.id},'carta_correcao')">Registrar carta de correção</button>
        </div>

        <div class="cte-sec">
          <div class="cte-sec-tit">📜 Histórico fiscal</div>
          <div id="cteHistorico"><span class="cte-ajuda">Carregando...</span></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  _cteCarregarHistorico(p.numeroCte);
}

async function _cteCarregarHistorico(numero){
  const el = document.getElementById('cteHistorico');
  if (!el) return;
  try {
    const { data } = await supabase.from('cte_eventos').select('*')
      .eq('numero_cte', numero).order('ocorrido_em', { ascending: true });
    if (!data || !data.length){
      el.innerHTML = '<span class="cte-ajuda">Nenhum evento além da emissão.</span>';
      return;
    }
    el.innerHTML = data.map(e => `
      <div class="cte-evento">
        <span class="cte-evento-data">${new Date(e.ocorrido_em).toLocaleString('pt-BR')}</span>
        <strong>${_cteEsc(e.evento)}</strong>
        ${e.numero_relacionado ? ' → ' + _cteEsc(e.numero_relacionado) : ''}
        ${e.motivo ? '<br><span class="cte-ajuda">' + _cteEsc(e.motivo) + '</span>' : ''}
        <span class="cte-evento-quem">${_cteEsc(e.usuario_nome||'—')} · ${_cteEsc(e.origem)}</span>
      </div>`).join('');
  } catch(e){
    el.innerHTML = '<span class="cte-ajuda">Não foi possível carregar o histórico.</span>';
  }
}

/** Grava o evento fiscal e atualiza a situação do CT-e. */
async function cteRegistrar(pedidoId, evento){
  const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pedidoId));
  if (!p) return;

  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Fiscal';
  const perfil  = (typeof perfilAtual !== 'undefined' ? perfilAtual : 'fiscal');
  const antes   = p.cteSituacao || 'emitido';

  let patch = {}, relacionado = null, motivo = null, depois = antes;

  if (evento === 'cancelamento'){
    const data = document.getElementById('cteCancData')?.value;
    motivo = (document.getElementById('cteCancMotivo')?.value || '').trim();
    if (!motivo){ alert('Informe o motivo do cancelamento.'); return; }
    depois = 'cancelado';
    patch = {
      cte_situacao: 'cancelado',
      cte_cancelado_em: data ? data + 'T12:00:00' : new Date().toISOString(),
      cte_cancelado_por: usuario,
      cte_cancelado_motivo: motivo
    };

  } else if (evento === 'substituicao'){
    relacionado = (document.getElementById('cteSubstNumero')?.value || '').trim();
    if (!relacionado){ alert('Informe o número do CT-e substituto.'); return; }
    const data = document.getElementById('cteSubstData')?.value;
    depois = 'substituido';
    patch = {
      cte_situacao: 'substituido',
      cte_substituido_por: relacionado,
      cte_cancelado_em: data ? data + 'T12:00:00' : new Date().toISOString(),
      cte_cancelado_por: usuario
    };

  } else if (evento === 'carta_correcao'){
    relacionado = (document.getElementById('cteCceNumero')?.value || '').trim();
    motivo = (document.getElementById('cteCceDesc')?.value || '').trim();
    if (!relacionado){ alert('Informe o número da carta de correção.'); return; }
    // A CC-e não muda a situação: ela corrige dados acessórios, e por lei
    // não pode alterar valor, partes nem data de emissão.
    patch = { cce_numero: relacionado, cce_data: new Date().toISOString(), cce_descricao: motivo };

  } else if (evento === 'reverter'){
    if (!confirm('Voltar este CT-e para "emitido"?\n\nUse apenas se o registro anterior foi um engano.')) return;
    depois = 'emitido';
    patch = {
      cte_situacao: 'emitido',
      cte_cancelado_em: null, cte_cancelado_por: null,
      cte_cancelado_motivo: null, cte_substituido_por: null
    };
  } else return;

  try {
    const { error } = await supabase.from('pedidos').update(patch).eq('id', p.id);
    if (error) throw error;

    // Espelha na memória (camelCase usado pelas telas)
    const mapa = {
      cte_situacao:'cteSituacao', cte_cancelado_em:'cteCanceladoEm',
      cte_cancelado_por:'cteCanceladoPor', cte_cancelado_motivo:'cteCanceladoMotivo',
      cte_substituido_por:'cteSubstituidoPor', cce_numero:'cceNumero',
      cce_data:'cceData', cce_descricao:'cceDescricao'
    };
    Object.keys(patch).forEach(k => { if (mapa[k]) p[mapa[k]] = patch[k]; });

    // Auditoria: uma linha por evento, nunca sobrescrita
    await supabase.from('cte_eventos').insert({
      pedido_id: p.id, numero_cte: p.numeroCte, evento,
      situacao_antes: antes, situacao_depois: depois,
      numero_relacionado: relacionado, motivo,
      usuario_nome: usuario, usuario_perfil: perfil, origem: 'manual'
    });

    // Se o substituto já existe no sistema, registra o vínculo nos dois lados
    if (evento === 'substituicao'){
      const novo = (pedidosGlobais||[]).find(x => String(x.numeroCte) === String(relacionado));
      if (novo){
        await supabase.from('pedidos').update({ cte_substitui: p.numeroCte }).eq('id', novo.id);
        novo.cteSubstitui = p.numeroCte;
      }
    }

    if (typeof mmToast === 'function') mmToast('✅ Situação fiscal registrada');
    document.getElementById('modalCteSituacao')?.remove();
    if (typeof refrescarTelaAtual === 'function') refrescarTelaAtual();

  } catch(e){
    alert('Não foi possível registrar: ' + (e.message||e));
  }
}

window.cteSituacaoHTML = cteSituacaoHTML;
window.cteAbrirSituacao = cteAbrirSituacao;
window.cteRegistrar = cteRegistrar;
