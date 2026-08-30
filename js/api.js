const API_BASE_URL = 'https://apimusicweather.onrender.com/api';

async function fetchAPI(endpoint, method = 'GET', body = null) {
    if (!navigator.onLine) throw new Error('Không thể lấy dữ liệu khi ngoại tuyến.');
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Vui lòng đăng nhập.');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
    };
    const config = { method, headers };
    if (body && method !== 'GET') {
        if (body instanceof FormData) {
            config.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            config.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                localStorage.removeItem('auth_token');
                showNotification('Phiên hết hạn. Vui lòng đăng nhập lại.', 'error');
                setTimeout(() => window.location.href = '/login', 1500);
                throw new Error('Đang chuyển hướng đến trang đăng nhập...');
            }
            throw new Error(errorData.message || `Lỗi máy chủ: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        throw new Error(error.message);
    }
}
