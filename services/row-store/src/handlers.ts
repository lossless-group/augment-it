// NATS subject handlers. Subjects:
//   - record_set.list.requested  → reply with all record sets
//   - record_set.get.requested   → reply with one record set + its rows
//   - record_set.create.requested → create a new record set (called by ingest); replies + broadcasts record_set.created
//   - row.list.requested         → reply with rows (optionally filtered by record_set_id)
//   - row.update.requested       → mutate, reply, broadcast row.updated

import { type NatsConnection } from '@nats-io/transport-node';
import {
  addHelpfulLink,
  addSocial,
  addToVariantFamily,
  archiveRecordSet,
  archiveRow,
  createRecordSet,
  createVariantFamily,
  deleteRecordSet,
  dissolveVariantFamily,
  getRecordSet,
  getRow,
  listRecordSets,
  listRows,
  listVariantFamilies,
  promoteRecordSet,
  removeFromVariantFamily,
  removeHelpfulLink,
  removeSocial,
  suggestVariantFamily,
  updateRow,
  updateVariantFamily,
  type ColumnSchema,
  type RecordSet,
} from './store';

export function registerHandlers(nc: NatsConnection): void {
  // record_set.list.requested
  (async () => {
    const sub = nc.subscribe('record_set.list.requested');
    for await (const msg of sub) {
      if (msg.reply) msg.respond(JSON.stringify({ record_sets: listRecordSets() }));
    }
  })();

  // record_set.get.requested
  (async () => {
    const sub = nc.subscribe('record_set.get.requested');
    for await (const msg of sub) {
      const { record_set_id } = msg.json() as { record_set_id: string };
      const rs = getRecordSet(record_set_id);
      const rows = rs ? listRows(record_set_id) : [];
      if (msg.reply) msg.respond(JSON.stringify({ record_set: rs ?? null, rows }));
    }
  })();

  // record_set.create.requested (called by ingest service)
  (async () => {
    const sub = nc.subscribe('record_set.create.requested');
    for await (const msg of sub) {
      const payload = msg.json() as {
        name: string;
        schema: ColumnSchema;
        rows: { fields: Record<string, unknown> }[];
        derived_from?: RecordSet['derived_from'];
        predecessor_record_set_id?: string;
      };
      const result = await createRecordSet(payload);
      // If the new set carries promoted_from (i.e. the caller named a
      // predecessor and the link took), broadcast the predecessor's
      // archive too so UIs that filter on `archived` refresh.
      if (result.record_set.promoted_from?.record_set_ids?.[0]) {
        nc.publish(
          'record_set.updated',
          JSON.stringify({
            record_set_id: result.record_set.promoted_from.record_set_ids[0],
            archived: true,
          }),
        );
      }
      if (msg.reply) msg.respond(JSON.stringify(result));
      nc.publish(
        'record_set.created',
        JSON.stringify({
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
      const args = (msg.data.length > 0 ? msg.json() : {}) as {
        record_set_id?: string;
      };
      if (msg.reply) msg.respond(JSON.stringify({ rows: listRows(args.record_set_id) }));
    }
  })();

  // record_set.delete.requested — drops the record set and ALL its rows.
  // Walking-skeleton behavior: no soft-delete, no archive. Broadcasts
  // record_set.deleted so UIs can react.
  (async () => {
    const sub = nc.subscribe('record_set.delete.requested');
    for await (const msg of sub) {
      const { record_set_id } = msg.json() as { record_set_id: string };
      const result = await deleteRecordSet(record_set_id);
      if (msg.reply) msg.respond(JSON.stringify(result));
      if (result.deleted) {
        nc.publish(
          'record_set.deleted',
          JSON.stringify({ record_set_id, row_count: result.row_count }),
        );
      }
    }
  })();

  // row.update.requested
  (async () => {
    const sub = nc.subscribe('row.update.requested');
    for await (const msg of sub) {
      const { row_id, fields } = msg.json() as {
        row_id: string;
        fields: Record<string, unknown>;
      };
      const row = await updateRow(row_id, fields);
      if (msg.reply) msg.respond(JSON.stringify({ row }));
      nc.publish(
        'row.updated',
        JSON.stringify({
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
      const { row_id } = msg.json() as { row_id: string };
      if (msg.reply) msg.respond(JSON.stringify({ row: getRow(row_id) ?? null }));
    }
  })();

  // row.helpful_links.add.requested — append a link to row.fields.helpful_links.
  // Reply + broadcast row.updated so any open Response Reviewer refreshes.
  (async () => {
    const sub = nc.subscribe('row.helpful_links.add.requested');
    for await (const msg of sub) {
      const params = msg.json() as {
        row_id: string;
        url: string;
        label?: string;
        note?: string;
        response_id?: string | null;
      };
      try {
        const row = await addHelpfulLink(params);
        if (msg.reply) msg.respond(JSON.stringify({ row }));
        nc.publish(
          'row.updated',
          JSON.stringify({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // row.helpful_links.remove.requested — drop a link by link_id.
  (async () => {
    const sub = nc.subscribe('row.helpful_links.remove.requested');
    for await (const msg of sub) {
      const { row_id, link_id } = msg.json() as {
        row_id: string;
        link_id: string;
      };
      try {
        const row = await removeHelpfulLink(row_id, link_id);
        if (msg.reply) msg.respond(JSON.stringify({ row }));
        nc.publish(
          'row.updated',
          JSON.stringify({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // row.socials.add.requested — upsert a SocialProfile into row.fields.socials.
  // Replace-by-pack_id: at most one entry per pack_id on a row. See
  // context-v/blueprints/Packs-and-Bundles-Pattern.md §Row write-back.
  (async () => {
    const sub = nc.subscribe('row.socials.add.requested');
    for await (const msg of sub) {
      const params = msg.json() as {
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
        if (msg.reply) msg.respond(JSON.stringify({ row }));
        nc.publish(
          'row.updated',
          JSON.stringify({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // row.socials.remove.requested — drop one profile by socials_id.
  (async () => {
    const sub = nc.subscribe('row.socials.remove.requested');
    for await (const msg of sub) {
      const { row_id, socials_id } = msg.json() as {
        row_id: string;
        socials_id: string;
      };
      try {
        const row = await removeSocial(row_id, socials_id);
        if (msg.reply) msg.respond(JSON.stringify({ row }));
        nc.publish(
          'row.updated',
          JSON.stringify({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // record_set.promote.requested — snapshot a source set into a canonical
  // successor. Archives the source. See
  // context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md.
  (async () => {
    const sub = nc.subscribe('record_set.promote.requested');
    for await (const msg of sub) {
      const { source_record_set_id, name } = msg.json() as {
        source_record_set_id: string;
        name?: string;
      };
      try {
        const result = await promoteRecordSet({ source_record_set_id, name });
        if (msg.reply) msg.respond(JSON.stringify(result));
        // Broadcast both the create and the archive so subscribers can react.
        nc.publish(
          'record_set.created',
          JSON.stringify({
            record_set_id: result.record_set.record_set_id,
            name: result.record_set.name,
            row_count: result.rows.length,
            kind: 'promotion',
          }),
        );
        nc.publish(
          'record_set.archived',
          JSON.stringify({ record_set_id: source_record_set_id }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // record_set.archive.requested — mark a set as archived without
  // promoting. Used to manually hide a stale or duplicate set.
  (async () => {
    const sub = nc.subscribe('record_set.archive.requested');
    for await (const msg of sub) {
      const { record_set_id } = msg.json() as { record_set_id: string };
      try {
        const rs = await archiveRecordSet(record_set_id);
        if (msg.reply) msg.respond(JSON.stringify({ record_set: rs }));
        nc.publish('record_set.archived', JSON.stringify({ record_set_id }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // row.archive.requested — set Row.fields.archived = true. The only
  // mechanism for a record to drop out of the canonical lineage at the
  // next promotion (per the spec).
  (async () => {
    const sub = nc.subscribe('row.archive.requested');
    for await (const msg of sub) {
      const { row_id } = msg.json() as { row_id: string };
      try {
        const row = await archiveRow(row_id);
        if (msg.reply) msg.respond(JSON.stringify({ row }));
        nc.publish(
          'row.updated',
          JSON.stringify({
            row_id: row.row_id,
            record_set_id: row.record_set_id,
            fields: row.fields,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // --- Variant family handlers ---
  // See context-v/specs/Record-Set-Family-Grouping.md.
  // Every mutator broadcasts `variant_family.{created|updated|deleted}`
  // for family-level changes plus `record_set.updated` for any affected
  // member sets so the sidebar re-renders without polling.

  // variant_family.list.requested
  (async () => {
    const sub = nc.subscribe('variant_family.list.requested');
    for await (const msg of sub) {
      if (msg.reply) msg.respond(JSON.stringify({ variant_families: listVariantFamilies() }));
    }
  })();

  // variant_family.create.requested
  (async () => {
    const sub = nc.subscribe('variant_family.create.requested');
    for await (const msg of sub) {
      const args = msg.json() as {
        label: string;
        record_set_ids: string[];
        stem?: string | null;
      };
      try {
        const result = await createVariantFamily(args);
        if (msg.reply) msg.respond(JSON.stringify(result));
        nc.publish(
          'variant_family.created',
          JSON.stringify({
            variant_family_id: result.family.variant_family_id,
            label: result.family.label,
            record_set_ids: result.record_sets.map((r) => r.record_set_id),
          }),
        );
        for (const rs of result.record_sets) {
          nc.publish(
            'record_set.updated',
            JSON.stringify({
              record_set_id: rs.record_set_id,
              variant_family_id: rs.variant_family_id,
              variant_family_label: rs.variant_family_label,
            }),
          );
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // variant_family.update.requested
  (async () => {
    const sub = nc.subscribe('variant_family.update.requested');
    for await (const msg of sub) {
      const args = msg.json() as { variant_family_id: string; label: string };
      try {
        const result = await updateVariantFamily(args);
        if (msg.reply) msg.respond(JSON.stringify(result));
        nc.publish(
          'variant_family.updated',
          JSON.stringify({
            variant_family_id: result.family.variant_family_id,
            label: result.family.label,
          }),
        );
        for (const rs of result.record_sets) {
          nc.publish(
            'record_set.updated',
            JSON.stringify({
              record_set_id: rs.record_set_id,
              variant_family_id: rs.variant_family_id,
              variant_family_label: rs.variant_family_label,
            }),
          );
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // variant_family.add.requested
  (async () => {
    const sub = nc.subscribe('variant_family.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as { variant_family_id: string; record_set_id: string };
      try {
        const result = await addToVariantFamily(args);
        if (msg.reply) msg.respond(JSON.stringify(result));
        nc.publish(
          'record_set.updated',
          JSON.stringify({
            record_set_id: result.record_set.record_set_id,
            variant_family_id: result.record_set.variant_family_id,
            variant_family_label: result.record_set.variant_family_label,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // variant_family.remove.requested
  (async () => {
    const sub = nc.subscribe('variant_family.remove.requested');
    for await (const msg of sub) {
      const args = msg.json() as { record_set_id: string };
      try {
        const result = await removeFromVariantFamily(args);
        if (msg.reply) msg.respond(JSON.stringify(result));
        nc.publish(
          'record_set.updated',
          JSON.stringify({
            record_set_id: result.record_set.record_set_id,
            variant_family_id: result.record_set.variant_family_id ?? null,
            variant_family_label: result.record_set.variant_family_label ?? null,
          }),
        );
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // variant_family.dissolve.requested
  (async () => {
    const sub = nc.subscribe('variant_family.dissolve.requested');
    for await (const msg of sub) {
      const args = msg.json() as { variant_family_id: string };
      try {
        const result = await dissolveVariantFamily(args);
        if (msg.reply) msg.respond(JSON.stringify(result));
        if (result.dissolved) {
          nc.publish(
            'variant_family.deleted',
            JSON.stringify({ variant_family_id: args.variant_family_id }),
          );
          for (const id of result.record_set_ids) {
            nc.publish(
              'record_set.updated',
              JSON.stringify({ record_set_id: id, variant_family_id: null, variant_family_label: null }),
            );
          }
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // record_set.suggest_variant_family.requested — read-only heuristic
  (async () => {
    const sub = nc.subscribe('record_set.suggest_variant_family.requested');
    for await (const msg of sub) {
      const args = msg.json() as { record_set_id: string };
      try {
        const result = suggestVariantFamily(args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
}
