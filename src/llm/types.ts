// LLM Provider type definitions

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface LLMContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface LLMResponse {
  content: string;
  tokens?: {
    input: number;
    output: number;
  };
  model: string;
  finishReason?: string;
}

export interface LLMProviderConfig {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  rateLimitRPM?: number;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  readonly config: LLMProviderConfig;

  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>;
  
  supportsVision(): boolean;
  
  estimateTokens(text: string): number;
}

export type AgentTaskType =
  | 'orchestrator'
  | 'navigator'
  | 'video_handler'
  | 'quiz_handler'
  | 'reader_handler'
  | 'page_classifier';
