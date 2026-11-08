// Toyseum：離線快取
// 更新 App 時請把版本號加一，手機才會下載新版
const VERSION = 'v1.0.0';
const SHELL = `toyseum-shell-${VERSION}`;
const RUNTIME = 'toyseum-runtime-v1';
const FILES = ['./', './index.html', './manifest.json', './icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('toyseum-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App 本體：先試網路（拿到最新版），離線時用快取
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
      e.respondWith((async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3500);
          const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
          clearTimeout(t);
          if (res.ok) (await caches.open(SHELL)).put('./index.html', res.clone());
          return res;
        } catch (err) {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
      })());
      return;
    }
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const net = fetch(req).then(async res => { if (res.ok) (await caches.open(SHELL)).put(req, res.clone()); return res; }).catch(() => null);
      return cached || (await net) || Response.error();
    })());
    return;
  }

  // 外部程式庫（條碼備援）：第一次下載後存起來離線用
  if (/cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    })());
  }
});
