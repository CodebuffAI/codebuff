import type { Snowflake } from '../../globals';
import type { APIEntitlement, APISKU, APISubscription } from '../../v9';
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#list-entitlements}
 */
export interface RESTGetAPIEntitlementsQuery {
    /**
     * User ID to look up entitlements for
     */
    user_id?: Snowflake | undefined;
    /**
     * Optional list of SKU IDs to check entitlements for
     * Comma-delimited set of snowflakes
     */
    sku_ids?: string | undefined;
    /**
     * Retrieve entitlements before this entitlement ID
     */
    before?: Snowflake | undefined;
    /**
     * Retrieve entitlements after this entitlement ID
     */
    after?: Snowflake | undefined;
    /**
     * Number of entitlements to return (1-100)
     *
     * @defaultValue `100`
     */
    limit?: number | undefined;
    /**
     * Guild ID to look up entitlements for
     */
    guild_id?: Snowflake | undefined;
    /**
     * Whether ended entitlements should be omitted
     *
     * @defaultValue `false` ended entitlements are included by default
     */
    exclude_ended?: boolean | undefined;
    /**
     * Whether deleted entitlements should be omitted
     *
     * @defaultValue `true` deleted entitlements are not included by default
     */
    exclude_deleted?: boolean | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#list-entitlements}
 */
export type RESTGetAPIEntitlementsResult = APIEntitlement[];
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#get-entitlement}
 */
export type RESTGetAPIEntitlementResult = APIEntitlement;
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#create-test-entitlement}
 */
export interface RESTPostAPIEntitlementJSONBody {
    /**
     * ID of the SKU to grant the entitlement to
     */
    sku_id: Snowflake;
    /**
     * ID of the guild or user to grant the entitlement to
     */
    owner_id: Snowflake;
    /**
     * The type of entitlement owner
     */
    owner_type: EntitlementOwnerType;
}
/**
 * @deprecated Use {@link RESTPostAPIEntitlementJSONBody} instead
 */
export type RESTPostAPIEntitlementBody = RESTPostAPIEntitlementJSONBody;
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#create-test-entitlement}
 */
export type RESTPostAPIEntitlementResult = Partial<Omit<APIEntitlement, 'ends_at' | 'starts_at'>>;
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#create-test-entitlement}
 */
export declare enum EntitlementOwnerType {
    Guild = 1,
    User = 2
}
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#delete-test-entitlement}
 */
export type RESTDeleteAPIEntitlementResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/sku#list-skus}
 */
export type RESTGetAPISKUsResult = APISKU[];
/**
 * @see {@link https://discord.com/developers/docs/resources/entitlement#consume-an-entitlement}
 */
export type RESTPostAPIEntitlementConsumeResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/subscription#query-string-params}
 */
export interface RESTGetAPISKUSubscriptionsQuery {
    /**
     * List subscriptions before this ID
     */
    before?: Snowflake | undefined;
    /**
     * List subscriptions after this ID
     */
    after?: Snowflake | undefined;
    /**
     * Number of subscriptions to return (1-100)
     *
     * @defaultValue `50`
     */
    limit?: number | undefined;
    /**
     * User ID for which to return subscriptions. Required except for OAuth queries.
     */
    user_id?: Snowflake | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/subscription#list-sku-subscriptions}
 */
export type RESTGetAPISKUSubscriptionsResult = APISubscription[];
/**
 * @see {@link https://discord.com/developers/docs/resources/subscription#get-sku-subscription}
 */
export type RESTGetAPISKUSubscriptionResult = APISubscription;
//# sourceMappingURL=monetization.d.ts.map