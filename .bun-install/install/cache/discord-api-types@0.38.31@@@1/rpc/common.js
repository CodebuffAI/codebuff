"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPCCloseEventCodes = exports.RPCErrorCodes = exports.RelationshipType = exports.VoiceConnectionStates = exports.RPCVoiceShortcutKeyComboKeyType = exports.RPCVoiceSettingsModeType = exports.RPCDeviceType = void 0;
var RPCDeviceType;
(function (RPCDeviceType) {
    RPCDeviceType["AudioInput"] = "audioinput";
    RPCDeviceType["AudioOutput"] = "audiooutput";
    RPCDeviceType["VideoInput"] = "videoinput";
})(RPCDeviceType || (exports.RPCDeviceType = RPCDeviceType = {}));
var RPCVoiceSettingsModeType;
(function (RPCVoiceSettingsModeType) {
    RPCVoiceSettingsModeType["PushToTalk"] = "PUSH_TO_TALK";
    RPCVoiceSettingsModeType["VoiceActivity"] = "VOICE_ACTIVITY";
})(RPCVoiceSettingsModeType || (exports.RPCVoiceSettingsModeType = RPCVoiceSettingsModeType = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#getvoicesettings-key-types}
 */
var RPCVoiceShortcutKeyComboKeyType;
(function (RPCVoiceShortcutKeyComboKeyType) {
    RPCVoiceShortcutKeyComboKeyType[RPCVoiceShortcutKeyComboKeyType["KeyboardKey"] = 0] = "KeyboardKey";
    RPCVoiceShortcutKeyComboKeyType[RPCVoiceShortcutKeyComboKeyType["MouseButton"] = 1] = "MouseButton";
    RPCVoiceShortcutKeyComboKeyType[RPCVoiceShortcutKeyComboKeyType["KeyboardModifierKey"] = 2] = "KeyboardModifierKey";
    RPCVoiceShortcutKeyComboKeyType[RPCVoiceShortcutKeyComboKeyType["GamepadButton"] = 3] = "GamepadButton";
})(RPCVoiceShortcutKeyComboKeyType || (exports.RPCVoiceShortcutKeyComboKeyType = RPCVoiceShortcutKeyComboKeyType = {}));
var VoiceConnectionStates;
(function (VoiceConnectionStates) {
    /**
     * TCP disconnected
     */
    VoiceConnectionStates["Disconnected"] = "DISCONNECTED";
    /**
     * Waiting for voice endpoint
     */
    VoiceConnectionStates["AwaitingEndpoint"] = "AWAITING_ENDPOINT";
    /**
     * TCP authenticating
     */
    VoiceConnectionStates["Authenticating"] = "AUTHENTICATING";
    /**
     * TCP connecting
     */
    VoiceConnectionStates["Connecting"] = "CONNECTING";
    /**
     * TCP connected
     */
    VoiceConnectionStates["Connected"] = "CONNECTED";
    /**
     * TCP connected, Voice disconnected
     */
    VoiceConnectionStates["VoiceDisconnected"] = "VOICE_DISCONNECTED";
    /**
     * TCP connected, Voice connecting
     */
    VoiceConnectionStates["VoiceConnecting"] = "VOICE_CONNECTING";
    /**
     * TCP connected, Voice connected
     */
    VoiceConnectionStates["VoiceConnected"] = "VOICE_CONNECTED";
    /**
     * No route to host
     */
    VoiceConnectionStates["NoRoute"] = "NO_ROUTE";
    /**
     * WebRTC ice checking
     */
    VoiceConnectionStates["IceChecking"] = "ICE_CHECKING";
})(VoiceConnectionStates || (exports.VoiceConnectionStates = VoiceConnectionStates = {}));
/**
 * @unstable
 */
var RelationshipType;
(function (RelationshipType) {
    RelationshipType[RelationshipType["None"] = 0] = "None";
    RelationshipType[RelationshipType["Friend"] = 1] = "Friend";
    RelationshipType[RelationshipType["Blocked"] = 2] = "Blocked";
    RelationshipType[RelationshipType["PendingIncoming"] = 3] = "PendingIncoming";
    RelationshipType[RelationshipType["PendingOutgoing"] = 4] = "PendingOutgoing";
    RelationshipType[RelationshipType["Implicit"] = 5] = "Implicit";
})(RelationshipType || (exports.RelationshipType = RelationshipType = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#rpc-rpc-error-codes}
 */
var RPCErrorCodes;
(function (RPCErrorCodes) {
    /**
     * An unknown error occurred.
     */
    RPCErrorCodes[RPCErrorCodes["UnknownError"] = 1000] = "UnknownError";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["ServiceUnavailable"] = 1001] = "ServiceUnavailable";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["TransactionAborted"] = 1002] = "TransactionAborted";
    /**
     * You sent an invalid payload.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidPayload"] = 4000] = "InvalidPayload";
    /**
     * Invalid command name specified.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidCommand"] = 4002] = "InvalidCommand";
    /**
     * Invalid guild ID specified.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidGuild"] = 4003] = "InvalidGuild";
    /**
     * Invalid event name specified.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidEvent"] = 4004] = "InvalidEvent";
    /**
     * Invalid channel ID specified.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidChannel"] = 4005] = "InvalidChannel";
    /**
     * You lack permissions to access the given resource.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidPermissions"] = 4006] = "InvalidPermissions";
    /**
     * An invalid OAuth2 application ID was used to authorize or authenticate with.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidClientId"] = 4007] = "InvalidClientId";
    /**
     * An invalid OAuth2 application origin was used to authorize or authenticate with.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidOrigin"] = 4008] = "InvalidOrigin";
    /**
     * An invalid OAuth2 token was used to authorize or authenticate with.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidToken"] = 4009] = "InvalidToken";
    /**
     * The specified user ID was invalid.
     */
    RPCErrorCodes[RPCErrorCodes["InvalidUser"] = 4010] = "InvalidUser";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["InvalidInvite"] = 4011] = "InvalidInvite";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["InvalidActivityJoinRequest"] = 4012] = "InvalidActivityJoinRequest";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["InvalidEntitlement"] = 4013] = "InvalidEntitlement";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["InvalidGiftCode"] = 4014] = "InvalidGiftCode";
    /**
     * A standard OAuth2 error occurred; check the data object for the OAuth2 error details.
     */
    RPCErrorCodes[RPCErrorCodes["OAuth2Error"] = 5000] = "OAuth2Error";
    /**
     * An asynchronous `SELECT_TEXT_CHANNEL`/`SELECT_VOICE_CHANNEL` command timed out.
     */
    RPCErrorCodes[RPCErrorCodes["SelectChannelTimedOut"] = 5001] = "SelectChannelTimedOut";
    /**
     * An asynchronous `GET_GUILD` command timed out.
     */
    RPCErrorCodes[RPCErrorCodes["GetGuildTimedOut"] = 5002] = "GetGuildTimedOut";
    /**
     * You tried to join a user to a voice channel but the user was already in one.
     */
    RPCErrorCodes[RPCErrorCodes["SelectVoiceForceRequired"] = 5003] = "SelectVoiceForceRequired";
    /**
     * You tried to capture more than one shortcut key at once.
     */
    RPCErrorCodes[RPCErrorCodes["CaptureShortcutAlreadyListening"] = 5004] = "CaptureShortcutAlreadyListening";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["InvalidActivitySecret"] = 5005] = "InvalidActivitySecret";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["NoEligibleActivity"] = 5006] = "NoEligibleActivity";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["PurchaseCanceled"] = 5007] = "PurchaseCanceled";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["PurchaseError"] = 5008] = "PurchaseError";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["UnauthorizedForAchievement"] = 5009] = "UnauthorizedForAchievement";
    /**
     * @unstable
     */
    RPCErrorCodes[RPCErrorCodes["RateLimited"] = 5010] = "RateLimited";
})(RPCErrorCodes || (exports.RPCErrorCodes = RPCErrorCodes = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#rpc-rpc-close-event-codes}
 */
var RPCCloseEventCodes;
(function (RPCCloseEventCodes) {
    /**
     * @unstable
     */
    RPCCloseEventCodes[RPCCloseEventCodes["CloseNormal"] = 1000] = "CloseNormal";
    /**
     * @unstable
     */
    RPCCloseEventCodes[RPCCloseEventCodes["CloseUnsupported"] = 1003] = "CloseUnsupported";
    /**
     * @unstable
     */
    RPCCloseEventCodes[RPCCloseEventCodes["CloseAbnormal"] = 1006] = "CloseAbnormal";
    /**
     * You connected to the RPC server with an invalid client ID.
     */
    RPCCloseEventCodes[RPCCloseEventCodes["InvalidClientId"] = 4000] = "InvalidClientId";
    /**
     * You connected to the RPC server with an invalid origin.
     */
    RPCCloseEventCodes[RPCCloseEventCodes["InvalidOrigin"] = 4001] = "InvalidOrigin";
    /**
     * You are being rate limited.
     */
    RPCCloseEventCodes[RPCCloseEventCodes["RateLimited"] = 4002] = "RateLimited";
    /**
     * The OAuth2 token associated with a connection was revoked, get a new one!
     */
    RPCCloseEventCodes[RPCCloseEventCodes["TokenRevoked"] = 4003] = "TokenRevoked";
    /**
     * The RPC Server version specified in the connection string was not valid.
     */
    RPCCloseEventCodes[RPCCloseEventCodes["InvalidVersion"] = 4004] = "InvalidVersion";
    /**
     * The encoding specified in the connection string was not valid.
     */
    RPCCloseEventCodes[RPCCloseEventCodes["InvalidEncoding"] = 4005] = "InvalidEncoding";
})(RPCCloseEventCodes || (exports.RPCCloseEventCodes = RPCCloseEventCodes = {}));
//# sourceMappingURL=common.js.map