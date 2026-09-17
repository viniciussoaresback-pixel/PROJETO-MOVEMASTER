/* ===========================================================================
   RASTREIO POR PLACA — Central de Conferência

   O financeiro chega com uma placa na mão: o cliente ligou perguntando de um
   carro, ou uma divergência aponta para um veículo específico. A pergunta é
   sempre a mesma — por onde esse carro passou, em quantas viagens, com quais
   motoristas, e quanto foi faturado em cada uma.

   Até agora responder isso exigia procurar pedido por pedido em várias telas.
   Aqui é uma busca só, e ela monta a linha do tempo do carro juntando quatro
   fontes: o pedido, os vínculos de viagem (que preservam transbordo), os
   trechos registrados e o histórico de status.
   =========================================================================== */

let _rpUltimaBusca = '';

function _rpEsc(t){
  return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _rpFmt(n){
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
}
function _rpData(d){
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—';
}

/* Painel de busca, inserido no topo da Central de Conferência. */
function _rpBarraHTML(){
  return `
    <div class="rp-barra">
      <div class="rp-busca">
        <span class="rp-busca-ic">🔍</span>
        <input type="text" id="rpBusca" placeholder="Placa do carro, número do pedido ou CT-e — mostra por onde passou"
               value="${_rpEsc(_rpUltimaBusca)}"
               onkeydown="if(event.key==='Enter')rastrearPedido()">
        <button class="btn btn-primary btn-sm" onclick="rastrearPedido()">Rastrear</button>
        ${_rpUltimaBusca ? `<button class="btn btn-secondary btn-sm" onclick="_rpLimpar()">✕</button>` : ''}
      </div>
      <div id="rpResultado"></div>
    </div>`;
}
window._rpBarraHTML = _rpBarraHTML;

function _rpLimpar(){
  _rpUltimaBusca = '';
  const el = document.getElementById('rpBusca'); if (el) el.value = '';
  const res = document.getElementById('rpResultado'); if (res) res.innerHTML = '';
}
window._rpLimpar = _rpLimpar;

async function rastrearPedido(){
  const termo = (document.getElementById('rpBusca')?.value || '').trim();
  const box = document.getElementById('rpResultado');
  if (!box) return;
  if (!termo){ box.innerHTML = ''; return; }
  _rpUltimaBusca = termo;
  box.innerHTML = '<p class="rp-ajuda">⏳ Buscando...</p>';

  const n = (typeof _norm === 'function') ? _norm : (t => String(t||'').toLowerCase().trim());
  const alvo = n(termo);

  // Acha os pedidos: placa, id ou CT-e
  const achados = (typeof pedidosGlobais !== 'undefined' ? pedidosGlobais : []).filter(p =>
    n(p.placa||'') === alvo ||
    n(p.placa||'').includes(alvo) ||
    String(p.id) === termo.replace('#','') ||
    n(p.numeroCte||'') === alvo
  );

  if (!achados.length){
    box.innerHTML = `<p class="rp-vazio">Nada encontrado para "<strong>${_rpEsc(termo)}</strong>". Tente a placa completa, o número do pedido ou o CT-e.</p>`;
    return;
  }

  /* Uma placa pode ter sido transportada mais de uma vez — o mesmo carro
     voltando, ou um veículo que rodou entre filiais. Cada pedido é um
     transporte; por isso o resumo conta pedidos, não viagens. */
  try {
    const ids = achados.map(p => p.id);
    const { data: vincs } = await supabase.from('viagem_pedidos')
      .select('*').in('pedido_id', ids);
    const { data: trechos } = await supabase.from('pedido_trechos')
      .select('*').in('pedido_id', ids).order('ordem', { ascending:true });
    const { data: hist } = await supabase.from('historico_status')
      .select('*').in('pedido_id', ids).order('created_at', { ascending:true });

    box.innerHTML = _rpResultadoHTML(achados, vincs||[], trechos||[], hist||[]);
  } catch(e){
    box.innerHTML = `<p class="rp-vazio">Erro ao buscar o rastreio: ${_rpEsc(e.message||e)}</p>`;
  }
}
window.rastrearPedido = rastrearPedido;

function _rpResultadoHTML(pedidos, vincs, trechos, hist){
  const placas = [...new Set(pedidos.map(p => p.placa).filter(Boolean))];
  const totalFrete = pedidos.reduce((s,p) => s + Number(p.valorFrete||0), 0);

  return `
    <div class="rp-resumo">
      <div class="rp-resumo-item"><span>Carro(s)</span><strong>${placas.map(_rpEsc).join(', ') || '—'}</strong></div>
      <div class="rp-resumo-item"><span>Transportes</span><strong>${pedidos.length}</strong></div>
      <div class="rp-resumo-item"><span>Frete somado</span><strong class="rp-verde">${_rpFmt(totalFrete)}</strong></div>
    </div>

    ${pedidos.map(p => {
      const meusVincs = vincs.filter(v => String(v.pedido_id)===String(p.id));
      const meusTrechos = trechos.filter(t => String(t.pedido_id)===String(p.id));
      const marcos = hist.filter(h => String(h.pedido_id)===String(p.id));

      // Viagens por onde passou, na ordem em que entrou
      const viagens = meusVincs
        .sort((a,b) => new Date(a.created_at||0) - new Date(b.created_at||0))
        .map(v => {
          const r = (typeof rotasGlobais !== 'undefined' ? rotasGlobais : [])
            .find(x => String(x.id)===String(v.rota_id));
          return {
            id: v.rota_id,
            nome: r?.nome || ('Viagem #'+v.rota_id),
            cegonha: r?.placa_cegonha || '—',
            motorista: r?.motorista_1 || '—',
            entrou: v.created_at,
            saiu: v.saiu_em,
            motivo: v.motivo_saida,
            onde: v.cidade_transbordo
          };
        });

      return `
      <div class="rp-pedido">
        <div class="rp-pedido-cab">
          <div>
            <strong>#${p.id}</strong> · <strong>${_rpEsc(p.placa||'—')}</strong>
            ${p.modelo?' · '+_rpEsc(p.modelo):''}
            <div class="rp-pedido-sub">
              ${_rpEsc(p.cliente||'—')} ·
              ${_rpEsc((p.cidadeOrigem||'?').split('/')[0])} → ${_rpEsc((p.cidadeDestino||'?').split('/')[0])}
              ${p.referencia?` · 🏷️ ${_rpEsc(p.referencia)}`:''}
            </div>
          </div>
          <div class="rp-pedido-dir">
            <div class="rp-verde">${_rpFmt(p.valorFrete)}</div>
            <div class="rp-pedido-status">${_rpEsc(p.status||'')}</div>
            ${p.numeroCte?`<div class="rp-cte">🧾 CT-e ${_rpEsc(p.numeroCte)}</div>`:''}
          </div>
        </div>

        ${viagens.length ? `
          <div class="rp-sec-tit">🚛 Passou por ${viagens.length} viagem(ns)${viagens.length>1?' — houve transbordo':''}</div>
          <table class="rp-tab">
            <thead><tr><th>#</th><th>Viagem</th><th>Cegonha</th><th>Motorista</th><th>Entrou</th><th>Saiu</th></tr></thead>
            <tbody>${viagens.map((v,i) => `<tr>
              <td>${i+1}</td>
              <td>${_rpEsc(v.nome)}</td>
              <td>${_rpEsc(v.cegonha)}</td>
              <td>${_rpEsc(v.motorista)}</td>
              <td>${_rpData(v.entrou)}</td>
              <td>${v.saiu
                ? `${_rpData(v.saiu)}<div class="rp-saiu">${_rpEsc(v.motivo||'')}${v.onde?` em ${_rpEsc(String(v.onde).split('/')[0])}`:''}</div>`
                : '<span class="rp-ainda">segue nesta</span>'}</td>
            </tr>`).join('')}</tbody>
          </table>` : '<div class="rp-sec-tit">🚛 Nenhuma viagem vinculada</div>'}

        ${meusTrechos.length ? `
          <div class="rp-sec-tit">🔀 ${meusTrechos.length} trecho(s) registrado(s)</div>
          <table class="rp-tab">
            <thead><tr><th>Trecho</th><th>Motorista</th><th>Cegonha</th><th class="right">Valor</th></tr></thead>
            <tbody>${meusTrechos.map(t => `<tr>
              <td>${_rpEsc(t.origem_cidade||'?')} → ${_rpEsc(t.destino_cidade||'?')}</td>
              <td>${_rpEsc(t.motorista_nome||'—')}</td>
              <td>${_rpEsc(t.placa_cegonha||'—')}</td>
              <td class="right">${_rpFmt(t.valor_frete)}</td>
            </tr>`).join('')}
            <tr class="rp-tab-total"><td colspan="3">Soma dos trechos</td>
              <td class="right">${_rpFmt(meusTrechos.reduce((s,t)=>s+Number(t.valor_frete||0),0))}</td></tr>
            </tbody>
          </table>` : ''}

        ${marcos.length ? `
          <details class="rp-det">
            <summary>📜 Linha do tempo (${marcos.length} evento(s))</summary>
            <div class="rp-tl">${marcos.map(h => `
              <div class="rp-tl-item">
                <span class="rp-tl-data">${h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</span>
                <span class="rp-tl-txt">${_rpEsc(h.status_novo||'')}${h.observacao?` — ${_rpEsc(h.observacao)}`:''}</span>
                <span class="rp-tl-quem">${_rpEsc(h.usuario_nome||'')}</span>
              </div>`).join('')}</div>
          </details>` : ''}
      </div>`;
    }).join('')}`;
}
