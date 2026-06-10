// ingest-service — subscribes to record_set.ingest.requested, parses CSV,
// publishes record_set.create.requested to row-store. Owns no domain data;
// stateless transformation.
//
// Wire contract (NATS):
//   record_set.ingest.requested {
//     filename: string,
//     csv: string,                  // CSV text payload
//     name?: string                 // optional record-set label, defaults to filename
//   }
//   → publishes record_set.create.requested { name, schema, rows }
//   → replies (if msg.reply set) { record_set, rows } as returned by row-store

import { connect, JSONCodec } from 'nats';
import { parseCsv } from './parse';

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

const jc = JSONCodec();

async function main(): Promise<void> {
  const nc = await connect({ servers: NATS_URL, name: 'ingest-service' });
  console.log(JSON.stringify({ level: 'info', msg: 'nats connected', url: NATS_URL }));

  const sub = nc.subscribe('record_set.ingest.requested');
  console.log(JSON.stringify({ level: 'info', msg: 'ingest-service ready' }));

  for await (const msg of sub) {
    try {
      const { filename, csv, name, predecessor_record_set_id } = jc.decode(msg.data) as {
        filename: string;
        csv: string;
        name?: string;
        predecessor_record_set_id?: string;
      };
      const parsed = parseCsv(csv, filename);
      const createReply = await nc.request(
        'record_set.create.requested',
        jc.encode({
          name: name ?? filename,
          schema: parsed.schema,
          rows: parsed.rows,
          ...(predecessor_record_set_id ? { predecessor_record_set_id } : {}),
        }),
        { timeout: 10_000 },
      );
      if (msg.reply) msg.respond(createReply.data);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: 'error', msg: 'ingest failed', error }));
      if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
    }
  }
}

main().catch((err) => {
  console.error('ingest-service failed to boot', err);
  process.exit(1);
});
