"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionFlagsBits = void 0;
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags}
 *
 * These flags are exported as `BigInt`s and NOT numbers. Wrapping them in `Number()`
 * may cause issues, try to use BigInts as much as possible or modules that can
 * replicate them in some way
 */
exports.PermissionFlagsBits = {
    /**
     * Allows creation of instant invites
     *
     * Applies to channel types: Text, Voice, Stage
     */
    CreateInstantInvite: 1n << 0n,
    /**
     * Allows kicking members
     */
    KickMembers: 1n << 1n,
    /**
     * Allows banning members
     */
    BanMembers: 1n << 2n,
    /**
     * Allows all permissions and bypasses channel permission overwrites
     */
    Administrator: 1n << 3n,
    /**
     * Allows management and editing of channels
     *
     * Applies to channel types: Text, Voice, Stage
     */
    ManageChannels: 1n << 4n,
    /**
     * Allows management and editing of the guild
     */
    ManageGuild: 1n << 5n,
    /**
     * Allows for the addition of reactions to messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    AddReactions: 1n << 6n,
    /**
     * Allows for viewing of audit logs
     */
    ViewAuditLog: 1n << 7n,
    /**
     * Allows for using priority speaker in a voice channel
     *
     * Applies to channel types: Voice
     */
    PrioritySpeaker: 1n << 8n,
    /**
     * Allows the user to go live
     *
     * Applies to channel types: Voice, Stage
     */
    Stream: 1n << 9n,
    /**
     * Allows guild members to view a channel, which includes reading messages in text channels and joining voice channels
     *
     * Applies to channel types: Text, Voice, Stage
     */
    ViewChannel: 1n << 10n,
    /**
     * Allows for sending messages in a channel and creating threads in a forum
     * (does not allow sending messages in threads)
     *
     * Applies to channel types: Text, Voice, Stage
     */
    SendMessages: 1n << 11n,
    /**
     * Allows for sending of `/tts` messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    SendTTSMessages: 1n << 12n,
    /**
     * Allows for deletion of other users messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    ManageMessages: 1n << 13n,
    /**
     * Links sent by users with this permission will be auto-embedded
     *
     * Applies to channel types: Text, Voice, Stage
     */
    EmbedLinks: 1n << 14n,
    /**
     * Allows for uploading images and files
     *
     * Applies to channel types: Text, Voice, Stage
     */
    AttachFiles: 1n << 15n,
    /**
     * Allows for reading of message history
     *
     * Applies to channel types: Text, Voice, Stage
     */
    ReadMessageHistory: 1n << 16n,
    /**
     * Allows for using the `@everyone` tag to notify all users in a channel,
     * and the `@here` tag to notify all online users in a channel
     *
     * Applies to channel types: Text, Voice, Stage
     */
    MentionEveryone: 1n << 17n,
    /**
     * Allows the usage of custom emojis from other servers
     *
     * Applies to channel types: Text, Voice, Stage
     */
    UseExternalEmojis: 1n << 18n,
    /**
     * Allows for viewing guild insights
     */
    ViewGuildInsights: 1n << 19n,
    /**
     * Allows for joining of a voice channel
     *
     * Applies to channel types: Voice, Stage
     */
    Connect: 1n << 20n,
    /**
     * Allows for speaking in a voice channel
     *
     * Applies to channel types: Voice
     */
    Speak: 1n << 21n,
    /**
     * Allows for muting members in a voice channel
     *
     * Applies to channel types: Voice, Stage
     */
    MuteMembers: 1n << 22n,
    /**
     * Allows for deafening of members in a voice channel
     *
     * Applies to channel types: Voice
     */
    DeafenMembers: 1n << 23n,
    /**
     * Allows for moving of members between voice channels
     *
     * Applies to channel types: Voice, Stage
     */
    MoveMembers: 1n << 24n,
    /**
     * Allows for using voice-activity-detection in a voice channel
     *
     * Applies to channel types: Voice
     */
    UseVAD: 1n << 25n,
    /**
     * Allows for modification of own nickname
     */
    ChangeNickname: 1n << 26n,
    /**
     * Allows for modification of other users nicknames
     */
    ManageNicknames: 1n << 27n,
    /**
     * Allows management and editing of roles
     *
     * Applies to channel types: Text, Voice, Stage
     */
    ManageRoles: 1n << 28n,
    /**
     * Allows management and editing of webhooks
     *
     * Applies to channel types: Text, Voice, Stage
     */
    ManageWebhooks: 1n << 29n,
    /**
     * Allows management and editing of emojis, stickers, and soundboard sounds
     *
     * @deprecated This is the old name for {@link PermissionFlagsBits.ManageGuildExpressions}
     */
    ManageEmojisAndStickers: 1n << 30n,
    /**
     * Allows for editing and deleting emojis, stickers, and soundboard sounds created by all users
     */
    ManageGuildExpressions: 1n << 30n,
    /**
     * Allows members to use application commands, including slash commands and context menu commands
     *
     * Applies to channel types: Text, Voice, Stage
     */
    UseApplicationCommands: 1n << 31n,
    /**
     * Allows for requesting to speak in stage channels
     *
     * Applies to channel types: Stage
     */
    RequestToSpeak: 1n << 32n,
    /**
     * Allows for editing and deleting scheduled events created by all users
     *
     * Applies to channel types: Voice, Stage
     */
    ManageEvents: 1n << 33n,
    /**
     * Allows for deleting and archiving threads, and viewing all private threads
     *
     * Applies to channel types: Text
     */
    ManageThreads: 1n << 34n,
    /**
     * Allows for creating public and announcement threads
     *
     * Applies to channel types: Text
     */
    CreatePublicThreads: 1n << 35n,
    /**
     * Allows for creating private threads
     *
     * Applies to channel types: Text
     */
    CreatePrivateThreads: 1n << 36n,
    /**
     * Allows the usage of custom stickers from other servers
     *
     * Applies to channel types: Text, Voice, Stage
     */
    UseExternalStickers: 1n << 37n,
    /**
     * Allows for sending messages in threads
     *
     * Applies to channel types: Text
     */
    SendMessagesInThreads: 1n << 38n,
    /**
     * Allows for using Activities (applications with the {@link ApplicationFlags.Embedded} flag) in a voice channel
     *
     * Applies to channel types: Voice
     */
    UseEmbeddedActivities: 1n << 39n,
    /**
     * Allows for timing out users to prevent them from sending or reacting to messages in chat and threads,
     * and from speaking in voice and stage channels
     */
    ModerateMembers: 1n << 40n,
    /**
     * Allows for viewing role subscription insights
     */
    ViewCreatorMonetizationAnalytics: 1n << 41n,
    /**
     * Allows for using soundboard in a voice channel
     *
     * Applies to channel types: Voice
     */
    UseSoundboard: 1n << 42n,
    /**
     * Allows for creating emojis, stickers, and soundboard sounds, and editing and deleting those created by the current user
     */
    CreateGuildExpressions: 1n << 43n,
    /**
     * Allows for creating scheduled events, and editing and deleting those created by the current user
     *
     * Applies to channel types: Voice, Stage
     */
    CreateEvents: 1n << 44n,
    /**
     * Allows the usage of custom soundboard sounds from other servers
     *
     * Applies to channel types: Voice
     */
    UseExternalSounds: 1n << 45n,
    /**
     * Allows sending voice messages
     *
     * Applies to channel types: Text, Voice, Stage
     */
    SendVoiceMessages: 1n << 46n,
    /**
     * Allows sending polls
     *
     * Applies to channel types: Text, Voice, Stage
     */
    SendPolls: 1n << 49n,
    /**
     * Allows user-installed apps to send public responses. When disabled, users will still be allowed to use their apps but the responses will be ephemeral. This only applies to apps not also installed to the server
     *
     * Applies to channel types: Text, Voice, Stage
     */
    UseExternalApps: 1n << 50n,
    /**
     * Allows pinning and unpinning messages
     *
     * Applies to channel types: Text
     */
    PinMessages: 1n << 51n,
};
/**
 * Freeze the object of bits, preventing any modifications to it
 *
 * @internal
 */
Object.freeze(exports.PermissionFlagsBits);
//# sourceMappingURL=common.js.map