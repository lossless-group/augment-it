// xlsx-ingest service — sibling to ingest (CSV). Listens for
// record_set.ingest.xlsx.requested, parses the workbook, publishes
// record_set.create.requested with the same shape the CSV ingest uses.
// Adding this service required ZERO changes to row-store; that's the demo.

import { connect } from '@nats-io/transport-node';
import { parseXlsx } from './parse';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

async function main(): Promise<void> {
  const nc = await connect({ servers: NATS_URL, name: 'xlsx-ingest-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));

  const sub = nc.subscribe('record_set.ingest.xlsx.requested');
  console.log(JSON.stringify({ level: 'info', msg: 'xlsx-ingest-service ready' }));

  for await (const msg of sub) {
    try {
      const { filename, xlsx_b64, name } = msg.json() as {
        filename: string;
        xlsx_b64: string;
        name?: string;
      };
      const buffer = Buffer.from(xlsx_b64, 'base64');
      const parsed = await parseXlsx(buffer, filename);
      const createReply = await nc.request(
        'record_set.create.requested',
        JSON.stringify({
          name: name ?? filename,
          schema: parsed.schema,
          rows: parsed.rows,
        }),
        { timeout: 15_000 },
      );
      if (msg.reply) msg.respond(createReply.data);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: 'error', msg: 'xlsx ingest failed', error }));
      if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
    }
  }
}

main().catch((err) => {
  console.error('xlsx-ingest-service failed to boot', err);
  process.exit(1);
});
