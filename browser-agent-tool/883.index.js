export const id = 883;
export const ids = [883];
export const modules = {

/***/ 2883:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  LLMFactory: () => (/* binding */ LLMFactory)
});

// UNUSED EXPORTS: getLLMFactory, initLLMFactory

// EXTERNAL MODULE: ./node_modules/openai/index.mjs + 90 modules
var openai = __webpack_require__(1145);
// EXTERNAL MODULE: ./dist/utils/logger.js
var logger = __webpack_require__(5672);
;// CONCATENATED MODULE: ./dist/llm/provider.js


const provider_logger = (0,logger/* getLogger */.tZ)();
class UnifiedLLMProvider {
    constructor(config) {
        this.requestCount = 0;
        this.lastResetTime = Date.now();
        this.config = config;
        this.rateLimitRPM = config.rateLimitRPM || 60;
        // Initialize OpenAI client
        let baseURL = config.baseUrl;
        if (config.name === 'groq') {
            baseURL = 'https://api.groq.com/openai/v1';
        }
        else if (config.name === 'ollama') {
            baseURL = config.baseUrl || 'http://localhost:11434/v1';
        }
        else if (config.name === 'openai') {
            baseURL = 'https://api.openai.com/v1';
        }
        this.client = new openai/* default */.Ay({
            apiKey: config.apiKey || '',
            baseURL,
        });
    }
    get name() {
        return this.config.name;
    }
    async chat(messages, options) {
        // Check rate limit
        await this.checkRateLimit();
        try {
            const model = options?.model || this.config.model;
            const temperature = options?.temperature ?? this.config.temperature ?? 0.3;
            const maxTokens = options?.maxTokens || this.config.maxTokens || 4096;
            const response = await this.client.chat.completions.create({
                model,
                messages: messages,
                temperature,
                max_tokens: maxTokens,
                response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
            });
            const content = response.choices[0]?.message?.content || '';
            return {
                content,
                model,
                tokens: {
                    input: response.usage?.prompt_tokens || 0,
                    output: response.usage?.completion_tokens || 0,
                },
                finishReason: response.choices[0]?.finish_reason || 'stop',
            };
        }
        catch (error) {
            provider_logger.error({ error }, `LLM API error (${this.config.name})`);
            throw error;
        }
    }
    supportsVision() {
        // GPT-4V and newer models support vision
        return this.config.model?.includes('gpt-4') || false;
    }
    estimateTokens(text) {
        // Rough estimate: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }
    async checkRateLimit() {
        const now = Date.now();
        const minutesPassed = (now - this.lastResetTime) / (1000 * 60);
        // Reset counter every minute
        if (minutesPassed >= 1) {
            this.requestCount = 0;
            this.lastResetTime = now;
        }
        this.requestCount++;
        if (this.requestCount > this.rateLimitRPM) {
            const waitMs = Math.ceil((60 * 1000) - minutesPassed * (1000 * 60));
            provider_logger.warn(`Rate limit approaching (${this.requestCount}/${this.rateLimitRPM}), waiting ${waitMs}ms`);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
    }
}
//# sourceMappingURL=provider.js.map
;// CONCATENATED MODULE: ./dist/llm/factory.js


const factory_logger = (0,logger/* getLogger */.tZ)();
class LLMFactory {
    constructor(config) {
        this.providers = new Map();
        this.config = config;
        this.initializeProviders();
    }
    initializeProviders() {
        // Initialize all configured providers
        for (const [name, providerConfig] of Object.entries(this.config.providers || {})) {
            try {
                const provider = new UnifiedLLMProvider(providerConfig);
                this.providers.set(name, provider);
                factory_logger.info(`Initialized LLM provider: ${name} (${providerConfig.model})`);
            }
            catch (error) {
                factory_logger.error({ error }, `Failed to initialize LLM provider: ${name}`);
            }
        }
    }
    /**
     * Get provider for a specific task, or default provider
     */
    getProviderForTask(taskType) {
        // Check task mapping first
        const mappedProvider = this.config.taskMapping?.[taskType];
        if (mappedProvider) {
            const provider = this.providers.get(mappedProvider);
            if (provider) {
                return provider;
            }
            factory_logger.warn(`Mapped provider ${mappedProvider} not found for task ${taskType}`);
        }
        // Fall back to default provider
        const defaultProvider = this.config.defaultProvider || 'groq';
        let provider = this.providers.get(defaultProvider);
        if (!provider) {
            // If default not available, use first available
            provider = this.providers.values().next().value;
        }
        if (!provider) {
            throw new Error('No LLM providers configured');
        }
        return provider;
    }
    /**
     * Get specific provider by name
     */
    getProvider(name) {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(`LLM provider not found: ${name}`);
        }
        return provider;
    }
    /**
     * Get all available providers
     */
    getAvailableProviders() {
        return Array.from(this.providers.values());
    }
    /**
     * List provider names
     */
    listProviderNames() {
        return Array.from(this.providers.keys());
    }
}
// Global factory instance
let globalFactory = null;
function initLLMFactory(config) {
    globalFactory = new LLMFactory(config);
    return globalFactory;
}
function getLLMFactory() {
    if (!globalFactory) {
        throw new Error('LLM factory not initialized. Call initLLMFactory first.');
    }
    return globalFactory;
}
//# sourceMappingURL=factory.js.map

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
