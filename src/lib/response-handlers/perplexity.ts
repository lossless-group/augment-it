import { AIResponse } from '../types';

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations: string[];
  choices: [{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
  }];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function handlePerplexityResponse(response: Response): Promise<AIResponse> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json() as PerplexityResponse;
  const content = data.choices[0]?.message?.content || '';
  const citations = data.citations || [];

  // Format citations as a numbered list with links
  const citationsMarkdown = citations.length > 0
    ? `\n\n## References\n\n${citations.map((url, index) => (
        `${index + 1}. [${new URL(url).hostname}](${url})`
      )).join('\n')}`
    : '';

  // Combine the content with citations
  const formattedContent = `${content}${citationsMarkdown}`;

  return {
    raw: data,
    parsed: null, // Don't try to parse as JSON since we want to preserve the markdown
    content: formattedContent,
    model: data.model,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens
    }
  };
}