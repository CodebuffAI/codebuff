import type { Snowflake } from '../../globals';
import type { APIAllowedMentions, APIEmbed, APIMessage, APIWebhook, MessageFlags, APIMessageTopLevelComponent } from '../../payloads/v10/index';
import type { _AddUndefinedToPossiblyUndefinedPropertiesOfInterface, _Nullable } from '../../utils/internals';
import type { RESTAPIAttachment } from './channel';
import type { RESTAPIPoll } from './poll';
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#create-webhook}
 */
export interface RESTPostAPIChannelWebhookJSONBody {
    /**
     * Name of the webhook (1-80 characters)
     */
    name: string;
    /**
     * Image for the default webhook avatar
     *
     * @see {@link https://discord.com/developers/docs/reference#image-data}
     */
    avatar?: string | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#create-webhook}
 */
export type RESTPostAPIChannelWebhookResult = APIWebhook;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#get-channel-webhooks}
 */
export type RESTGetAPIChannelWebhooksResult = APIWebhook[];
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#get-guild-webhooks}
 */
export type RESTGetAPIGuildWebhooksResult = APIWebhook[];
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#get-webhook}
 */
export type RESTGetAPIWebhookResult = APIWebhook;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#get-webhook-with-token}
 */
export type RESTGetAPIWebhookWithTokenResult = Omit<APIWebhook, 'user'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#modify-webhook}
 */
export interface RESTPatchAPIWebhookJSONBody {
    /**
     * The default name of the webhook
     */
    name?: string | undefined;
    /**
     * Image for the default webhook avatar
     *
     * @see {@link https://discord.com/developers/docs/reference#image-data}
     */
    avatar?: string | null | undefined;
    /**
     * The new channel id this webhook should be moved to
     */
    channel_id?: Snowflake | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#modify-webhook}
 */
export type RESTPatchAPIWebhookResult = APIWebhook;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#modify-webhook-with-token}
 */
export type RESTPatchAPIWebhookWithTokenJSONBody = Omit<RESTPatchAPIWebhookJSONBody, 'channel_id'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#modify-webhook-with-token}
 */
export type RESTPatchAPIWebhookWithTokenResult = RESTGetAPIWebhookWithTokenResult;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#delete-webhook}
 */
export type RESTDeleteAPIWebhookResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#delete-webhook-with-token}
 */
export type RESTDeleteAPIWebhookWithTokenResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-webhook}
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
     * @see {@link https://discord.com/developers/docs/resources/channel#embed-object}
     */
    embeds?: APIEmbed[] | undefined;
    /**
     * Allowed mentions for the message
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#allowed-mentions-object}
     */
    allowed_mentions?: APIAllowedMentions | undefined;
    /**
     * The components to include with the message
     *
     * Application-owned webhooks can always send components. Non-application-owned webhooks cannot send interactive components, and the `components` field will be ignored unless they set the `with_components` query param.
     *
     * @see {@link https://discord.com/developers/docs/components/reference}
     */
    components?: APIMessageTopLevelComponent[] | undefined;
    /**
     * Attachment objects with filename and description
     */
    attachments?: RESTAPIAttachment[] | undefined;
    /**
     * Message flags combined as a bitfield
     */
    flags?: MessageFlags | undefined;
    /**
     * Name of thread to create
     *
     * Available only if the webhook is in a forum channel and a thread is not specified in {@link RESTPostAPIWebhookWithTokenQuery.thread_id} query parameter
     */
    thread_name?: string | undefined;
    /**
     * Array of tag ids to apply to the thread
     */
    applied_tags?: Snowflake[] | undefined;
    /**
     * A poll!
     */
    poll?: RESTAPIPoll | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-webhook}
 */
export type RESTPostAPIWebhookWithTokenFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPostAPIWebhookWithTokenJSONBody);
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-webhook-query-string-params}
 */
export interface RESTPostAPIWebhookWithTokenQuery {
    /**
     * Waits for server confirmation of message send before response, and returns the created message body
     * (when `false` a message that is not saved does not return an error)
     *
     * @defaultValue `false`
     */
    wait?: boolean;
    /**
     * Send a message to the specified thread within a webhook's channel. The thread will automatically be unarchived.
     *
     * Available only if the {@link RESTPostAPIWebhookWithTokenJSONBody.thread_name} JSON body property is not specified
     */
    thread_id?: Snowflake;
    /**
     * Whether to allow sending (non-interactive) components for non-application-owned webhooks
     * (ignored for application-owned webhooks)
     *
     * @defaultValue `false`
     */
    with_components?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-webhook}
 */
export type RESTPostAPIWebhookWithTokenResult = never;
/**
 * Received when a call to https://discord.com/developers/docs/resources/webhook#execute-webhook receives
 * the `wait` query parameter set to `true`
 *
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-webhook-query-string-params}
 */
export type RESTPostAPIWebhookWithTokenWaitResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-slackcompatible-webhook-query-string-params}
 */
export type RESTPostAPIWebhookWithTokenSlackQuery = Pick<RESTPostAPIWebhookWithTokenQuery, 'thread_id' | 'wait'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-slackcompatible-webhook}
 */
export type RESTPostAPIWebhookWithTokenSlackResult = never;
/**
 * Received when a call to https://discord.com/developers/docs/resources/webhook#execute-webhook receives
 * the `wait` query parameter set to `true`
 *
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-slackcompatible-webhook-query-string-params}
 */
export type RESTPostAPIWebhookWithTokenSlackWaitResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-githubcompatible-webhook-query-string-params}
 */
export type RESTPostAPIWebhookWithTokenGitHubQuery = Pick<RESTPostAPIWebhookWithTokenQuery, 'thread_id' | 'wait'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-githubcompatible-webhook}
 */
export type RESTPostAPIWebhookWithTokenGitHubResult = never;
/**
 * Received when a call to https://discord.com/developers/docs/resources/webhook#execute-webhook receives
 * the `wait` query parameter set to `true`
 *
 * @see {@link https://discord.com/developers/docs/resources/webhook#execute-githubcompatible-webhook-query-string-params}
 */
export type RESTPostAPIWebhookWithTokenGitHubWaitResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#get-webhook-message}
 */
export type RESTGetAPIWebhookWithTokenMessageResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#get-webhook-message-query-string-params}
 */
export interface RESTGetAPIWebhookWithTokenMessageQuery {
    thread_id?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#edit-webhook-message}
 */
export type RESTPatchAPIWebhookWithTokenMessageJSONBody = _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<_Nullable<Pick<RESTPostAPIWebhookWithTokenJSONBody, 'allowed_mentions' | 'components' | 'content' | 'embeds' | 'flags'>>> & {
    /**
     * Attached files to keep
     *
     * Starting with API v10, the `attachments` array must contain all attachments that should be present after edit, including **retained and new** attachments provided in the request body.
     *
     * @see {@link https://discord.com/developers/docs/resources/message#attachment-object-attachment-structure}
     */
    attachments?: RESTAPIAttachment[] | undefined;
    /**
     * A poll!
     *
     * @remarks
     * Polls can only be added when editing a deferred interaction response.
     */
    poll?: RESTAPIPoll | undefined;
};
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#edit-webhook-message}
 */
export type RESTPatchAPIWebhookWithTokenMessageFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPatchAPIWebhookWithTokenMessageJSONBody);
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#edit-webhook-message-query-string-params}
 */
export type RESTPatchAPIWebhookWithTokenMessageQuery = Pick<RESTPostAPIWebhookWithTokenQuery, 'thread_id' | 'with_components'>;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#edit-webhook-message}
 */
export type RESTPatchAPIWebhookWithTokenMessageResult = APIMessage;
/**
 * @see {@link https://discord.com/developers/docs/resources/webhook#delete-webhook-message}
 */
export type RESTDeleteAPIWebhookWithTokenMessageResult = never;
//# sourceMappingURL=webhook.d.ts.map