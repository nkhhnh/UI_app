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

    function removeDiacritics(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    function getDateMonth(date) {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        return `${day}/${month}`;
    }

    function updateCurrentWeather(data, pop, displayName) {
        content.classList.remove('hide');
        city.innerText = displayName || data.name;
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
        } else {
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime() / 1000;

        const forecastByDay = {};

        data.list.forEach(item => {
            const itemDate = new Date(item.dt * 1000);
            const itemDayTimestamp = itemDate.setHours(0, 0, 0, 0) / 1000;

            if (itemDayTimestamp <= todayTimestamp) return; // Bỏ qua ngày hiện tại

            const dayKey = itemDayTimestamp;
            if (!forecastByDay[dayKey]) {
                forecastByDay[dayKey] = {
                    date: new Date(item.dt * 1000),
                    pop: item.pop,
                    icon: item.weather[0].icon,
                    description: item.weather[0].description,
                    count: 1
                };
            } else {
                forecastByDay[dayKey].pop = Math.max(forecastByDay[dayKey].pop, item.pop);
                forecastByDay[dayKey].count += 1;
                if (itemDate.getHours() === 12) {
                    forecastByDay[dayKey].icon = item.weather[0].icon;
                    forecastByDay[dayKey].description = item.weather[0].description;
                }
            }
        });

        Object.values(forecastByDay).sort((a, b) => a.date - b.date).forEach(day => {
            dailyForecasts.push(day);
        });

        const fiveDayForecast = dailyForecasts.slice(0, 5);
        if (fiveDayForecast.length < 5) {
            console.warn(`Chỉ có ${fiveDayForecast.length} ngày dữ liệu, cần 5 ngày.`);
            if (window.showNotification) showNotification(`Chỉ có dữ liệu cho ${fiveDayForecast.length} ngày!`, 'info');
        }

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

    // ===================================================================
    // TIM KIEM DIA DIEM
    // ===================================================================
    // Truoc day ban thang chuoi nguoi dung go vao tham so q= cua endpoint
    // /data/2.5/weather. Tham so do tra khop gan nhu chinh xac theo ten
    // trong CSDL, nen "quận 1" ra ket qua con "quan 1" thi 404.
    //
    // Geocoding API (/geo/1.0/direct) khoan dung hon nhieu - do da kiem tra
    // that: "quan 1", "go vap", "thu duc", "hai chau" khong dau deu ra dung.
    // Nen gio dung no de doi ten -> toa do, roi goi thoi tiet bang lat/lon.

    const CITY_ALIASES = {
        'hn': 'ha noi',
        'sg': 'sai gon',
        'tp hcm': 'ho chi minh',
        'tp ho chi minh': 'ho chi minh',
        'vt': 'vung tau',
        'dl': 'da lat'
    };

    function normalizeQuery(input) {
        let query = input.trim().replace(/\s+/g, ' ');

        // "quan1" -> "quan 1", "q1" -> "q 1"
        query = query.replace(/([a-zA-Z\u00C0-\u1EF9])(\d)/g, '$1 $2');

        // "q 1", "q.1" -> "quan 1" (rieng "quan" khong bi dinh vi sau chu q
        // la chu u chu khong phai so)
        query = query.replace(/\bq\s*\.?\s*(\d{1,2})\b/gi, 'quan $1');

        const key = removeDiacritics(query).toLowerCase();
        return CITY_ALIASES[key] || query;
    }

    // Uu tien ket qua o Viet Nam neu co.
    // Do thuc te: truy van tieng Viet luon co ban ghi VN trong danh sach
    // (vi du "hai chau" tra ve CN, KP, CN, VN, VN - phai lay cai VN), con
    // truy van nuoc ngoai (London, Paris, Tokyo, Berlin...) khong he co ban
    // ghi VN nao, nen quy tac nay khong lam hong tim kiem quoc te.
    function pickBestMatch(results) {
        if (!Array.isArray(results) || results.length === 0) return null;
        return results.find(item => item.country === 'VN') || results[0];
    }

    async function geocode(query) {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${ApiKey1}`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async function resolveLocation(input) {
        const normalized = normalizeQuery(input);
        let best = pickBestMatch(await geocode(normalized));
        if (best) return best;

        // Chuan hoa co the doan sai y nguoi dung, thu lai nguyen van.
        const raw = input.trim().replace(/\s+/g, ' ');
        if (normalized !== raw) {
            best = pickBestMatch(await geocode(raw));
        }
        return best;
    }

    async function changeWeatherUI(locationSearch) {
        // Khong bao loi khi chuoi rong: ham nay cung duoc goi luc mo trang.
        if (!locationSearch || !locationSearch.trim()) return;

        try {
            apiCallCounter += 3;
            localStorage.setItem('apiCallCounter', apiCallCounter);

            const place = await resolveLocation(locationSearch);

            if (!place) {
                content.classList.add('hide');
                if (window.showNotification) {
                    showNotification(`Không tìm thấy "${locationSearch}".`, 'error');
                }
                return;
            }

            const displayName = (place.local_names && place.local_names.vi) || place.name;
            const coords = `lat=${place.lat}&lon=${place.lon}`;

            const [currentResponse, forecastResponse] = await Promise.all([
                fetch(`https://api.openweathermap.org/data/2.5/weather?${coords}&appid=${ApiKey1}&units=metric&lang=vi`),
                fetch(`https://api.openweathermap.org/data/2.5/forecast?${coords}&appid=${ApiKey2}&units=metric&lang=vi`)
            ]);
            const currentData = await currentResponse.json();
            const forecastData = await forecastResponse.json();

            if (Number(currentData.cod) !== 200) {
                content.classList.add('hide');
                if (window.showNotification) showNotification('Không lấy được thời tiết của địa điểm này!', 'error');
                return;
            }

            if (forecastData.cod !== "200") {
                console.warn('API dự báo thất bại:', forecastData);
                if (window.showNotification) showNotification('Không lấy được dữ liệu dự báo!', 'error');
                return;
            }

            const pop = forecastData.list[0]?.pop;
            updateCurrentWeather(currentData, pop, displayName);
            updateForecast(forecastData);

            localStorage.setItem('weather_last_search', locationSearch.trim());
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
            if (window.showNotification) showNotification('Không kết nối được dữ liệu thời tiết!', 'error');
            console.error('Lỗi API:', error);
        }
    }

    function checkNetworkStatus() {
        if (!navigator.onLine) {
            window.location.href = '/';
            return;
        }
    }

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

    // Truoc day goi voi chuoi rong nen mo trang lan nao cung bat thong bao
    // "Vui long nhap ten thanh pho!".
    const lastSearch = localStorage.getItem('weather_last_search');
    if (lastSearch) {
        search.value = lastSearch;
        changeWeatherUI(lastSearch);
    }
});