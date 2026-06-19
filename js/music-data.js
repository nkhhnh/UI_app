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
            currentAlbumPlaylist = albumData.songs
                .map(song => {
                    const songInGlobal = songs.find(s => s.song_id === song.song_id);
                    return songInGlobal || song;
                })
                .filter(song => song && song.song_id && song.custom_name);
            currentAlbumId = albumId;
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
