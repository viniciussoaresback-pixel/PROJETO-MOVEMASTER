/* =========================================================================
   MOVEMASTER — Busca de histórico sob demanda
   ETAPA 1 do projeto de carregamento.

   Hoje o sistema baixa TODOS os pedidos e rotas em todo login, para que um
   carro de dois anos atrás possa ser encontrado nas raras vezes em que
   alguém precisa. O custo disso é pago por todo mundo, toda vez.

   Aqui está o outro caminho: consultar o servidor na hora, só quando a
   busca acontecer. O dado continua todo disponível — só não vem antes de
   ser pedido.

   Esta etapa é ADITIVA: não altera o carregamento atual, nada quebra.
   Ela existe para as telas passarem a usar; quando as principais estiverem
   apoiadas aqui, o carregamento inicial pode ser reduzido com segurança.
   ========================================================================= */

// Quantos registros no máximo por busca. Evita que um termo curto demais
// ("A") devolva o banco inteiro e recrie o problema que estamos resolvendo.
const BUSCA_LIMITE = 300;

function _bhNorm(v) {
  return String(v || '').trim();
}

function _bhPlaca(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Busca pedidos no servidor, em todo o histórico.
 *
 * @param {object} criterios
 *   placa    - placa ou chassi do carro transportado (parcial serve)
 *   cegonha  - placa da cegonha
 *   cliente  - nome do cliente (parcial)
 *   id       - número do pedido
 *   de/ate   - período (YYYY-MM-DD), opcionais
 * @returns {Promise<Array>} pedidos no mesmo formato de pedidosGlobais
 */
async function buscarPedidosNoServidor(criterios) {
  if (typeof supabase === 'undefined' || !supabase) return [];
  const c = criterios || {};

  let q = supabase.from('pedidos').select('*');

  if (c.id) {
    q = q.eq('id', parseInt(c.id, 10));
  } else {
    // ilike = busca parcial sem diferenciar maiúsculas
    if (_bhNorm(c.placa))   q = q.ilike('placa', '%' + _bhNorm(c.placa) + '%');
    if (_bhNorm(c.cegonha)) q = q.ilike('placa_cegonha', '%' + _bhNorm(c.cegonha) + '%');
    if (_bhNorm(c.cliente)) q = q.ilike('cliente', '%' + _bhNorm(c.cliente) + '%');
    if (c.de)  q = q.gte('created_at', c.de + 'T00:00:00');
    if (c.ate) q = q.lte('created_at', c.ate + 'T23:59:59');
  }

  q = q.order('created_at', { ascending: false }).limit(BUSCA_LIMITE);

  const { data, error } = await q;
  if (error) {
    console.warn('Busca de histórico falhou:', error.message);
    throw new Error(error.message);
  }

  const mapear = (typeof mapearPedidoDoBanco === 'function')
    ? mapearPedidoDoBanco
    : (p) => p;   // reserva: se o mapper mudar de lugar, não quebra

  return (data || []).map(mapear);
}

/**
 * Busca as viagens (rotas) de uma placa — cegonha OU carro transportado.
 * Responde "por onde esse veículo passou e quais viagens ele fez".
 */
async function buscarViagensPorPlaca(placa) {
  if (typeof supabase === 'undefined' || !supabase) return [];
  const alvo = _bhPlaca(placa);
  if (alvo.length < 4) throw new Error('Digite ao menos 4 caracteres da placa.');

  // 1) pedidos daquele carro, em todo o histórico
  const pedidos = await buscarPedidosNoServidor({ placa: alvo });

  // 2) rotas em que esses pedidos estiveram (inclui transbordo, pelo
  //    vínculo histórico, que nunca é apagado)
  const rotaIds = new Set();
  pedidos.forEach(p => { if (p.rotaId) rotaIds.add(p.rotaId); });

  try {
    const ids = pedidos.map(p => p.id);
    if (ids.length) {
      const { data: vps } = await supabase
        .from('viagem_pedidos').select('rota_id').in('pedido_id', ids);
      (vps || []).forEach(v => { if (v.rota_id) rotaIds.add(v.rota_id); });
    }
  } catch (e) { /* tabela opcional */ }

  // 3) a própria placa pode ser de uma cegonha
  let rotasDaCegonha = [];
  try {
    const { data } = await supabase
      .from('rotas_planejadas').select('*')
      .ilike('placa_cegonha', '%' + alvo + '%')
      .order('data_saida', { ascending: false }).limit(BUSCA_LIMITE);
    rotasDaCegonha = data || [];
  } catch (e) { /* segue */ }

  let rotas = [];
  if (rotaIds.size) {
    const { data } = await supabase
      .from('rotas_planejadas').select('*')
      .in('id', [...rotaIds])
      .order('data_saida', { ascending: false });
    rotas = data || [];
  }

  // junta sem repetir
  const porId = {};
  [...rotas, ...rotasDaCegonha].forEach(r => { porId[r.id] = r; });

  return {
    pedidos,
    rotas: Object.values(porId)
      .sort((a, b) => new Date(b.data_saida || 0) - new Date(a.data_saida || 0)),
    comoCegonha: rotasDaCegonha.length > 0,
    comoCarro: pedidos.length > 0
  };
}

/**
 * Traz para a memória pedidos que não estão em pedidosGlobais.
 * Usado quando uma tela precisa exibir um pedido antigo: em vez de manter
 * tudo carregado, puxamos só o que faltou, na hora.
 * Devolve quantos foram acrescentados.
 */
function mesclarPedidosNaMemoria(novos) {
  if (typeof pedidosGlobais === 'undefined' || !Array.isArray(novos)) return 0;
  const existentes = new Set(pedidosGlobais.map(p => String(p.id)));
  const faltando = novos.filter(p => !existentes.has(String(p.id)));
  if (faltando.length) pedidosGlobais = pedidosGlobais.concat(faltando);
  return faltando.length;
}

window.buscarPedidosNoServidor = buscarPedidosNoServidor;
window.buscarViagensPorPlaca = buscarViagensPorPlaca;
window.mesclarPedidosNaMemoria = mesclarPedidosNaMemoria;
