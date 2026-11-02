/* Service worker: guarda o app no aparelho para abrir sem internet.
   Ao publicar uma nova versão, altere VERSAO para limpar o cache antigo. */
var VERSAO = 'vistoria-0.1.0';
var ARQUIVOS = ['./', './index.html', './style.css', './app.js', './checklist.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Responde do cache na hora e atualiza em segundo plano (a nova versão aparece na próxima abertura)
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (cache) {
    var rede = fetch(r).then(function (resp) {
      if (resp && resp.ok) { var copia = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(r, copia); }); }
      return resp;
    }).catch(function () { return cache; });
    return cache || rede;
  }));
});
