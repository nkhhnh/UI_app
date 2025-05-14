document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const forgotPasswordBtn = document.querySelector('.forgot-password-btn');
    const forgotPasswordPopup = document.querySelector('.forgot-password-popup');
    const closeForgotPasswordBtn = document.querySelector('.close-forgot-password-btn');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const overlay = document.querySelector('.overlay');
    const newPasswordDisplay = document.querySelector('.new-password-display');
    const newPasswordSpan = document.querySelector('#new-password');

    if (!loginForm || !forgotPasswordBtn || !forgotPasswordPopup || !closeForgotPasswordBtn || !forgotPasswordForm || !overlay || !newPasswordDisplay || !newPasswordSpan) {
        if (window.showNotification) showNotification('Lỗi giao diện!', 'error');
        return;
    }

    const signUpButton = document.getElementById('sign-up-btn');
    const signInButton = document.getElementById('sign-in-btn');
    const container = document.querySelector('.container');
    if (signUpButton && signInButton && container) {
        signUpButton.onclick = () => container.classList.add('sign-up-mode');
        signInButton.onclick = () => container.classList.remove('sign-up-mode');
    }

    const loginInput = document.querySelector('[name="account_or_email"]');
    const passwordInput = document.querySelector('[name="password"]');
    if (loginInput && passwordInput) {
        loginInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loginForm.dispatchEvent(new Event('submit'));
            }
        });
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loginForm.dispatchEvent(new Event('submit'));
            }
        });
    }

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!loginInput || !passwordInput) {
            if (window.showNotification) showNotification('Lỗi giao diện!', 'error');
            return;
        }

        const loginValue = loginInput.value.trim();
        const passwordValue = passwordInput.value.trim();
        if (!loginValue || !passwordValue) {
            if (window.showNotification) showNotification('Vui lòng nhập tài khoản và mật khẩu!', 'error');
            return;
        }

        if (window.showNotification) showNotification('Đang xác thực...', 'info');
        // http://127.0.0.1:8000/api/
        // https://api-music-weather.onrender.com/api/
        try {
            const response = await fetch('http://127.0.0.1:8000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    login: loginValue,
                    password: passwordValue
                })
            });
            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('auth_token', data.token);
                showNotification('Đăng nhập thành công!', 'success');
                window.location.href = 'index.html';
            } else {
                 showNotification('Sai tài khoản hoặc mật khẩu!', 'error');
            }
        } catch (error) {
            showNotification('Không kết nối được server!', 'error');
        }
    };

    forgotPasswordBtn.onclick = (e) => {
        e.preventDefault();
        forgotPasswordPopup.classList.add('active');
        overlay.classList.add('active');
        newPasswordDisplay.style.display = 'none';
    };

    closeForgotPasswordBtn.onclick = (e) => {
        e.preventDefault();
        forgotPasswordPopup.classList.remove('active');
        overlay.classList.remove('active');
        newPasswordDisplay.style.display = 'none';
    };

    overlay.onclick = () => {
        forgotPasswordPopup.classList.remove('active');
        overlay.classList.remove('active');
        newPasswordDisplay.style.display = 'none';
    };

    forgotPasswordForm.onsubmit = async (e) => {
        e.preventDefault();
        const account = document.querySelector('#forgot-account')?.value.trim();
        const gmail = document.querySelector('#forgot-gmail')?.value.trim();
        if (!account || !gmail) {
            if (window.showNotification) showNotification('Vui lòng nhập đầy đủ thông tin!', 'error');
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:8000/api/users/forgotpassword', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ account, gmail })
            });
            const data = await response.json();

            if (response.ok) {
                newPasswordSpan.textContent = data.new_password;
                newPasswordDisplay.style.display = 'block';
                forgotPasswordForm.reset();
                if (window.showNotification) showNotification('Lấy mật khẩu mới thành công!', 'success');
            } else {
                if (window.showNotification) showNotification(data.message || 'Lỗi, thử lại sau!', 'error');
            }
        } catch (error) {
            if (window.showNotification) showNotification('Không kết nối được server!', 'error');
        }
    };
});