import type { AuthOptions } from "../..";
import type { InternalOptions } from "../types";
import type { InternalUrl } from "../../utils/parse-url";
/**
 * Takes a number in seconds and returns the date in the future.
 * Optionally takes a second date parameter. In that case
 * the date in the future will be calculated from that date instead of now.
 */
export declare function fromDate(time: number, date?: number): Date;
export declare function hashToken(token: string, options: InternalOptions<"email">): string;
/**
 * Secret used salt cookies and tokens (e.g. for CSRF protection).
 * If no secret option is specified then it creates one on the fly
 * based on options passed here. If options contains unique data, such as
 * OAuth provider secrets and database credentials it should be sufficent. If no secret provided in production, we throw an error. */
export declare function createSecret(params: {
    authOptions: AuthOptions;
    url: InternalUrl;
}): string;
//# sourceMappingURL=utils.d.ts.map