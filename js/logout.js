function checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        if (window.showNotification) {
            window.showNotification('Vui lòng đăng nhập để tiếp tục!', 'error');
        }
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function protectPage() {
    const isOffline = !navigator.onLine;
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');

    // Kiểm tra trạng thái offline khi tải trang
    if (isOffline) {
        if (currentPage === 'user' || currentPage === 'weather') {
            if (window.showNotification) {
                window.showNotification('Kết nối internet để tiếp tục', 'error');
            }
            window.location.href = 'index.html';
            return false;
        }
    }

    // Kiểm tra đăng nhập cho user.html
    if (currentPage === 'user') {
        if (!checkAuth()) {
            return false;
        }
    }

    // Xử lý khi trang được load lại từ bộ nhớ cache hoặc điều hướng back/forward
    window.onpageshow = function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            if (isOffline && (currentPage === 'user' || currentPage === 'weather')) {
                if (window.showNotification) {
                    window.showNotification('Kết nối internet để tiếp tục', 'error');
                }
                window.location.href = 'index.html';
                return false;
            }
            if (currentPage === 'user' && !checkAuth()) {
                return false;
            }
        }
    };

    // Lắng nghe sự kiện thay đổi trạng thái mạng
    window.addEventListener('offline', () => {
        const updatedPage = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');
        if (updatedPage === 'user' || updatedPage === 'weather') {
            if (window.showNotification) {
                window.showNotification('Kết nối internet để tiếp tục', 'error');
            }
            window.location.href = 'index.html';
        }
    });

    window.addEventListener('online', () => {
        if (window.showNotification) {
           
        }
    });

    return true;
}

function setupLogout() {
    const logoutLink = document.getElementById('logout-link');
    if (!logoutLink) {
        return;
    }

    logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('auth_token');
        const isOffline = !navigator.onLine;

        if (isOffline) {
            if (window.showNotification) {
                window.showNotification('Không thể đăng xuất khi Offline', 'error');
            }
            return;
        }

        if (!token) {
            window.location.replace('login.html');
            return;
        }

        localStorage.removeItem('auth_token');
        window.location.replace('login.html');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    protectPage();
    setupLogout();
});