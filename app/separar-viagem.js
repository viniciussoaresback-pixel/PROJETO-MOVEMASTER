/* ===========================================================================
   SEPARAR CARROS DE UMA VIAGEM

   Acontece de transportes diferentes acabarem registrados como uma viagem só
   — por engano na montagem da carga, ou por pedidos puxados para a viagem
   errada. Quando isso ocorre, o registro deixa de descrever o que aconteceu
   na estrada: o faturamento da viagem soma fretes de cargas que nunca
   estiveram juntas, e a remuneração do motorista vai junto.

   Esta ferramenta separa. Ela NÃO apaga pedido nem CT-e: move os carros
   escolhidos para outra viagem (existente ou nova), levando o vínculo
   histórico junto e registrando tudo.

   Dois cuidados embutidos:

   1. Carros que JÁ SAÍRAM da carga (transbordo) não são oferecidos. O vínculo
      deles é o registro de que passaram por essa cegonha antes de descer, e
      apagá-lo reescreveria uma verdade.
   2. Se a viagem estiver conferida, a conferência é desfeita — o que foi
      conferido era outra composição.
   =========================================================================== */

function _histAbrirSeparar(rotaId){
  const rota = (rotasGlobais||[]).find(r => String(r.id)===String(rotaId));
  if (!rota){ alert('Viagem não encontrada.'); return; }

  // Só os que pertencem à viagem HOJE. Os que já saíram por transbordo ficam
  // de fora: o vínculo deles é história, não composição atual.
  const daViagem = (pedidosGlobais||[]).filter(p => String(p.rotaId ?? p.rota_id ?? '') === String(rotaId));
  if (daViagem.length < 2){
    alert('Esta viagem tem menos de dois carros vinculados — não há o que separar.');
    return;
  }

  // Agrupa por trecho: é assim que a separação costuma fazer sentido.
  const grupos = {};
  daViagem.forEach(p => {
    const k = `${(p.cidadeOrigem||'?').split('/')[0]} → ${(p.cidadeDestino||'?').split('/')[0]}`;
    (grupos[k] = grupos[k] || []).push(p);
  });

  const outras = (rotasGlobais||[])
    .filter(r => String(r.id) !== String(rotaId) && r.status !== 'cancelada')
    .sort((a,b) => (b.id||0) - (a.id||0)).slice(0, 60);

  const old = document.getElementById('modalSeparar'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalSeparar';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:100070;padding:2vh 1vw';
  div.innerHTML = `
    <div class="modal-box sep-box">
      <div class="sep-cab">
        <div>
          <h2 style="margin:0">✂️ Separar carros — ${_atuaEscSep(rota.nome || ('Viagem #'+rota.id))}</h2>
          <p class="text-muted" style="font-size:.84rem;margin:.25rem 0 0">
            Marque os carros que <strong>não pertencem</strong> a esta viagem e escolha para onde vão.
            Nada é apagado: os pedidos e os CT-es seguem intactos.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalSeparar').remove()">✕</button>
      </div>

      <div class="sep-corpo">
        <div class="sep-carros">
          ${Object.entries(grupos).map(([trecho, itens]) => `
            <div class="sep-grupo">
              <div class="sep-grupo-cab">
                <label>
                  <input type="checkbox" onchange="_sepMarcarGrupo(this,'${trecho.replace(/'/g,"\\'")}')">
                  <strong>${_atuaEscSep(trecho)}</strong>
                </label>
                <span>${itens.length} carro(s) · R$ ${itens.reduce((s,p)=>s+Number(p.valorFrete||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
              </div>
              ${itens.map(p => `
                <label class="sep-item">
                  <input type="checkbox" class="sep-chk" value="${p.id}"
                         data-trecho="${_atuaEscSep(trecho)}" data-frete="${Number(p.valorFrete||0)}"
                         data-cte="${p.numeroCte||''}" onchange="_sepAtualizar()">
                  <span>
                    <strong>#${p.id}</strong> · ${_atuaEscSep(p.placa||'—')} · ${_atuaEscSep(p.modelo||'')}
                    <div class="sep-item-sub">${_atuaEscSep(p.cliente||'')} · R$ ${Number(p.valorFrete||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}${p.numeroCte?` · 🧾 CT-e ${p.numeroCte}`:''}</div>
                  </span>
                </label>`).join('')}
            </div>`).join('')}
        </div>

        <div class="sep-lateral">
          <div class="sep-impacto" id="sepImpacto"></div>

          <div class="form-group">
            <label>Para onde vão os carros marcados?</label>
            <select id="sepDestino" onchange="_sepTrocaDestino()">
              <option value="">— criar uma viagem nova —</option>
              ${outras.map(r => `<option value="${r.id}">#${r.id} · ${_atuaEscSep(r.nome||'')}${r.placa_cegonha?' · '+r.placa_cegonha:''}</option>`).join('')}
            </select>
          </div>

          <div id="sepNova">
            <div class="form-group">
              <label>Nome da nova viagem</label>
              <input type="text" id="sepNome" placeholder="Ex: Londrina → Foz do Iguaçu">
            </div>
            <div class="form-group">
              <label>Cegonha</label>
              <select id="sepCegonha">
                <option value="">— a definir —</option>
                ${(veiculosGlobais||[]).filter(x=>x.placa).map(x => `<option value="${x.placa}" data-mot="${(x.motorista_padrao||'').replace(/"/g,'&quot;')}">${x.placa}${x.modelo?' · '+x.modelo:''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Motorista</label>
              <input type="text" id="sepMotorista" list="listaMotSep" placeholder="Motorista da viagem">
              <datalist id="listaMotSep">${(motoristasGlobais||[]).map(m => `<option value="${m.nome||m}">`).join('')}</datalist>
            </div>
          </div>

          <div class="form-group">
            <label>Por que está separando? (fica no histórico)</label>
            <input type="text" id="sepMotivo" placeholder="Ex: eram três transportes registrados como um só">
          </div>

          <button class="btn btn-primary" style="width:100%" id="sepBtn" onclick="_sepConfirmar(${rotaId})">✂️ Separar</button>
          <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('modalSeparar').remove()">Cancelar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  _sepAtualizar();
}
window._histAbrirSeparar = _histAbrirSeparar;

function _atuaEscSep(t){
  return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _sepMarcarGrupo(chk, trecho){
  document.querySelectorAll(`.sep-chk[data-trecho="${trecho.replace(/"/g,'&quot;')}"]`)
    .forEach(c => { c.checked = chk.checked; });
  _sepAtualizar();
}
window._sepMarcarGrupo = _sepMarcarGrupo;

function _sepTrocaDestino(){
  const novo = !document.getElementById('sepDestino')?.value;
  const bloco = document.getElementById('sepNova');
  if (bloco) bloco.style.display = novo ? '' : 'none';
}
window._sepTrocaDestino = _sepTrocaDestino;

/* Mostra o impacto antes de confirmar: quanto de frete sai desta viagem e
   quanto vai para a outra. É o número que o financeiro vai ver no fechamento,
   e ninguém deveria descobrir isso depois. */
function _sepAtualizar(){
  const box = document.getElementById('sepImpacto');
  if (!box) return;
  const marcados = [...document.querySelectorAll('.sep-chk:checked')];
  const todos = [...document.querySelectorAll('.sep-chk')];
  const soma = (arr) => arr.reduce((s,c)=> s + Number(c.getAttribute('data-frete')||0), 0);
  const totalGeral = soma(todos), totalSai = soma(marcados);
  const comCte = marcados.filter(c => c.getAttribute('data-cte')).length;

  box.innerHTML = `
    <div class="sep-imp-linha"><span>Marcados</span><strong>${marcados.length} de ${todos.length}</strong></div>
    <div class="sep-imp-linha"><span>Frete que sai</span><strong style="color:#f59e0b">R$ ${totalSai.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
    <div class="sep-imp-linha"><span>Fica nesta viagem</span><strong style="color:#22c55e">R$ ${(totalGeral-totalSai).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
    ${comCte ? `<div class="sep-imp-aviso">🧾 ${comCte} carro(s) com CT-e emitido — o fiscal será avisado.</div>` : ''}`;
}
window._sepAtualizar = _sepAtualizar;

async function _sepConfirmar(rotaOrigemId){
  const marcados = [...document.querySelectorAll('.sep-chk:checked')].map(c => parseInt(c.value));
  if (!marcados.length){ alert('Marque os carros que saem desta viagem.'); return; }
  const todos = document.querySelectorAll('.sep-chk').length;
  if (marcados.length === todos){ alert('Você marcou todos os carros. Para esvaziar a viagem, cancele-a em vez de separar.'); return; }

  const destinoId = document.getElementById('sepDestino')?.value || '';
  const motivo = document.getElementById('sepMotivo')?.value.trim() || 'separação de transportes registrados juntos';
  const usuario = _usuarioAtualNome() || 'Logística';
  const rotaOrigem = (rotasGlobais||[]).find(r => String(r.id)===String(rotaOrigemId));

  let nome = '', cegonha = '', motorista = '';
  if (!destinoId){
    nome = document.getElementById('sepNome')?.value.trim() || '';
    if (!nome){ alert('Dê um nome à nova viagem.'); return; }
    cegonha = document.getElementById('sepCegonha')?.value || '';
    motorista = document.getElementById('sepMotorista')?.value.trim() || '';
  }

  const destinoTxt = destinoId
    ? `a viagem #${destinoId}`
    : `uma viagem nova ("${nome}")`;
  if (!confirm(`Mover ${marcados.length} carro(s) para ${destinoTxt}?\n\nOs pedidos e os CT-es não são alterados — só o vínculo com a viagem.`)) return;

  const btn = document.getElementById('sepBtn');
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Separando...'; }

  try {
    // 1. Viagem de destino
    let destino = destinoId ? (rotasGlobais||[]).find(r => String(r.id)===String(destinoId)) : null;
    if (!destino){
      /* O nome da coluna é criado_por. Eu havia escrito criada_por_nome, que
         não existe na tabela — o banco recusava o insert inteiro e a
         separação parava no primeiro passo, sem mover nenhum carro. */
      const ins = {
        nome, status: rotaOrigem?.status || 'em_andamento',
        placa_cegonha: cegonha || null,
        motorista_1: motorista || null,
        corredor_id: rotaOrigem?.corredor_id || null,
        iniciada_em: rotaOrigem?.iniciada_em || null,
        criado_por: usuario
      };
      let { data, error } = await supabase.from('rotas_planejadas').insert(ins).select();

      /* Rede de segurança: se o banco reclamar de alguma coluna que não
         conhece, tenta de novo só com o essencial. Melhor criar a viagem sem
         um campo acessório do que travar a correção inteira por causa dele. */
      if (error && /column|schema cache/i.test(error.message||'')){
        console.warn('separar: coluna recusada, tentando com o essencial —', error.message);
        const essencial = { nome, status: ins.status, placa_cegonha: ins.placa_cegonha,
                            motorista_1: ins.motorista_1, corredor_id: ins.corredor_id };
        ({ data, error } = await supabase.from('rotas_planejadas').insert(essencial).select());
      }
      if (error) throw error;
      destino = data && data[0];
      if (!destino) throw new Error('não consegui criar a viagem de destino');
      rotasGlobais.push(destino);
    }

    // 2. Move os pedidos
    const { error: e1 } = await supabase.from('pedidos')
      .update({ rota_id: destino.id, placa_cegonha: destino.placa_cegonha || null })
      .in('id', marcados);
    if (e1) throw e1;

    // 3. Move o vínculo histórico junto: sem isso o carro continuaria
    //    aparecendo na viagem antiga, que é o problema que viemos resolver.
    for (const pid of marcados){
      try {
        const v = (viagemPedidosGlobais||[]).find(x =>
          String(x.rota_id)===String(rotaOrigemId) && String(x.pedido_id)===String(pid));
        if (v){
          await supabase.from('viagem_pedidos').update({ rota_id: destino.id }).eq('id', v.id);
          v.rota_id = destino.id;
        } else {
          const { data } = await supabase.from('viagem_pedidos')
            .insert({ rota_id: destino.id, pedido_id: pid }).select();
          if (data && data[0]) viagemPedidosGlobais.push(data[0]);
        }
      } catch(e){ console.warn('vínculo do pedido', pid, e?.message); }
    }

    // 4. Memória
    marcados.forEach(pid => {
      const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pid));
      if (p){ p.rotaId = destino.id; p.rota_id = destino.id; p.placaCegonha = destino.placa_cegonha || null; }
    });

    // 5. A conferência da viagem de origem não vale mais: o que foi conferido
    //    era outra composição.
    if (rotaOrigem?.conferida_em){
      try {
        await supabase.from('rotas_planejadas')
          .update({ conferida_em: null, conferida_por: null, conferida_origem: null })
          .eq('id', rotaOrigemId);
        rotaOrigem.conferida_em = null; rotaOrigem.conferida_por = null;
      } catch(_){}
    }

    // 6. Histórico, um registro por carro
    try {
      const linhas = marcados.map(pid => {
        const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pid));
        return {
          pedido_id: pid, status_anterior: p?.status, status_novo: p?.status,
          usuario_nome: usuario,
          usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'logistica'),
          observacao: `✂️ Separado da viagem ${rotaOrigem?.nome||('#'+rotaOrigemId)} para ${destino.nome||('#'+destino.id)} — ${motivo}.`
        };
      });
      if (typeof mmRegistrarHistorico === 'function') await mmRegistrarHistorico(linhas);
      else await supabase.from('historico_status').insert(linhas);
    } catch(e){ console.warn('histórico:', e?.message); }

    // 7. Fiscal, se houver CT-e no meio
    const comCte = marcados.filter(pid => {
      const p = (pedidosGlobais||[]).find(x => String(x.id)===String(pid));
      return p && (p.numeroCte || p.numero_cte);
    });
    if (comCte.length && typeof notificar === 'function'){
      try { await notificar({ perfil:'fiscal', tipo:'status', pedidoId: comCte[0],
        titulo:'✂️ Carga separada em viagens diferentes',
        mensagem:`${comCte.length} carro(s) com CT-e saíram da viagem ${rotaOrigem?.nome||('#'+rotaOrigemId)} para ${destino.nome||('#'+destino.id)}.` }); } catch(_){}
    }

    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();
    document.getElementById('modalSeparar')?.remove();
    if (typeof mmToast === 'function') mmToast(`✂️ ${marcados.length} carro(s) movidos para ${destino.nome||('#'+destino.id)}`);
    if (typeof recarregarPedidos === 'function') await recarregarPedidos();
    if (typeof _propagarMudancaOperacional === 'function') _propagarMudancaOperacional(true);
    if (typeof renderizarHistoricoCargas === 'function') renderizarHistoricoCargas();
  } catch(e){
    if (btn){ btn.disabled = false; btn.textContent = '✂️ Separar'; }
    alert('Erro ao separar: ' + (e.message||e));
  }
}
window._sepConfirmar = _sepConfirmar;
