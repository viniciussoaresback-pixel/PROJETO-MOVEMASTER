/* =========================================================================
   MOVEMASTER — De-duplicação de consultas ao Supabase

   Medição do login: 39 chamadas, ~12 s somados. Dessas, 18 eram REPETIDAS:
     ocorrencias ........... 6x
     notificacoes .......... 5x
     solicitacoes_edicao ... 5x
     perfis ................ 2x
   São telas diferentes pedindo o mesmo dado ao mesmo tempo, sem saber uma
   da outra.

   Em vez de caçar e reescrever 39 pontos de chamada, interceptamos o fetch:
   se a MESMA URL de leitura for pedida de novo dentro de uma janela curta,
   devolvemos a resposta da primeira em vez de ir à rede outra vez.

   Escopo estreito de propósito:
     - só GET (nunca insert/update/delete)
     - só /rest/v1/ (dados; login e storage passam direto)
     - janela de 2,5 s — junta a rajada do login e nada além disso
   Ou seja: não é cache de verdade. Dois segundos depois, tudo volta a
   consultar o banco normalmente. Não há risco de mostrar dado velho.
   ========================================================================= */

(() => {
  const JANELA_MS = 2500;
  const emVoo = new Map();   // url -> { promessa, quando }

  const fetchOriginal = window.fetch;

  window.fetch = function (entrada, opcoes) {
    try {
      const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
      const metodo = ((opcoes && opcoes.method) || (entrada && entrada.method) || 'GET').toUpperCase();

      const elegivel = metodo === 'GET'
        && url.includes('/rest/v1/')
        && !url.includes('/auth/v1/')
        && !url.includes('/storage/v1/');

      if (!elegivel) return fetchOriginal.apply(this, arguments);

      const agora = Date.now();
      const anterior = emVoo.get(url);

      if (anterior && (agora - anterior.quando) < JANELA_MS) {
        // Devolve um clone: cada chamador precisa poder ler o corpo.
        return anterior.promessa.then(r => r.clone());
      }

      const promessa = fetchOriginal.apply(this, arguments).then(r => {
        // Guarda o clone, não o original — o original vai para quem pediu.
        const guardado = r.clone();
        emVoo.set(url, { promessa: Promise.resolve(guardado), quando: Date.now() });
        return r;
      }).catch(e => {
        emVoo.delete(url);   // falhou: não guarda, para a próxima tentar de novo
        throw e;
      });

      emVoo.set(url, { promessa, quando: agora });
      return promessa.then(r => r.clone());

    } catch (e) {
      // Qualquer imprevisto aqui não pode derrubar uma requisição.
      console.warn('dedupe-consultas:', e);
      return fetchOriginal.apply(this, arguments);
    }
  };

  // Limpeza periódica para o mapa não crescer indefinidamente
  setInterval(() => {
    const limite = Date.now() - JANELA_MS;
    emVoo.forEach((v, k) => { if (v.quando < limite) emVoo.delete(k); });
  }, 10000);

  // Usado pelo botão Atualizar: um clique explícito nunca pode receber
  // resposta guardada da rajada anterior.
  window.__mmLimparDedupe = () => emVoo.clear();

  console.info('dedupe de consultas ativo (janela de ' + JANELA_MS + 'ms)');
})();

/* =========================================================================
   ATUALIZAR TUDO — botão do cabeçalho

   Recarrega os dados do servidor sob demanda, em vez de o sistema tentar
   adivinhar quando precisa. Mostra o ícone girando enquanto trabalha e a
   hora da última atualização no title do botão.
   ========================================================================= */

async function atualizarTudo() {
  const btn = document.getElementById('btnAtualizarTudo');
  if (btn && btn.classList.contains('girando')) return;   // já está rodando
  if (btn) btn.classList.add('girando');

  try {
    // Zera a janela de de-duplicação: este clique é um pedido explícito de
    // dado fresco, então nada pode ser servido da rajada anterior.
    if (typeof window.__mmLimparDedupe === 'function') window.__mmLimparDedupe();

    if (typeof carregarDadosDoSupabase === 'function') {
      await carregarDadosDoSupabase();
    }

    // Redesenha a aba que está aberta, para o dado novo aparecer na hora
    const aba = window.__mmAbaAtual;
    const porAba = {
      painel: 'carregarPainel', logistica: 'carregarLogistica',
      conferencia: 'renderizarCentralConferencia', cobranca: 'renderizarCobranca',
      comercialPedidos: 'renderizarComercialPedidos', comercial: 'renderizarPedidosComercial',
      tabelaFrete: 'renderizarTabelaFrete', remunTrecho: 'renderizarTabelaPrecos',
      motorista: 'carregarPedidosMotorista', fiscal: 'carregarDadosFiscal'
    };
    const fn = porAba[aba];
    if (fn && typeof window[fn] === 'function') { try { window[fn](); } catch (e) { console.warn(fn, e); } }

    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (btn) btn.title = 'Atualizado às ' + hora + ' — clique para buscar de novo';
    if (typeof mmToast === 'function') mmToast('✅ Dados atualizados');

  } catch (e) {
    console.error('atualizarTudo:', e);
    if (typeof mmToast === 'function') mmToast('Não foi possível atualizar agora.');
  } finally {
    if (btn) btn.classList.remove('girando');
  }
}

window.atualizarTudo = atualizarTudo;
