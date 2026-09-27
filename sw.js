/* ============================================================
   Service Worker — Otimizador de Rotas
   -----------------------------------------------------------
   Guarda o "esqueleto" do app (HTML, ícones, bibliotecas como
   Leaflet e Supabase JS) em cache, pra abrir rápido e continuar
   funcionando mesmo com internet ruim ou instável.

   NUNCA mexe em: chamadas ao Supabase (dados e tempo real) nem
   nos tiles do mapa — esses sempre vão direto pra rede, porque
   precisam estar sempre atualizados.
============================================================ */
const CACHE_NAME = "rotas-app-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(APP_SHELL); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n!==CACHE_NAME; }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// dados vivos: nunca cachear, sempre direto da rede
const NEVER_CACHE_HOSTS = [
  "supabase.co",
  "supabase.in",
  "cartocdn.com",
  "openstreetmap.org",
  "open-meteo.com"
];
function shouldBypass(url){
  return NEVER_CACHE_HOSTS.some(function(host){ return url.indexOf(host) !== -1; });
}

self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return; // nunca intercepta POST/PATCH/DELETE (escritas no Supabase)

  var url = req.url;
  if(shouldBypass(url)) return; // deixa passar direto, sem cache

  var isNavigation = req.mode === "navigate";
  var isSameOrigin = url.indexOf(self.location.origin) === 0;

  if(isNavigation || isSameOrigin){
    // app shell (o próprio HTML, manifest, ícones): tenta a rede primeiro,
    // pra sempre pegar a versão mais nova; só usa o cache se estiver offline
    event.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){ return cached || caches.match("./index.html"); });
      })
    );
  } else {
    // bibliotecas de terceiros (Leaflet, Supabase JS, fontes vindas de CDN):
    // responde do cache na hora (rápido) e atualiza o cache por trás pra próxima vez
    event.respondWith(
      caches.match(req).then(function(cached){
        var networkFetch = fetch(req).then(function(res){
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, res.clone()); });
          return res;
        }).catch(function(){ return cached; });
        return cached || networkFetch;
      })
    );
  }
});
