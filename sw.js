'use strict';
/*
 * KAIROS · Cabina PWA — service worker
 *
 * SEGURIDAD: este SW nunca ve ni almacena la frase secreta del usuario.
 *   - App shell cacheado: HTML + config (solo contiene fileId + apiKey de solo lectura).
 *   - Drive API cacheado: el envelope CIFRADO ({salt,iv,ct,tag} en base64), nunca el texto en claro.
 *   - La frase solo existe en memoria de la página (y opcionalmente en localStorage/sessionStorage,
 *     que el SW no puede leer).
 */

const SHELL_V = 'kairos-shell-v1';
const DATA_V  = 'kairos-data-v1';

const SHELL_URLS = [
  './cabina-drive.html',
  './cabina-drive-config.js',
];

/** Elimina el parámetro cache-buster &_=<timestamp> para usar clave de caché estable */
function stableKey(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('_');
    return u.toString();
  } catch (_) {
    return url;
  }
}

// ── Install: precargar app shell ───────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all(
      SHELL_URLS.map(url =>
        fetch(url, { cache: 'reload' })
          .then(r => {
            if (r.ok) return caches.open(SHELL_V).then(c => c.put(url, r));
          })
          .catch(() => { /* archivo aún no existe (ej. config sin crear) → ignorar */ })
      )
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: eliminar cachés de versiones anteriores ──────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_V && k !== DATA_V).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  if (req.method !== 'GET') return;
  if (!url.startsWith('http')) return;

  // ── Drive API: network-first, fallback a caché con clave estable ──────
  if (url.includes('googleapis.com/drive/v3/files')) {
    const key = stableKey(url);

    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res.ok) {
            // Guardar en caché (el envelope cifrado, nunca la frase)
            caches.open(DATA_V).then(c => c.put(key, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          // Red caída → intentar caché
          const cache  = await caches.open(DATA_V);
          const cached = await cache.match(key);

          if (!cached) {
            // Sin caché tampoco → devolver error de red para que la página lo maneje
            return Response.error();
          }

          // Devolver caché con header especial que la página detecta
          const body = await cached.arrayBuffer();
          const hdrs = new Headers(cached.headers);
          hdrs.set('X-Kairos-Cache', 'HIT');
          return new Response(body, {
            status:     cached.status,
            statusText: cached.statusText,
            headers:    hdrs,
          });
        })
    );
    return;
  }

  // ── App shell (HTML + config): cache-first, actualizar en background ──
  const isShell = SHELL_URLS.some(u => url.endsWith(u.replace('./', '')));
  if (isShell) {
    e.respondWith(
      caches.match(req).then(cached => {
        // Intentar red en paralelo para actualizar la caché
        const fromNet = fetch(req)
          .then(res => {
            if (res.ok) caches.open(SHELL_V).then(c => c.put(req, res.clone()));
            return res;
          })
          .catch(() => null);
        // Si hay caché, responder inmediatamente; si no, esperar la red
        return cached || fromNet;
      })
    );
    return;
  }

  // El resto (fuentes Google, etc.) pasa sin interceptar
});
