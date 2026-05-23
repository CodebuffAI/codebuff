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
exports.Routes = exports.APIVersion = void 0;
const internals_1 = require("../../utils/internals");
__exportStar(require("../common"), exports);
__exportStar(require("./auditLog"), exports);
__exportStar(require("./channel"), exports);
__exportStar(require("./emoji"), exports);
__exportStar(require("./gateway"), exports);
__exportStar(require("./guild"), exports);
__exportStar(require("./invite"), exports);
__exportStar(require("./oauth2"), exports);
__exportStar(require("./user"), exports);
__exportStar(require("./voice"), exports);
__exportStar(require("./webhook"), exports);
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
exports.APIVersion = '6';
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
exports.Routes = {
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/audit-logs`
     */
    guildAuditLog(guildID) {
        return `/guilds/${guildID}/audit-logs`;
    },
    /**
     * Route for:
     * - GET `/channels/{channel.id}`
     * - PATCH `/channels/{channel.id}`
     * - DELETE `/channels/{channel.id}`
     */
    channel(channelID) {
        return `/channels/${channelID}`;
    },
    /**
     * Route for:
     * - GET `/channels/{channel.id}/messages`
     * - POST `/channels/{channel.id}/messages`
     */
    channelMessages(channelID) {
        return `/channels/${channelID}/messages`;
    },
    /**
     * Route for:
     * - GET `/channels/{channel.id}/messages/{message.id}`
     * - PATCH `/channels/{channel.id}/messages/{message.id}`
     * - DELETE `/channels/{channel.id}/messages/{message.id}`
     */
    channelMessage(channelID, messageID) {
        return `/channels/${channelID}/messages/${messageID}`;
    },
    /**
     * Route for:
     * - POST `/channels/{channel.id}/messages/{message.id}/crosspost`
     */
    channelCrosspost(channelID, messageID) {
        return `/channels/${channelID}/message/${messageID}/crosspost`;
    },
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me`
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me`
     *
     * **Note**: You need to URL encode the emoji yourself.
     */
    channelMessageOwnReaction(channelID, messageID, emoji) {
        return `/channels/${channelID}/messages/${messageID}/reactions/${emoji}/@me`;
    },
    /**
     * Route for:
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/{user.id}`
     *
     * **Note**: You need to URL encode the emoji yourself.
     */
    channelMessageUserReaction(channelID, messageID, emoji, userID) {
        return `/channels/${channelID}/messages/${messageID}/reactions/${emoji}/${userID}`;
    },
    /**
     * Route for:
     * - GET `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}`
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}`
     *
     * **Note**: You need to URL encode the emoji yourself.
     */
    channelMessageSpecificReaction(channelID, messageID, emoji) {
        return `/channels/${channelID}/messages/${messageID}/reactions/${emoji}`;
    },
    /**
     * Route for:
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions`
     */
    channelMessageAllReactions(channelID, messageID) {
        return `/channels/${channelID}/messages/${messageID}`;
    },
    /**
     * Route for:
     * - POST `/channels/{channel.id}/messages/bulk-delete`
     */
    channelBulkDelete(channelID) {
        return `/channels/${channelID}/bulk-delete`;
    },
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/permissions/{overwrite.id}`
     * - DELETE `/channels/{channel.id}/permissions/{overwrite.id}`
     */
    channelPermissions(channelID, overwriteID) {
        return `/channels/${channelID}/permissions/${overwriteID}`;
    },
    /**
     * Route for:
     * - GET `/channels/{channel.id}/invites`
     * - POST `/channels/{channel.id}/invites`
     */
    channelInvite(channelID) {
        return `/channels/${channelID}`;
    },
    /**
     * Route for:
     * - POST `/channels/{channel.id}/followers`
     */
    channelFollowers(channelID) {
        return `/channels/${channelID}/followers`;
    },
    /**
     * Route for:
     * - POST `/channels/{channel.id}/typing`
     */
    channelTyping(channelID) {
        return `/channels/${channelID}/typing`;
    },
    /**
     * Route for:
     * - GET `/channels/{channel.id}/pins`
     */
    channelPins(channelID) {
        return `/channels/${channelID}/pins`;
    },
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/pins/{message.id}`
     * - DELETE `/channels/{channel.id}/pins/{message.id}`
     */
    channelPin(channelID, messageID) {
        return `/channels/${channelID}/pins/${messageID}`;
    },
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/recipients/{user.id}`
     * - DELETE `/channels/{channel.id}/recipients/{user.id}`
     */
    channelRecipient(channelID, userID) {
        return `/channels/${channelID}/recipients/${userID}`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/emojis`
     * - POST `/guilds/{guild.id}/emojis`
     */
    guildEmojis(guildID) {
        return `/guilds/${guildID}/emojis`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/emojis/{emoji.id}`
     * - PATCH `/guilds/{guild.id}/emojis/{emoji.id}`
     * - DELETE `/guilds/{guild.id}/emojis/{emoji.id}`
     */
    guildEmoji(guildID, emojiID) {
        return `/guilds/${guildID}/emojis/${emojiID}`;
    },
    /**
     * Route for:
     * - POST `/guilds`
     */
    guilds() {
        return '/guilds';
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}`
     * - PATCH `/guilds/{guild.id}`
     * - DELETE `/guilds/{guild.id}`
     */
    guild(guildID) {
        return `/guilds/${guildID}`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/preview`
     */
    guildPreview(guildID) {
        return `/guilds/${guildID}/preview`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/channels`
     * - POST `/guilds/{guild.id}/channels`
     * - PATCH `/guilds/{guild.id}/channels`
     */
    guildChannels(guildID) {
        return `/guilds/${guildID}/channels`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members/{user.id}`
     * - PUT `/guilds/{guild.id}/members/{user.id}`
     * - PATCH `/guilds/{guild.id}/members/{user.id}`
     * - DELETE `/guilds/{guild.id}/members/{user.id}`
     */
    guildMember(guildID, userID) {
        return `/guilds/${guildID}/members/${userID}`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members`
     */
    guildMembers(guildID) {
        return `/guilds/${guildID}/members`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members/search`
     */
    guildMembersSearch(guildID) {
        return `/guilds/${guildID}/members/search`;
    },
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/members/@me/nick`
     */
    guildCurrentMemberNickname(guildID) {
        return `/guilds/${guildID}/members/@me/nick`;
    },
    /**
     * Route for:
     * - PUT `/guilds/{guild.id}/members/{user.id}/roles/{role.id}`
     * - DELETE `/guilds/{guild.id}/members/{user.id}/roles/{role.id}`
     */
    guildMemberRole(guildID, memberID, roleID) {
        return `/guilds/${guildID}/members/${memberID}/roles/${roleID}`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/bans`
     */
    guildBans(guildID) {
        return `/guilds/${guildID}/bans`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/bans/{user.id}`
     * - PUT `/guilds/{guild.id}/bans/{user.id}`
     * - DELETE `/guilds/{guild.id}/bans/{user.id}`
     */
    guildBan(guildID, userID) {
        return `/guilds/${guildID}/bans/${userID}`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/roles`
     * - POST `/guilds/{guild.id}/roles`
     * - PATCH `/guilds/{guild.id}/roles`
     */
    guildRoles(guildID) {
        return `/guilds/${guildID}/roles`;
    },
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/roles/{role.id}`
     * - DELETE `/guilds/{guild.id}/roles/{role.id}`
     */
    guildRole(guildID, roleID) {
        return `/guilds/${guildID}/roles/${roleID}`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/prune`
     * - POST `/guilds/{guild.id}/prune`
     */
    guildPrune(guildID) {
        return `/guilds/${guildID}/prune`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/regions`
     */
    guildVoiceRegions(guildID) {
        return `/guilds/${guildID}/regions`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/invites`
     */
    guildInvites(guildID) {
        return `/guilds/${guildID}/invites`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/integrations`
     * - POST `/guilds/{guild.id}/integrations`
     */
    guildIntegrations(guildID) {
        return `/guilds/${guildID}/integrations`;
    },
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/integrations/{integration.id}`
     * - DELETE `/guilds/{guild.id}/integrations/{integration.id}`
     */
    guildIntegration(guildID, integrationID) {
        return `/guilds/${guildID}/integrations/${integrationID}`;
    },
    /**
     * Route for:
     * - POST `/guilds/{guild.id}/integrations/{integration.id}/sync`
     */
    guildIntegrationSync(guildID, integrationID) {
        return `/guilds/${guildID}/integrations/${integrationID}/sync`;
    },
    /**
     * @deprecated Use `guildWidgetSettings` instead
     */
    guildWidget(guildID) {
        return `/guilds/${guildID}/widget`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/widget`
     * - PATCH `/guilds/{guild.id}/widget`
     */
    guildWidgetSettings(guildID) {
        return `/guilds/${guildID}/widget`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/vanity-url`
     */
    guildVanityUrl(guildID) {
        return `/guilds/${guildID}/vanity-url`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/widget.png`
     */
    guildWidgetImage(guildID) {
        return `/guilds/${guildID}/widget.png`;
    },
    /**
     * Route for:
     * - GET `/invites/{invite.code}`
     * - DELETE `/invites/{invite.code}`
     */
    invite(code) {
        return `/invites/${code}`;
    },
    /**
     * Route for:
     * - GET `/users/@me`
     * - GET `/users/{user.id}`
     * - PATCH `/users/@me`
     */
    user(userID = '@me') {
        return `/users/${userID}`;
    },
    /**
     * Route for:
     * - GET `/users/@me/guilds`
     */
    userGuilds() {
        return `/users/@me/guilds`;
    },
    /**
     * Route for:
     * - DELETE `/users/@me/guilds/{guild.id}`
     */
    userGuild(guildID) {
        return `/users/@me/guilds/${guildID}`;
    },
    /**
     * Route for:
     * - POST `/users/@me/channels`
     */
    userChannels() {
        return `/users/@me/channels`;
    },
    /**
     * Route for:
     * - GET `/users/@me/connections`
     */
    userConnections() {
        return `/users/@me/connections`;
    },
    /**
     * Route for:
     * - GET `/voice/regions`
     */
    voiceRegions() {
        return `/voice/regions`;
    },
    /**
     * Route for:
     * - POST `/channels/{channel.id}/webhooks`
     * - GET `/channels/{channel.id}/webhooks`
     */
    channelWebhook(channelID) {
        return `/channels/${channelID}/webhooks`;
    },
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/webhooks`
     */
    guildWebhooks(guildID) {
        return `/guilds/${guildID}/webhooks`;
    },
    /**
     * Route for:
     * - GET `/webhooks/{webhook.id}`
     * - GET `/webhooks/{webhook.id}/{webhook.token}`
     * - PATCH `/webhooks/{webhook.id}`
     * - PATCH `/webhooks/{webhook.id}/{webhook.token}`
     * - DELETE `/webhooks/{webhook.id}`
     * - DELETE `/webhooks/{webhook.id}/{webhook.token}`
     * - POST `/webhooks/{webhook.id}/{webhook.token}`
     */
    webhook(webhookID, webhookToken) {
        const parts = ['', 'webhooks', webhookID];
        if (webhookToken)
            parts.push(webhookToken);
        return parts.join('/');
    },
    /**
     * Route for:
     * - POST `/webhooks/{webhook.id}/{webhook.token}/slack`
     * - POST `/webhooks/{webhook.id}/{webhook.token}/github`
     */
    webhookPlatform(webhookID, webhookToken, platform) {
        return `/${webhookID}/${webhookToken}/${platform}`;
    },
    /**
     * Route for:
     * - GET `/gateway`
     */
    gateway() {
        return `/gateway`;
    },
    /**
     * Route for:
     * - GET `/gateway/bot`
     */
    gatewayBot() {
        return `/gateway/bot`;
    },
    /**
     * Route for:
     * - GET `/oauth2/applications/@me`
     */
    oauth2CurrentApplication() {
        return `/oauth2/applications/@me`;
    },
};
for (const [key, fn] of Object.entries(exports.Routes)) {
    exports.Routes[key] = (...args) => {
        const escaped = args.map((arg) => {
            if (arg) {
                // Skip already "safe" urls
                if (internals_1.urlSafeCharacters.test(String(arg))) {
                    return arg;
                }
                return encodeURIComponent(arg);
            }
            return arg;
        });
        // eslint-disable-next-line no-useless-call
        return fn.call(null, ...escaped);
    };
}
// Freeze the object so it can't be changed
Object.freeze(exports.Routes);
//# sourceMappingURL=index.js.map