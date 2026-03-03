// 1. CẤU HÌNH ĐƯỜNG DẪN API (Tự động nhận diện local hoặc online)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
                ? "http://localhost:5000/api" 
                : "https://ten-app-cua-ban.onrender.com/api"; // <-- Thay link Render của bạn vào đây

let currentData = [];
let currentLang = ""; 
let isFocusMode = false;

// SỬ DỤNG LOCALSTORAGE ĐỂ GIỮ ĐĂNG NHẬP
let userId = localStorage.getItem('vocab_user_id') || null; 
let username = localStorage.getItem('vocab_username') || "";
let pendingUploadFile = null;
let currentExamId = null; 

// Biến lưu trạng thái chia sẻ (mặc định là false - Không chia sẻ)
let isSharedOption = false;

// --- ĐIỀU HƯỚNG MÀN HÌNH ---
function showScreen(screenId) {
    let screens = ['login-screen', 'dashboard-screen', 'exam-list-screen', 'exam-screen', 'result-screen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// Kiểm tra trạng thái đăng nhập khi tải lại trang
window.onload = function() {
    if (userId) {
        document.getElementById('display-name').textContent = username;
        showScreen('dashboard-screen');
    }
};

// --- API: ĐĂNG KÝ VÀ ĐĂNG NHẬP ---

// Hàm Đăng ký
async function register() {
    let user = document.getElementById('username').value.trim();
    let pass = document.getElementById('password').value.trim();
    
    if(!user || !pass) { alert("Phải nhập đủ tên đăng nhập và mật khẩu chứ bạn!"); return; }

    try {
        let response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        let data = await response.json();
        alert(data.message);
    } catch (error) {
        alert("Lỗi kết nối Server!");
        console.error(error);
    }
}

// Hàm Đăng nhập
async function login() {
    let user = document.getElementById('username').value.trim();
    let pass = document.getElementById('password').value.trim();
    
    if(!user || !pass) { alert("Phải nhập đủ tên đăng nhập và mật khẩu chứ bạn!"); return; }

    try {
        let response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        let data = await response.json();
        
        if (data.status === "success") {
            userId = data.user_id;
            username = user;
            
            // Lưu vào LocalStorage
            localStorage.setItem('vocab_user_id', userId);
            localStorage.setItem('vocab_username', username);

            document.getElementById('display-name').textContent = username;
            showScreen('dashboard-screen');
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (error) {
        alert("Lỗi kết nối Server! Bạn nhớ bật file app.py lên chưa?");
        console.error(error);
    }
}

function logout() {
    userId = null;
    username = "";
    localStorage.removeItem('vocab_user_id');
    localStorage.removeItem('vocab_username');
    document.getElementById('username').value = "";
    document.getElementById('password').value = "";
    showScreen('login-screen');
}

function goHome() {
    showScreen('dashboard-screen');
}

// --- LOGIC XỬ LÝ UP FILE & NÚT CHIA SẺ ---

// Hàm đổi màu 2 nút chia sẻ (Dùng class Tailwind)
function selectShareOption(isShared) {
    isSharedOption = isShared;
    
    let btnShare = document.getElementById('btn-share');
    let btnPrivate = document.getElementById('btn-private');

    if (isShared) {
        btnShare.classList.add('bg-green-500', 'text-white', 'border-green-600');
        btnShare.classList.remove('bg-gray-200', 'text-gray-700', 'border-gray-300');
        
        btnPrivate.classList.remove('bg-green-500', 'text-white', 'border-green-600');
        btnPrivate.classList.add('bg-gray-200', 'text-gray-700', 'border-gray-300');
    } else {
        btnPrivate.classList.add('bg-green-500', 'text-white', 'border-green-600');
        btnPrivate.classList.remove('bg-gray-200', 'text-gray-700', 'border-gray-300');
        
        btnShare.classList.remove('bg-green-500', 'text-white', 'border-green-600');
        btnShare.classList.add('bg-gray-200', 'text-gray-700', 'border-gray-300');
    }
}

function handleFileUpload(event) {
    let file = event.target.files[0];
    if(!file) return;

    pendingUploadFile = file;
    let defaultName = file.name.split('.')[0]; 
    document.getElementById('upload-exam-name').value = defaultName;
    
    // Reset về mặc định là KHÔNG chia sẻ mỗi khi mở modal
    selectShareOption(false);
    document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    document.getElementById('file-upload').value = ''; 
    pendingUploadFile = null;
}

// --- API: TẢI FILE EXCEL LÊN DATABASE ---
async function confirmUpload(lang) {
    if (!pendingUploadFile) return;

    let examName = document.getElementById('upload-exam-name').value.trim();
    if (!examName) examName = "Bộ đề " + pendingUploadFile.name;

    let formData = new FormData();
    formData.append('file', pendingUploadFile);
    formData.append('exam_name', examName);
    formData.append('lang', lang);
    formData.append('user_id', userId);
    formData.append('is_shared', isSharedOption);

    try {
        let response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        let data = await response.json();
        
        if (data.status === "success") {
            alert(`🎉 ${data.message}`);
            
            // Đóng Modal mà không làm tải lại trang
            closeUploadModal();
            
            // Giữ lại màn hình danh sách nếu đang ở đó
            if (userId) {
                if(currentLang === lang) {
                   showExamList(lang);
                } else {
                   showScreen('dashboard-screen');
                }
            }
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (error) {
        alert("Có lỗi xảy ra khi tải file lên!");
        console.error(error);
    }
}

// --- API: LẤY DANH SÁCH BỘ ĐỀ ---
async function showExamList(lang) {
    currentLang = lang;
    document.getElementById('list-title').textContent = "Danh sách bộ đề Tiếng " + lang;
    
    let container = document.getElementById('exam-list-container');
    container.innerHTML = "<p class='text-center text-gray-500'>Đang tải dữ liệu...</p>"; 

    try {
        let response = await fetch(`${API_URL}/exams/${lang}?user_id=${userId}`);
        let data = await response.json();
        
        container.innerHTML = ""; 
        let examList = data.data; 
        
        if (!examList || examList.length === 0) {
            container.innerHTML = `<p class="text-gray-500 italic">Chưa có bộ đề nào. Bạn ra ngoài tải file Excel lên nhé!</p>`;
        } else {
            examList.forEach(exam => {
                let div = document.createElement('div');
                div.className = "bg-white p-4 rounded-lg shadow border-l-4 border-blue-500 flex justify-between items-center";
                
                let shareBadge = exam.is_shared ? `<span class="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded ml-2">Cộng đồng</span>` : '';
                
                let deleteBtnHtml = exam.is_mine ? `
                    <button onclick="deleteExam(${exam.id})" class="bg-red-500 text-white font-bold py-2 px-4 rounded hover:bg-red-600 transition text-sm">
                        Xóa
                    </button>
                ` : '';

                div.innerHTML = `
                    <div>
                        <h3 class="font-bold text-lg inline-block">${exam.name}</h3> ${shareBadge}
                        <p class="text-xs text-gray-500">${exam.word_count || 0} từ vựng</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="startExam(${exam.id}, '${exam.name}')" class="bg-blue-500 text-white font-bold py-2 px-6 rounded hover:bg-blue-600 transition text-sm">
                            Vào Học
                        </button>
                        ${deleteBtnHtml}
                    </div>
                `;
                container.appendChild(div);
            });
        }
        showScreen('exam-list-screen');
    } catch (error) {
        alert("Lỗi khi lấy danh sách đề!");
        console.error(error);
    }
}

// --- API: XÓA BỘ ĐỀ ---
async function deleteExam(examId) {
    if(!confirm("Bạn có chắc chắn muốn xóa bộ đề này không?")) return;
    
    try {
        let response = await fetch(`${API_URL}/exam/${examId}`, {
            method: 'DELETE'
        });
        let data = await response.json();
        if (data.status === "success") {
            alert("✅ Đã xóa bộ đề thành công!");
            showExamList(currentLang);
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (error) {
        alert("Lỗi khi kết nối tới server!");
    }
}

// --- API: LẤY CHI TIẾT TỪ VỰNG TRONG ĐỀ ---
async function startExam(examId, examName) {
    currentExamId = examId;
    document.getElementById('exam-title').textContent = examName;
    document.getElementById('col-lang').textContent = "TIẾNG " + currentLang;
    
    isFocusMode = false;
    document.getElementById('exam-mode').textContent = "Chế độ Thường";
    document.getElementById('exam-mode').className = "bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-1 rounded";
    
    try {
        let response = await fetch(`${API_URL}/exam/${examId}`);
        let data = await response.json();
        currentData = data.data; 
        
        if (!currentData || currentData.length === 0) {
            alert("Bộ đề này chưa có từ vựng nào!");
            return;
        }

        renderTable(currentData);
        showScreen('exam-screen');
    } catch (error) {
        alert("Lỗi khi tải chi tiết bộ đề!");
    }
}

function renderTable(data) {
    let tbody = document.getElementById('exam-body');
    tbody.innerHTML = "";
    data.forEach((item, index) => {
        let tr = document.createElement('tr');
        
        let displayTuGoc = isFocusMode ? "***" : item.tu_goc; 
        let displayPhienAm = isFocusMode ? "***" : (item.phien_am || '');
        let colorClass = isFocusMode ? "text-gray-400" : "text-black";

        tr.innerHTML = `
            <td class="border border-gray-400 p-2 text-center font-bold ${colorClass}" id="tu-goc-${index}">${displayTuGoc}</td>
            <td class="border border-gray-400 p-2 text-center">${displayPhienAm}</td>
            <td class="border border-gray-400 p-2 text-left">${item.nghia}</td>
            <td class="border border-gray-400 p-0">
                <input type="text" data-word="${item.tu_goc}" data-index="${index}" onkeypress="handleEnter(event, this)" 
                       class="word-input w-full h-full p-2 text-center focus:outline-none focus:bg-blue-50" 
                       placeholder="">
            </td>
            <td class="border border-gray-400 p-2 text-center font-bold" id="check-${index}"></td>
        `;
        tbody.appendChild(tr);
    });
}

function handleEnter(event, inputElement) {
    if (event.key === "Enter") {
        let tuGoc = inputElement.getAttribute('data-word');
        let index = inputElement.getAttribute('data-index');
        let tuNhap = inputElement.value.trim();
        
        inputElement.readOnly = true;
        inputElement.classList.add('bg-gray-100');

        let checkCell = document.getElementById(`check-${index}`);
        let tuGocCell = document.getElementById(`tu-goc-${index}`);

        tuGocCell.textContent = tuGoc;
        tuGocCell.classList.remove('text-gray-400');
        tuGocCell.classList.add('text-black');

        if (tuNhap.toLowerCase() === tuGoc.toLowerCase()) {
            checkCell.textContent = "TRUE";
            checkCell.className = "border border-gray-400 p-2 text-center font-bold text-green-600 bg-green-50";
        } else {
            checkCell.textContent = "FALSE";
            checkCell.className = "border border-gray-400 p-2 text-center font-bold text-red-600 bg-red-50";
        }
        
        let allInputs = Array.from(document.querySelectorAll('.word-input'));
        let currentIndex = allInputs.indexOf(inputElement);
        if(currentIndex < allInputs.length - 1) {
            allInputs[currentIndex + 1].focus();
        }
    }
}

// --- API: NỘP BÀI VÀ LƯU ĐIỂM ---
function submitExam() {
    let inputs = document.querySelectorAll('.word-input');
    
    inputs.forEach(input => {
        // Tự động cho các ô chưa nhập là FALSE
        if (!input.readOnly && input.value.trim() !== "") {
            handleEnter({ key: "Enter" }, input);
        } else if (!input.readOnly && input.value.trim() === "") {
             let index = input.getAttribute('data-index');
             let checkCell = document.getElementById(`check-${index}`);
             checkCell.textContent = "FALSE";
             checkCell.className = "border border-gray-400 p-2 text-center font-bold text-red-600 bg-red-100";
             
             // Hiện lại từ gốc
             let tuGocCell = document.getElementById(`tu-goc-${index}`);
             tuGocCell.textContent = input.getAttribute('data-word');
             tuGocCell.classList.remove('text-gray-400');
             tuGocCell.classList.add('text-black');
             
             input.readOnly = true;
             input.classList.add('bg-gray-100');
        }
    });

    let correctCount = 0;
    let total = inputs.length;

    inputs.forEach(input => {
        let index = input.getAttribute('data-index');
        let checkCell = document.getElementById(`check-${index}`);
        if (checkCell && checkCell.textContent === "TRUE") {
            correctCount++;
        }
    });

    let ptram = Math.round((correctCount / total) * 100);
    document.getElementById('score-display').textContent = ptram;

    // Lưu điểm qua API
    fetch(`${API_URL}/save_result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, exam_id: currentExamId, score: ptram })
    }).catch(err => console.error("Lỗi khi lưu điểm: ", err));

    let btnFocus = document.getElementById('btn-focus');
    let msg = document.getElementById('result-message');
    
    if (ptram === 100) {
        msg.innerHTML = "🎉 Quá dữ! Đúng 100%. Đã mở khóa vòng Trọng Tâm!";
        msg.className = "text-lg font-bold mb-8 text-green-600";
        btnFocus.disabled = false;
        btnFocus.className = "bg-purple-600 text-white font-bold py-3 rounded hover:bg-purple-700 w-full";
    } else {
        msg.innerHTML = `Bạn đúng ${ptram}%. Phải 100% mới được qua vòng Trọng Tâm nhé!`;
        msg.className = "text-lg font-bold mb-8 text-red-600";
        btnFocus.disabled = true;
        btnFocus.className = "bg-gray-300 text-gray-500 font-bold py-3 rounded w-full cursor-not-allowed";
    }

    showScreen('result-screen');
}

function retryExam() {
    renderTable(currentData);
    showScreen('exam-screen');
}

function startFocusMode() {
    isFocusMode = true;
    document.getElementById('exam-mode').textContent = "Chế độ TRỌNG TÂM 🔥";
    document.getElementById('exam-mode').className = "bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded shadow";
    
    let shuffledData = [...currentData].sort(() => Math.random() - 0.5);
    renderTable(shuffledData);
    showScreen('exam-screen');
}