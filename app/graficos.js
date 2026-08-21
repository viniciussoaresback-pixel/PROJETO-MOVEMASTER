/* MoveMaster — carregador: gráficos do painel + notificações (toasts). */
(function () {
  'use strict';
  ['graficos-core.js', 'toasts.js'].forEach(function (arquivo) {
    var s = document.createElement('script');
    s.src = arquivo;
    s.async = false;
    document.head.appendChild(s);
  });
})();
