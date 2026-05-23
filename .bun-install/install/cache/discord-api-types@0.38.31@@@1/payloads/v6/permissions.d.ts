/**
 * Types extracted from https://discord.com/developers/docs/topics/permissions
 */
/**
 * https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
 *
 * These flags are exported as `BigInt`s and NOT numbers. For most of them, you can
 * convert them in a number by wrapping it in `Number()`, however be careful as any
 * further bits added may cause issues if done so. Try to use BigInts as much as possible
 * or modules that can replicate them in some way.
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare const PermissionFlagsBits: {
    readonly CREATE_INSTANT_INVITE: 1n;
    readonly KICK_MEMBERS: 2n;
    readonly BAN_MEMBERS: 4n;
    readonly ADMINISTRATOR: 8n;
    readonly MANAGE_CHANNELS: 16n;
    readonly MANAGE_GUILD: 32n;
    readonly ADD_REACTIONS: 64n;
    readonly VIEW_AUDIT_LOG: 128n;
    readonly PRIORITY_SPEAKER: 256n;
    readonly STREAM: 512n;
    readonly VIEW_CHANNEL: 1024n;
    readonly SEND_MESSAGES: 2048n;
    readonly SEND_TTS_MESSAGES: 4096n;
    readonly MANAGE_MESSAGES: 8192n;
    readonly EMBED_LINKS: 16384n;
    readonly ATTACH_FILES: 32768n;
    readonly READ_MESSAGE_HISTORY: 65536n;
    readonly MENTION_EVERYONE: 131072n;
    readonly USE_EXTERNAL_EMOJIS: 262144n;
    readonly VIEW_GUILD_INSIGHTS: 524288n;
    readonly CONNECT: 1048576n;
    readonly SPEAK: 2097152n;
    readonly MUTE_MEMBERS: 4194304n;
    readonly DEAFEN_MEMBERS: 8388608n;
    readonly MOVE_MEMBERS: 16777216n;
    readonly USE_VAD: 33554432n;
    readonly CHANGE_NICKNAME: 67108864n;
    readonly MANAGE_NICKNAMES: 134217728n;
    readonly MANAGE_ROLES: 268435456n;
    readonly MANAGE_WEBHOOKS: 536870912n;
    readonly MANAGE_EMOJIS: 1073741824n;
};
/**
 * https://discord.com/developers/docs/topics/permissions#role-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    position: number;
    /**
     * @deprecated Use `permissions_new` instead
     */
    permissions: number;
    permissions_new: string;
    managed: boolean;
    mentionable: boolean;
    tags?: APIRoleTags;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIRoleTags {
    bot_id?: string;
    premium_subscriber?: null;
    integration_id?: string;
}
//# sourceMappingURL=permissions.d.ts.map