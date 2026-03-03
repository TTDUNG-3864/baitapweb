from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import os

app = Flask(__name__)
CORS(app) 

# CHUỖI KẾT NỐI SUPABASE
DB_URL = "postgresql://postgres:Ttdung2006!!@db.lkwrqouankkfotcufnzt.supabase.co:5432/postgres"

def get_db_connection():
    try:
        # Kết nối PostgreSQL sử dụng thư viện psycopg2
        conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        print("❌ Lỗi kết nối Supabase:", e)
        return None

# ==========================================
# PHỤC VỤ GIAO DIỆN (Sửa lỗi 404 Render)
# ==========================================

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

@app.route('/ping')
def ping():
    return "PONG", 200

# ==========================================
# KHỞI TẠO DATABASE (POSTGRESQL SETUP)
# ==========================================
def init_db():
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    
    # 1. Bảng users (Dùng SERIAL thay cho AUTOINCREMENT)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. Bảng bo_tu_vung
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bo_tu_vung (
        id SERIAL PRIMARY KEY,
        ten_bo TEXT NOT NULL,
        ngon_ngu TEXT NOT NULL,
        nguoi_tao_id INTEGER,
        is_shared INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (nguoi_tao_id) REFERENCES users(id) ON DELETE SET NULL
    )
    """)
    
    # 3. Bảng tu_vung
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tu_vung (
        id SERIAL PRIMARY KEY,
        bo_id INTEGER NOT NULL,
        tu_goc TEXT NOT NULL,
        phien_am TEXT,
        nghia TEXT NOT NULL,
        FOREIGN KEY (bo_id) REFERENCES bo_tu_vung(id) ON DELETE CASCADE
    )
    """)
    
    # 4. Bảng lich_su_hoc
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS lich_su_hoc (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        bo_id INTEGER NOT NULL,
        diem_so REAL NOT NULL,
        ngay_lam TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (bo_id) REFERENCES bo_tu_vung(id) ON DELETE CASCADE
    )
    """)

    # Tạo admin mẫu
    try:
        cursor.execute("INSERT INTO users (username, password, role) VALUES (%s, %s, %s) ON CONFLICT (username) DO NOTHING", 
                       ('admin_dung', 'admin123', 'admin'))
    except:
        pass
    
    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Đã kết nối và đồng bộ hóa với Supabase thành công!")

# ==========================================
# CÁC API XỬ LÝ (Sửa dấu ? thành %s)
# ==========================================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "message": "DB Error"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (username, password) VALUES (%s, %s)", 
                       (data.get('username'), data.get('password')))
        conn.commit()
        return jsonify({"status": "success", "message": "Đăng ký thành công!"})
    except:
        return jsonify({"status": "error", "message": "Tên tài khoản đã tồn tại!"}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "message": "DB Error"}), 500
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s AND password = %s", 
                   (data.get('username'), data.get('password')))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if user:
        return jsonify({"status": "success", "user_id": user['id'], "username": user['username'], "role": user['role']})
    return jsonify({"status": "error", "message": "Sai tài khoản hoặc mật khẩu!"}), 401

@app.route('/api/exams/<lang>', methods=['GET'])
def get_exams(lang):
    user_id = request.args.get('user_id')
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "data": []}), 500
    cursor = conn.cursor()
    query = """
        SELECT b.id, b.ten_bo, b.nguoi_tao_id, b.is_shared, COUNT(t.id) as word_count 
        FROM bo_tu_vung b
        LEFT JOIN tu_vung t ON b.id = t.bo_id
        WHERE UPPER(b.ngon_ngu) = %s AND (b.nguoi_tao_id = %s OR b.is_shared = 1)
        GROUP BY b.id, b.ten_bo, b.nguoi_tao_id, b.is_shared
    """
    cursor.execute(query, (lang.upper(), user_id))
    rows = cursor.fetchall()
    exams = [{"id": r['id'], "name": r['ten_bo'], "is_mine": str(r['nguoi_tao_id']) == str(user_id), 
              "is_shared": bool(r['is_shared']), "word_count": r['word_count']} for r in rows]
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": exams})

@app.route('/api/exam/<int:exam_id>', methods=['GET'])
def get_exam_details(exam_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tu_vung WHERE bo_id = %s", (exam_id,))
    rows = cursor.fetchall()
    words = [{"id": r['id'], "tu_goc": r['tu_goc'], "phien_am": r['phien_am'], "nghia": r['nghia']} for r in rows]
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "data": words})

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
        # PostgreSQL dùng RETURNING id để lấy ID vừa chèn
        cursor.execute("INSERT INTO bo_tu_vung (ten_bo, ngon_ngu, nguoi_tao_id, is_shared) VALUES (%s, %s, %s, %s) RETURNING id", 
                       (exam_name, lang.upper(), user_id, is_shared))
        bo_id = cursor.fetchone()['id']
        
        for _, row in df.iterrows():
            if str(row.iloc[0]).strip():
                cursor.execute("INSERT INTO tu_vung (bo_id, tu_goc, phien_am, nghia) VALUES (%s, %s, %s, %s)",
                               (bo_id, str(row.iloc[0]), str(row.iloc[1]), str(row.iloc[2])))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"status": "success", "message": "Upload lên Supabase thành công!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/exam/<int:exam_id>', methods=['DELETE'])
def delete_exam(exam_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM bo_tu_vung WHERE id = %s", (exam_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Đã xóa bộ đề thành công!"})

@app.route('/api/save_result', methods=['POST'])
def save_result():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO lich_su_hoc (user_id, bo_id, diem_so) VALUES (%s, %s, %s)", 
                   (data.get('user_id'), data.get('exam_id'), float(data.get('score'))))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Đã lưu điểm thành công!"})

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 5000))
    # host 0.0.0.0 là bắt buộc để Render có thể nhận diện service
    app.run(host='0.0.0.0', port=port)
    

