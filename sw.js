// const CACHE_NAME = 'music-app-cache-v1';
// const STATIC_ASSETS = [
//   '/html/index.html',
//   '/html/contact.html',
//   '/html/Login.html',
//   '/html/musicplayer.html',
//   '/html/user.html',
//   '/html/weather.html',
//   '/asset/uicons-solid-straight.css',
//   '/asset/uicons-regular-rounded.css',
//   '/asset/fontawesome/css/all.min.css',
//   '/asset/boxicons/css/boxicons.min.css',
//   '/asset/bootstrap.min.css',
//   '/asset/fontawesome/webfonts/fa-solid-900.woff2',
//   '/asset/fontawesome/webfonts/fa-regular-400.woff2',
//   '/asset/boxicons/fonts/boxicons.woff2',
//   '/css/contact.css',
//   '/css/index.css',
//   '/css/login.css',
//   '/css/music.css',
//   '/css/nav.css',
//   '/css/pagetrans.css',
//   '/css/user.css',
//   '/css/weather.css',
//   '/js/nav.js',
//   '/js/pagetrans.js',
//   '/js/register.js',
//   '/js/index.js',
//   '/js/login.js',
//   '/js/logout.js',
//   '/js/weather.js',
//   '/js/user.js',
//   '/js/music-app.js',
//   '/image/192x192.png',
//   '/image/512x512.png',
//   '/image/contact.png',
//   '/image/contact2.png',
//   '/image/logo.png',
//   '/image/music.png',
//   '/image/music2.png',
//   '/image/weather.png',
//   '/image/weather2.png',
//   '/js/service-worker-register.js',
//   '/manifest.json',
// ];

// // Cài đặt Service Worker
// self.addEventListener('install', event => {
//   event.waitUntil(
//     caches.open(CACHE_NAME).then(cache => {
//       return cache.addAll(STATIC_ASSETS);
//     })
//   );
//   self.skipWaiting();
// });

// // Kích hoạt Service Worker
// self.addEventListener('activate', event => {
//   event.waitUntil(
//     caches.keys().then(cacheNames => {
//       return Promise.all(
//         cacheNames
//           .filter(name => name !== CACHE_NAME)
//           .map(name => caches.delete(name))
//       );
//     })
//   );
//   self.clients.claim();
// });

// // Xử lý yêu cầu mạng
// self.addEventListener('fetch', event => {
//   const url = new URL(event.request.url);

//   if (url.pathname.startsWith('/api')) {
//     event.respondWith(
//       fetch(event.request).catch(() => {
//         return new Response('Offline: API unavailable', { status: 503 });
//       })
//     );
//     return;
//   }

//   event.respondWith(
//     caches.match(event.request).then(response => {
//       return response || fetch(event.request).then(fetchResponse => {
//         return caches.open(CACHE_NAME).then(cache => {
//           cache.put(event.request, fetchResponse.clone());
//           return fetchResponse;
//         });
//       }).catch(() => {
//         return caches.match('/html/index.html');
//       });
//     })
//   );
// });

// // Xử lý tin nhắn
// self.addEventListener('message', event => {

//   if (event.data && event.data.type === 'UPDATE_MEDIA_METADATA') {
//     const { title, artist, isPlaying } = event.data.payload;
//     if ('mediaSession' in self) {
//       self.mediaSession.metadata = new MediaMetadata({
//         title: title,
//         artist: artist,
//         artwork: [
//           { src: '/image/192x192.png', sizes: '192x192', type: 'image/png' },
//           { src: '/image/512x512.png', sizes: '512x512', type: 'image/png' }
//         ]
//       });
//       self.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
//     }
//   } else if (event.data && event.data.type === 'PLAYBACK_REQUEST') {
//     event.waitUntil(
//       self.clients.matchAll().then(clients => {
//         clients.forEach(client => {
//           client.postMessage({
//             type: 'PLAYBACK_RESPONSE',
//             payload: { shouldPlay: event.data.payload.shouldPlay }
//           });
//         });
//       })
//     );
//   } else if (event.data && event.data.type === 'SONG_ENDED') {
//     event.waitUntil(
//       self.clients.matchAll().then(clients => {
//         if (clients.length === 0) {
//           self.registration.showNotification('Music App', {
//             body: 'Bài hát đã kết thúc. Mở ứng dụng để tiếp tục.',
//             icon: '/image/192x192.png'
//           });
//           return;
//         }
//         clients.forEach(client => {
//           client.postMessage({
//             type: 'PLAY_NEXT_SONG',
//             payload: {
//               currentIndex: event.data.payload.currentIndex,
//               isLoopSingle: event.data.payload.isLoopSingle,
//               isRandom: event.data.payload.isRandom,
//               playedIndices: event.data.payload.playedIndices || [] // Thêm playedIndices
//             }
//           });
//         });
//       })
//     );
//   }
// });

// // Xử lý thông báo đẩy
// self.addEventListener('push', event => {
//   const data = event.data ? event.data.json() : {};
//   const options = {
//     body: data.body || 'Thông báo mới từ Music App',
//     icon: '/image/192x192.png',
//     badge: '/image/192x192.png',
//     data: { url: data.url || '/html/musicplayer.html' }
//   };

//   event.waitUntil(
//     self.registration.showNotification(data.title || 'Music App', options)
//   );
// });

// // Xử lý nhấp vào thông báo
// self.addEventListener('notificationclick', event => {
//   event.notification.close();
//   event.waitUntil(
//     self.clients.matchAll().then(clients => {
//       const client = clients.find(c => c.visibilityState === 'visible');
//       if (client) {
//         client.focus();
//         client.postMessage({ type: 'NAVIGATE', payload: event.notification.data.url });
//       } else {
//         self.clients.openWindow(event.notification.data.url);
//       }
//     })
//   );
// });