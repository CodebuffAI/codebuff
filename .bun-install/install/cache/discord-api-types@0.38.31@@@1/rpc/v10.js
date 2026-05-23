"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPCEvents = exports.RPCCommands = exports.RPCVersion = void 0;
__exportStar(require("./common"), exports);
exports.RPCVersion = '1';
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#commands-and-events-rpc-commands}
 */
var RPCCommands;
(function (RPCCommands) {
    /**
     * @unstable
     */
    RPCCommands["AcceptActivityInvite"] = "ACCEPT_ACTIVITY_INVITE";
    /**
     * @unstable
     */
    RPCCommands["ActivityInviteUser"] = "ACTIVITY_INVITE_USER";
    /**
     * Used to authenticate an existing client with your app
     */
    RPCCommands["Authenticate"] = "AUTHENTICATE";
    /**
     * Used to authorize a new client with your app
     */
    RPCCommands["Authorize"] = "AUTHORIZE";
    /**
     * @unstable
     */
    RPCCommands["BraintreePopupBridgeCallback"] = "BRAINTREE_POPUP_BRIDGE_CALLBACK";
    /**
     * @unstable
     */
    RPCCommands["BrowserHandoff"] = "BROWSER_HANDOFF";
    /**
     * 	used to reject a Rich Presence Ask to Join request
     *
     * @unstable the documented similarly named command `CLOSE_ACTIVITY_REQUEST` does not exist, but `CLOSE_ACTIVITY_JOIN_REQUEST` does
     */
    RPCCommands["CloseActivityJoinRequest"] = "CLOSE_ACTIVITY_JOIN_REQUEST";
    /**
     * @unstable
     */
    RPCCommands["ConnectionsCallback"] = "CONNECTIONS_CALLBACK";
    RPCCommands["CreateChannelInvite"] = "CREATE_CHANNEL_INVITE";
    /**
     * @unstable
     */
    RPCCommands["DeepLink"] = "DEEP_LINK";
    /**
     * Event dispatch
     */
    RPCCommands["Dispatch"] = "DISPATCH";
    /**
     * @unstable
     */
    RPCCommands["GetApplicationTicket"] = "GET_APPLICATION_TICKET";
    /**
     * Used to retrieve channel information from the client
     */
    RPCCommands["GetChannel"] = "GET_CHANNEL";
    /**
     * Used to retrieve a list of channels for a guild from the client
     */
    RPCCommands["GetChannels"] = "GET_CHANNELS";
    /**
     * @unstable
     */
    RPCCommands["GetEntitlementTicket"] = "GET_ENTITLEMENT_TICKET";
    /**
     * @unstable
     */
    RPCCommands["GetEntitlements"] = "GET_ENTITLEMENTS";
    /**
     * Used to retrieve guild information from the client
     */
    RPCCommands["GetGuild"] = "GET_GUILD";
    /**
     * Used to retrieve a list of guilds from the client
     */
    RPCCommands["GetGuilds"] = "GET_GUILDS";
    /**
     * @unstable
     */
    RPCCommands["GetImage"] = "GET_IMAGE";
    /**
     * @unstable
     */
    RPCCommands["GetNetworkingConfig"] = "GET_NETWORKING_CONFIG";
    /**
     * @unstable
     */
    RPCCommands["GetRelationships"] = "GET_RELATIONSHIPS";
    /**
     * Used to get the current voice channel the client is in
     */
    RPCCommands["GetSelectedVoiceChannel"] = "GET_SELECTED_VOICE_CHANNEL";
    /**
     * @unstable
     */
    RPCCommands["GetSkus"] = "GET_SKUS";
    /**
     * @unstable
     */
    RPCCommands["GetUser"] = "GET_USER";
    /**
     * Used to retrieve the client's voice settings
     */
    RPCCommands["GetVoiceSettings"] = "GET_VOICE_SETTINGS";
    /**
     * @unstable
     */
    RPCCommands["GiftCodeBrowser"] = "GIFT_CODE_BROWSER";
    /**
     * @unstable
     */
    RPCCommands["GuildTemplateBrowser"] = "GUILD_TEMPLATE_BROWSER";
    /**
     * @unstable
     */
    RPCCommands["InviteBrowser"] = "INVITE_BROWSER";
    /**
     * @unstable
     */
    RPCCommands["NetworkingCreateToken"] = "NETWORKING_CREATE_TOKEN";
    /**
     * @unstable
     */
    RPCCommands["NetworkingPeerMetrics"] = "NETWORKING_PEER_METRICS";
    /**
     * @unstable
     */
    RPCCommands["NetworkingSystemMetrics"] = "NETWORKING_SYSTEM_METRICS";
    /**
     * @unstable
     */
    RPCCommands["OpenOverlayActivityInvite"] = "OPEN_OVERLAY_ACTIVITY_INVITE";
    /**
     * @unstable
     */
    RPCCommands["OpenOverlayGuildInvite"] = "OPEN_OVERLAY_GUILD_INVITE";
    /**
     * @unstable
     */
    RPCCommands["OpenOverlayVoiceSettings"] = "OPEN_OVERLAY_VOICE_SETTINGS";
    /**
     * @unstable
     */
    RPCCommands["Overlay"] = "OVERLAY";
    /**
     * Used to join or leave a text channel, group dm, or dm
     */
    RPCCommands["SelectTextChannel"] = "SELECT_TEXT_CHANNEL";
    /**
     * Used to join or leave a voice channel, group dm, or dm
     */
    RPCCommands["SelectVoiceChannel"] = "SELECT_VOICE_CHANNEL";
    /**
     * Used to consent to a Rich Presence Ask to Join request
     */
    RPCCommands["SendActivityJoinInvite"] = "SEND_ACTIVITY_JOIN_INVITE";
    /**
     * Used to update a user's Rich Presence
     */
    RPCCommands["SetActivity"] = "SET_ACTIVITY";
    /**
     * Used to send info about certified hardware devices
     */
    RPCCommands["SetCertifiedDevices"] = "SET_CERTIFIED_DEVICES";
    /**
     * @unstable
     */
    RPCCommands["SetOverlayLocked"] = "SET_OVERLAY_LOCKED";
    /**
     * Used to change voice settings of users in voice channels
     */
    RPCCommands["SetUserVoiceSettings"] = "SET_USER_VOICE_SETTINGS";
    RPCCommands["SetUserVoiceSettings2"] = "SET_USER_VOICE_SETTINGS_2";
    /**
     * Used to set the client's voice settings
     */
    RPCCommands["SetVoiceSettings"] = "SET_VOICE_SETTINGS";
    RPCCommands["SetVoiceSettings2"] = "SET_VOICE_SETTINGS_2";
    /**
     * @unstable
     */
    RPCCommands["StartPurchase"] = "START_PURCHASE";
    /**
     * Used to subscribe to an RPC event
     */
    RPCCommands["Subscribe"] = "SUBSCRIBE";
    /**
     * Used to unsubscribe from an RPC event
     */
    RPCCommands["Unsubscribe"] = "UNSUBSCRIBE";
    /**
     * @unstable
     */
    RPCCommands["ValidateApplication"] = "VALIDATE_APPLICATION";
})(RPCCommands || (exports.RPCCommands = RPCCommands = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#commands-and-events-rpc-events}
 */
var RPCEvents;
(function (RPCEvents) {
    /**
     * @unstable
     */
    RPCEvents["ActivityInvite"] = "ACTIVITY_INVITE";
    RPCEvents["ActivityJoin"] = "ACTIVITY_JOIN";
    RPCEvents["ActivityJoinRequest"] = "ACTIVITY_JOIN_REQUEST";
    RPCEvents["ActivitySpectate"] = "ACTIVITY_SPECTATE";
    RPCEvents["ChannelCreate"] = "CHANNEL_CREATE";
    RPCEvents["CurrentUserUpdate"] = "CURRENT_USER_UPDATE";
    /**
     * @unstable
     */
    RPCEvents["EntitlementCreate"] = "ENTITLEMENT_CREATE";
    /**
     * @unstable
     */
    RPCEvents["EntitlementDelete"] = "ENTITLEMENT_DELETE";
    RPCEvents["Error"] = "ERROR";
    /**
     * @unstable
     */
    RPCEvents["GameJoin"] = "GAME_JOIN";
    /**
     * @unstable
     */
    RPCEvents["GameSpectate"] = "GAME_SPECTATE";
    RPCEvents["GuildCreate"] = "GUILD_CREATE";
    RPCEvents["GuildStatus"] = "GUILD_STATUS";
    /**
     * Dispatches message objects, with the exception of deletions, which only contains the id in the message object.
     */
    RPCEvents["MessageCreate"] = "MESSAGE_CREATE";
    /**
     * Dispatches message objects, with the exception of deletions, which only contains the id in the message object.
     */
    RPCEvents["MessageDelete"] = "MESSAGE_DELETE";
    /**
     * Dispatches message objects, with the exception of deletions, which only contains the id in the message object.
     */
    RPCEvents["MessageUpdate"] = "MESSAGE_UPDATE";
    /**
     * This event requires the `rpc.notifications.read` {@link https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes | OAuth2 scope}.
     */
    RPCEvents["NotificationCreate"] = "NOTIFICATION_CREATE";
    /**
     * @unstable
     */
    RPCEvents["Overlay"] = "OVERLAY";
    /**
     * @unstable
     */
    RPCEvents["OverlayUpdate"] = "OVERLAY_UPDATE";
    RPCEvents["Ready"] = "READY";
    /**
     * @unstable
     */
    RPCEvents["RelationshipUpdate"] = "RELATIONSHIP_UPDATE";
    RPCEvents["SpeakingStart"] = "SPEAKING_START";
    RPCEvents["SpeakingStop"] = "SPEAKING_STOP";
    RPCEvents["VoiceChannelSelect"] = "VOICE_CHANNEL_SELECT";
    RPCEvents["VoiceConnectionStatus"] = "VOICE_CONNECTION_STATUS";
    RPCEvents["VoiceSettingsUpdate"] = "VOICE_SETTINGS_UPDATE";
    /**
     * @unstable
     */
    RPCEvents["VoiceSettingsUpdate2"] = "VOICE_SETTINGS_UPDATE_2";
    /**
     * Dispatches channel voice state objects
     */
    RPCEvents["VoiceStateCreate"] = "VOICE_STATE_CREATE";
    /**
     * Dispatches channel voice state objects
     */
    RPCEvents["VoiceStateDelete"] = "VOICE_STATE_DELETE";
    /**
     * Dispatches channel voice state objects
     */
    RPCEvents["VoiceStateUpdate"] = "VOICE_STATE_UPDATE";
})(RPCEvents || (exports.RPCEvents = RPCEvents = {}));
//# sourceMappingURL=v10.js.map