/* =========================================================================
   MOVEMASTER — Gravação em LOTE

   O sistema tinha dez lugares com o mesmo padrão:

       for (const id of ids){
         await supabase.from('pedidos').update(...).eq('id', id);
         await supabase.from('historico_status').insert(...);
       }

   Uma ida ao servidor por carro, cada uma esperando a anterior. Com 11
   carros davam 22 esperas em fila — 6 a 7 segundos — e a tela ia se
   preenchendo aos poucos (4, depois 6, depois todos), porque a memória era
   atualizada a cada volta.

   Aqui ficam os dois auxiliares que resolvem isso de uma vez:
     mmAtualizarPedidos()  — um update para vários ids (ou vários patches)
     mmRegistrarHistorico() — um insert para vários eventos

   Ambos devolvem o mesmo formato dos laços antigos, para as telas não
   precisarem mudar o tratamento de erro.
   ========================================================================= */

/**
 * Atualiza vários pedidos numa chamada só.
 *
 * @param {Array} ids
 * @param {object|function} patch  objeto igual para todos, OU função
 *                                 (pedido) => patch, quando cada um muda de
 *                                 um jeito. Nesse caso os pedidos são
 *                                 agrupados por patch idêntico, e sai um
 *                                 update por grupo — normalmente 1 ou 2.
 * @param {function} [aplicarNaMemoria] (pedido, patch) => void
 */
async function mmAtualizarPedidos(ids, patch, aplicarNaMemoria) {
  const alvos = (ids || [])
    .map(id => (pedidosGlobais || []).find(x => String(x.id) === String(id)))
    .filter(Boolean);

  if (!alvos.length) return { ok: 0, falhas: [] };

  // Agrupa por patch idêntico: pedidos que mudam igual vão juntos
  const grupos = new Map();
  alvos.forEach(p => {
    const up = (typeof patch === 'function') ? patch(p) : patch;
    if (!up) return;
    const chave = JSON.stringify(up);
    if (!grupos.has(chave)) grupos.set(chave, { up, itens: [] });
    grupos.get(chave).itens.push(p);
  });

  let ok = 0;
  const falhas = [];

  for (const { up, itens } of grupos.values()) {
    try {
      const { error } = await supabase.from('pedidos')
        .update(up).in('id', itens.map(p => p.id));
      if (error) throw error;

      // Memória só depois do sucesso, e para o grupo inteiro de uma vez:
      // assim a tela redesenha completa em vez de aos pedaços.
      itens.forEach(p => {
        if (typeof aplicarNaMemoria === 'function') aplicarNaMemoria(p, up);
      });
      ok += itens.length;

    } catch (e) {
      falhas.push((e && e.message) || 'erro ao gravar');
      console.error('mmAtualizarPedidos:', e);
    }
  }

  return { ok, falhas };
}

/** Grava vários eventos de histórico num insert só. Nunca derruba o fluxo. */
async function mmRegistrarHistorico(eventos) {
  if (!Array.isArray(eventos) || !eventos.length) return;
  try {
    const { error } = await supabase.from('historico_status').insert(eventos);
    if (error) throw error;
  } catch (e) {
    console.warn('Histórico não gravado:', (e && e.message) || e);
  }
}

window.mmAtualizarPedidos = mmAtualizarPedidos;
window.mmRegistrarHistorico = mmRegistrarHistorico;
