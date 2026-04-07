const input = document.getElementById('url-input');
const addBtn = document.getElementById('add-btn');
const urlListDiv = document.getElementById('url-list');

// Hiển thị danh sách từ bộ nhớ Chrome Storage
function displayList() {
    chrome.storage.sync.get(['blockedUrls'], (result) => {
        const list = result.blockedUrls || [];
        urlListDiv.innerHTML = '';
        list.forEach((url, index) => {
            const item = document.createElement('div');
            item.className = 'url-item';
            item.innerHTML = `
                <span>${url}</span>
                <button class="delete-btn" data-index="${index}">Xóa</button>
            `;
            urlListDiv.appendChild(item);
        });
    });
}

// Thêm URL mới vào danh sách
addBtn.addEventListener('click', () => {
    const newUrl = input.value.trim().toLowerCase();
    if (newUrl) {
        chrome.storage.sync.get(['blockedUrls'], (result) => {
            const list = result.blockedUrls || [];
            if (!list.includes(newUrl)) {
                list.push(newUrl);
                chrome.storage.sync.set({ blockedUrls: list }, () => {
                    input.value = '';
                    displayList();
                });
            } else {
                alert('URL này đã có trong danh sách rồi!');
            }
        });
    }
});

// Xử lý khi nhấn vào gợi ý để điền nhanh
document.querySelectorAll('.suggestion').forEach(item => {
    item.addEventListener('click', () => {
        input.value = item.innerText;
    });
});

// Xóa URL khỏi danh sách
urlListDiv.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const index = e.target.getAttribute('data-index');
        chrome.storage.sync.get(['blockedUrls'], (result) => {
            const list = result.blockedUrls;
            list.splice(index, 1);
            chrome.storage.sync.set({ blockedUrls: list }, displayList);
        });
    }
});

// Load danh sách ngay khi mở trang
displayList();