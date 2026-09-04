/* MoveMaster — carregador: gráficos + toasts + exportação + tema claro + refinamentos. */
(function () {
  'use strict';
  // ATENÇÃO: a ordem importa. O último arquivo da lista tem a última palavra
  // nos conflitos de CSS. layout-amplo.css fica por último de propósito.
  ['tema-claro.css', 'refinamento-8.css', 'microinteracoes.css', 'tabelas-leves.css', 'refinamento-9.css', 'tema-claro-fix.css', 'tema-claro-cores.css', 'refinamento-10.css', 'refinamento-11.css', 'layout-amplo.css'].forEach(function (css) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = css;
    document.head.appendChild(l);
  });
  ['graficos-core.js', 'toasts.js', 'exportar.js', 'refinamento-9.js', 'refinamento-10.js', 'refinamento-11.js'].forEach(function (arquivo) {
    var s = document.createElement('script');
    s.src = arquivo;
    s.async = false;
    document.head.appendChild(s);
  });
})();
