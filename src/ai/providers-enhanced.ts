// Enhanced Provider Registry with comprehensive model support
// Includes auto-discovery, key management, and detailed model configs

import { fetch } from "undici";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'azure' | 'bedrock' | 'vertex' | 'local';

export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
  releaseDate?: string;
}

export interface ProviderFeatures {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  thinking: boolean;
  caching: boolean;
  batching: boolean;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  tokensPerDay?: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKeyEnvVar: string;
  baseUrl?: string;
  models: ModelConfig[];
  features: ProviderFeatures;
  rateLimits?: RateLimitConfig;
}

// Comprehensive provider configurations
export const ENHANCED_PROVIDERS: Record<string, ProviderConfig> = {
  
  // === TIER 1: Primary Providers ===
  
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: true,
      batching: false,
    },
    models: [
      {
        id: 'claude-opus-4-7',
        name: 'Claude Opus 4.7',
        contextWindow: 200000,
        maxOutputTokens: 32000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 15,
        costPer1kOutput: 75,
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 3,
        costPer1kOutput: 15,
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.25,
        costPer1kOutput: 1.25,
      },
    ],
    rateLimits: {
      requestsPerMinute: 50,
      tokensPerMinute: 40000,
    },
  },
  
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: false,
      batching: true,
    },
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 2.5,
        costPer1kOutput: 10,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.15,
        costPer1kOutput: 0.6,
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 1.1,
        costPer1kOutput: 4.4,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 10,
        costPer1kOutput: 30,
      },
    ],
    rateLimits: {
      requestsPerMinute: 500,
      tokensPerMinute: 200000,
    },
  },
  
  google: {
    id: 'google',
    name: 'Google AI',
    type: 'google',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: true,
      batching: false,
    },
    models: [
      {
        id: 'gemini-3.1-pro',
        name: 'Gemini 3.1 Pro',
        contextWindow: 2000000,
        maxOutputTokens: 65536,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 1.25,
        costPer1kOutput: 5,
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        contextWindow: 1000000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 1.25,
        costPer1kOutput: 5,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.075,
        costPer1kOutput: 0.3,
      },
    ],
  },
  
  // === TIER 2: Alternative Providers ===
  
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: true,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.14,
        costPer1kOutput: 0.28,
      },
      {
        id: 'deepseek-coder',
        name: 'DeepSeek Coder',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.14,
        costPer1kOutput: 0.28,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 0.55,
        costPer1kOutput: 2.19,
      },
    ],
  },
  
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    type: 'openai',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 2,
        costPer1kOutput: 6,
      },
      {
        id: 'codestral-latest',
        name: 'Codestral',
        contextWindow: 32000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.3,
        costPer1kOutput: 0.9,
      },
    ],
  },
  
  groq: {
    id: 'groq',
    name: 'Groq',
    type: 'openai',
    apiKeyEnvVar: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.59,
        costPer1kOutput: 0.79,
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        contextWindow: 32768,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.24,
        costPer1kOutput: 0.24,
      },
    ],
  },

  together: {
    id: 'together',
    name: 'Together AI',
    type: 'openai',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic
  },

  fireworks: {
    id: 'fireworks',
    name: 'Fireworks AI',
    type: 'openai',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic
  },
  
  // === TIER 3: Local Providers ===
  
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    type: 'local',
    apiKeyEnvVar: '',
    baseUrl: 'http://localhost:11434/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic from ollama list
  },
  
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'local',
    apiKeyEnvVar: '',
    baseUrl: 'http://localhost:1234/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic
  },
  
  // === TIER 4: Gateway Providers ===
  
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'openrouter/free',
        name: 'OpenRouter Free Router',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 0,
        costPer1kOutput: 0,
      },
    ],
  },
  
  // === TIER 5: Additional Cloud Providers ===
  
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    type: 'openai',
    apiKeyEnvVar: 'XAI_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'grok-3',
        name: 'Grok 3',
        contextWindow: 131072,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 3,
        costPer1kOutput: 15,
      },
      {
        id: 'grok-3-mini',
        name: 'Grok 3 Mini',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 0.3,
        costPer1kOutput: 0.5,
      },
      {
        id: 'grok-vision',
        name: 'Grok Vision',
        contextWindow: 32768,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 5,
        costPer1kOutput: 15,
      },
    ],
    rateLimits: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
    },
  },
  
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    type: 'openai',
    apiKeyEnvVar: 'COHERE_API_KEY',
    baseUrl: 'https://api.cohere.ai/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: true,
    },
    models: [
      {
        id: 'command-r-plus',
        name: 'Command R+',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 2.5,
        costPer1kOutput: 10,
      },
      {
        id: 'command-r',
        name: 'Command R',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.15,
        costPer1kOutput: 0.6,
      },
      {
        id: 'command-light',
        name: 'Command Light',
        contextWindow: 4096,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.03,
        costPer1kOutput: 0.06,
      },
    ],
  },
  
  ai21: {
    id: 'ai21',
    name: 'AI21 Labs',
    type: 'openai',
    apiKeyEnvVar: 'AI21_API_KEY',
    baseUrl: 'https://api.ai21.com/studio/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'jamba-1.5-large',
        name: 'Jamba 1.5 Large',
        contextWindow: 256000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 2,
        costPer1kOutput: 8,
      },
      {
        id: 'jamba-1.5-mini',
        name: 'Jamba 1.5 Mini',
        contextWindow: 256000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.2,
        costPer1kOutput: 0.4,
      },
    ],
  },
  
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity AI',
    type: 'openai',
    apiKeyEnvVar: 'PERPLEXITY_API_KEY',
    baseUrl: 'https://api.perplexity.ai',
    features: {
      streaming: true,
      toolUse: false,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'llama-3.1-sonar-large-128k-online',
        name: 'Sonar Large Online',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 1,
        costPer1kOutput: 1,
      },
      {
        id: 'llama-3.1-sonar-small-128k-online',
        name: 'Sonar Small Online',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.2,
        costPer1kOutput: 0.2,
      },
    ],
  },
  
  replicate: {
    id: 'replicate',
    name: 'Replicate',
    type: 'openai',
    apiKeyEnvVar: 'REPLICATE_API_TOKEN',
    baseUrl: 'https://api.replicate.com/v1',
    features: {
      streaming: true,
      toolUse: false,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic - many models available
  },
  
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face',
    type: 'openai',
    apiKeyEnvVar: 'HF_API_KEY',
    baseUrl: 'https://api-inference.huggingface.co/models',
    features: {
      streaming: true,
      toolUse: false,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic - thousands of models
  },
  
  azure: {
    id: 'azure',
    name: 'Azure OpenAI',
    type: 'openai',
    apiKeyEnvVar: 'AZURE_OPENAI_API_KEY',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: false,
      batching: true,
    },
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (Azure)',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 2.5,
        costPer1kOutput: 10,
      },
    ],
  },
  
  bedrock: {
    id: 'bedrock',
    name: 'AWS Bedrock',
    type: 'anthropic',
    apiKeyEnvVar: 'AWS_ACCESS_KEY_ID',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        name: 'Claude 3.5 Sonnet (Bedrock)',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 3,
        costPer1kOutput: 15,
      },
    ],
  },
  
  vertex: {
    id: 'vertex',
    name: 'Google Vertex AI',
    type: 'google',
    apiKeyEnvVar: 'GOOGLE_APPLICATION_CREDENTIALS',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: true,
      caching: true,
      batching: true,
    },
    models: [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro (Vertex)',
        contextWindow: 1000000,
        maxOutputTokens: 32768,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: true,
        costPer1kInput: 1.25,
        costPer1kOutput: 5,
      },
    ],
  },
  
  sambanova: {
    id: 'sambanova',
    name: 'SambaNova',
    type: 'openai',
    apiKeyEnvVar: 'SAMBANOVA_API_KEY',
    baseUrl: 'https://api.sambanova.ai/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'Meta-Llama-3.3-70B-Instruct',
        name: 'Llama 3.3 70B (SambaNova)',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0,
        costPer1kOutput: 0, // Free tier available
      },
    ],
  },
  
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    type: 'openai',
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [
      {
        id: 'llama-3.3-70b',
        name: 'Llama 3.3 70B (Cerebras)',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0.85,
        costPer1kOutput: 1.2,
      },
    ],
  },
  
  novita: {
    id: 'novita',
    name: 'Novita AI',
    type: 'openai',
    apiKeyEnvVar: 'NOVITA_API_KEY',
    baseUrl: 'https://api.novita.ai/v3/openai',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic
  },
  
  lepton: {
    id: 'lepton',
    name: 'Lepton AI',
    type: 'openai',
    apiKeyEnvVar: 'LEPTON_API_KEY',
    baseUrl: 'https://llama3-3-70b.lepton.run/api/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: false,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic
  },
  
  hyperbolic: {
    id: 'hyperbolic',
    name: 'Hyperbolic',
    type: 'openai',
    apiKeyEnvVar: 'HYPERBOLIC_API_KEY',
    baseUrl: 'https://api.hyperbolic.xyz/v1',
    features: {
      streaming: true,
      toolUse: true,
      vision: true,
      thinking: false,
      caching: false,
      batching: false,
    },
    models: [], // Dynamic
  },
};

// Model Discovery - Auto-fetch available models
export class ModelDiscovery {
  private cache: Map<string, { models: ModelConfig[]; timestamp: number }> = new Map();
  private cacheTimeout = 60 * 60 * 1000; // 1 hour

  async fetchModels(providerId: string): Promise<ModelConfig[]> {
    const provider = ENHANCED_PROVIDERS[providerId];
    if (!provider) return [];

    // Check cache
    const cached = this.cache.get(providerId);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.models;
    }

    let models: ModelConfig[] = [];

    try {
      switch (provider.type) {
        case 'openai':
          models = await this.fetchOpenAIModels(provider);
          break;
        case 'local':
          if (providerId === 'ollama') {
            models = await this.fetchOllamaModels();
          } else {
            models = await this.fetchLMStudioModels(provider);
          }
          break;
        default:
          models = provider.models;
      }
    } catch (e) {
      // Fall back to static models
      models = provider.models;
    }

    // Cache results
    this.cache.set(providerId, { models, timestamp: Date.now() });

    return models;
  }

  private async fetchOpenAIModels(provider: ProviderConfig): Promise<ModelConfig[]> {
    const apiKey = process.env[provider.apiKeyEnvVar];
    if (!apiKey) return provider.models;

    try {
      const response = await fetch(`${provider.baseUrl}/models`, {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return provider.models;

      const data = await response.json() as { data: Array<{ id: string }> };
      return data.data.map(m => ({
        id: m.id,
        name: m.id,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: m.id.includes('vision') || m.id.includes('4o'),
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: m.id.includes('o1') || m.id.includes('o3'),
        costPer1kInput: 0,
        costPer1kOutput: 0,
      }));
    } catch {
      return provider.models;
    }
  }

  private async fetchOllamaModels(): Promise<ModelConfig[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) return [];

      const data = await response.json() as { models: Array<{ name: string; size: number }> };
      return (data.models || []).map(m => ({
        id: m.name,
        name: m.name,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: m.name.includes('vision') || m.name.includes('llava'),
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
      }));
    } catch {
      return [];
    }
  }

  private async fetchLMStudioModels(provider: ProviderConfig): Promise<ModelConfig[]> {
    try {
      const response = await fetch(`${provider.baseUrl}/models`);
      if (!response.ok) return [];

      const data = await response.json() as { data: Array<{ id: string }> };
      return (data.data || []).map(m => ({
        id: m.id,
        name: m.id,
        contextWindow: 128000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        supportsThinking: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
      }));
    } catch {
      return [];
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Key Management
interface KeyConfig {
  providerId: string;
  key: string;
  addedAt: Date;
  lastUsed?: Date;
  isValid: boolean;
}

export class KeyManager {
  private keys: Map<string, KeyConfig> = new Map();
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.octopus', 'keys.json');
  }

  async initialize(): Promise<void> {
    try {
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      
      const data = await fs.readFile(this.configPath, 'utf-8');
      const saved = JSON.parse(data) as Record<string, KeyConfig>;
      
      for (const [id, config] of Object.entries(saved)) {
        const rawKey = config.key ?? "";
        let key = rawKey;
        try {
          const deob = this.deobfuscate(rawKey);
          if (deob.length >= 8) key = deob;
        } catch {
          key = rawKey;
        }
        this.keys.set(id, {
          ...config,
          key,
          addedAt: new Date(config.addedAt),
          lastUsed: config.lastUsed ? new Date(config.lastUsed) : undefined,
        });
      }
    } catch {
      // No existing config
    }
  }

  async setKey(providerId: string, key: string): Promise<boolean> {
    // Validate key
    const valid = await this.validateKey(providerId, key);
    
    const config: KeyConfig = {
      providerId,
      key,
      addedAt: new Date(),
      isValid: valid,
    };

    this.keys.set(providerId, config);
    await this.save();

    return valid;
  }

  async getKey(providerId: string): Promise<string | null> {
    // 1. Check stored keys
    const stored = this.keys.get(providerId);
    if (stored?.isValid) {
      stored.lastUsed = new Date();
      return stored.key;
    }

    // 2. Check environment
    const provider = ENHANCED_PROVIDERS[providerId];
    if (provider?.apiKeyEnvVar && process.env[provider.apiKeyEnvVar]) {
      return process.env[provider.apiKeyEnvVar]!;
    }

    return null;
  }

  async validateKey(providerId: string, key: string): Promise<boolean> {
    const provider = ENHANCED_PROVIDERS[providerId];
    if (!provider) return false;

    // Local providers don't need keys
    if (provider.type === 'local') return true;

    try {
      let url: string;
      let headers: Record<string, string>;

      if (provider.type === 'anthropic') {
        url = `${provider.baseUrl}/v1/messages`;
        headers = {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        };
        // Make a minimal request
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        return response.status !== 401;
      } else {
        url = `${provider.baseUrl}/models`;
        headers = {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        };
        const response = await fetch(url, { headers });
        return response.status !== 401;
      }
    } catch {
      return false;
    }
  }

  async removeKey(providerId: string): Promise<void> {
    this.keys.delete(providerId);
    await this.save();
  }

  listProviders(): Array<{ id: string; hasKey: boolean; isValid: boolean }> {
    return Object.keys(ENHANCED_PROVIDERS).map(id => {
      const stored = this.keys.get(id);
      const envKey = ENHANCED_PROVIDERS[id]?.apiKeyEnvVar;
      const hasEnvKey = Boolean(envKey && process.env[envKey]);
      
      return {
        id,
        hasKey: Boolean(stored) || hasEnvKey,
        isValid: stored?.isValid || hasEnvKey,
      };
    });
  }

  private async save(): Promise<void> {
    const data: Record<string, KeyConfig> = {};
    for (const [id, config] of this.keys) {
      // Don't save the actual key in plain text
      data[id] = {
        ...config,
        key: this.obfuscate(config.key),
      };
    }
    
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private obfuscate(key: string): string {
    // Simple XOR obfuscation (not secure, but prevents casual viewing)
    const secret = 'octopus-key-v1';
    return Buffer.from(
      key.split('').map((c, i) => 
        c.charCodeAt(0) ^ secret.charCodeAt(i % secret.length)
      )
    ).toString('base64');
  }

  private deobfuscate(obfuscated: string): string {
    const secret = 'octopus-key-v1';
    const bytes = Buffer.from(obfuscated, 'base64');
    return bytes.map((b, i) => 
      b ^ secret.charCodeAt(i % secret.length)
    ).toString();
  }
}

// Provider detection helpers
const MODEL_PREFIXES: Array<[string, string]> = [
  ['claude-', 'anthropic'],
  ['gpt-', 'openai'],
  ['o1', 'openai'],
  ['o3', 'openai'],
  ['o4', 'openai'],
  ['gemini-', 'google'],
  ['deepseek-', 'deepseek'],
  ['mistral', 'mistral'],
  ['codestral', 'mistral'],
  ['llama', 'groq'],
  ['mixtral', 'groq'],
  ['qwen', 'ollama'],
  ['phi', 'ollama'],
  ['grok', 'xai'],
  ['command', 'cohere'],
  ['jamba', 'ai21'],
  ['sonar', 'perplexity'],
];

export function detectProviderFromModel(model: string): string {
  const lower = model.toLowerCase();
  if (lower.startsWith('openrouter/') || lower === 'openrouter') {
    return 'openrouter';
  }
  if (model.includes('/')) {
    return model.split('/')[0]!;
  }
  
  const m = model.toLowerCase();
  for (const [prefix, provider] of MODEL_PREFIXES) {
    if (m.startsWith(prefix)) return provider;
  }
  
  return 'openai'; // Default
}

export function getModelConfig(model: string): ModelConfig | undefined {
  const providerId = detectProviderFromModel(model);
  const provider = ENHANCED_PROVIDERS[providerId];
  
  if (!provider) return undefined;
  
  const modelId = model.includes('/') ? model.split('/').slice(1).join('/') : model;
  return provider.models.find(m => m.id === modelId || m.name === modelId);
}

export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return ENHANCED_PROVIDERS[providerId];
}

export function getAllProviders(): ProviderConfig[] {
  return Object.values(ENHANCED_PROVIDERS);
}

export function getAllModels(): Array<{ provider: string; model: ModelConfig }> {
  const result: Array<{ provider: string; model: ModelConfig }> = [];
  
  for (const [providerId, provider] of Object.entries(ENHANCED_PROVIDERS)) {
    for (const model of provider.models) {
      result.push({ provider: providerId, model });
    }
  }
  
  return result;
}
