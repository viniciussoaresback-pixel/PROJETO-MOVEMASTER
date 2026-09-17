/* =========================================================================
   MOVEMASTER — ETAPA C: conciliação com o ATUA

   Compara o que o sistema registrou contra o relatório do ATUA, cruzando
   pelo NÚMERO DO CT-E — a única chave que os dois lados têm em comum.

   O resultado separa em cinco grupos:
     🟢 conferem            — mesmo CT-e, mesmo valor
     🟡 divergentes         — mesmo CT-e, valor diferente
     🔴 só no ATUA          — emitido fora do sistema
     🔴 só no sistema       — não chegou ao fiscal
     📕 cancelados no ATUA  — atualizam a situação fiscal (etapa B)

   O sistema aponta; quem decide é você. Nada é alterado sem confirmação,
   exceto a situação fiscal dos cancelados, que é fato consultável na fonte
   oficial — e mesmo esses só mudam quando você manda aplicar.

   Lê CSV e Excel. O cabeçalho é reconhecido por aproximação, porque o nome
   das colunas varia entre relatórios.
   ========================================================================= */

// Nomes de coluna aceitos, em ordem de preferência.
// Ajustado sobre o relatório real do ATUA ("resultado detalhado"), que usa
// nr_ctrc, vl_frete_empresa e dt_cancelamento — nenhum deles seria
// reconhecido pelos termos genéricos que eu supunha no começo.
const ATUA_COLUNAS = {
  numero:   ['nr_ctrc', 'ctrc', 'nr_cte', 'num_cte', 'ct-e', 'cte', 'numero', 'número', 'nro', 'documento'],
  // vl_frete_empresa é o VALOR DO FRETE cobrado do cliente.
  // Cuidado com vl_resultado: é a margem depois dos impostos, não o frete —
  // usá-lo daria divergência em todas as linhas.
  valor:    ['vl_frete_empresa', 'frete_empresa', 'vl_frete', 'valor_frete', 'vl_total', 'valor_total', 'valor', 'frete'],
  // No relatório real o cancelamento é uma DATA preenchida, não a palavra
  // "cancelado" num campo de status. Os dois formatos são aceitos.
  cancelamento: ['dt_cancelamento', 'data_cancelamento'],
  situacao: ['situacao', 'situação', 'status'],
  cliente:  ['nm_pessoa_pagador', 'nm_pessoa_destinatario', 'tomador', 'pagador', 'cliente', 'destinatario', 'destinatário'],
  emissao:  ['dt_emissao', 'emissao', 'emissão', 'data']
};

function _atuaNorm(t){
  return String(t||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim();
}
function _atuaNum(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  // "1.234,56" e "1234.56" viram 1234.56
  const t = String(v).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
function _atuaEsc(t){
  return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _atuaFmt(n){
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});
}

/** Descobre qual coluna da planilha corresponde a cada campo. */
function _atuaMapearColunas(cabecalho){
  const mapa = {};
  const nomes = cabecalho.map(c => _atuaNorm(c));

  Object.keys(ATUA_COLUNAS).forEach(campo => {
    // Percorre os termos NA ORDEM da lista e, para cada um, tenta primeiro o
    // nome exato. Sem isso, "valor" casaria com vl_resultado antes de
    // vl_frete_empresa ser testado — e o valor comparado seria o errado.
    for (const termo of ATUA_COLUNAS[campo]){
      let idx = nomes.findIndex(n => n === termo);
      if (idx < 0) idx = nomes.findIndex(n => n.includes(termo));
      if (idx >= 0){ mapa[campo] = idx; return; }
    }
  });
  return mapa;
}

function atuaAbrirConciliacao(){
  const old = document.getElementById('modalAtua'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'modalAtua';
  div.className = 'atua-overlay';
  div.innerHTML = `
    <div class="atua-painel">
      <div class="atua-topo">
        <strong>🔗 Conciliação com o ATUA</strong>
        <button class="atua-fechar" onclick="document.getElementById('modalAtua').remove()">✕</button>
      </div>
      <div class="atua-corpo" id="atuaCorpo">
        <p class="atua-ajuda">
          Anexe o relatório do ATUA do período. O sistema cruza pelo número do CT-e
          e aponta apenas o que não bate — você trata as exceções, não os 142 documentos.
        </p>
        <div class="atua-periodo">
          <label>De <input type="date" id="atuaDe" value="${document.getElementById('confDe')?.value || ''}"></label>
          <label>Até <input type="date" id="atuaAte" value="${document.getElementById('confAte')?.value || ''}"></label>
        </div>
        <input type="file" id="atuaArquivo" accept=".csv,.xlsx,.xls" onchange="atuaProcessar()">
        <p class="atua-ajuda">Aceita CSV e Excel. O cruzamento é pelo número do CT-e.</p>
        <button class="btn btn-secondary btn-sm" id="atuaBtnReprocessar" style="display:none;margin-top:8px"
                onclick="atuaProcessar(true)">↻ Conferir de novo</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

/* A leitura ficava presa em "⏳ Lendo o relatório..." e nunca terminava.
   Causa: só a leitura do arquivo estava dentro de try/catch. Qualquer erro
   DEPOIS dela — consulta ao banco, uma variável global que ainda não existe,
   uma linha estranha do relatório — virava uma promessa rejeitada sem dono.
   Como a função é async e chamada pelo onchange, ninguém recebia o erro: a
   mensagem de carregando ficava na tela para sempre, sem nada no console
   apontando para a conciliação.
   Agora o processamento inteiro está protegido e qualquer falha aparece na
   tela, com o motivo. */
async function atuaProcessar(reprocessar){
  const corpo = document.getElementById('atuaCorpo');
  const arq = document.getElementById('atuaArquivo')?.files?.[0];
  if (!arq){
    if (reprocessar) alert('Escolha o arquivo do ATUA primeiro.');
    return;
  }
  try {
    await _atuaProcessarInterno(arq, corpo);
  } catch(e){
    console.error('conciliação ATUA:', e);
    corpo.innerHTML = `
      <p style="color:#f87171"><strong>A conferência parou com um erro.</strong></p>
      <p class="atua-ajuda">${_atuaEsc(e && e.message ? e.message : e)}</p>
      <button class="btn btn-secondary btn-sm" onclick="atuaProcessar(true)">↻ Tentar de novo</button>`;
  }
}

async function _atuaProcessarInterno(arq, corpo){
  const de  = document.getElementById('atuaDe')?.value || '';
  const ate = document.getElementById('atuaAte')?.value || '';
  corpo.innerHTML = '<p class="atua-ajuda">⏳ Lendo o relatório...</p>';

  if (typeof XLSX === 'undefined'){
    throw new Error('A biblioteca de leitura de planilhas não carregou. Atualize a página (Ctrl+Shift+R) e tente de novo — ela vem de um servidor externo e pode ter falhado.');
  }

  let linhas = [];
  try {
    const buf = await arq.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const aba = wb.Sheets[wb.SheetNames[0]];
    linhas = XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false });
  } catch(e){
    throw new Error('Não consegui ler o arquivo: ' + (e.message||e));
  }
  if (!linhas.length) throw new Error('O arquivo está vazio ou a primeira aba não tem dados.');

  // Acha a linha de cabeçalho: a primeira que tenha uma coluna de CT-e
  let iCab = -1, mapa = {};
  for (let i = 0; i < Math.min(linhas.length, 15); i++){
    const m = _atuaMapearColunas(linhas[i] || []);
    if (m.numero != null){ iCab = i; mapa = m; break; }
  }
  if (iCab < 0){
    corpo.innerHTML = `<p style="color:#f87171">Não encontrei uma coluna de CT-e no arquivo.</p>
      <p class="atua-ajuda">Colunas lidas: ${_atuaEsc((linhas[0]||[]).join(' · '))}</p>`;
    return;
  }

  // Monta o lado ATUA
  const atua = {};
  for (let i = iCab + 1; i < linhas.length; i++){
    const L = linhas[i] || [];
    // O número costuma vir como 59458.0 (numérico do Excel)
    const num = String(L[mapa.numero] ?? '').split('.')[0].replace(/\D/g,'');
    if (!num) continue;

    // Cancelado de duas formas: data de cancelamento preenchida (formato do
    // ATUA) ou a palavra num campo de status (outros relatórios).
    const dtCanc = mapa.cancelamento != null ? String(L[mapa.cancelamento]||'').trim() : '';
    const sit = _atuaNorm(mapa.situacao != null ? L[mapa.situacao] : '');
    const cancelado = !!dtCanc || sit.includes('cancel');

    atua[num] = {
      numero: num,
      valor: mapa.valor != null ? _atuaNum(L[mapa.valor]) : null,
      cliente: mapa.cliente != null ? String(L[mapa.cliente]||'') : '',
      cancelado,
      canceladoEm: dtCanc || null
    };
  }

  // Monta o lado MOVEMASTER (fotografia do fechamento, se houver; senão memória)
  const sistema = {};
  let origem = 'memória (período em aberto)';
  try {
    if (de && ate){
      const { data: f } = await supabase.from('fechamentos')
        .select('id').eq('periodo_de', de).eq('periodo_ate', ate)
        .eq('status','fechado').order('fechado_em',{ascending:false}).limit(1);
      if (f && f.length){
        const { data: itens } = await supabase.from('fechamento_itens')
          .select('*').eq('fechamento_id', f[0].id);
        (itens||[]).forEach(i => {
          if (!i.numero_cte) return;
          sistema[String(i.numero_cte).replace(/\D/g,'')] =
            { numero: i.numero_cte, valor: Number(i.valor_frete||0), cliente: i.cliente||'', pedidoId: i.pedido_id };
        });
        origem = 'fechamento oficial do período';
      }
    }
  } catch(e){ console.warn('fechamento não consultado:', e?.message); }

  if (!Object.keys(sistema).length){
    const _peds = (typeof pedidosGlobais !== 'undefined' && pedidosGlobais) ? pedidosGlobais : [];
    if (!_peds.length) throw new Error('Os pedidos ainda não terminaram de carregar. Aguarde a tela terminar de abrir e clique em "Conferir de novo".');
    _peds.forEach(p => {
      if (!p.numeroCte) return;
      const d = String(p.cteEmitidoEm||'').slice(0,10);
      if (de && d && d < de) return;
      if (ate && d && d > ate) return;
      sistema[String(p.numeroCte).replace(/\D/g,'')] =
        { numero: p.numeroCte, valor: Number(p.valorFrete||0), cliente: p.cliente||'', pedidoId: p.id };
    });
  }

  /* Cruzamento em duas frentes:
       1. ATUA  x  sistema   — o documento emitido bate com o registrado?
       2. sistema x tabela de trecho — o valor cobrado é o combinado?
     A segunda é a que faltava. Sem ela, um CT-e emitido com valor errado
     "confere" com o sistema e passa batido: os dois lados estão errados
     igualmente. A tabela de trecho é a única referência independente. */
  const conferem = [], divergentes = [], soAtua = [], soSistema = [], cancelados = [], foraTabela = [];

  const _valorEsperado = (pedidoId) => {
    if (!pedidoId || typeof valorTabelaFretePedido !== 'function') return null;
    const p = (typeof pedidosGlobais !== 'undefined' ? pedidosGlobais : []).find(x => String(x.id)===String(pedidoId));
    if (!p) return null;
    try { return valorTabelaFretePedido(p); } catch(_) { return null; }
  };

  Object.keys(atua).forEach(num => {
    const a = atua[num], s = sistema[num];
    if (!s){ soAtua.push(a); return; }
    if (a.cancelado){ cancelados.push({ ...a, pedidoId: s.pedidoId, valorSistema: s.valor }); return; }

    if (a.valor != null && Math.abs(a.valor - s.valor) >= 0.01){
      divergentes.push({ numero: num, atua: a.valor, sistema: s.valor, cliente: s.cliente, pedidoId: s.pedidoId });
      return;
    }

    // ATUA e sistema batem — falta conferir contra o combinado com o cliente.
    const ref = _valorEsperado(s.pedidoId);
    if (ref && ref.valor > 0 && Math.abs(ref.valor - s.valor) >= 0.01){
      foraTabela.push({ numero: num, cliente: s.cliente, cobrado: s.valor,
                        tabela: ref.valor, pedidoId: s.pedidoId });
      return;
    }
    conferem.push(a);
  });
  Object.keys(sistema).forEach(num => { if (!atua[num]) soSistema.push(sistema[num]); });

  window._atuaResultado = { cancelados };
  window._atuaColunaValor = (linhas[iCab]||[])[mapa.valor] || '(não encontrada)';
  _atuaRenderizar({ conferem, divergentes, soAtua, soSistema, cancelados, foraTabela, origem });
  const btn = document.getElementById('atuaBtnReprocessar');
  if (btn) btn.style.display = '';
}

function _atuaRenderizar(r){
  const corpo = document.getElementById('atuaCorpo');
  const total = (lista) => lista.reduce((s,x)=> s + Number(x.valor ?? x.sistema ?? 0), 0);

  const bloco = (icone, titulo, lista, corpoHTML) => !lista.length ? '' : `
    <div class="atua-bloco">
      <div class="atua-bloco-tit">${icone} ${titulo} <span class="atua-qtd">${lista.length}</span></div>
      ${corpoHTML}
    </div>`;

  corpo.innerHTML = `
    <div class="atua-resumo">
      Comparado contra: <strong>${_atuaEsc(r.origem)}</strong><br>
      Coluna de valor do ATUA: <strong>${_atuaEsc(window._atuaColunaValor||'—')}</strong><br>
      🟢 ${r.conferem.length} conferem · 🟡 ${r.divergentes.length} divergentes ·
      🟠 ${(r.foraTabela||[]).length} fora da tabela ·
      🔴 ${r.soAtua.length} só no ATUA · 🔴 ${r.soSistema.length} só no sistema ·
      📕 ${r.cancelados.length} cancelados
      ${(r.conferem.length && !r.divergentes.length && !(r.foraTabela||[]).length && !r.soAtua.length && !r.soSistema.length)
        ? '<br><strong style="color:#4ade80">✅ Nada a tratar neste período.</strong>' : ''}
    </div>

    ${bloco('🟢','Conferem', r.conferem,
      `<p class="atua-ajuda">${_atuaFmt(total(r.conferem))} — nada a fazer.</p>`)}

    ${bloco('🟡','Valor divergente', r.divergentes, `
      <table class="atua-tabela"><thead><tr><th>CT-e</th><th>Cliente</th><th class="right">Sistema</th><th class="right">ATUA</th><th class="right">Diferença</th></tr></thead>
      <tbody>${r.divergentes.map(d => `<tr>
        <td>${_atuaEsc(d.numero)}</td><td>${_atuaEsc(d.cliente)}</td>
        <td class="right">${_atuaFmt(d.sistema)}</td>
        <td class="right">${_atuaFmt(d.atua)}</td>
        <td class="right" style="color:#fbbf24">${_atuaFmt(d.atua - d.sistema)}</td>
      </tr>`).join('')}</tbody></table>`)}

    ${bloco('🟠','Valor fora da tabela de trecho', (r.foraTabela||[]), `
      <p class="atua-ajuda">O CT-e e o sistema batem entre si, mas o valor cobrado não é o da tabela combinada para o trecho. Os dois lados podem estar errados juntos — por isso a tabela é conferida à parte.</p>
      <table class="atua-tabela"><thead><tr><th>CT-e</th><th>Cliente</th><th class="right">Cobrado</th><th class="right">Tabela</th><th class="right">Diferença</th></tr></thead>
      <tbody>${(r.foraTabela||[]).map(d => `<tr>
        <td>${_atuaEsc(d.numero)}</td><td>${_atuaEsc(d.cliente)}</td>
        <td class="right">${_atuaFmt(d.cobrado)}</td>
        <td class="right">${_atuaFmt(d.tabela)}</td>
        <td class="right" style="color:#fb923c">${_atuaFmt(d.cobrado - d.tabela)}</td>
      </tr>`).join('')}</tbody></table>`)}

    ${bloco('🔴','Só no ATUA — emitido fora do sistema', r.soAtua, `
      <table class="atua-tabela"><thead><tr><th>CT-e</th><th>Tomador</th><th class="right">Valor</th></tr></thead>
      <tbody>${r.soAtua.map(a => `<tr><td>${_atuaEsc(a.numero)}</td><td>${_atuaEsc(a.cliente)}</td><td class="right">${_atuaFmt(a.valor)}</td></tr>`).join('')}</tbody></table>`)}

    ${bloco('🔴','Só no sistema — não consta no ATUA', r.soSistema, `
      <table class="atua-tabela"><thead><tr><th>CT-e</th><th>Cliente</th><th class="right">Valor</th></tr></thead>
      <tbody>${r.soSistema.map(a => `<tr><td>${_atuaEsc(a.numero)}</td><td>${_atuaEsc(a.cliente)}</td><td class="right">${_atuaFmt(a.valor)}</td></tr>`).join('')}</tbody></table>`)}

    ${bloco('📕','Cancelados no ATUA', r.cancelados, `
      <p class="atua-ajuda">Estes CT-es constam como cancelados na fonte oficial. Aplicar atualiza a situação fiscal no sistema (etapa B) e registra o evento com origem <strong>atua</strong>.</p>
      <table class="atua-tabela"><thead><tr><th>CT-e</th><th class="right">Valor no sistema</th></tr></thead>
      <tbody>${r.cancelados.map(c => `<tr><td>${_atuaEsc(c.numero)}</td><td class="right">${_atuaFmt(c.valorSistema)}</td></tr>`).join('')}</tbody></table>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="atuaAplicarCancelados()">📕 Aplicar cancelamentos</button>`)}

    <div class="atua-acoes">
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalAtua').remove()">Fechar</button>
    </div>`;
}

/** Atualiza a situação fiscal dos CT-es que o ATUA aponta como cancelados. */
async function atuaAplicarCancelados(){
  const lista = (window._atuaResultado?.cancelados || []).filter(c => c.pedidoId);
  if (!lista.length){ alert('Nenhum cancelamento a aplicar.'); return; }
  if (!confirm(`Marcar ${lista.length} CT-e(s) como cancelados, conforme o relatório do ATUA?`)) return;

  const usuario = document.getElementById('usuarioLogado')?.textContent || 'Financeiro';
  const agora = new Date().toISOString();
  let ok = 0;

  for (const c of lista){
    try {
      const p = (pedidosGlobais||[]).find(x => String(x.id)===String(c.pedidoId));
      const antes = p?.cteSituacao || 'emitido';
      if (antes === 'cancelado') continue;

      await supabase.from('pedidos').update({
        cte_situacao: 'cancelado', cte_cancelado_em: agora,
        cte_cancelado_por: usuario,
        cte_cancelado_motivo: 'Cancelamento confirmado pelo relatório do ATUA'
      }).eq('id', c.pedidoId);

      if (p){ p.cteSituacao = 'cancelado'; p.cteCanceladoEm = agora; }

      await supabase.from('cte_eventos').insert({
        pedido_id: c.pedidoId, numero_cte: c.numero, evento: 'cancelamento',
        situacao_antes: antes, situacao_depois: 'cancelado',
        motivo: 'Confirmado pelo relatório do ATUA',
        usuario_nome: usuario,
        usuario_perfil: (typeof perfilAtual!=='undefined'?perfilAtual:'financeiro'),
        origem: 'atua'
      });
      ok++;
    } catch(e){ console.error('cancelamento', c.numero, e); }
  }

  if (typeof mmToast === 'function') mmToast(`📕 ${ok} CT-e(s) marcados como cancelados`);
  document.getElementById('modalAtua')?.remove();
  if (typeof refrescarTelaAtual === 'function') refrescarTelaAtual();
}

window.atuaAbrirConciliacao = atuaAbrirConciliacao;
window.atuaProcessar = atuaProcessar;
window.atuaAplicarCancelados = atuaAplicarCancelados;
