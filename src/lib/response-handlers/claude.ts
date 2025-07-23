import Anthropic from '@anthropic-ai/sdk';
import { AIResponse } from '../types';

interface ClaudeResponse {
  content: [{
    text: string;
    type: string;
  }];
  id: string;
  model: string;
  role: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export async function handleClaudeResponse(response: Response, apiKey: string): Promise<AIResponse> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message || `HTTP error! status: ${response.status}`);
  }

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: apiKey
  });

  const data = await response.json() as ClaudeResponse;

  // Extract the content from Claude's response
  const content = data.content[0]?.text || '';

  try {
    // Since we request JSON format, try to parse the content
    const parsedContent = JSON.parse(content);
    return {
      raw: data,
      parsed: parsedContent,
      model: data.model,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
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
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      }
    };
  }
}

// Helper function to create a new Claude message
export async function createClaudeMessage(prompt: string, apiKey: string): Promise<AIResponse> {
  const anthropic = new Anthropic({
    apiKey: apiKey
  });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    // Convert Anthropic response to our AIResponse format
    return {
      raw: msg,
      parsed: null,
      content: msg.content[0].text,
      model: msg.model,
      usage: {
        promptTokens: 0, // Claude 3 doesn't provide token counts yet
        completionTokens: 0,
        totalTokens: 0
      }
    };
  } catch (error) {
    throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}