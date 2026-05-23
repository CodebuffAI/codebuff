"use strict";
/**
 * Types extracted from https://discord.com/developers/docs/resources/channel
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelFlags = exports.ThreadMemberFlags = exports.ThreadAutoArchiveDuration = exports.OverwriteType = exports.VideoQualityMode = exports.ChannelType = exports.ForumLayoutType = exports.SortOrderType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/channel/#channel-object-sort-order-types}
 */
var SortOrderType;
(function (SortOrderType) {
    /**
     * Sort forum posts by activity
     */
    SortOrderType[SortOrderType["LatestActivity"] = 0] = "LatestActivity";
    /**
     * Sort forum posts by creation time (from most recent to oldest)
     */
    SortOrderType[SortOrderType["CreationDate"] = 1] = "CreationDate";
})(SortOrderType || (exports.SortOrderType = SortOrderType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/channel/#channel-object-forum-layout-types}
 */
var ForumLayoutType;
(function (ForumLayoutType) {
    /**
     * No default has been set for forum channel
     */
    ForumLayoutType[ForumLayoutType["NotSet"] = 0] = "NotSet";
    /**
     * Display posts as a list
     */
    ForumLayoutType[ForumLayoutType["ListView"] = 1] = "ListView";
    /**
     * Display posts as a collection of tiles
     */
    ForumLayoutType[ForumLayoutType["GalleryView"] = 2] = "GalleryView";
})(ForumLayoutType || (exports.ForumLayoutType = ForumLayoutType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#channel-object-channel-types}
 */
var ChannelType;
(function (ChannelType) {
    /**
     * A text channel within a guild
     */
    ChannelType[ChannelType["GuildText"] = 0] = "GuildText";
    /**
     * A direct message between users
     */
    ChannelType[ChannelType["DM"] = 1] = "DM";
    /**
     * A voice channel within a guild
     */
    ChannelType[ChannelType["GuildVoice"] = 2] = "GuildVoice";
    /**
     * A direct message between multiple users
     */
    ChannelType[ChannelType["GroupDM"] = 3] = "GroupDM";
    /**
     * An organizational category that contains up to 50 channels
     *
     * @see {@link https://support.discord.com/hc/articles/115001580171}
     */
    ChannelType[ChannelType["GuildCategory"] = 4] = "GuildCategory";
    /**
     * A channel that users can follow and crosspost into their own guild
     *
     * @see {@link https://support.discord.com/hc/articles/360032008192}
     */
    ChannelType[ChannelType["GuildAnnouncement"] = 5] = "GuildAnnouncement";
    /**
     * A temporary sub-channel within a Guild Announcement channel
     */
    ChannelType[ChannelType["AnnouncementThread"] = 10] = "AnnouncementThread";
    /**
     * A temporary sub-channel within a Guild Text or Guild Forum channel
     */
    ChannelType[ChannelType["PublicThread"] = 11] = "PublicThread";
    /**
     * A temporary sub-channel within a Guild Text channel that is only viewable by those invited and those with the Manage Threads permission
     */
    ChannelType[ChannelType["PrivateThread"] = 12] = "PrivateThread";
    /**
     * A voice channel for hosting events with an audience
     *
     * @see {@link https://support.discord.com/hc/articles/1500005513722}
     */
    ChannelType[ChannelType["GuildStageVoice"] = 13] = "GuildStageVoice";
    /**
     * The channel in a Student Hub containing the listed servers
     *
     * @see {@link https://support.discord.com/hc/articles/4406046651927}
     */
    ChannelType[ChannelType["GuildDirectory"] = 14] = "GuildDirectory";
    /**
     * A channel that can only contain threads
     */
    ChannelType[ChannelType["GuildForum"] = 15] = "GuildForum";
    /**
     * A channel like forum channels but contains media for server subscriptions
     *
     * @see {@link https://creator-support.discord.com/hc/articles/14346342766743}
     */
    ChannelType[ChannelType["GuildMedia"] = 16] = "GuildMedia";
    // EVERYTHING BELOW THIS LINE SHOULD BE OLD NAMES FOR RENAMED ENUM MEMBERS //
    /**
     * A channel that users can follow and crosspost into their own guild
     *
     * @deprecated This is the old name for {@link ChannelType.GuildAnnouncement}
     * @see {@link https://support.discord.com/hc/articles/360032008192}
     */
    ChannelType[ChannelType["GuildNews"] = 5] = "GuildNews";
    /**
     * A temporary sub-channel within a Guild Announcement channel
     *
     * @deprecated This is the old name for {@link ChannelType.AnnouncementThread}
     */
    // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
    ChannelType[ChannelType["GuildNewsThread"] = 10] = "GuildNewsThread";
    /**
     * A temporary sub-channel within a Guild Text channel
     *
     * @deprecated This is the old name for {@link ChannelType.PublicThread}
     */
    ChannelType[ChannelType["GuildPublicThread"] = 11] = "GuildPublicThread";
    /**
     * A temporary sub-channel within a Guild Text channel that is only viewable by those invited and those with the Manage Threads permission
     *
     * @deprecated This is the old name for {@link ChannelType.PrivateThread}
     */
    ChannelType[ChannelType["GuildPrivateThread"] = 12] = "GuildPrivateThread";
})(ChannelType || (exports.ChannelType = ChannelType = {}));
var VideoQualityMode;
(function (VideoQualityMode) {
    /**
     * Discord chooses the quality for optimal performance
     */
    VideoQualityMode[VideoQualityMode["Auto"] = 1] = "Auto";
    /**
     * 720p
     */
    VideoQualityMode[VideoQualityMode["Full"] = 2] = "Full";
})(VideoQualityMode || (exports.VideoQualityMode = VideoQualityMode = {}));
var OverwriteType;
(function (OverwriteType) {
    OverwriteType[OverwriteType["Role"] = 0] = "Role";
    OverwriteType[OverwriteType["Member"] = 1] = "Member";
})(OverwriteType || (exports.OverwriteType = OverwriteType = {}));
var ThreadAutoArchiveDuration;
(function (ThreadAutoArchiveDuration) {
    ThreadAutoArchiveDuration[ThreadAutoArchiveDuration["OneHour"] = 60] = "OneHour";
    ThreadAutoArchiveDuration[ThreadAutoArchiveDuration["OneDay"] = 1440] = "OneDay";
    ThreadAutoArchiveDuration[ThreadAutoArchiveDuration["ThreeDays"] = 4320] = "ThreeDays";
    ThreadAutoArchiveDuration[ThreadAutoArchiveDuration["OneWeek"] = 10080] = "OneWeek";
})(ThreadAutoArchiveDuration || (exports.ThreadAutoArchiveDuration = ThreadAutoArchiveDuration = {}));
var ThreadMemberFlags;
(function (ThreadMemberFlags) {
    /**
     * @unstable This thread member flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ThreadMemberFlags[ThreadMemberFlags["HasInteracted"] = 1] = "HasInteracted";
    /**
     * @unstable This thread member flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ThreadMemberFlags[ThreadMemberFlags["AllMessages"] = 2] = "AllMessages";
    /**
     * @unstable This thread member flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ThreadMemberFlags[ThreadMemberFlags["OnlyMentions"] = 4] = "OnlyMentions";
    /**
     * @unstable This thread member flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ThreadMemberFlags[ThreadMemberFlags["NoMessages"] = 8] = "NoMessages";
})(ThreadMemberFlags || (exports.ThreadMemberFlags = ThreadMemberFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/channel#channel-object-channel-flags}
 */
var ChannelFlags;
(function (ChannelFlags) {
    /**
     * @unstable This channel flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ChannelFlags[ChannelFlags["GuildFeedRemoved"] = 1] = "GuildFeedRemoved";
    /**
     * This thread is pinned to the top of its parent forum channel
     */
    ChannelFlags[ChannelFlags["Pinned"] = 2] = "Pinned";
    /**
     * @unstable This channel flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ChannelFlags[ChannelFlags["ActiveChannelsRemoved"] = 4] = "ActiveChannelsRemoved";
    /**
     * Whether a tag is required to be specified when creating a thread in a forum channel.
     * Tags are specified in the `applied_tags` field
     */
    ChannelFlags[ChannelFlags["RequireTag"] = 16] = "RequireTag";
    /**
     * @unstable This channel flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ChannelFlags[ChannelFlags["IsSpam"] = 32] = "IsSpam";
    /**
     * @unstable This channel flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ChannelFlags[ChannelFlags["IsGuildResourceChannel"] = 128] = "IsGuildResourceChannel";
    /**
     * @unstable This channel flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ChannelFlags[ChannelFlags["ClydeAI"] = 256] = "ClydeAI";
    /**
     * @unstable This channel flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ChannelFlags[ChannelFlags["IsScheduledForDeletion"] = 512] = "IsScheduledForDeletion";
    /**
     * Whether media download options are hidden.
     */
    ChannelFlags[ChannelFlags["HideMediaDownloadOptions"] = 32768] = "HideMediaDownloadOptions";
})(ChannelFlags || (exports.ChannelFlags = ChannelFlags = {}));
//# sourceMappingURL=channel.js.map