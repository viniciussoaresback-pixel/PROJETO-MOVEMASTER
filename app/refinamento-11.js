/* MoveMaster — Etapa 11: ordenacao por clique, densidade e atalhos (Ctrl+K / Esc).
   Aditivo: nao altera script.js nem o HTML original. */
(function () {
  'use strict';

  var CHAVE_DENS = 'mm:densidade';

  function texto(el) { return (el.textContent || '').trim(); }

  function valor(cel) {
    var t = texto(cel);
    var num = t.replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
    if (num && !isNaN(parseFloat(num)) && /\d/.test(t)) return parseFloat(num);
    var data = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (data) return new Date(+data[3], +data[2] - 1, +data[1]).getTime();
    return t.toLowerCase();
  }

  function ordenar(tabela, indice, dir) {
    var corpo = tabela.tBodies[0];
    if (!corpo) return;
    var linhas = Array.prototype.slice.call(corpo.rows);
    linhas.sort(function (a, b) {
      var va = valor(a.cells[indice] || document.createElement('td'));
      var vb = valor(b.cells[indice] || document.createElement('td'));
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
    });
    linhas.forEach(function (l) { corpo.appendChild(l); });
  }

  function ativarOrdenacao(tabela) {
    if (tabela.dataset.mmOrd === '1') return;
    if (!tabela.tBodies[0] || tabela.tBodies[0].rows.length < 2) return;
    tabela.dataset.mmOrd = '1';
    var cabecalhos = tabela.querySelectorAll('thead th');
    Array.prototype.forEach.call(cabecalhos, function (th, i) {
      th.classList.add('mm-th-ord');
      th.tabIndex = 0;
      var acionar = function () {
        var asc = !th.classList.contains('mm-ord-asc');
        Array.prototype.forEach.call(cabecalhos, function (o) {
          o.classList.remove('mm-ord-asc', 'mm-ord-desc');
        });
        th.classList.add(asc ? 'mm-ord-asc' : 'mm-ord-desc');
        ordenar(tabela, i, asc ? 1 : -1);
      };
      th.addEventListener('click', acionar);
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); acionar(); }
      });
    });
  }

  function ativarTabelas() {
    var tabelas = document.querySelectorAll('table');
    for (var i = 0; i < tabelas.length; i++) ativarOrdenacao(tabelas[i]);
  }

  function densidadeAtual() {
    try { return localStorage.getItem(CHAVE_DENS) || 'confortavel'; } catch (e) { return 'confortavel'; }
  }

  function aplicarDensidade(modo) {
    document.documentElement.setAttribute('data-densidade', modo);
    try { localStorage.setItem(CHAVE_DENS, modo); } catch (e) { /* ignora */ }
  }

  function botaoDensidade() {
    if (document.querySelector('.mm-dens-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-dens-btn';
    btn.title = 'Alternar densidade das tabelas';
    btn.setAttribute('aria-label', 'Alternar densidade das tabelas');
    btn.textContent = '☰';
    btn.addEventListener('click', function () {
      aplicarDensidade(densidadeAtual() === 'compacta' ? 'confortavel' : 'compacta');
    });
    var barra = document.querySelector('.mm-topbar');
    if (barra) barra.appendChild(btn);
    else document.body.appendChild(btn);
  }

  function atalhos() {
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        var campo = document.querySelector('.mm-busca-input');
        if (campo) { ev.preventDefault(); campo.focus(); campo.select(); }
        return;
      }
      if (ev.key === 'Escape') {
        var abertos = document.querySelectorAll('.modal, .modal-overlay, [class*="modal"]');
        for (var i = 0; i < abertos.length; i++) {
          var m = abertos[i];
          var visivel = m.offsetParent !== null && getComputedStyle(m).display !== 'none';
          if (!visivel) continue;
          var fechar = m.querySelector('.fechar, .close, [data-fechar], button[onclick*="fechar" i]');
          if (fechar) { fechar.click(); return; }
        }
      }
    });
  }

  function iniciar() {
    aplicarDensidade(densidadeAtual());
    ativarTabelas();
    botaoDensidade();
    atalhos();
    var alvo = document.querySelector('main') || document.body;
    var pendente = null;
    new MutationObserver(function () {
      clearTimeout(pendente);
      pendente = setTimeout(function () { ativarTabelas(); botaoDensidade(); }, 350);
    }).observe(alvo, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 600); });
  } else {
    setTimeout(iniciar, 600);
  }
})();
