import { AIResponse } from '../types';

interface GPTResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: [{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function handleGPTResponse(response: Response): Promise<AIResponse> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as GPTResponse;
  const content = data.choices[0]?.message?.content || '';

  try {
    // Since we request JSON format, try to parse the content
    const parsedContent = JSON.parse(content);
    return {
      raw: data,
      parsed: parsedContent,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  } catch (e) {
    // If JSON parsing fails, return the raw content
    return {
      raw: data,
      parsed: null,
      content: content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  }
}