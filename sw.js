/* Service worker: guarda o app no aparelho para abrir sem internet.
   Ao publicar uma nova versão, altere VERSAO para limpar o cache antigo. */
var VERSAO = 'vistoria-0.8.0';
var ARQUIVOS = ['./', './index.html', './style.css', './app.js', './checklist.js', './falas.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png'];

// Guarda também os áudios gravados listados em audio/indice.json (se existirem)
function guardarAudios(cache) {
  return fetch('audio/indice.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.chaves) return;
    return cache.put('audio/indice.json', new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json' } })).then(function () {
      return Promise.all(j.chaves.map(function (k) { return cache.add('audio/' + k + '.mp3').catch(function () {}); }));
    });
  }).catch(function () {});
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) {
    return c.addAll(ARQUIVOS).then(function () { return guardarAudios(c); });
  }).then(function () { return self.skipWaiting(); }));
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
