import { UnifiedLLMProvider } from './provider.js';
import { LLMProvider, LLMProviderConfig, AgentTaskType } from './types.js';
import { Config } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class LLMFactory {
  private providers: Map<string, LLMProvider> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize all configured providers
    for (const [name, providerConfig] of Object.entries(this.config.providers || {})) {
      try {
        const provider = new UnifiedLLMProvider(providerConfig);
        this.providers.set(name, provider);
        logger.info(`Initialized LLM provider: ${name} (${providerConfig.model})`);
      } catch (error) {
        logger.error({ error }, `Failed to initialize LLM provider: ${name}`);
      }
    }
  }

  /**
   * Get provider for a specific task, or default provider
   */
  getProviderForTask(taskType: AgentTaskType): LLMProvider {
    // Check task mapping first
    const mappedProvider = this.config.taskMapping?.[taskType];

    if (mappedProvider) {
      const provider = this.providers.get(mappedProvider);
      if (provider) {
        return provider;
      }
      logger.warn(`Mapped provider ${mappedProvider} not found for task ${taskType}`);
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
  getProvider(name: string): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`LLM provider not found: ${name}`);
    }
    return provider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List provider names
   */
  listProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Global factory instance
let globalFactory: LLMFactory | null = null;

export function initLLMFactory(config: Config): LLMFactory {
  globalFactory = new LLMFactory(config);
  return globalFactory;
}

export function getLLMFactory(): LLMFactory {
  if (!globalFactory) {
    throw new Error('LLM factory not initialized. Call initLLMFactory first.');
  }
  return globalFactory;
}
