// Service worker mínimo — necesario para que Android considere la app
// como "instalable de verdad", no solo un acceso directo. No cachea nada
// todavía (la app siempre necesita datos en vivo), solo cumple con el
// requisito técnico.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", () => {}); // sin caché — siempre trae datos frescos
