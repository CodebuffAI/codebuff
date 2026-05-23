import type { Locale } from '../rest/common';
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags}
 *
 * These flags are exported as `BigInt`s and NOT numbers. Wrapping them in `Number()`
 * may cause issues, try to use BigInts as much as possible or modules that can
 * replicate them in some way
 */
export declare const PermissionFlagsBits: {
    /**
     * Allows creation of instant invites
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly CreateInstantInvite: bigint;
    /**
     * Allows kicking members
     */
    readonly KickMembers: bigint;
    /**
     * Allows banning members
     */
    readonly BanMembers: bigint;
    /**
     * Allows all permissions and bypasses channel permission overwrites
     */
    readonly Administrator: bigint;
    /**
     * Allows management and editing of channels
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly ManageChannels: bigint;
    /**
     * Allows management and editing of the guild
     */
    readonly ManageGuild: bigint;
    /**
     * Allows for the addition of reactions to messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly AddReactions: bigint;
    /**
     * Allows for viewing of audit logs
     */
    readonly ViewAuditLog: bigint;
    /**
     * Allows for using priority speaker in a voice channel
     *
     * Applies to channel types: Voice
     */
    readonly PrioritySpeaker: bigint;
    /**
     * Allows the user to go live
     *
     * Applies to channel types: Voice, Stage
     */
    readonly Stream: bigint;
    /**
     * Allows guild members to view a channel, which includes reading messages in text channels and joining voice channels
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly ViewChannel: bigint;
    /**
     * Allows for sending messages in a channel and creating threads in a forum
     * (does not allow sending messages in threads)
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly SendMessages: bigint;
    /**
     * Allows for sending of `/tts` messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly SendTTSMessages: bigint;
    /**
     * Allows for deletion of other users messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly ManageMessages: bigint;
    /**
     * Links sent by users with this permission will be auto-embedded
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly EmbedLinks: bigint;
    /**
     * Allows for uploading images and files
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly AttachFiles: bigint;
    /**
     * Allows for reading of message history
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly ReadMessageHistory: bigint;
    /**
     * Allows for using the `@everyone` tag to notify all users in a channel,
     * and the `@here` tag to notify all online users in a channel
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly MentionEveryone: bigint;
    /**
     * Allows the usage of custom emojis from other servers
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly UseExternalEmojis: bigint;
    /**
     * Allows for viewing guild insights
     */
    readonly ViewGuildInsights: bigint;
    /**
     * Allows for joining of a voice channel
     *
     * Applies to channel types: Voice, Stage
     */
    readonly Connect: bigint;
    /**
     * Allows for speaking in a voice channel
     *
     * Applies to channel types: Voice
     */
    readonly Speak: bigint;
    /**
     * Allows for muting members in a voice channel
     *
     * Applies to channel types: Voice, Stage
     */
    readonly MuteMembers: bigint;
    /**
     * Allows for deafening of members in a voice channel
     *
     * Applies to channel types: Voice
     */
    readonly DeafenMembers: bigint;
    /**
     * Allows for moving of members between voice channels
     *
     * Applies to channel types: Voice, Stage
     */
    readonly MoveMembers: bigint;
    /**
     * Allows for using voice-activity-detection in a voice channel
     *
     * Applies to channel types: Voice
     */
    readonly UseVAD: bigint;
    /**
     * Allows for modification of own nickname
     */
    readonly ChangeNickname: bigint;
    /**
     * Allows for modification of other users nicknames
     */
    readonly ManageNicknames: bigint;
    /**
     * Allows management and editing of roles
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly ManageRoles: bigint;
    /**
     * Allows management and editing of webhooks
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly ManageWebhooks: bigint;
    /**
     * Allows management and editing of emojis, stickers, and soundboard sounds
     *
     * @deprecated This is the old name for {@link PermissionFlagsBits.ManageGuildExpressions}
     */
    readonly ManageEmojisAndStickers: bigint;
    /**
     * Allows for editing and deleting emojis, stickers, and soundboard sounds created by all users
     */
    readonly ManageGuildExpressions: bigint;
    /**
     * Allows members to use application commands, including slash commands and context menu commands
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly UseApplicationCommands: bigint;
    /**
     * Allows for requesting to speak in stage channels
     *
     * Applies to channel types: Stage
     */
    readonly RequestToSpeak: bigint;
    /**
     * Allows for editing and deleting scheduled events created by all users
     *
     * Applies to channel types: Voice, Stage
     */
    readonly ManageEvents: bigint;
    /**
     * Allows for deleting and archiving threads, and viewing all private threads
     *
     * Applies to channel types: Text
     */
    readonly ManageThreads: bigint;
    /**
     * Allows for creating public and announcement threads
     *
     * Applies to channel types: Text
     */
    readonly CreatePublicThreads: bigint;
    /**
     * Allows for creating private threads
     *
     * Applies to channel types: Text
     */
    readonly CreatePrivateThreads: bigint;
    /**
     * Allows the usage of custom stickers from other servers
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly UseExternalStickers: bigint;
    /**
     * Allows for sending messages in threads
     *
     * Applies to channel types: Text
     */
    readonly SendMessagesInThreads: bigint;
    /**
     * Allows for using Activities (applications with the {@link ApplicationFlags.Embedded} flag) in a voice channel
     *
     * Applies to channel types: Voice
     */
    readonly UseEmbeddedActivities: bigint;
    /**
     * Allows for timing out users to prevent them from sending or reacting to messages in chat and threads,
     * and from speaking in voice and stage channels
     */
    readonly ModerateMembers: bigint;
    /**
     * Allows for viewing role subscription insights
     */
    readonly ViewCreatorMonetizationAnalytics: bigint;
    /**
     * Allows for using soundboard in a voice channel
     *
     * Applies to channel types: Voice
     */
    readonly UseSoundboard: bigint;
    /**
     * Allows for creating emojis, stickers, and soundboard sounds, and editing and deleting those created by the current user
     */
    readonly CreateGuildExpressions: bigint;
    /**
     * Allows for creating scheduled events, and editing and deleting those created by the current user
     *
     * Applies to channel types: Voice, Stage
     */
    readonly CreateEvents: bigint;
    /**
     * Allows the usage of custom soundboard sounds from other servers
     *
     * Applies to channel types: Voice
     */
    readonly UseExternalSounds: bigint;
    /**
     * Allows sending voice messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly SendVoiceMessages: bigint;
    /**
     * Allows sending polls
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly SendPolls: bigint;
    /**
     * Allows user-installed apps to send public responses. When disabled, users will still be allowed to use their apps but the responses will be ephemeral. This only applies to apps not also installed to the server
     *
     * Applies to channel types: Text, Voice, Stage
     */
    readonly UseExternalApps: bigint;
    /**
     * Allows pinning and unpinning messages
     *
     * Applies to channel types: Text
     */
    readonly PinMessages: bigint;
};
export type LocalizationMap = Partial<Record<Locale, string | null>>;
/**
 * @see {@link https://discord.com/developers/docs/topics/opcodes-and-status-codes#json}
 */
export interface RESTError {
    code: number;
    message: string;
    errors?: RESTErrorData;
}
export interface RESTErrorFieldInformation {
    code: string;
    message: string;
}
export interface RESTErrorGroupWrapper {
    _errors: RESTErrorData[];
}
export type RESTErrorData = RESTErrorFieldInformation | RESTErrorGroupWrapper | string | {
    [k: string]: RESTErrorData;
};
/**
 * @see {@link https://discord.com/developers/docs/topics/rate-limits#exceeding-a-rate-limit-rate-limit-response-structure}
 */
export interface RESTRateLimit {
    /**
     * An error code for some limits
     *
     * {@link RESTJSONErrorCodes}
     */
    code?: number;
    /**
     * A value indicating if you are being globally rate limited or not
     */
    global: boolean;
    /**
     * A message saying you are being rate limited.
     */
    message: string;
    /**
     * The number of seconds to wait before submitting another request.
     */
    retry_after: number;
}
//# sourceMappingURL=common.d.ts.map