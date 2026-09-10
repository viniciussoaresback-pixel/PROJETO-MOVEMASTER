/* =========================================================================
   MEDIDOR v2 — funciona DEPOIS do carregamento

   A versão anterior embrulhava o fetch, então só via o que acontecia
   depois de ser colada — por isso deu "0 consultas". Esta lê o histórico
   que o próprio navegador guarda (Resource Timing), então pega tudo o que
   já rodou, inclusive o login.

   Uso: entre no sistema normalmente, cole isto e dê Enter.
   ========================================================================= */
(() => {
  const rec = performance.getEntriesByType('resource');

  const api = rec.filter(r => /\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\//.test(r.name));
  const arq = rec.filter(r => /\.(js|css|html)(\?|$)/.test(r.name));

  const linha = (r) => {
    const u = new URL(r.name);
    const nome = u.pathname.split('/').pop() + (u.searchParams.get('select') ? '?select' : '');
    return {
      recurso: nome,
      ms: Math.round(r.duration),
      espera_ms: Math.round(r.responseStart - r.requestStart),
      kb: Math.round((r.transferSize || 0) / 1024),
      cache: r.transferSize === 0 ? 'SIM' : 'não'
    };
  };

  console.log(`\n📡 SUPABASE: ${api.length} chamadas · ${Math.round(api.reduce((s,r)=>s+r.duration,0))} ms somados`);
  console.table(api.map(linha).sort((a,b)=>b.ms-a.ms).slice(0,20));

  // Consultas repetidas são o desperdício mais fácil de eliminar
  const cont = {};
  api.forEach(r => { const t = new URL(r.name).pathname.split('/').pop(); cont[t] = (cont[t]||0)+1; });
  const repet = Object.entries(cont).filter(([,n]) => n > 1);
  if (repet.length) {
    console.log('\n♻️ CONSULTAS REPETIDAS (candidatas a cache):');
    console.table(repet.map(([t,n]) => ({ tabela: t, vezes: n })));
  }

  console.log(`\n📦 ARQUIVOS: ${arq.length} · ${Math.round(arq.reduce((s,r)=>s+(r.transferSize||0),0)/1024)} kB baixados`);
  console.table(arq.map(linha).sort((a,b)=>b.ms-a.ms).slice(0,12));

  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) console.table([{
    'HTML (ms)': Math.round(nav.responseEnd),
    'interativo (ms)': Math.round(nav.domInteractive),
    'completo (ms)': Math.round(nav.loadEventEnd),
    'servido pelo SW': nav.transferSize === 0 ? 'SIM' : 'não'
  }]);
})()
