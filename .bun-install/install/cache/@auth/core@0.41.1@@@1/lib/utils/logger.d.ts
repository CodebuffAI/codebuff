import type { WarningCode } from "../../warnings.js";
import type { AuthConfig } from "../../index.js";
/**
 * Override any of the methods, and the rest will use the default logger.
 *
 * [Documentation](https://authjs.dev/reference/core#authconfig#logger)
 */
export interface LoggerInstance extends Record<string, Function> {
    warn: (code: WarningCode) => void;
    error: (error: Error) => void;
    debug: (message: string, metadata?: unknown) => void;
}
/**
 * Override the built-in logger with user's implementation.
 * Any `undefined` level will use the default logger.
 */
export declare function setLogger(config: Pick<AuthConfig, "logger" | "debug">): LoggerInstance;
//# sourceMappingURL=logger.d.ts.map