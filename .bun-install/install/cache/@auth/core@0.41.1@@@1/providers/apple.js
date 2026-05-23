/**
 * <div class="provider" style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
 * <span style={{fontSize: "1.35rem" }}>
 *  Built-in sign in with <b>Apple</b> integration.
 * </span>
 * <a href="https://apple.com" style={{backgroundColor: "black", padding: "12px", borderRadius: "100%" }}>
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/apple.svg" width="24"/>
 * </a>
 * </div>
 *
 * @module providers/apple
 */
import { conformInternal, customFetch } from "../lib/symbols.js";
/**
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/auth/callback/apple
 * ```
 *
 * #### Configuration
 * ```ts
 * import Apple from "@auth/core/providers/apple"
 * ...
 * providers: [
 *   Apple({
 *     clientId: env.AUTH_APPLE_ID,
 *     clientSecret: env.AUTH_APPLE_SECRET,
 *   })
 * ]
 * ...
 * ```
 *
 * ### Resources
 *
 * - Sign in with Apple [Overview](https://developer.apple.com/sign-in-with-apple/get-started/)
 * - Sign in with Apple [REST API](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api)
 * - [How to retrieve](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/authenticating_users_with_sign_in_with_apple#3383773) the user's information from Apple ID servers
 * - [Learn more about OAuth](https://authjs.dev/concepts/oauth)
 * - [Creating the Client Secret](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret)
 *
 * ### Notes
 *
 * - Apple does not support localhost/http URLs. You can only use a live URL with HTTPS.
 * - Apple requires the client secret to be a JWT. We provide a CLI command `npx auth add apple`, to help you generate one.
 *   This will prompt you for the necessary information and at the end it will add the `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET` to your `.env` file.
 * - Apple provides minimal user information. It returns the user's email and name, but only the first time the user consents to the app.
 * - The Apple provider does not support setting up the same client for multiple deployments (like [preview deployments](https://authjs.dev/getting-started/deployment#securing-a-preview-deployment)).
 * - The Apple provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/apple.ts). To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * ## Help
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 */
export default function Apple(config) {
    return {
        id: "apple",
        name: "Apple",
        type: "oidc",
        issuer: "https://appleid.apple.com",
        authorization: {
            params: {
                scope: "name email", // https://developer.apple.com/documentation/sign_in_with_apple/clientconfigi/3230955-scope
                response_mode: "form_post",
            },
        },
        // We need to parse the special `user` parameter the first time the user consents to the app.
        // It adds the `name` object to the `profile`, with `firstName` and `lastName` fields.
        [conformInternal]: true,
        profile(profile) {
            const name = profile.user
                ? `${profile.user.name.firstName} ${profile.user.name.lastName}`
                : profile.email;
            return {
                id: profile.sub,
                name: name,
                email: profile.email,
                image: null,
            };
        },
        // Apple does not provide a userinfo endpoint.
        async [customFetch](...args) {
            const url = new URL(args[0] instanceof Request ? args[0].url : args[0]);
            if (url.pathname.endsWith(".well-known/openid-configuration")) {
                const response = await fetch(...args);
                const json = await response.clone().json();
                return Response.json({
                    ...json,
                    userinfo_endpoint: "https://appleid.apple.com/fake_endpoint",
                });
            }
            return fetch(...args);
        },
        client: { token_endpoint_auth_method: "client_secret_post" },
        style: { text: "#fff", bg: "#000" },
        checks: ["nonce", "state"],
        options: config,
    };
}
