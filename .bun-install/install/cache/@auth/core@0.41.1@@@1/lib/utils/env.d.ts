import type { AuthAction } from "../../types.js";
import type { AuthConfig } from "../../index.js";
/**
 *  Set default env variables on the config object
 * @param suppressWarnings intended for framework authors.
 */
export declare function setEnvDefaults(envObject: any, config: AuthConfig, suppressBasePathWarning?: boolean): void;
export declare function createActionURL(action: AuthAction, protocol: string, headers: Headers, envObject: any, config: Pick<AuthConfig, "basePath" | "logger">): URL;
//# sourceMappingURL=env.d.ts.map