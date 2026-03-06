from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
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
BUCKET_NAME = "excel_files" # Tên kho lưu file Excel

# Đã BỎ HOÀN TOÀN SQLite (data.db). Tất cả dữ liệu giờ lưu thẳng lên Supabase!

# ================= CÁC API XỬ LÝ =================

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

# --- ĐĂNG KÝ ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    try:
        # Kiểm tra user đã tồn tại chưa
        existing = supabase.table('users').select('id').eq('username', data.get('username')).execute()
        if len(existing.data) > 0:
            return jsonify({"status": "error", "message": "Tên tài khoản đã tồn tại!"}), 400
        
        # Lưu vào Supabase
        supabase.table('users').insert({
            'username': data.get('username'), 
            'password': data.get('password')
        }).execute()
        
        return jsonify({"status": "success", "message": "Đăng ký thành công!"})
    except Exception as e:
        print("Lỗi đăng ký:", e)
        return jsonify({"status": "error", "message": "Lỗi kết nối CSDL!"}), 500

# --- ĐĂNG NHẬP ---
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    try:
        res = supabase.table('users').select('*').eq('username', data.get('username')).eq('password', data.get('password')).execute()
        if len(res.data) > 0:
            user = res.data[0]
            return jsonify({"status": "success", "user_id": user['id'], "username": user['username']})
        return jsonify({"status": "error", "message": "Sai tài khoản hoặc mật khẩu!"}), 401
    except Exception as e:
        print("Lỗi đăng nhập:", e)
        return jsonify({"status": "error", "message": "Lỗi kết nối CSDL!"}), 500

# --- UPLOAD FILE LÊN SUPABASE ---
@app.route('/api/upload', methods=['POST'])
def upload_file():
    file = request.files.get('file')
    exam_name = request.form.get('exam_name')
    lang = request.form.get('lang')
    user_id = request.form.get('user_id')
    is_shared = 1 if request.form.get('is_shared') == 'true' else 0
    
    if not file or file.filename == '':
        return jsonify({"status": "error", "message": "Chưa chọn file"}), 400

    try:
        # 1. Upload file Excel lên Storage
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{int(time.time())}_{user_id}{file_ext}"
        file_bytes = file.read()
        
        supabase.storage.from_(BUCKET_NAME).upload(
            file=file_bytes,
            path=unique_filename,
            file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
        )
        
        # 2. Lưu thông tin bộ đề vào DB
        supabase.table('bo_tu_vung').insert({
            'ten_bo': exam_name,
            'ngon_ngu': lang.upper(),
            'nguoi_tao_id': int(user_id),
            'is_shared': is_shared,
            'drive_file_id': unique_filename
        }).execute()
        
        return jsonify({"status": "success", "message": "Đã lưu bộ đề lên Cloud thành công!"})
    except Exception as e:
        print(f"❌ LỖI UPLOAD SUPABASE: {str(e)}")
        return jsonify({"status": "error", "message": "Lỗi lưu file, xem Terminal!"}), 500

# --- LẤY DANH SÁCH BỘ ĐỀ ---
@app.route('/api/exams/<lang>', methods=['GET'])
def get_exams(lang):
    user_id = request.args.get('user_id')
    try:
        # Lấy tất cả bộ đề theo ngôn ngữ
        res = supabase.table('bo_tu_vung').select('*').eq('ngon_ngu', lang.upper()).execute()
        
        exams = []
        for r in res.data:
            # Lọc: Chỉ lấy đề của mình HOẶC đề được chia sẻ công khai
            if str(r['nguoi_tao_id']) == str(user_id) or str(r['is_shared']) == '1':
                exams.append({
                    "id": r['id'], 
                    "name": r['ten_bo'], 
                    "is_mine": str(r['nguoi_tao_id']) == str(user_id), 
                    "is_shared": bool(r['is_shared']),
                    "drive_file_id": r['drive_file_id']
                })
        return jsonify({"status": "success", "data": exams})
    except Exception as e:
        print("Lỗi lấy danh sách đề:", e)
        return jsonify({"status": "error", "message": "Lỗi kết nối CSDL!"}), 500

# --- LẤY FILE TỪ SUPABASE VÀ ĐỌC ---
@app.route('/api/exam/<int:exam_id>', methods=['GET'])
def get_exam_details(exam_id):
    try:
        res = supabase.table('bo_tu_vung').select('drive_file_id').eq('id', exam_id).execute()
        if len(res.data) == 0:
            return jsonify({"status": "error", "message": "Không tìm thấy bộ đề trong DB"}), 404
            
        file_path = res.data[0]['drive_file_id']

        # Tải thẳng dữ liệu file từ Supabase Storage
        file_data = supabase.storage.from_(BUCKET_NAME).download(file_path)
        
        fh = io.BytesIO(file_data)
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
        return jsonify({"status": "error", "message": "Lỗi đọc file Excel!"}), 500

# --- XÓA FILE TRÊN SUPABASE VÀ XÓA DB ---
@app.route('/api/exam/<int:exam_id>', methods=['DELETE'])
def delete_exam(exam_id):
    try:
        res = supabase.table('bo_tu_vung').select('drive_file_id').eq('id', exam_id).execute()
        if len(res.data) > 0:
            try:
                # Xóa file trong kho Storage
                supabase.storage.from_(BUCKET_NAME).remove([res.data[0]['drive_file_id']])
            except Exception as e:
                print("Lỗi xóa file Cloud:", e)
        
        # Supabase PostgreSQL sẽ tự động xóa các lịch sử học liên quan nếu set ON DELETE CASCADE.
        # Nhưng để cẩn thận, ta cứ xóa thủ công lịch sử trước:
        supabase.table('lich_su_hoc').delete().eq('bo_id', exam_id).execute()
        # Rồi xóa bộ đề
        supabase.table('bo_tu_vung').delete().eq('id', exam_id).execute()
        
        return jsonify({"status": "success", "message": "Đã xóa bộ đề sạch sẽ!"})
    except Exception as e:
        print("Lỗi xóa đề:", e)
        return jsonify({"status": "error", "message": "Lỗi xóa dữ liệu!"}), 500

# --- LƯU ĐIỂM ---
@app.route('/api/save_result', methods=['POST'])
def save_result():
    data = request.json
    try:
        supabase.table('lich_su_hoc').insert({
            'user_id': data.get('user_id'),
            'bo_id': data.get('exam_id'),
            'diem_so': float(data.get('score'))
        }).execute()
        return jsonify({"status": "success", "message": "Đã lưu điểm thành công!"})
    except Exception as e:
        print("Lỗi lưu điểm:", e)
        return jsonify({"status": "error", "message": "Lỗi lưu kết quả!"}), 500

# --- LẤY BẢNG XẾP HẠNG (Top Điểm Cao Nhất) ---
@app.route('/api/leaderboard/<int:exam_id>', methods=['GET'])
def get_leaderboard(exam_id):
    try:
        # Lấy lịch sử học kèm thông tin username
        # Supabase cho phép JOIN bảng thông qua cú pháp lồng nhau: users(username)
        res = supabase.table('lich_su_hoc').select('diem_so, users(username)').eq('bo_id', exam_id).execute()
        
        # Gom nhóm và tìm max điểm bằng Python
        scores_dict = {}
        for row in res.data:
            uname = row['users']['username']
            score = row['diem_so']
            if uname not in scores_dict or score > scores_dict[uname]:
                scores_dict[uname] = score
                
        # Format lại thành mảng, sắp xếp giảm dần và lấy Top 10
        leaderboard = [{"username": k, "score": v} for k, v in scores_dict.items()]
        leaderboard = sorted(leaderboard, key=lambda x: x['score'], reverse=True)[:10]
        
        return jsonify({"status": "success", "data": leaderboard})
    except Exception as e:
        print("Lỗi bảng xếp hạng:", e)
        return jsonify({"status": "error", "message": "Lỗi lấy xếp hạng"}), 500

if __name__ == '__main__':
    # Render sẽ cấp một cái PORT tự động, nếu không có (chạy ở Lap) thì dùng mặc định 5000
    port = int(os.environ.get("PORT", 5000))
    
    # Khi đẩy lên Render thì để debug=False cho an toàn, chạy ở Lap thì để True
    app.run(host='0.0.0.0', port=port, debug=False)
    
