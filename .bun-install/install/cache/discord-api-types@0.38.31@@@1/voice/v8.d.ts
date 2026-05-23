import type { Snowflake } from "../globals";
export declare const VoiceGatewayVersion = "8";
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-opcodes}
 */
export declare enum VoiceOpcodes {
    /**
     * Begin a voice websocket connection
     */
    Identify = 0,
    /**
     * Select the voice protocol
     */
    SelectProtocol = 1,
    /**
     * Complete the websocket handshake
     */
    Ready = 2,
    /**
     * Keep the websocket connection alive
     */
    Heartbeat = 3,
    /**
     * Describe the session
     */
    SessionDescription = 4,
    /**
     * Indicate which users are speaking
     */
    Speaking = 5,
    /**
     * Sent to acknowledge a received client heartbeat
     */
    HeartbeatAck = 6,
    /**
     * Resume a connection
     */
    Resume = 7,
    /**
     * Time to wait between sending heartbeats in milliseconds
     */
    Hello = 8,
    /**
     * Acknowledge a successful session resume
     */
    Resumed = 9,
    /**
     * One or more clients have connected to the voice channel
     */
    ClientsConnect = 11,
    /**
     * A client has disconnected from the voice channel
     */
    ClientDisconnect = 13,
    /**
     * A downgrade from the DAVE protocol is upcoming
     */
    DavePrepareTransition = 21,
    /**
     * Execute a previously announced protocol transition
     */
    DaveExecuteTransition = 22,
    /**
     * Acknowledge readiness previously announced transition
     */
    DaveTransitionReady = 23,
    /**
     * A DAVE protocol version or group change is upcoming
     */
    DavePrepareEpoch = 24,
    /**
     * Credential and public key for MLS external sender
     */
    DaveMlsExternalSender = 25,
    /**
     * MLS Key Package for pending group member
     */
    DaveMlsKeyPackage = 26,
    /**
     * MLS Proposals to be appended or revoked
     */
    DaveMlsProposals = 27,
    /**
     * MLS Commit with optional MLS Welcome messages
     */
    DaveMlsCommitWelcome = 28,
    /**
     * MLS Commit to be processed for upcoming transition
     */
    DaveMlsAnnounceCommitTransition = 29,
    /**
     * MLS Welcome to group for upcoming transition
     */
    DaveMlsWelcome = 30,
    /**
     * Flag invalid commit or welcome, request re-add
     */
    DaveMlsInvalidCommitWelcome = 31
}
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-close-event-codes}
 */
export declare enum VoiceCloseCodes {
    /**
     * You sent an invalid opcode
     */
    UnknownOpcode = 4001,
    /**
     * You sent a invalid payload in your identifying to the Gateway
     */
    FailedToDecode = 4002,
    /**
     * You sent a payload before identifying with the Gateway
     */
    NotAuthenticated = 4003,
    /**
     * The token you sent in your identify payload is incorrect
     */
    AuthenticationFailed = 4004,
    /**
     * You sent more than one identify payload. Stahp
     */
    AlreadyAuthenticated = 4005,
    /**
     * Your session is no longer valid
     */
    SessionNoLongerValid = 4006,
    /**
     * Your session has timed out
     */
    SessionTimeout = 4009,
    /**
     * We can't find the server you're trying to connect to
     */
    ServerNotFound = 4011,
    /**
     * We didn't recognize the protocol you sent
     */
    UnknownProtocol = 4012,
    /**
     * Either the channel was deleted, you were kicked, or the main gateway session was dropped. Should not reconnect
     */
    Disconnected = 4014,
    /**
     * The server crashed. Our bad! Try resuming
     */
    VoiceServerCrashed = 4015,
    /**
     * We didn't recognize your encryption
     */
    UnknownEncryptionMode = 4016,
    /**
     * You sent a malformed request
     */
    BadRequest = 4020,
    /**
     * Disconnect due to rate limit exceeded. Should not reconnect
     */
    RateLimited = 4021,
    /**
     * Disconnect all clients due to call terminated (channel deleted, voice server changed, etc.). Should not reconnect
     */
    CallTerminated = 4022
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-modes}
 */
export declare enum VoiceEncryptionMode {
    /**
     * AEAD AES256-GCM (RTP Size)
     */
    AeadAes256GcmRtpSize = "aead_aes256_gcm_rtpsize",
    /**
     * AEAD XChaCha20 Poly1305 (RTP Size)
     */
    AeadXChaCha20Poly1305RtpSize = "aead_xchacha20_poly1305_rtpsize",
    /**
     * XSalsa20 Poly1305 Lite (RTP Size)
     *
     * @deprecated This encryption mode has been discontinued.
     */
    XSalsa20Poly1305LiteRtpSize = "xsalsa20_poly1305_lite_rtpsize",
    /**
     * AEAD AES256-GCM
     *
     * @deprecated This encryption mode has been discontinued.
     */
    AeadAes256Gcm = "aead_aes256_gcm",
    /**
     * XSalsa20 Poly1305
     *
     * @deprecated This encryption mode has been discontinued.
     */
    XSalsa20Poly1305 = "xsalsa20_poly1305",
    /**
     * XSalsa20 Poly1305 Suffix
     *
     * @deprecated This encryption mode has been discontinued.
     */
    XSalsa20Poly1305Suffix = "xsalsa20_poly1305_suffix",
    /**
     * XSalsa20 Poly1305 Lite
     *
     * @deprecated This encryption mode has been discontinued.
     */
    XSalsa20Poly1305Lite = "xsalsa20_poly1305_lite"
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#speaking}
 */
export declare enum VoiceSpeakingFlags {
    /**
     * Normal transmission of voice audio
     */
    Microphone = 1,
    /**
     * 	Transmission of context audio for video, no speaking indicator
     */
    Soundshare = 2,
    /**
     * Priority speaker, lowering audio of other speakers
     */
    Priority = 4
}
export type VoiceSendPayload = VoiceDaveMlsInvalidCommitWelcome | VoiceDaveTransitionReady | VoiceHeartbeat | VoiceIdentify | VoiceResume | VoiceSelectProtocol | VoiceSpeakingSend;
export type VoiceReceivePayload = VoiceClientDisconnect | VoiceClientsConnect | VoiceDaveExecuteTransition | VoiceDavePrepareEpoch | VoiceDavePrepareTransition | VoiceHeartbeatAck | VoiceHello | VoiceReady | VoiceResumed | VoiceSessionDescription | VoiceSpeaking;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#heartbeating}
 */
export type VoiceHello = _DataPayload<VoiceOpcodes.Hello, VoiceHelloData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#heartbeating}
 */
export interface VoiceHelloData {
    /**
     * Voice gateway version
     *
     * @see {@link https://discord.com/developers/docs/topics/voice-connections#voice-gateway-versioning-gateway-versions}
     */
    v: number;
    /**
     * The interval (in milliseconds) the client should heartbeat with
     */
    heartbeat_interval: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection}
 */
export type VoiceReady = _DataPayload<VoiceOpcodes.Ready, VoiceReadyData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection}
 */
export interface VoiceReadyData {
    /**
     * SSRC identifier
     */
    ssrc: number;
    /**
     * UDP IP
     */
    ip: string;
    /**
     * UDP port
     */
    port: number;
    /**
     * Supported encryption modes
     *
     * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-modes}
     */
    modes: VoiceEncryptionMode[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#heartbeating}
 */
export type VoiceHeartbeatAck = _DataPayload<VoiceOpcodes.HeartbeatAck, VoiceHeartbeatAckData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#heartbeating}
 */
export interface VoiceHeartbeatAckData {
    /**
     * The integer nonce
     */
    t: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-and-sending-voice}
 */
export type VoiceSessionDescription = _DataPayload<VoiceOpcodes.SessionDescription, VoiceSessionDescriptionData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-and-sending-voice}
 */
export interface VoiceSessionDescriptionData {
    /**
     * The selected mode
     */
    mode: VoiceEncryptionMode;
    /**
     * The secret key
     */
    secret_key: number[];
    /**
     * The selected DAVE protocol version
     *
     * @see {@link https://daveprotocol.com/#select_protocol_ack-4}
     */
    dave_protocol_version: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#resuming-voice-connection}
 */
export type VoiceResumed = _DataPayload<VoiceOpcodes.Resumed, null>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#speaking}
 */
export type VoiceSpeaking = _DataPayload<VoiceOpcodes.Speaking, VoiceSpeakingData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#speaking}
 */
export interface VoiceSpeakingData {
    /**
     * The speaking mode flags
     */
    speaking: VoiceSpeakingFlags;
    /**
     * SSRC identifier
     */
    ssrc: number;
    /**
     * User id
     */
    user_id: Snowflake;
}
/**
 * @see {@link https://daveprotocol.com/#clients_connect-11}
 */
export type VoiceClientsConnect = _DataPayload<VoiceOpcodes.ClientsConnect, VoiceClientsConnectData>;
/**
 * @see {@link https://daveprotocol.com/#clients_connect-11}
 */
export interface VoiceClientsConnectData {
    /**
     * The connected user ids
     */
    user_ids: Snowflake[];
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections}
 */
export type VoiceClientDisconnect = _DataPayload<VoiceOpcodes.ClientDisconnect, VoiceClientDisconnectData>;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections}
 */
export interface VoiceClientDisconnectData {
    /**
     * The disconnected user id
     */
    user_id: Snowflake;
}
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_prepare_transition-21}
 */
export type VoiceDavePrepareTransition = _DataPayload<VoiceOpcodes.DavePrepareTransition, VoiceDavePrepareTransitionData>;
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_prepare_transition-21}
 */
export interface VoiceDavePrepareTransitionData {
    /**
     * The protocol version
     */
    protocol_version: number;
    /**
     * The transition id
     */
    transition_id: number;
}
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_execute_transition-22}
 */
export type VoiceDaveExecuteTransition = _DataPayload<VoiceOpcodes.DaveExecuteTransition, VoiceDaveExecuteTransitionData>;
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_execute_transition-22}
 */
export interface VoiceDaveExecuteTransitionData {
    /**
     * The transition id
     */
    transition_id: number;
}
/**
 * @see {@link https://daveprotocol.com/#dave_mls_external_sender_package-25}
 */
export type VoiceDaveMlsExternalSender = VoiceBinaryPayload;
/**
 * @see {@link https://daveprotocol.com/#dave_mls_proposals-27}
 */
export type VoiceDaveMlsProposals = VoiceBinaryPayload;
/**
 * @see {@link https://daveprotocol.com/#dave_mls_announce_commit_transition-29}
 */
export type VoiceDaveMlsAnnounceCommitTransition = VoiceBinaryPayload;
/**
 * @see {@link https://daveprotocol.com/#dave_mls_welcome-30}
 */
export type VoiceDaveMlsWelcome = VoiceBinaryPayload;
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection}
 */
export interface VoiceIdentify {
    op: VoiceOpcodes.Identify;
    d: VoiceIdentifyData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection}
 */
export interface VoiceIdentifyData {
    /**
     * The id of the server to connect to
     */
    server_id: Snowflake;
    /**
     * The id of the user to connect as
     */
    user_id: Snowflake;
    /**
     * Voice state session id
     */
    session_id: string;
    /**
     * Voice connection token
     */
    token: string;
    /**
     * The maximum DAVE protocol version supported
     */
    max_dave_protocol_version?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection}
 */
export interface VoiceHeartbeat {
    op: VoiceOpcodes.Heartbeat;
    d: VoiceHeartbeatData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection}
 */
export interface VoiceHeartbeatData {
    /**
     * The integer nonce
     */
    t: number;
    /**
     * The last sequence number recieved
     */
    seq_ack: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-udp-connection}
 */
export interface VoiceSelectProtocol {
    op: VoiceOpcodes.SelectProtocol;
    d: VoiceSelectProtocolData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-udp-connection}
 */
export interface VoiceSelectProtocolData {
    /**
     * Voice protocol
     */
    protocol: string;
    /**
     * Data associated with the protocol
     */
    data: VoiceUDPProtocolData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-udp-connection}
 */
export interface VoiceUDPProtocolData {
    /**
     * External address
     */
    address: string;
    /**
     * External UDP port
     */
    port: number;
    /**
     * Selected mode
     *
     * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-modes}
     */
    mode: VoiceEncryptionMode;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#resuming-voice-connection}
 */
export interface VoiceResume {
    op: VoiceOpcodes.Resume;
    d: VoiceResumeData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#resuming-voice-connection}
 */
export interface VoiceResumeData {
    /**
     * The id of the server to connect to
     */
    server_id: Snowflake;
    /**
     * Voice state session id
     */
    session_id: string;
    /**
     * Voice connection token
     */
    token: string;
    /**
     * Last recieved sequence number
     */
    seq_ack: number;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#speaking}
 */
export interface VoiceSpeakingSend {
    op: VoiceOpcodes.Speaking;
    d: VoiceSpeakingSendData;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#speaking}
 */
export interface VoiceSpeakingSendData {
    /**
     * The speaking mode flags
     */
    speaking: VoiceSpeakingFlags;
    /**
     * Voice delay
     */
    delay: number;
    /**
     * SSRC identifier
     */
    ssrc: number;
}
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_ready_for_transition-23}
 */
export interface VoiceDaveTransitionReady {
    op: VoiceOpcodes.DaveTransitionReady;
    d: VoiceDaveTransitionReadyData;
}
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_ready_for_transition-23}
 */
export interface VoiceDaveTransitionReadyData {
    /**
     * The transition id
     */
    transition_id: number;
}
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_prepare_epoch-24}
 */
export interface VoiceDavePrepareEpoch {
    op: VoiceOpcodes.DavePrepareEpoch;
    d: VoiceDavePrepareEpochData;
}
/**
 * @see {@link https://daveprotocol.com/#dave_protocol_prepare_epoch-24}
 */
export interface VoiceDavePrepareEpochData {
    /**
     * The protocol version
     */
    protocol_version: number;
    /**
     * The epoch id
     */
    epoch: number;
}
/**
 * @see {@link https://daveprotocol.com/#dave_mls_invalid_commit_welcome-31}
 */
export interface VoiceDaveMlsInvalidCommitWelcome {
    op: VoiceOpcodes.DaveMlsInvalidCommitWelcome;
    d: VoiceDaveMlsInvalidCommitWelcomeData;
}
/**
 * @see {@link https://daveprotocol.com/#dave_mls_invalid_commit_welcome-31}
 */
export interface VoiceDaveMlsInvalidCommitWelcomeData {
    /**
     * The transition id
     */
    transition_id: number;
}
/**
 * @see {@link https://daveprotocol.com/#dave_mls_key_package-26}
 */
export type VoiceDaveMlsKeyPackage = VoiceBinaryPayload;
/**
 * @see {@link https://daveprotocol.com/#dave_mls_commit_welcome-28}
 */
export type VoiceDaveMlsCommitWelcome = VoiceBinaryPayload;
export interface _BasePayload {
    /**
     * Opcode for the payload
     */
    op: VoiceOpcodes;
    /**
     * Event data
     */
    d?: unknown;
    /**
     * Sequence number, used for resuming sessions and heartbeats
     */
    seq?: number;
}
export interface _DataPayload<Op extends VoiceOpcodes, D = unknown> extends _BasePayload {
    op: Op;
    d: D;
}
export type VoiceBinaryPayload = ArrayBuffer;
//# sourceMappingURL=v8.d.ts.map