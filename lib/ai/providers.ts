import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
import { groq } from '@ai-sdk/groq';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';
import { google } from '@ai-sdk/google';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        // Old model mappings - keep for backward compatibility
        'chat-model': groq('llama3-70b-8192'),
        'chat-model-reasoning': openai('o4-mini'),
        'title-model': groq('llama3-70b-8192'),
        'artifact-model': anthropic('claude-3-5-sonnet-20240620'),
        
        // OpenAI Models
        'gpt-4.1': openai('gpt-4.1'),
        'gpt-4.1-mini': openai('gpt-4.1-mini'),
        'o4-mini': openai('o4-mini'),
        
        // Groq Models
        'deepseek-r1-distill-llama-70b': groq('deepseek-r1-distill-llama-70b'),
        'llama-3.3-70b-versatile': groq('llama-3.3-70b-versatile'),
        
        // Anthropic Models
        'claude-sonnet-4-20250514': anthropic('claude-sonnet-4-20250514'),
        'claude-3-7-sonnet-20250219': anthropic('claude-3-7-sonnet-20250219'),
        'claude-4-opus-20250514': anthropic('claude-4-opus-20250514'),
        
        // Google Models
        'gemini-2.5-flash': google('gemini-2.5-flash'),
        'gemini-2.5-flash-lite': google('gemini-2.5-flash-lite'),
        'gemini-2.5-pro': google('gemini-2.5-pro'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
