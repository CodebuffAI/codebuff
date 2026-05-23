import type { Snowflake } from '../../globals';
export * from '../common';
export * from './auditLog';
export * from './channel';
export * from './emoji';
export * from './gateway';
export * from './guild';
export * from './guildScheduledEvent';
export * from './interactions';
export * from './invite';
export * from './oauth2';
export * from './stageInstance';
export * from './sticker';
export * from './template';
export * from './user';
export * from './voice';
export * from './webhook';
export declare const APIVersion = "8";
export declare const Routes: {
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/audit-logs`
     */
    guildAuditLog(guildId: Snowflake): `/guilds/${string}/audit-logs`;
    /**
     * Route for:
     * - GET    `/channels/{channel.id}`
     * - PATCH  `/channels/{channel.id}`
     * - DELETE `/channels/{channel.id}`
     */
    channel(channelId: Snowflake): `/channels/${string}`;
    /**
     * Route for:
     * - GET  `/channels/{channel.id}/messages`
     * - POST `/channels/{channel.id}/messages`
     */
    channelMessages(channelId: Snowflake): `/channels/${string}/messages`;
    /**
     * Route for:
     * - GET    `/channels/{channel.id}/messages/{message.id}`
     * - PATCH  `/channels/{channel.id}/messages/{message.id}`
     * - DELETE `/channels/{channel.id}/messages/{message.id}`
     */
    channelMessage(channelId: Snowflake, messageId: Snowflake): `/channels/${string}/messages/${string}`;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/messages/{message.id}/crosspost`
     */
    channelMessageCrosspost(channelId: Snowflake, messageId: Snowflake): `/channels/${string}/messages/${string}/crosspost`;
    /**
     * Route for:
     * - PUT    `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me`
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me`
     *
     * **Note**: You need to URL encode the emoji yourself
     */
    channelMessageOwnReaction(channelId: Snowflake, messageId: Snowflake, emoji: string): `/channels/${string}/messages/${string}/reactions/${string}/@me`;
    /**
     * Route for:
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/{user.id}`
     *
     * **Note**: You need to URL encode the emoji yourself
     */
    channelMessageUserReaction(channelId: Snowflake, messageId: Snowflake, emoji: string, userId: Snowflake): `/channels/${string}/messages/${string}/reactions/${string}/${string}`;
    /**
     * Route for:
     * - GET    `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}`
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}`
     *
     * **Note**: You need to URL encode the emoji yourself
     */
    channelMessageReaction(channelId: Snowflake, messageId: Snowflake, emoji: string): `/channels/${string}/messages/${string}/reactions/${string}`;
    /**
     * Route for:
     * - DELETE `/channels/{channel.id}/messages/{message.id}/reactions`
     */
    channelMessageAllReactions(channelId: Snowflake, messageId: Snowflake): `/channels/${string}/messages/${string}/reactions`;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/messages/bulk-delete`
     */
    channelBulkDelete(channelId: Snowflake): `/channels/${string}/messages/bulk-delete`;
    /**
     * Route for:
     * - PUT    `/channels/{channel.id}/permissions/{overwrite.id}`
     * - DELETE `/channels/{channel.id}/permissions/{overwrite.id}`
     */
    channelPermission(channelId: Snowflake, overwriteId: Snowflake): `/channels/${string}/permissions/${string}`;
    /**
     * Route for:
     * - GET  `/channels/{channel.id}/invites`
     * - POST `/channels/{channel.id}/invites`
     */
    channelInvites(channelId: Snowflake): `/channels/${string}/invites`;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/followers`
     */
    channelFollowers(channelId: Snowflake): `/channels/${string}/followers`;
    /**
     * Route for:
     * - POST `/channels/{channel.id}/typing`
     */
    channelTyping(channelId: Snowflake): `/channels/${string}/typing`;
    /**
     * Route for:
     * - GET `/channels/{channel.id}/pins`
     */
    channelPins(channelId: Snowflake): `/channels/${string}/pins`;
    /**
     * Route for:
     * - PUT    `/channels/{channel.id}/pins/{message.id}`
     * - DELETE `/channels/{channel.id}/pins/{message.id}`
     */
    channelPin(channelId: Snowflake, messageId: Snowflake): `/channels/${string}/pins/${string}`;
    /**
     * Route for:
     * - PUT    `/channels/{channel.id}/recipients/{user.id}`
     * - DELETE `/channels/{channel.id}/recipients/{user.id}`
     */
    channelRecipient(channelId: Snowflake, userId: Snowflake): `/channels/${string}/recipients/${string}`;
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/emojis`
     * - POST `/guilds/{guild.id}/emojis`
     */
    guildEmojis(guildId: Snowflake): `/guilds/${string}/emojis`;
    /**
     * Route for:
     * - GET    `/guilds/{guild.id}/emojis/{emoji.id}`
     * - PATCH  `/guilds/{guild.id}/emojis/{emoji.id}`
     * - DELETE `/guilds/{guild.id}/emojis/{emoji.id}`
     */
    guildEmoji(guildId: Snowflake, emojiId: Snowflake): `/guilds/${string}/emojis/${string}`;
    /**
     * Route for:
     * - POST `/guilds`
     */
    guilds(): "/guilds";
    /**
     * Route for:
     * - GET    `/guilds/{guild.id}`
     * - PATCH  `/guilds/{guild.id}`
     * - DELETE `/guilds/{guild.id}`
     */
    guild(guildId: Snowflake): `/guilds/${string}`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/preview`
     */
    guildPreview(guildId: Snowflake): `/guilds/${string}/preview`;
    /**
     * Route for:
     * - GET   `/guilds/{guild.id}/channels`
     * - POST  `/guilds/{guild.id}/channels`
     * - PATCH `/guilds/{guild.id}/channels`
     */
    guildChannels(guildId: Snowflake): `/guilds/${string}/channels`;
    /**
     * Route for:
     * - GET    `/guilds/{guild.id}/members/{user.id}`
     * - PUT    `/guilds/{guild.id}/members/{user.id}`
     * - PATCH  `/guilds/{guild.id}/members/@me`
     * - PATCH  `/guilds/{guild.id}/members/{user.id}`
     * - DELETE `/guilds/{guild.id}/members/{user.id}`
     */
    guildMember(guildId: Snowflake, userId?: Snowflake | "@me"): `/guilds/${string}/members/${string}`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members`
     */
    guildMembers(guildId: Snowflake): `/guilds/${string}/members`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/members/search`
     */
    guildMembersSearch(guildId: Snowflake): `/guilds/${string}/members/search`;
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/members/@me/nick`
     *
     * @deprecated Use {@link Routes.guildMember} instead.
     */
    guildCurrentMemberNickname(guildId: Snowflake): `/guilds/${string}/members/@me/nick`;
    /**
     * Route for:
     * - PUT    `/guilds/{guild.id}/members/{user.id}/roles/{role.id}`
     * - DELETE `/guilds/{guild.id}/members/{user.id}/roles/{role.id}`
     */
    guildMemberRole(guildId: Snowflake, memberId: Snowflake, roleId: Snowflake): `/guilds/${string}/members/${string}/roles/${string}`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/bans`
     */
    guildBans(guildId: Snowflake): `/guilds/${string}/bans`;
    /**
     * Route for:
     * - GET    `/guilds/{guild.id}/bans/{user.id}`
     * - PUT    `/guilds/{guild.id}/bans/{user.id}`
     * - DELETE `/guilds/{guild.id}/bans/{user.id}`
     */
    guildBan(guildId: Snowflake, userId: Snowflake): `/guilds/${string}/bans/${string}`;
    /**
     * Route for:
     * - GET   `/guilds/{guild.id}/roles`
     * - POST  `/guilds/{guild.id}/roles`
     * - PATCH `/guilds/{guild.id}/roles`
     */
    guildRoles(guildId: Snowflake): `/guilds/${string}/roles`;
    /**
     * Route for:
     * - PATCH  `/guilds/{guild.id}/roles/{role.id}`
     * - DELETE `/guilds/{guild.id}/roles/{role.id}`
     */
    guildRole(guildId: Snowflake, roleId: Snowflake): `/guilds/${string}/roles/${string}`;
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/prune`
     * - POST `/guilds/{guild.id}/prune`
     */
    guildPrune(guildId: Snowflake): `/guilds/${string}/prune`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/regions`
     */
    guildVoiceRegions(guildId: Snowflake): `/guilds/${string}/regions`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/invites`
     */
    guildInvites(guildId: Snowflake): `/guilds/${string}/invites`;
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/integrations`
     */
    guildIntegrations(guildId: Snowflake): `/guilds/${string}/integrations`;
    /**
     * Route for:
     * - DELETE `/guilds/{guild.id}/integrations/{integration.id}`
     */
    guildIntegration(guildId: Snowflake, integrationId: Snowflake): `/guilds/${string}/integrations/${string}`;
    /**
     * Route for:
     * - GET   `/guilds/{guild.id}/widget`
     * - PATCH `/guilds/{guild.id}/widget`
     */
    guildWidgetSettings(guildId: Snowflake): `/guilds/${string}/widget`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/widget.json`
     */
    guildWidgetJSON(guildId: Snowflake): `/guilds/${string}/widget.json`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/vanity-url`
     */
    guildVanityUrl(guildId: Snowflake): `/guilds/${string}/vanity-url`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/widget.png`
     */
    guildWidgetImage(guildId: Snowflake): `/guilds/${string}/widget.png`;
    /**
     * Route for:
     * - GET    `/invites/{invite.code}`
     * - DELETE `/invites/{invite.code}`
     */
    invite(code: string): `/invites/${string}`;
    /**
     * Route for:
     * - GET  `/guilds/templates/{template.code}`
     * - POST `/guilds/templates/{template.code}`
     */
    template(code: string): `/guilds/templates/${string}`;
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/templates`
     * - POST `/guilds/{guild.id}/templates`
     */
    guildTemplates(guildId: Snowflake): `/guilds/${string}/templates`;
    /**
     * Route for:
     * - PUT    `/guilds/{guild.id}/templates/{template.code}`
     * - PATCH  `/guilds/{guild.id}/templates/{template.code}`
     * - DELETE `/guilds/{guild.id}/templates/{template.code}`
     */
    guildTemplate(guildId: Snowflake, code: string): `/guilds/${string}/templates/${string}`;
    /**
     * Route for:
     * - GET   `/users/@me`
     * - GET   `/users/{user.id}`
     * - PATCH `/users/@me`
     *
     * @param [userId] The user ID, defaulted to `@me`
     */
    user(userId?: Snowflake | "@me"): `/users/${string}`;
    /**
     * Route for:
     * - GET `/users/@me/guilds`
     */
    userGuilds(): "/users/@me/guilds";
    /**
     * Route for:
     * - GET `/users/@me/guilds/{guild.id}/member`
     */
    userGuildMember(guildId: Snowflake): `/users/@me/guilds/${string}/member`;
    /**
     * Route for:
     * - DELETE `/users/@me/guilds/{guild.id}`
     */
    userGuild(guildId: Snowflake): `/users/@me/guilds/${string}`;
    /**
     * Route for:
     * - POST `/users/@me/channels`
     */
    userChannels(): "/users/@me/channels";
    /**
     * Route for:
     * - GET `/users/@me/connections`
     */
    userConnections(): "/users/@me/connections";
    /**
     * Route for:
     * - GET `/voice/regions`
     */
    voiceRegions(): "/voice/regions";
    /**
     * Route for:
     * - GET  `/channels/{channel.id}/webhooks`
     * - POST `/channels/{channel.id}/webhooks`
     */
    channelWebhooks(channelId: Snowflake): `/channels/${string}/webhooks`;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/webhooks`
     */
    guildWebhooks(guildId: Snowflake): `/guilds/${string}/webhooks`;
    /**
     * Route for:
     * - GET    `/webhooks/{webhook.id}`
     * - GET    `/webhooks/{webhook.id}/{webhook.token}`
     * - PATCH  `/webhooks/{webhook.id}`
     * - PATCH  `/webhooks/{webhook.id}/{webhook.token}`
     * - DELETE `/webhooks/{webhook.id}`
     * - DELETE `/webhooks/{webhook.id}/{webhook.token}`
     * - POST   `/webhooks/{webhook.id}/{webhook.token}`
     *
     * - POST   `/webhooks/{application.id}/{interaction.token}`
     */
    webhook(webhookId: Snowflake, webhookToken?: string): `/webhooks/${Snowflake}/${string}` | `/webhooks/${Snowflake}`;
    /**
     * Route for:
     * - GET    `/webhooks/{webhook.id}/{webhook.token}/messages/@original`
     * - GET    `/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}`
     * - PATCH  `/webhooks/{webhook.id}/{webhook.token}/messages/@original`
     * - PATCH  `/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}`
     * - DELETE `/webhooks/{webhook.id}/{webhook.token}/messages/@original`
     * - DELETE `/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}`
     *
     * - PATCH  `/webhooks/{application.id}/{interaction.token}/messages/@original`
     * - PATCH  `/webhooks/{application.id}/{interaction.token}/messages/{message.id}`
     * - DELETE `/webhooks/{application.id}/{interaction.token}/messages/{message.id}`
     */
    webhookMessage(webhookId: Snowflake, webhookToken: string, messageId?: Snowflake | "@original"): `/webhooks/${string}/${string}/messages/${string}`;
    /**
     * Route for:
     * - POST `/webhooks/{webhook.id}/{webhook.token}/github`
     * - POST `/webhooks/{webhook.id}/{webhook.token}/slack`
     */
    webhookPlatform(webhookId: Snowflake, webhookToken: string, platform: "github" | "slack"): `/webhooks/${string}/${string}/github` | `/webhooks/${string}/${string}/slack`;
    /**
     * Route for:
     * - GET `/gateway`
     */
    gateway(): "/gateway";
    /**
     * Route for:
     * - GET `/gateway/bot`
     */
    gatewayBot(): "/gateway/bot";
    /**
     * Route for:
     * - GET `/oauth2/applications/@me`
     */
    oauth2CurrentApplication(): "/oauth2/applications/@me";
    /**
     * Route for:
     * - GET `/oauth2/@me`
     */
    oauth2CurrentAuthorization(): "/oauth2/@me";
    /**
     * Route for:
     * - GET `/oauth2/authorize`
     */
    oauth2Authorization(): "/oauth2/authorize";
    /**
     * Route for:
     * - POST `/oauth2/token`
     */
    oauth2TokenExchange(): "/oauth2/token";
    /**
     * Route for:
     * - POST `/oauth2/token/revoke`
     */
    oauth2TokenRevocation(): "/oauth2/token/revoke";
    /**
     * Route for:
     * - GET  `/applications/{application.id}/commands`
     * - PUT  `/applications/{application.id}/commands`
     * - POST `/applications/{application.id}/commands`
     */
    applicationCommands(applicationId: Snowflake): `/applications/${string}/commands`;
    /**
     * Route for:
     * - GET    `/applications/{application.id}/commands/{command.id}`
     * - PATCH  `/applications/{application.id}/commands/{command.id}`
     * - DELETE `/applications/{application.id}/commands/{command.id}`
     */
    applicationCommand(applicationId: Snowflake, commandId: Snowflake): `/applications/${string}/commands/${string}`;
    /**
     * Route for:
     * - GET  `/applications/{application.id}/guilds/{guild.id}/commands`
     * - PUT  `/applications/{application.id}/guilds/{guild.id}/commands`
     * - POST `/applications/{application.id}/guilds/{guild.id}/commands`
     */
    applicationGuildCommands(applicationId: Snowflake, guildId: Snowflake): `/applications/${string}/guilds/${string}/commands`;
    /**
     * Route for:
     * - GET    `/applications/{application.id}/guilds/{guild.id}/commands/{command.id}`
     * - PATCH  `/applications/{application.id}/guilds/{guild.id}/commands/{command.id}`
     * - DELETE `/applications/{application.id}/guilds/{guild.id}/commands/{command.id}`
     */
    applicationGuildCommand(applicationId: Snowflake, guildId: Snowflake, commandId: Snowflake): `/applications/${string}/guilds/${string}/commands/${string}`;
    /**
     * Route for:
     * - POST `/interactions/{interaction.id}/{interaction.token}/callback`
     */
    interactionCallback(interactionId: Snowflake, interactionToken: string): `/interactions/${string}/${string}/callback`;
    /**
     * Route for:
     * - GET   `/guilds/{guild.id}/member-verification`
     * - PATCH `/guilds/{guild.id}/member-verification`
     */
    guildMemberVerification(guildId: Snowflake): `/guilds/${string}/member-verification`;
    /**
     * Route for:
     * - PATCH `/guilds/{guild.id}/voice-states/@me`
     * - PATCH `/guilds/{guild.id}/voice-states/{user.id}`
     */
    guildVoiceState(guildId: Snowflake, userId?: Snowflake | "@me"): `/guilds/${string}/voice-states/${string}`;
    /**
     * Route for:
     * - GET `/applications/{application.id}/guilds/{guild.id}/commands/permissions`
     * - PUT `/applications/{application.id}/guilds/{guild.id}/commands/permissions`
     */
    guildApplicationCommandsPermissions(applicationId: Snowflake, guildId: Snowflake): `/applications/${string}/guilds/${string}/commands/permissions`;
    /**
     * Route for:
     * - GET `/applications/{application.id}/guilds/{guild.id}/commands/{command.id}/permissions`
     * - PUT `/applications/{application.id}/guilds/{guild.id}/commands/{command.id}/permissions`
     */
    applicationCommandPermissions(applicationId: Snowflake, guildId: Snowflake, commandId: Snowflake): `/applications/${string}/guilds/${string}/commands/${string}/permissions`;
    /**
     * Route for:
     * - GET   `/guilds/{guild.id}/welcome-screen`
     * - PATCH `/guilds/{guild.id}/welcome-screen`
     */
    guildWelcomeScreen(guildId: Snowflake): `/guilds/${string}/welcome-screen`;
    /**
     * Route for:
     * - POST `/stage-instances`
     */
    stageInstances(): "/stage-instances";
    /**
     * Route for:
     * - GET `/stage-instances/{channel.id}`
     * - PATCH `/stage-instances/{channel.id}`
     * - DELETE `/stage-instances/{channel.id}`
     */
    stageInstance(channelId: Snowflake): `/stage-instances/${string}`;
    /**
     * Route for:
     * - GET `/stickers/{sticker.id}`
     */
    sticker(stickerId: Snowflake): `/stickers/${string}`;
    /**
     * Route for:
     * - GET `/sticker-packs`
     */
    nitroStickerPacks(): "/sticker-packs";
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/stickers`
     * - POST `/guilds/{guild.id}/stickers`
     */
    guildStickers(guildId: Snowflake): `/guilds/${string}/stickers`;
    /**
     * Route for:
     * - GET    `/guilds/{guild.id}/stickers/{sticker.id}`
     * - PATCH  `/guilds/{guild.id}/stickers/{sticker.id}`
     * - DELETE `/guilds/{guild.id}/stickers/{sticker.id}`
     */
    guildSticker(guildId: Snowflake, stickerId: Snowflake): `/guilds/${string}/stickers/${string}`;
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/scheduled-events`
     * - POST `/guilds/{guild.id}/scheduled-events`
     */
    guildScheduledEvents(guildId: Snowflake): string;
    /**
     * Route for:
     * - GET  `/guilds/{guild.id}/scheduled-events/{guildScheduledEvent.id}`
     * - PATCH `/guilds/{guild.id}/scheduled-events/{guildScheduledEvent.id}`
     * - DELETE `/guilds/{guild.id}/scheduled-events/{guildScheduledEvent.id}`
     */
    guildScheduledEvent(guildId: Snowflake, guildScheduledEventId: Snowflake): string;
    /**
     * Route for:
     * - GET `/guilds/{guild.id}/scheduled-events/{guildScheduledEvent.id}/users`
     */
    guildScheduledEventUsers(guildId: Snowflake, guildScheduledEventId: Snowflake): string;
};
export declare const RouteBases: {
    readonly api: "https://discord.com/api/v8";
    readonly cdn: "https://cdn.discordapp.com";
    readonly invite: "https://discord.gg";
    readonly template: "https://discord.new";
    readonly gift: "https://discord.gift";
    readonly scheduledEvent: "https://discord.com/events";
};
export declare const OAuth2Routes: {
    readonly authorizationURL: "https://discord.com/api/v8/oauth2/authorize";
    readonly tokenURL: "https://discord.com/api/v8/oauth2/token";
    /**
     * See https://tools.ietf.org/html/rfc7009
     */
    readonly tokenRevocationURL: "https://discord.com/api/v8/oauth2/token/revoke";
};
//# sourceMappingURL=index.d.ts.map