"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceSpeakingFlags = exports.VoiceEncryptionMode = exports.VoiceCloseCodes = exports.VoiceOpcodes = exports.VoiceGatewayVersion = void 0;
exports.VoiceGatewayVersion = '8';
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-opcodes}
 */
var VoiceOpcodes;
(function (VoiceOpcodes) {
    /**
     * Begin a voice websocket connection
     */
    VoiceOpcodes[VoiceOpcodes["Identify"] = 0] = "Identify";
    /**
     * Select the voice protocol
     */
    VoiceOpcodes[VoiceOpcodes["SelectProtocol"] = 1] = "SelectProtocol";
    /**
     * Complete the websocket handshake
     */
    VoiceOpcodes[VoiceOpcodes["Ready"] = 2] = "Ready";
    /**
     * Keep the websocket connection alive
     */
    VoiceOpcodes[VoiceOpcodes["Heartbeat"] = 3] = "Heartbeat";
    /**
     * Describe the session
     */
    VoiceOpcodes[VoiceOpcodes["SessionDescription"] = 4] = "SessionDescription";
    /**
     * Indicate which users are speaking
     */
    VoiceOpcodes[VoiceOpcodes["Speaking"] = 5] = "Speaking";
    /**
     * Sent to acknowledge a received client heartbeat
     */
    VoiceOpcodes[VoiceOpcodes["HeartbeatAck"] = 6] = "HeartbeatAck";
    /**
     * Resume a connection
     */
    VoiceOpcodes[VoiceOpcodes["Resume"] = 7] = "Resume";
    /**
     * Time to wait between sending heartbeats in milliseconds
     */
    VoiceOpcodes[VoiceOpcodes["Hello"] = 8] = "Hello";
    /**
     * Acknowledge a successful session resume
     */
    VoiceOpcodes[VoiceOpcodes["Resumed"] = 9] = "Resumed";
    /**
     * One or more clients have connected to the voice channel
     */
    VoiceOpcodes[VoiceOpcodes["ClientsConnect"] = 11] = "ClientsConnect";
    /**
     * A client has disconnected from the voice channel
     */
    VoiceOpcodes[VoiceOpcodes["ClientDisconnect"] = 13] = "ClientDisconnect";
    /**
     * A downgrade from the DAVE protocol is upcoming
     */
    VoiceOpcodes[VoiceOpcodes["DavePrepareTransition"] = 21] = "DavePrepareTransition";
    /**
     * Execute a previously announced protocol transition
     */
    VoiceOpcodes[VoiceOpcodes["DaveExecuteTransition"] = 22] = "DaveExecuteTransition";
    /**
     * Acknowledge readiness previously announced transition
     */
    VoiceOpcodes[VoiceOpcodes["DaveTransitionReady"] = 23] = "DaveTransitionReady";
    /**
     * A DAVE protocol version or group change is upcoming
     */
    VoiceOpcodes[VoiceOpcodes["DavePrepareEpoch"] = 24] = "DavePrepareEpoch";
    /**
     * Credential and public key for MLS external sender
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsExternalSender"] = 25] = "DaveMlsExternalSender";
    /**
     * MLS Key Package for pending group member
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsKeyPackage"] = 26] = "DaveMlsKeyPackage";
    /**
     * MLS Proposals to be appended or revoked
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsProposals"] = 27] = "DaveMlsProposals";
    /**
     * MLS Commit with optional MLS Welcome messages
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsCommitWelcome"] = 28] = "DaveMlsCommitWelcome";
    /**
     * MLS Commit to be processed for upcoming transition
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsAnnounceCommitTransition"] = 29] = "DaveMlsAnnounceCommitTransition";
    /**
     * MLS Welcome to group for upcoming transition
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsWelcome"] = 30] = "DaveMlsWelcome";
    /**
     * Flag invalid commit or welcome, request re-add
     */
    VoiceOpcodes[VoiceOpcodes["DaveMlsInvalidCommitWelcome"] = 31] = "DaveMlsInvalidCommitWelcome";
})(VoiceOpcodes || (exports.VoiceOpcodes = VoiceOpcodes = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#voice-voice-close-event-codes}
 */
var VoiceCloseCodes;
(function (VoiceCloseCodes) {
    /**
     * You sent an invalid opcode
     */
    VoiceCloseCodes[VoiceCloseCodes["UnknownOpcode"] = 4001] = "UnknownOpcode";
    /**
     * You sent a invalid payload in your identifying to the Gateway
     */
    VoiceCloseCodes[VoiceCloseCodes["FailedToDecode"] = 4002] = "FailedToDecode";
    /**
     * You sent a payload before identifying with the Gateway
     */
    VoiceCloseCodes[VoiceCloseCodes["NotAuthenticated"] = 4003] = "NotAuthenticated";
    /**
     * The token you sent in your identify payload is incorrect
     */
    VoiceCloseCodes[VoiceCloseCodes["AuthenticationFailed"] = 4004] = "AuthenticationFailed";
    /**
     * You sent more than one identify payload. Stahp
     */
    VoiceCloseCodes[VoiceCloseCodes["AlreadyAuthenticated"] = 4005] = "AlreadyAuthenticated";
    /**
     * Your session is no longer valid
     */
    VoiceCloseCodes[VoiceCloseCodes["SessionNoLongerValid"] = 4006] = "SessionNoLongerValid";
    /**
     * Your session has timed out
     */
    VoiceCloseCodes[VoiceCloseCodes["SessionTimeout"] = 4009] = "SessionTimeout";
    /**
     * We can't find the server you're trying to connect to
     */
    VoiceCloseCodes[VoiceCloseCodes["ServerNotFound"] = 4011] = "ServerNotFound";
    /**
     * We didn't recognize the protocol you sent
     */
    VoiceCloseCodes[VoiceCloseCodes["UnknownProtocol"] = 4012] = "UnknownProtocol";
    /**
     * Either the channel was deleted, you were kicked, or the main gateway session was dropped. Should not reconnect
     */
    VoiceCloseCodes[VoiceCloseCodes["Disconnected"] = 4014] = "Disconnected";
    /**
     * The server crashed. Our bad! Try resuming
     */
    VoiceCloseCodes[VoiceCloseCodes["VoiceServerCrashed"] = 4015] = "VoiceServerCrashed";
    /**
     * We didn't recognize your encryption
     */
    VoiceCloseCodes[VoiceCloseCodes["UnknownEncryptionMode"] = 4016] = "UnknownEncryptionMode";
    /**
     * You sent a malformed request
     */
    VoiceCloseCodes[VoiceCloseCodes["BadRequest"] = 4020] = "BadRequest";
    /**
     * Disconnect due to rate limit exceeded. Should not reconnect
     */
    VoiceCloseCodes[VoiceCloseCodes["RateLimited"] = 4021] = "RateLimited";
    /**
     * Disconnect all clients due to call terminated (channel deleted, voice server changed, etc.). Should not reconnect
     */
    VoiceCloseCodes[VoiceCloseCodes["CallTerminated"] = 4022] = "CallTerminated";
})(VoiceCloseCodes || (exports.VoiceCloseCodes = VoiceCloseCodes = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-modes}
 */
var VoiceEncryptionMode;
(function (VoiceEncryptionMode) {
    /**
     * AEAD AES256-GCM (RTP Size)
     */
    VoiceEncryptionMode["AeadAes256GcmRtpSize"] = "aead_aes256_gcm_rtpsize";
    /**
     * AEAD XChaCha20 Poly1305 (RTP Size)
     */
    VoiceEncryptionMode["AeadXChaCha20Poly1305RtpSize"] = "aead_xchacha20_poly1305_rtpsize";
    /**
     * XSalsa20 Poly1305 Lite (RTP Size)
     *
     * @deprecated This encryption mode has been discontinued.
     */
    VoiceEncryptionMode["XSalsa20Poly1305LiteRtpSize"] = "xsalsa20_poly1305_lite_rtpsize";
    /**
     * AEAD AES256-GCM
     *
     * @deprecated This encryption mode has been discontinued.
     */
    VoiceEncryptionMode["AeadAes256Gcm"] = "aead_aes256_gcm";
    /**
     * XSalsa20 Poly1305
     *
     * @deprecated This encryption mode has been discontinued.
     */
    VoiceEncryptionMode["XSalsa20Poly1305"] = "xsalsa20_poly1305";
    /**
     * XSalsa20 Poly1305 Suffix
     *
     * @deprecated This encryption mode has been discontinued.
     */
    VoiceEncryptionMode["XSalsa20Poly1305Suffix"] = "xsalsa20_poly1305_suffix";
    /**
     * XSalsa20 Poly1305 Lite
     *
     * @deprecated This encryption mode has been discontinued.
     */
    VoiceEncryptionMode["XSalsa20Poly1305Lite"] = "xsalsa20_poly1305_lite";
})(VoiceEncryptionMode || (exports.VoiceEncryptionMode = VoiceEncryptionMode = {}));
/**
 * @see {@link https://discord.com/developers/docs/topics/voice-connections#speaking}
 */
var VoiceSpeakingFlags;
(function (VoiceSpeakingFlags) {
    /**
     * Normal transmission of voice audio
     */
    VoiceSpeakingFlags[VoiceSpeakingFlags["Microphone"] = 1] = "Microphone";
    /**
     * 	Transmission of context audio for video, no speaking indicator
     */
    VoiceSpeakingFlags[VoiceSpeakingFlags["Soundshare"] = 2] = "Soundshare";
    /**
     * Priority speaker, lowering audio of other speakers
     */
    VoiceSpeakingFlags[VoiceSpeakingFlags["Priority"] = 4] = "Priority";
})(VoiceSpeakingFlags || (exports.VoiceSpeakingFlags = VoiceSpeakingFlags = {}));
// #endregion Shared
//# sourceMappingURL=v8.js.map