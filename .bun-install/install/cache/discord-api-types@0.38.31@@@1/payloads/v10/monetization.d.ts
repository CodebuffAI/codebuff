import type { Snowflake } from '../../globals';
/**
 * @see {@link https://discord.com/developers/docs/monetization/entitlements#entitlement-object-entitlement-structure}
 */
export interface APIEntitlement {
    /**
     * ID of the entitlement
     */
    id: Snowflake;
    /**
     * ID of the SKU
     */
    sku_id: Snowflake;
    /**
     * ID of the user that is granted access to the entitlement's sku
     */
    user_id?: Snowflake;
    /**
     * ID of the guild that is granted access to the entitlement's sku
     */
    guild_id?: Snowflake;
    /**
     * ID of the parent application
     */
    application_id: Snowflake;
    /**
     * Type of entitlement
     */
    type: EntitlementType;
    /**
     * Whether the entitlement was deleted
     */
    deleted: boolean;
    /**
     * Start date at which the entitlement is valid.
     */
    starts_at: string | null;
    /**
     * Date at which the entitlement is no longer valid.
     */
    ends_at: string | null;
    /**
     * For consumable items, whether or not the entitlement has been consumed
     */
    consumed?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/monetization/entitlements#entitlement-object-entitlement-types}
 */
export declare enum EntitlementType {
    /**
     * Entitlement was purchased by user
     */
    Purchase = 1,
    /**
     * Entitlement for Discord Nitro subscription
     */
    PremiumSubscription = 2,
    /**
     * Entitlement was gifted by developer
     */
    DeveloperGift = 3,
    /**
     * Entitlement was purchased by a dev in application test mode
     */
    TestModePurchase = 4,
    /**
     * Entitlement was granted when the SKU was free
     */
    FreePurchase = 5,
    /**
     * Entitlement was gifted by another user
     */
    UserGift = 6,
    /**
     * Entitlement was claimed by user for free as a Nitro Subscriber
     */
    PremiumPurchase = 7,
    /**
     * Entitlement was purchased as an app subscription
     */
    ApplicationSubscription = 8
}
/**
 * @see {@link https://discord.com/developers/docs/monetization/skus#sku-object-sku-structure}
 */
export interface APISKU {
    /**
     * ID of SKU
     */
    id: Snowflake;
    /**
     * Type of SKU
     */
    type: SKUType;
    /**
     * ID of the parent application
     */
    application_id: Snowflake;
    /**
     * Customer-facing name of your premium offering
     */
    name: string;
    /**
     * System-generated URL slug based on the SKU's name
     */
    slug: string;
    /**
     * SKU flags combined as a bitfield
     *
     * @see {@link https://en.wikipedia.org/wiki/Bit_field}
     */
    flags: SKUFlags;
}
/**
 * @see {@link https://discord.com/developers/docs/monetization/skus#sku-object-sku-flags}
 */
export declare enum SKUFlags {
    /**
     * SKU is available for purchase
     */
    Available = 4,
    /**
     * Recurring SKU that can be purchased by a user and applied to a single server.
     * Grants access to every user in that server.
     */
    GuildSubscription = 128,
    /**
     * Recurring SKU purchased by a user for themselves. Grants access to the purchasing user in every server.
     */
    UserSubscription = 256
}
/**
 * @see {@link https://discord.com/developers/docs/resources/sku#sku-object-sku-types}
 */
export declare enum SKUType {
    /**
     * Durable one-time purchase
     */
    Durable = 2,
    /**
     * Consumable one-time purchase
     */
    Consumable = 3,
    /**
     * Represents a recurring subscription
     */
    Subscription = 5,
    /**
     * System-generated group for each Subscription SKU created
     */
    SubscriptionGroup = 6
}
/**
 * @see {@link https://discord.com/developers/docs/resources/subscription#subscription-object}
 */
export interface APISubscription {
    /**
     * ID of the subscription
     */
    id: Snowflake;
    /**
     * ID of the user who is subscribed
     */
    user_id: Snowflake;
    /**
     * List of SKUs subscribed to
     */
    sku_ids: Snowflake[];
    /**
     * List of entitlements granted for this subscription
     */
    entitlement_ids: Snowflake[];
    /**
     * List of SKUs that this user will be subscribed to at renewal
     */
    renewal_sku_ids: Snowflake[] | null;
    /**
     * Start of the current subscription period
     */
    current_period_start: string;
    /**
     * End of the current subscription period
     */
    current_period_end: string;
    /**
     * Current status of the subscription
     */
    status: SubscriptionStatus;
    /**
     * When the subscription was canceled
     */
    canceled_at: string | null;
    /**
     * ISO3166-1 alpha-2 country code of the payment source used to purchase the subscription. Missing unless queried with a private OAuth scope.
     */
    country?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/subscription#subscription-statuses}
 */
export declare enum SubscriptionStatus {
    /**
     * Subscription is active and scheduled to renew.
     */
    Active = 0,
    /**
     * Subscription is active but will not renew.
     */
    Ending = 1,
    /**
     * Subscription is inactive and not being charged.
     */
    Inactive = 2
}
//# sourceMappingURL=monetization.d.ts.map