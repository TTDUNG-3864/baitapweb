from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import pandas as pd
import os
import io
import time
from supabase import create_client, Client

app = Flask(__name__)
CORS(app) 

# ================= CẤU HÌNH SUPABASE =================
# Dán URL và chuỗi khóa anon/public của ông vào đây nhé:
SUPABASE_URL = "https://lqjemrfjvcwvsfotvefx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxamVtcmZqdmN3dnNmb3R2ZWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ5NzAsImV4cCI6MjA4ODMwMDk3MH0.piEM1tX0vJeB61snHFliGfwkwV8N-0BnRYl1tyMGLgA"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
BUCKET_NAME = "excel_files" # Tên kho ông vừa tạo

# ================= CẤU HÌNH DATABASE SQLITE =================
DB_FILE = 'data.db'

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Cột drive_file_id giờ mình dùng để lưu Tên File trên Supabase Storage
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bo_tu_vung (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ten_bo TEXT NOT NULL,
        ngon_ngu TEXT NOT NULL,
        nguoi_tao_id INTEGER,
        is_shared INTEGER DEFAULT 0,
        drive_file_id TEXT NOT NULL, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (nguoi_tao_id) REFERENCES users(id)
    )
    """)
    
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

    try:
        cursor.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
                       ('admin_dung', 'admin123', 'admin'))
    except sqlite3.IntegrityError:
        pass
    
    conn.commit()
    conn.close()
    print("✅ Database SQLite & Supabase Storage đã sẵn sàng!")

# ================= CÁC API XỬ LÝ =================

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (data.get('username'), data.get('password')))
        conn.commit()
        return jsonify({"status": "success", "message": "Đăng ký thành công!"})
    except sqlite3.IntegrityError:
        return jsonify({"status": "error", "message": "Tên tài khoản đã tồn tại!"}), 400
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ? AND password = ?", (data.get('username'), data.get('password'))).fetchone()
    conn.close()
    if user:
        return jsonify({"status": "success", "user_id": user['id'], "username": user['username']})
    return jsonify({"status": "error", "message": "Sai tài khoản hoặc mật khẩu!"}), 401

# --- UPLOAD FILE LÊN SUPABASE ---
@app.route('/api/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    exam_name = request.form.get('exam_name')
    lang = request.form.get('lang')
    user_id = request.form.get('user_id')
    is_shared = 1 if request.form.get('is_shared') == 'true' else 0
    
    if not file or file.filename == '':
        return jsonify({"status": "error", "message": "Chưa chọn file"}), 400

    try:
        # Tạo tên file độc nhất tránh trùng lặp
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{int(time.time())}_{user_id}{file_ext}"
        
        # Đọc dữ liệu file
        file_bytes = file.read()
        
        # Đẩy thẳng byte lên Supabase Storage
        res = supabase.storage.from_(BUCKET_NAME).upload(
            file=file_bytes,
            path=unique_filename,
            file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
        )
        
        # Lưu vào SQLite (Cột drive_file_id giờ chứa unique_filename)
        conn = get_db_connection()
        conn.execute("INSERT INTO bo_tu_vung (ten_bo, ngon_ngu, nguoi_tao_id, is_shared, drive_file_id) VALUES (?, ?, ?, ?, ?)", 
                     (exam_name, lang.upper(), user_id, is_shared, unique_filename))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Đã lưu bộ đề lên Cloud thành công!"})
    except Exception as e:
        print(f"❌ LỖI UPLOAD SUPABASE: {str(e)}")
        return jsonify({"status": "error", "message": "Lỗi lưu file, xem Terminal!"}), 500

@app.route('/api/exams/<lang>', methods=['GET'])
def get_exams(lang):
    user_id = request.args.get('user_id')
    conn = get_db_connection()
    query = """
        SELECT id, ten_bo, nguoi_tao_id, is_shared, drive_file_id 
        FROM bo_tu_vung 
        WHERE UPPER(ngon_ngu) = ? AND (nguoi_tao_id = ? OR is_shared = 1)
    """
    rows = conn.execute(query, (lang.upper(), user_id)).fetchall()
    
    exams = []
    for r in rows:
        exams.append({
            "id": r['id'], 
            "name": r['ten_bo'], 
            "is_mine": str(r['nguoi_tao_id']) == str(user_id), 
            "is_shared": bool(r['is_shared']),
            "drive_file_id": r['drive_file_id']
        })
    conn.close()
    return jsonify({"status": "success", "data": exams})

# --- LẤY FILE TỪ SUPABASE VÀ ĐỌC ---
@app.route('/api/exam/<int:exam_id>', methods=['GET'])
def get_exam_details(exam_id):
    try:
        conn = get_db_connection()
        exam_row = conn.execute("SELECT drive_file_id FROM bo_tu_vung WHERE id = ?", (exam_id,)).fetchone()
        conn.close()
        
        if not exam_row:
            return jsonify({"status": "error", "message": "Không tìm thấy bộ đề trong DB"}), 404
            
        file_path = exam_row['drive_file_id']

        # Tải thẳng dữ liệu file từ Supabase Storage về dạng byte
        res = supabase.storage.from_(BUCKET_NAME).download(file_path)
        
        fh = io.BytesIO(res)
        df = pd.read_excel(fh).fillna("")
        
        words = []
        for index, row in df.iterrows():
             tu_goc = str(row.iloc[0]).strip()
             if tu_goc:
                 words.append({
                     "id": index, 
                     "tu_goc": tu_goc, 
                     "phien_am": str(row.iloc[1]) if len(row) > 1 else "", 
                     "nghia": str(row.iloc[2]) if len(row) > 2 else ""
                 })
                 
        return jsonify({"status": "success", "data": words})
    except Exception as e:
        print(f"❌ LỖI TẢI FILE SUPABASE: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# --- XÓA FILE TRÊN SUPABASE VÀ XÓA DB ---
@app.route('/api/exam/<int:exam_id>', methods=['DELETE'])
def delete_exam(exam_id):
    conn = get_db_connection()
    try:
        exam_row = conn.execute("SELECT drive_file_id FROM bo_tu_vung WHERE id = ?", (exam_id,)).fetchone()
        if exam_row and exam_row['drive_file_id']:
            try:
                # Xóa file trong kho Supabase
                supabase.storage.from_(BUCKET_NAME).remove([exam_row['drive_file_id']])
            except Exception as e:
                print("Lỗi xóa file Cloud (có thể file đã bị xóa trước đó):", e)
        
        conn.execute("DELETE FROM bo_tu_vung WHERE id = ?", (exam_id,))
        conn.execute("DELETE FROM lich_su_hoc WHERE bo_id = ?", (exam_id,))
        conn.commit()
        return jsonify({"status": "success", "message": "Đã xóa bộ đề sạch sẽ!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/save_result', methods=['POST'])
def save_result():
    data = request.json
    conn = get_db_connection()
    conn.execute("INSERT INTO lich_su_hoc (user_id, bo_id, diem_so) VALUES (?, ?, ?)", 
                 (data.get('user_id'), data.get('exam_id'), float(data.get('score'))))
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": "Đã lưu điểm thành công!"})

if __name__ == '__main__':
    init_db()
    # Mở cổng (Port) chuẩn cho Render
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)


