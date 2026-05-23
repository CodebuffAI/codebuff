export * from '../common';
export * from './auditLog';
export * from './channel';
export * from './emoji';
export * from './gateway';
export * from './guild';
export * from './invite';
export * from './oauth2';
export * from './user';
export * from './voice';
export * from './webhook';
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export declare const APIVersion = "6";
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export declare const Routes: {
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/audit-logs`
     */
    guildAuditLog(guildID: string): string;
    /**
     * Route for:
     * - GET `/channels/{channel.id}`
     * - PATCH `/channels/{channel.id}`
     * - DELETE `/channels/{channel.id}`
     */
    channel(channelID: string): string;
    /**
     * Route for:
     * - GET `/channels/{channel.id}/messages`
     * - POST `/channels/{channel.id}/messages`
     */
    channelMessages(channelID: string): string;
    /**
     * Route for:
     * - GET `/channels/{channel.id}/messages/{message.id}`
     * - PATCH `/channels/{channel.id}/messages/{message.id}`
     * - DELETE `/channels/{channel.id}/messages/{message.id}`
     */
    channelMessage(channelID: string, messageID: string): string;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/messages/{message.id}/crosspost`
     */
    channelCrosspost(channelID: string, messageID: string): string;
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me`
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me`
     *
     * **Note**: You need to URL encode the emoji yourself.
     */
    channelMessageOwnReaction(channelID: string, messageID: string, emoji: string): string;
    /**
     * Route for:
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/{user.id}`
     *
     * **Note**: You need to URL encode the emoji yourself.
     */
    channelMessageUserReaction(channelID: string, messageID: string, emoji: string, userID: string): string;
    /**
     * Route for:
     * - GET `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}`
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}`
     *
     * **Note**: You need to URL encode the emoji yourself.
     */
    channelMessageSpecificReaction(channelID: string, messageID: string, emoji: string): string;
    /**
     * Route for:
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions`
     */
    channelMessageAllReactions(channelID: string, messageID: string): string;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/messages/bulk-delete`
     */
    channelBulkDelete(channelID: string): string;
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/permissions/{overwrite.id}`
     * - DELETE `/channels/{channel.id}/permissions/{overwrite.id}`
     */
    channelPermissions(channelID: string, overwriteID: string): string;
    /**
     * Route for:
     * - GET `/channels/{channel.id}/invites`
     * - POST `/channels/{channel.id}/invites`
     */
    channelInvite(channelID: string): string;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/followers`
     */
    channelFollowers(channelID: string): string;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/typing`
     */
    channelTyping(channelID: string): string;
    /**
     * Route for:
     * - GET `/channels/{channel.id}/pins`
     */
    channelPins(channelID: string): string;
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/pins/{message.id}`
     * - DELETE `/channels/{channel.id}/pins/{message.id}`
     */
    channelPin(channelID: string, messageID: string): string;
    /**
     * Route for:
     * - PUT `/channels/{channel.id}/recipients/{user.id}`
     * - DELETE `/channels/{channel.id}/recipients/{user.id}`
     */
    channelRecipient(channelID: string, userID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/emojis`
     * - POST `/guilds/{guild.id}/emojis`
     */
    guildEmojis(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/emojis/{emoji.id}`
     * - PATCH `/guilds/{guild.id}/emojis/{emoji.id}`
     * - DELETE `/guilds/{guild.id}/emojis/{emoji.id}`
     */
    guildEmoji(guildID: string, emojiID: string): string;
    /**
     * Route for:
     * - POST `/guilds`
     */
    guilds(): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}`
     * - PATCH `/guilds/{guild.id}`
     * - DELETE `/guilds/{guild.id}`
     */
    guild(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/preview`
     */
    guildPreview(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/channels`
     * - POST `/guilds/{guild.id}/channels`
     * - PATCH `/guilds/{guild.id}/channels`
     */
    guildChannels(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members/{user.id}`
     * - PUT `/guilds/{guild.id}/members/{user.id}`
     * - PATCH `/guilds/{guild.id}/members/{user.id}`
     * - DELETE `/guilds/{guild.id}/members/{user.id}`
     */
    guildMember(guildID: string, userID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members`
     */
    guildMembers(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members/search`
     */
    guildMembersSearch(guildID: string): string;
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/members/@me/nick`
     */
    guildCurrentMemberNickname(guildID: string): string;
    /**
     * Route for:
     * - PUT `/guilds/{guild.id}/members/{user.id}/roles/{role.id}`
     * - DELETE `/guilds/{guild.id}/members/{user.id}/roles/{role.id}`
     */
    guildMemberRole(guildID: string, memberID: string, roleID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/bans`
     */
    guildBans(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/bans/{user.id}`
     * - PUT `/guilds/{guild.id}/bans/{user.id}`
     * - DELETE `/guilds/{guild.id}/bans/{user.id}`
     */
    guildBan(guildID: string, userID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/roles`
     * - POST `/guilds/{guild.id}/roles`
     * - PATCH `/guilds/{guild.id}/roles`
     */
    guildRoles(guildID: string): string;
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/roles/{role.id}`
     * - DELETE `/guilds/{guild.id}/roles/{role.id}`
     */
    guildRole(guildID: string, roleID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/prune`
     * - POST `/guilds/{guild.id}/prune`
     */
    guildPrune(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/regions`
     */
    guildVoiceRegions(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/invites`
     */
    guildInvites(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/integrations`
     * - POST `/guilds/{guild.id}/integrations`
     */
    guildIntegrations(guildID: string): string;
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/integrations/{integration.id}`
     * - DELETE `/guilds/{guild.id}/integrations/{integration.id}`
     */
    guildIntegration(guildID: string, integrationID: string): string;
    /**
     * Route for:
     * - POST `/guilds/{guild.id}/integrations/{integration.id}/sync`
     */
    guildIntegrationSync(guildID: string, integrationID: string): string;
    /**
     * @deprecated Use `guildWidgetSettings` instead
     */
    guildWidget(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/widget`
     * - PATCH `/guilds/{guild.id}/widget`
     */
    guildWidgetSettings(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/vanity-url`
     */
    guildVanityUrl(guildID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/widget.png`
     */
    guildWidgetImage(guildID: string): string;
    /**
     * Route for:
     * - GET `/invites/{invite.code}`
     * - DELETE `/invites/{invite.code}`
     */
    invite(code: string): string;
    /**
     * Route for:
     * - GET `/users/@me`
     * - GET `/users/{user.id}`
     * - PATCH `/users/@me`
     */
    user(userID?: string): string;
    /**
     * Route for:
     * - GET `/users/@me/guilds`
     */
    userGuilds(): string;
    /**
     * Route for:
     * - DELETE `/users/@me/guilds/{guild.id}`
     */
    userGuild(guildID: string): string;
    /**
     * Route for:
     * - POST `/users/@me/channels`
     */
    userChannels(): string;
    /**
     * Route for:
     * - GET `/users/@me/connections`
     */
    userConnections(): string;
    /**
     * Route for:
     * - GET `/voice/regions`
     */
    voiceRegions(): string;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/webhooks`
     * - GET `/channels/{channel.id}/webhooks`
     */
    channelWebhook(channelID: string): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/webhooks`
     */
    guildWebhooks(guildID: string): string;
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
    webhook(webhookID: string, webhookToken?: string): string;
    /**
     * Route for:
     * - POST `/webhooks/{webhook.id}/{webhook.token}/slack`
     * - POST `/webhooks/{webhook.id}/{webhook.token}/github`
     */
    webhookPlatform(webhookID: string, webhookToken: string, platform: "github" | "slack"): string;
    /**
     * Route for:
     * - GET `/gateway`
     */
    gateway(): string;
    /**
     * Route for:
     * - GET `/gateway/bot`
     */
    gatewayBot(): string;
    /**
     * Route for:
     * - GET `/oauth2/applications/@me`
     */
    oauth2CurrentApplication(): string;
};
//# sourceMappingURL=index.d.ts.map