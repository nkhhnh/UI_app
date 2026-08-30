const CACHE_NAME = 'music-app-cache-v35';
const STATIC_ASSETS = [
  '/index.html',
  '/',
  '/contact/',
  '/login/',
  '/music/',
  '/user/',
  '/weather/',
  '/asset/uicons-solid-straight.css',
  '/asset/uicons-regular-rounded.css',
  '/asset/fontawesome/css/all.min.css',
  '/asset/boxicons/css/boxicons.min.css',
  '/asset/bootstrap.min.css',
  '/asset/fontawesome/webfonts/fa-solid-900.woff2',
  '/asset/fontawesome/webfonts/fa-regular-400.woff2',
  '/asset/fontawesome/webfonts/fa-brands-400.woff2',
  '/asset/boxicons/fonts/boxicons.woff2',
  '/css/contact.css',
  '/css/index.css',
  '/css/login.css',
  '/css/music.css',
  '/css/sleep-timer.css',
  '/css/nav.css',
  '/css/pagetrans.css',
  '/css/user.css',
  '/css/weather.css',
  '/css/img-home.css',
  '/js/nav.js',
  '/js/pagetrans.js',
  '/js/register.js',
  '/js/index.js',
  '/js/login.js',
  '/js/logout.js',
  '/js/weather.js',
  '/js/user.js',
  '/js/api.js',
  '/js/music-db.js',
  '/js/music-data.js',
  '/js/music-player.js',
  '/js/music-ui.js',
  '/js/sleep-timer.js',
  '/image/192x192.png',
  '/image/512x512.png',
  '/image/contact.webp',
  '/image/contact2.webp',
  '/image/logo.webp',
  '/image/music.webp',
  '/image/music2.webp',
  '/image/weather.webp',
  '/image/weather2.webp',
  '/js/service-worker-register.js',
  '/manifest.json',
];

self.addEventListener('install', event => {
  // KHONG bat loi o day. cache.addAll() la toan-hoac-khong: chi can mot file
  // tai hong la khong file nao duoc luu. Truoc day loi bi .catch nuot, nen
  // install van coi nhu thanh cong -> SW moi activate -> xoa sach cache cu ->
  // khong con cache nao ca. Che do offline chet am tham, online van chay binh
  // thuong nen khong ai nhan ra.
  //
  // De loi noi len thi install that bai, SW moi khong activate, SW cu va cache
  // cua no o nguyen. Tha khong cap nhat con hon mat sach.
  //
  // cache: 'reload' la BAT BUOC. addAll() mac dinh goi fetch() o che do cache
  // thong thuong, nghia la no duoc phep lay tu HTTP cache cua trinh duyet thay
  // vi tu mang. Hau qua: sau khi deploy, SW moi cai, tao cache ten moi, roi
  // nhet dung ban CU vao do. Ten cache doi ma noi dung khong doi -> bump version
  // bao nhieu lan cung khong thay gi thay doi.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Duong dan sach kieu /music thuc chat duoc phuc vu tu music/index.html.
// Trong STATIC_ASSETS no phai ghi la '/music/' (co dau gach cuoi) vi day la
// dang server tra ve NGAY, khong qua mot lan chuyen huong 301 — ma cache.put()
// nem TypeError voi response da bi chuyen huong, du lam hong ca lan install.
//
// Nhung nguoi dung lai bam vao link '/music' (khong gach cuoi). Nen khi tra
// cache phai thu them dang co gach, neu khong offline se truot het cac trang.
function matchCached(req, url) {
  return caches.match(req).then(hit => {
    if (hit) return hit;
    if (req.mode === 'navigate' && !url.pathname.endsWith('/')) {
      return caches.match(url.pathname + '/');
    }
    return undefined;
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // Chỉ xử lý GET, các method khác để trình duyệt tự lo
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ===== QUAN TRỌNG: KHÔNG can thiệp vào request nhạc / API =====
  // Nếu Service Worker proxy stream audio thì:
  //  - Response trở thành "opaque" -> trình duyệt mất khả năng tự gửi lại Range
  //    request để buffer tiếp / seek.
  //  - Service Worker bị hệ điều hành kill sau ~30s idle khi tắt màn hình ->
  //    kết nối stream đang chạy bị hủy -> nhạc đứng hẳn.
  // Bỏ qua respondWith() để trình duyệt xử lý native, nhạc chạy nền ổn định.
  if (url.origin !== self.location.origin) return;              // API + stream (khác origin)
  if (req.destination === 'audio' || req.destination === 'video') return;
  if (req.headers.has('range')) return;                          // request có Range
  if (url.pathname.startsWith('/api')) return;                   // phòng khi deploy chung origin

  event.respondWith(
    matchCached(req, url).then(response => {
      return response || fetch(req).then(fetchResponse => {
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
          return fetchResponse;
        }
        const responseToCache = fetchResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(req, responseToCache);
        });
        return fetchResponse;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('Offline: Network error', { status: 404 });
      });
    })
  );
});

self.addEventListener('message', event => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Lưu ý: mediaSession KHÔNG tồn tại trong Service Worker.
  // Metadata phải được set từ trang (navigator.mediaSession) - xem music-player.js.
  if (data.type === 'PLAYBACK_REQUEST') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PLAYBACK_RESPONSE',
            payload: { shouldPlay: data.payload.shouldPlay }
          });
        });
      })
    );
  } else if (data.type === 'SONG_ENDED') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
        if (clients.length === 0) {
          return self.registration.showNotification('Music App', {
            body: 'Bài hát đã kết thúc. Mở ứng dụng để tiếp tục.',
            icon: '/image/192x192.png'
          });
        }
        clients.forEach(client => {
          client.postMessage({
            type: 'PLAY_NEXT_SONG',
            payload: {
              currentIndex: data.payload.currentIndex,
              isLoopSingle: data.payload.isLoopSingle,
              isRandom: data.payload.isRandom,
              playedIndices: data.payload.playedIndices || []
            }
          });
        });
      })
    );
  }
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Thông báo mới từ Music App',
    icon: '/image/192x192.png',
    badge: '/image/192x192.png',
    data: { url: data.url || '/music' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Music App', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
      const client = clients.find(c => c.visibilityState === 'visible');
      if (client) {
        client.focus();
        client.postMessage({ type: 'NAVIGATE', payload: event.notification.data.url });
      } else {
        self.clients.openWindow(event.notification.data.url);
      }
    })
  );
});
