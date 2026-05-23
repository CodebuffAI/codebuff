import type { Snowflake } from '../globals';
/**
 * @unstable The ping object for the `VOICE_CONNECTION_STATUS` dispatched {@link RPCVoiceConnectionStatusDispatchData.pings} field,
 * but discord's documentation incorrectly documents it as an 'array of integers'.
 */
export interface RPCVoiceConnectionStatusPing {
    /**
     * The time the ping was sent
     */
    time: number;
    /**
     * The latency of the ping in milliseconds
     */
    value: number;
}
/**
 * @unstable
 */
export interface RPCAPIMessageParsedContentOriginalMatch {
    0: string;
    index: 0;
}
/**
 * @unstable
 */
export interface RPCAPIBaseMessageParsedContentText {
    type: 'text';
    content: string;
}
/**
 * @unstable
 */
export interface RPCAPIMessageParsedContentText extends RPCAPIBaseMessageParsedContentText {
    originalMatch: RPCAPIMessageParsedContentOriginalMatch;
}
/**
 * @unstable
 */
export interface RPCAPIMessageParsedContentMention {
    type: 'mention';
    userId: Snowflake;
    channelId: Snowflake;
    guildId: Snowflake;
    /**
     * Same as {@link RPCAPIMessageParsedContentMention.userId}
     */
    parsedUserId: RPCAPIMessageParsedContentMention['userId'];
    content: RPCAPIBaseMessageParsedContentText;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#authenticate-oauth2-application-structure}
 */
export interface RPCOAuth2Application {
    /**
     * Application description
     */
    description: string;
    /**
     * Hash of the icon
     */
    icon: string;
    /**
     * Application client id
     */
    id: Snowflake;
    /**
     * Array of RPC origin urls
     */
    rpc_origins: string[];
    /**
     * Application name
     */
    name: string;
}
export interface RPCDeviceVendor {
    /**
     * Name of the vendor
     */
    name: string;
    /**
     * Url for the vendor
     */
    url: string;
}
export interface RPCDeviceModel {
    /**
     * Name of the model
     */
    name: string;
    /**
     * Url for the model
     */
    url: string;
}
export declare enum RPCDeviceType {
    AudioInput = "audioinput",
    AudioOutput = "audiooutput",
    VideoInput = "videoinput"
}
export interface BaseRPCCertifiedDevice<Type extends RPCDeviceType> {
    /**
     * The type of device
     */
    type: Type;
    /**
     * The device's Windows UUID
     */
    id: string;
    /**
     * The hardware vendor
     */
    vendor: RPCDeviceVendor;
    /**
     * The model of the product
     */
    model: RPCDeviceModel;
    /**
     * UUIDs of related devices
     */
    related: string[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#setcertifieddevices-device-object}
 */
export type RPCCertifiedDevice<Type extends RPCDeviceType = RPCDeviceType> = Type extends RPCDeviceType.AudioInput ? BaseRPCCertifiedDevice<Type> & {
    /**
     * If the device's native echo cancellation is enabled
     */
    echo_cancellation: boolean;
    /**
     * If the device's native noise suppression is enabled
     */
    noise_suppression: boolean;
    /**
     * If the device's native automatic gain control is enabled
     */
    automatic_gain_control: boolean;
    /**
     * If the device is hardware muted
     */
    hardware_mute: boolean;
} : BaseRPCCertifiedDevice<Type>;
export interface RPCVoiceAvailableDevice {
    /**
     * Device id
     */
    id: string;
    /**
     * Device name
     */
    name: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#getvoicesettings-voice-settings-input-object}
 */
export interface RPCVoiceSettingsInput {
    /**
     * Device id
     */
    device_id: string;
    /**
     * Input voice level (min: 0.0, max: 100.0)
     */
    volume: number;
    /**
     * Array of read-only device objects containing `id` and `name` string keys
     */
    available_devices: RPCVoiceAvailableDevice[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#getvoicesettings-voice-settings-output-object}
 */
export interface RPCVoiceSettingsOutput {
    /**
     * Device id
     */
    device_id: string;
    /**
     * Input voice level (min: 0.0, max: 200.0)
     */
    volume: number;
    /**
     * Array of read-only device objects containing `id` and `name` string keys
     */
    available_devices: RPCVoiceAvailableDevice[];
}
export declare enum RPCVoiceSettingsModeType {
    PushToTalk = "PUSH_TO_TALK",
    VoiceActivity = "VOICE_ACTIVITY"
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#getvoicesettings-key-types}
 */
export declare enum RPCVoiceShortcutKeyComboKeyType {
    KeyboardKey = 0,
    MouseButton = 1,
    KeyboardModifierKey = 2,
    GamepadButton = 3
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#getvoicesettings-shortcut-key-combo-object}
 */
export interface RPCVoiceShortcutKeyCombo {
    /**
     * Type of key
     */
    type: RPCVoiceShortcutKeyComboKeyType;
    /**
     * Key code
     */
    code: number;
    /**
     * Key name
     */
    name: string;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/rpc#getvoicesettings-voice-settings-mode-object}
 */
export interface RPCVoiceSettingsMode {
    /**
     * Voice setting mode type
     */
    type: RPCVoiceSettingsModeType;
    /**
     * Voice activity threshold automatically sets its threshold
     */
    auto_threshold: boolean;
    /**
     * Threshold for voice activity (in dB) (min: -100.0, max: 0.0)
     */
    threshold: number;
    /**
     * Shortcut key combos for PTT
     */
    shortcut: RPCVoiceShortcutKeyCombo;
    /**
     * The PTT release delay (in ms) (min: 0, max: 2000)
     */
    delay: number;
}
export declare enum VoiceConnectionStates {
    /**
     * TCP disconnected
     */
    Disconnected = "DISCONNECTED",
    /**
     * Waiting for voice endpoint
     */
    AwaitingEndpoint = "AWAITING_ENDPOINT",
    /**
     * TCP authenticating
     */
    Authenticating = "AUTHENTICATING",
    /**
     * TCP connecting
     */
    Connecting = "CONNECTING",
    /**
     * TCP connected
     */
    Connected = "CONNECTED",
    /**
     * TCP connected, Voice disconnected
     */
    VoiceDisconnected = "VOICE_DISCONNECTED",
    /**
     * TCP connected, Voice connecting
     */
    VoiceConnecting = "VOICE_CONNECTING",
    /**
     * TCP connected, Voice connected
     */
    VoiceConnected = "VOICE_CONNECTED",
    /**
     * No route to host
     */
    NoRoute = "NO_ROUTE",
    /**
     * WebRTC ice checking
     */
    IceChecking = "ICE_CHECKING"
}
/**
 * @unstable
 */
export declare enum RelationshipType {
    None = 0,
    Friend = 1,
    Blocked = 2,
    PendingIncoming = 3,
    PendingOutgoing = 4,
    Implicit = 5
}
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#rpc-rpc-error-codes}
 */
export declare enum RPCErrorCodes {
    /**
     * An unknown error occurred.
     */
    UnknownError = 1000,
    /**
     * @unstable
     */
    ServiceUnavailable = 1001,
    /**
     * @unstable
     */
    TransactionAborted = 1002,
    /**
     * You sent an invalid payload.
     */
    InvalidPayload = 4000,
    /**
     * Invalid command name specified.
     */
    InvalidCommand = 4002,
    /**
     * Invalid guild ID specified.
     */
    InvalidGuild = 4003,
    /**
     * Invalid event name specified.
     */
    InvalidEvent = 4004,
    /**
     * Invalid channel ID specified.
     */
    InvalidChannel = 4005,
    /**
     * You lack permissions to access the given resource.
     */
    InvalidPermissions = 4006,
    /**
     * An invalid OAuth2 application ID was used to authorize or authenticate with.
     */
    InvalidClientId = 4007,
    /**
     * An invalid OAuth2 application origin was used to authorize or authenticate with.
     */
    InvalidOrigin = 4008,
    /**
     * An invalid OAuth2 token was used to authorize or authenticate with.
     */
    InvalidToken = 4009,
    /**
     * The specified user ID was invalid.
     */
    InvalidUser = 4010,
    /**
     * @unstable
     */
    InvalidInvite = 4011,
    /**
     * @unstable
     */
    InvalidActivityJoinRequest = 4012,
    /**
     * @unstable
     */
    InvalidEntitlement = 4013,
    /**
     * @unstable
     */
    InvalidGiftCode = 4014,
    /**
     * A standard OAuth2 error occurred; check the data object for the OAuth2 error details.
     */
    OAuth2Error = 5000,
    /**
     * An asynchronous `SELECT_TEXT_CHANNEL`/`SELECT_VOICE_CHANNEL` command timed out.
     */
    SelectChannelTimedOut = 5001,
    /**
     * An asynchronous `GET_GUILD` command timed out.
     */
    GetGuildTimedOut = 5002,
    /**
     * You tried to join a user to a voice channel but the user was already in one.
     */
    SelectVoiceForceRequired = 5003,
    /**
     * You tried to capture more than one shortcut key at once.
     */
    CaptureShortcutAlreadyListening = 5004,
    /**
     * @unstable
     */
    InvalidActivitySecret = 5005,
    /**
     * @unstable
     */
    NoEligibleActivity = 5006,
    /**
     * @unstable
     */
    PurchaseCanceled = 5007,
    /**
     * @unstable
     */
    PurchaseError = 5008,
    /**
     * @unstable
     */
    UnauthorizedForAchievement = 5009,
    /**
     * @unstable
     */
    RateLimited = 5010
}
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#rpc-rpc-close-event-codes}
 */
export declare enum RPCCloseEventCodes {
    /**
     * @unstable
     */
    CloseNormal = 1000,
    /**
     * @unstable
     */
    CloseUnsupported = 1003,
    /**
     * @unstable
     */
    CloseAbnormal = 1006,
    /**
     * You connected to the RPC server with an invalid client ID.
     */
    InvalidClientId = 4000,
    /**
     * You connected to the RPC server with an invalid origin.
     */
    InvalidOrigin = 4001,
    /**
     * You are being rate limited.
     */
    RateLimited = 4002,
    /**
     * The OAuth2 token associated with a connection was revoked, get a new one!
     */
    TokenRevoked = 4003,
    /**
     * The RPC Server version specified in the connection string was not valid.
     */
    InvalidVersion = 4004,
    /**
     * The encoding specified in the connection string was not valid.
     */
    InvalidEncoding = 4005
}
//# sourceMappingURL=common.d.ts.map