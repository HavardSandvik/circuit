// Offline support: cache the app shell, serve cache-first, refresh in the background.
const CACHE = 'circuit-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'mannequin.js',
  'moves/jumping-jacks.json', 'moves/pull-ups.json', 'moves/bodyweight-squats.json', 'moves/mountain-climbers.json',
  'moves/reverse-lunges.json', 'moves/plank-shoulder-taps.json', 'moves/burpees.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
