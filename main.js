#!/usr/bin/env node

import { createInterface } from 'readline';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('🚀 Browser Course Completion Agent');
  console.log('=====================================\n');

  console.log('Chọn chế độ:');
  console.log('1. Nhập khóa học cụ thể (tên + URL)');
  console.log('2. Mô tả yêu cầu (AI sẽ phân tích)\n');

  const choice = await question('Nhập lựa chọn (1-2): ');

  try {
    switch (choice.trim()) {
      case '1':
        await handleDirectInput();
        break;
      case '2':
        await handleNaturalLanguagePrompt();
        break;
      default:
        console.log('❌ Lựa chọn không hợp lệ!');
    }
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    rl.close();
  }
}

async function handleDirectInput() {
  console.log('\n📚 Nhập khóa học cụ thể');
  console.log('------------------------');

  const courseName = await question('Nhập tên khóa học: ');
  const courseUrl = await question('Nhập URL khóa học: ');
  const additionalInfo = await question('Thông tin bổ sung (tùy chọn, bấm Enter để bỏ qua): ');

  if (!courseName.trim() || !courseUrl.trim()) {
    console.log('❌ Tên khóa học và URL không được để trống!');
    return;
  }

  console.log(`\n🚀 Bắt đầu hoàn thành khóa học: "${courseName}"`);
  console.log(`📖 URL: ${courseUrl}`);
  if (additionalInfo.trim()) {
    console.log(`📝 Thông tin bổ sung: ${additionalInfo}`);
  }
  console.log();

  // Chạy lệnh complete
  const command = `node dist/index.js complete "${courseName}" "${courseUrl}"`;
  console.log(`Chạy lệnh: ${command}\n`);

  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.dirname(__dirname)
    });
  } catch (error) {
    console.error('❌ Lỗi khi chạy:', error.message);
  }
}

async function handleNaturalLanguagePrompt() {
  console.log('\n🤖 Mô tả yêu cầu của bạn');
  console.log('------------------------');

  const userPrompt = await question('Mô tả bạn muốn làm gì (ví dụ: hoàn thành khóa học AWS trên Coursera với URL ...): ');

  if (!userPrompt.trim()) {
    console.log('❌ Mô tả không được để trống!');
    return;
  }

  console.log(`\n🧠 Đang phân tích yêu cầu...\n`);

  try {
    await analyzeAndProcessPrompt(userPrompt);
  } catch (error) {
    console.error('❌ Lỗi khi xử lý:', error.message);
  }
}

async function analyzeAndProcessPrompt(userPrompt) {
  // Import các module cần thiết
  const { LLMFactory } = await import('./dist/llm/factory.js');
  const { loadConfig } = await import('./dist/config/index.js');

  try {
    // Load config
    const config = loadConfig();

    // Khởi tạo LLM factory
    const factory = LLMFactory.getInstance();
    await factory.initialize(config.llm.providers);

    // Lấy provider mặc định
    const provider = factory.getProviderForTask('general');

    if (!provider) {
      console.log('❌ Không tìm thấy LLM provider nào được cấu hình!');
      console.log('💡 Vui lòng thiết lập GROQ_API_KEY hoặc OPENAI_API_KEY trong environment variables');
      return;
    }

    // System prompt để AI hiểu task
    const systemPrompt = `Bạn là trợ lý phân tích yêu cầu cho Browser Course Completion Agent.

CÓ THỂ LÀM:
✅ Hoàn thành các khóa học online (Coursera, Udemy, edX, etc.)
✅ Xem video, làm quiz, đọc bài học tự động
✅ Hỗ trợ thêm thông tin bổ sung về khóa học

KHÔNG THỂ LÀM:
❌ Trả lời câu hỏi kiến thức tổng quát (giải thích e=mc2, vật lý, etc.)
❌ Làm công việc ngoài khóa học
❌ Cần phải có URL của khóa học

PHÂN TÍCH:
1. Kiểm tra xem yêu cầu có LIÊN QUAN ĐẾN HOÀN THÀNH KHÓA HỌC không
2. Nếu CÓ: Extract course_name, course_url, additional_info
3. Nếu KHÔNG: Giải thích lý do không hỗ trợ

PHẢN HỒI DẠNG JSON:
{
  "supported": true/false,
  "reason": "giải thích",
  "course_name": "tên khóa học" (hoặc null),
  "course_url": "URL khóa học" (hoặc null),
  "additional_info": "thông tin bổ sung" (hoặc null),
  "suggestion": "gợi ý cho user nếu không hỗ trợ"
}`;

    console.log('🔄 Gửi tới AI để phân tích...\n');

    // Gọi LLM
    const response = await provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.3,
      maxTokens: 500,
      response_format: { type: 'json_object' }
    });

    // Parse response
    let analysis;
    try {
      analysis = JSON.parse(response.content);
    } catch {
      // Nếu không phải JSON, cố gắng extract JSON từ response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Không thể parse phản hồi từ AI');
      }
    }

    // Xử lý kết quả
    if (!analysis.supported) {
      console.log('❌ Yêu cầu không được hỗ trợ');
      console.log(`📝 Lý do: ${analysis.reason}`);
      if (analysis.suggestion) {
        console.log(`💡 Gợi ý: ${analysis.suggestion}`);
      }
      return;
    }

    // Yêu cầu được hỗ trợ
    console.log('✅ Yêu cầu được hỗ trợ!');
    console.log(`📝 Thông tin phân tích: ${analysis.reason}\n`);

    // Kiểm tra đủ thông tin
    if (!analysis.course_name || !analysis.course_url) {
      console.log('⚠️  Thiếu thông tin:');
      if (!analysis.course_name) {
        console.log('  - Tên khóa học');
      }
      if (!analysis.course_url) {
        console.log('  - URL khóa học');
      }

      const proceed = await question('\nBạn có muốn nhập thêm thông tin không? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Hủy bỏ.');
        return;
      }

      // Cho phép user nhập lại
      if (!analysis.course_name) {
        analysis.course_name = await question('Nhập tên khóa học: ');
      }
      if (!analysis.course_url) {
        analysis.course_url = await question('Nhập URL khóa học: ');
      }
    }

    // Xác nhận trước khi chạy
    console.log('\n📋 Thông tin khóa học:');
    console.log(`  📚 Tên: ${analysis.course_name}`);
    console.log(`  🔗 URL: ${analysis.course_url}`);
    if (analysis.additional_info) {
      console.log(`  📝 Thêm: ${analysis.additional_info}`);
    }

    const confirm = await question('\nBắt đầu hoàn thành khóa học? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('Hủy bỏ.');
      return;
    }

    // Chạy lệnh
    console.log(`\n🚀 Bắt đầu...\n`);
    const command = `node dist/index.js complete "${analysis.course_name}" "${analysis.course_url}"`;
    console.log(`Chạy lệnh: ${command}\n`);

    execSync(command, {
      stdio: 'inherit',
      cwd: path.dirname(__dirname)
    });

  } catch (error) {
    console.error('❌ Lỗi khi phân tích:', error.message);
    console.log('💡 Đảm bảo:');
    console.log('   - API key được thiết lập đúng');
    console.log('   - Node.js và npm đã được cài đặt');
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Tạm biệt!');
  rl.close();
  process.exit(0);
});

main().catch(console.error);