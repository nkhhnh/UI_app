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
let playingSongId = null;
let activeBlobUrl = null;

// ===== Trạng thái phục vụ phát nền / tự phục hồi khi tắt màn hình =====
let currentSourceUrl = null;      // URL đang phát (blob: hoặc stream)
let currentSourceIsStream = false; // true nếu đang stream qua mạng
let audioLoadToken = 0;            // chống event của lần load cũ ghi đè lần mới
let lastKnownTime = 0;             // vị trí phát gần nhất, dùng để resume
let resumeAttempts = 0;
let resumeTimer = null;
let watchdogTimer = null;
let watchdogLastTime = -1;
let watchdogStuckSince = 0;
let isResuming = false;
// Ý ĐỊNH của người dùng, tách khỏi isPlaying. isPlaying là trạng thái tức thời
// của thẻ <audio> và bị hạ xuống false mỗi lần chuyển bài; lớp tự phục hồi mà
// bám vào nó thì đúng lúc chuyển bài (khoảnh khắc mong manh nhất) lại tê liệt.
let wantsPlayback = false;
const MAX_RESUME_ATTEMPTS = 10;

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

function getNextOfflineSongIndex(currentIndex) {
    const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
    if (!songListSource || songListSource.length === 0) return -1;
    
    for (let i = currentIndex + 1; i < songListSource.length; i++) {
        if (songListSource[i] && songListSource[i].songData instanceof Blob) {
            return i;
        }
    }
    
    for (let i = 0; i < currentIndex; i++) {
        if (songListSource[i] && songListSource[i].songData instanceof Blob) {
            return i;
        }
    }
    
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
                localStorage.setItem('autoPlayEnabled', 'true');
                wantsPlayback = true;
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
            // Chỉ nhánh này mới là "người dùng chủ động dừng".
            wantsPlayback = false;
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

async function appendSong(index, autoPlay = false, retryCount = 0) {
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
    let autoplayBlocked = false;
    try {
        if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = null;
        }

        audioLoadToken++;
        clearResumeTimer();
        resumeAttempts = 0;
        lastKnownTime = 0;
        watchdogLastTime = -1;
        watchdogStuckSince = 0;
        // Không gán audio.src = '' rồi load(): thao tác này bắn ra sự kiện 'error'
        // giả (Empty src) làm handler lỗi reset trạng thái, đồng thời tạo khoảng
        // lặng dài khiến trình duyệt đóng media session khi màn hình đang tắt.
        audio.pause();
        isPlaying = false;
        if (autoPlay) {
            // Tự chuyển bài (nhất là khi màn hình đang tắt): TUYỆT ĐỐI không hạ
            // playbackState xuống 'paused'. Android thấy media session của một
            // tab nền chuyển sang paused là thu hồi quyền phát nền, đóng thông
            // báo và đóng băng trang -> hai lệnh await bên dưới không bao giờ
            // hoàn tất, bài mới không bao giờ được phát. Đó chính là lý do nhạc
            // dừng hẳn ở cuối bài hiện tại.
            wantsPlayback = true;
        } else {
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
            record.classList.remove('on');
            toneArm.classList.remove('play');
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        }

        if (progress) {
            progress.value = 0;
            progress.max = 100;
            progress.style.setProperty('--progress-value', '0%');
        }
        if (timeStart) timeStart.textContent = '0:00';
        if (timeDuration) timeDuration.textContent = '0:00';

        if (song && song.songData instanceof Blob) {
            const localBlobUrl = URL.createObjectURL(song.songData);
            audio.preload = 'auto';
            audio.src = localBlobUrl;
            activeBlobUrl = localBlobUrl;
            currentSourceUrl = localBlobUrl;
            currentSourceIsStream = false;
        } else if (!isOnline || !isLoggedIn) {
            throw new Error('Bài hát không khả dụng ngoại tuyến: Thiếu hoặc dữ liệu không hợp lệ');
        } else {
            if (!token) throw new Error('Vui lòng đăng nhập.');
            const streamUrl = `${API_BASE_URL}/songs/${song.song_id}/stream?token=${token}`;
            // preload='auto' để trình duyệt buffer sẵn nhiều nhất có thể,
            // giảm khả năng đứt tiếng khi màn hình tắt và mạng chập chờn.
            audio.preload = 'auto';
            audio.src = streamUrl;
            currentSourceUrl = streamUrl;
            currentSourceIsStream = true;
        }

        if (!audio.src)
            throw new Error('Không thể đặt nguồn âm thanh');

        songTitle.textContent = song.custom_name || 'Không xác định';
        songArtist.textContent = song.custom_artist || 'Không xác định';
        playingSongId = song.song_id;

        if ('mediaSession' in navigator) {
            // Ảnh đã nằm trong cache của Service Worker nên luôn set được,
            // kể cả offline. MediaSession có metadata đầy đủ giúp Android giữ
            // thông báo phát nhạc sống khi màn hình tắt.
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.custom_name || 'Không xác định',
                artist: song.custom_artist || 'Không xác định',
                album: 'Key In Cloud Music',
                artwork: [
                    { src: '/image/192x192.webp', sizes: '192x192', type: 'image/webp' },
                    { src: '/image/512x512.webp', sizes: '512x512', type: 'image/webp' }
                ]
            });
            navigator.mediaSession.playbackState = autoPlay ? 'playing' : 'paused';
        }

        // Chờ có timeout: server Render có thể "ngủ" và mất hàng chục giây để
        // thức dậy. Không có timeout thì lúc màn hình tắt promise treo vĩnh viễn,
        // isLoadingSong kẹt ở true và cơ chế tự phục hồi không chạy được nữa.
        const waitForAudioEvent = (eventName, timeoutMs, errorMessage) => {
            return new Promise((resolve, reject) => {
                const cleanup = () => {
                    clearTimeout(timeoutId);
                    audio.removeEventListener(eventName, onSuccess);
                    audio.removeEventListener('error', onError);
                };
                const onSuccess = () => { cleanup(); resolve(); };
                const onError = () => { cleanup(); reject(new Error(errorMessage)); };
                const timeoutId = setTimeout(() => { cleanup(); reject(new Error(errorMessage + ' (quá thời gian chờ)')); }, timeoutMs);
                audio.addEventListener(eventName, onSuccess);
                audio.addEventListener('error', onError);
            });
        };

        await waitForAudioEvent('loadedmetadata', 60000, 'Không thể tải metadata');
        if (progress) {
            progress.max = audio.duration || 100;
            progress.value = 0;
            progress.style.setProperty('--progress-value', '0%');
        }
        if (timeDuration) timeDuration.textContent = formatTime(audio.duration || 0);
        if (timeStart) timeStart.textContent = '0:00';
        updatePositionState();

        await waitForAudioEvent('canplay', 60000, 'Không thể tải âm thanh');

        // Không revoke blob theo sự kiện 'ended'/'error' nữa: một lỗi tạm thời
        // sẽ hủy luôn nguồn phát và cơ chế tự phục hồi không nạp lại được.
        // Blob cũ đã được thu hồi ở đầu appendSong và trong resetAudioState.

        if (autoPlay) {
            const autoplayConsent = document.getElementById('autoplay-consent');
            try {
                await togglePlayPause(true);
                localStorage.setItem('autoPlayEnabled', 'true');
            } catch (err) {
                if (err.name !== 'NotAllowedError') throw err;

                if (localStorage.getItem('autoPlayEnabled') !== 'true' && autoplayConsent) {
                    // Chưa từng phát lần nào -> thật sự cần một cú chạm.
                    autoplayConsent.style.display = 'block';
                } else {
                    // Đã từng phát rồi mà vẫn bị chặn thì gần như luôn là do
                    // trang đang chạy nền lúc màn hình tắt. Trước đây lỗi này bị
                    // nuốt im lặng: isPlaying nằm nguyên ở false nên toàn bộ lớp
                    // tự phục hồi (đều kiểm tra isPlaying) không chạy, nhạc dừng
                    // hẳn. Giữ ý định phát và thử lại sau khi thoát khối này.
                    wantsPlayback = true;
                    autoplayBlocked = true;
                }
            }
        }

        updateSongList();
        preparingNotification.remove();
    } catch (error) {
        preparingNotification.remove();

        // Đang stream mà lỗi thường chỉ là mạng chập chờn hoặc server Render vừa
        // thức dậy. Thử lại chính bài đó vài lần trước khi nhảy sang bài offline,
        // để lúc màn hình tắt nhạc không tự đổi bài.
        if (currentSourceIsStream && navigator.onLine && retryCount < 2) {
            if (document.visibilityState === 'visible') {
                showNotification('Kết nối chập chờn, đang thử lại...', 'info');
            }
            setTimeout(() => {
                appendSong(index, autoPlay, retryCount + 1).catch(() => { });
            }, 3000);
            return;
        }

        if (document.visibilityState === 'visible') {
            showNotification(`Lỗi phát nhạc: ${error.message}. Thử chuyển sang bài ngoại tuyến...`, 'info');
        }

        const nextOfflineIndex = getNextOfflineSongIndex(index);
        if (nextOfflineIndex !== -1 && nextOfflineIndex !== index) {
            setTimeout(() => {
                appendSong(nextOfflineIndex, autoPlay).catch(err => {
                    if (document.visibilityState === 'visible') {
                        showNotification(`Không thể phát bài ngoại tuyến tiếp theo: ${err.message}`, 'error');
                    }
                    resetAudioState();
                    updateSongList();
                });
            }, 1000);
        } else {
            resetAudioState();
            updateSongList();
        }
    } finally {
        preparingNotification.remove();
        isLoadingSong = false;
        // Phải hẹn ở đây: scheduleResume kiểm tra isLoadingSong nên gọi trong
        // khối try ở trên sẽ bị bỏ qua.
        if (autoplayBlocked) scheduleResume(false);
    }
}

function resetAudioState() {
    wantsPlayback = false;
    audioLoadToken++;
    clearResumeTimer();
    resumeAttempts = 0;
    currentSourceUrl = null;
    currentSourceIsStream = false;
    lastKnownTime = 0;
    watchdogLastTime = -1;
    watchdogStuckSince = 0;
    audio.removeAttribute('src');
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
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
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

// =====================================================================
// PHÁT NỀN KHI TẮT MÀN HÌNH (chế độ online)
// ---------------------------------------------------------------------
// Khi tắt màn hình, kết nối stream có thể bị ngắt (doze của Android,
// chuyển Wi-Fi <-> 4G, server Render ngủ...). Trình duyệt khi đó bắn
// 'error' / 'stalled' hoặc tự pause, và trước đây app reset hẳn trạng thái
// -> nhạc dừng luôn. Các hàm dưới đây tự nối lại nguồn phát và tua về đúng
// vị trí đang nghe, nên nhạc chạy tiếp mà không cần mở màn hình.
// =====================================================================

function clearResumeTimer() {
    if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
    }
}

function updatePositionState() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    try {
        navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(Math.max(audio.currentTime || 0, 0), audio.duration)
        });
    } catch (e) {
        // Một số trình duyệt ném lỗi nếu position vượt duration, bỏ qua.
    }
}

// hard = true: cho phép nạp lại nguồn và tua về vị trí cũ. Chỉ dùng cho lỗi
// thật (audio.error, kẹt kéo dài, vừa có mạng lại). Mặc định là "mềm": chỉ gọi
// play() nếu trình duyệt đã tự dừng, còn đang buffer thì để nó tự hồi phục.
function scheduleResume(hard = false) {
    if (!wantsPlayback || isLoadingSong || !currentSourceUrl) return;
    if (resumeTimer || isResuming) return;
    if (resumeAttempts >= MAX_RESUME_ATTEMPTS) return;

    const delay = Math.min(1000 * Math.pow(2, resumeAttempts), 15000);
    resumeAttempts++;
    resumeTimer = setTimeout(() => {
        resumeTimer = null;
        tryResumePlayback(hard);
    }, delay);
}

async function tryResumePlayback(hard = false) {
    if (!audio || !wantsPlayback || isLoadingSong || !currentSourceUrl || isResuming) return;

    // Mất mạng mà nguồn là stream thì chờ, sự kiện 'online' sẽ gọi lại ngay.
    if (currentSourceIsStream && !navigator.onLine) {
        scheduleResume(hard);
        return;
    }

    // Hẹn lượt thử kế tiếp trong finally, sau khi đã hạ cờ isResuming. Trước
    // đây scheduleResume() được gọi trong khối catch, lúc isResuming vẫn là
    // true, nên nó luôn thoát sớm và chuỗi thử lại chết ngay từ lần đầu.
    let retryAfter = false;
    let retryHard = hard;

    isResuming = true;
    try {
        // Bước 1: buffer còn dùng được -> chỉ cần play() lại.
        if (!audio.error && audio.readyState >= 2) {
            try {
                await audio.play();
                resumeAttempts = 0;
                watchdogStuckSince = 0;
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                return;
            } catch (e) {
                // rơi xuống bước 2
            }
        }

        // readyState < 2 mà audio.error rỗng thì đây chỉ là buffer bình thường,
        // trình duyệt sẽ tự nạp tiếp. Nạp lại nguồn ở đây sẽ tua ngược về
        // lastKnownTime và phát lặp lại đoạn vừa nghe — đúng tiếng rè/ngắt
        // quãng. Chỉ hẹn kiểm tra lại, không đụng vào audio.
        if (!hard && !audio.error) {
            retryAfter = true;
            return;
        }

        // Bước 2: nạp lại nguồn và tua về vị trí đang nghe.
        const resumeAt = lastKnownTime;
        const token = ++audioLoadToken;

        // Nguồn offline là blob: URL, có thể đã bị thu hồi -> tạo lại từ Blob gốc.
        if (!currentSourceIsStream) {
            const songListSource = currentAlbumId ? currentAlbumPlaylist : songs;
            const song = songListSource && songListSource[currentSongIndex];
            if (!song || !(song.songData instanceof Blob)) return;
            if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
            activeBlobUrl = URL.createObjectURL(song.songData);
            currentSourceUrl = activeBlobUrl;
        }

        audio.preload = 'auto';
        audio.src = currentSourceUrl;
        audio.load();

        await new Promise((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timeoutId);
                audio.removeEventListener('loadedmetadata', onReady);
                audio.removeEventListener('error', onErr);
            };
            const onReady = () => { cleanup(); resolve(); };
            const onErr = () => { cleanup(); reject(new Error('Không nạp được nguồn phát')); };
            const timeoutId = setTimeout(() => { cleanup(); reject(new Error('Hết thời gian chờ nguồn phát')); }, 20000);
            audio.addEventListener('loadedmetadata', onReady);
            audio.addEventListener('error', onErr);
        });

        // Đã có lần load mới hơn (người dùng đổi bài) -> bỏ qua lần này.
        if (token !== audioLoadToken) return;

        if (resumeAt > 0 && isFinite(audio.duration) && resumeAt < audio.duration - 0.5) {
            try { audio.currentTime = resumeAt; } catch (e) { /* chưa seek được */ }
        }

        await audio.play();
        resumeAttempts = 0;
        watchdogStuckSince = 0;
        watchdogLastTime = -1;
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        updatePositionState();
    } catch (error) {
        retryAfter = true;
        retryHard = true;
    } finally {
        isResuming = false;
        if (retryAfter) scheduleResume(retryHard);
    }
}

// Nhịp kiểm tra dự phòng: bắt cả những ca trình duyệt không bắn sự kiện nào.
function startPlaybackWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
        if (!audio || !wantsPlayback || isLoadingSong || !currentSourceUrl || isResuming) {
            watchdogLastTime = -1;
            watchdogStuckSince = 0;
            return;
        }

        // Ca 1: hệ thống tự pause (mất audio focus, mạng chết).
        if (audio.paused) {
            audio.play().catch(() => {
                // Đã thử hết số lần thì hạ bộ đếm xuống để vẫn còn cơ hội nạp lại
                // nguồn: người dùng chưa bấm dừng thì ta không được bỏ cuộc hẳn.
                if (resumeAttempts >= MAX_RESUME_ATTEMPTS) resumeAttempts = MAX_RESUME_ATTEMPTS - 1;
                scheduleResume();
            });
            return;
        }

        // Ca 2: vẫn "đang phát" nhưng thời gian không nhích -> stall thật sự.
        const t = audio.currentTime;
        if (watchdogLastTime >= 0 && Math.abs(t - watchdogLastTime) < 0.15) {
            if (!watchdogStuckSince) watchdogStuckSince = Date.now();
            if (Date.now() - watchdogStuckSince > 12000) {
                watchdogStuckSince = 0;
                tryResumePlayback(true);
            }
        } else {
            watchdogStuckSince = 0;
            resumeAttempts = 0;
        }
        watchdogLastTime = t;
    }, 4000);
}

function initPlaybackResilience() {
    if (!audio || audio.dataset.resilienceReady === '1') return;
    audio.dataset.resilienceReady = '1';

    audio.addEventListener('timeupdate', () => {
        if (audio.readyState >= 1 && !isNaN(audio.currentTime)) {
            lastKnownTime = audio.currentTime;
        }
    });

    audio.addEventListener('playing', () => {
        resumeAttempts = 0;
        watchdogStuckSince = 0;
        clearResumeTimer();
        // Nhạc có thể được cho chạy lại bởi watchdog hoặc bởi lượt tự chuyển
        // bài — cả hai đều không đi qua togglePlayPause, nên isPlaying và icon
        // sẽ lệch với thực tế nếu không đồng bộ ở đây.
        if (!isPlaying) {
            isPlaying = true;
            wantsPlayback = true;
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
            if (record) record.classList.add('on');
            if (toneArm) toneArm.classList.add('play');
            updateSongList();
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        updatePositionState();
    });

    audio.addEventListener('durationchange', updatePositionState);
    audio.addEventListener('seeked', updatePositionState);
    audio.addEventListener('ratechange', updatePositionState);

    // Trình duyệt tự pause dù người dùng không bấm -> gọi play() lại (mức mềm).
    audio.addEventListener('pause', () => {
        if (wantsPlayback && !audio.ended && !isLoadingSong && !isResuming) scheduleResume(false);
    });

    // 'suspend' và 'waiting' là sự kiện BÌNH THƯỜNG của quá trình buffer:
    // 'suspend' bắn ngay khi trình duyệt nạp đủ và ngưng tải, 'waiting' bắn mỗi
    // lần buffer cạn rồi trình duyệt tự nạp tiếp. Trước đây cả hai đều kích hoạt
    // nạp lại nguồn + tua về lastKnownTime, làm bài hát lặp lại một đoạn ngắn
    // vài giây một lần -> nghe thành tiếng rè. Nay chỉ theo dõi 'stalled' (mạng
    // thật sự không nhả dữ liệu) và cũng chỉ thử ở mức mềm; trường hợp kẹt thật
    // đã có watchdog lo.
    audio.addEventListener('stalled', () => {
        if (wantsPlayback && !isLoadingSong && !isResuming) scheduleResume(false);
    });

    // Có mạng trở lại thì thử ngay, không chờ hết backoff.
    window.addEventListener('online', () => {
        if (wantsPlayback && currentSourceIsStream) {
            resumeAttempts = 0;
            clearResumeTimer();
            tryResumePlayback(true);
        }
    });

    startPlaybackWatchdog();
}
