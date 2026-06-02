// Connector registry. Add a provider here once and packs can reference it by
// id; the dispatcher in search.ts resolves the function via getConnector.

import type { Connector, ProviderId } from './types';
import { tavilyConnector } from './tavily';
import { searxngConnector } from './searxng';
import { serpapiConnector } from './serpapi';

const CONNECTORS: Record<ProviderId, Connector> = {
  tavily: tavilyConnector,
  searxng: searxngConnector,
  serpapi: serpapiConnector,
};

export function getConnector(id: ProviderId): Connector {
  const connector = CONNECTORS[id];
  if (!connector) throw new Error(`unknown search provider: ${id}`);
  return connector;
}

export type { Connector, ConnectorOpts, ConnectorResult, ProviderId } from './types';
