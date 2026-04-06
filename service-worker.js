const CACHE_NAME = "jamercado-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/CSS/styles.css",
  "/JS/script.js",
  "/lib/firebase.js",
  "/IMAGES/Logo-JaMercado-mobile.png",
  "/IMAGES/empty-basket.png",
  "/IMAGES/full-basket.png",
];

// Instalação: Salva os arquivos essenciais no cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("Erro ao cachear:", url);
          }),
        ),
      );
    }),
  );
});

// Ativação: Limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
});

// Estratégia Fetch: Tenta rede, se falhar, usa o cache
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match("/index.html"); // 🔥 fallback SPA
        });
      }),
  );
});
