"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/webhook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookType = exports.ApplicationWebhookEventType = exports.ApplicationWebhookType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/events/webhook-events#webhook-types}
 */
var ApplicationWebhookType;
(function (ApplicationWebhookType) {
    /**
     * PING event sent to verify your Webhook Event URL is active
     */
    ApplicationWebhookType[ApplicationWebhookType["Ping"] = 0] = "Ping";
    /**
     * Webhook event (details for event in event body object)
     */
    ApplicationWebhookType[ApplicationWebhookType["Event"] = 1] = "Event";
})(ApplicationWebhookType || (exports.ApplicationWebhookType = ApplicationWebhookType = {}));
/**
 * @see {@link https://discord.com/developers/docs/events/webhook-events#event-types}
 */
var ApplicationWebhookEventType;
(function (ApplicationWebhookEventType) {
    /**
     * Sent when an app was authorized by a user to a server or their account
     */
    ApplicationWebhookEventType["ApplicationAuthorized"] = "APPLICATION_AUTHORIZED";
    /**
     * Sent when an app was deauthorized by a user
     */
    ApplicationWebhookEventType["ApplicationDeauthorized"] = "APPLICATION_DEAUTHORIZED";
    /**
     * Entitlement was created
     */
    ApplicationWebhookEventType["EntitlementCreate"] = "ENTITLEMENT_CREATE";
    /**
     * Entitlement was updated
     *
     * @unstable This event is not yet documented but can be enabled from the developer portal
     */
    ApplicationWebhookEventType["EntitlementUpdate"] = "ENTITLEMENT_UPDATE";
    /**
     * Entitlement was deleted
     *
     * @unstable This event is not yet documented but can be enabled from the developer portal
     */
    ApplicationWebhookEventType["EntitlementDelete"] = "ENTITLEMENT_DELETE";
    /**
     * User was added to a Quest (currently unavailable)
     */
    ApplicationWebhookEventType["QuestUserEnrollment"] = "QUEST_USER_ENROLLMENT";
})(ApplicationWebhookEventType || (exports.ApplicationWebhookEventType = ApplicationWebhookEventType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#webhook-object-webhook-types}
 */
var WebhookType;
(function (WebhookType) {
    /**
     * Incoming Webhooks can post messages to channels with a generated token
     */
    WebhookType[WebhookType["Incoming"] = 1] = "Incoming";
    /**
     * Channel Follower Webhooks are internal webhooks used with Channel Following to post new messages into channels
     */
    WebhookType[WebhookType["ChannelFollower"] = 2] = "ChannelFollower";
    /**
     * Application webhooks are webhooks used with Interactions
     */
    WebhookType[WebhookType["Application"] = 3] = "Application";
})(WebhookType || (exports.WebhookType = WebhookType = {}));
//# sourceMappingURL=webhook.js.map