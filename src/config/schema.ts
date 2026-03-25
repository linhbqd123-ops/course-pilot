import { z } from 'zod';

// Browser configuration schema
export const BrowserConfigSchema = z.object({
  headless: z.boolean().default(false),
  timeout: z.number().default(30000),
  navigationTimeout: z.number().default(15000),
  slowMo: z.number().default(0),
  viewport: z.object({
    width: z.number().default(1280),
    height: z.number().default(720),
  }).default({}),
});

// Agent configuration schema
export const AgentConfigSchema = z.object({
  maxRetries: z.number().default(3),
  retryDelayMs: z.number().default(1000),
  pageWaitTime: z.number().default(3000),
  videoWatchTimeout: z.number().default(600000), // 10 minutes for video
});

// Logging configuration schema
export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  pretty: z.boolean().default(true),
});

// Database configuration schema
export const DatabaseConfigSchema = z.object({
  path: z.string().default('./data/agent.db'),
});

// Profile configuration schema
export const ProfileConfigSchema = z.object({
  dir: z.string().default('./data/profiles'),
  autoSync: z.boolean().default(false),
  syncInterval: z.number().default(3600000), // 1 hour
});

// LLM Provider configuration schema
export const LLMProviderSchema = z.object({
  name: z.enum(['groq', 'openai', 'ollama', 'custom']),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().default(''),
  ollamaModel: z.string().optional(), // Specific model for Ollama
  temperature: z.number().default(0.3),
  maxTokens: z.number().default(4096),
  rateLimitRPM: z.number().default(60),
});

// Main config schema
export const ConfigSchema = z.object({
  browser: BrowserConfigSchema.default({}),
  agent: AgentConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
  profile: ProfileConfigSchema.default({}),
  llm: z.object({
    providers: z.record(LLMProviderSchema).default({}),
    defaultProvider: z.string().default('groq'),
    taskMapping: z.record(z.string()).default({}),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type LLMProviderConfig = z.infer<typeof LLMProviderSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>;
