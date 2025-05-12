document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initIndexedDB();
        setupEvents();
        await loadSongs();
        await loadAlbums();
        updateSongList();
        displayAlbumsList();
        updateVolume(0.8);
        updateInterfaceBasedOnState();

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
            const isOnline = navigator.onLine;
            const artwork = isOnline ? [
                { src: '/image/192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/image/512x512.png', sizes: '512x512', type: 'image/png' }
            ] : [];
        
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Không có bài hát đang phát',
                artist: '',
                artwork: artwork
            });
        }

        // Hàm cập nhật danh sách bài hát và album theo trạng thái
        const updateListsBasedOnState = async () => {
            try {
                // Lưu trạng thái phát nhạc hiện tại (nếu có)
                const isPlaying = audio && !audio.paused;
                const currentSong = currentSongIndex !== -1 && (currentAlbumId ? currentAlbumPlaylist[currentSongIndex] : songs[currentSongIndex]);

                // Tải lại dữ liệu
                await loadSongs();
                await loadAlbums();

                // Cập nhật giao diện
                updateSongList();
                displayAlbumsList();

                // Khôi phục trạng thái phát nhạc (nếu có)
                if (currentSong && isPlaying) {
                    const newIndex = (currentAlbumId ? currentAlbumPlaylist : songs).findIndex(s => s && s.song_id === currentSong.song_id);
                    if (newIndex !== -1) {
                        currentSongIndex = newIndex;
                        appendSong(newIndex, true).catch(err => {
                           
                            resetAudioState();
                        });
                    } else {
                        resetAudioState();
                    }
                }
            } catch (error) {
                
                showNotification('Không thể cập nhật danh sách: ' + error.message, 'error');
            }
        };

        // Theo dõi trạng thái mạng
        let lastOnlineStatus = navigator.onLine;
        window.addEventListener('online', async () => {
            if (!lastOnlineStatus) {
                lastOnlineStatus = true;
                updateInterfaceBasedOnState();
                await updateListsBasedOnState();
            }
        });
        window.addEventListener('offline', async () => {
            if (lastOnlineStatus) {
                lastOnlineStatus = false;
                updateInterfaceBasedOnState();
                await updateListsBasedOnState();
            }
        });

        // Theo dõi trạng thái đăng nhập
        let lastLoginStatus = !!localStorage.getItem('auth_token');
        const checkLoginStatus = async () => {
            const currentLoginStatus = !!localStorage.getItem('auth_token');
            if (currentLoginStatus !== lastLoginStatus) {
                lastLoginStatus = currentLoginStatus;
                updateInterfaceBasedOnState();
                await updateListsBasedOnState();
            }
        };

        // Phát hiện thay đổi auth_token từ tab/window khác
        window.addEventListener('storage', async (event) => {
            if (event.key === 'auth_token') {
                await checkLoginStatus();
            }
        });

        // Ghi đè fetchAPI để kiểm tra token hết hạn
        const originalFetchAPI = fetchAPI;
        fetchAPI = async (endpoint, method = 'GET', body = null) => {
            try {
                const response = await originalFetchAPI(endpoint, method, body);
                return response;
            } catch (error) {
                if (error.message.includes('Phiên hết hạn') || error.message.includes('Đang chuyển hướng đến trang đăng nhập')) {
                    await checkLoginStatus();
                }
                throw error;
            }
        };

        // Ghi đè các hàm tương tác chính để kiểm tra trạng thái
        const wrapWithStateCheck = (originalFunction) => {
            return async (...args) => {
                await checkLoginStatus();
                return originalFunction(...args);
            };
        };
        appendSong = wrapWithStateCheck(appendSong);
        loadSongs = wrapWithStateCheck(loadSongs);
        loadAlbums = wrapWithStateCheck(loadAlbums);
        updateSongItemEvents = wrapWithStateCheck(updateSongItemEvents);
        updateAlbumItemEvents = wrapWithStateCheck(updateAlbumItemEvents);
    } catch (error) {
        showNotification('Không thể khởi tạo ứng dụng: ' + error.message, 'error');
    }
});

// Các phần tử DOM
const audio = document.getElementById('audio');
const playBtn = document.querySelector('.music-control__icon-play');
const playIcon = playBtn?.querySelector('.fa-play');
const pauseIcon = playBtn?.querySelector('.fa-pause');
const progress = document.getElementById('progress');
const timeStart = document.querySelector('.music-control__progress-time-start');
const timeDuration = document.querySelector('.music-control__progress-time-duration');
const volumeSlider = document.getElementById('progress1');
const slider = document.querySelector('.slider');
const btn = document.querySelector('.btn');
const record = document.querySelector('.record');
const toneArm = document.querySelector('.tone-arm');
const playlistToggle = document.querySelector('.playlist-toggle');
const albumsToggle = document.querySelector('.albums-toggle');
const playlist = document.querySelector('.playlist');
const songList = document.querySelector('.song-list');
const songTitle = document.querySelector('.music-control__left-content-song');
const songArtist = document.querySelector('.music-control__left-content-singer');
const toggleAddSongBtn = document.querySelector('.toggle-add-song-btn');
const addSongPopup = document.querySelector('.add-song-popup');
const closeAddSongBtn = document.querySelector('.close-add-song-btn');
const overlay = document.querySelector('.overlay');
const addSongSubmit = document.querySelector('.add-song-submit');
const prevBtn = document.querySelector('.fa-backward');
const nextBtn = document.querySelector('.fa-forward');
const randomBtn = document.querySelector('.fa-random');
const loopBtn = document.querySelector('.fa-redo');
const playlistTitle = document.querySelector('.playlist-header');

// Biến trạng thái
let isPlaying = false;
let isProcessing = false;
let isLoadingSong = false;
let currentPopup = null;
let activePopup = null;
let currentAlbumPlaylist = [];
let currentSongIndex = -1;
let isLoopSingle = false;
let isRandom = false;
let currentAlbumId = null;
let playHistory = [];
let playedIndices = [];
let activePopups = [];
let activeAlbumInputPopup = null;
let preloadAudio = null;
let nextSongIndex = -1;


// Cấu hình API
const API_BASE_URL = 'http://127.0.0.1:8000/api';
let songs = [];
let albums = [];

// Kiểm tra thiết bị di động
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;

// Cấu hình IndexedDB
const DB_NAME = 'MusicAppDB';
const DB_VERSION = 1;
let db;

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            db.createObjectStore('songs', { keyPath: 'song_id' });
            db.createObjectStore('albums', { keyPath: 'id' });
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            
            reject(event.target.error);
        };
    });
}

function saveToIndexedDB(storeName, data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            
            resolve();
            return;
        }

        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        const isValidData = (item) => {
            if (storeName === 'songs') {
                return item && item.song_id && item.custom_name && item.localPath && item.songData instanceof Blob && item.songData.type.startsWith('audio/');
            } else if (storeName === 'albums') {
                return item && item.id && item.album_name && item.album_name.trim() !== '' && Array.isArray(item.songs);
            }
            return false;
        };

        if (!data || (Array.isArray(data) && data.length === 0)) {
            resolve();
            return;
        }

        if (Array.isArray(data)) {
            const validData = data.filter(isValidData);
            if (validData.length === 0) {
                resolve();
                return;
            }
            validData.forEach(item => {
                if (storeName === 'albums') {
                    item.songs = item.songs.filter(song => song && song.song_id && songs.find(s => s.song_id === song.song_id)?.localPath);
                }
                store.put(item);
            });
        } else {
            if (!isValidData(data)) {
                resolve();
                return;
            }
            if (storeName === 'albums') {
                data.songs = data.songs.filter(song => song && song.song_id && songs.find(s => s.song_id === song.song_id)?.localPath);
            }
            store.put(data);
        }

        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = (event) => {
            
            reject(event.target.error);
        };
    });
}

function loadFromIndexedDB(storeName) {
    return new Promise((resolve, reject) => {
        if (!db) {
           
            resolve([]);
            return;
        }

        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Hàm kiểm tra và làm mới dữ liệu trong IndexedDB nếu cần
async function refreshIndexedDBIfNeeded() {
    const isOnline = navigator.onLine;
    const isLoggedIn = !!localStorage.getItem('auth_token');

    if (isOnline && isLoggedIn) {
        const existingSongs = await loadFromIndexedDB('songs');
        // Kiểm tra nếu dữ liệu trong IndexedDB thiếu custom_artist
        if (existingSongs.length > 0 && existingSongs.some(song => !song.custom_artist)) {
            showNotification('Đang làm mới dữ liệu...', 'info');
            // Xóa dữ liệu cũ trong IndexedDB
            await clearIndexedDB('songs');
            // Tải lại dữ liệu từ API và lưu vào IndexedDB
            const songsFromAPI = await fetchAPI('/songs');
            const songsToSave = songsFromAPI.filter(song => 
                song.localPath && song.songData instanceof Blob && song.songData.type.startsWith('audio/')
            );
            if (songsToSave.length > 0) {
                await saveToIndexedDB('songs', songsToSave);
                showNotification('Đã làm mới dữ liệu bài hát trong thiết bị.', 'info');
            }
        }
    }
}

// Hàm tải bài hát
async function loadSongs() {
    try {
        if (!db) await initIndexedDB();
        const isLoggedIn = !!localStorage.getItem('auth_token');
        const isOnline = navigator.onLine;

        if (!isOnline || !isLoggedIn) {
            songs = await loadFromIndexedDB('songs');
            songs = songs.filter(song => 
                song && song.song_id && song.custom_name && 
                song.localPath && song.songData instanceof Blob && song.songData.type.startsWith('audio/')
            );
            if (songs.some(song => !song.custom_artist)) {
                showNotification('Vui lòng kết nối mạng và tải lại dữ liệu.', 'info');
            }
            if (songs.length === 0) showNotification('Không có bài hát ngoại tuyến nào.', 'info');
        } else {
            songs = await fetchAPI('/songs');
            if (songs.some(song => !song.custom_artist)) {
                
            }
            const songsToSave = songs.filter(song => 
                song.localPath && song.songData instanceof Blob && song.songData.type.startsWith('audio/')
            );
            if (songsToSave.length > 0) {
                await saveToIndexedDB('songs', songsToSave);
            }
        }
        updateSongList();
    } catch (error) {
        
        songs = await loadFromIndexedDB('songs');
        songs = songs.filter(song => 
            song && song.song_id && song.custom_name && 
            song.localPath && song.songData instanceof Blob && song.songData.type.startsWith('audio/')
        );
        if (songs.some(song => !song.custom_artist)) {
            showNotification('Vui lòng kết nối mạng và tải lại dữ liệu.', 'info');
        }
        if (songs.length === 0) showNotification('Không có bài hát nào.', 'info');
        updateSongList();
    }
}

// Hàm xóa dữ liệu trong IndexedDB
async function clearIndexedDB(storeName) {
    try {
        if (!db) await initIndexedDB();
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
        showNotification(`Đã xóa ${storeName} khỏi thiết bị`, 'success');
    } catch (error) {
        
        showNotification(`Không thể xóa ${storeName}: ${error.message}`, 'error');
    }
}
async function loadAlbums() {
    try {
        if (!db) await initIndexedDB();
        const isLoggedIn = !!localStorage.getItem('auth_token');
        const isOnline = navigator.onLine;

        if (!isOnline || !isLoggedIn) {
            albums = await loadFromIndexedDB('albums');
            albums = albums.map(album => ({
                ...album,
                songs: album.songs.filter(song => {
                    const songInGlobal = songs.find(s => s.song_id === song.song_id);
                    return songInGlobal && songInGlobal.localPath && songInGlobal.songData instanceof Blob && songInGlobal.songData.type.startsWith('audio/');
                })
            })).filter(album => album.songs.length > 0 && album.id && album.album_name && album.album_name.trim() !== '');
            if (albums.length === 0) showNotification('Không có album ngoại tuyến nào.', 'info');
        } else {
            albums = (await fetchAPI('/albums')).map(album => ({
                ...album,
                songs: Array.isArray(album.songs) ? album.songs : []
            }));
        }
        displayAlbumsList();
    } catch (error) {
      
        albums = await loadFromIndexedDB('albums');
        albums = albums.map(album => ({
            ...album,
            songs: album.songs.filter(song => {
                const songInGlobal = songs.find(s => s.song_id === song.song_id);
                return songInGlobal && songInGlobal.localPath && songInGlobal.songData instanceof Blob && songInGlobal.songData.type.startsWith('audio/');
            })
        })).filter(album => album.songs.length > 0 && album.id && album.album_name && album.album_name.trim() !== '');
        if (albums.length === 0) showNotification('Không có album nào.', 'info');
        displayAlbumsList();
    }
}

async function loadAlbumSongs(albumId) {
    try {
        if (!db) await initIndexedDB();
        const isLoggedIn = !!localStorage.getItem('auth_token');
        const isOnline = navigator.onLine;

        let albumData = null;
        if (!isOnline || !isLoggedIn) {
            const album = albums.find(a => a.id === parseInt(albumId));
            if (!album) {
                throw new Error('Không tìm thấy album');
            }
            albumData = album;
            currentAlbumId = albumId;
            currentAlbumPlaylist = album.songs.map(song => {
                const songInGlobal = songs.find(s => s.song_id === song.song_id);
                return songInGlobal && songInGlobal.localPath && songInGlobal.songData instanceof Blob && songInGlobal.songData.type.startsWith('audio/')
                    ? songInGlobal
                    : null;
            }).filter(song => song !== null);
            if (currentAlbumPlaylist.length === 0) {
                throw new Error('Không có bài hát ngoại tuyến nào trong album này');
            }
        } else {
            albumData = await fetchAPI(`/albums/${albumId}`);
            if (!albumData || !Array.isArray(albumData.songs)) {
                throw new Error('Dữ liệu album không hợp lệ');
            }
            // Đồng bộ với songs toàn cục để đảm bảo dữ liệu đầy đủ
            currentAlbumPlaylist = albumData.songs
                .map(song => {
                    const songInGlobal = songs.find(s => s.song_id === song.song_id);
                    return songInGlobal || song;
                })
                .filter(song => song && song.song_id && song.custom_name);
            currentAlbumId = albumId;
        }


        // Cập nhật danh sách bài hát
        updateSongList();

        // Cập nhật tiêu đề playlist
        if (playlistTitle) {
            const album = albums.find(a => a.id === parseInt(albumId));
            playlistTitle.textContent = album ? `Danh sách của ${album.album_name}` : 'Danh sách phát';
        }
    } catch (error) {
        currentAlbumId = null;
        currentAlbumPlaylist = [];
        updateSongList();
        if (playlistTitle) playlistTitle.textContent = 'Danh sách phát';
        const notification = showNotification(`Không thể tải bài hát của album: ${error.message}`, 'error');
        if (!notification) {
        }
    }
}

async function downloadSong(songId, songName) {
    if (!navigator.onLine) {
        showNotification('Không thể tải bài hát khi ngoại tuyến.', 'error');
        return;
    }
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Vui lòng đăng nhập.');
        const response = await fetch(`${API_BASE_URL}/songs/${songId}/download`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/octet-stream'
            },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Lỗi tải xuống: ${response.status}`);
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.startsWith('audio/')) throw new Error('Định dạng âm thanh không hợp lệ');
        const blob = await response.blob();
        if (blob.size === 0) throw new Error('Dữ liệu bài hát rỗng');

        if (!db) await initIndexedDB();
        const songIndex = songs.findIndex(song => song.song_id === songId);
        if (songIndex === -1) throw new Error('Không tìm thấy bài hát');

        const song = songs[songIndex];
        const updatedSong = {
            song_id: song.song_id,
            custom_name: song.custom_name,
            custom_artist: song.custom_artist,
            localPath: true,
            songData: blob
        };
        await saveToIndexedDB('songs', updatedSong);
        songs[songIndex] = updatedSong;

        showNotification(`Đã tải "${songName}" vào thiết bị`, 'success');
    } catch (error) {
        
        showNotification('Không thể tải bài hát: ' + error.message, 'error');
    }
}

async function downloadAlbum(albumId, albumName) {
    if (!navigator.onLine) {
        showNotification('Không thể tải album khi ngoại tuyến.', 'error');
        return;
    }
    try {
        const albumData = await fetchAPI(`/albums/${albumId}`);
        if (!albumData.songs || albumData.songs.length === 0) {
            showNotification(`Không có bài hát để tải trong "${albumName}"`, 'info');
            return;
        }

        const loadingNotification = showNotification(`Đang tải "${albumName}"...`, 'info');
        for (const song of albumData.songs) {
            await downloadSong(song.song_id, song.custom_name);
        }

        const albumIndex = albums.findIndex(a => a.id === parseInt(albumId));
        if (albumIndex === -1) throw new Error('Không tìm thấy album');
        const updatedAlbum = {
            id: albumData.id,
            album_name: albumData.album_name,
            songs: albumData.songs.filter(song => {
                const songInGlobal = songs.find(s => s.song_id === song.song_id);
                return songInGlobal && songInGlobal.localPath && songInGlobal.songData instanceof Blob && songInGlobal.songData.type.startsWith('audio/');
            })
        };
        await saveToIndexedDB('albums', updatedAlbum);
        albums[albumIndex] = updatedAlbum;

        loadingNotification.remove();
        showNotification(`Đã tải tất cả bài hát trong "${albumName}" vào thiết bị`, 'success');
    } catch (error) {
        
        showNotification(`Không thể tải "${albumName}": ${error.message}`, 'error');
    }
}

async function fetchAPI(endpoint, method = 'GET', body = null) {
    if (!navigator.onLine) throw new Error('Không thể lấy dữ liệu khi ngoại tuyến.');
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Vui lòng đăng nhập.');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
    };
    const config = { method, headers };
    if (body && method !== 'GET') {
        if (body instanceof FormData) {
            config.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            config.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                localStorage.removeItem('auth_token');
                showNotification('Phiên hết hạn. Vui lòng đăng nhập lại.', 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                throw new Error('Đang chuyển hướng đến trang đăng nhập...');
            }
            throw new Error(errorData.message || `Lỗi máy chủ: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        throw new Error(error.message);
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function getRandomSongIndex(currentIndex) {
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    if (songListSource.length <= 1) return 0;

    if (playedIndices.length >= songListSource.length - 1 && !playedIndices.includes(currentIndex)) {
        playedIndices = [currentIndex];
    }

    const availableIndices = Array.from({ length: songListSource.length }, (_, i) => i).filter(
        i => i !== currentIndex && !playedIndices.includes(i)
    );

    if (availableIndices.length === 0) {
        playedIndices = [currentIndex];
        return getRandomSongIndex(currentIndex);
    }

    const newIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    playedIndices.push(newIndex);
    return newIndex;
}

function getNextSongIndex(currentIndex) {
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    if (!songListSource || songListSource.length === 0) return -1;

    if (songListSource.length === 1) return isLoopSingle ? 0 : -1;

    if (currentIndex === -1) {
        const newIndex = isRandom ? getRandomSongIndex(-1) : 0;
        if (isRandom && newIndex !== -1) playedIndices = [newIndex];
        return newIndex;
    }

    if (isLoopSingle) return currentIndex;

    if (isRandom) return getRandomSongIndex(currentIndex);

    if (currentIndex < songListSource.length - 1) return currentIndex + 1;

    return -1;
}

function getPrevSongIndex(currentIndex) {
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    if (!songListSource || songListSource.length === 0) return -1;

    if (songListSource.length === 1) return isLoopSingle ? 0 : -1;

    if (currentIndex === -1) return 0;

    if (isLoopSingle) return currentIndex;

    if (isRandom && playHistory.length > 1) {
        playHistory.pop();
        const prevIndex = playHistory[playHistory.length - 1] || 0;
        if (playedIndices.includes(currentIndex)) {
            playedIndices = playedIndices.filter(i => i !== currentIndex);
        }
        return prevIndex;
    }

    if (currentIndex > 0) return currentIndex - 1;

    return -1;
}



function updateSongList() {
    if (!songList) {
        return;
    }

    const isLoggedIn = !!localStorage.getItem('auth_token');
    const isOnline = navigator.onLine;
    const disableActions = (!isOnline || !isLoggedIn);
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    const noSongsMessage = songList.querySelector('.no-songs-message');


    songList.querySelectorAll('.song-item').forEach(item => item.remove());

    if (!songListSource || songListSource.length === 0) {
        noSongsMessage.style.display = 'block';
        noSongsMessage.textContent = (!isOnline || !isLoggedIn)
            ? 'Không có bài hát ngoại tuyến nào.'
            : 'Không có bài hát nào.';
    } else {
        noSongsMessage.style.display = 'none';
        const template = document.getElementById('song-item-template').content;
        songListSource.forEach((song, index) => {
            const clone = document.importNode(template, true);
            const songItem = clone.querySelector('.song-item');
            songItem.dataset.index = index;
            clone.querySelector('.title').textContent = song.custom_name || 'Không xác định';
            clone.querySelector('.artist').textContent = song.custom_artist || 'Không xác định';
            clone.querySelector('.option-item[data-action="delete"]').textContent = currentAlbumId ? 'Xóa khỏi Album' : 'Xóa';

            if (index === currentSongIndex && isPlaying) {
                songItem.classList.add('playing');
            } else {
                songItem.classList.remove('playing');
            }

            const songOptionsBtn = clone.querySelector('.song-options-btn');
            if (disableActions) songOptionsBtn.classList.add('disabled');

            if (!isOnline && (!song.localPath || !song.songData || !(song.songData instanceof Blob) || !song.songData.type.startsWith('audio/'))) {
                songItem.classList.add('disabled');
                songItem.title = 'Bài hát không khả dụng ngoại tuyến';
                const playBtn = clone.querySelector('.play-btn');
                if (playBtn) playBtn.disabled = true;
            }

            songList.appendChild(clone);
        });
    }
    updateSongItemEvents();
}

function displayAlbumsList() {
    const albumList = document.querySelector('.album-list');
    if (!albumList) {
        
        return;
    }

    const isLoggedIn = !!localStorage.getItem('auth_token');
    const isOnline = navigator.onLine;
    const disableActions = (!isOnline || !isLoggedIn);
    const noAlbumsMessage = albumList.querySelector('.no-albums-message');

    albumList.querySelectorAll('.album-item').forEach(item => item.remove());

    if (albums.length === 0) {
        noAlbumsMessage.style.display = 'block';
        noAlbumsMessage.textContent = (!isOnline || !isLoggedIn)
            ? 'Không có album ngoại tuyến nào.'
            : 'Không có album nào.';
    } else {
        noAlbumsMessage.style.display = 'none';
        const albumTemplate = document.getElementById('album-item-template').content;
        const songTemplate = document.getElementById('album-song-item-template').content;

        albums.forEach(album => {
            const albumClone = document.importNode(albumTemplate, true);
            const albumItem = albumClone.querySelector('.album-item');
            albumItem.dataset.albumId = album.id;
            albumClone.querySelector('.album-title').textContent = album.album_name || 'Không xác định';

            albumClone.querySelectorAll('.option-item').forEach(option => {
                option.dataset.album = album.id;
            });

            const albumOptionsBtn = albumClone.querySelector('.album-options-btn');
            if (disableActions) albumOptionsBtn.classList.add('disabled');

            const albumSongs = albumClone.querySelector('.album-songs');
            const noAlbumSongsMessage = albumSongs.querySelector('.no-album-songs-message');
            const songsToDisplay = (album.songs || []).filter(song => isOnline || (songs.find(s => s.song_id === song.song_id)?.localPath));

            if (songsToDisplay.length > 0) {
                noAlbumSongsMessage.style.display = 'none';
                songsToDisplay.forEach(song => {
                    const songClone = document.importNode(songTemplate, true);
                    songClone.querySelector('.song-title').textContent = song.custom_name || 'Không xác định';
                    songClone.querySelector('.song-artist').textContent = song.custom_artist || 'Không xác định';
                    songClone.querySelector('.remove-song-btn').dataset.song = song.song_id;
                    songClone.querySelector('.remove-song-btn').dataset.album = album.id;

                    if (!isOnline && !songs.find(s => s.song_id === song.song_id)?.localPath) {
                        songClone.querySelector('.album-song-item').classList.add('disabled');
                        songClone.querySelector('.album-song-item').title = 'Bài hát không khả dụng ngoại tuyến';
                        songClone.querySelector('.remove-song-btn').disabled = true;
                    }

                    albumSongs.appendChild(songClone);
                });
            } else {
                noAlbumSongsMessage.style.display = 'block';
                noAlbumSongsMessage.textContent = isOnline ? 'Không có bài hát trong album này.' : 'Không có bài hát ngoại tuyến trong album này.';
            }

            albumList.appendChild(albumClone);
        });
    }
    updateAlbumItemEvents();
}

async function setPopup(popup) {
    playlist.classList.remove('active');
    const albumsList = document.querySelector('.albums-list');
    if (albumsList) albumsList.classList.remove('active');

    document.querySelectorAll('.album-input-popup').forEach(p => {
        p.classList.remove('active');
        p.remove();
    });

    addSongPopup.classList.remove('active');
    overlay.classList.remove('active');

    currentPopup = popup;

    if (popup === 'playlist') {
        playlist.classList.add('active');
        if (playlistTitle) {
            if (currentAlbumId) {
                const album = albums.find(a => a.id === parseInt(currentAlbumId));
                playlistTitle.textContent = album ? `Danh sách của ${album.album_name}` : 'Danh sách phát';
            } else {
                playlistTitle.textContent = 'Danh sách phát';
            }
        }
    } else if (popup === 'albums') {
        if (albumsList) albumsList.classList.add('active');
    } else if (popup === 'add-song') {
        addSongPopup.classList.add('active');
        overlay.classList.add('active');
    }
}

function showAlbumInputPopup(title, defaultValue, onSave) {
    const popup = document.createElement('div');
    popup.classList.add('album-input-popup');
    popup.innerHTML = `
        <h3>${title}</h3>
        <input type="text" class="album-name-input" value="${defaultValue}" placeholder="Nhập tên album">
        <div class="action-buttons">
            <button class="save-btn">Lưu</button>
            <button class="cancel-btn">Hủy</button>
        </div>
    `;
    document.body.appendChild(popup);

    const input = popup.querySelector('.album-name-input');
    const saveBtn = popup.querySelector('.save-btn');
    const cancelBtn = popup.querySelector('.cancel-btn');
    input.addEventListener('click', (e) => e.stopPropagation());

    popup.classList.add('active');
    if (overlay) overlay.classList.add('active');

    activeAlbumInputPopup = popup;

    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newTitle = input.value.trim();
        if (!newTitle) {
            showNotification('Vui lòng nhập tên album hợp lệ.', 'info');
            return;
        }
        try {
            await onSave(newTitle);
        } catch (error) {
            showNotification('Lỗi: ' + error.message, 'error');
        } finally {
            popup.remove();
            if (overlay) overlay.classList.remove('active');
            activeAlbumInputPopup = null;
        }
    });

    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.remove();
        if (overlay) overlay.classList.remove('active');
        activeAlbumInputPopup = null;
    });
}

function positionPopup(trigger, popup) {
    const triggerRect = trigger.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let top = triggerRect.bottom + window.scrollY;
    let left = triggerRect.left + window.scrollX;

    if (top + popupRect.height > viewportHeight + window.scrollY) {
        top = triggerRect.top + window.scrollY - popupRect.height;
    }
    if (left + popupRect.width > viewportWidth + window.scrollX) {
        left = viewportWidth + window.scrollX - popupRect.width - 10;
    }

    if (top < window.scrollY) top = window.scrollY + 10;
    if (left < window.scrollX) left = window.scrollX + 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
}




function togglePlayPause(shouldPlay) {
    return new Promise((resolve, reject) => {
        if (isProcessing || !audio.src || audio.src === window.location.href) {
            showNotification('Vui lòng chọn một bài hát để phát.', 'info');
            isProcessing = false;
            reject(new Error('Không có bài hát để phát'));
            return;
        }
        isProcessing = true;

        if (shouldPlay) {
            if (audio.readyState < 1) {
                showNotification('Đang tải bài hát, vui lòng thử lại.', 'info');
                isProcessing = false;
                reject(new Error('Âm thanh chưa sẵn sàng'));
                return;
            }
            audio.play().then(() => {
                record.classList.add('on');
                toneArm.classList.add('play');
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
                isPlaying = true;
                isProcessing = false;
                updateSongList();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                resolve();
            }).catch(err => {
              
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
                isPlaying = false;
                isProcessing = false;
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                reject(err);
            });
        } else {
            audio.pause();
            record.classList.remove('on');
            toneArm.classList.remove('play');
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            isPlaying = false;
            isProcessing = false;
            updateSongList();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            resolve();
        }
    });
}

async function preloadNextSong() {
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    if (!songListSource || songListSource.length === 0) return;

    nextSongIndex = getNextSongIndex(currentSongIndex);
    if (nextSongIndex < 0 || nextSongIndex >= songListSource.length) return;

    const song = songListSource[nextSongIndex];
    const token = localStorage.getItem('auth_token');
    const isOnline = navigator.onLine;
    const isLoggedIn = !!token;

    try {
        if (preloadAudio) {
            preloadAudio.src = '';
            preloadAudio = null;
        }
        preloadAudio = new Audio();
        let blobUrl = null;

        if (!isOnline || !isLoggedIn) {
            if (!song || !song.localPath || !song.songData || !(song.songData instanceof Blob) || !song.songData.type.startsWith('audio/')) {
                throw new Error('Dữ liệu bài hát ngoại tuyến không hợp lệ: Thiếu songData hoặc định dạng không đúng');
            }
            blobUrl = URL.createObjectURL(song.songData);
            preloadAudio.src = blobUrl;
        } else {
            if (!token) throw new Error('Không có mã xác thực');
            const streamUrl = `${API_BASE_URL}/songs/${song.song_id}/stream?token=${token}`;
            preloadAudio.src = streamUrl;
        }

        if (!preloadAudio.src) {
          
            throw new Error('Nguồn âm thanh preload không hợp lệ');
        }

        preloadAudio.preload = 'auto';

        await new Promise((resolve, reject) => {
            preloadAudio.addEventListener('canplay', () => {
                preloadAudio.removeEventListener('canplay', arguments.callee);
                preloadAudio.removeEventListener('error', arguments.callee);
                resolve();
            }, { once: true });

            preloadAudio.addEventListener('error', (e) => {
               
                preloadAudio.removeEventListener('canplay', arguments.callee);
                preloadAudio.removeEventListener('error', arguments.callee);
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                reject(new Error('Tải trước thất bại do lỗi âm thanh'));
            }, { once: true });
        });

        if (blobUrl) {
            const revokeBlob = () => URL.revokeObjectURL(blobUrl);
            preloadAudio.addEventListener('ended', revokeBlob, { once: true });
            preloadAudio.addEventListener('error', revokeBlob, { once: true });
        }
    } catch (error) {
        if (preloadAudio) {
            preloadAudio.src = '';
            preloadAudio = null;
        }
        nextSongIndex = -1;
    }
}

async function appendSong(index, autoPlay = false) {
    if (isLoadingSong) return;
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    if (!songListSource || songListSource.length === 0 || index < 0 || index >= songListSource.length) {
        showNotification('Không có bài hát hợp lệ để phát.', 'error');
        resetAudioState();
        isLoadingSong = false;
        return;
    }

    isLoadingSong = true;
    if (currentSongIndex !== index || playHistory.length === 0) {
        playHistory.push(index);
        if (playHistory.length > 50) playHistory.shift();
        if (isRandom && !playedIndices.includes(index)) {
            playedIndices.push(index);
        }
    }

    currentSongIndex = index;
    const song = songListSource[index];
    const preparingNotification = showNotification('Đang tải...', 'info');
    const token = localStorage.getItem('auth_token');
    const isLoggedIn = !!token;
    const isOnline = navigator.onLine;
    let blobUrl = null;

    try {
        audio.pause();
        audio.src = '';
        audio.load();
        isPlaying = false;
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
        record.classList.remove('on');
        toneArm.classList.remove('play');
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

        if (progress) {
            progress.value = 0;
            progress.max = 100;
            progress.style.setProperty('--progress-value', '0%');
        }
        if (timeStart) timeStart.textContent = '0:00';
        if (timeDuration) timeDuration.textContent = '0:00';

        if (audio.volume === 0) updateVolume(0.8);

        if (preloadAudio && nextSongIndex === index) {
            if (!preloadAudio.src) {
                throw new Error('Nguồn âm thanh preload không hợp lệ.');
            }
            audio.src = preloadAudio.src;
            preloadAudio = null;
            nextSongIndex = -1;
        } else {
            if (!isOnline || !isLoggedIn) {
                if (!song.localPath || !song.songData || !(song.songData instanceof Blob) || !song.songData.type.startsWith('audio/')) {
                    throw new Error('Bài hát không khả dụng ngoại tuyến: Thiếu hoặc dữ liệu không hợp lệ');
                }
                blobUrl = URL.createObjectURL(song.songData);
                audio.src = blobUrl;
            } else {
                if (!token) throw new Error('Vui lòng đăng nhập.');
                const streamUrl = `${API_BASE_URL}/songs/${song.song_id}/stream?token=${token}`;
                audio.src = streamUrl;
            }
        }

        if (!audio.src) 
            throw new Error('Không thể đặt nguồn âm thanh');
    

        songTitle.textContent = song.custom_name || 'Không xác định';
        songArtist.textContent = song.custom_artist || 'Không xác định';

        if ('mediaSession' in navigator) {
            const isOnline = navigator.onLine;
            const artwork = isOnline ? [
                { src: '/image/192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/image/512x512.png', sizes: '512x512', type: 'image/png' }
            ] : [];
        
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.custom_name || 'Không xác định',
                artist: song.custom_artist || 'Không xác định',
                artwork: artwork
            });
            navigator.mediaSession.playbackState = 'paused';
        }

        await new Promise((resolve, reject) => {
            audio.addEventListener('loadedmetadata', () => {
                if (progress) {
                    progress.max = audio.duration || 100;
                    progress.value = 0;
                    progress.style.setProperty('--progress-value', '0%');
                }
                if (timeDuration) timeDuration.textContent = formatTime(audio.duration || 0);
                if (timeStart) timeStart.textContent = '0:00';
                resolve();
            }, { once: true });
            audio.addEventListener('error', (e) => {
                reject(new Error('Không thể tải metadata'));
            }, { once: true });
        });

        await new Promise((resolve, reject) => {
            audio.addEventListener('canplay', () => {
                resolve();
            }, { once: true });
            audio.addEventListener('error', (e) => {
                reject(new Error('Không thể tải âm thanh'));
            }, { once: true });
        });

        const revokeBlob = () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                blobUrl = null;
            }
        };
        audio.addEventListener('ended', revokeBlob, { once: true });
        audio.addEventListener('error', revokeBlob, { once: true });

        if (autoPlay) {
            const autoplayConsent = document.getElementById('autoplay-consent');
            try {
                await togglePlayPause(true);
                localStorage.setItem('autoPlayEnabled', 'true');
            } catch (err) {
                if (err.name === 'NotAllowedError' && localStorage.getItem('autoPlayEnabled') !== 'true' && autoplayConsent) {
                    autoplayConsent.style.display = 'block';
                } else if (err.name !== 'NotAllowedError') {
                    throw err;
                }
            }
        }

        updateSongList();
        preparingNotification.remove();

        preloadNextSong();
    } catch (error) {
        preparingNotification.remove();
        showNotification(`Không thể phát bài hát "${song.custom_name}": ${error.message}`, 'error');
        resetAudioState();
        updateSongList();
    } finally {
        preparingNotification.remove();
        isLoadingSong = false;
    }
}

function resetAudioState() {
    audio.src = '';
    songTitle.textContent = '';
    songArtist.textContent = '';
    if (!isPlaying && !isLoadingSong) currentSongIndex = -1;
    isPlaying = false;
    if (progress) {
        progress.value = 0;
        progress.max = 100;
        progress.style.setProperty('--progress-value', '0%');
    }
    if (timeStart) timeStart.textContent = '0:00';
    if (timeDuration) timeDuration.textContent = '0:00';
    record.classList.remove('on');
    toneArm.classList.remove('play');
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updateSongList();
    if (preloadAudio) {
        preloadAudio.src = '';
        preloadAudio = null;
        nextSongIndex = -1;
    }
}

function updateVolume(volume) {
    if (isNaN(volume) || volume < 0 || volume > 1) return;
    audio.volume = volume;
    const volumePercent = volume * 100;

    if (slider) {
        slider.value = volume;
        slider.style.setProperty('--volume-value', `${volumePercent}%`);
    }
    if (volumeSlider) {
        volumeSlider.value = volumePercent;
        volumeSlider.style.setProperty('--volume-value', `${volumePercent}%`);
    }
}

async function clearIndexedDB(storeName) {
    try {
        if (!db) await initIndexedDB();
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
        showNotification(`Đã xóa ${storeName} khỏi thiết bị`, 'success');
    } catch (error) {
      
        showNotification(`Không thể xóa ${storeName}: ${error.message}`, 'error');
    }
}

async function clearAllIndexedDB() {
    await clearIndexedDB('songs');
    await clearIndexedDB('albums');
    songs = [];
    albums = [];
    updateSongList();
    displayAlbumsList();
}

function updateInterfaceBasedOnState() {
    const isOnline = navigator.onLine;
    const isLoggedIn = !!localStorage.getItem('auth_token');
    const disableActions = !isOnline || !isLoggedIn;

    // Cập nhật trạng thái nút và giao diện
    document.querySelectorAll('.song-options-btn, .album-options-btn').forEach(btn => {
        btn.classList.toggle('disabled', disableActions);
    });

    document.querySelectorAll('.create-album-btn, .toggle-add-song-btn').forEach(btn => {
        btn.disabled = disableActions;
        btn.style.opacity = disableActions ? '0.5' : '1';
    });

    // Cập nhật danh sách bài hát và album
    updateSongList();
    displayAlbumsList();

    // Hiển thị thông báo trạng thái mạng
    if (!isOnline) {
        showNotification('Bạn đang ngoại tuyến.Sử dụng nội dung đã tải', 'info');
    } else if (!isLoggedIn) {
        showNotification('Vui lòng đăng nhập để truy cập toàn bộ chức năng.', 'info');
    }
}

function setupEvents() {
    const debouncedToggle = debounce(() => togglePlayPause(!isPlaying), 200);
    if (playBtn) playBtn.addEventListener('click', debouncedToggle);
    if (btn) btn.addEventListener('click', debouncedToggle);

    if (progress) {
        progress.addEventListener('input', () => {
            if (isNaN(audio.duration)) return;
            const newTime = parseFloat(progress.value);
            audio.currentTime = newTime;
            timeStart.textContent = formatTime(newTime);
            const progressPercent = (newTime / audio.duration) * 100;
            progress.style.setProperty('--progress-value', `${progressPercent}%`);
        });
    }

    audio.addEventListener('timeupdate', () => {
        if (audio.readyState < 1 || isNaN(audio.currentTime) || isNaN(audio.duration)) return;
        if (progress) {
            progress.value = audio.currentTime;
            const progressPercent = (audio.currentTime / audio.duration) * 100;
            progress.style.setProperty('--progress-value', `${progressPercent}%`);
        }
        if (timeStart) timeStart.textContent = formatTime(audio.currentTime);
        if (timeDuration) timeDuration.textContent = formatTime(audio.duration);

        if (isPlaying && audio.duration - audio.currentTime < 10 && !preloadAudio) {
            preloadNextSong();
        }
    });

    audio.addEventListener('ended', () => {
        const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
        if (!songListSource || songListSource.length === 0) {
            resetAudioState();
            updateSongList();
            showNotification('Không có bài hát để phát.', 'info');
            return;
        }

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SONG_ENDED',
            payload: { currentIndex: currentSongIndex, isLoopSingle, isRandom }
        });
    }
        if (isLoopSingle) {
            appendSong(currentSongIndex, true).catch(err => {
                showNotification('Không thể phát lại bài hát: ' + err.message, 'error');
                resetAudioState();
                updateSongList();
            });
            return;
        }

        const nextIndex = getNextSongIndex(currentSongIndex);
        if (nextIndex >= 0 && nextIndex < songListSource.length) {
            appendSong(nextIndex, true).catch(err => {
                showNotification('Không thể phát bài hát tiếp theo: ' + err.message, 'error');
                resetAudioState();
                updateSongList();
            });
        } else {
            resetAudioState();
            updateSongList();
            showNotification('Hết danh sách phát.', 'info');
        }
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            if (!songListSource || songListSource.length === 0) {
                showNotification('Danh sách bài hát rỗng.', 'info');
                return;
            }

            const prevIndex = getPrevSongIndex(currentSongIndex);
            if (prevIndex >= 0 && prevIndex < songListSource.length) {
                appendSong(prevIndex, true).catch(err => {
                    showNotification('Không thể phát bài hát trước đó: ' + err.message, 'error');
                });
            } else {
                showNotification('Không có bài hát trước đó.', 'error');
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            if (!songListSource || songListSource.length === 0) {
                showNotification('Danh sách bài hát rỗng.', 'info');
                return;
            }

            const nextIndex = getNextSongIndex(currentSongIndex);
            if (nextIndex >= 0 && nextIndex < songListSource.length) {
                appendSong(nextIndex, true).catch(err => {
                    showNotification('Không thể phát bài hát tiếp theo: ' + err.message, 'error');
                });
            } else {
                showNotification('Không có bài hát tiếp theo.', 'error');
            }
        });
    }

    if (slider) {
        slider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            updateVolume(volume);
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value) / 100;
            updateVolume(volume);
        });
    }

    audio.addEventListener('error', (e) => {
      
        resetAudioState();
    });

    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            if (isLoopSingle) {
                isLoopSingle = false;
                loopBtn.classList.remove('active');
                
            }
            isRandom = !isRandom;
            randomBtn.classList.toggle('active', isRandom);
            if (isRandom) {
                playHistory = [currentSongIndex];
                playedIndices = currentSongIndex !== -1 ? [currentSongIndex] : [];
                showNotification('Chế độ ngẫu nhiên: Bật', 'info');
            } else {
                playedIndices = [];
                showNotification('Chế độ ngẫu nhiên: Tắt', 'info');
            }
            preloadNextSong();
        });
    }

    if (loopBtn) {
        loopBtn.addEventListener('click', () => {
            if (isRandom) {
                isRandom = false;
                randomBtn.classList.remove('active');
            }
            isLoopSingle = !isLoopSingle;
            loopBtn.classList.toggle('active', isLoopSingle);
            showNotification(`Chế độ lặp một bài: ${isLoopSingle ? 'Bật' : 'Tắt'}`, 'info');
            preloadNextSong();
        });
    }

    if (playlistToggle) {
        playlistToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPopup === 'playlist') {
                setPopup(null);
            } else {
                setPopup('playlist');
                currentAlbumId = null;
                currentAlbumPlaylist = [];
                playHistory = [currentSongIndex];
                updateSongList();
                if (playlistTitle) playlistTitle.textContent = 'Danh sách phát';
            }
        });
    }

    if (albumsToggle) {
        albumsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPopup === 'albums') {
                setPopup(null);
            } else {
                displayAlbumsList();
                setPopup('albums');
            }
        });
    }

    if (toggleAddSongBtn) {
        toggleAddSongBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPopup === 'add-song') setPopup(null);
            else setPopup('add-song');
        });
    }

    if (closeAddSongBtn) {
        closeAddSongBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setPopup(null);
        });
    }

    const createAlbumBtn = document.querySelector('.create-album-btn');
    if (createAlbumBtn) {
        createAlbumBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!navigator.onLine) {
                showNotification('Không thể tạo album khi ngoại tuyến.', 'error');
                return;
            }
            showAlbumInputPopup('Tạo Album', '', async (newTitle) => {
                try {
                    const newAlbum = await fetchAPI('/albums', 'POST', { album_name: newTitle });
                    albums.push(newAlbum);
                    displayAlbumsList();
                } catch (error) {
                    showNotification('Không thể tạo album: ' + error.message, 'error');
                }
            });
        });
    }

    if (addSongSubmit) {
        addSongSubmit.addEventListener('click', async (e) => {
            e.preventDefault();
            if (addSongSubmit.disabled) return;
            if (!navigator.onLine) {
                showNotification('Không thể thêm bài hát khi ngoại tuyến.', 'error');
                return;
            }

            const title = document.querySelector('.add-song-title').value.trim();
            const artist = document.querySelector('.add-song-artist').value.trim();
            const file = document.querySelector('.add-song-file').files[0];

            if (!title || !artist || !file) {
                showNotification('Vui lòng điền đầy đủ !', 'info');
                return;
            }

            if (!file.type.startsWith('audio/')) {
                showNotification('Vui lòng chọn tệp âm thanh (mp3, mpeg, v.v.)!', 'info');
                return;
            }

            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.textContent = 'Đang tải lên...';
            addSongSubmit.parentElement.appendChild(loadingIndicator);
            addSongSubmit.disabled = true;
            addSongSubmit.style.opacity = '0.5';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('custom_name', title);
            formData.append('custom_artist', artist);

            try {
                const response = await fetchAPI('/songs', 'POST', formData);
                if (!response || !response.song) throw new Error('Phản hồi máy chủ không hợp lệ');
                await loadSongs();
                playHistory = [currentSongIndex];
                setPopup(null);
                document.querySelector('.add-song-title').value = '';
                document.querySelector('.add-song-artist').value = '';
                document.querySelector('.add-song-file').value = '';
                showNotification(`Đã tải lên "${response.song.custom_name}" thành công`, 'success');
            } catch (error) {
               
                showNotification('Không thể tải lên bài hát: ' + error.message, 'error');
            } finally {
                loadingIndicator.remove();
                addSongSubmit.disabled = false;
                addSongSubmit.style.opacity = '1';
            }
        });
    }

    const clearIndexedDBBtn = document.querySelector('.clear-indexeddb-btn');
    if (clearIndexedDBBtn) {
        clearIndexedDBBtn.addEventListener('click', async () => {
            await clearAllIndexedDB();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !currentPopup) {
            e.preventDefault();
            togglePlayPause(!isPlaying);
        }
    });

    document.addEventListener('click', (e) => {
        const isOutsidePlaylist = !playlist.contains(e.target) && e.target !== playlistToggle;
        const isOutsideAlbumsList = !document.querySelector('.albums-list')?.contains(e.target) && e.target !== albumsToggle;
        const isOutsideAddSongPopup = !addSongPopup.contains(e.target) && e.target !== toggleAddSongBtn;
        const isNotOptionsBtn = !e.target.closest('.song-options-btn') && !e.target.closest('.album-options-btn');

        if (activePopups.length > 0) {
            const highestZIndexPopup = activePopups.reduce((max, p) => (p.zIndex > max.zIndex ? p : max), activePopups[0]);
            if (!highestZIndexPopup.popup.contains(e.target) && isNotOptionsBtn) {
                highestZIndexPopup.popup.classList.remove('active');
                highestZIndexPopup.popup.style.display = 'none';
                activePopups = activePopups.filter(p => p.popup !== highestZIndexPopup.popup);
                e.stopPropagation();
                return;
            }
        }

        if (activeAlbumInputPopup && !activeAlbumInputPopup.contains(e.target)) {
            activeAlbumInputPopup.remove();
            if (overlay) overlay.classList.remove('active');
            activeAlbumInputPopup = null;
            e.stopPropagation();
            return;
        }

        if (isOutsidePlaylist && isOutsideAlbumsList && isOutsideAddSongPopup) {
            setPopup(null);
        }
    });

    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => togglePlayPause(true));
        navigator.mediaSession.setActionHandler('pause', () => togglePlayPause(false));
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            if (!songListSource || songListSource.length === 0) {
                showNotification('Danh sách bài hát rỗng.', 'info');
                return;
            }
            const prevIndex = getPrevSongIndex(currentSongIndex);
            if (prevIndex >= 0 && prevIndex < songListSource.length) {
                appendSong(prevIndex, true).catch(err => {
                    showNotification('Không thể phát bài hát trước đó: ' + err.message, 'error');
                });
            } else {
                showNotification('Không có bài hát trước đó.', 'error');
            }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            if (!songListSource || songListSource.length === 0) {
                showNotification('Danh sách bài hát rỗng.', 'info');
                return;
            }
            const nextIndex = getNextSongIndex(currentSongIndex);
            if (nextIndex >= 0 && nextIndex < songListSource.length) {
                appendSong(nextIndex, true).catch(err => {
                    showNotification('Không thể phát bài hát tiếp theo: ' + err.message, 'error');
                });
            } else {
                showNotification('Không có bài hát tiếp theo.', 'error');
            }
        });
    }

    const nav = document.querySelector("nav");
    const toggleBtn = document.querySelector(".toggle-btn");
    if (nav && toggleBtn) {
        toggleBtn.addEventListener("click", () => nav.classList.toggle("open"));
    }

    const autoplayConsent = document.getElementById('autoplay-consent');
    const enableAutoplayBtn = document.getElementById('enable-autoplay');
    const cancelAutoplayBtn = document.getElementById('cancel-autoplay');

    if (autoplayConsent && enableAutoplayBtn && cancelAutoplayBtn) {
        enableAutoplayBtn.addEventListener('click', () => {
            localStorage.setItem('autoPlayEnabled', 'true');
            autoplayConsent.style.display = 'none';
            if (songs.length > 0 && currentSongIndex >= 0) appendSong(currentSongIndex, true);
        });
        cancelAutoplayBtn.addEventListener('click', () => {
            localStorage.setItem('autoPlayEnabled', 'false');
            autoplayConsent.style.display = 'none';
        });
    }
}


function deleteFromIndexedDB(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) {
           
            resolve();
            return;
        }

        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
            
            resolve();
        };
        request.onerror = (event) => {
            
            reject(event.target.error);
        };
    });
}

function updateSongItemEvents() {
    const songItems = document.querySelectorAll('.song-item');
    const debouncedAppendSong = debounce((index, autoPlay = false) => appendSong(index, autoPlay), 200);

    songItems.forEach((item, index) => {
        const optionsBtn = item.querySelector('.song-options-btn');
        const optionsPopup = item.querySelector('.options-popup');

        if (optionsBtn) {
            optionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                activePopups.forEach(p => {
                    p.popup.classList.remove('active');
                    p.popup.style.display = 'none';
                });
                activePopups = [];

                if (optionsPopup.classList.contains('active')) {
                    optionsPopup.classList.remove('active');
                    optionsPopup.style.display = 'none';
                } else {
                    optionsPopup.classList.add('active');
                    optionsPopup.style.display = 'block';
                    positionPopup(optionsBtn, optionsPopup);
                    activePopups.push({ trigger: optionsBtn, popup: optionsPopup, zIndex: 1002 });
                }
            });
        }

        const optionItems = optionsPopup.querySelectorAll('.option-item');
        optionItems.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = option.getAttribute('data-action');
                const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
                const song = songListSource[index];
                const isOnline = navigator.onLine;
                const isLoggedIn = !!localStorage.getItem('auth_token');

                if (!song) {
                    showNotification('Không tìm thấy bài hát.', 'error');
                    return;
                }

                if (action === 'delete') {
                    showCustomConfirm(currentAlbumId ? `Xóa "${song.custom_name}" khỏi Album?` : `Xóa vĩnh viễn "${song.custom_name}"?`, async (result) => {
                        if (result) {
                            try {
                                if (isLoggedIn && isOnline) {
                                    if (currentAlbumId) {
                                        await fetchAPI(`/album-song/${currentAlbumId}/${song.song_id}`, 'DELETE');
                                    } else {
                                        await fetchAPI(`/songs/${song.song_id}`, 'DELETE');
                                    }
                                }
                                if (currentAlbumId) {
                                    const albumIndex = albums.findIndex(a => a.id === parseInt(currentAlbumId));
                                    if (albumIndex !== -1) {
                                        albums[albumIndex].songs = albums[albumIndex].songs.filter(s => s.song_id !== parseInt(song.song_id));
                                        currentAlbumPlaylist = currentAlbumPlaylist.filter(s => s.song_id !== parseInt(song.song_id));
                                        const modifiedAlbum = albums[albumIndex];
                                        await saveToIndexedDB('albums', modifiedAlbum);

                                        // Kiểm tra và xóa album nếu không còn bài hát
                                        if (modifiedAlbum.songs.length === 0) {
                                            await deleteFromIndexedDB('albums', modifiedAlbum.id);
                                            albums.splice(albumIndex, 1);
                                            if (currentAlbumId === modifiedAlbum.id) {
                                                currentAlbumId = null;
                                                currentAlbumPlaylist = [];
                                            }
                                        }
                                    }
                                } else {
                                    songs = songs.filter(s => s.song_id !== song.song_id);
                                    await deleteFromIndexedDB('songs', song.song_id);
                                    const affectedAlbums = albums.filter(album => 
                                        album.songs.some(s => s.song_id === song.song_id)
                                    );
                                    affectedAlbums.forEach(album => {
                                        album.songs = album.songs.filter(s => s.song_id !== song.song_id);
                                        if (album.songs.length === 0) {
                                            const albumIndex = albums.findIndex(a => a.id === album.id);
                                            if (albumIndex !== -1) {
                                                albums.splice(albumIndex, 1);
                                                deleteFromIndexedDB('albums', album.id);
                                            }
                                        } else {
                                            saveToIndexedDB('albums', album);
                                        }
                                    });
                                }
                                updateSongList();
                                displayAlbumsList();
                                if (currentSongIndex === index) {
                                    resetAudioState();
                                    updateSongList();
                                }
                                showNotification(`Đã xóa "${song.custom_name}" ${currentAlbumId ? 'khỏi album' : 'thành công'}.`, 'success');
                            } catch (error) {
                                showNotification('Không thể xóa: ' + error.message, 'error');
                            }
                        }
                    });
                } else if (action === 'download') {
                    if (!isOnline) {
                        showNotification('Không thể tải bài hát khi ngoại tuyến.', 'error');
                        return;
                    }
                    await downloadSong(song.song_id, song.custom_name);
                } else if (action === 'add-to-album') {
                    if (!isOnline) {
                        showNotification('Không thể thêm bài hát vào album khi ngoại tuyến.', 'error');
                        return;
                    }
                    const albumSelectPopup = document.createElement('div');
                    albumSelectPopup.classList.add('options-popup');
                    albumSelectPopup.style.zIndex = '1003';
                    albumSelectPopup.innerHTML = `
                        ${albums.length > 0 ? albums.map(album => `
                            <div class="option-item" data-album="${album.id}">${album.album_name}</div>
                        `).join('') : '<div class="option-item">Không có album nào</div>'}`;
                    item.appendChild(albumSelectPopup);

                    albumSelectPopup.classList.add('active');
                    albumSelectPopup.style.display = 'block';
                    positionPopup(optionsBtn, albumSelectPopup);
                    optionsPopup.classList.remove('active');
                    optionsPopup.style.display = 'none';
                    activePopups = activePopups.filter(p => p.popup !== optionsPopup);
                    activePopups.push({ trigger: optionsBtn, popup: albumSelectPopup, zIndex: 1003 });

                    const albumOptions = albumSelectPopup.querySelectorAll('.option-item');
                    albumOptions.forEach(option => {
                        option.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const albumId = option.getAttribute('data-album');

                            if (!albumId || !song.song_id || !song.custom_name || !song.custom_artist) {
                                showNotification('Dữ liệu không hợp lệ.', 'error');
                                albumSelectPopup.remove();
                                activePopups = activePopups.filter(p => p.popup !== albumSelectPopup);
                                return;
                            }

                            try {
                                await fetchAPI('/album-song', 'POST', {
                                    album_id: albumId,
                                    song_id: song.song_id,
                                    custom_name: song.custom_name,
                                    custom_artist: song.custom_artist
                                });
                                showNotification(`Đã thêm "${song.custom_name}" vào "${albums.find(a => a.id === parseInt(albumId)).album_name}"`, 'info');
                                await loadAlbums();
                                displayAlbumsList();
                                if (currentAlbumId && currentAlbumId === parseInt(albumId)) {
                                    await loadAlbumSongs(currentAlbumId);
                                }
                            } catch (error) {
                                showNotification('Không thể thêm bài hát vào album: ' + error.message, 'error');
                            }

                            albumSelectPopup.remove();
                            activePopups = activePopups.filter(p => p.popup !== albumSelectPopup);
                        });
                    });
                }
                optionsPopup.classList.remove('active');
                optionsPopup.style.display = 'none';
                activePopups = activePopups.filter(p => p.popup !== optionsPopup);
            });
        });

        item.addEventListener('click', (e) => {
            if (e.target !== optionsBtn && !e.target.closest('.options-popup')) {
                const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
                const song = songListSource[index];
                if (!song || index < 0 || index >= songListSource.length) {
                    return;
                }
                const isOnline = navigator.onLine;
                const isLoggedIn = !!localStorage.getItem('auth_token');
                if (!isOnline && (!song.localPath || !song.songData || !(song.songData instanceof Blob) || !song.songData.type.startsWith('audio/'))) {
                    showNotification(`Không thể phát "${song.custom_name}": Bài hát không khả dụng ngoại tuyến`, 'error');
                    return;
                }
                debouncedAppendSong(index, true);
            }
        });
    });
}



function updateAlbumItemEvents() {
    const albumItems = document.querySelectorAll('.album-item');
    const debouncedAppendSong = debounce((index, autoPlay = false) => appendSong(index, autoPlay), 200);

    albumItems.forEach(item => {
        const optionsBtn = item.querySelector('.album-options-btn');
        const optionsPopup = item.querySelector('.options-popup');
        const albumTitle = item.querySelector('.album-title');

        if (optionsBtn) {
            optionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                activePopups.forEach(p => {
                    p.popup.classList.remove('active');
                    p.popup.style.display = 'none';
                });
                activePopups = [];

                if (optionsPopup.classList.contains('active')) {
                    optionsPopup.classList.remove('active');
                    optionsPopup.style.display = 'none';
                } else {
                    optionsPopup.classList.add('active');
                    optionsPopup.style.display = 'block';
                    positionPopup(optionsBtn, optionsPopup);
                    activePopups.push({ trigger: optionsBtn, popup: optionsPopup, zIndex: 1002 });
                }
            });
        }

        const optionItems = optionsPopup.querySelectorAll('.option-item');
        optionItems.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = option.getAttribute('data-action');
                const albumId = option.getAttribute('data-album');
                const isOnline = navigator.onLine;
                const isLoggedIn = !!localStorage.getItem('auth_token');

                if (action === 'edit') {
                    if (!isOnline) {
                        showNotification('Không thể chỉnh sửa album khi ngoại tuyến.', 'error');
                        return;
                    }
                    showAlbumInputPopup('Chỉnh sửa Album', albums.find(a => a.id === parseInt(albumId)).album_name, async (newTitle) => {
                        try {
                            await fetchAPI(`/albums/${albumId}`, 'PUT', { album_name: newTitle });
                            await loadAlbums();
                            displayAlbumsList();
                        } catch (error) {
                            showNotification('Không thể cập nhật album: ' + error.message, 'error');
                        }
                    });
                } else if (action === 'delete') {
                    showCustomConfirm(`Xóa Album này?`, async (result) => {
                        if (result) {
                            try {
                                if (!isOnline) {
                                    showNotification('Không thể xóa album khi ngoại tuyến.', 'error');
                                    return;
                                }
                                if (!isLoggedIn) {
                                    showNotification('Vui lòng đăng nhập để xóa album.', 'error');
                                    return;
                                }
                                await fetchAPI(`/albums/${albumId}`, 'DELETE');
                                albums = albums.filter(a => a.id !== parseInt(albumId));
                                displayAlbumsList();
                                if (currentAlbumId === parseInt(albumId)) {
                                    currentAlbumId = null;
                                    currentAlbumPlaylist = [];
                                    updateSongList();
                                }
                                await loadAlbums(); // Làm mới từ server
                                showNotification('Đã xóa album thành công.', 'success');
                            } catch (error) {
                                showNotification('Không thể xóa album: ' + error.message, 'error');
                                await loadAlbums(); // Làm mới từ server nếu thất bại
                                displayAlbumsList();
                            }
                        }
                    });
                } else if (action === 'download') {
                    if (!isOnline) {
                        showNotification('Không thể tải album khi ngoại tuyến.', 'error');
                        return;
                    }
                    const album = albums.find(a => a.id === parseInt(albumId));
                    await downloadAlbum(albumId, album.album_name);
                }
                optionsPopup.classList.remove('active');
                optionsPopup.style.display = 'none';
                activePopups = activePopups.filter(p => p.popup !== optionsPopup);
            });
        });

        item.addEventListener('click', async (e) => {
            const albumId = item.dataset.albumId;
            if (!albumId) return;

            if (e.target === albumTitle || albumTitle.contains(e.target)) {
                await loadAlbumSongs(albumId);
                setPopup('playlist');
                if (currentAlbumPlaylist.length > 0) {
                    await appendSong(0, true);
                }
            } else if (e.target !== optionsBtn && !e.target.closest('.options-popup') && !e.target.closest('.remove-song-btn')) {
                await loadAlbumSongs(albumId);
                setPopup('playlist');
            }
        });

        const removeSongButtons = item.querySelectorAll('.remove-song-btn');
        removeSongButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                const songId = button.dataset.song;
                const albumId = button.dataset.album;
                const isOnline = navigator.onLine;
                const isLoggedIn = !!localStorage.getItem('auth_token');

                showCustomConfirm(`Xóa bài hát khỏi Album?`, async (result) => {
                    if (result) {
                        try {
                            if (!isOnline) {
                                showNotification('Không thể xóa bài hát khi ngoại tuyến.', 'error');
                                return;
                            }
                            if (!isLoggedIn) {
                                showNotification('Vui lòng đăng nhập để xóa bài hát.', 'error');
                                return;
                            }
                            await fetchAPI(`/album-song/${albumId}/${songId}`, 'DELETE');
                            const albumIndex = albums.findIndex(a => a.id === parseInt(albumId));
                            if (albumIndex !== -1) {
                                albums[albumIndex].songs = albums[albumIndex].songs.filter(s => s.song_id !== parseInt(songId));
                                if (currentAlbumId === parseInt(albumId)) {
                                    currentAlbumPlaylist = currentAlbumPlaylist.filter(s => s.song_id !== parseInt(songId));
                                    updateSongList();
                                }
                                if (albums[albumIndex].songs.length === 0) {
                                    albums = albums.filter(a => a.id !== parseInt(albumId));
                                    if (currentAlbumId === parseInt(albumId)) {
                                        currentAlbumId = null;
                                        currentAlbumPlaylist = [];
                                        updateSongList();
                                    }
                                }
                            }
                            await loadAlbums(); // Làm mới từ server
                            displayAlbumsList();
                            if (currentAlbumId === parseInt(albumId)) {
                                await loadAlbumSongs(albumId); // Cập nhật playlist từ API
                            }
                            showNotification('Đã xóa bài hát khỏi album.', 'success');
                        } catch (error) {
                            showNotification('Không thể xóa bài hát: ' + error.message, 'error');
                            await loadAlbums(); // Làm mới từ server nếu thất bại
                            displayAlbumsList();
                            if (currentAlbumId === parseInt(albumId)) {
                                await loadAlbumSongs(albumId); // Cập nhật playlist từ API
                            }
                        }
                    }
                });
            });
        });
    });
}
function syncMediaMetadataWithSW() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
        const song = currentSongIndex !== -1 ? songListSource[currentSongIndex] : null;
        if (song) {
            navigator.serviceWorker.controller.postMessage({
                type: 'UPDATE_MEDIA_METADATA',
                payload: {
                    title: song.custom_name || 'Không xác định',
                    artist: song.custom_artist || 'Không xác định',
                    isPlaying: isPlaying
                }
            });
        }
    } 
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (isPlaying && audio.src && audio.src !== window.location.href) {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    if (err.name === 'NotAllowedError') {
                        showNotification('Yêu cầu tương tác để tiếp tục phát nhạc nền.', 'info');
                        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage({
                                type: 'PLAYBACK_REQUEST',
                                payload: { shouldPlay: true }
                            });
                        }
                    } else {
                        showNotification('Lỗi phát nhạc nền: ' + err.message, 'error');
                    }
                });
            }
            syncMediaMetadataWithSW();
        }
    } else {
        if (isPlaying && audio.src && audio.src !== window.location.href) {
            audio.play().catch(err => {
                showNotification('Lỗi khôi phục phát nhạc: ' + err.message, 'error');
            });
        } else {
            audio.pause();
        }
        syncMediaMetadataWithSW();
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'PLAYBACK_RESPONSE') {
            togglePlayPause(event.data.payload.shouldPlay).catch(err => {
                showNotification('Không thể xử lý yêu cầu phát lại: ' + err.message, 'error');
            });
        } else if (event.data.type === 'NAVIGATE') {
            window.location.href = event.data.payload;
        }
    });
}