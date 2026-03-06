// --- TỰ ĐỘNG CẤU HÌNH API THEO MÔI TRƯỜNG ---
const API_URL = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:5000/api"  // Nếu chạy trên Laptop
    : "/api";                      // Nếu chạy trên Render

let currentData = [];
let currentLang = ""; 
// Dùng sessionStorage để tắt trình duyệt là tự out nick
let userId = sessionStorage.getItem('vocab_user_id') || null; 
let username = sessionStorage.getItem('vocab_username') || "";
let pendingUploadFile = null;
let currentExamId = null; 
let isSharedOption = false;

let hideTuGoc = false;
let hidePhienAm = false;
let hideNghia = false;

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
            userId = data.user_id; username = user;
            sessionStorage.setItem('vocab_user_id', userId);
            sessionStorage.setItem('vocab_username', username);
            document.getElementById('display-name').textContent = username;
            showScreen('dashboard-screen');
            updateActivityTime(); // Bắt đầu tính giờ
        } else { alert("Lỗi: " + data.message); }
    } catch (e) { alert("Lỗi Server! Nhớ bật app.py lên nhé."); }
}

function logout() {
    userId = null; username = "";
    sessionStorage.clear();
    document.getElementById('username').value = "";
    document.getElementById('password').value = "";
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
                let deleteBtn = exam.is_mine ? `
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

// --- LOGIC LÀM BÀI ---
async function startExam(examId, examName) {
    currentExamId = examId;
    document.getElementById('exam-title').textContent = examName;
    
    document.getElementById('toggle-tugoc').checked = false;
    document.getElementById('toggle-phienam').checked = false;
    document.getElementById('toggle-nghia').checked = false;
    toggleColumns(); 
    
    try {
        let res = await fetch(`${API_URL}/exam/${examId}`);
        let data = await res.json();
        currentData = data.data; 
        renderTable(currentData);
        showScreen('exam-screen');
    } catch (e) { alert("Lỗi tải đề!"); }
}

function toggleColumns() {
    hideTuGoc = document.getElementById('toggle-tugoc').checked;
    hidePhienAm = document.getElementById('toggle-phienam').checked;
    hideNghia = document.getElementById('toggle-nghia').checked;
    renderTable(currentData); 
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

        tr.innerHTML = `
            <td class="border border-gray-400 p-1 md:p-2 text-center ${c_tugoc}" id="tu-goc-${index}" style="${fontTuGoc}">${t_tugoc}</td>
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
        
        tuGocCell.textContent = tuGoc;
        tuGocCell.classList.remove('text-gray-400');
        tuGocCell.classList.add('text-black');

        if (tuNhap.toLowerCase() === tuGoc.toLowerCase()) {
            checkCell.setAttribute('data-correct', 'true');
            checkCell.innerHTML = "✅ <br/><span class='text-[10px] md:text-xs'>QUÁ GIỎI</span>"; 
            checkCell.className = "border border-gray-400 p-1 md:p-2 text-center font-bold text-green-600 bg-green-50";
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
             tuGocCell.textContent = input.getAttribute('data-word');
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
    let ptram = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    document.getElementById('score-display').textContent = ptram;

    fetch(`${API_URL}/save_result`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, exam_id: currentExamId, score: ptram })
    }).catch(err => console.error("Lỗi lưu điểm:", err));

    let msg = document.getElementById('result-message');
    if (ptram === 100) {
        msg.innerHTML = "🎉 Tuyệt hảo! Đúng 100% không trượt phát nào!";
        msg.className = "text-xl font-bold mb-8 text-green-600 animate-pulse";
    } else {
        msg.innerHTML = `Bạn làm đúng ${ptram}%. Cố lên nhé! 💪`;
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

