import type { InternalProvider } from "../../types.js";
import { type AuthConfig } from "../../index.js";
/**
 * Adds `signinUrl` and `callbackUrl` to each provider
 * and deep merge user-defined options.
 */
export default function parseProviders(params: {
    url: URL;
    providerId?: string;
    config: AuthConfig;
}): {
    providers: InternalProvider[];
    provider?: InternalProvider;
};
export declare function isOIDCProvider(provider: InternalProvider<"oidc" | "oauth">): provider is InternalProvider<"oidc">;
export declare function isOAuth2Provider(provider: InternalProvider<"oidc" | "oauth">): provider is InternalProvider<"oauth">;
/** Either OAuth 2 or OIDC */
export declare function isOAuthProvider(provider: InternalProvider<any>): provider is InternalProvider<"oauth" | "oidc">;
//# sourceMappingURL=providers.d.ts.map