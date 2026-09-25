/* MoveMaster — carregador de CSS e JS auxiliares.
   Antes se chamava graficos.js, mas ele nunca fez gráfico: só monta as tags
   <link> e <script> dos arquivos abaixo. O nome antigo enganava. */
(function () {
  'use strict';
  // ATENÇÃO: a ordem importa. O último arquivo da lista tem a última palavra
  // nos conflitos de CSS. layout-amplo.css fica por último de propósito.
  // Faltavam três arquivos aqui: conciliacao-atua.css, refinamento-12.css e
  // refinamento-13.css. Existem no projeto, estão no cache do service worker,
  // mas ninguém os carregava — o JS da conciliação rodava e o modal aparecia
  // sem estilo nenhum, cru no canto da página. CSS ausente falha calado: não
  // dá erro no console, só fica feio.

  // ── Fura-cache ────────────────────────────────────────────────────────────
  // Toda vez que a gente publica novidade no CSS/JS auxiliar e o navegador
  // (ou o service worker do PWA) insiste em servir o arquivo antigo, é só
  // aumentar este número. O ?v=N no fim da URL engana o cache: pra ele, é
  // outro arquivo, então baixa de novo. Sem isso, mudança pequena de CSS
  // pode demorar dias pra aparecer no celular de quem já usava o sistema.
  var VERSAO = '20260925a';
  var v = '?v=' + VERSAO;

  ['tema-claro.css', 'refinamento-8.css', 'microinteracoes.css', 'tabelas-leves.css', 'refinamento-9.css', 'tema-claro-fix.css', 'tema-claro-cores.css', 'refinamento-10.css', 'refinamento-11.css', 'refinamento-12.css', 'refinamento-13.css', 'skeletons.css', 'trajetoria.css', 'cte-situacao.css', 'conciliacao-atua.css', 'campo-mobile.css', 'pneus.css', 'layout-amplo.css', 'tema-console.css', 'oficina.css'].forEach(function (css) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = css + v;
    document.head.appendChild(l);
  });
  ['graficos-core.js', 'toasts.js', 'exportar.js', 'refinamento-9.js', 'refinamento-10.js', 'refinamento-11.js'].forEach(function (arquivo) {
    var s = document.createElement('script');
    s.src = arquivo + v;
    s.async = false;
    document.head.appendChild(s);
  });
})();
