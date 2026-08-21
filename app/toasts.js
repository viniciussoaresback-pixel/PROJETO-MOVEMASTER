/* MoveMaster — notificações discretas (toasts) no lugar dos alert(). */
(function () {
  'use strict';
  var CSS = [
    '#mm-toasts{position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:10px;max-width:min(360px,calc(100vw - 32px));pointer-events:none}',
    '.mm-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;border:1px solid var(--border-soft,rgba(255,255,255,.12));background:var(--surface-1,#1b1b1f);color:var(--text-primary,#e5e7eb);box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:.88rem;line-height:1.45;opacity:0;transform:translateX(18px);transition:opacity .22s ease,transform .22s ease}',
    '.mm-toast.mm-in{opacity:1;transform:none}',
    '.mm-toast.mm-out{opacity:0;transform:translateX(18px)}',
    '.mm-toast .mm-ic{flex:0 0 18px;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;margin-top:1px}',
    '.mm-toast .mm-msg{flex:1 1 auto;word-break:break-word;white-space:pre-line}',
    '.mm-toast .mm-x{flex:0 0 auto;border:0;background:transparent;color:var(--text-secondary,#9ca3af);font-size:16px;line-height:1;cursor:pointer;padding:0 2px;border-radius:6px}',
    '.mm-toast .mm-x:hover{color:var(--text-primary,#e5e7eb)}',
    '.mm-toast.mm-ok{border-left:3px solid #4ade80}.mm-toast.mm-ok .mm-ic{background:#4ade80}',
    '.mm-toast.mm-err{border-left:3px solid #ef4444}.mm-toast.mm-err .mm-ic{background:#ef4444}',
    '.mm-toast.mm-warn{border-left:3px solid #fbbf24}.mm-toast.mm-warn .mm-ic{background:#fbbf24;color:#1b1b1f}',
    '.mm-toast.mm-info{border-left:3px solid #ff6a00}.mm-toast.mm-info .mm-ic{background:#ff6a00}',
    '@media(max-width:520px){#mm-toasts{top:auto;bottom:16px;left:16px;right:16px;max-width:none}.mm-toast{transform:translateY(18px)}.mm-toast.mm-out{transform:translateY(18px)}}',
    '@media(prefers-reduced-motion:reduce){.mm-toast{transition:none}}'
  ].join('');

  function css() {
    if (document.getElementById('mm-toast-css')) return;
    var s = document.createElement('style');
    s.id = 'mm-toast-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function box() {
    var b = document.getElementById('mm-toasts');
    if (!b) {
      b = document.createElement('div');
      b.id = 'mm-toasts';
      b.setAttribute('role', 'status');
      b.setAttribute('aria-live', 'polite');
      (document.body || document.documentElement).appendChild(b);
    }
    return b;
  }

  function tipo(msg) {
    var t = (msg || '').toLowerCase();
    if (/erro|falha|inv\u00e1lid|invalid|n\u00e3o foi poss\u00edvel|negad|obrigat/.test(t)) return 'err';
    if (/aten\u00e7|aviso|cuidado|verifique|preencha|selecione/.test(t)) return 'warn';
    if (/sucesso|salvo|salva|cadastrad|atualizad|conclu|enviad|exclu\u00edd|remov/.test(t)) return 'ok';
    return 'info';
  }

  var ICONE = { ok: '\u2713', err: '!', warn: '!', info: 'i' };

  function toast(msg, kind, ms) {
    css();
    var k = kind || tipo(msg);
    var el = document.createElement('div');
    el.className = 'mm-toast mm-' + k;
    var ic = document.createElement('span');
    ic.className = 'mm-ic';
    ic.textContent = ICONE[k] || 'i';
    var txt = document.createElement('div');
    txt.className = 'mm-msg';
    txt.textContent = String(msg == null ? '' : msg);
    var x = document.createElement('button');
    x.className = 'mm-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar');
    x.textContent = '\u00d7';
    el.appendChild(ic);
    el.appendChild(txt);
    el.appendChild(x);
    box().appendChild(el);
    requestAnimationFrame(function () { el.classList.add('mm-in'); });

    var timer;
    function sair() {
      clearTimeout(timer);
      el.classList.remove('mm-in');
      el.classList.add('mm-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }
    x.addEventListener('click', sair);
    var dur = ms || Math.min(9000, Math.max(3500, String(msg || '').length * 70));
    timer = setTimeout(sair, dur);
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', function () { timer = setTimeout(sair, 2500); });
    return sair;
  }

  window.mmToast = toast;
  window.mmToast.sucesso = function (m, ms) { return toast(m, 'ok', ms); };
  window.mmToast.erro = function (m, ms) { return toast(m, 'err', ms); };
  window.mmToast.aviso = function (m, ms) { return toast(m, 'warn', ms); };
  window.mmToast.info = function (m, ms) { return toast(m, 'info', ms); };

  /* alert() vira toast; confirm() e prompt() seguem nativos. */
  var alertNativo = window.alert.bind(window);
  window.alert = function (msg) {
    try { toast(msg); } catch (e) { alertNativo(msg); }
  };
  window.mmAlertNativo = alertNativo;
})();
