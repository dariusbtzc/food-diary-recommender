// Minimal service worker: it makes the app installable and nothing more.
// There is deliberately no fetch handler and no caching, so signed-in pages
// and private data are never served stale from a cache. Offline drafts
// (IndexedDB) come in a later milestone.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
