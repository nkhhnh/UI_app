// ═══════════════════════════════════════════════════════════════════════
// HẸN GIỜ TẮT NHẠC
//
// Cố ý viết tách hẳn khỏi music-player.js và music-ui.js: file này chỉ đọc
// biến `audio` và gọi togglePlayPause() có sẵn, không sửa gì bên trong luồng
// phát nhạc.
//
// Một điểm đáng chú ý ở chế độ "Hết bài này": không dùng sự kiện 'ended', vì
// music-ui.js cũng nghe sự kiện đó và sẽ gọi appendSong() sang bài kế tiếp —
// hai listener không huỷ được nhau. Thay vào đó dừng ở 0.4 giây trước khi hết
// bài, nên 'ended' không bao giờ bắn và không có ai chuyển bài. Chênh lệch
// 0.4 giây là phần đuôi im lặng của file, tai không nghe ra.
// ═══════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    const FADE_MS = 5000;      // thời gian giảm dần âm lượng trước khi dừng
    const FADE_STEPS = 50;
    const END_MARGIN = 0.4;    // giây, cho chế độ "Hết bài này"

    let countdownEndsAt = null;  // mốc thời gian sẽ tắt (ms)
    let stopAfterCurrent = false;
    let tickId = null;
    let fadeId = null;

    // `audio` khai báo bằng `let` ở đầu music-ui.js. Binding cấp script kiểu đó
    // KHÔNG trở thành thuộc tính của đối tượng window, nên truy cập qua window
    // sẽ luôn undefined. Phải tham chiếu thẳng tên; typeof để phòng script chưa chạy.
    function getAudio() {
        return (typeof audio !== 'undefined' && audio) ? audio : null;
    }

    let btn = null;
    let badge = null;
    let menu = null;

    function isActive() {
        return countdownEndsAt !== null || stopAfterCurrent;
    }

    function render() {
        if (!btn || !badge) return;

        btn.classList.toggle('active', isActive());

        if (stopAfterCurrent) {
            badge.textContent = '♪';
            return;
        }
        if (countdownEndsAt === null) {
            badge.textContent = '';
            return;
        }

        const left = Math.max(0, countdownEndsAt - Date.now());
        const mins = Math.ceil(left / 60000);
        badge.textContent = mins >= 60
            ? Math.floor(mins / 60) + 'h'
            : String(mins);
    }

    function cancel(quiet) {
        countdownEndsAt = null;
        stopAfterCurrent = false;

        if (tickId) { clearInterval(tickId); tickId = null; }
        if (fadeId) { clearInterval(fadeId); fadeId = null; }

        render();
        if (!quiet && typeof showNotification === 'function') {
            showNotification('Đã huỷ hẹn giờ tắt', 'info');
        }
    }

    // Giảm dần âm lượng rồi dừng, sau đó TRẢ LẠI mức cũ — nếu không, lần bấm
    // play kế tiếp sẽ im tiếng mà không hiểu vì sao.
    function fadeOutAndStop() {
        if (fadeId) return;

        const el = getAudio();
        if (!el) { cancel(true); return; }

        const startVolume = el.volume;
        let step = 0;

        fadeId = setInterval(() => {
            step += 1;
            const ratio = 1 - step / FADE_STEPS;
            el.volume = Math.max(0, startVolume * ratio);

            if (step >= FADE_STEPS) {
                clearInterval(fadeId);
                fadeId = null;
                stopNow(startVolume);
            }
        }, FADE_MS / FADE_STEPS);
    }

    function stopNow(restoreVolume) {
        const el = getAudio();
        const done = () => {
            if (el && typeof restoreVolume === 'number') el.volume = restoreVolume;
            cancel(true);
            if (typeof showNotification === 'function') {
                showNotification('Đã tắt nhạc theo hẹn giờ', 'info');
            }
        };

        if (typeof togglePlayPause === 'function') {
            togglePlayPause(false).then(done).catch(done);
        } else if (el) {
            el.pause();
            done();
        } else {
            done();
        }
    }

    function startCountdown(minutes) {
        cancel(true);
        countdownEndsAt = Date.now() + minutes * 60000;

        tickId = setInterval(() => {
            if (countdownEndsAt === null) return;
            if (Date.now() >= countdownEndsAt - FADE_MS) {
                clearInterval(tickId);
                tickId = null;
                fadeOutAndStop();
                return;
            }
            render();
        }, 1000);

        render();
        if (typeof showNotification === 'function') {
            const label = minutes >= 60 ? (minutes / 60) + ' tiếng' : minutes + ' phút';
            showNotification('Sẽ tắt nhạc sau ' + label, 'info');
        }
    }

    function startAfterCurrent() {
        cancel(true);
        stopAfterCurrent = true;
        render();
        if (typeof showNotification === 'function') {
            showNotification('Sẽ tắt nhạc khi hết bài này', 'info');
        }
    }

    function openMenu(open) {
        if (!menu) return;
        menu.classList.toggle('open', open);
        const cancelRow = menu.querySelector('.sleep-timer-cancel');
        if (cancelRow) cancelRow.style.display = isActive() ? 'block' : 'none';
    }

    document.addEventListener('DOMContentLoaded', () => {
        btn = document.querySelector('.sleep-timer-btn');
        badge = document.querySelector('.sleep-timer-badge');
        menu = document.querySelector('.sleep-timer-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenu(!menu.classList.contains('open'));
        });

        menu.querySelectorAll('.sleep-timer-option').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = item.dataset.minutes;
                if (value === 'end') startAfterCurrent();
                else startCountdown(Number(value));
                openMenu(false);
            });
        });

        const cancelRow = menu.querySelector('.sleep-timer-cancel');
        if (cancelRow) {
            cancelRow.addEventListener('click', (e) => {
                e.stopPropagation();
                cancel(false);
                openMenu(false);
            });
        }

        document.addEventListener('click', (e) => {
            if (menu.classList.contains('open') && !menu.contains(e.target) && e.target !== btn) {
                openMenu(false);
            }
        });

        // Chế độ "Hết bài này": dừng ngay trước vạch kết thúc để 'ended' không
        // bắn, nhờ đó music-ui.js không chuyển sang bài kế tiếp.
        const watchEnd = () => {
            if (!stopAfterCurrent || fadeId) return;

            const el = getAudio();
            if (!el || !isFinite(el.duration) || el.duration <= 0 || el.paused) return;

            if (el.duration - el.currentTime <= END_MARGIN) {
                stopNow();
            }
        };

        // Gắn lên thẻ audio khi music-ui.js đã gán xong biến toàn cục.
        let tries = 0;
        const attach = setInterval(() => {
            const el = getAudio();
            if (el) {
                clearInterval(attach);
                el.addEventListener('timeupdate', watchEnd);
                return;
            }
            // Bỏ cuộc sau ~10 giây thay vì quay vòng mãi.
            if (++tries > 50) clearInterval(attach);
        }, 200);

        render();
    });
})();
