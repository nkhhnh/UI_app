// Fade-in khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    const pageContent = document.querySelector('.page-content');
    if (pageContent) {
        pageContent.classList.add('loaded');
    }
});

// Fade-out khi rời trang
document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
        // Bỏ qua nếu link có id="fallback-auth-link" hoặc không có href
        if (link.id === 'fallback-auth-link' || !link.href || link.href === '#' || link.href === window.location.href) return;

        e.preventDefault(); // Ngăn chuyển trang ngay lập tức
        const pageContent = document.querySelector('.page-content');
        if (pageContent) {
            pageContent.classList.add('fading'); // Thêm class để fade-out
            setTimeout(() => {
                window.location.href = link.href; // Chuyển trang sau khi fade-out hoàn tất
            }, 1000); // Thời gian fade-out (phải khớp với transition trong CSS)
        } else {
            window.location.href = link.href; // Chuyển trang nếu không có page-content
        }
    });
});