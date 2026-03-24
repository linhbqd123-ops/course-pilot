#!/usr/bin/env nodeimport { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 2613:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("assert");

/***/ }),

/***/ 181:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("buffer");

/***/ }),

/***/ 6982:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("crypto");

/***/ }),

/***/ 4434:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("events");

/***/ }),

/***/ 9896:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("fs");

/***/ }),

/***/ 8611:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("http");

/***/ }),

/***/ 5692:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("https");

/***/ }),

/***/ 3339:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("module");

/***/ }),

/***/ 3024:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");

/***/ }),

/***/ 7075:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:stream");

/***/ }),

/***/ 7830:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:stream/web");

/***/ }),

/***/ 857:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("os");

/***/ }),

/***/ 6928:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("path");

/***/ }),

/***/ 4876:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("punycode");

/***/ }),

/***/ 2203:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("stream");

/***/ }),

/***/ 7016:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("url");

/***/ }),

/***/ 9023:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("util");

/***/ }),

/***/ 8167:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("worker_threads");

/***/ }),

/***/ 3106:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("zlib");

/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/******/ // expose the modules object (__webpack_modules__)
/******/ __nccwpck_require__.m = __webpack_modules__;
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__nccwpck_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/ensure chunk */
/******/ (() => {
/******/ 	__nccwpck_require__.f = {};
/******/ 	// This file contains only the entry chunk.
/******/ 	// The chunk loading function for additional chunks
/******/ 	__nccwpck_require__.e = (chunkId) => {
/******/ 		return Promise.all(Object.keys(__nccwpck_require__.f).reduce((promises, key) => {
/******/ 			__nccwpck_require__.f[key](chunkId, promises);
/******/ 			return promises;
/******/ 		}, []));
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/get javascript chunk filename */
/******/ (() => {
/******/ 	// This function allow to reference async chunks
/******/ 	__nccwpck_require__.u = (chunkId) => {
/******/ 		// return url for filenames based on template
/******/ 		return "" + chunkId + ".index.js";
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/******/ /* webpack/runtime/import chunk loading */
/******/ (() => {
/******/ 	// no baseURI
/******/ 	
/******/ 	// object to store loaded and loading chunks
/******/ 	// undefined = chunk not loaded, null = chunk preloaded/prefetched
/******/ 	// [resolve, Promise] = chunk loading, 0 = chunk loaded
/******/ 	var installedChunks = {
/******/ 		792: 0
/******/ 	};
/******/ 	
/******/ 	var installChunk = (data) => {
/******/ 		var {ids, modules, runtime} = data;
/******/ 		// add "modules" to the modules object,
/******/ 		// then flag all "ids" as loaded and fire callback
/******/ 		var moduleId, chunkId, i = 0;
/******/ 		for(moduleId in modules) {
/******/ 			if(__nccwpck_require__.o(modules, moduleId)) {
/******/ 				__nccwpck_require__.m[moduleId] = modules[moduleId];
/******/ 			}
/******/ 		}
/******/ 		if(runtime) runtime(__nccwpck_require__);
/******/ 		for(;i < ids.length; i++) {
/******/ 			chunkId = ids[i];
/******/ 			if(__nccwpck_require__.o(installedChunks, chunkId) && installedChunks[chunkId]) {
/******/ 				installedChunks[chunkId][0]();
/******/ 			}
/******/ 			installedChunks[ids[i]] = 0;
/******/ 		}
/******/ 	
/******/ 	}
/******/ 	
/******/ 	__nccwpck_require__.f.j = (chunkId, promises) => {
/******/ 			// import() chunk loading for javascript
/******/ 			var installedChunkData = __nccwpck_require__.o(installedChunks, chunkId) ? installedChunks[chunkId] : undefined;
/******/ 			if(installedChunkData !== 0) { // 0 means "already installed".
/******/ 	
/******/ 				// a Promise means "currently loading".
/******/ 				if(installedChunkData) {
/******/ 					promises.push(installedChunkData[1]);
/******/ 				} else {
/******/ 					if(true) { // all chunks have JS
/******/ 						// setup Promise in chunk cache
/******/ 						var promise = import("./" + __nccwpck_require__.u(chunkId)).then(installChunk, (e) => {
/******/ 							if(installedChunks[chunkId] !== 0) installedChunks[chunkId] = undefined;
/******/ 							throw e;
/******/ 						});
/******/ 						var promise = Promise.race([promise, new Promise((resolve) => (installedChunkData = installedChunks[chunkId] = [resolve]))])
/******/ 						promises.push(installedChunkData[1] = promise);
/******/ 					}
/******/ 				}
/******/ 			}
/******/ 	};
/******/ 	
/******/ 	// no prefetching
/******/ 	
/******/ 	// no preloaded
/******/ 	
/******/ 	// no external install chunk
/******/ 	
/******/ 	// no on chunks loaded
/******/ })();
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "readline"
const external_readline_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("readline");
;// CONCATENATED MODULE: external "child_process"
const external_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("child_process");
// EXTERNAL MODULE: external "path"
var external_path_ = __nccwpck_require__(6928);
// EXTERNAL MODULE: external "url"
var external_url_ = __nccwpck_require__(7016);
;// CONCATENATED MODULE: ./main.js







const main_filename = (0,external_url_.fileURLToPath)(import.meta.url);
const main_dirname = external_path_.dirname(main_filename);

const rl = (0,external_readline_namespaceObject.createInterface)({
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
  console.log('1. Hoàn thành khóa học (nhập URL + tên khóa học)');
  console.log('2. Hỏi AI về khóa học (nhập prompt)');
  console.log('3. Xem trạng thái khóa học');
  console.log('4. Xem cấu hình\n');

  const choice = await question('Nhập lựa chọn (1-4): ');

  try {
    switch (choice.trim()) {
      case '1':
        await handleCourseCompletion();
        break;
      case '2':
        await handleAIPrompt();
        break;
      case '3':
        await showStatus();
        break;
      case '4':
        await showConfig();
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

async function handleCourseCompletion() {
  console.log('\n📚 Chế độ hoàn thành khóa học');
  console.log('------------------------------');

  const courseName = await question('Nhập tên khóa học: ');
  const courseUrl = await question('Nhập URL khóa học: ');

  if (!courseName.trim() || !courseUrl.trim()) {
    console.log('❌ Tên khóa học và URL không được để trống!');
    return;
  }

  console.log(`\n🚀 Bắt đầu hoàn thành khóa học: "${courseName}"`);
  console.log(`📖 URL: ${courseUrl}\n`);

  // Chạy lệnh complete
  const command = `node dist/index.js complete "${courseName}" "${courseUrl}"`;
  console.log(`Chạy lệnh: ${command}\n`);

  try {
    (0,external_child_process_namespaceObject.execSync)(command, {
      stdio: 'inherit',
      cwd: external_path_.dirname(main_dirname)
    });
  } catch (error) {
    console.error('❌ Lỗi khi chạy:', error.message);
  }
}

async function handleAIPrompt() {
  console.log('\n🤖 Chế độ hỏi AI');
  console.log('-----------------');

  const prompt = await question('Nhập câu hỏi/prompt của bạn: ');

  if (!prompt.trim()) {
    console.log('❌ Prompt không được để trống!');
    return;
  }

  console.log(`\n🧠 Đang xử lý prompt: "${prompt}"\n`);

  // Ở đây có thể gọi trực tiếp LLM API thay vì qua agent system
  // Để demo, tôi sẽ tạo một function đơn giản
  await processAIPrompt(prompt);
}

async function processAIPrompt(prompt) {
  // Import các module cần thiết
  const { LLMFactory } = await Promise.all(/* import() */[__nccwpck_require__.e(5), __nccwpck_require__.e(145), __nccwpck_require__.e(883)]).then(__nccwpck_require__.bind(__nccwpck_require__, 2883));
  const { loadConfig } = await Promise.all(/* import() */[__nccwpck_require__.e(5), __nccwpck_require__.e(597), __nccwpck_require__.e(981)]).then(__nccwpck_require__.bind(__nccwpck_require__, 981));

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

    console.log('🔄 Đang gọi AI API...\n');

    // Gọi LLM
    const response = await provider.chat([
      { role: 'user', content: prompt }
    ], {
      temperature: 0.7,
      maxTokens: 1000
    });

    console.log('🤖 Trả lời từ AI:');
    console.log('==================');
    console.log(response.content);
    console.log('==================\n');

  } catch (error) {
    console.error('❌ Lỗi khi gọi AI:', error.message);
    console.log('💡 Đảm bảo bạn đã thiết lập API key đúng cách');
  }
}

async function showStatus() {
  console.log('\n📊 Trạng thái khóa học');
  console.log('======================');

  const command = `node dist/index.js status`;
  console.log(`Chạy lệnh: ${command}\n`);

  try {
    (0,external_child_process_namespaceObject.execSync)(command, {
      stdio: 'inherit',
      cwd: external_path_.dirname(main_dirname)
    });
  } catch (error) {
    console.error('❌ Lỗi khi xem trạng thái:', error.message);
  }
}

async function showConfig() {
  console.log('\n⚙️  Cấu hình hệ thống');
  console.log('===================');

  const command = `node dist/index.js config`;
  console.log(`Chạy lệnh: ${command}\n`);

  try {
    (0,external_child_process_namespaceObject.execSync)(command, {
      stdio: 'inherit',
      cwd: external_path_.dirname(main_dirname)
    });
  } catch (error) {
    console.error('❌ Lỗi khi xem cấu hình:', error.message);
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Tạm biệt!');
  rl.close();
  process.exit(0);
});

main().catch(console.error);
