import type { Client } from "openid-client";
import type { InternalOptions } from "../../types";
/**
 * NOTE: We can add auto discovery of the provider's endpoint
 * that requires only one endpoint to be specified by the user.
 * Check out `Issuer.discover`
 *
 * Client supporting OAuth 2.x and OIDC
 */
export declare function openidClient(options: InternalOptions<"oauth">): Promise<Client>;
//# sourceMappingURL=client.d.ts.map