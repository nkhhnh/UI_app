document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const messageBox = document.getElementById('message');

    if (!registerForm) {
        if (window.showNotification) showNotification('Lỗi giao diện!', 'error');
        return;
    }

    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        if (messageBox) messageBox.innerHTML = '';

        const formData = {
            user_name: document.querySelector('[name="user_name_register"]').value,
            account: document.querySelector('[name="account_register"]').value,
            gmail: document.querySelector('[name="gmail_register"]').value,
            password: document.querySelector('[name="password_register"]').value,
            password_confirmation: document.querySelector('[name="password_confirmation_register"]').value
        };

        if (!formData.user_name || !formData.account || !formData.gmail || !formData.password || !formData.password_confirmation) {
            if (window.showNotification) showNotification('Vui lòng nhập đầy đủ thông tin!', 'error');
            return;
        }

        try {
            const response = await fetch('https://api-music-weather.onrender.com/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            const data = await response.json();

            if (response.ok) {
                registerForm.reset();
                if (window.showNotification) showNotification('Đăng ký thành công!', 'success');
                setTimeout(() => window.location.href = 'login.html', 1500);
            } else {
                if (window.showNotification) showNotification(data.message || 'Đăng ký thất bại!', 'error');
            }
        } catch (error) {
            if (window.showNotification) showNotification('Không kết nối được server!', 'error');
        }
    };
});