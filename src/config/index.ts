import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import { ConfigSchema, Config } from './schema.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

let globalConfig: Config | null = null;

export function loadConfig(configPath?: string): Config {
  // Load .env first
  dotenv.config();

  // Resolve config file path
  const resolvedPath = configPath || path.join(process.cwd(), 'config', 'default.yaml');

  let fileConfig: any = {};
  if (fs.existsSync(resolvedPath)) {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    fileConfig = yaml.load(content) as Record<string, any>;
  } else {
    logger.warn(`Config file not found at ${resolvedPath}, using defaults`);
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

export function getConfig(): Config {
  if (!globalConfig) {
    globalConfig = loadConfig();
  }
  return globalConfig;
}

function parseEnvConfig(): Record<string, any> {
  const config: any = {};

  // Parse AGENT_SECTION_KEY format
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('AGENT_')) continue;

    const parts = key.slice(6).toLowerCase().split('_');
    if (parts.length < 2) continue;

    const [section, ...keyParts] = parts;
    const configKey = keyParts.join('_');

    if (!config[section]) config[section] = {};

    // Try to parse as number/boolean
    let parsedValue: any = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = Number(value);

    config[section][configKey] = parsedValue;
  }

  // Handle specific provider keys
  if (process.env.GROQ_API_KEY) {
    if (!config.providers) config.providers = {};
    if (!config.providers.groq) config.providers.groq = {};
    config.providers.groq.apiKey = process.env.GROQ_API_KEY;
  }

  if (process.env.OPENAI_API_KEY) {
    if (!config.providers) config.providers = {};
    if (!config.providers.openai) config.providers.openai = {};
    config.providers.openai.apiKey = process.env.OPENAI_API_KEY;
  }

  if (process.env.OLLAMA_BASE_URL) {
    if (!config.providers) config.providers = {};
    if (!config.providers.ollama) config.providers.ollama = {};
    config.providers.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
  }

  return config;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}
