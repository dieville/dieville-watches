/* Dieville Watches: service worker mínimo para o app ser instalável. Sempre busca na rede (nada fica velho). */
self.addEventListener('install', ()=> self.skipWaiting());
self.addEventListener('activate', e=> e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', ()=>{});
