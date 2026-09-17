/* ============================================================================
   DIAGNÓSTICO — carros aparecendo na viagem errada
   ============================================================================

   A carga que o Histórico mostra é a UNIÃO de duas fontes:

     1. viagem_pedidos  — o vínculo histórico, gravado quando o carro entra na
                          viagem. Ele é permanente de propósito: sem ele, um
                          carro transbordado sumiria da viagem que o trouxe.
     2. pedidos.rota_id — onde o carro está AGORA.

   Quando as duas discordam, o carro aparece nos dois lugares. É a explicação
   mais provável para os carros de Toledo/Londrina constarem na #137 mesmo já
   tendo outra viagem própria.

   Este script não altera nada. Ele só mostra, carro a carro, de onde cada um
   veio — e assim diz de que lado está o erro.

   COMO RODAR
   1. Entre no sistema (qualquer perfil que enxergue o Histórico de Cargas).
   2. F12 → Console.
   3. Cole o arquivo inteiro e dê Enter.
   4. Se quiser conferir outra viagem, troque o número na linha abaixo.
   ============================================================================ */

const VIAGEM = 137;   // <<< troque aqui para diagnosticar outra viagem

(async () => {
  if (typeof supabase === 'undefined' || !supabase){
    console.error('❌ Abra o sistema logado e rode de novo.'); return;
  }

  // Vínculos históricos desta viagem
  const { data: vincs, error: e1 } = await supabase
    .from('viagem_pedidos').select('*').eq('rota_id', VIAGEM);
  if (e1){ console.error('Erro ao ler vínculos:', e1.message); return; }

  // Pedidos que apontam para esta viagem agora
  const { data: peds, error: e2 } = await supabase
    .from('pedidos').select('id, placa, modelo, cliente, cidade_origem, cidade_destino, rota_id, numero_cte, valor_frete, status')
    .eq('rota_id', VIAGEM);
  if (e2){ console.error('Erro ao ler pedidos:', e2.message); return; }

  const idsVinc = new Set((vincs||[]).map(v => String(v.pedido_id)));
  const idsRota = new Set((peds||[]).map(p => String(p.id)));
  const todos   = [...new Set([...idsVinc, ...idsRota])];

  // Busca os dados de todos os envolvidos, inclusive os que só têm vínculo
  const { data: detalhes } = await supabase
    .from('pedidos')
    .select('id, placa, modelo, cliente, cidade_origem, cidade_destino, rota_id, numero_cte, valor_frete, status')
    .in('id', todos.map(Number));

  const porId = {};
  (detalhes||[]).forEach(p => { porId[String(p.id)] = p; });

  const linhas = todos.map(id => {
    const p = porId[id] || {};
    const temVinc = idsVinc.has(id);
    const temRota = String(p.rota_id||'') === String(VIAGEM);
    const v = (vincs||[]).find(x => String(x.pedido_id) === id);

    let origem, situacao;
    if (temVinc && temRota){ origem = 'vínculo + rota_id'; situacao = '✅ coerente'; }
    else if (temVinc && !temRota){
      origem = 'só vínculo';
      situacao = v && v.saiu_em
        ? `✅ saiu desta viagem (${v.motivo_saida||'transbordo'})`
        : `🚨 vínculo órfão — hoje está na viagem ${p.rota_id || '(nenhuma)'}`;
    }
    else { origem = 'só rota_id'; situacao = '⚠️ sem vínculo histórico'; }

    return {
      pedido: '#'+id,
      placa: p.placa || '?',
      trecho: `${(p.cidade_origem||'?')} → ${(p.cidade_destino||'?')}`,
      cliente: (p.cliente||'?').slice(0, 28),
      'rota atual': p.rota_id || '—',
      'CT-e': p.numero_cte || '—',
      frete: p.valor_frete || 0,
      origem, situacao
    };
  });

  console.log(`\n%c═══ VIAGEM #${VIAGEM} — de onde vem cada carro ═══`, 'font-size:15px;font-weight:bold');
  console.table(linhas);

  const orfaos = linhas.filter(l => l.situacao.startsWith('🚨'));
  const semVinculo = linhas.filter(l => l.situacao.startsWith('⚠️'));

  console.log('\n%cRESUMO', 'font-size:13px;font-weight:bold');
  console.log(`total exibido na carga: ${linhas.length}`);
  console.log(`coerentes: ${linhas.filter(l => l.situacao.startsWith('✅')).length}`);
  console.log(`🚨 vínculos órfãos (aparecem aqui mas pertencem a outra viagem): ${orfaos.length}`);
  console.log(`⚠️ sem vínculo histórico: ${semVinculo.length}`);

  if (orfaos.length){
    console.log('\n%cSão estes que estão sobrando na viagem:', 'color:#ef4444;font-weight:bold');
    console.table(orfaos);
    const somaFrete = orfaos.reduce((s,o) => s + Number(o.frete||0), 0);
    console.log(`Frete somado indevidamente nesta viagem: R$ ${somaFrete.toLocaleString('pt-BR',{minimumFractionDigits:2})}`);
    console.log('\nPara onde eles apontam hoje:',
      [...new Set(orfaos.map(o => o['rota atual']))].join(', '));
    console.log('\n👉 Me mande esta tabela. A correção é remover o vínculo órfão,');
    console.log('   sem tocar no pedido, no CT-e nem na outra viagem.');
  } else {
    console.log('\nNenhum vínculo órfão. Então os carros estão mesmo com rota_id apontando');
    console.log('para esta viagem — o erro foi na montagem da carga, e a correção é outra.');
  }

  window.__diagViagem = { vincs, peds, linhas, orfaos };
})();
