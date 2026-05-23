/**
 * Types extracted from https://discord.com/developers/docs/resources/webhook
 */
import type { Snowflake } from '../../globals';
import type { APIPartialChannel, APIPartialGuild, APIUser } from './index';
/**
 * https://discord.com/developers/docs/resources/webhook#webhook-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIWebhook {
    /**
     * The id of the webhook
     */
    id: Snowflake;
    /**
     * The type of the webhook
     *
     * See https://discord.com/developers/docs/resources/webhook#webhook-object-webhook-types
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
     * See https://discord.com/developers/docs/resources/user#user-object
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
    source_guild?: APIPartialGuild;
    /**
     * The channel that this webhook is following (returned for Channel Follower Webhooks)
     */
    source_channel?: APIPartialChannel;
    /**
     * The url used for executing the webhook (returned by the webhooks OAuth2 flow)
     */
    url?: string;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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