/**
 * Types extracted from https://discord.com/developers/docs/resources/webhook
 */
import type { Snowflake } from '../../globals';
import type { APIEntitlement, APIGuild, APIUser, APIWebhookSourceGuild, ApplicationIntegrationType, OAuth2Scopes, APIWebhookSourceChannel } from './index';
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#webhook-object}
 */
export interface APIWebhook {
    /**
     * The id of the webhook
     */
    id: Snowflake;
    /**
     * The type of the webhook
     *
     * @see {@link https://discord.com/developers/docs/resources/webhook#webhook-object-webhook-types}
     */
    type: WebhookType;
    /**
     * The guild id this webhook is for
     */
    guild_id?: Snowflake;
    /**
     * The channel id this webhook is for
     */
    channel_id: Snowflake;
    /**
     * The user this webhook was created by (not returned when getting a webhook with its token)
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    user?: APIUser;
    /**
     * The default name of the webhook
     */
    name: string | null;
    /**
     * The default avatar of the webhook
     */
    avatar: string | null;
    /**
     * The secure token of the webhook (returned for Incoming Webhooks)
     */
    token?: string;
    /**
     * The bot/OAuth2 application that created this webhook
     */
    application_id: Snowflake | null;
    /**
     * The guild of the channel that this webhook is following (returned for Channel Follower Webhooks)
     */
    source_guild?: APIWebhookSourceGuild;
    /**
     * The channel that this webhook is following (returned for Channel Follower Webhooks)
     */
    source_channel?: APIWebhookSourceChannel;
    /**
     * The url used for executing the webhook (returned by the webhooks OAuth2 flow)
     */
    url?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/events/webhook-events#webhook-event-payloads}
 */
export type APIWebhookEvent = APIWebhookEventBase<ApplicationWebhookType.Event, APIWebhookEventBody> | APIWebhookEventBase<ApplicationWebhookType.Ping, never>;
/**
 * @see {@link https://discord.com/developers/docs/events/webhook-events#event-body-object}
 */
export type APIWebhookEventBody = APIWebhookEventEventBase<ApplicationWebhookEventType.ApplicationAuthorized, APIWebhookEventApplicationAuthorizedData> | APIWebhookEventEventBase<ApplicationWebhookEventType.ApplicationDeauthorized, APIWebhookEventApplicationDeauthorizedData> | APIWebhookEventEventBase<ApplicationWebhookEventType.EntitlementCreate, APIWebhookEventEntitlementCreateData> | APIWebhookEventEventBase<ApplicationWebhookEventType.EntitlementDelete, APIWebhookEventEntitlementDeleteData> | APIWebhookEventEventBase<ApplicationWebhookEventType.EntitlementUpdate, APIWebhookEventEntitlementUpdateData> | APIWebhookEventEventBase<ApplicationWebhookEventType.QuestUserEnrollment, APIWebhookEventQuestUserEnrollmentData>;
export interface APIWebhookEventApplicationAuthorizedData {
    /**
     * Installation context for the authorization. Either guild (`0`) if installed to a server or user (`1`) if installed to a user's account
     */
    integration_type?: ApplicationIntegrationType;
    /**
     * User who authorized the app
     */
    user: APIUser;
    /**
     * List of scopes the user authorized
     */
    scopes: OAuth2Scopes[];
    /**
     * Server which app was authorized for (when integration type is `0`)
     */
    guild?: APIGuild;
}
export interface APIWebhookEventApplicationDeauthorizedData {
    /**
     * User who deauthorized the app
     */
    user: APIUser;
}
export type APIWebhookEventEntitlementCreateData = APIEntitlement;
/**
 * @unstable
 */
export type APIWebhookEventEntitlementDeleteData = APIEntitlement;
/**
 * @unstable
 */
export type APIWebhookEventEntitlementUpdateData = APIEntitlement;
export type APIWebhookEventQuestUserEnrollmentData = never;
export interface APIWebhookEventBase<Type extends ApplicationWebhookType, Event> {
    /**
     * Version scheme for the webhook event. Currently always `1`
     */
    version: 1;
    /**
     * ID of your app
     */
    application_id: Snowflake;
    /**
     * Type of webhook
     */
    type: Type;
    /**
     * Event data payload
     */
    event: Event;
}
/**
 * @see {@link https://discord.com/developers/docs/events/webhook-events#webhook-types}
 */
export declare enum ApplicationWebhookType {
    /**
     * PING event sent to verify your Webhook Event URL is active
     */
    Ping = 0,
    /**
     * Webhook event (details for event in event body object)
     */
    Event = 1
}
export interface APIWebhookEventEventBase<Type extends ApplicationWebhookEventType, Data> {
    /**
     * Event type
     */
    type: Type;
    /**
     * Timestamp of when the event occurred in ISO8601 format
     */
    timestamp: string;
    /**
     * Data for the event. The shape depends on the event type
     */
    data: Data;
}
/**
 * @see {@link https://discord.com/developers/docs/events/webhook-events#event-types}
 */
export declare enum ApplicationWebhookEventType {
    /**
     * Sent when an app was authorized by a user to a server or their account
     */
    ApplicationAuthorized = "APPLICATION_AUTHORIZED",
    /**
     * Sent when an app was deauthorized by a user
     */
    ApplicationDeauthorized = "APPLICATION_DEAUTHORIZED",
    /**
     * Entitlement was created
     */
    EntitlementCreate = "ENTITLEMENT_CREATE",
    /**
     * Entitlement was updated
     *
     * @unstable This event is not yet documented but can be enabled from the developer portal
     */
    EntitlementUpdate = "ENTITLEMENT_UPDATE",
    /**
     * Entitlement was deleted
     *
     * @unstable This event is not yet documented but can be enabled from the developer portal
     */
    EntitlementDelete = "ENTITLEMENT_DELETE",
    /**
     * User was added to a Quest (currently unavailable)
     */
    QuestUserEnrollment = "QUEST_USER_ENROLLMENT"
}
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#webhook-object-webhook-types}
 */
export declare enum WebhookType {
    /**
     * Incoming Webhooks can post messages to channels with a generated token
     */
    Incoming = 1,
    /**
     * Channel Follower Webhooks are internal webhooks used with Channel Following to post new messages into channels
     */
    ChannelFollower = 2,
    /**
     * Application webhooks are webhooks used with Interactions
     */
    Application = 3
}
//# sourceMappingURL=webhook.d.ts.map