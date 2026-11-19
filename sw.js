const CACHE_NAME = "grid-v4-6-inventory-shell-1";
const ASSET_VERSION = "4.6.0";
const APP_SHELL = [
    "./",
    "./index.html",
    `./style.css?v=${ASSET_VERSION}`,
    `./script.js?v=${ASSET_VERSION}`,
    `./email-directory.js?v=${ASSET_VERSION}`,
    `./enhancements.js?v=${ASSET_VERSION}`,
    `./sql-backup.js?v=${ASSET_VERSION}`,
    `./manifest.json?v=${ASSET_VERSION}`,
    `./icon.svg?v=${ASSET_VERSION}`
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request, fallbackUrl = null) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request, { cache: "no-store" });
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (fallbackUrl) {
            const fallback = await cache.match(fallbackUrl);
            if (fallback) return fallback;
        }
        throw error;
    }
}

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (request.mode === "navigate") {
        event.respondWith(networkFirst(request, "./index.html"));
        return;
    }
    const isApplicationAsset = ["script", "style", "document", "manifest"].includes(request.destination)
        || /\.(?:js|css|html|json|svg)$/i.test(url.pathname);
    if (isApplicationAsset) {
        event.respondWith(networkFirst(request));
        return;
    }
    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }))
    );
});
