import type { APIAuditLog, AuditLogEvent } from '../../payloads/v6/auditLog';
/**
 * https://discord.com/developers/docs/resources/audit-log#get-guild-audit-log
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIAuditLogQuery {
    user_id?: string;
    action_type?: AuditLogEvent;
    before?: string;
    limit?: number;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIAuditLogResult = APIAuditLog;
//# sourceMappingURL=auditLog.d.ts.map