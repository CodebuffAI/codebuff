export declare const VoiceGatewayVersion = "4";
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
     * Previously for when a client has connected to the voice channel, now unused
     *
     * @deprecated Not used
     */
    ClientConnect = 12,
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
//# sourceMappingURL=v4.d.ts.map