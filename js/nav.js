const notificationQueue = [];
let isShowingNotification = false;

function showNotification(message, type = 'success') {
    const isDuplicate = notificationQueue.some(
        (notification) => notification.message === message && notification.type === type
    );

    if (!isDuplicate) {
        const notificationObj = {
            message,
            type,
            element: null,
            remove: function () {
                if (this.element) {
                    this.element.remove();
                    this.element = null;
                    const index = notificationQueue.findIndex(n => n === this);
                    if (index !== -1) {
                        notificationQueue.splice(index, 1);
                    }
                    if (notificationQueue.length > 0) {
                        showNextNotification(); 
                    } else {
                        isShowingNotification = false; 
                    }
                }
            }
        };

        notificationQueue.push(notificationObj);
        if (!isShowingNotification) {
            showNextNotification(); 
        }
        return notificationObj;
    } else {
        return null;
    }
}

function showNextNotification() {
    if (notificationQueue.length === 0) {
        isShowingNotification = false;
        return;
    }

    isShowingNotification = true;
    const notificationObj = notificationQueue.shift(); 
    const { message, type } = notificationObj;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.padding = '10px 20px';
    notification.style.backgroundColor =
        type === 'success' ? '#28a745' :
        type === 'error' ? '#dc3545' :
        type === 'info' ? '#17a2b8' : '#28a745'; 
    notification.style.color = '#fff';
    notification.style.borderRadius = '5px';
    notification.style.zIndex = '1000';
    document.body.appendChild(notification);

    notificationObj.element = notification; 
    setTimeout(() => {
        notificationObj.remove();
    }, 2500);
}
function showCustomConfirm(message, callback) {
    const confirmBox = document.createElement('div');
    confirmBox.className = 'custom-confirm-box';

    const text = document.createElement('p');
    text.textContent = message;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Okay';
    confirmBtn.className = 'confirm-btn';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'cancel-btn';

    confirmBox.appendChild(text);
    confirmBox.appendChild(confirmBtn);
    confirmBox.appendChild(cancelBtn);

    const overlay = document.createElement('div');
    overlay.className = 'custom-overlay';

    document.body.appendChild(overlay);
    document.body.appendChild(confirmBox);

    confirmBtn.onclick = () => { callback(true); confirmBox.remove(); overlay.remove(); };
    cancelBtn.onclick = () => { callback(false); confirmBox.remove(); overlay.remove(); };
    overlay.onclick = () => { callback(false); confirmBox.remove(); overlay.remove(); };
}

function renderSidebar() {
    const placeholder = document.getElementById('sidebar-placeholder');
    if (!placeholder) {
        return;
    }

    const token = localStorage.getItem('auth_token');
    // URL sach: / , /music , /weather ... Bo dau / o cuoi roi lay doan cuoi;
    // duong dan rong (trang chu) quy ve 'home'. Truoc day ham nay tach tu ten
    // file .html nen sau khi doi sang URL sach thi tra ve '/' va 'music',
    // khong khop voi data-page 'index' / 'musicplayer' — Home va Music vi the
    // khong bao gio sang len trong menu.
    const path = window.location.pathname.replace(/\/+$/, '');
    const currentPage = path === '' ? 'home' : path.split('/').pop();
    const isOffline = !navigator.onLine;

    const pageTitles = {
        'home': 'Home',
        'user': 'Profile',
        'weather': 'Weather',
        'music': 'Music',
        'contact': 'Contact',
    };
    const displayTitle = pageTitles[currentPage] || 'MUSIC';

    const sidebarHTML = `
        <section class="sidebar ${isOffline ? 'offline' : ''}">
            <div class="nav-header">
                <p class="logo">${displayTitle.toUpperCase()}</p>
                <i class="bx bx-menu-alt-right btn-menu"></i>
            </div>
            <ul class="nav-links">
                <li><a href="/" data-page="home"><i class="bx bx-home-alt-2"></i> <span class="title">Home</span></a></li>
                <li><a href="${!token || isOffline ? '#' : '/user'}" data-page="user" class="${!token || isOffline ? 'disabled' : ''}"><i class='bx bx-user'></i> <span class="title">User</span></a></li>
                <li><a href="${isOffline ? '#' : '/weather'}" data-page="weather" class="${isOffline ? 'disabled' : ''}"><i class='bx bx-cloud'></i> <span class="title">Weather</span></a></li>
                <li><a href="/music" data-page="music"><i class='bx bxs-music'></i> <span class="title">Music</span></a></li>
                <li><a href="/contact" data-page="contact"><i class="fa-solid fa-id-badge"></i> <span class="title">Contact</span></a></li>
                <li>
                    <a href="#" id="${token ? 'logout-link' : 'auth-link'}" data-page="${token ? 'logout' : 'login'}" class="${isOffline ? 'disabled' : ''}">
                        <i class='bx bx-log-${token ? 'out' : 'in'}'></i> <span class="title">${token ? 'Logout' : 'Login'}</span>
                    </a>
                </li>
            </ul>
        </section>
    `;

    placeholder.innerHTML = sidebarHTML;

    const btnMenu = document.querySelector('.btn-menu');
    const sidebar = document.querySelector('.sidebar');
    if (btnMenu && sidebar) {
        btnMenu.onclick = () => {
            sidebar.classList.toggle('expand');
            btnMenu.classList.toggle('bx-menu');
            btnMenu.classList.toggle('bx-menu-alt-right');
        };
        document.onclick = (e) => {
            if (sidebar.classList.contains('expand') && !sidebar.contains(e.target) && !btnMenu.contains(e.target)) {
                sidebar.classList.remove('expand');
                btnMenu.classList.remove('bx-menu');
                btnMenu.classList.add('bx-menu-alt-right');
            }
        };
    }

    const links = document.querySelectorAll('.nav-links a[data-page]');
    links.forEach(link => {
        if (link.getAttribute('data-page') === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function setupLinkEvents() {
    const links = document.querySelectorAll('.nav-links a[data-page]');
    if (links.length === 0) {
        return;
    }

    links.forEach(link => {
        const page = link.getAttribute('data-page');

        link.onclick = null;

        link.addEventListener('click', (e) => {
            const isOffline = !navigator.onLine;
            const token = localStorage.getItem('auth_token');
            if (link.classList.contains('disabled')) {
                e.preventDefault();
                if (page === 'user') {
                    showNotification(!token ? 'Đăng nhập để sử dụng' : 'Không thể truy cập User khi offline', 'error');
                } else if (page === 'weather') {
                    showNotification('Không thể xem thời tiết khi offline', 'error');
                } else if (page === 'logout' || page === 'login') {
                    showNotification('Không thể đăng nhập/đăng xuất khi offline', 'error');
                }
                return;
            }
            if (page === 'user') {
                if (!token) {
                    e.preventDefault();
                    showNotification('Đăng nhập để sử dụng', 'error');
                    return;
                }
            } else if (page === 'weather') {
                if (isOffline) {
                    e.preventDefault();
                    showNotification('Không thể xem thời tiết khi offline', 'error');
                    return;
                }
            }

            if (link.id === 'auth-link') {
                e.preventDefault();
                window.location.href = '/login';
            } else if (link.id === 'logout-link') {
                e.preventDefault();
                localStorage.removeItem('auth_token');
                renderSidebar();
                setupLinkEvents();
                showNotification('Đã đăng xuất', 'success');
                window.location.href = '/login';
            }
        });
    });
}


setInterval(() => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        const isOffline = !navigator.onLine;
        const currentOfflineState = sidebar.classList.contains('offline');
        if (isOffline !== currentOfflineState) {
            showNotification(isOffline ? 'Bạn đang offline!' : 'Đã có kết nối mạng trở lại!', isOffline ? 'error' : 'success');
            renderSidebar();
            setupLinkEvents();
        }
    }
}, 1000); 

document.addEventListener('DOMContentLoaded', () => {
    renderSidebar();
    setupLinkEvents();
});

window.addEventListener('pageChange', () => {
    renderSidebar();
    setupLinkEvents();
});