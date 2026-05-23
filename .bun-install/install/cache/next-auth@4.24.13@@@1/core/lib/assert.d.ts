import { MissingAdapter, MissingAPIRoute, MissingAuthorize, MissingSecret, UnsupportedStrategy } from "../errors";
import type { RequestInternal } from "..";
import type { WarningCode } from "../../utils/logger";
import type { AuthOptions } from "../types";
declare type ConfigError = MissingAPIRoute | MissingSecret | UnsupportedStrategy | MissingAuthorize | MissingAdapter;
/**
 * Verify that the user configured `next-auth` correctly.
 * Good place to mention deprecations as well.
 *
 * REVIEW: Make some of these and corresponding docs less Next.js specific?
 */
export declare function assertConfig(params: {
    options: AuthOptions;
    req: RequestInternal;
}): ConfigError | WarningCode[];
export {};
//# sourceMappingURL=assert.d.ts.map