import type { Snowflake } from '../../globals';
import type { APIAuditLog, AuditLogEvent } from '../../payloads/v10/auditLog';
/**
 * @see {@link https://discord.com/developers/docs/resources/audit-log#get-guild-audit-log}
 */
export interface RESTGetAPIAuditLogQuery {
    /**
     * Filter the log for actions made by a user
     */
    user_id?: Snowflake;
    /**
     * The type of audit log events
     */
    action_type?: AuditLogEvent;
    /**
     * Filter the log before a certain entry ID
     */
    before?: Snowflake;
    /**
     * Filter the log after a certain entry ID
     */
    after?: Snowflake;
    /**
     * How many entries are returned (default 50, minimum 1, maximum 100)
     *
     * @defaultValue `50`
     */
    limit?: number;
}
export type RESTGetAPIAuditLogResult = APIAuditLog;
//# sourceMappingURL=auditLog.d.ts.map