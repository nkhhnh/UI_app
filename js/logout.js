function checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        if (window.showNotification) {
            window.showNotification('Vui lòng đăng nhập để tiếp tục!', 'error');
        }
        window.location.href = '/login';
        return false;
    }
    return true;
}

function protectPage() {
    const isOffline = !navigator.onLine;
    const currentPage = (window.location.pathname.split('/').pop() || '/').replace('.html', '');

    if (isOffline) {
        if (currentPage === 'user' || currentPage === 'weather') {
            if (window.showNotification) {
                window.showNotification('Kết nối internet để tiếp tục', 'error');
            }
            window.location.href = '/';
            return false;
        }
    }

    if (currentPage === 'user') {
        if (!checkAuth()) {
            return false;
        }
    }

    window.onpageshow = function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            if (isOffline && (currentPage === 'user' || currentPage === 'weather')) {
                if (window.showNotification) {
                    window.showNotification('Kết nối internet để tiếp tục', 'error');
                }
                window.location.href = '/';
                return false;
            }
            if (currentPage === 'user' && !checkAuth()) {
                return false;
            }
        }
    };

    window.addEventListener('offline', () => {
        const updatedPage = (window.location.pathname.split('/').pop() || '/').replace('.html', '');
        if (updatedPage === 'user' || updatedPage === 'weather') {
            if (window.showNotification) {
                window.showNotification('Kết nối internet để tiếp tục', 'error');
            }
            window.location.href = '/';
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
            window.location.replace('/login');
            return;
        }

        localStorage.removeItem('auth_token');
        window.location.replace('/login');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    protectPage();
    setupLogout();
});