"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionStatus = exports.SKUType = exports.SKUFlags = exports.EntitlementType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/monetization/entitlements#entitlement-object-entitlement-types}
 */
var EntitlementType;
(function (EntitlementType) {
    /**
     * Entitlement was purchased by user
     */
    EntitlementType[EntitlementType["Purchase"] = 1] = "Purchase";
    /**
     * Entitlement for Discord Nitro subscription
     */
    EntitlementType[EntitlementType["PremiumSubscription"] = 2] = "PremiumSubscription";
    /**
     * Entitlement was gifted by developer
     */
    EntitlementType[EntitlementType["DeveloperGift"] = 3] = "DeveloperGift";
    /**
     * Entitlement was purchased by a dev in application test mode
     */
    EntitlementType[EntitlementType["TestModePurchase"] = 4] = "TestModePurchase";
    /**
     * Entitlement was granted when the SKU was free
     */
    EntitlementType[EntitlementType["FreePurchase"] = 5] = "FreePurchase";
    /**
     * Entitlement was gifted by another user
     */
    EntitlementType[EntitlementType["UserGift"] = 6] = "UserGift";
    /**
     * Entitlement was claimed by user for free as a Nitro Subscriber
     */
    EntitlementType[EntitlementType["PremiumPurchase"] = 7] = "PremiumPurchase";
    /**
     * Entitlement was purchased as an app subscription
     */
    EntitlementType[EntitlementType["ApplicationSubscription"] = 8] = "ApplicationSubscription";
})(EntitlementType || (exports.EntitlementType = EntitlementType = {}));
/**
 * @see {@link https://discord.com/developers/docs/monetization/skus#sku-object-sku-flags}
 */
var SKUFlags;
(function (SKUFlags) {
    /**
     * SKU is available for purchase
     */
    SKUFlags[SKUFlags["Available"] = 4] = "Available";
    /**
     * Recurring SKU that can be purchased by a user and applied to a single server.
     * Grants access to every user in that server.
     */
    SKUFlags[SKUFlags["GuildSubscription"] = 128] = "GuildSubscription";
    /**
     * Recurring SKU purchased by a user for themselves. Grants access to the purchasing user in every server.
     */
    SKUFlags[SKUFlags["UserSubscription"] = 256] = "UserSubscription";
})(SKUFlags || (exports.SKUFlags = SKUFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/sku#sku-object-sku-types}
 */
var SKUType;
(function (SKUType) {
    /**
     * Durable one-time purchase
     */
    SKUType[SKUType["Durable"] = 2] = "Durable";
    /**
     * Consumable one-time purchase
     */
    SKUType[SKUType["Consumable"] = 3] = "Consumable";
    /**
     * Represents a recurring subscription
     */
    SKUType[SKUType["Subscription"] = 5] = "Subscription";
    /**
     * System-generated group for each Subscription SKU created
     */
    SKUType[SKUType["SubscriptionGroup"] = 6] = "SubscriptionGroup";
})(SKUType || (exports.SKUType = SKUType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/subscription#subscription-statuses}
 */
var SubscriptionStatus;
(function (SubscriptionStatus) {
    /**
     * Subscription is active and scheduled to renew.
     */
    SubscriptionStatus[SubscriptionStatus["Active"] = 0] = "Active";
    /**
     * Subscription is active but will not renew.
     */
    SubscriptionStatus[SubscriptionStatus["Ending"] = 1] = "Ending";
    /**
     * Subscription is inactive and not being charged.
     */
    SubscriptionStatus[SubscriptionStatus["Inactive"] = 2] = "Inactive";
})(SubscriptionStatus || (exports.SubscriptionStatus = SubscriptionStatus = {}));
//# sourceMappingURL=monetization.js.map