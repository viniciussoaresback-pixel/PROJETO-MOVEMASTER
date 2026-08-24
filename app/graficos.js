/* MoveMaster — carregador: gráficos do painel + notificações (toasts) + exportação + tema claro. */
(function () {
  'use strict';
  var l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'tema-claro.css';
  document.head.appendChild(l);
  ['graficos-core.js', 'toasts.js', 'exportar.js'].forEach(function (arquivo) {
    var s = document.createElement('script');
    s.src = arquivo;
    s.async = false;
    document.head.appendChild(s);
  });
})();
