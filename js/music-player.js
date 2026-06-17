let isPlaying = false;
let isProcessing = false;
let isLoadingSong = false;
let currentAlbumPlaylist = [];
let currentSongIndex = -1;
let isLoopSingle = false;
let isRandom = false;
let currentAlbumId = null;
let playHistory = [];
let playedIndices = [];
let preloadAudio = null;
let nextSongIndex = -1;
let playingSongId = null;
let activeBlobUrl = null;
let preloadedBlobUrl = null;
let isPreloadComplete = false;
let preloadAbortController = null;

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

    if (isRandom) {
        if (playHistory.length > 1) {
            playHistory.pop();
            const prevIndex = playHistory[playHistory.length - 1];
            if (prevIndex !== undefined && prevIndex >= 0) {
                if (playedIndices.includes(currentIndex)) {
                    playedIndices = playedIndices.filter(i => i !== currentIndex);
                }
                return prevIndex;
            }
        }
        return currentIndex;
    }

    if (currentIndex > 0) return currentIndex - 1;

    return -1;
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
        if (preloadedBlobUrl) {
            URL.revokeObjectURL(preloadedBlobUrl);
            preloadedBlobUrl = null;
        }
        // Hủy lệnh fetch cũ nếu đang chạy
        if (preloadAbortController) {
            preloadAbortController.abort();
            preloadAbortController = null;
        }
        isPreloadComplete = false;

        preloadAudio = new Audio();
        let blobUrl = null;

        if (!isOnline || !isLoggedIn) {
            if (!song || !song.localPath || !song.songData || !(song.songData instanceof Blob) || !song.songData.type.startsWith('audio/')) {
                throw new Error('Dữ liệu bài hát ngoại tuyến không hợp lệ: Thiếu songData hoặc định dạng không đúng');
            }
            blobUrl = URL.createObjectURL(song.songData);
            preloadedBlobUrl = blobUrl;
            preloadAudio.src = blobUrl;
        } else {
            if (!token) throw new Error('Không có mã xác thực');
            const streamUrl = `${API_BASE_URL}/songs/${song.song_id}/stream?token=${token}`;
            
            // Tải ngầm file nhạc dưới dạng Blob (có thể hủy)
            preloadAbortController = new AbortController();
            const response = await fetch(streamUrl, { signal: preloadAbortController.signal });
            if (!response.ok) throw new Error('Không thể tải bài hát từ server');
            const blob = await response.blob();
            blobUrl = URL.createObjectURL(blob);
            preloadedBlobUrl = blobUrl;
            preloadAudio.src = blobUrl;
            preloadAbortController = null;
        }

        if (!preloadAudio.src) {
            throw new Error('Nguồn âm thanh preload không hợp lệ');
        }

        preloadAudio.preload = 'auto';

        await new Promise((resolve, reject) => {
            preloadAudio.addEventListener('canplay', () => {
                resolve();
            }, { once: true });

            preloadAudio.addEventListener('error', (e) => {
                if (blobUrl) {
                    URL.revokeObjectURL(blobUrl);
                    if (preloadedBlobUrl === blobUrl) preloadedBlobUrl = null;
                }
                reject(new Error('Tải trước thất bại do lỗi âm thanh'));
            }, { once: true });
        });

        isPreloadComplete = true;
    } catch (error) {
        if (preloadAudio) {
            preloadAudio.src = '';
            preloadAudio = null;
        }
        if (preloadedBlobUrl) {
            URL.revokeObjectURL(preloadedBlobUrl);
            preloadedBlobUrl = null;
        }
        isPreloadComplete = false;
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
    try {
        if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = null;
        }

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

        if (preloadAudio && nextSongIndex === index && isPreloadComplete) {
            // Preload hoàn thành → phát từ Blob cục bộ (tối ưu cho tắt màn hình)
            audio.src = preloadAudio.src;
            activeBlobUrl = preloadedBlobUrl;
            preloadedBlobUrl = null;
            preloadAudio = null;
            nextSongIndex = -1;
        } else {
            // Hủy preload cũ nếu đang chạy dở
            if (preloadAbortController) {
                preloadAbortController.abort();
                preloadAbortController = null;
            }
            if (preloadAudio) {
                preloadAudio.src = '';
                preloadAudio = null;
            }
            if (preloadedBlobUrl) {
                URL.revokeObjectURL(preloadedBlobUrl);
                preloadedBlobUrl = null;
            }
            isPreloadComplete = false;
            nextSongIndex = -1;

            if (!isOnline || !isLoggedIn) {
                if (!song.localPath || !song.songData || !(song.songData instanceof Blob) || !song.songData.type.startsWith('audio/')) {
                    throw new Error('Bài hát không khả dụng ngoại tuyến: Thiếu hoặc dữ liệu không hợp lệ');
                }
                const localBlobUrl = URL.createObjectURL(song.songData);
                audio.src = localBlobUrl;
                activeBlobUrl = localBlobUrl;
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
        playingSongId = song.song_id;

        if ('mediaSession' in navigator) {
            const artworkIsOnline = navigator.onLine;
            const artwork = artworkIsOnline ? [
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
            if (activeBlobUrl) {
                URL.revokeObjectURL(activeBlobUrl);
                activeBlobUrl = null;
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
    playingSongId = null;
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
    if (preloadAbortController) {
        preloadAbortController.abort();
        preloadAbortController = null;
    }
    isPreloadComplete = false;
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
    }
    if (preloadedBlobUrl) {
        URL.revokeObjectURL(preloadedBlobUrl);
        preloadedBlobUrl = null;
    }
}

function updateVolume(volume) {
    if (isNaN(volume) || volume < 0 || volume > 1) return;


    audio.volume = volume;
    const volumePercent = volume * 100;

    // Lưu âm lượng vào bộ nhớ trình duyệt
    localStorage.setItem('music_player_volume', volume.toString());


    const volumeIcon = document.querySelector('.music-control__right i');
    if (volumeIcon) {
        volumeIcon.className = 'fa-solid';
        if (volume === 0) {
            volumeIcon.classList.add('fa-volume-mute');
        } else if (volume < 0.5) {
            volumeIcon.classList.add('fa-volume-low');
        } else {
            volumeIcon.classList.add('fa-volume-high');
        }
    }

    if (slider) {
        slider.value = volume;
        slider.style.setProperty('--volume-value', `${volumePercent}%`);
    }
    if (volumeSlider) {
        volumeSlider.value = volumePercent;
        volumeSlider.style.setProperty('--volume-value', `${volumePercent}%`);
    }
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
