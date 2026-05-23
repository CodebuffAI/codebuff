/**
 * Add Discord login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/discord
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Discord from "@auth/core/providers/discord"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Discord({
 *       clientId: DISCORD_CLIENT_ID,
 *       clientSecret: DISCORD_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Discord OAuth documentation](https://discord.com/developers/docs/topics/oauth2)
 *  - [Discord OAuth apps](https://discord.com/developers/applications)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Discord provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Discord provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/discord.ts).
 * To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * :::
 *
 * :::info **Disclaimer**
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 *
 * :::
 */
export default function Discord(options) {
    return {
        id: "discord",
        name: "Discord",
        type: "oauth",
        authorization: {
            url: "https://discord.com/api/oauth2/authorize",
            params: { scope: "identify email" },
        },
        token: "https://discord.com/api/oauth2/token",
        userinfo: "https://discord.com/api/users/@me",
        profile(profile) {
            if (profile.avatar === null) {
                const defaultAvatarNumber = profile.discriminator === "0"
                    ? Number(BigInt(profile.id) >> BigInt(22)) % 6
                    : parseInt(profile.discriminator) % 5;
                profile.image_url = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
            }
            else {
                const format = profile.avatar.startsWith("a_") ? "gif" : "png";
                profile.image_url = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
            }
            return {
                id: profile.id,
                name: profile.global_name ?? profile.username,
                email: profile.email,
                image: profile.image_url,
            };
        },
        style: { bg: "#5865F2", text: "#fff" },
        options,
    };
}
