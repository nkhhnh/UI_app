document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        if (window.showNotification) showNotification('Vui lòng đăng nhập để tiếp tục!', 'error');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }

    async function fetchAPI(endpoint, method = 'GET', body = null) {

        if (!navigator.onLine) {
            throw new Error('Cannot fetch data while offline.');
        }
        const token = localStorage.getItem('auth_token');
        
        
        if (!token) {
            throw new Error('No authentication token found. Please log in.');
        }
    
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
    
        // Định nghĩa API_BASE_URL từ state.js
        const API_BASE_URL = 'http://127.0.0.1:8000/api';
    
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 401) {
                    localStorage.removeItem('auth_token');
                    showNotification('Session expired. Please log in again.', 'error');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 1500);
                    throw new Error('Unauthorized access. Redirecting to login...');
                }
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            throw new Error(error.message);
        }
    }

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    if (tabButtons.length && tabContents.length) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.getAttribute('data-tab'))?.classList.add('active');
            });
        });
    }

    async function fetchUserInfo() {
        const elements = {
            userName: document.getElementById('user-name'),
            gmail: document.getElementById('gmail'),
            accountStatus: document.getElementById('account-status'),
            songCount: document.getElementById('song-count'),
            albumCount: document.getElementById('album-count')
        };

        if (!Object.values(elements).every(el => el)) {
            if (window.showNotification) showNotification('Lỗi giao diện!', 'error');
            return;
        }

        try {
            const user = await fetchAPI('/users');
            const songs = await fetchAPI('/songs');
            const albums = await fetchAPI('/albums');

            const username = user.user_name || 'N/A';
            const email = user.gmail || 'N/A';
            const accountStatus = user.account || user.account_status || 'N/A';
            const songCount = Array.isArray(songs) ? songs.length : 0;
            const albumCount = Array.isArray(albums) ? albums.length : 0;

            elements.userName.textContent = username;
            elements.gmail.textContent = email;
            elements.accountStatus.textContent = accountStatus;
            elements.songCount.textContent = `${songCount} bài`;
            elements.albumCount.textContent = `${albumCount} Album`;
        } catch (error) {
            if (window.showNotification) showNotification(`Không tải được thông tin: ${error.message}`, 'error');
            Object.values(elements).forEach(el => el.textContent = 'Error');
        }
    }

    const updateProfileForm = document.getElementById('update-profile-form');
    if (updateProfileForm) {
        let initialUsername = '';
        let initialEmail = '';
        let isSubmitting = false;

        async function loadProfileData() {
            try {
                const user = await fetchAPI('/users');
                initialUsername = user.user_name || '';
                initialEmail = user.gmail || '';
            } catch (error) {
                if (window.showNotification) showNotification(`Không tải được dữ liệu hồ sơ: ${error.message}`, 'error');
                initialUsername = '';
                initialEmail = '';
            }
        }

        loadProfileData();

        updateProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmitting) return;

            isSubmitting = true;
            const submitButton = updateProfileForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Đang xử lý...';
            }

            if (window.showNotification) showNotification('Đang xử lý...', 'info');

            const formData = new FormData(updateProfileForm);
            const usernameInput = formData.get('user_name')?.trim() || initialUsername;
            const emailInput = formData.get('gmail')?.trim() || initialEmail;

            if (emailInput !== initialEmail) {
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (!emailRegex.test(emailInput)) {
                    if (window.showNotification) showNotification('Email không hợp lệ!', 'error');
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Cập nhật';
                    }
                    isSubmitting = false;
                    return;
                }
            }

            const dataToUpdate = {};
            if (usernameInput !== initialUsername) dataToUpdate.user_name = usernameInput;
            if (emailInput !== initialEmail) dataToUpdate.gmail = emailInput;

            if (Object.keys(dataToUpdate).length === 0) {
                if (window.showNotification) showNotification('Không có thay đổi để cập nhật!', 'info');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Cập nhật';
                }
                isSubmitting = false;
                return;
            }

            try {
                await fetchAPI('/users', 'PUT', dataToUpdate);
                if (window.showNotification) showNotification('Cập nhật hồ sơ thành công!', 'success');
                initialUsername = usernameInput;
                initialEmail = emailInput;
                await fetchUserInfo();
                updateProfileForm.reset();
            } catch (error) {
                if (window.showNotification) showNotification(`Cập nhật thất bại`, 'error');
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Cập nhật';
                }
                isSubmitting = false;
            }
        });
    }

    const changePasswordForm = document.getElementById('change-password-form');
    if (changePasswordForm) {
        let isSubmitting = false;

        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmitting) return;

            isSubmitting = true;
            const submitButton = changePasswordForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Đang xử lý...';
            }

            if (window.showNotification) showNotification('Đang xử lý...', 'info');

            const formData = new FormData(changePasswordForm);
            const currentPassword = formData.get('current_password')?.trim();
            const newPassword = formData.get('new_password')?.trim();
            const newPasswordConfirmation = formData.get('new_password_confirmation')?.trim();

            if (!currentPassword || !newPassword || !newPasswordConfirmation) {
                if (window.showNotification) showNotification('Vui lòng nhập đầy đủ các trường!', 'error');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Đổi mật khẩu';
                }
                isSubmitting = false;
                return;
            }

            if (newPassword.length < 6) {
                if (window.showNotification) showNotification('Mật khẩu mới phải có ít nhất 6 ký tự!', 'error');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Đổi mật khẩu';
                }
                isSubmitting = false;
                return;
            }

            if (newPassword !== newPasswordConfirmation) {
                if (window.showNotification) showNotification('Mật khẩu mới và xác nhận không khớp!', 'error');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Đổi mật khẩu';
                }
                isSubmitting = false;
                return;
            }

            const dataToUpdate = {
                current_password: currentPassword,
                new_password: newPassword,
                new_password_confirmation: newPasswordConfirmation
            };

            try {
                await fetchAPI('/users', 'PUT', dataToUpdate);
                if (window.showNotification) showNotification('Đổi mật khẩu thành công!', 'success');
                changePasswordForm.reset();
            } catch (error) {
                if (window.showNotification) showNotification(`Đổi mật khẩu thất bại: ${error.message}`, 'error');
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Đổi mật khẩu';
                }
                isSubmitting = false;
            }
        });
    }

    fetchUserInfo();
});