document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
       
                if (registration.active) {
                    
                } else if (registration.installing) {
                    registration.installing.addEventListener('statechange', () => {
                        if (registration.active) {
                        }
                    });
                } else if (registration.waiting) {
                }
            })
            .catch(error => {
                // Hiển thị thông báo cho người dùng nếu cần
                document.dispatchEvent(new CustomEvent('showNotification', {
                    detail: { message: 'Không thể đăng ký Service Worker: ' + error.message, type: 'error' }
                }));
            });

        // Xử lý lỗi không tìm thấy controller
        navigator.serviceWorker.addEventListener('controllerchange', () => {
        });
    } 
    
});