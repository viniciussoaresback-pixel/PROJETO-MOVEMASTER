/* MoveMaster — refinamento 10 (JS auxiliar): tooltips nos KPIs, entrada escalonada
   das linhas e ativação do login premium. Não altera script.js. */
(function () {
  'use strict';

  /* ---------- 1. Tooltips nos indicadores ---------- */
  var DICAS = [
    [/faturamento/i, 'Soma do valor dos fretes no período selecionado.'],
    [/frota|ocupa/i, 'Percentual médio de veículos em operação no período.'],
    [/frete/i, 'Total de fretes registrados considerando os filtros ativos.'],
    [/pedido/i, 'Pedidos registrados considerando os filtros ativos.'],
    [/pendente|aguard/i, 'Registros que ainda dependem de uma ação para avançar.'],
    [/atras/i, 'Registros que passaram do prazo previsto de entrega.'],
    [/conclu|entreg|finaliz/i, 'Registros já finalizados no período.'],
    [/cancel/i, 'Registros cancelados no período.'],
    [/cliente/i, 'Clientes distintos presentes nos registros filtrados.'],
    [/veic|caminh/i, 'Veículos cadastrados e disponíveis para alocação.'],
    [/motorista/i, 'Motoristas cadastrados e aptos a receber rotas.'],
    [/custo|despesa/i, 'Somatório de custos lançados no período.'],
    [/margem|lucro/i, 'Diferença entre receita e custos do período.'],
    [/ticket|m[eé]dia/i, 'Valor médio por registro no período.']
  ];

  function dicaPara(texto) {
    for (var i = 0; i < DICAS.length; i++) {
      if (DICAS[i][0].test(texto)) return DICAS[i][1];
    }
    return null;
  }

  function aplicarTooltips() {
    var cards = document.querySelectorAll('.cg-kpi, .kpi, .card-indicador, .indicador');
    Array.prototype.forEach.call(cards, function (card) {
      if (card.hasAttribute('data-mm-tip')) return;
      var rotulo = card.querySelector('.cg-kpi-lbl, .kpi-label, .kpi-lbl, small, .rotulo');
      var texto = (rotulo ? rotulo.textContent : card.textContent) || '';
      var dica = dicaPara(texto.trim());
      if (!dica) return;
      card.setAttribute('data-mm-tip', dica);
      card.setAttribute('tabindex', '0');
    });
  }

  /* ---------- 2. Entrada escalonada das linhas ---------- */
  function animarLinhas(tbody) {
    var linhas = tbody.querySelectorAll(':scope > tr');
    var limite = Math.min(linhas.length, 18);
    for (var i = 0; i < limite; i++) {
      var tr = linhas[i];
      if (tr.dataset.mmAnim === '1') continue;
      tr.dataset.mmAnim = '1';
      tr.style.setProperty('--mm-row-delay', i * 28 + 'ms');
      tr.classList.add('mm-row-in');
    }
  }

  function observarTabelas() {
    Array.prototype.forEach.call(document.querySelectorAll('tbody'), function (tbody) {
      if (tbody.dataset.mmObs === '1') return;
      tbody.dataset.mmObs = '1';
      animarLinhas(tbody);
      new MutationObserver(function () {
        Array.prototype.forEach.call(tbody.querySelectorAll(':scope > tr'), function (tr) {
          tr.dataset.mmAnim = '';
          tr.classList.remove('mm-row-in');
        });
        animarLinhas(tbody);
      }).observe(tbody, { childList: true });
    });
  }

  /* ---------- 3. Login premium ---------- */
  function ativarLogin() {
    var tela =
      document.querySelector('#login, #telaLogin, .tela-login, [id*="login" i]') || null;
    if (!tela) {
      var senha = document.querySelector('input[type="password"]');
      if (senha) {
        tela = senha.closest('section, div[id], main') || null;
      }
    }
    if (!tela) return;
    var visivel = tela.offsetParent !== null;
    if (!visivel) {
      tela.classList.remove('mm-login-premium');
      return;
    }
    tela.classList.add('mm-login-premium');
    var senha2 = tela.querySelector('input[type="password"]');
    var card = senha2 && senha2.closest('form, .card, .box, div');
    if (card && card !== tela) card.classList.add('mm-login-card');
  }

  function tick() {
    try {
      aplicarTooltips();
      observarTabelas();
      ativarLogin();
    } catch (e) {
      /* silencioso: camada estética não deve quebrar o app */
    }
  }

  function iniciar() {
    tick();
    new MutationObserver(function () {
      clearTimeout(iniciar._t);
      iniciar._t = setTimeout(tick, 120);
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function () {
      setTimeout(tick, 160);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
