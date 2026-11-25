import type { Queryable } from '../../db/pool.js';

export interface AuditEntry {
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly requestId?: string | null;
}

/** Append-only audit write path. Never store secrets or raw credentials in metadata. */
export const writeAudit = async (db: Queryable, entry: AuditEntry): Promise<void> => {
  await db.query(
    `INSERT INTO audit_log (organization_id, actor_user_id, action, entity_type, entity_id, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.organizationId,
      entry.actorUserId,
      entry.action,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.metadata ?? {}),
      entry.requestId ?? null,
    ],
  );
};
