/**
 * Types extracted from https://discord.com/developers/docs/topics/gateway
 */
import type { Snowflake } from '../globals';
import type { APIApplication, APIApplicationCommandPermission, APIAutoModerationRule, APIAutoModerationAction, APIChannel, APIEmoji, APIGuild, APIGuildIntegration, APIGuildMember, APIGuildScheduledEvent, APIInteraction, APIRole, APIStageInstance, APISticker, APIThreadChannel, APIThreadMember, APIUnavailableGuild, APIUser, GatewayActivity, GatewayPresenceUpdate, GatewayThreadListSync, GatewayThreadMembersUpdate as RawGatewayThreadMembersUpdate, InviteTargetType, PresenceUpdateStatus, AutoModerationRuleTriggerType, APIAuditLogEntry, APIEntitlement, ChannelType, APISubscription, APISoundboardSound, GuildChannelType, ThreadChannelType, APIBaseGuild, APIBaseGuildMember, APIBaseVoiceState, APIBaseVoiceGuildMember, APIGuildMemberJoined, APIFlaggedGuildMember, APIGuildMemberAvatar, APIGuildMemberUser, GatewayGuildMembersChunkPresence, APIBaseMessage, APIVoiceState } from '../payloads/v10/index';
import type { ReactionType } from '../rest/v10/index';
export type * from './common';
export declare const GatewayVersion = "10";
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-opcodes}
 */
export declare enum GatewayOpcodes {
    /**
     * An event was dispatched
     */
    Dispatch = 0,
    /**
     * A bidirectional opcode to maintain an active gateway connection.
     * Fired periodically by the client, or fired by the gateway to request an immediate heartbeat from the client.
     */
    Heartbeat = 1,
    /**
     * Starts a new session during the initial handshake
     */
    Identify = 2,
    /**
     * Update the client's presence
     */
    PresenceUpdate = 3,
    /**
     * Used to join/leave or move between voice channels
     */
    VoiceStateUpdate = 4,
    /**
     * Resume a previous session that was disconnected
     */
    Resume = 6,
    /**
     * You should attempt to reconnect and resume immediately
     */
    Reconnect = 7,
    /**
     * Request information about offline guild members in a large guild
     */
    RequestGuildMembers = 8,
    /**
     * The session has been invalidated. You should reconnect and identify/resume accordingly
     */
    InvalidSession = 9,
    /**
     * Sent immediately after connecting, contains the `heartbeat_interval` to use
     */
    Hello = 10,
    /**
     * Sent in response to receiving a heartbeat to acknowledge that it has been received
     */
    HeartbeatAck = 11,
    /**
     * Request information about soundboard sounds in a set of guilds
     */
    RequestSoundboardSounds = 31
}
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes}
 */
export declare enum GatewayCloseCodes {
    /**
     * We're not sure what went wrong. Try reconnecting?
     */
    UnknownError = 4000,
    /**
     * You sent an invalid Gateway opcode or an invalid payload for an opcode. Don't do that!
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#payload-structure}
     */
    UnknownOpcode = 4001,
    /**
     * You sent an invalid payload to us. Don't do that!
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#sending-events}
     */
    DecodeError = 4002,
    /**
     * You sent us a payload prior to identifying
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#identify}
     */
    NotAuthenticated = 4003,
    /**
     * The account token sent with your identify payload is incorrect
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#identify}
     */
    AuthenticationFailed = 4004,
    /**
     * You sent more than one identify payload. Don't do that!
     */
    AlreadyAuthenticated = 4005,
    /**
     * The sequence sent when resuming the session was invalid. Reconnect and start a new session
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#resume}
     */
    InvalidSeq = 4007,
    /**
     * Woah nelly! You're sending payloads to us too quickly. Slow it down! You will be disconnected on receiving this
     */
    RateLimited = 4008,
    /**
     * Your session timed out. Reconnect and start a new one
     */
    SessionTimedOut = 4009,
    /**
     * You sent us an invalid shard when identifying
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#sharding}
     */
    InvalidShard = 4010,
    /**
     * The session would have handled too many guilds - you are required to shard your connection in order to connect
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#sharding}
     */
    ShardingRequired = 4011,
    /**
     * You sent an invalid version for the gateway
     */
    InvalidAPIVersion = 4012,
    /**
     * You sent an invalid intent for a Gateway Intent. You may have incorrectly calculated the bitwise value
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#gateway-intents}
     */
    InvalidIntents = 4013,
    /**
     * You sent a disallowed intent for a Gateway Intent. You may have tried to specify an intent that you have not
     * enabled or are not whitelisted for
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#gateway-intents}
     * @see {@link https://discord.com/developers/docs/topics/gateway#privileged-intents}
     */
    DisallowedIntents = 4014
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway#list-of-intents}
 */
export declare enum GatewayIntentBits {
    Guilds = 1,
    GuildMembers = 2,
    GuildModeration = 4,
    /**
     * @deprecated This is the old name for {@link GatewayIntentBits.GuildModeration}
     */
    GuildBans = 4,
    GuildExpressions = 8,
    /**
     * @deprecated This is the old name for {@link GatewayIntentBits.GuildExpressions}
     */
    GuildEmojisAndStickers = 8,
    GuildIntegrations = 16,
    GuildWebhooks = 32,
    GuildInvites = 64,
    GuildVoiceStates = 128,
    GuildPresences = 256,
    GuildMessages = 512,
    GuildMessageReactions = 1024,
    GuildMessageTyping = 2048,
    DirectMessages = 4096,
    DirectMessageReactions = 8192,
    DirectMessageTyping = 16384,
    MessageContent = 32768,
    GuildScheduledEvents = 65536,
    AutoModerationConfiguration = 1048576,
    AutoModerationExecution = 2097152,
    GuildMessagePolls = 16777216,
    DirectMessagePolls = 33554432
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#receive-events}
 */
export declare enum GatewayDispatchEvents {
    ApplicationCommandPermissionsUpdate = "APPLICATION_COMMAND_PERMISSIONS_UPDATE",
    AutoModerationActionExecution = "AUTO_MODERATION_ACTION_EXECUTION",
    AutoModerationRuleCreate = "AUTO_MODERATION_RULE_CREATE",
    AutoModerationRuleDelete = "AUTO_MODERATION_RULE_DELETE",
    AutoModerationRuleUpdate = "AUTO_MODERATION_RULE_UPDATE",
    ChannelCreate = "CHANNEL_CREATE",
    ChannelDelete = "CHANNEL_DELETE",
    ChannelPinsUpdate = "CHANNEL_PINS_UPDATE",
    ChannelUpdate = "CHANNEL_UPDATE",
    EntitlementCreate = "ENTITLEMENT_CREATE",
    EntitlementDelete = "ENTITLEMENT_DELETE",
    EntitlementUpdate = "ENTITLEMENT_UPDATE",
    GuildAuditLogEntryCreate = "GUILD_AUDIT_LOG_ENTRY_CREATE",
    GuildBanAdd = "GUILD_BAN_ADD",
    GuildBanRemove = "GUILD_BAN_REMOVE",
    GuildCreate = "GUILD_CREATE",
    GuildDelete = "GUILD_DELETE",
    GuildEmojisUpdate = "GUILD_EMOJIS_UPDATE",
    GuildIntegrationsUpdate = "GUILD_INTEGRATIONS_UPDATE",
    GuildMemberAdd = "GUILD_MEMBER_ADD",
    GuildMemberRemove = "GUILD_MEMBER_REMOVE",
    GuildMembersChunk = "GUILD_MEMBERS_CHUNK",
    GuildMemberUpdate = "GUILD_MEMBER_UPDATE",
    GuildRoleCreate = "GUILD_ROLE_CREATE",
    GuildRoleDelete = "GUILD_ROLE_DELETE",
    GuildRoleUpdate = "GUILD_ROLE_UPDATE",
    GuildScheduledEventCreate = "GUILD_SCHEDULED_EVENT_CREATE",
    GuildScheduledEventDelete = "GUILD_SCHEDULED_EVENT_DELETE",
    GuildScheduledEventUpdate = "GUILD_SCHEDULED_EVENT_UPDATE",
    GuildScheduledEventUserAdd = "GUILD_SCHEDULED_EVENT_USER_ADD",
    GuildScheduledEventUserRemove = "GUILD_SCHEDULED_EVENT_USER_REMOVE",
    GuildSoundboardSoundCreate = "GUILD_SOUNDBOARD_SOUND_CREATE",
    GuildSoundboardSoundDelete = "GUILD_SOUNDBOARD_SOUND_DELETE",
    GuildSoundboardSoundsUpdate = "GUILD_SOUNDBOARD_SOUNDS_UPDATE",
    GuildSoundboardSoundUpdate = "GUILD_SOUNDBOARD_SOUND_UPDATE",
    SoundboardSounds = "SOUNDBOARD_SOUNDS",
    GuildStickersUpdate = "GUILD_STICKERS_UPDATE",
    GuildUpdate = "GUILD_UPDATE",
    IntegrationCreate = "INTEGRATION_CREATE",
    IntegrationDelete = "INTEGRATION_DELETE",
    IntegrationUpdate = "INTEGRATION_UPDATE",
    InteractionCreate = "INTERACTION_CREATE",
    InviteCreate = "INVITE_CREATE",
    InviteDelete = "INVITE_DELETE",
    MessageCreate = "MESSAGE_CREATE",
    MessageDelete = "MESSAGE_DELETE",
    MessageDeleteBulk = "MESSAGE_DELETE_BULK",
    MessagePollVoteAdd = "MESSAGE_POLL_VOTE_ADD",
    MessagePollVoteRemove = "MESSAGE_POLL_VOTE_REMOVE",
    MessageReactionAdd = "MESSAGE_REACTION_ADD",
    MessageReactionRemove = "MESSAGE_REACTION_REMOVE",
    MessageReactionRemoveAll = "MESSAGE_REACTION_REMOVE_ALL",
    MessageReactionRemoveEmoji = "MESSAGE_REACTION_REMOVE_EMOJI",
    MessageUpdate = "MESSAGE_UPDATE",
    PresenceUpdate = "PRESENCE_UPDATE",
    RateLimited = "RATE_LIMITED",
    Ready = "READY",
    Resumed = "RESUMED",
    StageInstanceCreate = "STAGE_INSTANCE_CREATE",
    StageInstanceDelete = "STAGE_INSTANCE_DELETE",
    StageInstanceUpdate = "STAGE_INSTANCE_UPDATE",
    SubscriptionCreate = "SUBSCRIPTION_CREATE",
    SubscriptionDelete = "SUBSCRIPTION_DELETE",
    SubscriptionUpdate = "SUBSCRIPTION_UPDATE",
    ThreadCreate = "THREAD_CREATE",
    ThreadDelete = "THREAD_DELETE",
    ThreadListSync = "THREAD_LIST_SYNC",
    ThreadMembersUpdate = "THREAD_MEMBERS_UPDATE",
    ThreadMemberUpdate = "THREAD_MEMBER_UPDATE",
    ThreadUpdate = "THREAD_UPDATE",
    TypingStart = "TYPING_START",
    UserUpdate = "USER_UPDATE",
    VoiceChannelEffectSend = "VOICE_CHANNEL_EFFECT_SEND",
    VoiceServerUpdate = "VOICE_SERVER_UPDATE",
    VoiceStateUpdate = "VOICE_STATE_UPDATE",
    WebhooksUpdate = "WEBHOOKS_UPDATE"
}
export type GatewaySendPayload = GatewayHeartbeat | GatewayIdentify | GatewayRequestGuildMembers | GatewayRequestSoundboardSounds | GatewayResume | GatewayUpdatePresence | GatewayVoiceStateUpdate;
export type GatewayReceivePayload = GatewayDispatchPayload | GatewayHeartbeatAck | GatewayHeartbeatRequest | GatewayHello | GatewayInvalidSession | GatewayReconnect;
export type GatewayDispatchPayload = GatewayApplicationCommandPermissionsUpdateDispatch | GatewayAutoModerationActionExecutionDispatch | GatewayAutoModerationRuleCreateDispatch | GatewayAutoModerationRuleDeleteDispatch | GatewayAutoModerationRuleModifyDispatch | GatewayChannelModifyDispatch | GatewayChannelPinsUpdateDispatch | GatewayEntitlementModifyDispatch | GatewayGuildAuditLogEntryCreateDispatch | GatewayGuildBanModifyDispatch | GatewayGuildCreateDispatch | GatewayGuildDeleteDispatch | GatewayGuildEmojisUpdateDispatch | GatewayGuildIntegrationsUpdateDispatch | GatewayGuildMemberAddDispatch | GatewayGuildMemberRemoveDispatch | GatewayGuildMembersChunkDispatch | GatewayGuildMemberUpdateDispatch | GatewayGuildModifyDispatch | GatewayGuildRoleDeleteDispatch | GatewayGuildRoleModifyDispatch | GatewayGuildScheduledEventCreateDispatch | GatewayGuildScheduledEventDeleteDispatch | GatewayGuildScheduledEventUpdateDispatch | GatewayGuildScheduledEventUserAddDispatch | GatewayGuildScheduledEventUserRemoveDispatch | GatewayGuildSoundboardSoundCreateDispatch | GatewayGuildSoundboardSoundDeleteDispatch | GatewayGuildSoundboardSoundsUpdateDispatch | GatewayGuildSoundboardSoundUpdateDispatch | GatewayGuildStickersUpdateDispatch | GatewayIntegrationCreateDispatch | GatewayIntegrationDeleteDispatch | GatewayIntegrationUpdateDispatch | GatewayInteractionCreateDispatch | GatewayInviteCreateDispatch | GatewayInviteDeleteDispatch | GatewayMessageCreateDispatch | GatewayMessageDeleteBulkDispatch | GatewayMessageDeleteDispatch | GatewayMessagePollVoteAddDispatch | GatewayMessagePollVoteRemoveDispatch | GatewayMessageReactionAddDispatch | GatewayMessageReactionRemoveAllDispatch | GatewayMessageReactionRemoveDispatch | GatewayMessageReactionRemoveEmojiDispatch | GatewayMessageUpdateDispatch | GatewayPresenceUpdateDispatch | GatewayRateLimitedDispatch | GatewayReadyDispatch | GatewayResumedDispatch | GatewaySoundboardSoundsDispatch | GatewayStageInstanceCreateDispatch | GatewayStageInstanceDeleteDispatch | GatewayStageInstanceUpdateDispatch | GatewaySubscriptionModifyDispatch | GatewayThreadCreateDispatch | GatewayThreadDeleteDispatch | GatewayThreadListSyncDispatch | GatewayThreadMembersUpdateDispatch | GatewayThreadMemberUpdateDispatch | GatewayThreadUpdateDispatch | GatewayTypingStartDispatch | GatewayUserUpdateDispatch | GatewayVoiceChannelEffectSendDispatch | GatewayVoiceServerUpdateDispatch | GatewayVoiceStateUpdateDispatch | GatewayWebhooksUpdateDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#hello}
 */
export interface GatewayHello extends _NonDispatchPayload {
    op: GatewayOpcodes.Hello;
    d: GatewayHelloData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#hello}
 */
export interface GatewayHelloData {
    /**
     * The interval (in milliseconds) the client should heartbeat with
     */
    heartbeat_interval: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway#sending-heartbeats}
 */
export interface GatewayHeartbeatRequest extends _NonDispatchPayload {
    op: GatewayOpcodes.Heartbeat;
    d: never;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#heartbeat}
 */
export interface GatewayHeartbeatAck extends _NonDispatchPayload {
    op: GatewayOpcodes.HeartbeatAck;
    d: never;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#invalid-session}
 */
export interface GatewayInvalidSession extends _NonDispatchPayload {
    op: GatewayOpcodes.InvalidSession;
    d: GatewayInvalidSessionData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#invalid-session}
 */
export type GatewayInvalidSessionData = boolean;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#reconnect}
 */
export interface GatewayReconnect extends _NonDispatchPayload {
    op: GatewayOpcodes.Reconnect;
    d: never;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#ready}
 */
export type GatewayReadyDispatch = _DataPayload<GatewayDispatchEvents.Ready, GatewayReadyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#ready}
 */
export interface GatewayReadyDispatchData {
    /**
     * Gateway version
     *
     * @see {@link https://discord.com/developers/docs/reference#api-versioning}
     */
    v: number;
    /**
     * Information about the user including email
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    user: APIUser;
    /**
     * The guilds the user is in
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#unavailable-guild-object}
     */
    guilds: APIUnavailableGuild[];
    /**
     * Used for resuming connections
     */
    session_id: string;
    /**
     * Gateway url for resuming connections
     */
    resume_gateway_url: string;
    /**
     * The shard information associated with this session, if sent when identifying
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#sharding}
     */
    shard?: [shard_id: number, shard_count: number];
    /**
     * Contains `id` and `flags`
     *
     * @see {@link https://discord.com/developers/docs/resources/application#application-object}
     */
    application: Pick<APIApplication, 'flags' | 'id'>;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#resumed}
 */
export type GatewayResumedDispatch = _DataPayload<GatewayDispatchEvents.Resumed, never>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-delete}
 */
export type GatewayAutoModerationRuleModifyDispatch = _DataPayload<GatewayDispatchEvents.AutoModerationRuleCreate | GatewayDispatchEvents.AutoModerationRuleDelete | GatewayDispatchEvents.AutoModerationRuleUpdate, GatewayAutoModerationRuleModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-delete}
 */
export type GatewayAutoModerationRuleModifyDispatchData = APIAutoModerationRule;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-create}
 */
export type GatewayAutoModerationRuleCreateDispatch = GatewayAutoModerationRuleModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-create}
 */
export type GatewayAutoModerationRuleCreateDispatchData = GatewayAutoModerationRuleModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-update}
 */
export type GatewayAutoModerationRuleUpdateDispatch = GatewayAutoModerationRuleModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-update}
 */
export type GatewayAutoModerationRuleUpdateDispatchData = GatewayAutoModerationRuleModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-delete}
 */
export type GatewayAutoModerationRuleDeleteDispatch = GatewayAutoModerationRuleModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-rule-delete}
 */
export type GatewayAutoModerationRuleDeleteDispatchData = GatewayAutoModerationRuleModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-action-execution}
 */
export type GatewayAutoModerationActionExecutionDispatch = _DataPayload<GatewayDispatchEvents.AutoModerationActionExecution, GatewayAutoModerationActionExecutionDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#auto-moderation-action-execution}
 */
export interface GatewayAutoModerationActionExecutionDispatchData {
    /**
     * The id of the guild in which action was executed
     */
    guild_id: Snowflake;
    /**
     * The action which was executed
     */
    action: APIAutoModerationAction;
    /**
     * The id of the rule which action belongs to
     */
    rule_id: Snowflake;
    /**
     * The trigger type of rule which was triggered
     */
    rule_trigger_type: AutoModerationRuleTriggerType;
    /**
     * The id of the user which generated the content which triggered the rule
     */
    user_id: Snowflake;
    /**
     * The id of the channel in which user content was posted
     */
    channel_id?: Snowflake;
    /**
     * The id of any user message which content belongs to
     *
     * This field will not be present if message was blocked by AutoMod or content was not part of any message
     */
    message_id?: Snowflake;
    /**
     * The id of any system auto moderation messages posted as a result of this action
     *
     * This field will not be present if this event does not correspond to an action with type {@link AutoModerationActionType.SendAlertMessage}
     */
    alert_system_message_id?: Snowflake;
    /**
     * The user generated text content
     *
     * `MESSAGE_CONTENT` (`1 << 15`) gateway intent is required to receive non-empty values from this field
     */
    content: string;
    /**
     * The word or phrase configured in the rule that triggered the rule
     */
    matched_keyword: string | null;
    /**
     * The substring in content that triggered the rule
     *
     * `MESSAGE_CONTENT` (`1 << 15`) gateway intent is required to receive non-empty values from this field
     */
    matched_content: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#application-command-permissions-update}
 */
export type GatewayApplicationCommandPermissionsUpdateDispatch = _DataPayload<GatewayDispatchEvents.ApplicationCommandPermissionsUpdate, GatewayApplicationCommandPermissionsUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#application-command-permissions-update}
 */
export interface GatewayApplicationCommandPermissionsUpdateDispatchData {
    /**
     * ID of the command or the application ID
     */
    id: Snowflake;
    /**
     * ID of the application the command belongs to
     */
    application_id: Snowflake;
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
    /**
     * Permissions for the command in the guild, max of 100
     */
    permissions: APIApplicationCommandPermission[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-delete}
 */
export type GatewaySubscriptionModifyDispatch = _DataPayload<GatewayDispatchEvents.SubscriptionCreate | GatewayDispatchEvents.SubscriptionDelete | GatewayDispatchEvents.SubscriptionUpdate, GatewaySubscriptionModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-delete}
 */
export type GatewaySubscriptionModifyDispatchData = APISubscription;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-create}
 */
export type GatewaySubscriptionCreateDispatch = GatewaySubscriptionModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-create}
 */
export type GatewaySubscriptionCreateDispatchData = GatewaySubscriptionModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-update}
 */
export type GatewaySubscriptionUpdateDispatch = GatewaySubscriptionModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-update}
 */
export type GatewaySubscriptionUpdateDispatchData = GatewaySubscriptionModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-delete}
 */
export type GatewaySubscriptionDeleteDispatch = GatewaySubscriptionModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#subscription-delete}
 */
export type GatewaySubscriptionDeleteDispatchData = GatewaySubscriptionModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-delete}
 */
export type GatewayChannelModifyDispatch = _DataPayload<GatewayDispatchEvents.ChannelCreate | GatewayDispatchEvents.ChannelDelete | GatewayDispatchEvents.ChannelUpdate, GatewayChannelModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-delete}
 */
export type GatewayChannelModifyDispatchData = APIChannel & {
    type: Exclude<GuildChannelType, ThreadChannelType>;
    guild_id: Snowflake;
};
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-create}
 */
export type GatewayChannelCreateDispatch = GatewayChannelModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-create}
 */
export type GatewayChannelCreateDispatchData = GatewayChannelModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-update}
 */
export type GatewayChannelUpdateDispatch = GatewayChannelModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-update}
 */
export type GatewayChannelUpdateDispatchData = GatewayChannelModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-delete}
 */
export type GatewayChannelDeleteDispatch = GatewayChannelModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-delete}
 */
export type GatewayChannelDeleteDispatchData = GatewayChannelModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-pins-update}
 */
export type GatewayChannelPinsUpdateDispatch = _DataPayload<GatewayDispatchEvents.ChannelPinsUpdate, GatewayChannelPinsUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#channel-pins-update}
 */
export interface GatewayChannelPinsUpdateDispatchData {
    /**
     * The id of the guild
     */
    guild_id?: Snowflake;
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
    /**
     * The time at which the most recent pinned message was pinned
     */
    last_pin_timestamp?: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-delete}
 */
export type GatewayEntitlementModifyDispatchData = APIEntitlement;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-delete}
 */
export type GatewayEntitlementModifyDispatch = _DataPayload<GatewayDispatchEvents.EntitlementCreate | GatewayDispatchEvents.EntitlementDelete | GatewayDispatchEvents.EntitlementUpdate, GatewayEntitlementModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-create}
 */
export type GatewayEntitlementCreateDispatchData = GatewayEntitlementModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-create}
 */
export type GatewayEntitlementCreateDispatch = GatewayEntitlementModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-update}
 */
export type GatewayEntitlementUpdateDispatchData = GatewayEntitlementModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-update}
 */
export type GatewayEntitlementUpdateDispatch = GatewayEntitlementModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-delete}
 */
export type GatewayEntitlementDeleteDispatchData = GatewayEntitlementModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#entitlement-delete}
 */
export type GatewayEntitlementDeleteDispatch = GatewayEntitlementModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-update}
 */
export type GatewayGuildModifyDispatch = _DataPayload<GatewayDispatchEvents.GuildUpdate, GatewayGuildModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-update}
 */
export type GatewayGuildModifyDispatchData = APIGuild;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-create}
 */
export type GatewayGuildCreateDispatch = _DataPayload<GatewayDispatchEvents.GuildCreate, GatewayGuildCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-create-guild-create-extra-fields}
 */
export interface GatewayGuildCreateDispatchData extends APIGuild {
    /**
     * When this guild was joined at
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     */
    joined_at: string;
    /**
     * `true` if this is considered a large guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     */
    large: boolean;
    /**
     * `true` if this guild is unavailable due to an outage
     */
    unavailable?: boolean;
    /**
     * Total number of members in this guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     */
    member_count: number;
    /**
     * States of members currently in voice channels; lacks the `guild_id` key
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/voice#voice-state-object}
     */
    voice_states: APIBaseVoiceState[];
    /**
     * Users in the guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
     */
    members: APIGuildMember[];
    /**
     * Channels in the guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#channel-object}
     */
    channels: (APIChannel & {
        type: Exclude<GuildChannelType, ThreadChannelType>;
    })[];
    /**
     * Threads in the guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#channel-object}
     */
    threads: (APIChannel & {
        type: ThreadChannelType;
    })[];
    /**
     * Presences of the members in the guild, will only include non-offline members if the size is greater than `large_threshold`
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#presence-update}
     */
    presences: GatewayPresenceUpdate[];
    /**
     * The stage instances in the guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/stage-instance#stage-instance-object-stage-instance-structure}
     */
    stage_instances: APIStageInstance[];
    /**
     * The scheduled events in the guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/guild-scheduled-event#guild-scheduled-event-object}
     */
    guild_scheduled_events: APIGuildScheduledEvent[];
    /**
     * The soundboard sounds in the guild
     *
     * **This field is only sent within the {@link https://discord.com/developers/docs/topics/gateway-events#guild-create | GUILD_CREATE} event**
     *
     * @see {@link https://discord.com/developers/docs/resources/soundboard#soundboard-sound-object}
     */
    soundboard_sounds: APISoundboardSound[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-update}
 */
export type GatewayGuildUpdateDispatch = GatewayGuildModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-update}
 */
export type GatewayGuildUpdateDispatchData = GatewayGuildModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-delete}
 */
export type GatewayGuildDeleteDispatch = _DataPayload<GatewayDispatchEvents.GuildDelete, GatewayGuildDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-delete}
 */
export interface GatewayGuildDeleteDispatchData extends APIBaseGuild {
    /**
     * `true` if this guild is unavailable due to an outage
     *
     * If the field is not set, the user was removed from the guild.
     */
    unavailable?: true;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-add}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-remove}
 */
export type GatewayGuildBanModifyDispatch = _DataPayload<GatewayDispatchEvents.GuildBanAdd | GatewayDispatchEvents.GuildBanRemove, GatewayGuildBanModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-add}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-remove}
 */
export interface GatewayGuildBanModifyDispatchData {
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
    /**
     * The banned user
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    user: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-add}
 */
export type GatewayGuildBanAddDispatch = GatewayGuildBanModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-add}
 */
export type GatewayGuildBanAddDispatchData = GatewayGuildBanModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-remove}
 */
export type GatewayGuildBanRemoveDispatch = GatewayGuildBanModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-ban-remove}
 */
export type GatewayGuildBanRemoveDispatchData = GatewayGuildBanModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-emojis-update}
 */
export type GatewayGuildEmojisUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildEmojisUpdate, GatewayGuildEmojisUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-emojis-update}
 */
export interface GatewayGuildEmojisUpdateDispatchData {
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
    /**
     * Array of emojis
     *
     * @see {@link https://discord.com/developers/docs/resources/emoji#emoji-object}
     */
    emojis: APIEmoji[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-stickers-update}
 */
export type GatewayGuildStickersUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildStickersUpdate, GatewayGuildStickersUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-stickers-update}
 */
export interface GatewayGuildStickersUpdateDispatchData {
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
    /**
     * Array of stickers
     *
     * @see {@link https://discord.com/developers/docs/resources/sticker#sticker-object}
     */
    stickers: APISticker[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-integrations-update}
 */
export type GatewayGuildIntegrationsUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildIntegrationsUpdate, GatewayGuildIntegrationsUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-integrations-update}
 */
export interface GatewayGuildIntegrationsUpdateDispatchData {
    /**
     * ID of the guild whose integrations were updated
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-member-add}
 */
export type GatewayGuildMemberAddDispatch = _DataPayload<GatewayDispatchEvents.GuildMemberAdd, GatewayGuildMemberAddDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-member-add}
 */
export interface GatewayGuildMemberAddDispatchData extends APIGuildMember {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-member-remove}
 */
export type GatewayGuildMemberRemoveDispatch = _DataPayload<GatewayDispatchEvents.GuildMemberRemove, GatewayGuildMemberRemoveDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-member-remove}
 */
export interface GatewayGuildMemberRemoveDispatchData {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
    /**
     * The user who was removed
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    user: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-member-update}
 */
export type GatewayGuildMemberUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildMemberUpdate, GatewayGuildMemberUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-member-update}
 */
export interface GatewayGuildMemberUpdateDispatchData extends APIGuildMemberJoined, APIBaseGuildMember, Partial<APIBaseVoiceGuildMember>, Partial<APIFlaggedGuildMember>, Required<APIGuildMemberAvatar>, Required<APIGuildMemberUser> {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-members-chunk}
 */
export type GatewayGuildMembersChunkDispatch = _DataPayload<GatewayDispatchEvents.GuildMembersChunk, GatewayGuildMembersChunkDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-members-chunk}
 */
export interface GatewayGuildMembersChunkDispatchData {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
    /**
     * Set of guild members
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
     */
    members: APIGuildMember[];
    /**
     * The chunk index in the expected chunks for this response (`0 <= chunk_index < chunk_count`)
     */
    chunk_index: number;
    /**
     * The total number of expected chunks for this response
     */
    chunk_count: number;
    /**
     * If passing an invalid id to `REQUEST_GUILD_MEMBERS`, it will be returned here
     */
    not_found?: unknown[];
    /**
     * If passing true to `REQUEST_GUILD_MEMBERS`, presences of the returned members will be here
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-presence}
     */
    presences?: GatewayGuildMembersChunkPresence[];
    /**
     * The nonce used in the Guild Members Request
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-guild-members}
     */
    nonce?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-update}
 */
export type GatewayGuildRoleModifyDispatch = _DataPayload<GatewayDispatchEvents.GuildRoleCreate | GatewayDispatchEvents.GuildRoleUpdate, GatewayGuildRoleModifyDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-update}
 */
export interface GatewayGuildRoleModifyDispatchData {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
    /**
     * The role created or updated
     *
     * @see {@link https://discord.com/developers/docs/topics/permissions#role-object}
     */
    role: APIRole;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-create}
 */
export type GatewayGuildRoleCreateDispatch = GatewayGuildRoleModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-create}
 */
export type GatewayGuildRoleCreateDispatchData = GatewayGuildRoleModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-update}
 */
export type GatewayGuildRoleUpdateDispatch = GatewayGuildRoleModifyDispatch;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-update}
 */
export type GatewayGuildRoleUpdateDispatchData = GatewayGuildRoleModifyDispatchData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-delete}
 */
export type GatewayGuildRoleDeleteDispatch = _DataPayload<GatewayDispatchEvents.GuildRoleDelete, GatewayGuildRoleDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-role-delete}
 */
export interface GatewayGuildRoleDeleteDispatchData {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
    /**
     * The id of the role
     */
    role_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-create}
 */
export type GatewayGuildScheduledEventCreateDispatch = _DataPayload<GatewayDispatchEvents.GuildScheduledEventCreate, GatewayGuildScheduledEventCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-create}
 */
export type GatewayGuildScheduledEventCreateDispatchData = APIGuildScheduledEvent;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-update}
 */
export type GatewayGuildScheduledEventUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildScheduledEventUpdate, GatewayGuildScheduledEventUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-update}
 */
export type GatewayGuildScheduledEventUpdateDispatchData = APIGuildScheduledEvent;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-delete}
 */
export type GatewayGuildScheduledEventDeleteDispatch = _DataPayload<GatewayDispatchEvents.GuildScheduledEventDelete, GatewayGuildScheduledEventDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-delete}
 */
export type GatewayGuildScheduledEventDeleteDispatchData = APIGuildScheduledEvent;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-user-add}
 */
export type GatewayGuildScheduledEventUserAddDispatch = _DataPayload<GatewayDispatchEvents.GuildScheduledEventUserAdd, GatewayGuildScheduledEventUserAddDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-user-add}
 */
export interface GatewayGuildScheduledEventUserAddDispatchData {
    guild_scheduled_event_id: Snowflake;
    user_id: Snowflake;
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-user-remove}
 */
export type GatewayGuildScheduledEventUserRemoveDispatch = _DataPayload<GatewayDispatchEvents.GuildScheduledEventUserRemove, GatewayGuildScheduledEventUserAddDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-scheduled-event-user-remove}
 */
export interface GatewayGuildScheduledEventUserRemoveDispatchData {
    guild_scheduled_event_id: Snowflake;
    user_id: Snowflake;
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sound-create}
 */
export type GatewayGuildSoundboardSoundCreateDispatch = _DataPayload<GatewayDispatchEvents.GuildSoundboardSoundCreate, GatewayGuildSoundboardSoundCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sound-create}
 */
export type GatewayGuildSoundboardSoundCreateDispatchData = APISoundboardSound;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sound-update}
 */
export type GatewayGuildSoundboardSoundUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildSoundboardSoundUpdate, GatewayGuildSoundboardSoundUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sound-update}
 */
export type GatewayGuildSoundboardSoundUpdateDispatchData = APISoundboardSound;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sound-delete}
 */
export type GatewayGuildSoundboardSoundDeleteDispatch = _DataPayload<GatewayDispatchEvents.GuildSoundboardSoundDelete, GatewayGuildSoundboardSoundDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sound-delete}
 */
export interface GatewayGuildSoundboardSoundDeleteDispatchData {
    /**
     * The id of the sound that was deleted
     */
    sound_id: Snowflake;
    /**
     * The id of the guild the sound was in
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sounds-update}
 */
export type GatewayGuildSoundboardSoundsUpdateDispatch = _DataPayload<GatewayDispatchEvents.GuildSoundboardSoundsUpdate, GatewayGuildSoundboardSoundsUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-soundboard-sounds-update}
 */
export interface GatewayGuildSoundboardSoundsUpdateDispatchData {
    /**
     * The guild's soundboard sounds
     */
    soundboard_sounds: APISoundboardSound[];
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/events/gateway-events#soundboard-sounds}
 */
export type GatewaySoundboardSoundsDispatch = _DataPayload<GatewayDispatchEvents.SoundboardSounds, GatewaySoundboardSoundsDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/events/gateway-events#soundboard-sounds}
 */
export interface GatewaySoundboardSoundsDispatchData {
    /**
     * The guild's soundboard sounds
     */
    soundboard_sounds: APISoundboardSound[];
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#integration-create}
 */
export type GatewayIntegrationCreateDispatch = _DataPayload<GatewayDispatchEvents.IntegrationCreate, GatewayIntegrationCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#integration-create}
 */
export type GatewayIntegrationCreateDispatchData = APIGuildIntegration & {
    guild_id: Snowflake;
};
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#integration-update}
 */
export type GatewayIntegrationUpdateDispatch = _DataPayload<GatewayDispatchEvents.IntegrationUpdate, GatewayIntegrationUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#integration-update}
 */
export type GatewayIntegrationUpdateDispatchData = APIGuildIntegration & {
    guild_id: Snowflake;
};
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#integration-update}
 */
export type GatewayIntegrationDeleteDispatch = _DataPayload<GatewayDispatchEvents.IntegrationDelete, GatewayIntegrationDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#integration-delete}
 */
export interface GatewayIntegrationDeleteDispatchData {
    /**
     * Integration id
     */
    id: Snowflake;
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
    /**
     * ID of the bot/OAuth2 application for this Discord integration
     */
    application_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#interaction-create}
 */
export type GatewayInteractionCreateDispatch = _DataPayload<GatewayDispatchEvents.InteractionCreate, GatewayInteractionCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#interaction-create}
 */
export type GatewayInteractionCreateDispatchData = APIInteraction;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#invite-create}
 */
export type GatewayInviteCreateDispatch = _DataPayload<GatewayDispatchEvents.InviteCreate, GatewayInviteCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#invite-create}
 */
export interface GatewayInviteCreateDispatchData {
    /**
     * The channel the invite is for
     */
    channel_id: Snowflake;
    /**
     * The unique invite code
     *
     * @see {@link https://discord.com/developers/docs/resources/invite#invite-object}
     */
    code: string;
    /**
     * The time at which the invite was created
     */
    created_at: number;
    /**
     * The guild of the invite
     */
    guild_id?: Snowflake;
    /**
     * The user that created the invite
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    inviter?: APIUser;
    /**
     * How long the invite is valid for (in seconds)
     */
    max_age: number;
    /**
     * The maximum number of times the invite can be used
     */
    max_uses: number;
    /**
     * The type of target for this voice channel invite
     *
     * @see {@link https://discord.com/developers/docs/resources/invite#invite-object-invite-target-types}
     */
    target_type?: InviteTargetType;
    /**
     * The user whose stream to display for this voice channel stream invite
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    target_user?: APIUser;
    /**
     * The embedded application to open for this voice channel embedded application invite
     */
    target_application?: Partial<APIApplication>;
    /**
     * Whether or not the invite is temporary (invited users will be kicked on disconnect unless they're assigned a role)
     */
    temporary: boolean;
    /**
     * How many times the invite has been used (always will be `0`)
     */
    uses: 0;
    /**
     * The expiration date of this invite.
     */
    expires_at: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#invite-delete}
 */
export type GatewayInviteDeleteDispatch = _DataPayload<GatewayDispatchEvents.InviteDelete, GatewayInviteDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#invite-delete}
 */
export interface GatewayInviteDeleteDispatchData {
    /**
     * The channel of the invite
     */
    channel_id: Snowflake;
    /**
     * The guild of the invite
     */
    guild_id?: Snowflake;
    /**
     * The unique invite code
     *
     * @see {@link https://discord.com/developers/docs/resources/invite#invite-object}
     */
    code: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-create}
 */
export type GatewayMessageCreateDispatch = _DataPayload<GatewayDispatchEvents.MessageCreate, GatewayMessageCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-create}
 */
export interface GatewayMessageCreateDispatchData extends GatewayMessageEventExtraFields, APIBaseMessage {
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-update}
 */
export type GatewayMessageUpdateDispatch = _DataPayload<GatewayDispatchEvents.MessageUpdate, GatewayMessageUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-update}
 */
export interface GatewayMessageUpdateDispatchData extends GatewayMessageEventExtraFields, APIBaseMessage {
}
export interface APIGuildMemberNoUser extends APIBaseGuildMember, APIFlaggedGuildMember, APIGuildMemberAvatar, NonNullable<APIGuildMemberJoined>, APIBaseVoiceGuildMember {
}
export interface APIUserWithMember extends APIUser {
    /**
     * The `member` field is only present in `MESSAGE_CREATE` and `MESSAGE_UPDATE` events
     * from text-based guild channels
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
     */
    member?: APIGuildMemberNoUser;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-create-message-create-extra-fields}
 */
export interface GatewayMessageEventExtraFields {
    /**
     * ID of the guild the message was sent in
     */
    guild_id?: Snowflake;
    /**
     * Member properties for this message's author
     *
     * The member object exists in `MESSAGE_CREATE` and `MESSAGE_UPDATE` events
     * from text-based guild channels
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
     */
    member?: APIGuildMemberNoUser;
    /**
     * Users specifically mentioned in the message
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    mentions: APIUserWithMember[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-delete}
 */
export type GatewayMessageDeleteDispatch = _DataPayload<GatewayDispatchEvents.MessageDelete, GatewayMessageDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-delete}
 */
export interface GatewayMessageDeleteDispatchData {
    /**
     * The id of the message
     */
    id: Snowflake;
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
    /**
     * The id of the guild
     */
    guild_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-delete-bulk}
 */
export type GatewayMessageDeleteBulkDispatch = _DataPayload<GatewayDispatchEvents.MessageDeleteBulk, GatewayMessageDeleteBulkDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-delete-bulk}
 */
export interface GatewayMessageDeleteBulkDispatchData {
    /**
     * The ids of the messages
     */
    ids: Snowflake[];
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
    /**
     * The id of the guild
     */
    guild_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-add}
 */
export interface GatewayMessageReactionAddDispatchData extends GatewayMessageReactionRemoveDispatchData {
    /**
     * The member who reacted if this happened in a guild
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
     */
    member?: APIGuildMember;
    /**
     * The id of the user that posted the message that was reacted to
     */
    message_author_id?: Snowflake;
    /**
     * Colors used for super-reaction animation in "#rrggbb" format
     */
    burst_colors?: string[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-add}
 */
export type GatewayMessageReactionAddDispatch = _DataPayload<GatewayDispatchEvents.MessageReactionAdd, GatewayMessageReactionAddDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-remove}
 */
export interface GatewayMessageReactionRemoveDispatchData {
    /**
     * The id of the user
     */
    user_id: Snowflake;
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
    /**
     * The id of the message
     */
    message_id: Snowflake;
    /**
     * The id of the guild
     */
    guild_id?: Snowflake;
    /**
     * The emoji used to react
     *
     * @see {@link https://discord.com/developers/docs/resources/emoji#emoji-object}
     */
    emoji: APIEmoji;
    /**
     * True if this is a super-reaction
     */
    burst: boolean;
    /**
     * The type of reaction
     */
    type: ReactionType;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-remove}
 */
export type GatewayMessageReactionRemoveDispatch = _DataPayload<GatewayDispatchEvents.MessageReactionRemove, GatewayMessageReactionRemoveDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-remove-all}
 */
export type GatewayMessageReactionRemoveAllDispatch = _DataPayload<GatewayDispatchEvents.MessageReactionRemoveAll, GatewayMessageReactionRemoveAllDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-remove-all}
 */
export type GatewayMessageReactionRemoveAllDispatchData = GatewayMessageReactionRemoveData;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-remove-emoji}
 */
export type GatewayMessageReactionRemoveEmojiDispatch = _DataPayload<GatewayDispatchEvents.MessageReactionRemoveEmoji, GatewayMessageReactionRemoveEmojiDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-reaction-remove-emoji}
 */
export interface GatewayMessageReactionRemoveEmojiDispatchData extends GatewayMessageReactionRemoveData {
    /**
     * The emoji that was removed
     */
    emoji: APIEmoji;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#presence-update}
 */
export type GatewayPresenceUpdateDispatch = _DataPayload<GatewayDispatchEvents.PresenceUpdate, GatewayPresenceUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#presence-update}
 */
export type GatewayPresenceUpdateDispatchData = GatewayPresenceUpdate;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#stage-instance-create}
 */
export type GatewayStageInstanceCreateDispatch = _DataPayload<GatewayDispatchEvents.StageInstanceCreate, GatewayStageInstanceCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#stage-instance-create}
 */
export type GatewayStageInstanceCreateDispatchData = APIStageInstance;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#stage-instance-delete}
 */
export type GatewayStageInstanceDeleteDispatch = _DataPayload<GatewayDispatchEvents.StageInstanceDelete, GatewayStageInstanceDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#stage-instance-delete}
 */
export type GatewayStageInstanceDeleteDispatchData = APIStageInstance;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#stage-instance-update}
 */
export type GatewayStageInstanceUpdateDispatch = _DataPayload<GatewayDispatchEvents.StageInstanceUpdate, GatewayStageInstanceUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#stage-instance-update}
 */
export type GatewayStageInstanceUpdateDispatchData = APIStageInstance;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-list-sync}
 */
export type GatewayThreadListSyncDispatch = _DataPayload<GatewayDispatchEvents.ThreadListSync, GatewayThreadListSyncDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-list-sync}
 */
export type GatewayThreadListSyncDispatchData = GatewayThreadListSync;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-members-update}
 */
export type GatewayThreadMembersUpdateDispatch = _DataPayload<GatewayDispatchEvents.ThreadMembersUpdate, GatewayThreadMembersUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-members-update}
 */
export type GatewayThreadMembersUpdateDispatchData = RawGatewayThreadMembersUpdate;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-member-update}
 */
export type GatewayThreadMemberUpdateDispatch = _DataPayload<GatewayDispatchEvents.ThreadMemberUpdate, GatewayThreadMemberUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-member-update}
 */
export type GatewayThreadMemberUpdateDispatchData = APIThreadMember & {
    guild_id: Snowflake;
};
/**
 * @deprecated This type doesn't accurately reflect the Discord API.
 * Use {@link GatewayThreadCreateDispatch},
 * {@link GatewayThreadUpdateDispatch}, or
 * {@link GatewayThreadDeleteDispatch} instead.
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-create}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-update}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-delete}
 */
export type GatewayThreadModifyDispatch = _DataPayload<GatewayDispatchEvents.ThreadCreate | GatewayDispatchEvents.ThreadDelete | GatewayDispatchEvents.ThreadUpdate, APIThreadChannel>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-create}
 */
export type GatewayThreadCreateDispatch = _DataPayload<GatewayDispatchEvents.ThreadCreate, GatewayThreadCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-create}
 */
export interface GatewayThreadCreateDispatchData extends APIThreadChannel {
    /**
     * Whether the thread is newly created or not.
     */
    newly_created?: true;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-update}
 */
export type GatewayThreadUpdateDispatch = _DataPayload<GatewayDispatchEvents.ThreadUpdate, GatewayThreadUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-update}
 */
export type GatewayThreadUpdateDispatchData = APIThreadChannel;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-delete}
 */
export type GatewayThreadDeleteDispatch = _DataPayload<GatewayDispatchEvents.ThreadDelete, GatewayThreadDeleteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#thread-delete}
 */
export interface GatewayThreadDeleteDispatchData {
    /**
     * The id of the channel
     */
    id: Snowflake;
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
    /**
     * The id of the parent channel of the thread
     */
    parent_id: Snowflake;
    /**
     * The type of the channel
     *
     * @see {@link https://discord.com/developers/docs/resources/channel#channel-object-channel-types}
     */
    type: ChannelType;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#typing-start}
 */
export type GatewayTypingStartDispatch = _DataPayload<GatewayDispatchEvents.TypingStart, GatewayTypingStartDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#typing-start}
 */
export interface GatewayTypingStartDispatchData {
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
    /**
     * The id of the guild
     */
    guild_id?: Snowflake;
    /**
     * The id of the user
     */
    user_id: Snowflake;
    /**
     * Unix time (in seconds) of when the user started typing
     */
    timestamp: number;
    /**
     * The member who started typing if this happened in a guild
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
     */
    member?: APIGuildMember;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#user-update}
 */
export type GatewayUserUpdateDispatch = _DataPayload<GatewayDispatchEvents.UserUpdate, GatewayUserUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#user-update}
 */
export type GatewayUserUpdateDispatchData = APIUser;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-channel-effect-send}
 */
export type GatewayVoiceChannelEffectSendDispatch = _DataPayload<GatewayDispatchEvents.VoiceChannelEffectSend, GatewayVoiceChannelEffectSendDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-channel-effect-send}
 */
export interface GatewayVoiceChannelEffectSendDispatchData {
    /**
     * ID of the channel the effect was sent in
     */
    channel_id: Snowflake;
    /**
     * ID of the guild the effect was sent in
     */
    guild_id: Snowflake;
    /**
     * ID of the user who sent the effect
     */
    user_id: Snowflake;
    /**
     * The emoji sent, for emoji reaction and soundboard effects
     */
    emoji?: APIEmoji | null;
    /**
     * The type of emoji animation, for emoji reaction and soundboard effects
     */
    animation_type?: VoiceChannelEffectSendAnimationType | null;
    /**
     * The ID of the emoji animation, for emoji reaction and soundboard effects
     */
    animation_id?: number;
    /**
     * The ID of the soundboard sound, for soundboard effects
     */
    sound_id?: Snowflake | number;
    /**
     * The volume of the soundboard sound, from 0 to 1, for soundboard effects
     */
    sound_volume?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-channel-effect-send-animation-types}
 */
export declare enum VoiceChannelEffectSendAnimationType {
    /**
     * A fun animation, sent by a Nitro subscriber
     */
    Premium = 0,
    /**
     * The standard animation
     */
    Basic = 1
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-state-update}
 */
export type GatewayVoiceStateUpdateDispatch = _DataPayload<GatewayDispatchEvents.VoiceStateUpdate, GatewayVoiceStateUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-state-update}
 */
export type GatewayVoiceStateUpdateDispatchData = APIVoiceState;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-server-update}
 */
export type GatewayVoiceServerUpdateDispatch = _DataPayload<GatewayDispatchEvents.VoiceServerUpdate, GatewayVoiceServerUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#voice-server-update}
 */
export interface GatewayVoiceServerUpdateDispatchData {
    /**
     * Voice connection token
     */
    token: string;
    /**
     * The guild this voice server update is for
     */
    guild_id: Snowflake;
    /**
     * The voice server host
     *
     * A `null` endpoint means that the voice server allocated has gone away and is trying to be reallocated.
     * You should attempt to disconnect from the currently connected voice server, and not attempt to reconnect
     * until a new voice server is allocated
     */
    endpoint: string | null;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#webhooks-update}
 */
export type GatewayWebhooksUpdateDispatch = _DataPayload<GatewayDispatchEvents.WebhooksUpdate, GatewayWebhooksUpdateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#webhooks-update}
 */
export interface GatewayWebhooksUpdateDispatchData {
    /**
     * The id of the guild
     */
    guild_id: Snowflake;
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-audit-log-entry-create}
 */
export type GatewayGuildAuditLogEntryCreateDispatch = _DataPayload<GatewayDispatchEvents.GuildAuditLogEntryCreate, GatewayGuildAuditLogEntryCreateDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-audit-log-entry-create}
 */
export interface GatewayGuildAuditLogEntryCreateDispatchData extends APIAuditLogEntry {
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-poll-vote-add}
 */
export type GatewayMessagePollVoteAddDispatch = _DataPayload<GatewayDispatchEvents.MessagePollVoteAdd, GatewayMessagePollVoteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-poll-vote-remove}
 */
export type GatewayMessagePollVoteRemoveDispatch = _DataPayload<GatewayDispatchEvents.MessagePollVoteRemove, GatewayMessagePollVoteDispatchData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-poll-vote-add}
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#message-poll-vote-remove}
 */
export interface GatewayMessagePollVoteDispatchData {
    /**
     * ID of the user
     */
    user_id: Snowflake;
    /**
     * ID of the channel
     */
    channel_id: Snowflake;
    /**
     * ID of the message
     */
    message_id: Snowflake;
    /**
     * ID of the guild
     */
    guild_id?: Snowflake;
    /**
     * ID of the answer
     */
    answer_id: number;
}
/**
 * @see {@link https://discord.com/developers/docs/events/gateway-events#rate-limited}
 */
export type GatewayRateLimitedDispatch<Opcode extends keyof GatewayOpcodeRateLimitMetadataMap = keyof GatewayOpcodeRateLimitMetadataMap> = _DataPayload<GatewayDispatchEvents.RateLimited, GatewayRateLimitedDispatchData<Opcode>>;
/**
 * @see {@link https://discord.com/developers/docs/events/gateway-events#rate-limited}
 */
export type GatewayRateLimitedRequestGuildMembersDispatch = GatewayRateLimitedDispatch<GatewayOpcodes.RequestGuildMembers>;
/**
 * @see {@link https://discord.com/developers/docs/events/gateway-events#rate-limited}
 */
export interface GatewayRateLimitedDispatchData<Opcode extends keyof GatewayOpcodeRateLimitMetadataMap = keyof GatewayOpcodeRateLimitMetadataMap> {
    /**
     * {@link GatewayOpcodes | Gateway opcode} of the event that was rate limited
     */
    opcode: Opcode;
    /**
     * The number of seconds to wait before submitting another request
     */
    retry_after: number;
    /**
     * Metadata for the event that was rate limited
     */
    meta: GatewayOpcodeRateLimitMetadataMap[Opcode];
}
/**
 * @see {@link https://discord.com/developers/docs/events/gateway-events#rate-limited}
 */
export type GatewayRateLimitedRequestGuildMembersDispatchData = GatewayRateLimitedDispatchData<GatewayOpcodes.RequestGuildMembers>;
/**
 * Map of gateway opcodes to their rate limit metadata types
 *
 * @see {@link https://discord.com/developers/docs/events/gateway-events#rate-limited-rate-limit-metadata-for-opcode-structure}
 */
export interface GatewayOpcodeRateLimitMetadataMap {
    [GatewayOpcodes.RequestGuildMembers]: GatewayRequestGuildMemberRateLimitMetadata;
}
/**
 * Types of metadata that can be received in a {@link GatewayRateLimitedDispatchData.meta} field
 */
export type GatewayRateLimitedMetadata = GatewayOpcodeRateLimitMetadataMap[keyof GatewayOpcodeRateLimitMetadataMap];
/**
 * Rate limit metadata for the {@link GatewayOpcodes.RequestGuildMembers} opcode
 */
export interface GatewayRequestGuildMemberRateLimitMetadata {
    /**
     * Id of the guild members were requested for
     */
    guild_id: Snowflake;
    /**
     * Nonce used to identify the {@link GatewayGuildMembersChunkDispatch} response
     */
    nonce?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway#sending-heartbeats}
 */
export interface GatewayHeartbeat {
    op: GatewayOpcodes.Heartbeat;
    d: GatewayHeartbeatData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway#sending-heartbeats}
 */
export type GatewayHeartbeatData = number | null;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#identify}
 */
export interface GatewayIdentify {
    op: GatewayOpcodes.Identify;
    d: GatewayIdentifyData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#identify}
 */
export interface GatewayIdentifyData {
    /**
     * Authentication token
     */
    token: string;
    /**
     * Connection properties
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#identify-identify-connection-properties}
     */
    properties: GatewayIdentifyProperties;
    /**
     * Whether this connection supports compression of packets
     *
     * @defaultValue `false`
     */
    compress?: boolean;
    /**
     * Value between 50 and 250, total number of members where the gateway will stop sending
     * offline members in the guild member list
     *
     * @defaultValue `50`
     */
    large_threshold?: number;
    /**
     * Used for Guild Sharding
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#sharding}
     */
    shard?: [shard_id: number, shard_count: number];
    /**
     * Presence structure for initial presence information
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-presence}
     */
    presence?: GatewayPresenceUpdateData;
    /**
     * The Gateway Intents you wish to receive
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway#gateway-intents}
     */
    intents: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#identify-identify-connection-properties}
 */
export interface GatewayIdentifyProperties {
    /**
     * Your operating system
     */
    os: string;
    /**
     * Your library name
     */
    browser: string;
    /**
     * Your library name
     */
    device: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#resume}
 */
export interface GatewayResume {
    op: GatewayOpcodes.Resume;
    d: GatewayResumeData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#resume}
 */
export interface GatewayResumeData {
    /**
     * Session token
     */
    token: string;
    /**
     * Session id
     */
    session_id: string;
    /**
     * Last sequence number received
     */
    seq: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-guild-members}
 */
export interface GatewayRequestGuildMembers {
    op: GatewayOpcodes.RequestGuildMembers;
    d: GatewayRequestGuildMembersData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-guild-members}
 */
export interface GatewayRequestGuildMembersDataBase {
    /**
     * ID of the guild to get members for
     */
    guild_id: Snowflake;
    /**
     * Used to specify if we want the presences of the matched members
     */
    presences?: boolean;
    /**
     * Nonce to identify the Guild Members Chunk response
     *
     * Nonce can only be up to 32 bytes. If you send an invalid nonce it will be ignored and the reply member_chunk(s) will not have a `nonce` set.
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#guild-members-chunk}
     */
    nonce?: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-guild-members}
 */
export interface GatewayRequestGuildMembersDataWithUserIds extends GatewayRequestGuildMembersDataBase {
    /**
     * Used to specify which users you wish to fetch
     */
    user_ids: Snowflake | Snowflake[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-guild-members}
 */
export interface GatewayRequestGuildMembersDataWithQuery extends GatewayRequestGuildMembersDataBase {
    /**
     * String that username starts with, or an empty string to return all members
     */
    query: string;
    /**
     * Maximum number of members to send matching the `query`;
     * a limit of `0` can be used with an empty string `query` to return all members
     */
    limit: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-guild-members}
 */
export type GatewayRequestGuildMembersData = GatewayRequestGuildMembersDataWithQuery | GatewayRequestGuildMembersDataWithUserIds;
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-soundboard-sounds}
 */
export interface GatewayRequestSoundboardSounds {
    op: GatewayOpcodes.RequestSoundboardSounds;
    d: GatewayRequestSoundboardSoundsData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#request-soundboard-sounds}
 */
export interface GatewayRequestSoundboardSoundsData {
    /**
     * The ids of the guilds to get soundboard sounds for
     */
    guild_ids: Snowflake[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-voice-state}
 */
export interface GatewayVoiceStateUpdate {
    op: GatewayOpcodes.VoiceStateUpdate;
    d: GatewayVoiceStateUpdateData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-voice-state}
 */
export interface GatewayVoiceStateUpdateData {
    /**
     * ID of the guild
     */
    guild_id: Snowflake;
    /**
     * ID of the voice channel client wants to join (`null` if disconnecting)
     */
    channel_id: Snowflake | null;
    /**
     * Is the client muted
     */
    self_mute: boolean;
    /**
     * Is the client deafened
     */
    self_deaf: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-presence}
 */
export interface GatewayUpdatePresence {
    op: GatewayOpcodes.PresenceUpdate;
    d: GatewayPresenceUpdateData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-presence-gateway-presence-update-structure}
 */
export interface GatewayPresenceUpdateData {
    /**
     * Unix time (in milliseconds) of when the client went idle, or `null` if the client is not idle
     */
    since: number | null;
    /**
     * The user's activities
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#activity-object}
     */
    activities: GatewayActivityUpdateData[];
    /**
     * The user's new status
     *
     * @see {@link https://discord.com/developers/docs/topics/gateway-events#update-presence-status-types}
     */
    status: PresenceUpdateStatus;
    /**
     * Whether or not the client is afk
     */
    afk: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/gateway-events#activity-object-activity-structure}
 */
export type GatewayActivityUpdateData = Pick<GatewayActivity, 'name' | 'state' | 'type' | 'url'>;
export interface _BaseBasePayload {
    /**
     * Opcode for the payload
     */
    op: GatewayOpcodes;
    /**
     * Event data
     */
    d?: unknown;
}
export interface _BasePayload {
    /**
     * Sequence number, used for resuming sessions and heartbeats
     */
    s: number;
    /**
     * The event name for this payload
     */
    t?: string;
}
export interface _NonDispatchPayload extends _BaseBasePayload {
    t: null;
    s: null;
}
export interface _DataPayload<Event extends GatewayDispatchEvents, D = unknown> extends _BasePayload {
    op: GatewayOpcodes.Dispatch;
    t: Event;
    d: D;
}
export type GatewayMessageReactionData<E extends GatewayDispatchEvents, O extends string = never> = _DataPayload<E, Omit<GatewayMessageReactionAddDispatchData, O>>;
export interface GatewayMessageReactionRemoveData {
    /**
     * The id of the channel
     */
    channel_id: Snowflake;
    /**
     * The id of the message
     */
    message_id: Snowflake;
    /**
     * The id of the guild
     */
    guild_id?: Snowflake;
}
//# sourceMappingURL=v10.d.ts.map