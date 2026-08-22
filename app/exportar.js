/* MoveMaster — exportação de tabelas (Excel/CSV e PDF). Sem dependências externas. */
(function () {
  'use strict';

  function aviso(msg, tipo) {
    if (window.mmToast && typeof window.mmToast[tipo || 'info'] === 'function') {
      window.mmToast[tipo || 'info'](msg);
    }
  }

  function estilos() {
    if (document.getElementById('mm-exportar-css')) return;
    var css = document.createElement('style');
    css.id = 'mm-exportar-css';
    css.textContent = [
      '.mm-exp-bar{display:flex;justify-content:flex-end;gap:8px;margin:0 0 10px;flex-wrap:wrap}',
      '.mm-exp-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;',
      'font:600 12px/1 inherit;letter-spacing:.02em;cursor:pointer;border:1px solid var(--border-soft,rgba(128,128,128,.28));',
      'background:var(--surface-1,rgba(128,128,128,.06));color:inherit;transition:.18s ease}',
      '.mm-exp-btn:hover{border-color:#ff7a1a;color:#ff7a1a;transform:translateY(-1px)}',
      '.mm-exp-btn:active{transform:none}',
      '.mm-exp-btn svg{width:14px;height:14px;flex:0 0 auto}',
      '@media print{.mm-exp-bar{display:none!important}}',
      '@media (max-width:640px){.mm-exp-bar{justify-content:stretch}.mm-exp-btn{flex:1 1 auto;justify-content:center}}',
    ].join('');
    document.head.appendChild(css);
  }

  var ICONE_XLS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>';
  var ICONE_PDF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V4h12v5"/><rect x="6" y="13" width="12" height="8" rx="1"/><path d="M4 13h16"/></svg>';

  function visivel(el) {
    return !!(el && el.offsetParent !== null);
  }

  function nomeArquivo(tabela) {
    var sec = tabela.closest('.tab-content, section, .card, .painel');
    var t = sec && sec.querySelector('h1,h2,h3,h4');
    var base = (t && t.textContent) || document.title || 'movemaster';
    base = base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    var d = new Date();
    var p = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      (base || 'movemaster') +
      '-' +
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      '-' +
      p(d.getHours()) +
      p(d.getMinutes())
    );
  }

  function celulas(linha) {
    return Array.prototype.slice
      .call(linha.querySelectorAll('th,td'))
      .filter(function (c) {
        return !c.classList.contains('mm-nao-exportar') && visivel(c) !== false;
      })
      .map(function (c) {
        var input = c.querySelector('input,select,textarea');
        var txt = input ? input.value : c.textContent;
        return (txt || '').replace(/\s+/g, ' ').trim();
      });
  }

  function matriz(tabela) {
    var linhas = Array.prototype.slice.call(tabela.querySelectorAll('tr')).filter(function (tr) {
      return tr.offsetParent !== null || tr.parentElement.tagName === 'THEAD';
    });
    return linhas
      .map(celulas)
      .filter(function (l) {
        return l.some(function (v) {
          return v !== '';
        });
      });
  }

  function baixar(conteudo, nome, tipo) {
    var blob = new Blob(['\ufeff' + conteudo], { type: tipo + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function escapar(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function exportarExcel(tabela) {
    var dados = matriz(tabela);
    if (!dados.length) {
      aviso('Nada para exportar nesta tabela.', 'aviso');
      return;
    }
    var html =
      '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
      '<style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;font-family:Arial;font-size:11pt}' +
      'th{background:#1b1b1b;color:#fff}</style></head><body><table>' +
      dados
        .map(function (l, i) {
          var tag = i === 0 ? 'th' : 'td';
          return (
            '<tr>' +
            l
              .map(function (c) {
                return '<' + tag + '>' + escapar(c) + '</' + tag + '>';
              })
              .join('') +
            '</tr>'
          );
        })
        .join('') +
      '</table></body></html>';
    baixar(html, nomeArquivo(tabela) + '.xls', 'application/vnd.ms-excel');
    aviso('Planilha exportada (' + (dados.length - 1) + ' registros).', 'sucesso');
  }

  function exportarPDF(tabela) {
    var dados = matriz(tabela);
    if (!dados.length) {
      aviso('Nada para exportar nesta tabela.', 'aviso');
      return;
    }
    var titulo = nomeArquivo(tabela).replace(/-\d{8}-\d{4}$/, '').replace(/-/g, ' ');
    var w = window.open('', '_blank');
    if (!w) {
      aviso('Libere os pop-ups para gerar o PDF.', 'erro');
      return;
    }
    w.document.write(
      '<html><head><meta charset="utf-8"><title>' +
        escapar(titulo) +
        '</title><style>' +
        'body{font:12px/1.5 Arial,Helvetica,sans-serif;color:#111;margin:24px}' +
        'h1{font-size:16px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.06em}' +
        'p.meta{margin:0 0 16px;color:#666;font-size:11px}' +
        'table{border-collapse:collapse;width:100%}' +
        'th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}' +
        'thead th{background:#111;color:#fff;border-bottom:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em}' +
        'tbody tr:nth-child(even){background:#fafafa}' +
        '@page{size:landscape;margin:12mm}' +
        '</style></head><body><h1>' +
        escapar(titulo) +
        '</h1><p class="meta">MoveMaster · gerado em ' +
        new Date().toLocaleString('pt-BR') +
        '</p><table><thead><tr>' +
        dados[0]
          .map(function (c) {
            return '<th>' + escapar(c) + '</th>';
          })
          .join('') +
        '</tr></thead><tbody>' +
        dados
          .slice(1)
          .map(function (l) {
            return (
              '<tr>' +
              l
                .map(function (c) {
                  return '<td>' + escapar(c) + '</td>';
                })
                .join('') +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table></body></html>'
    );
    w.document.close();
    w.focus();
    setTimeout(function () {
      w.print();
    }, 350);
  }

  function criarBarra(tabela) {
    var alvo = tabela.closest('.tabela-scroll') || tabela;
    if (alvo.previousElementSibling && alvo.previousElementSibling.classList.contains('mm-exp-bar')) return;
    if (tabela.querySelectorAll('tr').length < 2) return;

    var bar = document.createElement('div');
    bar.className = 'mm-exp-bar';

    var bXls = document.createElement('button');
    bXls.type = 'button';
    bXls.className = 'mm-exp-btn';
    bXls.innerHTML = ICONE_XLS + '<span>Excel</span>';
    bXls.addEventListener('click', function () {
      exportarExcel(tabela);
    });

    var bPdf = document.createElement('button');
    bPdf.type = 'button';
    bPdf.className = 'mm-exp-btn';
    bPdf.innerHTML = ICONE_PDF + '<span>PDF</span>';
    bPdf.addEventListener('click', function () {
      exportarPDF(tabela);
    });

    bar.appendChild(bXls);
    bar.appendChild(bPdf);
    alvo.parentNode.insertBefore(bar, alvo);
  }

  function varrer() {
    estilos();
    Array.prototype.forEach.call(document.querySelectorAll('table'), function (t) {
      if (t.classList.contains('mm-nao-exportar')) return;
      criarBarra(t);
    });
  }

  function iniciar() {
    varrer();
    var pendente;
    var obs = new MutationObserver(function () {
      clearTimeout(pendente);
      pendente = setTimeout(varrer, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function () {
      clearTimeout(pendente);
      pendente = setTimeout(varrer, 350);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.mmExportar = { excel: exportarExcel, pdf: exportarPDF, varrer: varrer };
})();
