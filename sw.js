'use strict';

// service worker：アプリのファイルを端末に保存しておき、オフラインでも開けるようにする
// 方針は「ネット優先」：つながっていれば最新版を取りに行き、だめなら保存しておいた版を使う
// ファイルを増やした・減らしたときは APP_FILES を直し、CACHE_NAME の番号を上げる

// arxiv.json はここに入れない（まだ無い日もあり、無いとインストールが失敗するため）。
// 一度読めば下の fetch の処理で保存されるので、オフラインでも前回分が出る
const CACHE_NAME = 'kantan-yotei-v7';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './morning.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// インストール時：アプリのファイルをまとめて保存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// 有効化時：古いバージョンの保存分を消す
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// ページがファイルを読むとき：まずネット、失敗したら保存分
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // cache: 'no-cache' … GitHub Pages は「10 分間は古い版を使ってよい」と返すので、
  // 毎回サーバーに新しい版があるか確認させる（変わっていなければ確認だけで済む）
  event.respondWith(
    fetch(request.url, { cache: 'no-cache' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // ページを開こうとしてどちらも無いときは、トップページを返す
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
