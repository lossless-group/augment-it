// NATS subject handlers. Subjects:
//   - record_set.list.requested  → reply with all record sets
//   - record_set.get.requested   → reply with one record set + its rows
//   - record_set.create.requested → create a new record set (called by ingest); replies + broadcasts record_set.created
//   - row.list.requested         → reply with rows (optionally filtered by record_set_id)
//   - row.update.requested       → mutate, reply, broadcast row.updated

import { JSONCodec, type NatsConnection } from 'nats';
import {
  addHelpfulLink,
  addSocial,
  archiveRecordSet,
  archiveRow,
  createRecordSet,
  deleteRecordSet,
  getRecordSet,
  getRow,
  listRecordSets,
  listRows,
  promoteRecordSet,
  removeHelpfulLink,
  removeSocial,
  updateRow,
  type ColumnSchema,
  type RecordSet,
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
        derived_from?: RecordSet['derived_from'];
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

  // record_set.delete.requested — drops the record set and ALL its rows.
  // Walking-skeleton behavior: no soft-delete, no archive. Broadcasts
  // record_set.deleted so UIs can react.
  (async () => {
    const sub = nc.subscribe('record_set.delete.requested');
    for await (const msg of sub) {
      const { record_set_id } = jc.decode(msg.data) as { record_set_id: string };
      const result = await deleteRecordSet(record_set_id);
      if (msg.reply) msg.respond(jc.encode(result));
      if (result.deleted) {
        nc.publish(
          'record_set.deleted',
          jc.encode({ record_set_id, row_count: result.row_count }),
        );
      }
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

  // row.get.requested — fetch a single row by id.
  (async () => {
    const sub = nc.subscribe('row.get.requested');
    for await (const msg of sub) {
      const { row_id } = jc.decode(msg.data) as { row_id: string };
      if (msg.reply) msg.respond(jc.encode({ row: getRow(row_id) ?? null }));
    }
  })();

  // row.helpful_links.add.requested — append a link to row.fields.helpful_links.
  // Reply + broadcast row.updated so any open Response Reviewer refreshes.
  (async () => {
    const sub = nc.subscribe('row.helpful_links.add.requested');
    for await (const msg of sub) {
      const params = jc.decode(msg.data) as {
        row_id: string;
        url: string;
        label?: string;
        note?: string;
        response_id?: string | null;
      };
      try {
        const row = await addHelpfulLink(params);
        if (msg.reply) msg.respond(jc.encode({ row }));
        nc.publish(
          'row.updated',
          jc.encode({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // row.helpful_links.remove.requested — drop a link by link_id.
  (async () => {
    const sub = nc.subscribe('row.helpful_links.remove.requested');
    for await (const msg of sub) {
      const { row_id, link_id } = jc.decode(msg.data) as {
        row_id: string;
        link_id: string;
      };
      try {
        const row = await removeHelpfulLink(row_id, link_id);
        if (msg.reply) msg.respond(jc.encode({ row }));
        nc.publish(
          'row.updated',
          jc.encode({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // row.socials.add.requested — upsert a SocialProfile into row.fields.socials.
  // Replace-by-pack_id: at most one entry per pack_id on a row. See
  // context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back.
  (async () => {
    const sub = nc.subscribe('row.socials.add.requested');
    for await (const msg of sub) {
      const params = jc.decode(msg.data) as {
        row_id: string;
        pack_id: string;
        url: string;
        display_name: string;
        confidence: number;
        snippet?: string;
        source_metadata?: Record<string, unknown>;
        response_id: string;
      };
      try {
        const row = await addSocial(params);
        if (msg.reply) msg.respond(jc.encode({ row }));
        nc.publish(
          'row.updated',
          jc.encode({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // row.socials.remove.requested — drop one profile by socials_id.
  (async () => {
    const sub = nc.subscribe('row.socials.remove.requested');
    for await (const msg of sub) {
      const { row_id, socials_id } = jc.decode(msg.data) as {
        row_id: string;
        socials_id: string;
      };
      try {
        const row = await removeSocial(row_id, socials_id);
        if (msg.reply) msg.respond(jc.encode({ row }));
        nc.publish(
          'row.updated',
          jc.encode({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // record_set.promote.requested — snapshot a source set into a canonical
  // successor. Archives the source. See
  // context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md.
  (async () => {
    const sub = nc.subscribe('record_set.promote.requested');
    for await (const msg of sub) {
      const { source_record_set_id, name } = jc.decode(msg.data) as {
        source_record_set_id: string;
        name?: string;
      };
      try {
        const result = await promoteRecordSet({ source_record_set_id, name });
        if (msg.reply) msg.respond(jc.encode(result));
        // Broadcast both the create and the archive so subscribers can react.
        nc.publish(
          'record_set.created',
          jc.encode({
            record_set_id: result.record_set.record_set_id,
            name: result.record_set.name,
            row_count: result.rows.length,
            kind: 'promotion',
          }),
        );
        nc.publish(
          'record_set.archived',
          jc.encode({ record_set_id: source_record_set_id }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // record_set.archive.requested — mark a set as archived without
  // promoting. Used to manually hide a stale or duplicate set.
  (async () => {
    const sub = nc.subscribe('record_set.archive.requested');
    for await (const msg of sub) {
      const { record_set_id } = jc.decode(msg.data) as { record_set_id: string };
      try {
        const rs = await archiveRecordSet(record_set_id);
        if (msg.reply) msg.respond(jc.encode({ record_set: rs }));
        nc.publish('record_set.archived', jc.encode({ record_set_id }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // row.archive.requested — set Row.fields.archived = true. The only
  // mechanism for a record to drop out of the canonical lineage at the
  // next promotion (per the spec).
  (async () => {
    const sub = nc.subscribe('row.archive.requested');
    for await (const msg of sub) {
      const { row_id } = jc.decode(msg.data) as { row_id: string };
      try {
        const row = await archiveRow(row_id);
        if (msg.reply) msg.respond(jc.encode({ row }));
        nc.publish(
          'row.updated',
          jc.encode({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();
}
