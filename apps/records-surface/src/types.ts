export type ConnectorId = 'serpapi-site-search' | 'firecrawl-nav-scan' | 'firecrawl-nav-agent';

export type Candidate = {
  url: string;
  title?: string;
  anchor_text?: string;
  confidence?: number;
};

export type FireResult = {
  connector_id: ConnectorId;
  candidates: Candidate[];
  fired_at: string;
  error?: string;
};

export type FireState =
  | { kind: 'idle' }
  | { kind: 'firing'; connector_id: ConnectorId }
  | { kind: 'done'; result: FireResult };
