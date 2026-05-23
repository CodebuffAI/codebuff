/**
 * Types extracted from https://discord.com/developers/docs/resources/invite
 */
import type { APIApplication } from './application';
import type { APIPartialChannel } from './channel';
import type { APIGuild } from './guild';
import type { APIGuildScheduledEvent } from './guildScheduledEvent';
import type { APIInviteStageInstance } from './stageInstance';
import type { APIUser } from './user';
export type APIInviteGuild = Pick<APIGuild, 'banner' | 'description' | 'features' | 'icon' | 'id' | 'name' | 'nsfw_level' | 'premium_subscription_count' | 'splash' | 'vanity_url_code' | 'verification_level'>;
/**
 * https://discord.com/developers/docs/resources/invite#invite-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIInvite {
    /**
     * The invite code (unique ID)
     */
    code: string;
    /**
     * The guild this invite is for
     *
     * See https://discord.com/developers/docs/resources/guild#guild-object
     */
    guild?: APIInviteGuild;
    /**
     * The channel this invite is for
     *
     * See https://discord.com/developers/docs/resources/channel#channel-object
     */
    channel: Required<APIPartialChannel> | null;
    /**
     * The user who created the invite
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    inviter?: APIUser;
    /**
     * The type of target for this voice channel invite
     *
     * See https://discord.com/developers/docs/resources/invite#invite-object-target-user-types
     */
    target_type?: InviteTargetType;
    /**
     * The user whose stream to display for this voice channel stream invite
     *
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    target_user?: APIUser;
    /**
     * The embedded application to open for this voice channel embedded application invite
     *
     * See https://discord.com/developers/docs/topics/oauth2#application
     */
    target_application?: Partial<APIApplication>;
    /**
     * Approximate count of online members, returned from the `GET /invites/<code>` endpoint when `with_counts` is `true`
     */
    approximate_presence_count?: number;
    /**
     * Approximate count of total members, returned from the `GET /invites/<code>` endpoint when `with_counts` is `true`
     */
    approximate_member_count?: number;
    /**
     * The expiration date of this invite, returned from the `GET /invites/<code>` endpoint when `with_expiration` is `true`
     */
    expires_at?: string | null;
    /**
     * The stage instance data if there is a public stage instance in the stage channel this invite is for
     */
    stage_instance?: APIInviteStageInstance;
    /**
     * The guild scheduled event data, returned from the `GET /invites/<code>` endpoint when `guild_scheduled_event_id` is a valid guild scheduled event id
     */
    guild_scheduled_event?: APIGuildScheduledEvent;
}
/**
 * https://discord.com/developers/docs/resources/invite#invite-object-invite-target-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum InviteTargetType {
    Stream = 1,
    EmbeddedApplication = 2
}
/**
 * https://discord.com/developers/docs/resources/invite#invite-metadata-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIExtendedInvite extends APIInvite {
    /**
     * Number of times this invite has been used
     */
    uses: number;
    /**
     * Max number of times this invite can be used
     */
    max_uses: number;
    /**
     * Duration (in seconds) after which the invite expires
     */
    max_age: number;
    /**
     * Whether this invite only grants temporary membership
     */
    temporary: boolean;
    /**
     * When this invite was created
     */
    created_at: string;
}
//# sourceMappingURL=invite.d.ts.map