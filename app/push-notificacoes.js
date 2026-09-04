/* Protege contra o arquivo ser carregado duas vezes: com `const` no escopo
   global, a segunda carga estoura "already been declared" e derruba o
   arquivo inteiro — nada dentro dele chega a rodar. */
if (window.__mmPushCarregado) {
  console.info('push-notificacoes.js já estava carregado; ignorando 2ª carga.');
} else {
  window.__mmPushCarregado = true;

/* =========================================================================
   MOVEMASTER — Notificações push no celular
   Avisa o fiscal quando existe carga aguardando emissão de CT-e, mesmo com
   o sistema fechado.

   Como funciona:
     1. Ao entrar, se o perfil estiver na lista PERFIS_COM_PUSH, o sistema
        pede permissão e registra este celular na tabela push_assinaturas.
     2. Quando entra uma linha em "notificacoes" para aquele perfil, um
        webhook do banco chama a Edge Function, que dispara o push só para
        os celulares daquele perfil.

   Nada aqui interrompe o login: qualquer falha é registrada no console e
   o sistema segue normal.
   ========================================================================= */

// COLE AQUI a chave pública VAPID gerada no passo 1 do guia.
// Chave PÚBLICA VAPID. A privada fica só nos secrets do Supabase.
var VAPID_PUBLICA = window.VAPID_PUBLICA || '';

// Quem recebe push no celular. Para incluir outro setor depois, basta
// acrescentar o perfil nesta lista — nada mais precisa mudar.
var PERFIS_COM_PUSH = ['fiscal'];

function _pushSuportado() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

// Converte a chave VAPID (base64url) para o formato que o navegador exige
function _base64ParaUint8(base64) {
  const preenchimento = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(normalizada);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

/**
 * Registra este celular para receber push. Chamada depois do login.
 * Silenciosa: se o perfil não recebe push, ou o navegador não suporta,
 * simplesmente não faz nada.
 */
async function prepararPushNotificacoes(perfil) {
  try {
    if (!perfil || !PERFIS_COM_PUSH.includes(perfil)) return;
    if (!_pushSuportado()) { console.info('Push não suportado neste navegador.'); return; }
    if (!VAPID_PUBLICA) { console.warn('Push: chave VAPID não configurada em push-notificacoes.js'); return; }
    if (!supabase) return;

    // Já negou antes: não insiste a cada login
    if (Notification.permission === 'denied') return;

    // Ainda não decidiu: mostra o convite discreto em vez do popup seco
    if (Notification.permission === 'default') { _mostrarConvitePush(perfil); return; }

    await _assinarEsteDispositivo(perfil);
  } catch (e) {
    console.warn('Push não pôde ser preparado:', e);
  }
}

// Faixa discreta convidando a ativar. O popup do navegador só aparece
// depois que a pessoa clica — se aparecer sozinho, muita gente bloqueia
// por reflexo, e aí não dá pra pedir de novo.
function _mostrarConvitePush(perfil) {
  if (document.getElementById('pushConvite')) return;
  const faixa = document.createElement('div');
  faixa.id = 'pushConvite';
  faixa.className = 'push-convite';
  faixa.innerHTML = `
    <span>🔔 Quer receber aviso no celular quando entrar carga para emitir CT-e?</span>
    <div class="push-convite-acoes">
      <button class="btn btn-primary btn-sm" id="pushConviteSim">Ativar</button>
      <button class="btn btn-secondary btn-sm" id="pushConviteNao">Agora não</button>
    </div>`;
  document.body.appendChild(faixa);

  document.getElementById('pushConviteSim').onclick = async () => {
    faixa.remove();
    const permissao = await Notification.requestPermission();
    if (permissao === 'granted') {
      await _assinarEsteDispositivo(perfil);
      if (typeof mmToast === 'function') mmToast('🔔 Avisos ativados neste celular!');
    }
  };
  document.getElementById('pushConviteNao').onclick = () => faixa.remove();
}

async function _assinarEsteDispositivo(perfil) {
  const registro = await navigator.serviceWorker.ready;

  let assinatura = await registro.pushManager.getSubscription();
  if (!assinatura) {
    assinatura = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _base64ParaUint8(VAPID_PUBLICA)
    });
  }

  const dados = assinatura.toJSON();
  const { error } = await supabase.from('push_assinaturas').upsert({
    user_id: usuarioAtual?.id || null,
    perfil: perfil,
    endpoint: dados.endpoint,
    p256dh: dados.keys?.p256dh,
    auth: dados.keys?.auth,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (error) console.warn('Push: assinatura não salva:', error.message);
  else console.info('✅ Push ativado para o perfil', perfil);
}

/** Desliga o push neste celular (para um botão de configurações, se quiser). */
async function desativarPushNotificacoes() {
  try {
    const registro = await navigator.serviceWorker.ready;
    const assinatura = await registro.pushManager.getSubscription();
    if (!assinatura) return;
    const endpoint = assinatura.endpoint;
    await assinatura.unsubscribe();
    if (supabase) await supabase.from('push_assinaturas').delete().eq('endpoint', endpoint);
    if (typeof mmToast === 'function') mmToast('Avisos desativados neste celular.');
  } catch (e) {
    console.warn('Não foi possível desativar o push:', e);
  }
}

/* =========================================================================
   DIAGNÓSTICO
   Abra o console (F12) e rode: diagnosticarPush()
   Diz exatamente qual condição está barrando a ativação.
   ========================================================================= */
async function diagnosticarPush() {
  const L = (ok, txt) => console.log((ok ? '✅' : '❌') + ' ' + txt);

  const perfil = (typeof perfilAtual !== 'undefined') ? perfilAtual : '(não definido)';
  L(PERFIS_COM_PUSH.includes(perfil), `perfil atual: ${perfil} (precisa ser um de: ${PERFIS_COM_PUSH.join(', ')})`);
  L('serviceWorker' in navigator, 'serviceWorker disponível');
  L('PushManager' in window, 'PushManager disponível');
  L('Notification' in window, 'API de notificação disponível');
  L(!!VAPID_PUBLICA && !/COLE_AQUI/.test(VAPID_PUBLICA), 'chave VAPID pública preenchida');
  L(typeof supabase !== 'undefined' && !!supabase, 'supabase inicializado');
  L(location.protocol === 'https:' || location.hostname === 'localhost', `origem segura (${location.protocol})`);

  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalado = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  if (ios) L(instalado, 'iPhone: app na Tela de Início (obrigatório no iOS)');

  console.log('permissão atual:', Notification.permission,
    '(default = ainda não perguntou, granted = já liberado, denied = bloqueado)');

  try {
    const reg = await navigator.serviceWorker.ready;
    L(!!reg, 'service worker ativo');
    const s = await reg.pushManager.getSubscription();
    console.log('assinatura neste aparelho:', s ? 'já existe' : 'nenhuma ainda');
  } catch (e) { L(false, 'service worker: ' + e.message); }

  console.log('---');
  console.log('Para forçar o convite agora: forcarConvitePush()');
}

// Mostra o convite na hora, ignorando o estado da permissão.
function forcarConvitePush() {
  const p = (typeof perfilAtual !== 'undefined' && perfilAtual) ? perfilAtual : PERFIS_COM_PUSH[0];
  const antigo = document.getElementById('pushConvite');
  if (antigo) antigo.remove();
  _mostrarConvitePush(p);
}

}
