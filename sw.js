const CACHE_NAME = 'nhc-clinic-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './admin.html',
    './style.css',
    './logo.png'
];

// Install Event: Cache core clinic assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event: Serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    // Skip Supabase API calls from caching so live data always syncs
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((response) => {
                // Don't cache non-successful responses or external CDNs if needed
                return response;
            }).catch(() => {
                // Optional: Fallback page could go here if offline completely
            });
        })
    );
});
