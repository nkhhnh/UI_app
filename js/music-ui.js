let audio, playBtn, playIcon, pauseIcon, progress, timeStart, timeDuration;
let volumeSlider, slider, btn, record, toneArm, playlistToggle, albumsToggle;
let playlist, songList, songTitle, songArtist, toggleAddSongBtn, addSongPopup;
let closeAddSongBtn, overlay, addSongSubmit, prevBtn, nextBtn, randomBtn;
let loopBtn, playlistTitle;


let activePopup = null;
let currentPopup = null;
let activePopups = [];
let activeAlbumInputPopup = null;

// ===== Chống vẽ lại danh sách một cách vô ích ============================
// updateSongList() được gọi từ 28 chỗ, trong đó có cả hai nhánh của
// togglePlayPause - nghĩa là mỗi lần bấm play/pause là xoá sạch mọi
// .song-item rồi dựng lại từ template và gắn lại listener cho từng item.
// Với 300 bài đó là 300 lần clone DOM và ~900 listener, chỉ để đổi một class.
// Giờ so "chữ ký" của danh sách: nội dung không đổi thì chỉ chuyển class
// .playing, không dựng lại gì cả.
let lastSongListSignature = null;
let lastAlbumsSignature = null;
let lastScrolledSongId = null;

function buildSongListSignature(source, disableActions, isOnline) {
    return [
        currentAlbumId || '',
        disableActions ? 1 : 0,
        isOnline ? 1 : 0,
        (source || []).map(s =>
            `${s.song_id}|${s.custom_name}|${s.custom_artist}|${s.localPath ? 1 : 0}`
        ).join(',')
    ].join('#');
}

function updatePlayingHighlight() {
    if (!songList) return;
    const source = currentAlbumId ? currentAlbumPlaylist : songs;

    songList.querySelectorAll('.song-item').forEach(item => {
        const song = source[Number(item.dataset.index)];
        const isPlayingItem = !!(song && playingSongId && String(song.song_id) === String(playingSongId));
        item.classList.toggle('playing', isPlayingItem);
    });
}

// Chỉ cuộn khi bài đang phát thực sự đổi, không cuộn mỗi lần play/pause.
function scrollToPlayingIfChanged() {
    if (!songList) return;
    if (String(lastScrolledSongId) === String(playingSongId)) return;
    lastScrolledSongId = playingSongId;

    const activeItem = songList.querySelector('.song-item.playing');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function updateSongList() {
    if (!songList) {
        return;
    }

    const isLoggedIn = !!localStorage.getItem('auth_token');
    const isOnline = navigator.onLine;
    const disableActions = (!isOnline || !isLoggedIn);

    const signature = buildSongListSignature(
        currentAlbumId ? currentAlbumPlaylist : songs,
        disableActions,
        isOnline
    );

    // Không chỉ so chữ ký: DOM có thể bị ghi đè từ bên ngoài (chỗ mở album
    // gán thẳng songList.innerHTML). Đối chiếu thêm số phần tử thật để không
    // bao giờ bỏ qua lần dựng lại mà thực sự cần.
    const source = currentAlbumId ? currentAlbumPlaylist : songs;
    const renderedCount = songList.querySelectorAll('.song-item').length;

    if (signature === lastSongListSignature && renderedCount === (source || []).length) {
        updatePlayingHighlight();
        scrollToPlayingIfChanged();
        return;
    }
    lastSongListSignature = signature;
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    const noSongsMessage = songList.querySelector('.no-songs-message');
    const currentSongId = playingSongId;

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

            if (currentSongId && String(song.song_id) === String(currentSongId)) {
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
    scrollToPlayingIfChanged();
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

    // Cùng cách chống vẽ lại như updateSongList: displayAlbumsList() được gọi
    // 15 chỗ, phần lớn là lúc dữ liệu album không hề đổi.
    const signature = [
        disableActions ? 1 : 0,
        isOnline ? 1 : 0,
        albums.map(a => `${a.id}|${a.album_name}|${(a.songs || []).length}`).join(',')
    ].join('#');

    const renderedAlbums = albumList.querySelectorAll('.album-item').length;
    if (signature === lastAlbumsSignature && renderedAlbums === albums.length) return;
    lastAlbumsSignature = signature;

    albumList.querySelectorAll('.album-item').forEach(item => item.remove());

    if (albums.length === 0) {
        noAlbumsMessage.style.display = 'block';
        noAlbumsMessage.textContent = (!isOnline || !isLoggedIn)
            ? 'Không có album ngoại tuyến nào.'
            : 'Không có album nào.';
    } else {
        noAlbumsMessage.style.display = 'none';
        const albumTemplate = document.getElementById('album-item-template').content;

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

            // Các dòng bài hát KHÔNG dựng sẵn nữa. .album-songs đang là
            // display:none và không chỗ nào thêm class .active, nên trước đây
            // toàn bộ số dòng này được tạo ra rồi không bao giờ hiện lên -
            // 20 album x 30 bài là 600 nút DOM cùng listener cho mỗi nút Xoá.
            // renderAlbumSongs() bên dưới dựng chúng khi album được mở ra.
            const albumSongs = albumClone.querySelector('.album-songs');
            albumSongs.dataset.rendered = '0';

            albumList.appendChild(albumClone);
        });
    }
    updateAlbumItemEvents();
}

/**
 * Dựng danh sách bài hát của MỘT album, chỉ khi album đó được mở ra.
 *
 * Gọi hàm này khi thêm class .active cho .album-songs. Hiện chưa nơi nào
 * mở album trong danh sách (xem ghi chú ở displayAlbumsList), nên mặc định
 * không có dòng nào được dựng.
 */
function renderAlbumSongs(albumItem) {
    if (!albumItem) return;

    const albumSongs = albumItem.querySelector('.album-songs');
    if (!albumSongs || albumSongs.dataset.rendered === '1') return;

    const album = albums.find(a => String(a.id) === String(albumItem.dataset.albumId));
    if (!album) return;

    const isOnline = navigator.onLine;
    const songTemplate = document.getElementById('album-song-item-template').content;
    const noAlbumSongsMessage = albumSongs.querySelector('.no-album-songs-message');

    const songsToDisplay = (album.songs || []).filter(song =>
        isOnline || songs.find(s => String(s.song_id) === String(song.song_id))?.localPath
    );

    if (songsToDisplay.length === 0) {
        noAlbumSongsMessage.style.display = 'block';
        noAlbumSongsMessage.textContent = isOnline
            ? 'Không có bài hát trong album này.'
            : 'Không có bài hát ngoại tuyến trong album này.';
        albumSongs.dataset.rendered = '1';
        return;
    }

    noAlbumSongsMessage.style.display = 'none';

    songsToDisplay.forEach(song => {
        const songClone = document.importNode(songTemplate, true);
        songClone.querySelector('.song-title').textContent = song.custom_name || 'Không xác định';
        songClone.querySelector('.song-artist').textContent = song.custom_artist || 'Không xác định';
        songClone.querySelector('.remove-song-btn').dataset.song = song.song_id;
        songClone.querySelector('.remove-song-btn').dataset.album = album.id;

        if (!isOnline && !songs.find(s => String(s.song_id) === String(song.song_id))?.localPath) {
            songClone.querySelector('.album-song-item').classList.add('disabled');
            songClone.querySelector('.album-song-item').title = 'Bài hát không khả dụng ngoại tuyến';
            songClone.querySelector('.remove-song-btn').disabled = true;
        }

        albumSongs.appendChild(songClone);

        if (playingSongId && String(song.song_id) === String(playingSongId)) {
            albumSongs.lastElementChild.classList.add('playing');
        }
    });

    albumSongs.dataset.rendered = '1';
    updateAlbumItemEvents();
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

                    const progressContainer = item.querySelector('.download-progress-container');
                    item.classList.add('downloading');
                    if (progressContainer) {
                        progressContainer.style.width = '0%';
                    }

                    try {
                        await downloadSong(song.song_id, song.custom_name, (percent) => {
                            if (progressContainer) {
                                progressContainer.style.width = percent !== null ? `${Math.min(100, percent * 100)}%` : '100%';
                            }
                        });
                    } finally {
                        if (progressContainer) {
                            progressContainer.style.width = '100%';
                        }
                        setTimeout(() => item.classList.remove('downloading'), 500);
                    }
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
                if (!song || index < 0 || index >= songListSource.length) return;
                const isOnline = navigator.onLine;
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
                        if (albums.some(a => a.id !== parseInt(albumId) && a.album_name.toLowerCase() === newTitle.toLowerCase())) {
                            throw new Error(`Tên album "${newTitle}" đã được sử dụng bởi album khác!`);
                        }
                        try {
                            await fetchAPI(`/albums/${albumId}`, 'PUT', { album_name: newTitle });
                            await loadAlbums();
                            displayAlbumsList();
                        } catch (error) {
                            throw new Error('Không thể cập nhật album: ' + error.message);
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
                                await loadAlbums();
                                showNotification('Đã xóa album thành công.', 'success');
                            } catch (error) {
                                showNotification('Không thể xóa album: ' + error.message, 'error');
                                await loadAlbums();
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
                    const progressContainer = item.querySelector('.download-progress-container');
                    item.classList.add('downloading');
                    if (progressContainer) {
                        progressContainer.style.width = '0%';
                    }

                    try {
                        await downloadAlbum(albumId, album.album_name, (percent) => {
                            if (progressContainer) {
                                progressContainer.style.width = percent !== null ? `${Math.min(100, percent * 100)}%` : '100%';
                            }
                        });
                    } finally {
                        if (progressContainer) {
                            progressContainer.style.width = '100%';
                        }
                        setTimeout(() => item.classList.remove('downloading'), 500);
                    }
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
                setPopup('playlist');
                if (playlistTitle) playlistTitle.textContent = 'Đang tải...';
                const songListEl = document.querySelector('.song-list');
                if (songListEl) songListEl.innerHTML = '<p class="no-songs-message" style="display:block; color:#fff;">Đang đồng bộ dữ liệu...</p>';
                lastSongListSignature = null; // DOM vừa bị ghi đè, chữ ký cũ không còn đúng

                await loadAlbumSongs(albumId);
                if (currentAlbumPlaylist.length > 0) await appendSong(0, true);
            } else if (e.target !== optionsBtn && !e.target.closest('.options-popup') && !e.target.closest('.remove-song-btn')) {
                setPopup('playlist');
                if (playlistTitle) playlistTitle.textContent = 'Đang tải...';
                const songListEl = document.querySelector('.song-list');
                if (songListEl) songListEl.innerHTML = '<p class="no-songs-message" style="display:block; color:#fff;">Đang đồng bộ dữ liệu...</p>';
                lastSongListSignature = null; // DOM vừa bị ghi đè, chữ ký cũ không còn đúng

                await loadAlbumSongs(albumId);
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
                            if (!isOnline) throw new Error('Không thể xóa bài hát khi ngoại tuyến.');
                            if (!isLoggedIn) throw new Error('Vui lòng đăng nhập để xóa bài hát.');
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
                            await loadAlbums();
                            displayAlbumsList();
                            if (currentAlbumId === parseInt(albumId)) await loadAlbumSongs(albumId);
                            showNotification('Đã xóa bài hát khỏi album.', 'success');
                        } catch (error) {
                            showNotification(error.message, 'error');
                        }
                    }
                });
            });
        });
    });
}

function setupEvents() {
    try {
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
    } catch (err) {
        console.error("Lỗi nạp sự kiện âm lượng:", err);
    }

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

        if (isPlaying && audio.duration - audio.currentTime < 10) {
            // Tuỳ chọn: preload bài tiếp theo nếu offline có bài ngoại tuyến
            // Nếu online, stream trực tiếp không cần preload
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

        if (isLoopSingle) {
            appendSong(currentSongIndex, true).catch(err => {
                console.warn('Không thể phát lại bài hát:', err.message);
                if (document.visibilityState === 'visible') {
                    showNotification('Không thể phát lại bài hát: ' + err.message, 'error');
                }
                resetAudioState();
                updateSongList();
            });
            return;
        }

        const nextIndex = getNextSongIndex(currentSongIndex);
        if (nextIndex >= 0 && nextIndex < songListSource.length) {
            appendSong(nextIndex, true).catch(err => {
                console.warn('Không thể phát bài hát tiếp theo:', err.message);
                if (document.visibilityState === 'visible') {
                    showNotification('Không thể phát bài hát tiếp theo: ' + err.message, 'error');
                }
                resetAudioState();
                updateSongList();
            });
        } else {
            resetAudioState();
            updateSongList();
            if (document.visibilityState === 'visible') {
                showNotification('Hết danh sách phát.', 'info');
            }
        }
    });

    const debouncedPrev = debounce(() => {
        const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
        if (!songListSource || songListSource.length === 0) {
            showNotification('Danh sách bài hát rỗng.', 'info');
            return;
        }
        if (isLoadingSong) return;

        const prevIndex = getPrevSongIndex(currentSongIndex);
        if (prevIndex >= 0 && prevIndex < songListSource.length) {
            appendSong(prevIndex, isPlaying).catch(err => {
                showNotification('Không thể phát bài hát trước đó: ' + err.message, 'error');
            });
        } else {
            showNotification('Đang ở bài đầu tiên.', 'info');
        }
    }, 300);

    if (prevBtn) prevBtn.addEventListener('click', debouncedPrev);

    const debouncedNext = debounce(() => {
        const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
        if (!songListSource || songListSource.length === 0) {
            showNotification('Danh sách bài hát rỗng.', 'info');
            return;
        }
        if (isLoadingSong) return;

        const nextIndex = getNextSongIndex(currentSongIndex);
        if (nextIndex >= 0 && nextIndex < songListSource.length) {
            appendSong(nextIndex, isPlaying).catch(err => {
                showNotification('Không thể phát bài hát tiếp theo: ' + err.message, 'error');
            });
        } else {
            showNotification('Đã phát hết danh sách.', 'info');
        }
    }, 300);

    if (nextBtn) nextBtn.addEventListener('click', debouncedNext);

    audio.addEventListener('error', () => {
        // Lỗi phát nhạc thường chỉ là đứt kết nối tạm thời khi tắt màn hình.
        // Nếu người dùng vẫn đang muốn nghe thì thử nối lại thay vì reset hẳn.
        if (isPlaying && !isLoadingSong && currentSourceUrl) {
            // audio.error da duoc set -> day la loi that, cho phep nap lai nguon.
            scheduleResume(true);
            return;
        }
        if (!isLoadingSong) resetAudioState();
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
                if (albums.some(a => a.album_name.toLowerCase() === newTitle.toLowerCase())) {
                    throw new Error(`Album "${newTitle}" đã tồn tại!`);
                }
                try {
                    const newAlbum = await fetchAPI('/albums', 'POST', { album_name: newTitle });
                    albums.push(newAlbum);
                    displayAlbumsList();
                } catch (error) {
                    throw new Error('Không thể tạo album: ' + error.message);
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

            const MAX_FILE_SIZE_MB = 50;
            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                showNotification(`File quá lớn! Tối đa ${MAX_FILE_SIZE_MB}MB.`, 'error');
                return;
            }

            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.textContent = 'Đang tải lên...';
            addSongSubmit.parentElement.appendChild(loadingIndicator);
            addSongSubmit.disabled = true;
            addSongSubmit.style.opacity = '0.5';

            try {
                let response = null;

                // Hỏi trước bằng mã hash: file đã có trên hệ thống thì được gắn
                // thẳng vào thư viện, không phải tải lên byte nào.
                const fileHash = await computeFileHash(file);

                if (fileHash) {
                    loadingIndicator.textContent = 'Đang kiểm tra...';
                    try {
                        const check = await fetchAPI('/songs/check-hash', 'POST', {
                            file_hash: fileHash,
                            custom_name: title,
                            custom_artist: artist
                        });
                        if (check && check.exists) response = check;
                    } catch (error) {
                        // Không hỏi được thì cứ tải lên như bình thường.
                    }
                }

                if (!response) {
                    loadingIndicator.textContent = 'Đang tải lên...';
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('custom_name', title);
                    formData.append('custom_artist', artist);
                    response = await fetchAPI('/songs', 'POST', formData);
                }

                if (!response || !response.song) throw new Error('Phản hồi máy chủ không hợp lệ');
                await loadSongs();
                playHistory = [currentSongIndex];
                setPopup(null);
                document.querySelector('.add-song-title').value = '';
                document.querySelector('.add-song-artist').value = '';
                document.querySelector('.add-song-file').value = '';
                showNotification(
                    response.exists
                        ? `"${response.song.custom_name}" đã có sẵn trên hệ thống, thêm vào thư viện ngay`
                        : `Đã tải lên "${response.song.custom_name}" thành công`,
                    'success'
                );
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
        const albumsListEl = document.querySelector('.albums-list');
        const isOutsideAlbumsList = !albumsListEl?.contains(e.target) && e.target !== albumsToggle;
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
        const safeHandler = (action, handler) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (e) {
                // Trình duyệt không hỗ trợ action này.
            }
        };

        safeHandler('seekto', (details) => {
            if (!audio || isNaN(audio.duration)) return;
            if (details.fastSeek && typeof audio.fastSeek === 'function') {
                audio.fastSeek(details.seekTime);
            } else {
                audio.currentTime = details.seekTime;
            }
            updatePositionState();
        });
        safeHandler('seekbackward', (details) => {
            if (!audio || isNaN(audio.duration)) return;
            audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
            updatePositionState();
        });
        safeHandler('seekforward', (details) => {
            if (!audio || isNaN(audio.duration)) return;
            audio.currentTime = Math.min(audio.duration, audio.currentTime + (details.seekOffset || 10));
            updatePositionState();
        });
        safeHandler('stop', () => {
            togglePlayPause(false).catch(() => { });
        });

        navigator.mediaSession.setActionHandler('play', () => togglePlayPause(true));
        navigator.mediaSession.setActionHandler('pause', () => togglePlayPause(false));
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            if (!songListSource || songListSource.length === 0) return;
            const prevIndex = getPrevSongIndex(currentSongIndex);
            if (prevIndex >= 0 && prevIndex < songListSource.length) {
                appendSong(prevIndex, true).catch(err => showNotification(err.message, 'error'));
            }
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            if (!songListSource || songListSource.length === 0) return;
            const nextIndex = getNextSongIndex(currentSongIndex);
            if (nextIndex >= 0 && nextIndex < songListSource.length) {
                appendSong(nextIndex, true).catch(err => showNotification(err.message, 'error'));
            }
        });
    }

    const nav = document.querySelector("nav");
    const toggleBtn = document.querySelector(".toggle-btn");
    if (nav && toggleBtn) {
        toggleBtn.addEventListener("click", () => nav.classList.toggle("open"));
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    audio = document.getElementById('audio');
    playBtn = document.querySelector('.music-control__icon-play');
    playIcon = playBtn?.querySelector('.fa-play');
    pauseIcon = playBtn?.querySelector('.fa-pause');
    progress = document.getElementById('progress');
    timeStart = document.querySelector('.music-control__progress-time-start');
    timeDuration = document.querySelector('.music-control__progress-time-duration');
    volumeSlider = document.getElementById('progress1');
    slider = document.querySelector('.slider');
    
    // Khôi phục âm lượng ngay lập tức để tránh trễ giao diện
    const savedVolume = localStorage.getItem('music_player_volume');
    const initialVolume = savedVolume !== null ? parseFloat(savedVolume) : 1.0;
    updateVolume(initialVolume);

    btn = document.querySelector('.btn');
    record = document.querySelector('.record');
    toneArm = document.querySelector('.tone-arm');
    playlistToggle = document.querySelector('.playlist-toggle');
    albumsToggle = document.querySelector('.albums-toggle');
    playlist = document.querySelector('.playlist');
    songList = document.querySelector('.song-list');
    songTitle = document.querySelector('.music-control__left-content-song');
    songArtist = document.querySelector('.music-control__left-content-singer');
    toggleAddSongBtn = document.querySelector('.toggle-add-song-btn');
    addSongPopup = document.querySelector('.add-song-popup');
    closeAddSongBtn = document.querySelector('.close-add-song-btn');
    overlay = document.querySelector('.overlay');
    addSongSubmit = document.querySelector('.add-song-submit');
    prevBtn = document.querySelector('.fa-backward');
    nextBtn = document.querySelector('.fa-forward');
    randomBtn = document.querySelector('.fa-random');
    loopBtn = document.querySelector('.fa-redo');
    playlistTitle = document.querySelector('.playlist-header');
    setupEvents();
    initPlaybackResilience();
    try {
        await initIndexedDB();
        await loadSongs();
        await loadAlbums();
        updateSongList();
        displayAlbumsList();

        updateInterfaceBasedOnState();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
            const artwork = navigator.onLine ? [
                { src: '/image/192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/image/512x512.png', sizes: '512x512', type: 'image/png' }
            ] : [];
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Không có bài hát đang phát',
                artist: '',
                artwork: artwork
            });
        }

        const updateListsBasedOnState = async () => {
            try {
                const isPlayingNow = isPlaying;
                const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
                const currentSong = currentSongIndex !== -1 ? songListSource[currentSongIndex] : null;

                await loadSongs();
                await loadAlbums();
                updateSongList();
                displayAlbumsList();

                if (currentSong && isPlayingNow) {
                    // Mạng chập chờn khi tắt màn hình (Wi-Fi ngủ, đổi sang 4G) làm
                    // sự kiện online/offline bắn liên tục. Trước đây chỗ này gọi
                    // appendSong() -> bài đang nghe bị phát lại từ đầu, hoặc bị
                    // resetAudioState() -> nhạc tắt hẳn. Giờ chỉ đồng bộ lại chỉ số
                    // bài hát, còn phần âm thanh để cơ chế tự phục hồi lo.
                    const newSource = currentAlbumId ? currentAlbumPlaylist : songs;
                    const newIndex = newSource.findIndex(s => s && s.song_id === currentSong.song_id);
                    // Nếu bài đang nghe không còn trong danh sách mới (ví dụ chuyển
                    // sang offline mà bài này chưa tải về) thì vẫn để nó phát hết,
                    // không cắt ngang giữa chừng.
                    if (newIndex !== -1) currentSongIndex = newIndex;
                    updateSongList();
                }
            } catch (error) {
                showNotification('Không thể cập nhật danh sách: ' + error.message, 'error');
            }
        };

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

        let lastLoginStatus = !!localStorage.getItem('auth_token');
        const checkLoginStatus = async () => {
            const currentLoginStatus = !!localStorage.getItem('auth_token');
            if (currentLoginStatus !== lastLoginStatus) {
                lastLoginStatus = currentLoginStatus;
                updateInterfaceBasedOnState();
                await updateListsBasedOnState();
            }
        };

        window.addEventListener('storage', async (event) => {
            if (event.key === 'auth_token') await checkLoginStatus();
        });


        const originalFetchAPI = fetchAPI;
        window.fetchAPI = async (endpoint, method = 'GET', body = null) => {
            try {
                return await originalFetchAPI(endpoint, method, body);
            } catch (error) {
                if (error.message.includes('Phiên hết hạn') || error.message.includes('Đang chuyển hướng')) {
                    await checkLoginStatus();
                }
                throw error;
            }
        };

        const wrapWithStateCheck = (originalFunction) => {
            return async (...args) => {
                await checkLoginStatus();
                return originalFunction(...args);
            };
        };
        window.appendSong = wrapWithStateCheck(appendSong);
        window.loadSongs = wrapWithStateCheck(loadSongs);
        window.loadAlbums = wrapWithStateCheck(loadAlbums);
        window.updateSongItemEvents = wrapWithStateCheck(updateSongItemEvents);
        window.updateAlbumItemEvents = wrapWithStateCheck(updateAlbumItemEvents);

    } catch (error) {
        showNotification('Không thể khởi tạo ứng dụng: ' + error.message, 'error');
    }
});

document.addEventListener('visibilitychange', () => {
    // Khi tắt màn hình / chuyển app: KHÔNG đụng vào audio đang chạy.
    // Trước đây nhánh else gọi audio.pause() vô điều kiện, làm nhạc tắt khi
    // quay lại app; còn nhánh hidden gọi play() thừa và bắn thông báo lỗi.
    if (!audio) return;

    if (isPlaying && audio.paused && currentSourceUrl && !isLoadingSong) {
        // Chỉ can thiệp khi trình duyệt đã tự dừng dù ta vẫn muốn nghe.
        audio.play().catch(() => scheduleResume());
    }

    if (!document.hidden) {
        updatePositionState();
    }
    syncMediaMetadataWithSW();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data || !event.data.type) return;

        if (event.data.type === 'PLAYBACK_RESPONSE') {
            togglePlayPause(event.data.payload.shouldPlay).catch(() => { });
        } else if (event.data.type === 'PLAY_NEXT_SONG') {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            const currentIndex = Number.isInteger(event.data.payload?.currentIndex)
                ? event.data.payload.currentIndex
                : currentSongIndex;

            const nextIndex = getNextSongIndex(currentIndex);
            if (songListSource && nextIndex >= 0 && nextIndex < songListSource.length) {
                appendSong(nextIndex, true).catch(err => {
                    showNotification('Không thể chuyển bài tự động: ' + err.message, 'error');
                });
            } else {
                resetAudioState();
                updateSongList();
            }
        } else if (event.data.type === 'NAVIGATE') {
            window.location.href = event.data.payload;
        }
    });
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
                playlistTitle.textContent = album ? `${album.album_name}` : 'Danh sách phát';
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
        if (saveBtn.disabled) return;

        const newTitle = input.value.trim();
        if (!newTitle) {
            showNotification('Vui lòng nhập tên album hợp lệ.', 'info');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        saveBtn.textContent = 'Đang lưu...';

        try {
            await onSave(newTitle);
            popup.remove();
            if (overlay) overlay.classList.remove('active');
            activeAlbumInputPopup = null;
        } catch (error) {
            showNotification(error.message, 'error');
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.textContent = 'Lưu';
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

function updateInterfaceBasedOnState() {
    const isOnline = navigator.onLine;
    const isLoggedIn = !!localStorage.getItem('auth_token');
    const disableActions = !isOnline || !isLoggedIn;

    document.querySelectorAll('.song-options-btn, .album-options-btn').forEach(btn => {
        btn.classList.toggle('disabled', disableActions);
    });

    document.querySelectorAll('.create-album-btn, .toggle-add-song-btn').forEach(btn => {
        btn.disabled = disableActions;
        btn.style.opacity = disableActions ? '0.5' : '1';
    });

    updateSongList();
    displayAlbumsList();

    if (!isOnline) {
        showNotification('Bạn đang ngoại tuyến.Sử dụng nội dung đã tải', 'info');
    } else if (!isLoggedIn) {
        showNotification('Vui lòng đăng nhập để truy cập toàn bộ chức năng.', 'info');
    }
}
