import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { CommonProviderOptions, CredentialInput } from "./index.js";
import type { GenerateRegistrationOptionsOpts, GenerateAuthenticationOptionsOpts, VerifyAuthenticationResponseOpts, VerifyRegistrationResponseOpts } from "@simplewebauthn/server";
import type { InternalOptions, RequestInternal, SemverString, User } from "../types.js";
export type WebAuthnProviderType = "webauthn";
export declare const DEFAULT_WEBAUTHN_TIMEOUT: number;
export declare const DEFAULT_SIMPLEWEBAUTHN_BROWSER_VERSION: SemverString;
export type RelayingParty = {
    /** Relaying Party ID. Use the website's domain name. */
    id: string;
    /** Relaying Party name. Use the website's name. */
    name: string;
    /** Relaying Party origin. Use the website's origin. */
    origin: string;
};
type RelayingPartyArray = {
    /** Relaying Party ID. Use the website's domain name. */
    id: string | string[];
    /** Relaying Party name. Use the website's name. */
    name: string | string[];
    /** Relaying Party origin. Use the website's origin. */
    origin: string | string[];
};
export type GetUserInfo = (options: InternalOptions<WebAuthnProviderType>, request: RequestInternal) => Promise<{
    user: User;
    exists: true;
} | {
    user: Omit<User, "id">;
    exists: false;
} | null>;
type ConfigurableAuthenticationOptions = Omit<GenerateAuthenticationOptionsOpts, "rpID" | "allowCredentials" | "challenge">;
type ConfigurableRegistrationOptions = Omit<GenerateRegistrationOptionsOpts, "rpName" | "rpID" | "userID" | "userName" | "challenge" | "userDisplayName" | "excludeCredentials">;
type ConfigurableVerifyAuthenticationOptions = Omit<VerifyAuthenticationResponseOpts, "expectedChallenge" | "expectedOrigin" | "expectedRPID" | "authenticator" | "response">;
type ConfigurableVerifyRegistrationOptions = Omit<VerifyRegistrationResponseOpts, "expectedChallenge" | "expectedOrigin" | "expectedRPID" | "response">;
export interface WebAuthnConfig extends CommonProviderOptions {
    type: WebAuthnProviderType;
    /**
     * Relaying party (RP) configuration
     *
     * If not provided, the request URL will be used.
     **/
    relayingParty?: Partial<RelayingPartyArray>;
    /**
     * Function that returns the relaying party for the current request.
     */
    getRelayingParty: (options: InternalOptions<WebAuthnProviderType>, request: RequestInternal) => RelayingParty;
    /**
     * Enable conditional UI.
     *
     * NOTE: Only one provider can have this option enabled at a time. Defaults to `true`.
     */
    enableConditionalUI: boolean;
    /**
     * Version of SimpleWebAuthn browser script to load in the sign in page.
     *
     * This is only loaded if the provider has conditional UI enabled. If set to false, it won't load any script.
     * Defaults to `v9.0.0`.
     */
    simpleWebAuthnBrowserVersion: SemverString | false;
    /** Form fields displayed in the default Passkey sign in/up form.
     * These are not validated or enforced beyond the default Auth.js authentication page.
     *
     * By default it displays an email field.
     */
    formFields: Record<string, CredentialInput>;
    /**
     * Authentication options that are passed to @simplewebauthn during authentication.
     */
    authenticationOptions?: Partial<ConfigurableAuthenticationOptions>;
    /**
     * Registration options that are passed to @simplewebauthn during registration.
     */
    registrationOptions: Partial<ConfigurableRegistrationOptions>;
    /**
     * Verify Authentication options that are passed to @simplewebauthn during authentication.
     */
    verifyAuthenticationOptions?: Partial<ConfigurableVerifyAuthenticationOptions>;
    /**
     * Verify Registration options that are passed to @simplewebauthn during registration.
     */
    verifyRegistrationOptions?: Partial<ConfigurableVerifyRegistrationOptions>;
    /**
     * Function that returns the user info that the authenticator will use during registration and authentication.
     *
     * - It accepts the provider options, the request object, and returns the user info.
     * - If the request contains an existing user's data (e.g. email address), the function must return the existing user and `exists` must be `true`.
     * - If the request contains enough information to create a new user, the function must return a new user info and `exists` must be `false`.
     * - If the request does not contain enough information to create a new user, the function must return `null`.
     *
     * It should not have any side effects (i.e. it shall not modify the database).
     *
     * During passkey creation:
     *  - The passkey's user ID will be a random string.
     *  - The passkey's user name will be user.email
     *  - The passkey's user display name will be user.name, if present, or user.email
     *
     * By default, it looks for and uses the "email" request parameter to look up the user in the database.
     */
    getUserInfo: GetUserInfo;
    /** SimpleWebAuthn instance to use for registration and authentication. */
    simpleWebAuthn: {
        verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
        verifyRegistrationResponse: typeof verifyRegistrationResponse;
        generateAuthenticationOptions: typeof generateAuthenticationOptions;
        generateRegistrationOptions: typeof generateRegistrationOptions;
    };
}
/**
 * Add WebAuthn login to your page.
 *
 * ### Setup
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import WebAuthn from "@auth/core/providers/webauthn"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [WebAuthn],
 * })
 * ```
 * ### Resources
 *
 * - [SimpleWebAuthn - Server side](https://simplewebauthn.dev/docs/packages/server)
 * - [SimpleWebAuthn - Client side](https://simplewebauthn.dev/docs/packages/client)
 * - [Source code](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/webauthn.ts)
 *
 * :::tip
 *
 * The WebAuthn provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/webauthn.ts).
 * To override the defaults for your use case, check out [customizing the built-in WebAuthn provider](https://authjs.dev/guides/configuring-oauth-providers).
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
export default function WebAuthn(config: Partial<WebAuthnConfig>): WebAuthnConfig;
export {};
//# sourceMappingURL=webauthn.d.ts.map