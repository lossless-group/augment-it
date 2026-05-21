// NATS subject handlers. Subjects:
//   - record_set.list.requested  → reply with all record sets
//   - record_set.get.requested   → reply with one record set + its rows
//   - record_set.create.requested → create a new record set (called by ingest); replies + broadcasts record_set.created
//   - row.list.requested         → reply with rows (optionally filtered by record_set_id)
//   - row.update.requested       → mutate, reply, broadcast row.updated

import { JSONCodec, type NatsConnection } from 'nats';
import {
  createRecordSet,
  getRecordSet,
  listRecordSets,
  listRows,
  updateRow,
  type ColumnSchema,
} from './store';

const jc = JSONCodec();

export function registerHandlers(nc: NatsConnection): void {
  // record_set.list.requested
  (async () => {
    const sub = nc.subscribe('record_set.list.requested');
    for await (const msg of sub) {
      if (msg.reply) msg.respond(jc.encode({ record_sets: listRecordSets() }));
    }
  })();

  // record_set.get.requested
  (async () => {
    const sub = nc.subscribe('record_set.get.requested');
    for await (const msg of sub) {
      const { record_set_id } = jc.decode(msg.data) as { record_set_id: string };
      const rs = getRecordSet(record_set_id);
      const rows = rs ? listRows(record_set_id) : [];
      if (msg.reply) msg.respond(jc.encode({ record_set: rs ?? null, rows }));
    }
  })();

  // record_set.create.requested (called by ingest service)
  (async () => {
    const sub = nc.subscribe('record_set.create.requested');
    for await (const msg of sub) {
      const payload = jc.decode(msg.data) as {
        name: string;
        schema: ColumnSchema;
        rows: { fields: Record<string, unknown> }[];
      };
      const result = await createRecordSet(payload);
      if (msg.reply) msg.respond(jc.encode(result));
      nc.publish(
        'record_set.created',
        jc.encode({
          record_set_id: result.record_set.record_set_id,
          name: result.record_set.name,
          schema: result.record_set.schema,
          row_count: result.rows.length,
        }),
      );
    }
  })();

  // row.list.requested
  (async () => {
    const sub = nc.subscribe('row.list.requested');
    for await (const msg of sub) {
      const args = (msg.data.length > 0 ? jc.decode(msg.data) : {}) as {
        record_set_id?: string;
      };
      if (msg.reply) msg.respond(jc.encode({ rows: listRows(args.record_set_id) }));
    }
  })();

  // row.update.requested
  (async () => {
    const sub = nc.subscribe('row.update.requested');
    for await (const msg of sub) {
      const { row_id, fields } = jc.decode(msg.data) as {
        row_id: string;
        fields: Record<string, unknown>;
      };
      const row = await updateRow(row_id, fields);
      if (msg.reply) msg.respond(jc.encode({ row }));
      nc.publish(
        'row.updated',
        jc.encode({
          row_id: row.row_id,
          record_set_id: row.record_set_id,
          fields: row.fields,
        }),
      );
    }
  })();
}
