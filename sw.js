// 体調管理 オフライン対応（ネット優先・失敗したらキャッシュ）。更新のたびに番号を上げる
const PREFIX = 'taicho-';
const CACHE = PREFIX + 'v5';
// 必須：1 つでも取れなければ更新しない（install を失敗させて、正常な旧キャッシュを残す）
const REQUIRED = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png', './icon.svg',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c =>
    c.addAll(REQUIRED)
  ).catch(err =>
    // 取れなかった時は作りかけの新しいキャッシュを消してから失敗させる（activate に進まず、旧キャッシュは残る）
    caches.delete(CACHE).then(() => { throw err; })
  ));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // 消すのは自分の古い版（taicho- で始まる、今の版以外）だけ。同じ置き場の別アプリのキャッシュには触らない
      .then(ks => Promise.all(ks.filter(k => k.indexOf(PREFIX) === 0 && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;   // 自分の置き場所以外は扱わない
  e.respondWith(
    fetch(e.request).then(r => {
      // 正常な応答（200 番台）だけをキャッシュへ。404・500 で正常なキャッシュを上書きしない
      if (r.ok) {
        const copy = r.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}));
        return r;
      }
      return caches.match(e.request, { ignoreSearch: true }).then(m => m || r);
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(m => {
        if (m) return m;
        // 画面の移動（ページを開く）の時だけ index.html を代わりに返す。JS などには返さない
        if (e.request.mode === 'navigate') return caches.match('./index.html').then(x => x || Response.error());
        return Response.error();
      })
    )
  );
});

// 通知を押したらアプリを前に出す
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
