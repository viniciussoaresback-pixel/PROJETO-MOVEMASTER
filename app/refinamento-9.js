/* MoveMaster — Refinamento 9 (aditivo): variação nos KPIs, cabeçalhos de seção,
   contadores e estados vazios. Não altera script.js. */
(function () {
  'use strict';

  var CHAVE = 'mm_kpi_hist';

  var SECOES = {
    comercial: { titulo: 'Comercial', sub: 'Pedidos, clientes e propostas em andamento.', unidade: 'registros' },
    logistica: { titulo: 'Logística', sub: 'Fretes, rotas e acompanhamento da operação.', unidade: 'fretes' },
    diretoria: { titulo: 'Diretoria', sub: 'Visão executiva de faturamento e frota.', unidade: 'indicadores' },
    cadastro:  { titulo: 'Cadastros', sub: 'Base de clientes, veículos e motoristas.', unidade: 'cadastros' }
  };

  function num(txt) {
    var limpo = String(txt || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    var n = parseFloat(limpo);
    return isNaN(n) ? null : n;
  }

  function hist() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch (e) { return {}; }
  }
  function salvarHist(h) {
    try { localStorage.setItem(CHAVE, JSON.stringify(h)); } catch (e) {}
  }

  function variacaoKpis() {
    var h = hist(), mudou = false;
    document.querySelectorAll('.cg-kpi').forEach(function (card, i) {
      var elNum = card.querySelector('.cg-kpi-num');
      var elLbl = card.querySelector('.cg-kpi-lbl');
      if (!elNum) return;
      var chave = (elLbl ? elLbl.textContent.trim() : 'kpi') + '#' + i;
      var atual = num(elNum.textContent);
      if (atual === null) return;
      var anterior = h[chave];
      if (typeof anterior === 'number' && anterior !== 0) {
        var pct = ((atual - anterior) / Math.abs(anterior)) * 100;
        var dir = pct > 0.5 ? 'alta' : (pct < -0.5 ? 'baixa' : 'neutro');
        var seta = dir === 'alta' ? '▲' : (dir === 'baixa' ? '▼' : '■');
        var badge = card.querySelector('.cg-kpi-var');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'cg-kpi-var';
          card.appendChild(badge);
        }
        badge.setAttribute('data-dir', dir);
        badge.innerHTML = seta + ' ' + Math.abs(pct).toFixed(1).replace('.', ',') + '% <small>vs. anterior</small>';
      }
      if (h[chave] !== atual) { h[chave] = atual; mudou = true; }
    });
    if (mudou) salvarHist(h);
  }

  function cabecalhos() {
    Object.keys(SECOES).forEach(function (id) {
      var sec = document.getElementById(id) || document.querySelector('[data-tab="' + id + '"]');
      if (!sec || sec.querySelector(':scope > .mm-sec-head')) return;
      var cfg = SECOES[id];
      var head = document.createElement('div');
      head.className = 'mm-sec-head';
      head.innerHTML =
        '<div><div class="mm-sec-title">' + cfg.titulo +
        '<span class="mm-sec-count" data-mm-count>0</span></div>' +
        '<p class="mm-sec-sub">' + cfg.sub + '</p></div>';
      sec.insertBefore(head, sec.firstChild);
    });
  }

  function contadores() {
    document.querySelectorAll('.mm-sec-head').forEach(function (head) {
      var sec = head.parentElement;
      var alvo = head.querySelector('[data-mm-count]');
      if (!sec || !alvo) return;
      var linhas = sec.querySelectorAll('table tbody tr');
      var total = 0;
      linhas.forEach(function (tr) {
        if (tr.offsetParent !== null && tr.querySelectorAll('td').length > 1) total++;
      });
      var id = sec.id || '';
      var unidade = (SECOES[id] && SECOES[id].unidade) || 'itens';
      alvo.textContent = total + ' ' + unidade;
    });
  }

  var ICONE =
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 7h18M3 12h18M3 17h10"/><circle cx="18" cy="17" r="3.2"/></svg>';

  function estadosVazios() {
    document.querySelectorAll('table').forEach(function (tabela) {
      var tbody = tabela.tBodies && tabela.tBodies[0];
      if (!tbody) return;
      var vazia = tbody.querySelectorAll('tr').length === 0;
      var wrap = tabela.parentElement;
      if (!wrap) return;
      var existente = wrap.querySelector(':scope > .mm-empty');
      if (vazia) {
        tabela.style.display = 'none';
        if (!existente) {
          var box = document.createElement('div');
          box.className = 'mm-empty';
          box.innerHTML = ICONE +
            '<div class="mm-empty-t">Nenhum registro por aqui ainda</div>' +
            '<div class="mm-empty-d">Assim que os dados forem cadastrados, eles aparecem nesta lista automaticamente.</div>';
          wrap.appendChild(box);
        }
      } else {
        tabela.style.display = '';
        if (existente) existente.remove();
      }
    });
  }

  function atualizar() {
    try {
      cabecalhos();
      variacaoKpis();
      contadores();
      estadosVazios();
    } catch (e) { /* aditivo: nunca quebra a aplicação */ }
  }

  function iniciar() {
    atualizar();
    var t;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(atualizar, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
