from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import os

app = Flask(__name__)
CORS(app) 

# THÔNG TIN KẾT NỐI SUPABASE CỦA BẠN
# Lưu ý: Mình dùng cổng 5432 chuẩn, nếu vẫn báo Network Unreachable, 
# hãy kiểm tra lại mật khẩu TTDUNG2006!! trên Supabase.
DB_URL = "postgresql://postgres:TTDUNG2006!!@db.apsbtgpnihsxsfuuvbor.supabase.co:5432/postgres"

def get_db_connection():
    try:
        # Thiết lập kết nối với timeout để tránh treo server
        conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor, connect_timeout=10)
        return conn
    except Exception as e:
        print(f"❌ Lỗi kết nối Supabase: {e}")
        return None

# ==========================================
# PHỤC VỤ GIAO DIỆN & PING (Sửa lỗi 404)
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
# KHỞI TẠO DATABASE
# ==========================================
def init_db():
    conn = get_db_connection()
    if not conn: 
        print("⚠️ Server khởi động nhưng chưa kết nối được DB. Vui lòng kiểm tra Logs!")
        return
    cursor = conn.cursor()
    # Khởi tạo các bảng theo chuẩn PostgreSQL
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(100) NOT NULL,
            role VARCHAR(20) DEFAULT 'user'
        );
        CREATE TABLE IF NOT EXISTS bo_tu_vung (
            id SERIAL PRIMARY KEY,
            ten_bo TEXT NOT NULL,
            ngon_ngu TEXT NOT NULL,
            nguoi_tao_id INTEGER,
            is_shared INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tu_vung (
            id SERIAL PRIMARY KEY,
            bo_id INTEGER NOT NULL,
            tu_goc TEXT NOT NULL,
            phien_am TEXT,
            nghia TEXT NOT NULL,
            FOREIGN KEY (bo_id) REFERENCES bo_tu_vung(id) ON DELETE CASCADE
        );
    """)
    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Đã kết nối và đồng bộ hóa bảng dữ liệu trên Supabase!")

# ==========================================
# CÁC API HỆ THỐNG
# ==========================================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "message": "Kết nối DB thất bại!"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (username, password) VALUES (%s, %s)", 
                       (data['username'], data['password']))
        conn.commit()
        return jsonify({"status": "success", "message": "Đăng ký thành công!"})
    except Exception as e:
        return jsonify({"status": "error", "message": "Tài khoản đã tồn tại!"}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "message": "Kết nối DB thất bại!"}), 500
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s AND password = %s", 
                   (data['username'], data['password']))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if user:
        return jsonify({
            "status": "success", 
            "user_id": user['id'], 
            "username": user['username']
        })
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
    if not conn: return jsonify({"status": "error", "data": []}), 500
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
        if not conn: return jsonify({"status": "error", "message": "DB Connection Error"}), 500
        cursor = conn.cursor()
        # Chèn bộ đề và lấy ID trả về
        cursor.execute("INSERT INTO bo_tu_vung (ten_bo, ngon_ngu, nguoi_tao_id, is_shared) VALUES (%s, %s, %s, %s) RETURNING id", 
                       (exam_name, lang.upper(), user_id, is_shared))
        bo_id = cursor.fetchone()['id']
        
        for _, row in df.iterrows():
            tu_goc = str(row.iloc[0]).strip()
            if tu_goc:
                cursor.execute("INSERT INTO tu_vung (bo_id, tu_goc, phien_am, nghia) VALUES (%s, %s, %s, %s)",
                               (bo_id, tu_goc, str(row.iloc[1]), str(row.iloc[2])))
        conn.commit()
        return jsonify({"status": "success", "message": "Upload thành công!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn:
            cursor.close()
            conn.close()

@app.route('/api/exam/<int:exam_id>', methods=['DELETE'])
def delete_exam(exam_id):
    conn = get_db_connection()
    if not conn: return jsonify({"status": "error", "message": "DB Error"}), 500
    cursor = conn.cursor()
    cursor.execute("DELETE FROM bo_tu_vung WHERE id = %s", (exam_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"status": "success", "message": "Đã xóa bộ đề!"})

# ==========================================
# KHỞI CHẠY
# ==========================================
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
