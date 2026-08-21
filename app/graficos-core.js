/* MoveMaster — gráficos do painel (SVG puro, sem biblioteca externa).
   Não altera script.js: apenas lê o que já foi renderizado e desenha
   um gráfico acima das listas de barras existentes. */
(function () {
  'use strict';

  var CSS = [
    '.mm-chart{margin:0 0 14px;padding:12px 10px 6px;border:1px solid var(--border-soft,rgba(255,255,255,.10));border-radius:12px;background:var(--surface-1,rgba(255,255,255,.03))}',
    '.mm-chart svg{display:block;width:100%;height:auto;overflow:visible}',
    '.mm-chart .mm-lbl{font-size:10px;fill:var(--text-secondary,#9ca3af);font-family:inherit}',
    '.mm-chart .mm-val{font-size:10px;font-weight:700;fill:var(--text-primary,#e5e7eb);font-family:inherit}',
    '.mm-chart .mm-grid{stroke:var(--border-soft,rgba(255,255,255,.10));stroke-width:1}',
    '.mm-chart .mm-bar{transition:opacity .18s ease}',
    '.mm-chart:hover .mm-bar{opacity:.75}',
    '.mm-chart .mm-bar:hover{opacity:1}',
    '.mm-donut-wrap{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '.mm-donut{width:132px;flex:0 0 132px}',
    '.mm-donut-legenda{font-size:.82rem;color:var(--text-secondary,#9ca3af);line-height:1.6}',
    '.mm-donut-legenda b{color:var(--text-primary,#e5e7eb)}',
    '.mm-donut-legenda i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}',
    '@media(max-width:520px){.mm-donut{flex:0 0 108px;width:108px}}'
  ].join('');

  function injetarCss() {
    if (document.getElementById('mm-chart-css')) return;
    var s = document.createElement('style');
    s.id = 'mm-chart-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function pct(el) {
    var b = el.querySelector('.dir-barra');
    if (!b) return 0;
    var m = /width:\s*([\d.]+)%/.exec(b.getAttribute('style') || '');
    return m ? parseFloat(m[1]) : 0;
  }

  function lerLinhas(container) {
    var out = [];
    container.querySelectorAll('.dir-barra-linha').forEach(function (linha) {
      var rot = linha.querySelector('.dir-barra-rot');
      var val = linha.querySelector('.dir-barra-val');
      var small = val ? val.querySelector('small') : null;
      var texto = '';
      if (val) {
        texto = (val.childNodes[0] && val.childNodes[0].nodeValue
          ? val.childNodes[0].nodeValue
          : val.textContent).trim();
      }
      out.push({
        rotulo: rot ? rot.textContent.trim() : '',
        valor: texto,
        detalhe: small ? small.textContent.trim() : '',
        pct: pct(linha)
      });
    });
    return out;
  }

  function svgEl(nome, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', nome);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ---------- Colunas: faturamento por mês ---------- */
  function colunas(dados) {
    var W = 320, H = 130, pad = 18, base = H - 22, topo = 16;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.appendChild(svgEl('title', {})).textContent = 'Faturamento por mês';

    [0, 0.5, 1].forEach(function (f) {
      var y = topo + (base - topo) * f;
      svg.appendChild(svgEl('line', { x1: pad, x2: W - pad, y1: y, y2: y, class: 'mm-grid', 'stroke-dasharray': f === 1 ? '' : '3 4' }));
    });

    var n = dados.length || 1;
    var faixa = (W - pad * 2) / n;
    var larg = Math.min(30, faixa * 0.56);
    var maxPct = Math.max.apply(null, dados.map(function (d) { return d.pct; }).concat([1]));

    dados.forEach(function (d, i) {
      var x = pad + faixa * i + (faixa - larg) / 2;
      var h = Math.max(3, ((base - topo) * d.pct) / maxPct);
      var ultimo = i === dados.length - 1;
      var barra = svgEl('rect', {
        x: x, y: base - h, width: larg, height: h, rx: 4,
        class: 'mm-bar',
        fill: ultimo ? '#ff6a00' : 'rgba(255,106,0,0.45)'
      });
      barra.appendChild(svgEl('title', {})).textContent = d.rotulo + ': ' + d.valor + (d.detalhe ? ' · ' + d.detalhe : '');
      svg.appendChild(barra);

      var lbl = svgEl('text', { x: x + larg / 2, y: H - 6, 'text-anchor': 'middle', class: 'mm-lbl' });
      lbl.textContent = d.rotulo;
      svg.appendChild(lbl);

      if (ultimo) {
        var v = svgEl('text', { x: x + larg / 2, y: Math.max(10, base - h - 5), 'text-anchor': 'middle', class: 'mm-val' });
        v.textContent = d.valor;
        svg.appendChild(v);
      }
    });
    return svg;
  }

  /* ---------- Rosca: ocupação média da frota ---------- */
  function rosca(dados) {
    var soma = 0, cheios = 0;
    dados.forEach(function (d) {
      soma += d.pct;
      if (d.pct >= 80) cheios++;
    });
    var media = dados.length ? Math.round(soma / dados.length) : 0;
    var cor = media >= 80 ? '#4ade80' : media >= 40 ? '#fbbf24' : media > 0 ? '#fb923c' : '#6b7280';

    var wrap = document.createElement('div');
    wrap.className = 'mm-donut-wrap';

    var svg = svgEl('svg', { viewBox: '0 0 120 120', class: 'mm-donut', role: 'img' });
    svg.appendChild(svgEl('title', {})).textContent = 'Ocupação média da frota: ' + media + '%';
    var r = 48, c = 2 * Math.PI * r;
    svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r: r, fill: 'none', stroke: 'var(--border-soft,rgba(255,255,255,.12))', 'stroke-width': 12 }));
    var arco = svgEl('circle', {
      cx: 60, cy: 60, r: r, fill: 'none', stroke: cor, 'stroke-width': 12,
      'stroke-linecap': 'round', 'stroke-dasharray': c,
      'stroke-dashoffset': c * (1 - media / 100),
      transform: 'rotate(-90 60 60)'
    });
    svg.appendChild(arco);
    var t = svgEl('text', { x: 60, y: 64, 'text-anchor': 'middle', fill: 'var(--text-primary,#e5e7eb)', 'font-size': '24', 'font-weight': '700' });
    t.textContent = media + '%';
    svg.appendChild(t);
    var t2 = svgEl('text', { x: 60, y: 82, 'text-anchor': 'middle', class: 'mm-lbl' });
    t2.textContent = 'ocupação média';
    svg.appendChild(t2);
    wrap.appendChild(svg);

    var leg = document.createElement('div');
    leg.className = 'mm-donut-legenda';
    leg.innerHTML =
      '<div><i style="background:' + cor + '"></i><b>' + dados.length + '</b> veículo(s) próprio(s)</div>' +
      '<div><i style="background:#4ade80"></i><b>' + cheios + '</b> com 80% ou mais</div>' +
      '<div><i style="background:#6b7280"></i><b>' + dados.filter(function (d) { return d.pct === 0; }).length + '</b> sem carga</div>';
    wrap.appendChild(leg);
    return wrap;
  }

  var pintando = false;

  function pintar(id, construtor) {
    var el = document.getElementById(id);
    if (!el) return;
    var dados = lerLinhas(el);
    var antigo = el.previousElementSibling;
    if (antigo && antigo.classList.contains('mm-chart') && antigo.dataset.mmFor === id) antigo.remove();
    if (!dados.length) return;
    var box = document.createElement('div');
    box.className = 'mm-chart';
    box.dataset.mmFor = id;
    box.appendChild(construtor(dados));
    pintando = true;
    el.parentNode.insertBefore(box, el);
    pintando = false;
  }

  function render() {
    if (pintando) return;
    pintar('dirFaturamento', colunas);
    pintar('dirFrota', rosca);
  }

  function iniciar() {
    injetarCss();
    render();
    ['dirFaturamento', 'dirFrota'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(function () {
        if (pintando) return;
        clearTimeout(el._mmT);
        el._mmT = setTimeout(render, 60);
      }).observe(el, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
