import OpenAI from 'openai';
import { LLMProvider, LLMProviderConfig, LLMMessage, ChatOptions, LLMResponse } from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class UnifiedLLMProvider implements LLMProvider {
  private client: OpenAI;
  config: LLMProviderConfig;
  private requestCount = 0;
  private lastResetTime = Date.now();
  private rateLimitRPM: number;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.rateLimitRPM = config.rateLimitRPM || 60;

    // Initialize OpenAI client
    let baseURL = config.baseUrl;

    if (config.name === 'groq') {
      baseURL = 'https://api.groq.com/openai/v1';
    } else if (config.name === 'ollama') {
      baseURL = config.baseUrl || 'http://localhost:11434/v1';
    } else if (config.name === 'openai') {
      baseURL = 'https://api.openai.com/v1';
    }

    this.client = new OpenAI({
      apiKey: config.apiKey || '',
      baseURL,
    });
  }

  get name(): string {
    return this.config.name;
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    // Check rate limit
    await this.checkRateLimit();

    try {
      const model = options?.model || this.config.model;
      const temperature = options?.temperature ?? this.config.temperature ?? 0.3;
      const maxTokens = options?.maxTokens || this.config.maxTokens || 4096;

      const response = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
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
    } catch (error) {
      logger.error({ error }, `LLM API error (${this.config.name})`);
      throw error;
    }
  }

  supportsVision(): boolean {
    // GPT-4V and newer models support vision
    return this.config.model?.includes('gpt-4') || false;
  }

  estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private async checkRateLimit(): Promise<void> {
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
      logger.warn(`Rate limit approaching (${this.requestCount}/${this.rateLimitRPM}), waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
