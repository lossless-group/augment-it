// Update the QueryResponse interface
export interface QueryResponse {
  id: string;
  promptSectionId: string;
  modelId: string;
  content: string;
  timestamp: string;
  status: 'connecting' | 'pending' | 'completed' | 'error';
  error?: string;
  requestTemplate?: string;
  isJavaScript?: boolean;
  sectionTitle?: string;
}