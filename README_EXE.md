# Browser Course Completion Agent

🚀 **Công cụ hoàn thành khóa học tự động với AI**

## Cách sử dụng:

### 1. Chuẩn bị:
- Đảm bảo bạn có Node.js đã cài đặt
- Thiết lập API key:
  ```bash
  set GROQ_API_KEY=gsk_your_key_here
  # hoặc
  set OPENAI_API_KEY=sk_your_key_here
  ```

### 2. Chạy công cụ:
```bash
# Chạy batch file
browser-agent.bat

# hoặc chạy trực tiếp
node dist/bundle/index.js
```

### 3. Chọn chế độ:

#### **Option 1: Nhập khóa học cụ thể**
- Nhập tên khóa học
- Nhập URL khóa học
- Nhập thông tin bổ sung (tùy chọn)
- Ứng dụng sẽ bắt đầu hoàn thành khóa học

#### **Option 2: Mô tả yêu cầu (AI sẽ phân tích)**
- Mô tả bạn muốn làm gì với khóa học
- AI sẽ kiểm tra xem ứng dụng có hỗ trợ không
- Nếu hỗ trợ: AI sẽ extract tên, URL, và thông tin bổ sung
- Nếu không hỗ trợ: AI sẽ giải thích lý do

## Ví dụ:

### Option 1 - Nhập trực tiếp:
```
🚀 Browser Course Completion Agent
=====================================

Chọn chế độ:
1. Nhập khóa học cụ thể (tên + URL)
2. Mô tả yêu cầu (AI sẽ phân tích)

Nhập lựa chọn (1-2): 1

📚 Nhập khóa học cụ thể
------------------------
Nhập tên khóa học: AWS Cloud Basics
Nhập URL khóa học: https://coursera.org/learn/aws-cloud-basics
Thông tin bổ sung (tùy chọn, bấm Enter để bỏ qua): 
```

### Option 2 - Mô tả yêu cầu:
```
Nhập lựa chọn (1-2): 2

🤖 Mô tả yêu cầu của bạn
------------------------
Mô tả bạn muốn làm gì: Hoàn thành khóa học Machine Learning trên Coursera, tôi muốn chạy nhanh ở tốc độ 2x

🧠 Đang phân tích yêu cầu...

✅ Yêu cầu được hỗ trợ!
📝 Thông tin phân tích: ...
```

**Ví dụ không hỗ trợ:**
```
Mô tả bạn muốn làm gì: Giải thích công thức e=mc2

❌ Yêu cầu không được hỗ trợ
📝 Lý do: Đây là câu hỏi kiến thức tổng quát, không liên quan tới hoàn thành khóa học
💡 Gợi ý: Ứng dụng này chỉ hỗ trợ hoàn thành các khóa học online
```

## Tính năng:

✅ **Tự động xem video** - Chạy ở tốc độ cao (2x khi có thể)  
✅ **Làm quiz tự động** - Sử dụng AI để trả lời câu hỏi  
✅ **Đọc bài học** - Tự động cuộn và đánh dấu là đã đọc  
✅ **Hỗ trợ nhiều nền tảng** - Coursera, Udemy, edX, v.v.  
✅ **Phân tích yêu cầu thông minh** - AI hiểu các yêu cầu tự nhiên  
✅ **Lưu tiến độ** - Có thể tiếp tục từ vị trí dừng  

## Yêu cầu hệ thống:
- Windows 10/11
- Node.js 18+
- API key từ Groq hoặc OpenAI

## Lưu ý:
- Công cụ sẽ tự động điều khiển trình duyệt
- Đảm bảo Chrome đã được cài đặt
- Một số khóa học có thể yêu cầu đăng nhập trước
- Gợi ý: Ngâm túi profile Chrome đã đăng nhập sẵn để tránh xác thực liên tục

## Troubleshooting:
- **Lỗi API**: Kiểm tra API key và kết nối internet
- **Lỗi browser**: Đảm bảo Chrome không đang chạy
- **Lỗi khác**: Chạy với quyền Administrator hoặc xóa thư mục `data/` để reset

## Support:
- 🤖 Hỗ trợ Groq (nhanh, tiết kiệm)
- 🤖 Hỗ trợ OpenAI (chính xác hơn)
- 🤖 Hỗ trợ Ollama (tự host trên máy)