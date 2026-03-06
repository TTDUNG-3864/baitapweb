const API_URL = "/api";

let currentData = [];
let currentLang = ""; 
let userId = localStorage.getItem('vocab_user_id') || null; 
let username = localStorage.getItem('vocab_username') || "";
let pendingUploadFile = null;
let currentExamId = null; 
let isSharedOption = false;

// Trạng thái của 3 checkbox Ẩn/Hiện
let hideTuGoc = false;
let hidePhienAm = false;
let hideNghia = false;

function showScreen(screenId) {
    let screens = ['login-screen', 'dashboard-screen', 'exam-list-screen', 'exam-screen', 'result-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

window.onload = function() {
    if (userId) {
        document.getElementById('display-name').textContent = username;
        showScreen('dashboard-screen');
    }
};

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
            localStorage.setItem('vocab_user_id', userId);
            localStorage.setItem('vocab_username', username);
            document.getElementById('display-name').textContent = username;
            showScreen('dashboard-screen');
        } else { alert("Lỗi: " + data.message); }
    } catch (e) { alert("Lỗi Server!"); }
}

function logout() {
    userId = null; username = "";
    localStorage.clear();
    showScreen('login-screen');
}

function goHome() { showScreen('dashboard-screen'); }

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

async function showExamList(lang) {
    currentLang = lang;
    document.getElementById('list-title').textContent = "Danh sách bộ đề Tiếng " + lang;
    let container = document.getElementById('exam-list-container');
    container.innerHTML = "Đang tải..."; 

    try {
        let res = await fetch(`${API_URL}/exams/${lang}?user_id=${userId}`);
        let data = await res.json();
        container.innerHTML = ""; 
        if (!data.data || data.data.length === 0) {
            container.innerHTML = `<p class="italic">Chưa có bộ đề nào.</p>`;
        } else {
            data.data.forEach(exam => {
                let div = document.createElement('div');
                div.className = "bg-white p-4 rounded-lg shadow border-l-4 border-blue-500 flex justify-between items-center";
                
                let shareBadge = exam.is_shared ? `<span class="bg-green-100 text-green-800 text-xs px-2 rounded ml-2">Cộng đồng</span>` : '';
                let deleteBtn = exam.is_mine ? `<button onclick="deleteExam(${exam.id})" class="bg-red-500 text-white py-1 px-3 rounded hover:bg-red-600 font-bold">Xóa</button>` : '';

                div.innerHTML = `
                    <div>
                        <h3 class="font-bold text-lg inline-block">${exam.name}</h3> ${shareBadge}
                    </div>
                    <div class="flex gap-2">
                        <button onclick="startExam(${exam.id}, '${exam.name}')" class="bg-blue-500 text-white py-1 px-4 rounded font-bold hover:bg-blue-600">Làm Bài</button>
                        <button onclick="openLeaderboard(${exam.id}, '${exam.name}')" class="bg-yellow-500 text-white py-1 px-3 rounded font-bold hover:bg-yellow-600">🏆 Hạng</button>
                        ${deleteBtn}
                    </div>
                `;
                container.appendChild(div);
            });
        }
        showScreen('exam-list-screen');
    } catch (e) { alert("Lỗi!"); }
}

async function deleteExam(examId) {
    if(!confirm("Xóa nhé?")) return;
    try {
        let res = await fetch(`${API_URL}/exam/${examId}`, { method: 'DELETE' });
        let data = await res.json();
        if (data.status === "success") showExamList(currentLang);
    } catch (e) {}
}

async function startExam(examId, examName) {
    currentExamId = examId;
    document.getElementById('exam-title').textContent = examName;
    
    // Reset lại trạng thái tick
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

// Hàm BẬT/TẮT Cột
function toggleColumns() {
    hideTuGoc = document.getElementById('toggle-tugoc').checked;
    hidePhienAm = document.getElementById('toggle-phienam').checked;
    hideNghia = document.getElementById('toggle-nghia').checked;
    renderTable(currentData); 
}

function renderTable(data) {
    let tbody = document.getElementById('exam-body');
    tbody.innerHTML = "";
    data.forEach((item, index) => {
        let tr = document.createElement('tr');
        
        let t_tugoc = hideTuGoc ? "***" : item.tu_goc;
        let t_phienam = hidePhienAm ? "***" : (item.phien_am || '');
        let t_nghia = hideNghia ? "***" : item.nghia;
        
        // Cấp màu ĐỘC LẬP cho từng cột
        let c_tugoc = hideTuGoc ? "text-gray-400 font-normal" : "text-black font-bold";
        let c_phienam = hidePhienAm ? "text-gray-400" : "text-black";
        let c_nghia = hideNghia ? "text-gray-400" : "text-black";

        // TỰ ĐỘNG NHẬN DIỆN TIẾNG TRUNG: Ép font Kaiti và tăng size chữ cho dễ nhìn nét
        let isTrung = (currentLang === 'Trung');
        let fontTuGoc = isTrung ? "font-family: 'KaiTi', 'STKaiti', serif; font-size: 1.5rem;" : "";
        let fontInput = isTrung ? "font-family: 'KaiTi', 'STKaiti', serif; font-size: 1.25rem;" : "";

        tr.innerHTML = `
            <td class="border border-gray-400 p-2 text-center ${c_tugoc}" id="tu-goc-${index}" style="${fontTuGoc}">${t_tugoc}</td>
            <td class="border border-gray-400 p-2 text-center ${c_phienam}">${t_phienam}</td>
            <td class="border border-gray-400 p-2 text-left ${c_nghia}">${t_nghia}</td>
            <td class="border border-gray-400 p-0">
                <input type="text" data-word="${item.tu_goc}" data-index="${index}" onkeypress="handleEnter(event, this)" 
                       class="word-input w-full h-full p-2 text-center font-bold focus:outline-none focus:bg-blue-50" style="${fontInput}">
            </td>
            <td class="border border-gray-400 p-2 text-center font-bold" id="check-${index}"></td>
        `;
        tbody.appendChild(tr);
    });
}

function handleEnter(event, input) {
    if (event.key === "Enter") {
        let tuGoc = input.getAttribute('data-word');
        let index = input.getAttribute('data-index');
        let tuNhap = input.value.trim();
        
        input.readOnly = true; input.classList.add('bg-gray-100');

        let checkCell = document.getElementById(`check-${index}`);
        let tuGocCell = document.getElementById(`tu-goc-${index}`);
        
        // Hiện lại từ gốc luôn
        tuGocCell.textContent = tuGoc;
        tuGocCell.classList.remove('text-gray-400');
        tuGocCell.classList.add('text-black');

        if (tuNhap.toLowerCase() === tuGoc.toLowerCase()) {
            checkCell.textContent = "QUÁ GIỎI";
            checkCell.className = "border border-gray-400 p-2 text-center font-bold text-green-600 bg-green-50";
        } else {
            checkCell.textContent = "SAI RỒI";
            checkCell.className = "border border-gray-400 p-2 text-center font-bold text-red-600 bg-red-50";
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
        if (!input.readOnly && input.value.trim() !== "") handleEnter({ key: "Enter" }, input);
        else if (!input.readOnly && input.value.trim() === "") {
             let index = input.getAttribute('data-index');
             let checkCell = document.getElementById(`check-${index}`);
             checkCell.textContent = "FALSE";
             checkCell.className = "border border-gray-400 p-2 text-center font-bold text-red-600 bg-red-100";
             
             let tuGocCell = document.getElementById(`tu-goc-${index}`);
             tuGocCell.textContent = input.getAttribute('data-word');
             tuGocCell.classList.remove('text-gray-400'); tuGocCell.classList.add('text-black');
             
             input.readOnly = true; input.classList.add('bg-gray-100');
        }
    });

    inputs.forEach(input => {
        let checkCell = document.getElementById(`check-${input.getAttribute('data-index')}`);
        if (checkCell && checkCell.textContent === "TRUE") correctCount++;
    });

    let ptram = Math.round((correctCount / inputs.length) * 100);
    document.getElementById('score-display').textContent = ptram;

    // Lưu điểm
    fetch(`${API_URL}/save_result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, exam_id: currentExamId, score: ptram })
    });

    let msg = document.getElementById('result-message');
    if (ptram === 100) {
        msg.innerHTML = "🎉 Tuyệt hảo! Đúng 100% không trượt phát nào!";
        msg.className = "text-lg font-bold mb-8 text-green-600";
    } else {
        msg.innerHTML = `Bạn làm đúng ${ptram}%. Cố lên nhé!`;
        msg.className = "text-lg font-bold mb-8 text-red-600";
    }

    showScreen('result-screen');
}

function retryExam() {
    // Trộn lại mảng hiện tại để học
    currentData = [...currentData].sort(() => Math.random() - 0.5);
    renderTable(currentData);
    showScreen('exam-screen');
}

// --- API BẢNG XẾP HẠNG ---
async function openLeaderboard(examId, examName) {
    document.getElementById('lb-exam-name').textContent = examName;
    document.getElementById('lb-body').innerHTML = `<tr><td colspan="3" class="text-center p-4">Đang lấy dữ liệu...</td></tr>`;
    document.getElementById('leaderboard-modal').classList.remove('hidden');

    try {
        let res = await fetch(`${API_URL}/leaderboard/${examId}`);
        let data = await res.json();
        let tbody = document.getElementById('lb-body');
        tbody.innerHTML = "";

        if(data.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-gray-500">Chưa có ai thi bộ này!</td></tr>`;
            return;
        }

        data.data.forEach((row, index) => {
            let rankIcon = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : `#${index+1}`));
            let tr = document.createElement('tr');
            tr.className = "border-b hover:bg-yellow-50";
            tr.innerHTML = `
                <td class="p-2 font-bold text-xl">${rankIcon}</td>
                <td class="p-2 font-bold ${row.username === username ? 'text-blue-600' : ''}">${row.username} ${row.username === username ? '(Bạn)' : ''}</td>
                <td class="p-2 text-right font-black text-green-600">${row.score}%</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        document.getElementById('lb-body').innerHTML = `<tr><td colspan="3" class="text-center p-4 text-red-500">Lỗi lấy xếp hạng!</td></tr>`;
    }
}

function closeLeaderboard() {
    document.getElementById('leaderboard-modal').classList.add('hidden');
}
