"use strict";
// Types extracted from https://discord.com/developers/docs/resources/message.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeparatorSpacingSize = exports.UnfurledMediaItemLoadingState = exports.SelectMenuDefaultValueType = exports.TextInputStyle = exports.ButtonStyle = exports.ComponentType = exports.AllowedMentionsTypes = exports.AttachmentFlags = exports.EmbedType = exports.MessageFlags = exports.MessageReferenceType = exports.MessageActivityType = exports.MessageType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-object-message-types}
 */
var MessageType;
(function (MessageType) {
    MessageType[MessageType["Default"] = 0] = "Default";
    MessageType[MessageType["RecipientAdd"] = 1] = "RecipientAdd";
    MessageType[MessageType["RecipientRemove"] = 2] = "RecipientRemove";
    MessageType[MessageType["Call"] = 3] = "Call";
    MessageType[MessageType["ChannelNameChange"] = 4] = "ChannelNameChange";
    MessageType[MessageType["ChannelIconChange"] = 5] = "ChannelIconChange";
    MessageType[MessageType["ChannelPinnedMessage"] = 6] = "ChannelPinnedMessage";
    MessageType[MessageType["UserJoin"] = 7] = "UserJoin";
    MessageType[MessageType["GuildBoost"] = 8] = "GuildBoost";
    MessageType[MessageType["GuildBoostTier1"] = 9] = "GuildBoostTier1";
    MessageType[MessageType["GuildBoostTier2"] = 10] = "GuildBoostTier2";
    MessageType[MessageType["GuildBoostTier3"] = 11] = "GuildBoostTier3";
    MessageType[MessageType["ChannelFollowAdd"] = 12] = "ChannelFollowAdd";
    MessageType[MessageType["GuildDiscoveryDisqualified"] = 14] = "GuildDiscoveryDisqualified";
    MessageType[MessageType["GuildDiscoveryRequalified"] = 15] = "GuildDiscoveryRequalified";
    MessageType[MessageType["GuildDiscoveryGracePeriodInitialWarning"] = 16] = "GuildDiscoveryGracePeriodInitialWarning";
    MessageType[MessageType["GuildDiscoveryGracePeriodFinalWarning"] = 17] = "GuildDiscoveryGracePeriodFinalWarning";
    MessageType[MessageType["ThreadCreated"] = 18] = "ThreadCreated";
    MessageType[MessageType["Reply"] = 19] = "Reply";
    MessageType[MessageType["ChatInputCommand"] = 20] = "ChatInputCommand";
    MessageType[MessageType["ThreadStarterMessage"] = 21] = "ThreadStarterMessage";
    MessageType[MessageType["GuildInviteReminder"] = 22] = "GuildInviteReminder";
    MessageType[MessageType["ContextMenuCommand"] = 23] = "ContextMenuCommand";
    MessageType[MessageType["AutoModerationAction"] = 24] = "AutoModerationAction";
    MessageType[MessageType["RoleSubscriptionPurchase"] = 25] = "RoleSubscriptionPurchase";
    MessageType[MessageType["InteractionPremiumUpsell"] = 26] = "InteractionPremiumUpsell";
    MessageType[MessageType["StageStart"] = 27] = "StageStart";
    MessageType[MessageType["StageEnd"] = 28] = "StageEnd";
    MessageType[MessageType["StageSpeaker"] = 29] = "StageSpeaker";
    /**
     * @unstable https://github.com/discord/discord-api-docs/pull/5927#discussion_r1107678548
     */
    MessageType[MessageType["StageRaiseHand"] = 30] = "StageRaiseHand";
    MessageType[MessageType["StageTopic"] = 31] = "StageTopic";
    MessageType[MessageType["GuildApplicationPremiumSubscription"] = 32] = "GuildApplicationPremiumSubscription";
    MessageType[MessageType["GuildIncidentAlertModeEnabled"] = 36] = "GuildIncidentAlertModeEnabled";
    MessageType[MessageType["GuildIncidentAlertModeDisabled"] = 37] = "GuildIncidentAlertModeDisabled";
    MessageType[MessageType["GuildIncidentReportRaid"] = 38] = "GuildIncidentReportRaid";
    MessageType[MessageType["GuildIncidentReportFalseAlarm"] = 39] = "GuildIncidentReportFalseAlarm";
    MessageType[MessageType["PurchaseNotification"] = 44] = "PurchaseNotification";
    MessageType[MessageType["PollResult"] = 46] = "PollResult";
})(MessageType || (exports.MessageType = MessageType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-object-message-activity-types}
 */
var MessageActivityType;
(function (MessageActivityType) {
    MessageActivityType[MessageActivityType["Join"] = 1] = "Join";
    MessageActivityType[MessageActivityType["Spectate"] = 2] = "Spectate";
    MessageActivityType[MessageActivityType["Listen"] = 3] = "Listen";
    MessageActivityType[MessageActivityType["JoinRequest"] = 5] = "JoinRequest";
})(MessageActivityType || (exports.MessageActivityType = MessageActivityType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-reference-types}
 */
var MessageReferenceType;
(function (MessageReferenceType) {
    /**
     * A standard reference used by replies
     */
    MessageReferenceType[MessageReferenceType["Default"] = 0] = "Default";
    /**
     * Reference used to point to a message at a point in time
     */
    MessageReferenceType[MessageReferenceType["Forward"] = 1] = "Forward";
})(MessageReferenceType || (exports.MessageReferenceType = MessageReferenceType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/message#message-object-message-flags}
 */
var MessageFlags;
(function (MessageFlags) {
    /**
     * This message has been published to subscribed channels (via Channel Following)
     */
    MessageFlags[MessageFlags["Crossposted"] = 1] = "Crossposted";
    /**
     * This message originated from a message in another channel (via Channel Following)
     */
    MessageFlags[MessageFlags["IsCrosspost"] = 2] = "IsCrosspost";
    /**
     * Do not include any embeds when serializing this message
     */
    MessageFlags[MessageFlags["SuppressEmbeds"] = 4] = "SuppressEmbeds";
    /**
     * The source message for this crosspost has been deleted (via Channel Following)
     */
    MessageFlags[MessageFlags["SourceMessageDeleted"] = 8] = "SourceMessageDeleted";
    /**
     * This message came from the urgent message system
     */
    MessageFlags[MessageFlags["Urgent"] = 16] = "Urgent";
    /**
     * This message has an associated thread, which shares its id
     */
    MessageFlags[MessageFlags["HasThread"] = 32] = "HasThread";
    /**
     * This message is only visible to the user who invoked the Interaction
     */
    MessageFlags[MessageFlags["Ephemeral"] = 64] = "Ephemeral";
    /**
     * This message is an Interaction Response and the bot is "thinking"
     */
    MessageFlags[MessageFlags["Loading"] = 128] = "Loading";
    /**
     * This message failed to mention some roles and add their members to the thread
     */
    MessageFlags[MessageFlags["FailedToMentionSomeRolesInThread"] = 256] = "FailedToMentionSomeRolesInThread";
    /**
     * @unstable This message flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    MessageFlags[MessageFlags["ShouldShowLinkNotDiscordWarning"] = 1024] = "ShouldShowLinkNotDiscordWarning";
    /**
     * This message will not trigger push and desktop notifications
     */
    MessageFlags[MessageFlags["SuppressNotifications"] = 4096] = "SuppressNotifications";
    /**
     * This message is a voice message
     */
    MessageFlags[MessageFlags["IsVoiceMessage"] = 8192] = "IsVoiceMessage";
    /**
     * This message has a snapshot (via Message Forwarding)
     */
    MessageFlags[MessageFlags["HasSnapshot"] = 16384] = "HasSnapshot";
    /**
     * Allows you to create fully component-driven messages
     *
     * @see {@link https://discord.com/developers/docs/components/overview}
     */
    MessageFlags[MessageFlags["IsComponentsV2"] = 32768] = "IsComponentsV2";
})(MessageFlags || (exports.MessageFlags = MessageFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/message#embed-object-embed-types}
 */
var EmbedType;
(function (EmbedType) {
    /**
     * Generic embed rendered from embed attributes
     */
    EmbedType["Rich"] = "rich";
    /**
     * Image embed
     */
    EmbedType["Image"] = "image";
    /**
     * Video embed
     */
    EmbedType["Video"] = "video";
    /**
     * Animated gif image embed rendered as a video embed
     */
    EmbedType["GIFV"] = "gifv";
    /**
     * Article embed
     */
    EmbedType["Article"] = "article";
    /**
     * Link embed
     */
    EmbedType["Link"] = "link";
    /**
     * Auto moderation alert embed
     *
     * @unstable This embed type is currently not documented by Discord, but it is returned in the auto moderation system messages.
     */
    EmbedType["AutoModerationMessage"] = "auto_moderation_message";
    /**
     * Poll result embed
     */
    EmbedType["PollResult"] = "poll_result";
})(EmbedType || (exports.EmbedType = EmbedType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/message#attachment-object-attachment-structure-attachment-flags}
 */
var AttachmentFlags;
(function (AttachmentFlags) {
    /**
     * This attachment has been edited using the remix feature on mobile
     */
    AttachmentFlags[AttachmentFlags["IsRemix"] = 4] = "IsRemix";
})(AttachmentFlags || (exports.AttachmentFlags = AttachmentFlags = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/message#allowed-mentions-object-allowed-mention-types}
 */
var AllowedMentionsTypes;
(function (AllowedMentionsTypes) {
    /**
     * Controls `@everyone` and `@here` mentions
     */
    AllowedMentionsTypes["Everyone"] = "everyone";
    /**
     * Controls role mentions
     */
    AllowedMentionsTypes["Role"] = "roles";
    /**
     * Controls user mentions
     */
    AllowedMentionsTypes["User"] = "users";
})(AllowedMentionsTypes || (exports.AllowedMentionsTypes = AllowedMentionsTypes = {}));
/**
 * @see {@link https://discord.com/developers/docs/components/reference#component-object-component-types}
 */
var ComponentType;
(function (ComponentType) {
    /**
     * Container to display a row of interactive components
     */
    ComponentType[ComponentType["ActionRow"] = 1] = "ActionRow";
    /**
     * Button component
     */
    ComponentType[ComponentType["Button"] = 2] = "Button";
    /**
     * Select menu for picking from defined text options
     */
    ComponentType[ComponentType["StringSelect"] = 3] = "StringSelect";
    /**
     * Text Input component
     */
    ComponentType[ComponentType["TextInput"] = 4] = "TextInput";
    /**
     * Select menu for users
     */
    ComponentType[ComponentType["UserSelect"] = 5] = "UserSelect";
    /**
     * Select menu for roles
     */
    ComponentType[ComponentType["RoleSelect"] = 6] = "RoleSelect";
    /**
     * Select menu for users and roles
     */
    ComponentType[ComponentType["MentionableSelect"] = 7] = "MentionableSelect";
    /**
     * Select menu for channels
     */
    ComponentType[ComponentType["ChannelSelect"] = 8] = "ChannelSelect";
    /**
     * Container to display text alongside an accessory component
     */
    ComponentType[ComponentType["Section"] = 9] = "Section";
    /**
     * Markdown text
     */
    ComponentType[ComponentType["TextDisplay"] = 10] = "TextDisplay";
    /**
     * Small image that can be used as an accessory
     */
    ComponentType[ComponentType["Thumbnail"] = 11] = "Thumbnail";
    /**
     * Display images and other media
     */
    ComponentType[ComponentType["MediaGallery"] = 12] = "MediaGallery";
    /**
     * Displays an attached file
     */
    ComponentType[ComponentType["File"] = 13] = "File";
    /**
     * Component to add vertical padding between other components
     */
    ComponentType[ComponentType["Separator"] = 14] = "Separator";
    /**
     * @unstable This component type is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ComponentType[ComponentType["ContentInventoryEntry"] = 16] = "ContentInventoryEntry";
    /**
     * Container that visually groups a set of components
     */
    ComponentType[ComponentType["Container"] = 17] = "Container";
    /**
     * Container associating a label and description with a component
     */
    ComponentType[ComponentType["Label"] = 18] = "Label";
    /**
     * Component for uploading files
     */
    ComponentType[ComponentType["FileUpload"] = 19] = "FileUpload";
    // EVERYTHING BELOW THIS LINE SHOULD BE OLD NAMES FOR RENAMED ENUM MEMBERS //
    /**
     * Select menu for picking from defined text options
     *
     * @deprecated This is the old name for {@link ComponentType.StringSelect}
     */
    ComponentType[ComponentType["SelectMenu"] = 3] = "SelectMenu";
})(ComponentType || (exports.ComponentType = ComponentType = {}));
/**
 * @see {@link https://discord.com/developers/docs/components/reference#button-button-styles}
 */
var ButtonStyle;
(function (ButtonStyle) {
    /**
     * The most important or recommended action in a group of options
     */
    ButtonStyle[ButtonStyle["Primary"] = 1] = "Primary";
    /**
     * Alternative or supporting actions
     */
    ButtonStyle[ButtonStyle["Secondary"] = 2] = "Secondary";
    /**
     * Positive confirmation or completion actions
     */
    ButtonStyle[ButtonStyle["Success"] = 3] = "Success";
    /**
     * An action with irreversible consequences
     */
    ButtonStyle[ButtonStyle["Danger"] = 4] = "Danger";
    /**
     * Navigates to a URL
     */
    ButtonStyle[ButtonStyle["Link"] = 5] = "Link";
    /**
     * Purchase
     */
    ButtonStyle[ButtonStyle["Premium"] = 6] = "Premium";
})(ButtonStyle || (exports.ButtonStyle = ButtonStyle = {}));
/**
 * @see {@link https://discord.com/developers/docs/components/reference#text-input-text-input-styles}
 */
var TextInputStyle;
(function (TextInputStyle) {
    /**
     * Single-line input
     */
    TextInputStyle[TextInputStyle["Short"] = 1] = "Short";
    /**
     * Multi-line input
     */
    TextInputStyle[TextInputStyle["Paragraph"] = 2] = "Paragraph";
})(TextInputStyle || (exports.TextInputStyle = TextInputStyle = {}));
/**
 * @see {@link https://discord.com/developers/docs/components/reference#user-select-select-default-value-structure}
 */
var SelectMenuDefaultValueType;
(function (SelectMenuDefaultValueType) {
    SelectMenuDefaultValueType["Channel"] = "channel";
    SelectMenuDefaultValueType["Role"] = "role";
    SelectMenuDefaultValueType["User"] = "user";
})(SelectMenuDefaultValueType || (exports.SelectMenuDefaultValueType = SelectMenuDefaultValueType = {}));
var UnfurledMediaItemLoadingState;
(function (UnfurledMediaItemLoadingState) {
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["Unknown"] = 0] = "Unknown";
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["Loading"] = 1] = "Loading";
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["LoadedSuccess"] = 2] = "LoadedSuccess";
    UnfurledMediaItemLoadingState[UnfurledMediaItemLoadingState["LoadedNotFound"] = 3] = "LoadedNotFound";
})(UnfurledMediaItemLoadingState || (exports.UnfurledMediaItemLoadingState = UnfurledMediaItemLoadingState = {}));
/**
 * @see {@link https://discord.com/developers/docs/components/reference#separator}
 */
var SeparatorSpacingSize;
(function (SeparatorSpacingSize) {
    SeparatorSpacingSize[SeparatorSpacingSize["Small"] = 1] = "Small";
    SeparatorSpacingSize[SeparatorSpacingSize["Large"] = 2] = "Large";
})(SeparatorSpacingSize || (exports.SeparatorSpacingSize = SeparatorSpacingSize = {}));
//# sourceMappingURL=message.js.map