/* =========================================================================
   MOVEMASTER — Medidor de lentidão
   Cole no console (F12) e recarregue a página. Depois rode: relatorio()

   Mede três coisas separadas, porque cada uma tem causa e correção
   diferente. Otimizar sem medir é chutar — e chutar custa caro.
   ========================================================================= */
(() => {
  window.__mmMedidas = { rede: [], render: [] };

  // 1) Cada consulta ao Supabase, com tempo e tamanho
  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const url = String(args[0]?.url || args[0] || '');
    const t0 = performance.now();
    const r = await fetchOriginal.apply(this, args);
    const ms = Math.round(performance.now() - t0);
    if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
      const tabela = (url.split('/rest/v1/')[1] || url).split('?')[0];
      let kb = 0;
      try { kb = Math.round((await r.clone().arrayBuffer()).byteLength / 1024); } catch (e) {}
      window.__mmMedidas.rede.push({ tabela, ms, kb });
    }
    return r;
  };

  // 2) Cada redesenho de tela (as funções renderizar*/carregar*)
  setTimeout(() => {
    Object.keys(window).forEach((nome) => {
      if (!/^(renderizar|carregar)/.test(nome)) return;
      if (typeof window[nome] !== 'function') return;
      const orig = window[nome];
      window[nome] = function (...a) {
        const t0 = performance.now();
        const r = orig.apply(this, a);
        const ms = Math.round(performance.now() - t0);
        if (ms > 15) window.__mmMedidas.render.push({ funcao: nome, ms });
        return r;
      };
    });
    console.log('✅ medidor ativo — use o sistema normalmente e depois rode relatorio()');
  }, 1500);

  window.relatorio = function () {
    const m = window.__mmMedidas;

    const somaRede = m.rede.reduce((s, x) => s + x.ms, 0);
    const somaKb   = m.rede.reduce((s, x) => s + x.kb, 0);
    console.log(`\n📡 REDE: ${m.rede.length} consultas · ${somaKb} kB · ${somaRede} ms somados`);
    console.table(m.rede.slice().sort((a, b) => b.ms - a.ms).slice(0, 15));

    console.log('\n🎨 REDESENHO (só o que passou de 15ms):');
    const porFuncao = {};
    m.render.forEach((x) => {
      porFuncao[x.funcao] = porFuncao[x.funcao] || { funcao: x.funcao, vezes: 0, msTotal: 0, pior: 0 };
      porFuncao[x.funcao].vezes++;
      porFuncao[x.funcao].msTotal += x.ms;
      porFuncao[x.funcao].pior = Math.max(porFuncao[x.funcao].pior, x.ms);
    });
    console.table(Object.values(porFuncao).sort((a, b) => b.msTotal - a.msTotal).slice(0, 15));

    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      console.log('\n⏱️ CARREGAMENTO DA PÁGINA:');
      console.table([{
        'até o HTML (ms)':      Math.round(nav.responseEnd),
        'até interativo (ms)':  Math.round(nav.domInteractive),
        'até completo (ms)':    Math.round(nav.loadEventEnd)
      }]);
    }
  };
})();
