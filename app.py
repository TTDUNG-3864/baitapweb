from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import pandas as pd
import os

app = Flask(__name__)
# Cho phép Frontend kết nối tới Backend
CORS(app) 

# Tên file database (Sẽ tự động tạo file data.db trong thư mục dự án)
DB_URL = "postgresql://postgres:Ttdung2006@@@db.ymruhjgvbebzqofhfeha.supabase.co:5432/postgres"

def get_db_connection():
    try:
        # Sử dụng psycopg2 để kết nối PostgreSQL
        conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        print("Lỗi kết nối Supabase rồi bạn ơi:", e)
        return None

# ==========================================
# PHỤC VỤ FILE GIAO DIỆN (FRONTEND)
# ==========================================

# 1. Khi truy cập link gốc (/) sẽ trả về file index.html
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# 2. Giúp trình duyệt tìm thấy các file script.js, style.css...
@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

# 3. Hàm ping để giữ web luôn thức (Dùng cho cron-job.org)
@app.route('/ping')
def ping():
    return "PONG", 200

# ==========================================
# KHỞI TẠO DATABASE (SQLITE SETUP)
# ==========================================
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Tạo bảng users
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. Tạo bảng bo_tu_vung
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bo_tu_vung (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ten_bo TEXT NOT NULL,
        ngon_ngu TEXT NOT NULL,
        nguoi_tao_id INTEGER,
        is_shared INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (nguoi_tao_id) REFERENCES users(id)
    )
    """)
    
    # 3. Tạo bảng tu_vung
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tu_vung (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bo_id INTEGER NOT NULL,
        tu_goc TEXT NOT NULL,
        phien_am TEXT,
        nghia TEXT NOT NULL,
        FOREIGN KEY (bo_id) REFERENCES bo_tu_vung(id) ON DELETE CASCADE
    )
    """)
    
    # 4. Tạo bảng lich_su_hoc
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS lich_su_hoc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bo_id INTEGER NOT NULL,
        diem_so REAL NOT NULL,
        ngay_lam DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (bo_id) REFERENCES bo_tu_vung(id)
    )
    """)

    # Tự động tạo tài khoản admin mẫu nếu chưa có
    try:
        cursor.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
                       ('admin_dung', 'admin123', 'admin'))
    except sqlite3.IntegrityError:
        pass
    
    conn.commit()
    conn.close()
    print("✅ Database SQLite đã sẵn sàng (File: data.db)")

# ==========================================
# CÁC API XỬ LÝ (ENDPOINTS)
# ==========================================

# API Đăng ký
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
        conn.commit()
        return jsonify({"status": "success", "message": "Chúc mừng bạn đã đăng ký thành công!"})
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "Tên tài khoản này đã tồn tại rồi bạn ơi!"}), 400
    finally:
        conn.close()

# API Đăng nhập
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password)).fetchone()
    conn.close()
    
    if user:
        return jsonify({
            "status": "success", 
            "user_id": user['id'], 
            "username": user['username'], 
            "role": user['role']
        })
    return jsonify({"status": "error", "message": "Sai tài khoản hoặc mật khẩu rồi!"}), 401

# API Lấy danh sách bộ đề
@app.route('/api/exams/<lang>', methods=['GET'])
def get_exams(lang):
    user_id = request.args.get('user_id')
    conn = get_db_connection()
    
    query = """
        SELECT b.id, b.ten_bo, b.nguoi_tao_id, b.is_shared, COUNT(t.id) as word_count 
        FROM bo_tu_vung b
        LEFT JOIN tu_vung t ON b.id = t.bo_id
        WHERE UPPER(b.ngon_ngu) = ? AND (b.nguoi_tao_id = ? OR b.is_shared = 1)
        GROUP BY b.id
    """
    rows = conn.execute(query, (lang.upper(), user_id)).fetchall()
    
    exams = []
    for r in rows:
        exams.append({
            "id": r['id'], 
            "name": r['ten_bo'], 
            "is_mine": str(r['nguoi_tao_id']) == str(user_id), 
            "is_shared": bool(r['is_shared']), 
            "word_count": r['word_count']
        })
    conn.close()
    return jsonify({"status": "success", "data": exams})

# API Lấy chi tiết từ vựng
@app.route('/api/exam/<int:exam_id>', methods=['GET'])
def get_exam_details(exam_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM tu_vung WHERE bo_id = ?", (exam_id,)).fetchall()
    words = [{"id": r['id'], "tu_goc": r['tu_goc'], "phien_am": r['phien_am'], "nghia": r['nghia']} for r in rows]
    conn.close()
    return jsonify({"status": "success", "data": words})

# API Upload file Excel
@app.route('/api/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    exam_name = request.form.get('exam_name')
    lang = request.form.get('lang')
    user_id = request.form.get('user_id')
    is_shared = 1 if request.form.get('is_shared') == 'true' else 0
    
    try:
        df = pd.read_excel(file).fillna("")
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("INSERT INTO bo_tu_vung (ten_bo, ngon_ngu, nguoi_tao_id, is_shared) VALUES (?, ?, ?, ?)", 
                       (exam_name, lang.upper(), user_id, is_shared))
        bo_id = cursor.lastrowid
        
        for _, row in df.iterrows():
            tu_goc = str(row.iloc[0]).strip()
            if tu_goc:
                cursor.execute("INSERT INTO tu_vung (bo_id, tu_goc, phien_am, nghia) VALUES (?, ?, ?, ?)",
                               (bo_id, tu_goc, str(row.iloc[1]), str(row.iloc[2])))
        
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Bạn đã upload bộ đề thành công!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# API Xóa bộ đề
@app.route('/api/exam/<int:exam_id>', methods=['DELETE'])
def delete_exam(exam_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM bo_tu_vung WHERE id = ?", (exam_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Đã xóa bộ đề thành công!"})

# API Lưu kết quả học
@app.route('/api/save_result', methods=['POST'])
def save_result():
    data = request.json
    user_id = data.get('user_id')
    bo_id = data.get('exam_id')
    score = data.get('score')
    
    conn = get_db_connection()
    conn.execute("INSERT INTO lich_su_hoc (user_id, bo_id, diem_so) VALUES (?, ?, ?)", 
                 (user_id, bo_id, float(score)))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Đã lưu điểm thành công!"})

# ==========================================
# KHỞI CHẠY SERVER
# ==========================================
if __name__ == '__main__':
    # Khởi tạo database trước khi chạy app
    init_db()
    
    # Render cung cấp biến PORT, chạy local thì mặc định là 5000
    port = int(os.environ.get("PORT", 5000))
    
    print(f"🚀 Server đang chạy tại cổng {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)

