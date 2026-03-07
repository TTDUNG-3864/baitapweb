// --- TỰ ĐỘNG CẤU HÌNH API THEO MÔI TRƯỜNG ---
const API_URL = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:5000/api"  // Nếu chạy trên Laptop
    : "/api";                      // Nếu chạy trên Render

let currentData = [];
let currentLang = ""; 

// Dùng sessionStorage để tắt trình duyệt là tự out nick
let userId = sessionStorage.getItem('vocab_user_id') || null; 
let username = sessionStorage.getItem('vocab_username') || "";
let userRole = sessionStorage.getItem('vocab_role') || 'user'; // LƯU QUYỀN ADMIN

let pendingUploadFile = null;
let currentExamId = null; 
let isSharedOption = false;

let hideTuGoc = false;
let hidePhienAm = false;
let hideNghia = false;

// BIẾN THÁCH ĐẤU & ĐẾM GIAN LẬN
let peekCount = 0; 
let inviteCheckInterval = null; 

// --- ĐIỀU HƯỚNG MÀN HÌNH ---
function showScreen(screenId) {
    let screens = ['login-screen', 'dashboard-screen', 'exam-list-screen', 'exam-screen', 'result-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.add('hidden');
            el.style.display = ''; 
        }
    });
    
    const target = document.getElementById(screenId);
    if(target) {
        target.classList.remove('hidden');
        if (screenId === 'login-screen' || screenId === 'result-screen') {
            target.style.display = 'flex';
        } else {
            target.style.display = 'block';
        }
        window.scrollTo(0, 0); 
    }
}

window.onload = function() {
    if (userId) {
        document.getElementById('display-name').textContent = username;
        showScreen('dashboard-screen');
        checkAdminMenu(); 
        startRadar(); // Bật radar lúc vào trang
    }
};

// --- ĐĂNG KÝ & ĐĂNG NHẬP ---
async function register() {
    let user = document.getElementById('username').value.trim();
    let pass = document.getElementById('password').value.trim();
    if(!user || !pass) return alert("Nhập đủ thông tin!");
    try {
        let res = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
        let data = await res.json();
        alert(data.message);
    } catch (e) { alert("Lỗi mạng!"); }
}

async function login() {
    let user = document.getElementById('username').value.trim();
    let pass = document.getElementById('password').value.trim();
    if(!user || !pass) return alert("Nhập đủ thông tin!");
    try {
        let res = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
        let data = await res.json();
        if (data.status === "success") {
            userId = data.user_id; 
            username = user;
            userRole = data.role;

            sessionStorage.setItem('vocab_user_id', userId);
            sessionStorage.setItem('vocab_username', username);
            sessionStorage.setItem('vocab_role', userRole);

            document.getElementById('display-name').textContent = username;
            showScreen('dashboard-screen');
            updateActivityTime(); 
            checkAdminMenu(); 
            startRadar(); // Bật radar ngay khi đăng nhập
        } else { alert("Lỗi: " + data.message); }
    } catch (e) { alert("Lỗi Server! Nhớ bật app.py lên nhé."); }
}

function logout() {
    userId = null; 
    username = "";
    userRole = "user";
    sessionStorage.clear();
    document.getElementById('username').value = "";
    document.getElementById('password').value = "";
    if (inviteCheckInterval) clearInterval(inviteCheckInterval); // Tắt radar
    showScreen('login-screen');
}

function goHome() { showScreen('dashboard-screen'); }

// --- UPLOAD FILE ---
function selectShareOption(isShared) {
    isSharedOption = isShared;
    let btnShare = document.getElementById('btn-share');
    let btnPrivate = document.getElementById('btn-private');
    if (isShared) {
        btnShare.className = "flex-1 py-2 px-2 border rounded font-semibold text-sm transition bg-green-500 text-white border-green-600";
        btnPrivate.className = "flex-1 py-2 px-2 border rounded font-semibold text-sm transition bg-gray-200 text-gray-700 border-gray-300";
    } else {
        btnPrivate.className = "flex-1 py-2 px-2 border rounded font-semibold text-sm transition bg-green-500 text-white border-green-600";
        btnShare.className = "flex-1 py-2 px-2 border rounded font-semibold text-sm transition bg-gray-200 text-gray-700 border-gray-300";
    }
}

function handleFileUpload(event) {
    let file = event.target.files[0];
    if(!file) return;
    pendingUploadFile = file;
    document.getElementById('upload-exam-name').value = file.name.split('.')[0]; 
    selectShareOption(false);
    document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    document.getElementById('file-upload').value = ''; 
    pendingUploadFile = null;
}

async function confirmUpload(lang) {
    if (!pendingUploadFile) return;
    let examName = document.getElementById('upload-exam-name').value.trim() || pendingUploadFile.name;
    let formData = new FormData();
    formData.append('file', pendingUploadFile);
    formData.append('exam_name', examName);
    formData.append('lang', lang);
    formData.append('user_id', userId);
    formData.append('is_shared', isSharedOption);

    try {
        let res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        let data = await res.json();
        if (data.status === "success") {
            alert(`🎉 ${data.message}`);
            closeUploadModal();
            if(currentLang === lang) showExamList(lang); else goHome();
        } else alert("Lỗi: " + data.message);
    } catch (e) { alert("Lỗi up file!"); }
}

// --- DANH SÁCH BỘ ĐỀ ---
async function showExamList(lang) {
    currentLang = lang;
    document.getElementById('list-title').textContent = "Bộ đề Tiếng " + lang;
    let container = document.getElementById('exam-list-container');
    container.innerHTML = "<p class='text-center p-4'>⏳ Đang tải...</p>"; 

    try {
        let res = await fetch(`${API_URL}/exams/${lang}?user_id=${userId}`);
        let data = await res.json();
        container.innerHTML = ""; 
        
        if (!data.data || data.data.length === 0) {
            container.innerHTML = `<p class="italic text-center p-10 bg-white rounded shadow text-gray-500">Chưa có bộ đề nào ở đây.</p>`;
        } else {
            data.data.forEach(exam => {
                let div = document.createElement('div');
                let safeName = exam.name.replace(/'/g, "\\'");
                
                div.className = "bg-white p-4 rounded-xl shadow-md border-l-8 border-blue-500 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-3";
                
                let shareBadge = exam.is_shared ? `<span class="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tighter">Cộng đồng</span>` : '';
                
                let deleteBtn = (exam.is_mine || userRole === 'admin') ? `
                    <button type="button" onclick="deleteExam(${exam.id})" class="bg-red-50 text-red-600 border border-red-200 py-2 px-4 rounded-lg font-bold text-sm active:bg-red-600 active:text-white transition-all">
                        🗑️ Xóa
                    </button>` : '';

                div.innerHTML = `
                    <div class="w-full md:w-auto">
                        <div class="flex items-center gap-2">
                            <h3 class="font-black text-lg text-gray-800">${exam.name}</h3>
                            ${shareBadge}
                        </div>
                        <p class="text-xs text-gray-400 mt-1">${exam.is_mine ? 'Bộ đề của tôi' : 'Bộ đề chia sẻ'}</p>
                    </div>
                    <div class="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                        <button type="button" onclick="startExam(${exam.id}, '${safeName}')" class="flex-1 md:flex-none bg-blue-600 text-white py-2 px-6 rounded-lg font-black shadow-md active:scale-95 transition-transform text-sm">
                            🎯 LÀM BÀI
                        </button>
                        <button type="button" onclick="openLeaderboard(${exam.id}, '${safeName}')" class="bg-yellow-100 text-yellow-700 border border-yellow-300 py-2 px-4 rounded-lg font-bold text-sm active:bg-yellow-500 active:text-white transition-all">
                            🏆 HẠNG
                        </button>
                        ${deleteBtn}
                    </div>
                `;
                container.appendChild(div);
            });
        }
        showScreen('exam-list-screen');
    } catch (e) { alert("Lỗi tải danh sách!"); }
}

async function deleteExam(examId) {
    if(!confirm("Xóa bộ đề này nhé?")) return;
    try {
        let res = await fetch(`${API_URL}/exam/${examId}`, { method: 'DELETE' });
        let data = await res.json();
        if (data.status === "success") showExamList(currentLang);
    } catch (e) { alert("Lỗi khi xóa!"); }
}

// --- LOGIC LÀM BÀI MỚI (CÓ AUTO ẨN VÀ TÍNH ĐIỂM LIẾC BÀI) ---
async function startExam(examId, examName) {
    currentExamId = examId;
    document.getElementById('exam-title').textContent = examName;
    peekCount = 0; // Reset bộ đếm gian lận

    document.getElementById('toggle-tugoc').checked = false;
    document.getElementById('toggle-phienam').checked = false;
    document.getElementById('toggle-nghia').checked = false;

    // AUTO ẨN THEO NGÔN NGỮ
    if (currentLang === 'Trung') {
        document.getElementById('toggle-phienam').checked = true; // Trung -> Ẩn Phiên âm
    } else if (currentLang === 'Anh') {
        document.getElementById('toggle-tugoc').checked = true; // Anh -> Ẩn Từ gốc
    }
    
    // Gọi hàm nhưng set true để không bị phạt lúc mới vào
    toggleColumns(true); 
    
    try {
        let res = await fetch(`${API_URL}/exam/${examId}`);
        let data = await res.json();
        currentData = data.data; 
        renderTable(currentData);
        showScreen('exam-screen');
    } catch (e) { alert("Lỗi tải đề!"); }
}

function toggleColumns(isSetup = false) {
    let newHideTuGoc = document.getElementById('toggle-tugoc').checked;
    let newHidePhienAm = document.getElementById('toggle-phienam').checked;
    let newHideNghia = document.getElementById('toggle-nghia').checked;

    // TÍNH ĐIỂM PHẠT: Đang Ẩn (true) mà chuyển sang Hiện (false) -> Phạt 1 lần
    if (!isSetup) {
        if (hideTuGoc && !newHideTuGoc) peekCount++;
        if (hidePhienAm && !newHidePhienAm) peekCount++;
        if (hideNghia && !newHideNghia) peekCount++;
    }

    hideTuGoc = newHideTuGoc;
    hidePhienAm = newHidePhienAm;
    hideNghia = newHideNghia;

    if (!isSetup) renderTable(currentData); 
}

function renderTable(data) {
    let tbody = document.getElementById('exam-body');
    tbody.innerHTML = "";
    
    let isMobile = window.innerWidth < 768;

    data.forEach((item, index) => {
        let tr = document.createElement('tr');
        
        let t_tugoc = hideTuGoc ? "***" : item.tu_goc;
        let t_phienam = hidePhienAm ? "***" : (item.phien_am || '');
        let t_nghia = hideNghia ? "***" : item.nghia;
        
        let c_tugoc = hideTuGoc ? "text-gray-400 font-normal" : "text-black font-bold";
        let c_phienam = hidePhienAm ? "text-gray-400" : "text-black";
        let c_nghia = hideNghia ? "text-gray-400" : "text-black";

        let isTrung = (currentLang === 'Trung');
        let sizeTuGoc = isMobile ? (isTrung ? "1.2rem" : "1rem") : (isTrung ? "1.5rem" : "1.1rem");
        let sizeInput = isMobile ? "0.9rem" : "1.1rem";

        let fontTuGoc = isTrung ? `font-family: 'KaiTi', 'STKaiti', serif; font-size: ${sizeTuGoc};` : `font-size: ${sizeTuGoc};`;
        let fontInput = isTrung ? `font-family: 'KaiTi', 'STKaiti', serif; font-size: ${sizeInput};` : `font-size: ${sizeInput};`;

        let safeWord = item.tu_goc.replace(/'/g, "\\'");
        let loaIcon = `<button type="button" onclick="speakWord('${safeWord}')" class="btn-loa" title="Nghe phát âm" style="background: transparent !important; box-shadow: none !important; border: none !important; padding: 0 5px !important; color: inherit !important; font-size: 1.2rem !important; cursor: pointer;">🔊</button>`;

        tr.innerHTML = `
            <td class="border border-gray-400 p-1 md:p-2 text-center ${c_tugoc}" id="tu-goc-${index}" style="${fontTuGoc}">
                <div class="flex items-center justify-center gap-1 md:gap-2">
                    <span>${t_tugoc}</span>
                    ${loaIcon}
                </div>
            </td>
            <td class="border border-gray-400 p-1 md:p-2 text-center ${c_phienam}" style="font-size: ${isMobile ? '0.8rem' : '1rem'}">${t_phienam}</td>
            <td class="border border-gray-400 p-1 md:p-2 text-left ${c_nghia}" style="font-size: ${isMobile ? '0.8rem' : '1rem'}">${t_nghia}</td>
            <td class="border border-gray-400 p-0" style="width: ${isMobile ? '80px' : 'auto'}">
                <input type="text" data-word="${item.tu_goc}" data-index="${index}" onkeypress="handleEnter(event, this)" 
                       class="word-input w-full h-full p-1 md:p-2 text-center font-bold focus:outline-none focus:bg-blue-50" 
                       style="${fontInput}" placeholder="...">
            </td>
            <td class="border border-gray-400 p-1 md:p-2 text-center font-bold text-xs md:text-base" id="check-${index}" style="min-width: ${isMobile ? '60px' : 'auto'}"></td>
        `;
        tbody.appendChild(tr);
    });
}

function handleEnter(event, input) {
    if (event.key === "Enter") {
        let tuGoc = input.getAttribute('data-word').trim(); 
        let tuNhap = input.value.trim();
        
        input.readOnly = true; 
        input.classList.add('bg-gray-100');

        let index = input.getAttribute('data-index');
        let checkCell = document.getElementById(`check-${index}`);
        let tuGocCell = document.getElementById(`tu-goc-${index}`);
        
        let safeWord = tuGoc.replace(/'/g, "\\'");
        let loaIcon = `<button type="button" onclick="speakWord('${safeWord}')" class="btn-loa" title="Nghe phát âm" style="background: transparent !important; box-shadow: none !important; border: none !important; padding: 0 5px !important; color: inherit !important; font-size: 1.2rem !important; cursor: pointer;">🔊</button>`;
        tuGocCell.innerHTML = `<div class="flex items-center justify-center gap-1 md:gap-2"><span>${tuGoc}</span>${loaIcon}</div>`;
        tuGocCell.classList.remove('text-gray-400');
        tuGocCell.classList.add('text-black');

        if (tuNhap.toLowerCase() === tuGoc.toLowerCase()) {
            checkCell.setAttribute('data-correct', 'true');
            checkCell.innerHTML = "✅ <br/><span class='text-[10px] md:text-xs'>QUÁ GIỎI</span>"; 
            checkCell.className = "border border-gray-400 p-1 md:p-2 text-center font-bold text-green-600 bg-green-50";
            speakWord(tuGoc);
        } else {
            checkCell.setAttribute('data-correct', 'false');
            checkCell.innerHTML = "❌ <br/><span class='text-[10px] md:text-xs'>SAI RỒI</span>";
            checkCell.className = "border border-gray-400 p-1 md:p-2 text-center font-bold text-red-600 bg-red-50";
        }
        
        let allInputs = Array.from(document.querySelectorAll('.word-input'));
        let idx = allInputs.indexOf(input);
        if(idx < allInputs.length - 1) allInputs[idx + 1].focus();
    }
}

function submitExam() {
    let inputs = document.querySelectorAll('.word-input');
    let correctCount = 0;
    
    inputs.forEach(input => {
        if (!input.readOnly && input.value.trim() !== "") {
            handleEnter({ key: "Enter" }, input);
        } else if (!input.readOnly && input.value.trim() === "") {
             let index = input.getAttribute('data-index');
             let checkCell = document.getElementById(`check-${index}`);
             checkCell.setAttribute('data-correct', 'false');
             checkCell.innerHTML = "❌ <br/><span class='text-[10px] md:text-xs'>SAI RỒI</span>";
             checkCell.className = "border border-gray-400 p-1 md:p-2 text-center font-bold text-red-600 bg-red-100";
             
             let tuGocCell = document.getElementById(`tu-goc-${index}`);
             let tuGoc = input.getAttribute('data-word');
             let safeWord = tuGoc.replace(/'/g, "\\'");
             let loaIcon = `<button type="button" onclick="speakWord('${safeWord}')" class="btn-loa" title="Nghe phát âm" style="background: transparent !important; box-shadow: none !important; border: none !important; padding: 0 5px !important; color: inherit !important; font-size: 1.2rem !important; cursor: pointer;">🔊</button>`;
             
             tuGocCell.innerHTML = `<div class="flex items-center justify-center gap-1 md:gap-2"><span>${tuGoc}</span>${loaIcon}</div>`;
             tuGocCell.classList.remove('text-gray-400'); tuGocCell.classList.add('text-black');
             
             input.readOnly = true; input.classList.add('bg-gray-100');
        }
    });

    inputs.forEach(input => {
        let index = input.getAttribute('data-index');
        let checkCell = document.getElementById(`check-${index}`);
        if (checkCell && checkCell.getAttribute('data-correct') === 'true') {
            correctCount++;
        }
    });

    let total = inputs.length;
    let originScore = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    
    // TRỪ ĐIỂM: Mỗi lần nhìn trộm trừ 5%
    let penalty = peekCount * 5;
    let finalScore = Math.max(0, originScore - penalty);

    document.getElementById('score-display').textContent = finalScore;

    fetch(`${API_URL}/save_result`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, exam_id: currentExamId, score: finalScore })
    }).catch(err => console.error("Lỗi lưu điểm:", err));

    let msg = document.getElementById('result-message');
    if (finalScore === 100 && peekCount === 0) {
        msg.innerHTML = "🎉 Tuyệt hảo! 100% không xài phao!";
        msg.className = "text-xl font-bold mb-8 text-green-600 animate-pulse";
    } else {
        msg.innerHTML = `Làm đúng ${originScore}%. Bị trừ ${penalty}% vì xem trộm ${peekCount} lần.<br>=> Điểm cuối: ${finalScore}%`;
        msg.className = "text-lg font-bold mb-8 text-red-600";
    }

    showScreen('result-screen');
}

function retryExam() {
    currentData = [...currentData].sort(() => Math.random() - 0.5);
    renderTable(currentData);
    showScreen('exam-screen');
}

// --- API BẢNG XẾP HẠNG ---
async function openLeaderboard(examId, examName) {
    let modal = document.getElementById('leaderboard-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; 

    let titleEl = document.getElementById('lb-exam-name');
    if(titleEl) titleEl.textContent = examName;

    document.getElementById('lb-body').innerHTML = `<tr><td colspan="3" class="text-center p-4">⏳ Đang lấy dữ liệu...</td></tr>`;

    try {
        let res = await fetch(`${API_URL}/leaderboard/${examId}`);
        if (!res.ok) throw new Error("Mạng lỗi");
        let data = await res.json();
        let tbody = document.getElementById('lb-body');
        tbody.innerHTML = "";

        if(!data.data || data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-gray-500 italic">Chưa có ai thi bộ này! Hãy là người đầu tiên!</td></tr>`;
            return;
        }

        data.data.forEach((row, index) => {
            let rankIcon = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : `<span class="text-gray-500">#${index+1}</span>`));
            let tr = document.createElement('tr');
            tr.className = "border-b hover:bg-yellow-50";
            tr.innerHTML = `
                <td class="p-2 font-bold text-xl text-center">${rankIcon}</td>
                <td class="p-2 font-bold ${row.username === username ? 'text-blue-600' : ''}">
                    ${row.username} ${row.username === username ? '<span class="text-[10px] bg-blue-100 px-1 rounded">(Bạn)</span>' : ''}
                </td>
                <td class="p-2 text-right font-black text-green-600">${row.score}%</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        document.getElementById('lb-body').innerHTML = `<tr><td colspan="3" class="text-center p-4 text-red-500 font-bold">Lỗi lấy xếp hạng!</td></tr>`;
    }
}

function closeLeaderboard() {
    let modal = document.getElementById('leaderboard-modal');
    modal.classList.add('hidden');
    modal.style.display = ''; 
}

// --- TÍNH NĂNG BẢO MẬT: TỰ ĐỘNG ĐĂNG XUẤT SAU 30 PHÚT ---
const IDLE_TIMEOUT = 30 * 60 * 1000; 

function updateActivityTime() {
    if (userId) {
        sessionStorage.setItem('last_active_time', Date.now());
    }
}

document.addEventListener('click', updateActivityTime);
document.addEventListener('keypress', updateActivityTime);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && userId) {
        let lastActive = sessionStorage.getItem('last_active_time');
        
        if (lastActive && (Date.now() - parseInt(lastActive) > IDLE_TIMEOUT)) {
            alert("⏰ Phiên học đã hết hạn do để web quá lâu. Vui lòng đăng nhập lại!");
            logout();
        } else {
            updateActivityTime();
        }
    }
});

// --- TÍNH NĂNG PHÁT ÂM (TEXT-TO-SPEECH) ---
function speakWord(text) {
    if (!('speechSynthesis' in window)) {
        alert("Trình duyệt không hỗ trợ phát âm!");
        return;
    }
    window.speechSynthesis.cancel();
    let msg = new SpeechSynthesisUtterance();
    msg.text = text;
    if (currentLang === 'Trung') {
        msg.lang = 'zh-CN'; 
    } else if (currentLang === 'Anh') {
        msg.lang = 'en-US'; 
    } else {
        msg.lang = 'vi-VN';
    }
    msg.rate = 0.85; 
    window.speechSynthesis.speak(msg);
}

// ==========================================
// --- MẮT THẦN ADMIN (THEO DÕI HỌC SINH) ---
// ==========================================

function checkAdminMenu() {
    let burger = document.getElementById('admin-burger');
    if (burger) {
        if (userRole === 'admin') {
            burger.classList.remove('hidden');
        } else {
            burger.classList.add('hidden');
        }
    }
}

async function openAdminPanel() {
    document.getElementById('admin-modal').classList.remove('hidden');
    
    let dateInput = document.getElementById('admin-date');
    if (!dateInput.value) {
        let today = new Date();
        let yyyy = today.getFullYear();
        let mm = String(today.getMonth() + 1).padStart(2, '0');
        let dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    
    fetchAdminData();
}

async function fetchAdminData() {
    let tbody = document.getElementById('admin-tbody');
    tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4">⏳ Đang hack vào hệ thống...</td></tr>`;

    let selectedDate = document.getElementById('admin-date').value; 

    try {
        let res = await fetch(`${API_URL}/admin/activities?date=${selectedDate}`);
        let data = await res.json();
        tbody.innerHTML = "";

        if(data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center p-8 font-bold text-gray-500 text-lg">Hôm nay không có đứa nào học bài cả! 😅</td></tr>`;
            return;
        }

        data.data.forEach(row => {
            let timeStr = row.ngay_lam ? new Date(row.ngay_lam).toLocaleString('vi-VN') : "Gần đây";
            let hs = row.users ? row.users.username : "Vô danh";
            let bo = row.bo_tu_vung ? row.bo_tu_vung.ten_bo : "Đã bị xóa";
            let diemColor = row.diem_so >= 80 ? 'text-green-600' : (row.diem_so < 50 ? 'text-red-600' : 'text-yellow-600');

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 text-sm md:text-base">
                    <td class="p-2 md:p-3 font-bold">${hs}</td>
                    <td class="p-2 md:p-3">${bo}</td>
                    <td class="p-2 md:p-3 font-black ${diemColor}">${row.diem_so}%</td>
                    <td class="p-2 md:p-3 text-xs md:text-sm text-gray-500">${timeStr}</td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500 font-bold">Lỗi truy xuất dữ liệu!</td></tr>`;
    }
}

function closeAdminPanel() {
    document.getElementById('admin-modal').classList.add('hidden');
    let burgerCheckbox = document.getElementById('burger');
    if(burgerCheckbox) burgerCheckbox.checked = false; 
}


// ==============================================
// --- LOGIC MỞ TRẠM THÁCH ĐẤU TỪ MÀN HÌNH CHÍNH ---
// ==============================================

let onlineUsersData = [];
let pendingInviteExam = null;

// Khởi động radar bắt sóng người onl
function startRadar() {
    if (inviteCheckInterval) clearInterval(inviteCheckInterval);
    inviteCheckInterval = setInterval(async () => {
        if (!userId) return;
        try {
            let res = await fetch(`${API_URL}/ping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, username: username })
            });
            let data = await res.json();
            onlineUsersData = data.online_users;

            // Bắt được sóng thách đấu
            if (data.invite) {
                document.getElementById('invite-message').innerHTML = `<span class="text-blue-600">${data.invite.from_username}</span> đang thách đấu bạn bộ đề <br/><span class="text-purple-600 font-black uppercase">${data.invite.exam_name}</span> !`;
                pendingInviteExam = data.invite;
                document.getElementById('receive-invite-modal').classList.remove('hidden');
                
                fetch(`${API_URL}/clear_invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId })
                });
            }
        } catch(e) {}
    }, 5000); // 5 giây quét 1 lần
}

async function openGlobalChallenge() {
    document.getElementById('invite-modal').classList.remove('hidden');
    
    let selectEl = document.getElementById('challenge-exam-select');
    selectEl.innerHTML = `<option value="">⏳ Đang tải đề...</option>`;
    
    try {
        let [resAnh, resTrung] = await Promise.all([
            fetch(`${API_URL}/exams/Anh?user_id=${userId}`),
            fetch(`${API_URL}/exams/Trung?user_id=${userId}`)
        ]);
        let dataAnh = await resAnh.json();
        let dataTrung = await resTrung.json();
        
        selectEl.innerHTML = "";
        let hasExams = false;

        if (dataAnh.data && dataAnh.data.length > 0) {
            let group = document.createElement('optgroup');
            group.label = "🇺🇸 Tiếng Anh";
            dataAnh.data.forEach(ex => {
                let opt = document.createElement('option');
                opt.value = ex.id;
                opt.setAttribute('data-lang', 'Anh');
                opt.textContent = ex.name;
                group.appendChild(opt);
            });
            selectEl.appendChild(group);
            hasExams = true;
        }
        
        if (dataTrung.data && dataTrung.data.length > 0) {
            let group = document.createElement('optgroup');
            group.label = "🇨🇳 Tiếng Trung";
            dataTrung.data.forEach(ex => {
                let opt = document.createElement('option');
                opt.value = ex.id;
                opt.setAttribute('data-lang', 'Trung');
                opt.textContent = ex.name;
                group.appendChild(opt);
            });
            selectEl.appendChild(group);
            hasExams = true;
        }

        if (!hasExams) {
            selectEl.innerHTML = `<option value="">❌ Bạn chưa có bộ đề nào!</option>`;
        }
    } catch(e) {
        selectEl.innerHTML = `<option value="">❌ Lỗi tải đề</option>`;
    }

    renderOnlineUsersForChallenge();
}

function renderOnlineUsersForChallenge() {
    let listDiv = document.getElementById('online-users-list');
    listDiv.innerHTML = "";
    
    if (onlineUsersData.length === 0) {
        listDiv.innerHTML = `<p class="text-gray-500 font-bold italic py-4 text-center">Chưa có ai online lúc này...</p>`;
    } else {
        onlineUsersData.forEach(u => {
            listDiv.innerHTML += `
                <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                    <span class="font-bold text-green-600 flex items-center gap-2">
                        <span class="relative flex h-3 w-3">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        ${u.username}
                    </span>
                    <button onclick="sendGlobalChallenge('${u.user_id}')" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-black text-sm shadow border-b-4 border-red-700 active:border-b-0 active:mt-1 transition-all">CHIẾN</button>
                </div>
            `;
        });
    }
}

async function sendGlobalChallenge(targetUserId) {
    let selectEl = document.getElementById('challenge-exam-select');
    let examId = selectEl.value;
    
    if(!examId) return alert("Vui lòng chọn bộ đề làm vũ khí trước!");
    
    let selectedOption = selectEl.options[selectEl.selectedIndex];
    let examName = selectedOption.textContent;
    let examLang = selectedOption.getAttribute('data-lang');

    document.getElementById('invite-modal').classList.add('hidden');
    
    await fetch(`${API_URL}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to_user_id: targetUserId,
            from_user_id: userId,
            from_username: username,
            exam_id: examId,
            exam_name: examName,
            lang: examLang
        })
    });
    
    alert("⚔️ Đã ném thư thách đấu! Cùng vào phòng thi nào!");
    
    currentLang = examLang; 
    startExam(examId, examName);
}

// Chấp nhận / Từ chối lời mời
function acceptInvite() {
    document.getElementById('receive-invite-modal').classList.add('hidden');
    if (pendingInviteExam) {
        currentLang = pendingInviteExam.lang; 
        startExam(pendingInviteExam.exam_id, pendingInviteExam.exam_name);
    }
}

function rejectInvite() {
    document.getElementById('receive-invite-modal').classList.add('hidden');
    pendingInviteExam = null;
}
