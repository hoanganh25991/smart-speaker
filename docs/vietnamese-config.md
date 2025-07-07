# Cấu hình Tiếng Việt cho Smart Speaker

## Tổng quan
Tài liệu này mô tả các thay đổi được thực hiện để cấu hình ứng dụng Smart Speaker sử dụng tiếng Việt làm ngôn ngữ mặc định.

## Các thay đổi chính

### 1. Cấu hình OpenAI (`config.json`)
- **Voice**: Đã đặt voice mặc định là "alloy"
- **Language**: Thêm thuộc tính `language: "vi"` 
- **Instructions**: Cập nhật hướng dẫn để GPT luôn phản hồi bằng tiếng Việt

### 2. Cấu hình Server (`server.js`)
- **Input Audio Transcription**: Thêm `language: 'vi'` cho Whisper model
- Đảm bảo việc nhận diện giọng nói tiếng Việt chính xác hơn

### 3. Giao diện người dùng (`index.html`)
- **HTML lang**: Đổi từ `en` sang `vi`
- **Title**: "Trò chuyện GPT Thời gian thực" 
- **UI Text**: Dịch tất cả text sang tiếng Việt:
  - "Kết nối & Nói chuyện"
  - "Ngắt kết nối"
  - "Nhập tin nhắn của bạn..."
  - "Gửi"

### 4. JavaScript Client (`app.js`)
- **Status Messages**: Dịch tất cả thông báo hệ thống sang tiếng Việt
- **Error Messages**: Dịch thông báo lỗi sang tiếng Việt
- **Connection Status**: "Đã kết nối" / "Chưa kết nối"

## Cấu hình GPT Instructions
GPT được cấu hình với hướng dẫn:
```
You are a helpful AI assistant. Always communicate in Vietnamese (Tiếng Việt). 
Be conversational and friendly. Respond naturally in Vietnamese to all questions 
and conversations. When the user speaks in Vietnamese, respond in Vietnamese. 
When the user speaks in English or other languages, still respond in Vietnamese 
unless specifically asked to respond in another language.
```

## Tính năng
- ✅ Nhận diện giọng nói tiếng Việt
- ✅ Phản hồi bằng tiếng Việt (voice alloy)
- ✅ Giao diện hoàn toàn tiếng Việt
- ✅ Tự động bật mic khi kết nối
- ✅ Phản hồi liên tục bằng tiếng Việt

## Cách sử dụng
1. Khởi động server: `node server.js`
2. Truy cập: `http://localhost:3000`
3. Nhấn "Kết nối & Nói chuyện"
4. Bắt đầu nói chuyện bằng tiếng Việt
5. GPT sẽ phản hồi bằng tiếng Việt với giọng alloy

## Lưu ý
- Alloy voice được chọn vì phù hợp cho tiếng Việt
- Whisper model được cấu hình để nhận diện tiếng Việt (`vi`)
- Tất cả phản hồi sẽ mặc định là tiếng Việt