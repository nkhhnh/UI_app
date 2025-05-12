const ApiKey1 = '3b7a918c281e3fee1b71c4ad007643cb';
const ApiKey2 = 'bc64fca94b3c37b1de8a45bcf472a155';

let apiCallCounter = 0;

document.addEventListener('DOMContentLoaded', function () {
    checkNetworkStatus();

    const search = document.querySelector('.search');
    const city = document.querySelector('.city');
    const country = document.querySelector('.country');
    const value = document.querySelector('.value');
    const shortdesc = document.querySelector('.short-desc');
    const time = document.querySelector('.time');
    const content = document.querySelector('.content');
    const iconweather = document.querySelector('.icon-weather');
    const body = document.querySelector('body');
    const moreDesc = document.querySelector('.more-desc');

    if (!search || !city || !country || !value || !shortdesc || !time || !content || !iconweather || !body || !moreDesc) {
        if (window.showNotification) showNotification('Lỗi giao diện thời tiết!', 'error');
        return;
    }

    if (typeof checkAuth === 'function' && !checkAuth()) {
        return;
    }

    function updateTime() {
        let date = new Date();
        const optionsDate = { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' };
        const optionsTime = { hour: 'numeric', minute: 'numeric', second: 'numeric' };
        const formattedDate = date.toLocaleDateString('vi-VN', optionsDate).replace(/\//g, ' ');
        const formattedTime = date.toLocaleTimeString('vi-VN', optionsTime);
        time.innerText = `${formattedDate} | ${formattedTime}`;
    }

    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    function getDateMonth(date) {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        return `${day}/${month}`;
    }

    function updateCurrentWeather(data, pop) {
        content.classList.remove('hide');
        city.innerText = data.name;
        country.innerText = data.sys.country;
        let celsiusTemp = Math.round(data.main.temp);
        value.innerHTML = celsiusTemp + "<sup>o</sup>C";

        const description = data.weather[0] ? capitalizeFirstLetter(data.weather[0].description) : '';
        shortdesc.innerText = description;

        iconweather.setAttribute('src', `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`);

        let weatherDescription = data.weather[0].description.toLowerCase();
        if (weatherDescription.includes('mưa')) {
            body.setAttribute('class', 'rainy');
        } else if (weatherDescription.includes('trời quang') || weatherDescription.includes('nắng')) {
            body.setAttribute('class', 'sunny');
        } else if (weatherDescription.includes('mây')) {
            body.setAttribute('class', 'cloudy');
        } else if (weatherDescription.includes('sương') || weatherDescription.includes('khói')) {
            body.setAttribute('class', 'foggy');
        } else if (weatherDescription.includes('giông') || weatherDescription.includes('bão')) {
            body.setAttribute('class', 'stormy');   
        } else if (weatherDescription.includes('tuyết') || weatherDescription.includes('mưa tuyết')) {
            body.setAttribute('class', 'snowy');
        }else {
            body.setAttribute('class', 'default');
        }

        updateTime();
        clearInterval(window.timeInterval);
        window.timeInterval = setInterval(updateTime, 1000);
    }

    function updateForecast(data) {
        if (data.cod !== "200") {
            for (let i = 1; i <= 5; i++) {
                const forecastDay = document.querySelector(`.forecast-day[data-day="${i}"]`);
                if (forecastDay) {
                    forecastDay.querySelector('.desc').innerText = 'Lỗi';
                    forecastDay.querySelector('img').src = '';
                    forecastDay.querySelector('.pop').innerText = '-';
                }
            }
            return;
        }
    
        const dailyForecasts = [];
        const today = new Date().setHours(0, 0, 0, 0) / 1000;
        let currentDay = null;
        let dailyData = null;
    
        // Nhóm dữ liệu theo ngày
        data.list.forEach(item => {
            const itemDate = new Date(item.dt * 1000);
            const itemDay = itemDate.setHours(0, 0, 0, 0) / 1000;
    
            if (itemDay <= today) return; // Bỏ qua ngày hiện tại
    
            if (itemDay !== currentDay) {
                if (dailyData) dailyForecasts.push(dailyData);
                currentDay = itemDay;
                dailyData = {
                    date: new Date(item.dt * 1000),
                    pop: item.pop,
                    icon: item.weather[0].icon,
                    description: item.weather[0].description
                };
            } else {
                dailyData.pop = Math.max(dailyData.pop, item.pop);
                if (itemDate.getHours() === 12) {
                    dailyData.icon = item.weather[0].icon;
                    dailyData.description = item.weather[0].description;
                }
            }
        });
        if (dailyData) dailyForecasts.push(dailyData);
    
    
        const fiveDayForecast = dailyForecasts.slice(0, 5);
        fiveDayForecast.forEach((day, index) => {
            const forecastDay = document.querySelector(`.forecast-day[data-day="${index + 1}"]`);
            if (forecastDay) {
                const pop = Math.round(day.pop * 100);
                const icon = `https://openweathermap.org/img/wn/${day.icon}@2x.png`;
                const dateMonth = getDateMonth(day.date);
    
                forecastDay.querySelector('.desc').innerText = dateMonth;
                const img = forecastDay.querySelector('img');
                img.src = icon;
                img.alt = day.description;
                forecastDay.querySelector('.pop').innerText = `${pop}% mưa`;
                forecastDay.style.display = 'block'; 
            }
        });
    
        // Xử lý các ô dự báo không có dữ liệu
        for (let i = fiveDayForecast.length + 1; i <= 5; i++) {
            const forecastDay = document.querySelector(`.forecast-day[data-day="${i}"]`);
            if (forecastDay) {
                forecastDay.querySelector('.desc').innerText = 'Không có dữ liệu';
                forecastDay.querySelector('img').src = '';
                forecastDay.querySelector('.pop').innerText = '-';
                forecastDay.style.display = 'block'; 
            }
        }
    }
    async function changeWeatherUI(locationSearch) {
        if (!locationSearch) {
            if (window.showNotification) showNotification('Vui lòng nhập tên thành phố!', 'info');
            return;
        }

        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${locationSearch}&appid=${ApiKey1}&units=metric&lang=vi`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${locationSearch}&appid=${ApiKey2}&units=metric&lang=vi`;

        try {
            apiCallCounter += 2;
            
            localStorage.setItem('apiCallCounter', apiCallCounter);

            const [currentResponse, forecastResponse] = await Promise.all([
                fetch(currentUrl),
                fetch(forecastUrl)
            ]);
            const currentData = await currentResponse.json();
            const forecastData = await forecastResponse.json();

            if (currentData.cod !== 200) {
                content.classList.add('hide');
                if (window.showNotification) showNotification('Thành phố không tồn tại!', 'error');
                return;
            }

            const pop = forecastData.list[0]?.pop;
            updateCurrentWeather(currentData, pop);
            updateForecast(forecastData);
        } catch (error) {
            content.classList.add('hide');
            for (let i = 1; i <= 5; i++) {
                const forecastDay = document.querySelector(`.forecast-day[data-day="${i}"]`);
                if (forecastDay) {
                    forecastDay.querySelector('.desc').innerText = 'Lỗi';
                    forecastDay.querySelector('img').src = '';
                    forecastDay.querySelector('.pop').innerText = '-';
                }
            }
            if (window.showNotification) showNotification('Không kết nối được API thời tiết!', 'error');
        }
    }

    function checkNetworkStatus() {
        if (!navigator.onLine) {
            window.location.href = 'index.html';
            return;
        }
    }

    // Lắng nghe sự kiện thay đổi trạng thái mạng
    window.addEventListener('online', checkNetworkStatus);
    window.addEventListener('offline', checkNetworkStatus);

    search.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            let locationSearch = search.value.trim();
            changeWeatherUI(locationSearch);
        }
    });

    window.addEventListener('beforeunload', () => {
        clearInterval(window.timeInterval);
    });

    changeWeatherUI('');
});