/* MoveMaster — barra superior (perfil + avisos) e busca persistente por tabela.
   Aditivo: nao altera script.js nem o HTML original. */
(function () {
  'use strict';

  var CHAVE_BUSCA = 'mm:busca:';
  var ALERTA = /(atrasad|pendente|aguardando|cancelad)/i;

  function texto(el) { return (el.textContent || '').trim(); }

  function nomeUsuario() {
    var alvos = ['#usuarioLogado', '#nomeUsuario', '.usuario-nome', '[data-usuario]'];
    for (var i = 0; i < alvos.length; i++) {
      var el = document.querySelector(alvos[i]);
      if (el && texto(el)) return texto(el).slice(0, 40);
    }
    try {
      var bruto = localStorage.getItem('usuarioLogado') || localStorage.getItem('usuario');
      if (bruto) {
        var obj = JSON.parse(bruto);
        return (obj && (obj.nome || obj.email || obj.usuario)) || '';
      }
    } catch (e) { /* ignora */ }
    return '';
  }

  function iniciais(nome) {
    var p = nome.split(/\s+/).filter(Boolean);
    if (!p.length) return 'MM';
    return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }

  function coletarAvisos() {
    var avisos = [];
    var linhas = document.querySelectorAll('table tbody tr');
    for (var i = 0; i < linhas.length && avisos.length < 20; i++) {
      var t = texto(linhas[i]).replace(/\s+/g, ' ');
      if (ALERTA.test(t)) avisos.push(t.slice(0, 90));
    }
    return avisos;
  }

  function criarTopbar() {
    if (document.querySelector('.mm-topbar')) return null;
    var host = document.querySelector('main') || document.body;
    var bar = document.createElement('div');
    bar.className = 'mm-topbar';

    var spacer = document.createElement('div');
    spacer.className = 'mm-topbar-spacer';
    bar.appendChild(spacer);

    var wrapSino = document.createElement('div');
    wrapSino.className = 'mm-sino-wrap';
    var sino = document.createElement('button');
    sino.type = 'button';
    sino.className = 'mm-sino';
    sino.setAttribute('aria-label', 'Avisos');
    sino.textContent = '🔔';
    var painel = document.createElement('div');
    painel.className = 'mm-avisos';
    painel.hidden = true;
    wrapSino.appendChild(sino);
    wrapSino.appendChild(painel);
    bar.appendChild(wrapSino);

    var avisos = coletarAvisos();
    if (avisos.length) {
      var badge = document.createElement('span');
      badge.className = 'mm-sino-badge';
      badge.textContent = avisos.length > 9 ? '9+' : String(avisos.length);
      sino.appendChild(badge);
      avisos.forEach(function (a) {
        var it = document.createElement('div');
        it.className = 'mm-avisos-item';
        it.textContent = a;
        painel.appendChild(it);
      });
    } else {
      var vazio = document.createElement('div');
      vazio.className = 'mm-avisos-item mm-avisos-vazio';
      vazio.textContent = 'Nenhum aviso no momento.';
      painel.appendChild(vazio);
    }

    sino.addEventListener('click', function () { painel.hidden = !painel.hidden; });
    document.addEventListener('click', function (ev) {
      if (!wrapSino.contains(ev.target)) painel.hidden = true;
    });

    var nome = nomeUsuario();
    if (nome) {
      var perfil = document.createElement('div');
      perfil.className = 'mm-perfil';
      var av = document.createElement('div');
      av.className = 'mm-avatar';
      av.textContent = iniciais(nome);
      var lbl = document.createElement('span');
      lbl.className = 'mm-perfil-nome';
      lbl.textContent = nome;
      perfil.appendChild(av);
      perfil.appendChild(lbl);
      bar.appendChild(perfil);
    }

    host.insertBefore(bar, host.firstChild);
    return bar;
  }

  function aplicarFiltro(tabela, termo, contador) {
    var t = termo.trim().toLowerCase();
    var linhas = tabela.querySelectorAll('tbody tr');
    var visiveis = 0;
    for (var i = 0; i < linhas.length; i++) {
      var casa = !t || texto(linhas[i]).toLowerCase().indexOf(t) !== -1;
      linhas[i].style.display = casa ? '' : 'none';
      if (casa) visiveis++;
    }
    if (contador) {
      contador.textContent = t ? visiveis + ' de ' + linhas.length : linhas.length + ' registros';
    }
  }

  function montarBusca(tabela, indice) {
    if (tabela.dataset.mmBusca === '1') return;
    tabela.dataset.mmBusca = '1';
    var chave = CHAVE_BUSCA + (tabela.id || 'tab' + indice);

    var wrap = document.createElement('div');
    wrap.className = 'mm-busca';
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'mm-busca-input';
    input.placeholder = 'Buscar nesta tabela...';
    wrap.appendChild(input);

    var cont = document.createElement('span');
    cont.className = 'mm-busca-cont';

    var barra = document.createElement('div');
    barra.style.display = 'flex';
    barra.style.alignItems = 'center';
    barra.style.gap = '10px';
    barra.style.margin = '0 0 8px';
    barra.appendChild(wrap);
    barra.appendChild(cont);

    var pai = tabela.parentNode;
    pai.insertBefore(barra, tabela);

    var salvo = '';
    try { salvo = localStorage.getItem(chave) || ''; } catch (e) { /* ignora */ }
    input.value = salvo;
    aplicarFiltro(tabela, salvo, cont);

    input.addEventListener('input', function () {
      try { localStorage.setItem(chave, input.value); } catch (e) { /* ignora */ }
      aplicarFiltro(tabela, input.value, cont);
    });
  }

  function montarBuscas() {
    var tabelas = document.querySelectorAll('table');
    for (var i = 0; i < tabelas.length; i++) {
      var tb = tabelas[i];
      if (!tb.querySelector('tbody tr')) continue;
      if (tb.querySelectorAll('tbody tr').length < 4) continue;
      montarBusca(tb, i);
    }
  }

  function iniciar() {
    criarTopbar();
    montarBuscas();
    var alvo = document.querySelector('main') || document.body;
    var pendente = null;
    new MutationObserver(function () {
      clearTimeout(pendente);
      pendente = setTimeout(montarBuscas, 300);
    }).observe(alvo, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 400); });
  } else {
    setTimeout(iniciar, 400);
  }
})();
