/* MoveMaster — carregador: gráficos do painel + notificações (toasts) + exportação. */
(function () {
  'use strict';
  ['graficos-core.js', 'toasts.js', 'exportar.js'].forEach(function (arquivo) {
    var s = document.createElement('script');
    s.src = arquivo;
    s.async = false;
    document.head.appendChild(s);
  });
})();
