/// <reference types="node" />
import type { IncomingMessage } from "http";
import type { LoggerInstance, Session } from "..";
export interface AuthClientConfig {
    baseUrl: string;
    basePath: string;
    baseUrlServer: string;
    basePathServer: string;
    /** Stores last session response */
    _session?: Session | null | undefined;
    /** Used for timestamp since last sycned (in seconds) */
    _lastSync: number;
    /**
     * Stores the `SessionProvider`'s session update method to be able to
     * trigger session updates from places like `signIn` or `signOut`
     */
    _getSession: (...args: any[]) => any;
}
export interface CtxOrReq {
    req?: Partial<IncomingMessage> & {
        body?: any;
    };
    ctx?: {
        req: Partial<IncomingMessage> & {
            body?: any;
        };
    };
}
/**
 * If passed 'appContext' via getInitialProps() in _app.js
 * then get the req object from ctx and use that for the
 * req value to allow `fetchData` to
 * work seemlessly in getInitialProps() on server side
 * pages *and* in _app.js.
 */
export declare function fetchData<T = any>(path: string, __NEXTAUTH: AuthClientConfig, logger: LoggerInstance, { ctx, req }?: CtxOrReq): Promise<T | null>;
export declare function apiBaseUrl(__NEXTAUTH: AuthClientConfig): string;
/** Returns the number of seconds elapsed since January 1, 1970 00:00:00 UTC. */
export declare function now(): number;
export interface BroadcastMessage {
    event?: "session";
    data?: {
        trigger?: "signout" | "getSession";
    };
    clientId: string;
    timestamp: number;
}
/**
 * Inspired by [Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
 * Only not using it directly, because Safari does not support it.
 *
 * https://caniuse.com/?search=broadcastchannel
 */
export declare function BroadcastChannel(name?: string): {
    /** Get notified by other tabs/windows. */
    receive(onReceive: (message: BroadcastMessage) => void): () => void;
    /** Notify other tabs/windows. */
    post(message: Record<string, unknown>): void;
};
//# sourceMappingURL=_utils.d.ts.map