/* =========================================================================
   MOVEMASTER — Trajetória do Pedido (v1)

   Responde, numa tela só: por onde o pedido passou, qual caminhão e
   motorista em cada trecho, onde houve transbordo, se foi frota ou
   terceiro, e o que foi tentativa/cancelamento.

   FONTE: viagem_pedidos + rotas_planejadas + veiculos + historico_status.
   NÃO usa pedido_trechos (está vazia e não é necessária).

   REGRAS (definidas com a operação, sem inferência):
     • ordem      → viagem_pedidos.entrou_em (preenchido em 100% dos casos)
     • transbordo → SÓ quando saiu_em está preenchido E motivo_saida diz
                    transbordo. Nada de deduzir por geografia.
     • cancelada  → fora do percurso realizado, vai para Tentativas
     • várias rotas SEM evidência de transbordo → não inventa trajetória;
                    marca como registros incompletos

   O princípio: para o Financeiro, "não foi possível confirmar" vale mais
   que uma trajetória bonita que talvez nunca tenha acontecido.
   ========================================================================= */

function _trjEhCancelada(status){
  return ['cancelada','cancelado'].includes(String(status||'').toLowerCase());
}

// Transbordo é registro explícito, nunca dedução.
function _trjTransbordo(perna){
  if (!perna.saiu_em) return null;
  const motivo = String(perna.motivo_saida || '');
  if (!/transbordo/i.test(motivo)) return null;
  // "transbordo em Maringá/PR" -> "Maringá/PR"
  const m = motivo.match(/transbordo\s+em\s+(.+)$/i);
  return { cidade: m ? m[1].trim() : null, quando: perna.saiu_em, texto: motivo };
}

function _trjEsc(t){
  return String(t == null ? '' : t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _trjData(v){
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR');
}

async function abrirTrajetoriaPedido(pedidoId){
  const old = document.getElementById('modalTrajetoria'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalTrajetoria';
  div.className = 'trj-overlay';
  div.innerHTML = `<div class="trj-painel">
      <div class="trj-topo">
        <strong>🗺️ Trajetória do pedido #${_trjEsc(pedidoId)}</strong>
        <button class="trj-fechar" onclick="document.getElementById('modalTrajetoria').remove()">✕</button>
      </div>
      <div class="trj-corpo" id="trjCorpo"><p class="text-muted">Carregando...</p></div>
    </div>`;
  document.body.appendChild(div);

  try {
    const { data: vps, error: e1 } = await supabase
      .from('viagem_pedidos').select('*')
      .eq('pedido_id', pedidoId).order('entrou_em', { ascending: true });
    if (e1) throw e1;

    if (!vps || vps.length === 0){
      document.getElementById('trjCorpo').innerHTML =
        '<p class="text-muted">Este pedido ainda não foi vinculado a nenhuma viagem.</p>';
      return;
    }

    const ids = [...new Set(vps.map(v => v.rota_id).filter(Boolean))];
    const { data: rotas } = await supabase
      .from('rotas_planejadas').select('*').in('id', ids);
    const porRota = {};
    (rotas || []).forEach(r => { porRota[r.id] = r; });

    const { data: hist } = await supabase
      .from('historico_status').select('*')
      .eq('pedido_id', pedidoId).order('created_at', { ascending: true });

    _trjRenderizar(pedidoId, vps, porRota, hist || []);

  } catch (e){
    document.getElementById('trjCorpo').innerHTML =
      `<p style="color:#f87171">Não foi possível montar a trajetória: ${_trjEsc(e.message || e)}</p>`;
  }
}

function _trjRenderizar(pedidoId, vps, porRota, hist){
  // Junta o vínculo com a rota. A ordem é a de entrou_em (já veio ordenada).
  const pernas = vps.map(vp => ({ ...vp, rota: porRota[vp.rota_id] || {} }));

  const realizadas = pernas.filter(p => !_trjEhCancelada(p.rota.status));
  const canceladas = pernas.filter(p =>  _trjEhCancelada(p.rota.status));

  // Quantos transbordos estão REGISTRADOS (não deduzidos)
  const comTransbordo = realizadas.filter(p => _trjTransbordo(p)).length;

  // Várias pernas realizadas sem nenhuma evidência de transbordo:
  // não dá para afirmar a trajetória.
  const inconsistente = realizadas.length > 1 && comTransbordo === 0;

  let html = '';

  if (inconsistente){
    html += `<div class="trj-alerta">
      <div class="trj-alerta-tit">⚠️ Operação com registros incompletos</div>
      <p>Este pedido está vinculado a <strong>${realizadas.length} rotas</strong>, mas
      não há registro de saída (<code>saiu_em</code>) nem motivo que explique a passagem
      de uma rota para outra.</p>
      <p><strong>O sistema não consegue confirmar a trajetória real.</strong>
      As rotas aparecem abaixo como registros, não como percurso confirmado.</p>
    </div>`;
  }

  html += `<div class="trj-sec-tit">${inconsistente ? 'Rotas vinculadas (não confirmadas)' : 'Percurso realizado'}</div>`;

  realizadas.forEach((p, i) => {
    const r = p.rota;
    const veic = (typeof veiculosGlobais !== 'undefined' ? veiculosGlobais : [])
      .find(v => v.placa === r.placa_cegonha);
    const terceiro = veic && veic.propriedade === 'terceiro';

    html += `<div class="trj-trecho ${inconsistente ? 'trj-incerto' : ''}">
      <div class="trj-trecho-cab">
        <span class="trj-num">${inconsistente ? '•' : 'Trecho ' + (i+1)}</span>
        <span class="trj-nome">${_trjEsc(r.nome || ('Rota #' + p.rota_id))}</span>
        <span class="trj-status trj-st-${_trjEsc(String(r.status||'').toLowerCase())}">${_trjEsc(r.status || '—')}</span>
      </div>
      <div class="trj-linha">🚛 <strong>${_trjEsc(r.placa_cegonha || '—')}</strong>
        &nbsp;·&nbsp; 👤 ${_trjEsc(r.motorista_1 || '—')}${r.motorista_2 ? ' + ' + _trjEsc(r.motorista_2) : ''}</div>
      <div class="trj-linha">
        ${terceiro
          ? `🤝 <strong>Terceiro</strong>${veic.transportador_nome ? ' — ' + _trjEsc(veic.transportador_nome) : ''}`
          : (veic ? '🏢 <strong>Movemaster</strong> (frota própria)' : '❓ executor não identificado')}
        ${veic ? '<span class="trj-obs">identificação baseada no cadastro atual do veículo</span>' : ''}
      </div>
      <div class="trj-linha trj-mini">Entrou na rota: ${_trjData(p.entrou_em)}${p.saiu_em ? ' · Saiu: ' + _trjData(p.saiu_em) : ''}</div>
      ${r.criado_por ? `<div class="trj-linha trj-mini">Viagem criada por ${_trjEsc(r.criado_por)}</div>` : ''}
    </div>`;

    const tb = _trjTransbordo(p);
    if (tb){
      html += `<div class="trj-transbordo">
        🔄 <strong>Transbordo${tb.cidade ? ' em ' + _trjEsc(tb.cidade) : ''}</strong>
        <span class="trj-mini">registrado em ${_trjData(tb.quando)} — "${_trjEsc(tb.texto)}"</span>
      </div>`;
    }
  });

  if (canceladas.length){
    html += `<div class="trj-sec-tit">Tentativas / alterações</div>`;
    canceladas.forEach(p => {
      const r = p.rota;
      html += `<div class="trj-trecho trj-cancelada">
        <div class="trj-trecho-cab">
          <span class="trj-nome">${_trjEsc(r.nome || ('Rota #' + p.rota_id))}</span>
          <span class="trj-status trj-st-cancelada">cancelada</span>
        </div>
        <div class="trj-linha trj-mini">🚛 ${_trjEsc(r.placa_cegonha || '—')} · 👤 ${_trjEsc(r.motorista_1 || '—')}
          · vinculado em ${_trjData(p.entrou_em)}</div>
      </div>`;
    });
  }

  if (hist.length){
    html += `<div class="trj-sec-tit">Histórico do pedido (${hist.length} eventos)</div>
      <table class="trj-hist">
        <thead><tr><th>Quando</th><th>De → Para</th><th>Usuário</th><th>Observação</th></tr></thead>
        <tbody>${hist.map(h => `<tr>
          <td>${_trjData(h.created_at)}</td>
          <td>${_trjEsc(h.status_anterior || '—')} → <strong>${_trjEsc(h.status_novo || '—')}</strong></td>
          <td>${_trjEsc(h.usuario_nome || '—')}<br><span class="trj-mini">${_trjEsc(h.usuario_perfil || '')}</span></td>
          <td>${_trjEsc(h.observacao || '')}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  document.getElementById('trjCorpo').innerHTML = html;
}

window.abrirTrajetoriaPedido = abrirTrajetoriaPedido;
