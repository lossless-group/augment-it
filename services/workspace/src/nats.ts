import { connect, type NatsConnection } from 'nats';

let conn: NatsConnection | null = null;

export async function connectNats(url: string): Promise<NatsConnection> {
  if (conn) return conn;
  conn = await connect({ servers: url, name: 'workspace-service' });
  return conn;
}

export function getNats(): NatsConnection {
  if (!conn) throw new Error('NATS not connected — call connectNats() first');
  return conn;
}
