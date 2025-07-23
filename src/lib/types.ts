export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIResponse {
  raw: any;
  parsed: any | null;
  content?: string;
  model: string;
  usage: TokenUsage;
}