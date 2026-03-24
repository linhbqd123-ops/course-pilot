# Smart Prompt Analysis Features

## Overview

The Browser Course Completion Agent now supports **intelligent natural language prompt analysis** using AI. This allows users to describe what they want in natural language, and the system will:

1. **Validate**: Check if the request is course-completion related
2. **Extract**: Pull out course name, URL, and additional requirements
3. **Confirm**: Show extracted info and get user approval before proceeding

## How It Works

### Option 1: Direct Input (Explicit)
User explicitly provides:
- Course name
- Course URL
- Optional: Additional information

```
📚 Nhập khóa học cụ thể
------------------------
Nhập tên khóa học: AWS Fundamentals
Nhập URL khóa học: https://coursera.org/learn/aws-fundamentals
Thông tin bổ sung: Run videos at 2x speed
```

### Option 2: Natural Language (Flexible)
User describes in natural language, AI extracts course details:

```
🤖 Mô tả yêu cầu của bạn
------------------------
Mô tả bạn muốn làm gì: 
"I want to complete the Python for Data Science course on Coursera at https://coursera.org/learn/python-data-science, 
please run videos faster if possible"

🧠 Đang phân tích yêu cầu...

✅ Yêu cầu được hỗ trợ!
📝 Thông tin phân tích: Course completion request with optimization preference

📋 Thông tin khóa học:
  📚 Tên: Python for Data Science
  🔗 URL: https://coursera.org/learn/python-data-science
  📝 Thêm: Run videos at 2x speed

Bắt đầu hoàn thành khóa học? (y/n): y
```

## Supported Requests

✅ **SUPPORTED:**
- "Complete AWS Cloud course at https://coursera.org/learn/aws"
- "Finish the machine learning specialization on Udemy with URL https://udemy.com/ml-course"
- "I need to complete a JavaScript course at https://example.com/js-course and run videos at 2x speed"
- "Help me finish the Python course, here's the link: https://..."

❌ **NOT SUPPORTED:**
- "What is cloud computing?" (General knowledge question)
- "Explain machine learning algorithms" (Educational explanation, not course completion)
- "Complete a course without providing a URL" (Missing required info)
- "Do my homework for me" (Outside course platform scope)

## AI Analysis System Prompt

The system uses a detailed prompt to guide AI analysis:

```
CÓ THỂ LÀM:
✅ Hoàn thành các khóa học online (Coursera, Udemy, edX, etc.)
✅ Xem video, làm quiz, đọc bài học tự động
✅ Hỗ trợ thêm thông tin bổ sung về khóa học

KHÔNG THỂ LÀM:
❌ Trả lời câu hỏi kiến thức tổng quát
❌ Làm công việc ngoài khóa học
❌ Cần phải có URL của khóa học

PHÂN TÍCH:
1. Kiểm tra xem yêu cầu có LIÊN QUAN ĐẾN HOÀN THÀNH KHÓA HỌC không
2. Nếu CÓ: Extract course_name, course_url, additional_info
3. Nếu KHÔNG: Giải thích lý do không hỗ trợ

PHẢN HỒI DẠNG JSON:
{
  "supported": true/false,
  "reason": "explanation",
  "course_name": "name" (hoặc null),
  "course_url": "URL" (hoặc null),
  "additional_info": "info" (hoặc null),
  "suggestion": "suggestion if not supported"
}
```

## Response Flow

### Scenario 1: Supported Request with Full Info
```
Input: "Complete the AWS course at https://coursera.org/learn/aws at 2x speed"

Parse Result:
{
  "supported": true,
  "reason": "Course completion request with optimization preference",
  "course_name": "AWS",
  "course_url": "https://coursera.org/learn/aws",
  "additional_info": "Run videos at 2x speed",
  "suggestion": null
}

↓ Show confirmation ↓
Bắt đầu hoàn thành khóa học? (y/n): y
```

### Scenario 2: Supported Request with Missing Info
```
Input: "I want to complete an AWS course at 2x speed, but I don't have the URL"

Parse Result:
{
  "supported": true,
  "reason": "Course completion request but missing URL",
  "course_name": "AWS",
  "course_url": null,
  "additional_info": "Run videos at 2x speed",
  "suggestion": "Please provide the course URL"
}

↓ Ask for missing info ↓
⚠️ Thiếu thông tin:
  - URL khóa học
Bạn có muốn nhập thêm thông tin không? (y/n): y
Nhập URL khóa học: https://...
```

### Scenario 3: Not Supported Request
```
Input: "Explain machine learning concepts"

Parse Result:
{
  "supported": false,
  "reason": "This is a general knowledge explanation request, not a course completion task",
  "course_name": null,
  "course_url": null,
  "additional_info": null,
  "suggestion": "This tool completes online courses. Did you mean to provide a course URL?"
}

↓ Reject with explanation ↓
❌ Yêu cầu không được hỗ trợ
📝 Lý do: This is a general knowledge explanation request...
💡 Gợi ý: This tool completes online courses...
```

## Additional Information Examples

Common additional info the system can extract:

- **Playback speed**: "2x speed", "1.5x", "fast playback"
- **Optimization preferences**: "skip non-essential", "fast mode", "quick completion"
- **Language preferences**: "English subtitles", "Vietnamese"
- **Specific sections**: "Only complete Module 3", "Skip assessment"
- **Study goals**: "Get certificate", "Complete all quizzes"

## Error Handling

### Missing API Key
```
❌ Không tìm thấy LLM provider nào được cấu hình!
💡 Vui lòng thiết lập:
   - GROQ_API_KEY=gsk_xxxxx (recommended)
   - OPENAI_API_KEY=sk_xxxxx
```

### Parsing Failure
```
❌ Lỗi khi phân tích: [error message]
💡 Đảm bảo:
   - API key được thiết lập đúng
   - Node.js và npm đã được cài đặt
```

### No Provider Available
```
❌ Không tìm thấy LLM provider nào!
   Nếu đó là một lỗi, hãy kiểm tra kết nối mạng lại
```

## Implementation Details

### JSON Response Parsing
The system attempts to parse AI response as JSON. If parsing fails, it:
1. Searches for JSON object in the response text
2. Extracts and parses the embedded JSON
3. Falls back to error if no valid JSON found

### User Confirmation Flow
1. **Parse and Validate**: AI analyzes the request
2. **Show Summary**: Display extracted course info
3. **Confirm**: Get user approval
4. **Execute**: Run the completion process

### Fallback for Missing Fields
If course_name or course_url is missing:
- Ask user if they want to provide missing info
- Allow manual input for missing fields
- Validate new input before proceeding

## Benefits

✅ **Flexible Input** - Natural language instead of rigid forms  
✅ **Smart Validation** - AI ensures request is supported  
✅ **Better UX** - Clear feedback on what's supported/unsupported  
✅ **Adaptive** - Handles various request phrasings  
✅ **Safe** - Prevents misuse for unsupported tasks  

## Future Enhancements

- Multi-language support (currently Vietnamese/English)
- Course recommendation based on description
- Automatic URL validation and verification
- Support for course preview/inspection before starting
- Learning style detection from additional info
