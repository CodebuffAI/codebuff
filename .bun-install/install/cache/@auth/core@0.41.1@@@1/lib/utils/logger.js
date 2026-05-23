import { AuthError } from "../../errors.js";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const grey = "\x1b[90m";
const reset = "\x1b[0m";
const defaultLogger = {
    error(error) {
        const name = error instanceof AuthError ? error.type : error.name;
        console.error(`${red}[auth][error]${reset} ${name}: ${error.message}`);
        if (error.cause &&
            typeof error.cause === "object" &&
            "err" in error.cause &&
            error.cause.err instanceof Error) {
            const { err, ...data } = error.cause;
            console.error(`${red}[auth][cause]${reset}:`, err.stack);
            if (data)
                console.error(`${red}[auth][details]${reset}:`, JSON.stringify(data, null, 2));
        }
        else if (error.stack) {
            console.error(error.stack.replace(/.*/, "").substring(1));
        }
    },
    warn(code) {
        const url = `https://warnings.authjs.dev`;
        console.warn(`${yellow}[auth][warn][${code}]${reset}`, `Read more: ${url}`);
    },
    debug(message, metadata) {
        console.log(`${grey}[auth][debug]:${reset} ${message}`, JSON.stringify(metadata, null, 2));
    },
};
/**
 * Override the built-in logger with user's implementation.
 * Any `undefined` level will use the default logger.
 */
export function setLogger(config) {
    const newLogger = {
        ...defaultLogger,
    };
    // Turn off debug logging if `debug` isn't set to `true`
    if (!config.debug)
        newLogger.debug = () => { };
    if (config.logger?.error)
        newLogger.error = config.logger.error;
    if (config.logger?.warn)
        newLogger.warn = config.logger.warn;
    if (config.logger?.debug)
        newLogger.debug = config.logger.debug;
    config.logger ?? (config.logger = newLogger);
    return newLogger;
}
