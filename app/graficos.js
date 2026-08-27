/* MoveMaster — carregador: gráficos do painel + notificações (toasts) + exportação + tema claro + refinamento 8 + micro-interações. */
(function () {
  'use strict';
  ['tema-claro.css', 'refinamento-8.css', 'microinteracoes.css'].forEach(function (css) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = css;
    document.head.appendChild(l);
  });
  ['graficos-core.js', 'toasts.js', 'exportar.js'].forEach(function (arquivo) {
    var s = document.createElement('script');
    s.src = arquivo;
    s.async = false;
    document.head.appendChild(s);
  });
})();
