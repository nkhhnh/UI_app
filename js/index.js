document.addEventListener('DOMContentLoaded', () => {
    const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
    

    if (!sidebarPlaceholder || !musicContainer || !weatherContainer || !contactContainer) {
       
        return;
    }

    const isOffline = !navigator.onLine;

   

    // Vô hiệu hóa liên kết "Weather" và "User" khi offline
    links.forEach(({ container, href }) => {
        const link = container.querySelector('a');
        if (link && isOffline && (href === 'weather.html' || href === 'user.html')) {
            link.classList.add('disabled');
        }
    });

 
    links.forEach(({ container, href, message }) => {
        const link = container.querySelector('a');
        if (link) {
            link.addEventListener('click', (e) => {
                e.preventDefault();

                if (isOffline && (href === 'weather.html' || href === 'user.html')) {
                    if (window.showNotification) showNotification('Không hoạt động trong khi Offline', 'error');
                    return;
                }

                if (href === 'user.html') {
                    if (typeof checkAuth === 'function' && !checkAuth()) {
                        return;
                    }
                }

                if (window.showNotification) 
                document.body.style.transition = 'opacity 0.3s';
                document.body.style.opacity = '0';
                setTimeout(() => window.location.href = href, 300);
            });
        }
    });

    // Lắng nghe sự kiện thay đổi trạng thái mạng
    window.addEventListener('online', () => {
        links.forEach(({ container, href }) => {
            const link = container.querySelector('a');
            if (link && (href === 'weather.html' || href === 'user.html')) {
                link.classList.remove('disabled');
            }
        });
    });

    window.addEventListener('offline', () => {
        links.forEach(({ container, href }) => {
            const link = container.querySelector('a');
            if (link && (href === 'weather.html' || href === 'user.html')) {
                link.classList.add('disabled');
                if (window.showNotification) ;
            }
        });
    });
});