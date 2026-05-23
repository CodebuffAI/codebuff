"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/topics/gateway
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayDispatchEvents = exports.GatewayIntentBits = exports.VoiceCloseCodes = exports.VoiceOPCodes = exports.GatewayCloseCodes = exports.GatewayOPCodes = exports.GatewayVersion = void 0;
/**
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
exports.GatewayVersion = '6';
/**
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-opcodes
 *
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var GatewayOPCodes;
(function (GatewayOPCodes) {
    GatewayOPCodes[GatewayOPCodes["Dispatch"] = 0] = "Dispatch";
    GatewayOPCodes[GatewayOPCodes["Heartbeat"] = 1] = "Heartbeat";
    GatewayOPCodes[GatewayOPCodes["Identify"] = 2] = "Identify";
    GatewayOPCodes[GatewayOPCodes["PresenceUpdate"] = 3] = "PresenceUpdate";
    GatewayOPCodes[GatewayOPCodes["VoiceStateUpdate"] = 4] = "VoiceStateUpdate";
    GatewayOPCodes[GatewayOPCodes["Resume"] = 6] = "Resume";
    GatewayOPCodes[GatewayOPCodes["Reconnect"] = 7] = "Reconnect";
    GatewayOPCodes[GatewayOPCodes["RequestGuildMembers"] = 8] = "RequestGuildMembers";
    GatewayOPCodes[GatewayOPCodes["InvalidSession"] = 9] = "InvalidSession";
    GatewayOPCodes[GatewayOPCodes["Hello"] = 10] = "Hello";
    GatewayOPCodes[GatewayOPCodes["HeartbeatAck"] = 11] = "HeartbeatAck";
})(GatewayOPCodes || (exports.GatewayOPCodes = GatewayOPCodes = {}));
/**
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes
 *
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var GatewayCloseCodes;
(function (GatewayCloseCodes) {
    GatewayCloseCodes[GatewayCloseCodes["UnknownError"] = 4000] = "UnknownError";
    GatewayCloseCodes[GatewayCloseCodes["UnknownOpCode"] = 4001] = "UnknownOpCode";
    GatewayCloseCodes[GatewayCloseCodes["DecodeError"] = 4002] = "DecodeError";
    GatewayCloseCodes[GatewayCloseCodes["NotAuthenticated"] = 4003] = "NotAuthenticated";
    GatewayCloseCodes[GatewayCloseCodes["AuthenticationFailed"] = 4004] = "AuthenticationFailed";
    GatewayCloseCodes[GatewayCloseCodes["AlreadyAuthenticated"] = 4005] = "AlreadyAuthenticated";
    GatewayCloseCodes[GatewayCloseCodes["InvalidSeq"] = 4007] = "InvalidSeq";
    GatewayCloseCodes[GatewayCloseCodes["RateLimited"] = 4008] = "RateLimited";
    GatewayCloseCodes[GatewayCloseCodes["SessionTimedOut"] = 4009] = "SessionTimedOut";
    GatewayCloseCodes[GatewayCloseCodes["InvalidShard"] = 4010] = "InvalidShard";
    GatewayCloseCodes[GatewayCloseCodes["ShardingRequired"] = 4011] = "ShardingRequired";
    GatewayCloseCodes[GatewayCloseCodes["InvalidAPIVersion"] = 4012] = "InvalidAPIVersion";
    GatewayCloseCodes[GatewayCloseCodes["InvalidIntents"] = 4013] = "InvalidIntents";
    GatewayCloseCodes[GatewayCloseCodes["DisallowedIntents"] = 4014] = "DisallowedIntents";
})(GatewayCloseCodes || (exports.GatewayCloseCodes = GatewayCloseCodes = {}));
/**
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-opcodes
 *
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var VoiceOPCodes;
(function (VoiceOPCodes) {
    VoiceOPCodes[VoiceOPCodes["Identify"] = 0] = "Identify";
    VoiceOPCodes[VoiceOPCodes["SelectProtocol"] = 1] = "SelectProtocol";
    VoiceOPCodes[VoiceOPCodes["Ready"] = 2] = "Ready";
    VoiceOPCodes[VoiceOPCodes["Heartbeat"] = 3] = "Heartbeat";
    VoiceOPCodes[VoiceOPCodes["SessionDescription"] = 4] = "SessionDescription";
    VoiceOPCodes[VoiceOPCodes["Speaking"] = 5] = "Speaking";
    VoiceOPCodes[VoiceOPCodes["HeartbeatAck"] = 6] = "HeartbeatAck";
    VoiceOPCodes[VoiceOPCodes["Resume"] = 7] = "Resume";
    VoiceOPCodes[VoiceOPCodes["Hello"] = 8] = "Hello";
    VoiceOPCodes[VoiceOPCodes["Resumed"] = 9] = "Resumed";
    VoiceOPCodes[VoiceOPCodes["ClientDisconnect"] = 13] = "ClientDisconnect";
})(VoiceOPCodes || (exports.VoiceOPCodes = VoiceOPCodes = {}));
/**
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-close-event-codes
 *
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var VoiceCloseCodes;
(function (VoiceCloseCodes) {
    VoiceCloseCodes[VoiceCloseCodes["UnknownOpCode"] = 4001] = "UnknownOpCode";
    VoiceCloseCodes[VoiceCloseCodes["NotAuthenticated"] = 4003] = "NotAuthenticated";
    VoiceCloseCodes[VoiceCloseCodes["AuthenticationFailed"] = 4004] = "AuthenticationFailed";
    VoiceCloseCodes[VoiceCloseCodes["AlreadyAuthenticated"] = 4005] = "AlreadyAuthenticated";
    VoiceCloseCodes[VoiceCloseCodes["SessionNoLongerValid"] = 4006] = "SessionNoLongerValid";
    VoiceCloseCodes[VoiceCloseCodes["SessionTimeout"] = 4009] = "SessionTimeout";
    VoiceCloseCodes[VoiceCloseCodes["ServerNotFound"] = 4011] = "ServerNotFound";
    VoiceCloseCodes[VoiceCloseCodes["UnknownProtocol"] = 4012] = "UnknownProtocol";
    VoiceCloseCodes[VoiceCloseCodes["Disconnected"] = 4014] = "Disconnected";
    VoiceCloseCodes[VoiceCloseCodes["VoiceServerCrashed"] = 4015] = "VoiceServerCrashed";
    VoiceCloseCodes[VoiceCloseCodes["UnknownEncryptionMode"] = 4016] = "UnknownEncryptionMode";
})(VoiceCloseCodes || (exports.VoiceCloseCodes = VoiceCloseCodes = {}));
/**
 * https://discord.com/developers/docs/topics/gateway#list-of-intents
 *
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var GatewayIntentBits;
(function (GatewayIntentBits) {
    GatewayIntentBits[GatewayIntentBits["GUILDS"] = 1] = "GUILDS";
    GatewayIntentBits[GatewayIntentBits["GUILD_MEMBERS"] = 2] = "GUILD_MEMBERS";
    GatewayIntentBits[GatewayIntentBits["GUILD_BANS"] = 4] = "GUILD_BANS";
    GatewayIntentBits[GatewayIntentBits["GUILD_EMOJIS"] = 8] = "GUILD_EMOJIS";
    GatewayIntentBits[GatewayIntentBits["GUILD_INTEGRATIONS"] = 16] = "GUILD_INTEGRATIONS";
    GatewayIntentBits[GatewayIntentBits["GUILD_WEBHOOKS"] = 32] = "GUILD_WEBHOOKS";
    GatewayIntentBits[GatewayIntentBits["GUILD_INVITES"] = 64] = "GUILD_INVITES";
    GatewayIntentBits[GatewayIntentBits["GUILD_VOICE_STATES"] = 128] = "GUILD_VOICE_STATES";
    GatewayIntentBits[GatewayIntentBits["GUILD_PRESENCES"] = 256] = "GUILD_PRESENCES";
    GatewayIntentBits[GatewayIntentBits["GUILD_MESSAGES"] = 512] = "GUILD_MESSAGES";
    GatewayIntentBits[GatewayIntentBits["GUILD_MESSAGE_REACTIONS"] = 1024] = "GUILD_MESSAGE_REACTIONS";
    GatewayIntentBits[GatewayIntentBits["GUILD_MESSAGE_TYPING"] = 2048] = "GUILD_MESSAGE_TYPING";
    GatewayIntentBits[GatewayIntentBits["DIRECT_MESSAGES"] = 4096] = "DIRECT_MESSAGES";
    GatewayIntentBits[GatewayIntentBits["DIRECT_MESSAGE_REACTIONS"] = 8192] = "DIRECT_MESSAGE_REACTIONS";
    GatewayIntentBits[GatewayIntentBits["DIRECT_MESSAGE_TYPING"] = 16384] = "DIRECT_MESSAGE_TYPING";
})(GatewayIntentBits || (exports.GatewayIntentBits = GatewayIntentBits = {}));
/**
 * https://discord.com/developers/docs/topics/gateway#commands-and-events-gateway-events
 *
 * @deprecated Gateway v6 is deprecated and the types will not receive further updates, please update to v8.
 */
var GatewayDispatchEvents;
(function (GatewayDispatchEvents) {
    GatewayDispatchEvents["Ready"] = "READY";
    GatewayDispatchEvents["Resumed"] = "RESUMED";
    GatewayDispatchEvents["ChannelCreate"] = "CHANNEL_CREATE";
    GatewayDispatchEvents["ChannelUpdate"] = "CHANNEL_UPDATE";
    GatewayDispatchEvents["ChannelDelete"] = "CHANNEL_DELETE";
    GatewayDispatchEvents["ChannelPinsUpdate"] = "CHANNEL_PINS_UPDATE";
    GatewayDispatchEvents["GuildCreate"] = "GUILD_CREATE";
    GatewayDispatchEvents["GuildUpdate"] = "GUILD_UPDATE";
    GatewayDispatchEvents["GuildDelete"] = "GUILD_DELETE";
    GatewayDispatchEvents["GuildBanAdd"] = "GUILD_BAN_ADD";
    GatewayDispatchEvents["GuildBanRemove"] = "GUILD_BAN_REMOVE";
    GatewayDispatchEvents["GuildEmojisUpdate"] = "GUILD_EMOJIS_UPDATE";
    GatewayDispatchEvents["GuildIntegrationsUpdate"] = "GUILD_INTEGRATIONS_UPDATE";
    GatewayDispatchEvents["GuildMemberAdd"] = "GUILD_MEMBER_ADD";
    GatewayDispatchEvents["GuildMemberRemove"] = "GUILD_MEMBER_REMOVE";
    GatewayDispatchEvents["GuildMemberUpdate"] = "GUILD_MEMBER_UPDATE";
    GatewayDispatchEvents["GuildMembersChunk"] = "GUILD_MEMBERS_CHUNK";
    GatewayDispatchEvents["GuildRoleCreate"] = "GUILD_ROLE_CREATE";
    GatewayDispatchEvents["GuildRoleUpdate"] = "GUILD_ROLE_UPDATE";
    GatewayDispatchEvents["GuildRoleDelete"] = "GUILD_ROLE_DELETE";
    GatewayDispatchEvents["InviteCreate"] = "INVITE_CREATE";
    GatewayDispatchEvents["InviteDelete"] = "INVITE_DELETE";
    GatewayDispatchEvents["MessageCreate"] = "MESSAGE_CREATE";
    GatewayDispatchEvents["MessageUpdate"] = "MESSAGE_UPDATE";
    GatewayDispatchEvents["MessageDelete"] = "MESSAGE_DELETE";
    GatewayDispatchEvents["MessageDeleteBulk"] = "MESSAGE_DELETE_BULK";
    GatewayDispatchEvents["MessageReactionAdd"] = "MESSAGE_REACTION_ADD";
    GatewayDispatchEvents["MessageReactionRemove"] = "MESSAGE_REACTION_REMOVE";
    GatewayDispatchEvents["MessageReactionRemoveAll"] = "MESSAGE_REACTION_REMOVE_ALL";
    GatewayDispatchEvents["MessageReactionRemoveEmoji"] = "MESSAGE_REACTION_REMOVE_EMOJI";
    GatewayDispatchEvents["PresenceUpdate"] = "PRESENCE_UPDATE";
    GatewayDispatchEvents["TypingStart"] = "TYPING_START";
    GatewayDispatchEvents["UserUpdate"] = "USER_UPDATE";
    GatewayDispatchEvents["VoiceStateUpdate"] = "VOICE_STATE_UPDATE";
    GatewayDispatchEvents["VoiceServerUpdate"] = "VOICE_SERVER_UPDATE";
    GatewayDispatchEvents["WebhooksUpdate"] = "WEBHOOKS_UPDATE";
})(GatewayDispatchEvents || (exports.GatewayDispatchEvents = GatewayDispatchEvents = {}));
// #endregion Shared
//# sourceMappingURL=v6.js.map