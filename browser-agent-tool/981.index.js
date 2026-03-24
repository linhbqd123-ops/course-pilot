export const id = 981;
export const ids = [981];
export const modules = {

/***/ 981:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  loadConfig: () => (/* binding */ loadConfig)
});

// UNUSED EXPORTS: getConfig

// EXTERNAL MODULE: external "fs"
var external_fs_ = __webpack_require__(9896);
// EXTERNAL MODULE: external "path"
var external_path_ = __webpack_require__(6928);
// EXTERNAL MODULE: ./node_modules/js-yaml/dist/js-yaml.mjs
var js_yaml = __webpack_require__(3243);
// EXTERNAL MODULE: ./node_modules/dotenv/lib/main.js
var main = __webpack_require__(8889);
// EXTERNAL MODULE: ./node_modules/zod/v3/types.js + 6 modules
var types = __webpack_require__(339);
;// CONCATENATED MODULE: ./dist/config/schema.js

// Browser configuration schema
const BrowserConfigSchema = types/* object */.Ik({
    headless: types/* boolean */.zM().default(false),
    timeout: types/* number */.ai().default(30000),
    navigationTimeout: types/* number */.ai().default(60000),
    slowMo: types/* number */.ai().default(0),
    viewport: types/* object */.Ik({
        width: types/* number */.ai().default(1280),
        height: types/* number */.ai().default(720),
    }).default({}),
});
// Agent configuration schema
const AgentConfigSchema = types/* object */.Ik({
    maxRetries: types/* number */.ai().default(3),
    retryDelayMs: types/* number */.ai().default(1000),
    pageWaitTime: types/* number */.ai().default(3000),
    videoWatchTimeout: types/* number */.ai().default(600000), // 10 minutes for video
});
// Logging configuration schema
const LoggingConfigSchema = types/* object */.Ik({
    level: types/* enum */.k5(['debug', 'info', 'warn', 'error']).default('info'),
    pretty: types/* boolean */.zM().default(true),
});
// Database configuration schema
const DatabaseConfigSchema = types/* object */.Ik({
    path: types/* string */.Yj().default('./data/agent.db'),
});
// Profile configuration schema
const ProfileConfigSchema = types/* object */.Ik({
    dir: types/* string */.Yj().default('./data/profiles'),
    autoSync: types/* boolean */.zM().default(false),
    syncInterval: types/* number */.ai().default(3600000), // 1 hour
});
// LLM Provider configuration schema
const LLMProviderSchema = types/* object */.Ik({
    name: types/* enum */.k5(['groq', 'openai', 'ollama', 'custom']),
    apiKey: types/* string */.Yj().optional(),
    baseUrl: types/* string */.Yj().optional(),
    model: types/* string */.Yj().default(''),
    temperature: types/* number */.ai().default(0.3),
    maxTokens: types/* number */.ai().default(4096),
    rateLimitRPM: types/* number */.ai().default(60),
});
// Main config schema
const ConfigSchema = types/* object */.Ik({
    browser: BrowserConfigSchema.default({}),
    agent: AgentConfigSchema.default({}),
    logging: LoggingConfigSchema.default({}),
    database: DatabaseConfigSchema.default({}),
    profile: ProfileConfigSchema.default({}),
    providers: types/* record */.g1(LLMProviderSchema).default({}),
    defaultProvider: types/* string */.Yj().default('groq'),
    taskMapping: types/* record */.g1(types/* string */.Yj()).default({}),
});
//# sourceMappingURL=schema.js.map
// EXTERNAL MODULE: ./dist/utils/logger.js
var logger = __webpack_require__(5672);
;// CONCATENATED MODULE: ./dist/config/index.js






const config_logger = (0,logger/* getLogger */.tZ)();
let globalConfig = null;
function loadConfig(configPath) {
    // Load .env first
    main.config();
    // Resolve config file path
    const resolvedPath = configPath || __webpack_require__.ab + "default.yaml";
    let fileConfig = {};
    if (external_fs_.existsSync(resolvedPath)) {
        const content = external_fs_.readFileSync(resolvedPath, 'utf-8');
        fileConfig = js_yaml/* load */.Hh(content);
    }
    else {
        config_logger.warn(`Config file not found at ${resolvedPath}, using defaults`);
    }
    // Override with environment variables
    const envConfig = parseEnvConfig();
    // Merge configs: defaults < file < env
    const merged = deepMerge(fileConfig, envConfig);
    // Validate with schema
    const config = ConfigSchema.parse(merged);
    globalConfig = config;
    return config;
}
function getConfig() {
    if (!globalConfig) {
        globalConfig = loadConfig();
    }
    return globalConfig;
}
function parseEnvConfig() {
    const config = {};
    // Parse AGENT_SECTION_KEY format
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('AGENT_'))
            continue;
        const parts = key.slice(6).toLowerCase().split('_');
        if (parts.length < 2)
            continue;
        const [section, ...keyParts] = parts;
        const configKey = keyParts.join('_');
        if (!config[section])
            config[section] = {};
        // Try to parse as number/boolean
        let parsedValue = value;
        if (value === 'true')
            parsedValue = true;
        else if (value === 'false')
            parsedValue = false;
        else if (!isNaN(Number(value)))
            parsedValue = Number(value);
        config[section][configKey] = parsedValue;
    }
    // Handle specific provider keys
    if (process.env.GROQ_API_KEY) {
        if (!config.providers)
            config.providers = {};
        if (!config.providers.groq)
            config.providers.groq = {};
        config.providers.groq.apiKey = process.env.GROQ_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) {
        if (!config.providers)
            config.providers = {};
        if (!config.providers.openai)
            config.providers.openai = {};
        config.providers.openai.apiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.OLLAMA_BASE_URL) {
        if (!config.providers)
            config.providers = {};
        if (!config.providers.ollama)
            config.providers.ollama = {};
        config.providers.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
    }
    return config;
}
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        }
        else {
            result[key] = source[key];
        }
    }
    return result;
}
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 5672:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   tZ: () => (/* binding */ getLogger)
/* harmony export */ });
/* unused harmony exports initLogger, logSuccess, logError, logWarning, logInfo, logProgress */
/* harmony import */ var pino__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(5005);


let logger = null;
function initLogger(level = 'info') {
    logger = pino__WEBPACK_IMPORTED_MODULE_0__({
        level,
        formatters: {
            level: (label) => {
                return { level: label };
            },
        },
    });
    return logger;
}
function getLogger() {
    if (!logger) {
        logger = initLogger('info');
    }
    return logger;
}
function logSuccess(msg) {
    console.log(chalk.green('✓') + ' ' + msg);
}
function logError(msg) {
    console.log(chalk.red('✗') + ' ' + msg);
}
function logWarning(msg) {
    console.log(chalk.yellow('⚠') + ' ' + msg);
}
function logInfo(msg) {
    console.log(chalk.blue('ℹ') + ' ' + msg);
}
function logProgress(msg, progress) {
    const percentage = progress !== undefined ? ` (${Math.round(progress * 100)}%)` : '';
    console.log(chalk.cyan('⏳') + ' ' + msg + percentage);
}
//# sourceMappingURL=logger.js.map

/***/ })

};
