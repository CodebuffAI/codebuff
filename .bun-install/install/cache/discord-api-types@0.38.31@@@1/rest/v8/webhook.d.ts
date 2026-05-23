import type { Snowflake } from '../../globals';
import type { APIActionRowComponent, APIAllowedMentions, APIAttachment, APIEmbed, APIMessage, APIMessageActionRowComponent, APIWebhook, MessageFlags } from '../../payloads/v8/index';
import type { _AddUndefinedToPossiblyUndefinedPropertiesOfInterface, _Nullable } from '../../utils/internals';
/**
 * https://discord.com/developers/docs/resources/webhook#create-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIChannelWebhookJSONBody {
    /**
     * Name of the webhook (1-80 characters)
     */
    name: string;
    /**
     * Image for the default webhook avatar
     *
     * See https://discord.com/developers/docs/reference#image-data
     */
    avatar?: string | null | undefined;
}
/**
 * https://discord.com/developers/docs/resources/webhook#create-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIChannelWebhookResult = APIWebhook;
/**
 * https://discord.com/developers/docs/resources/webhook#get-channel-webhooks
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIChannelWebhooksResult = APIWebhook[];
/**
 * https://discord.com/developers/docs/resources/webhook#get-guild-webhooks
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIGuildWebhooksResult = APIWebhook[];
/**
 * https://discord.com/developers/docs/resources/webhook#get-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIWebhookResult = APIWebhook;
/**
 * https://discord.com/developers/docs/resources/webhook#get-webhook-with-token
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIWebhookWithTokenResult = Omit<APIWebhook, 'user'>;
/**
 * https://discord.com/developers/docs/resources/webhook#modify-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPatchAPIWebhookJSONBody {
    /**
     * The default name of the webhook
     */
    name?: string | undefined;
    /**
     * Image for the default webhook avatar
     *
     * See https://discord.com/developers/docs/reference#image-data
     */
    avatar?: string | null | undefined;
    /**
     * The new channel id this webhook should be moved to
     */
    channel_id?: Snowflake | undefined;
}
/**
 * https://discord.com/developers/docs/resources/webhook#modify-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIWebhookResult = APIWebhook;
/**
 * https://discord.com/developers/docs/resources/webhook#modify-webhook-with-token
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIWebhookWithTokenJSONBody = Omit<RESTPatchAPIWebhookJSONBody, 'channel_id'>;
/**
 * https://discord.com/developers/docs/resources/webhook#modify-webhook-with-token
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIWebhookWithTokenResult = RESTGetAPIWebhookWithTokenResult;
/**
 * https://discord.com/developers/docs/resources/webhook#delete-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIWebhookResult = never;
/**
 * https://discord.com/developers/docs/resources/webhook#delete-webhook-with-token
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIWebhookWithTokenResult = never;
/**
 * https://discord.com/developers/docs/resources/webhook#execute-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIWebhookWithTokenJSONBody {
    /**
     * The message contents (up to 2000 characters)
     */
    content?: string | undefined;
    /**
     * Override the default username of the webhook
     */
    username?: string | undefined;
    /**
     * Override the default avatar of the webhook
     */
    avatar_url?: string | undefined;
    /**
     * `true` if this is a TTS message
     */
    tts?: boolean | undefined;
    /**
     * Embedded `rich` content
     *
     * See https://discord.com/developers/docs/resources/channel#embed-object
     */
    embeds?: APIEmbed[] | undefined;
    /**
     * Allowed mentions for the message
     *
     * See https://discord.com/developers/docs/resources/channel#allowed-mentions-object
     */
    allowed_mentions?: APIAllowedMentions | undefined;
    /**
     * The components to include with the message
     *
     * Requires an application-owned webhook
     *
     * See https://discord.com/developers/docs/interactions/message-components#component-object
     */
    components?: APIActionRowComponent<APIMessageActionRowComponent>[] | undefined;
    /**
     * Attachment objects with filename and description
     */
    attachments?: (Partial<Pick<APIAttachment, 'filename'>> & Pick<APIAttachment, 'description' | 'id'>)[] | undefined;
    /**
     * Message flags combined as a bitfield
     */
    flags?: MessageFlags | undefined;
}
/**
 * https://discord.com/developers/docs/resources/webhook#execute-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPostAPIWebhookWithTokenJSONBody);
/**
 * https://discord.com/developers/docs/resources/webhook#execute-webhook-querystring-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIWebhookWithTokenQuery {
    /**
     * Waits for server confirmation of message send before response, and returns the created message body
     * (defaults to `false`; when `false` a message that is not saved does not return an error)
     *
     * @default false
     */
    wait?: boolean;
    /**
     * Send a message to the specified thread within a webhook's channel. The thread will automatically be unarchived.
     */
    thread_id?: Snowflake;
}
/**
 * https://discord.com/developers/docs/resources/webhook#execute-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenResult = never;
/**
 * Received when a call to https://discord.com/developers/docs/resources/webhook#execute-webhook receives
 * the `wait` query parameter set to `true`
 *
 * See https://discord.com/developers/docs/resources/webhook#execute-webhook-querystring-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenWaitResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/webhook#execute-slackcompatible-webhook-querystring-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenSlackQuery = RESTPostAPIWebhookWithTokenQuery;
/**
 * https://discord.com/developers/docs/resources/webhook#execute-slackcompatible-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenSlackResult = never;
/**
 * Received when a call to https://discord.com/developers/docs/resources/webhook#execute-webhook receives
 * the `wait` query parameter set to `true`
 *
 * See https://discord.com/developers/docs/resources/webhook#execute-slackcompatible-webhook-querystring-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenSlackWaitResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/webhook#execute-githubcompatible-webhook-querystring-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenGitHubQuery = RESTPostAPIWebhookWithTokenQuery;
/**
 * https://discord.com/developers/docs/resources/webhook#execute-githubcompatible-webhook
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenGitHubResult = never;
/**
 * Received when a call to https://discord.com/developers/docs/resources/webhook#execute-webhook receives
 * the `wait` query parameter set to `true`
 *
 * See https://discord.com/developers/docs/resources/webhook#execute-githubcompatible-webhook-querystring-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIWebhookWithTokenGitHubWaitResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/webhook#get-webhook-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIWebhookWithTokenMessageResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/webhook#edit-webhook-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIWebhookWithTokenMessageJSONBody = _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<_Nullable<Pick<RESTPostAPIWebhookWithTokenJSONBody, 'allowed_mentions' | 'components' | 'content' | 'embeds'>>> & {
    /**
     * Attached files to keep
     *
     * Starting with API v10, the `attachments` array must contain all attachments that should be present after edit, including **retained and new** attachments provided in the request body.
     *
     * See https://discord.com/developers/docs/resources/channel#attachment-object
     */
    attachments?: (Partial<Pick<APIAttachment, 'description' | 'filename'>> & Pick<APIAttachment, 'id'>)[] | undefined;
};
/**
 * https://discord.com/developers/docs/resources/webhook#edit-webhook-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIWebhookWithTokenMessageFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPatchAPIWebhookWithTokenMessageJSONBody);
/**
 * https://discord.com/developers/docs/resources/webhook#edit-webhook-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIWebhookWithTokenMessageResult = APIMessage;
/**
 * https://discord.com/developers/docs/resources/webhook#delete-webhook-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIWebhookWithTokenMessageResult = never;
//# sourceMappingURL=webhook.d.ts.map