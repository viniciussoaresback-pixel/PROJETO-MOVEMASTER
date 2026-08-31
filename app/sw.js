/* =====================================================================
   MOVEMASTER — Service Worker
   Estratégia: REDE PRIMEIRO, cache só como reserva.
   Isso garante que o motorista sempre receba a versão mais nova do
   sistema quando tiver sinal, e ainda consiga abrir o app sem internet.

   IMPORTANTE: nada do Supabase é armazenado em cache — dados de carga,
   login e uploads precisam ser sempre ao vivo.
   ===================================================================== */

const VERSAO = 'movemaster-v282';

// Arquivos do "esqueleto" do app, guardados para funcionar offline
const ARQUIVOS_BASE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './supabase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instalação: guarda o esqueleto do app
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS_BASE).catch(() => {
        // se algum arquivo falhar, não impede a instalação
        return Promise.resolve();
      }))
  );
  // Não chamamos skipWaiting aqui: a página decide a hora de trocar,
  // para não recarregar em cima do motorista preenchendo algo.
});

// A página avisa quando pode assumir
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'ASSUMIR_AGORA') {
    self.skipWaiting();
  }
});

// Ativação: remove caches de versões antigas
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  const url = new URL(req.url);

  // Só cuidamos de GET
  if (req.method !== 'GET') return;

  // NUNCA interceptar Supabase (dados, login, storage) nem outras APIs:
  // precisam sempre da resposta real do servidor.
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/storage/v1/')
  ) {
    return;
  }

  const mesmaOrigem = url.origin === self.location.origin;
  // "Esqueleto" do app: HTML, JS e CSS (o que muda a cada deploy)
  const ehAppShell = mesmaOrigem && (
    /\.(html|js|css)$/i.test(url.pathname) ||
    url.pathname === '/' || url.pathname.endsWith('/')
  );

  if (ehAppShell) {
    // SEMPRE rede fresca (ignora o cache HTTP do navegador). Assim, o que você
    // publica aparece na hora. O cache serve só de reserva quando está offline.
    evento.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((resposta) => {
          if (resposta && resposta.status === 200) {
            const copia = resposta.clone();
            caches.open(VERSAO).then((cache) => cache.put(req, copia));
          }
          return resposta;
        })
        .catch(() =>
          caches.match(req).then((cacheado) => cacheado || caches.match('./index.html'))
        )
    );
    return;
  }

  // Demais arquivos do app (ícones, manifest): rede primeiro, com cache de reserva
  evento.respondWith(
    fetch(req)
      .then((resposta) => {
        if (resposta && resposta.status === 200 && mesmaOrigem) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(req, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(req))
  );
});

/* ---------------------------------------------------------------------
   NOTIFICAÇÕES PUSH (preparado para uso futuro)
   No iOS, só funcionam quando o app foi adicionado à Tela de Início.
   --------------------------------------------------------------------- */
self.addEventListener('push', (evento) => {
  let dados = { titulo: 'Movemaster', corpo: 'Você tem uma novidade.' };
  try { dados = { ...dados, ...evento.data.json() }; } catch (e) {}

  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: dados.url || './' }
    })
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || './';
  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ('focus' in j) return j.focus();
      }
      return clients.openWindow(destino);
    })
  );
});
