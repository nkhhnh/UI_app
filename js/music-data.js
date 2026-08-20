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
            const onlineSongs = await fetchAPI('/songs');
            const localSongs = await loadFromIndexedDB('songs');
            songs = onlineSongs.map(onlineSong => {
                const localSong = localSongs.find(s => s && s.song_id === onlineSong.song_id);
                if (localSong && localSong.songData instanceof Blob) {
                    return {
                        ...onlineSong,
                        localPath: true,
                        songData: localSong.songData
                    };
                }
                return onlineSong;
            });
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

/**
 * Ghép bài hát của album với bản ghi trong danh sách chung, để lấy được
 * songData (blob đã tải offline) nếu có.
 */
function mapAlbumSongsToGlobal(albumSongs) {
    return albumSongs
        .map(song => songs.find(s => String(s.song_id) === String(song.song_id)) || song)
        .filter(song => song && song.song_id && song.custom_name);
}

/**
 * Đối chiếu lại danh sách bài hát của album với máy chủ mà không chặn giao
 * diện. Chỉ vẽ lại khi thực sự có thay đổi, và bỏ qua nếu người dùng đã
 * chuyển sang album khác trong lúc chờ.
 */
async function refreshAlbumSongsInBackground(albumId) {
    try {
        const fresh = await fetchAPI(`/albums/${albumId}`);
        if (!fresh || !Array.isArray(fresh.songs)) return;
        if (String(currentAlbumId) !== String(albumId)) return;

        const albumIndex = albums.findIndex(a => String(a.id) === String(albumId));
        if (albumIndex !== -1) albums[albumIndex].songs = fresh.songs;

        const freshIds = fresh.songs.map(s => String(s.song_id)).join(',');
        const shownIds = currentAlbumPlaylist.map(s => String(s.song_id)).join(',');
        if (freshIds === shownIds) return;

        currentAlbumPlaylist = mapAlbumSongsToGlobal(fresh.songs);
        updateSongList();
        displayAlbumsList();
    } catch (error) {
        // Không đối chiếu được thì giữ nguyên bản đang hiển thị.
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
            // /albums giờ đã trả về kèm bài hát, nên mở một album không cần
            // gọi mạng nữa - đây là chỗ trước đây phải chờ cả một vòng request
            // tới Render (cộng thêm thời gian server thức dậy nếu đang ngủ).
            const cached = albums.find(a => String(a.id) === String(albumId));

            albumData = (cached && Array.isArray(cached.songs))
                ? cached
                : await fetchAPI(`/albums/${albumId}`);

            if (!albumData || !Array.isArray(albumData.songs)) {
                throw new Error('Dữ liệu album không hợp lệ');
            }
            currentAlbumPlaylist = mapAlbumSongsToGlobal(albumData.songs);
            currentAlbumId = albumId;

            // Dữ liệu trong bộ nhớ có thể đã cũ nếu album được sửa ở nơi khác.
            // Hiện ngay bản đang có rồi âm thầm đối chiếu lại với máy chủ.
            if (cached) refreshAlbumSongsInBackground(albumId);
        }

        updateSongList();

        if (playlistTitle) {
            const album = albums.find(a => a.id === parseInt(albumId));
            playlistTitle.textContent = album ? `${album.album_name}` : 'Danh sách phát';
        }
    } catch (error) {
        currentAlbumId = null;
        currentAlbumPlaylist = [];
        updateSongList();
        if (playlistTitle) playlistTitle.textContent = 'Danh sách phát';
        showNotification(`Không thể tải bài hát của album: ${error.message}`, 'error');
    }
}

/**
 * Tính SHA-256 của file ngay trên trình duyệt, trả về chuỗi hex thường.
 *
 * Dùng để hỏi máy chủ "file này có sẵn chưa?" TRƯỚC khi tải lên. Máy chủ vốn
 * đã chống trùng bằng hash, nhưng chỉ phát hiện được sau khi đã nhận xong
 * toàn bộ file - tức là đã tốn hết băng thông rồi mới biết là thừa.
 *
 * Trả về null nếu không tính được (crypto.subtle chỉ tồn tại trong secure
 * context - https hoặc localhost). Khi đó luồng tải lên chạy như bình thường.
 */
async function computeFileHash(file) {
    if (!window.crypto || !window.crypto.subtle || !file) return null;

    try {
        const buffer = await file.arrayBuffer();
        const digest = await window.crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (error) {
        return null;
    }
}

async function downloadSong(songId, songName, progressCallback = null) {
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

        let blob;
        if (response.body && progressCallback) {
            const reader = response.body.getReader();
            const contentLength = Number(response.headers.get('Content-Length')) || null;
            const chunks = [];
            let receivedLength = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedLength += value.length;
                if (contentLength) {
                    progressCallback(receivedLength / contentLength);
                } else {
                    progressCallback(null);
                }
            }

            blob = new Blob(chunks, { type: contentType });
        } else {
            blob = await response.blob();
        }

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
        throw error;
    }
}

async function downloadAlbum(albumId, albumName, progressCallback = null) {
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
        const totalSongs = albumData.songs.length;
        let completedSongs = 0;

        for (const song of albumData.songs) {
            await downloadSong(song.song_id, song.custom_name, (songPercent) => {
                if (progressCallback) {
                    if (songPercent === null) {
                        progressCallback(null);
                    } else {
                        const albumPercent = (completedSongs + songPercent) / totalSongs;
                        progressCallback(Math.min(1, albumPercent));
                    }
                }
            });
            completedSongs += 1;
            if (progressCallback) {
                progressCallback(Math.min(1, completedSongs / totalSongs));
            }
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
