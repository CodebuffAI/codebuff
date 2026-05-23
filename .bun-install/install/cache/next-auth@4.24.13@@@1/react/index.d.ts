import * as React from "react";
import { Session } from "..";
import { CtxOrReq } from "../client/_utils";
import type { ClientSafeProvider, LiteralUnion, SessionProviderProps, SignInAuthorizationParams, SignInOptions, SignInResponse, SignOutParams, SignOutResponse, UseSessionOptions } from "./types";
import type { BuiltInProviderType, RedirectableProviderType } from "../providers";
export * from "./types";
declare type UpdateSession = (data?: any) => Promise<Session | null>;
export declare type SessionContextValue<R extends boolean = false> = R extends true ? {
    update: UpdateSession;
    data: Session;
    status: "authenticated";
} | {
    update: UpdateSession;
    data: null;
    status: "loading";
} : {
    update: UpdateSession;
    data: Session;
    status: "authenticated";
} | {
    update: UpdateSession;
    data: null;
    status: "unauthenticated" | "loading";
};
export declare const SessionContext: React.Context<{
    update: UpdateSession;
    data: Session;
    status: "authenticated";
} | {
    update: UpdateSession;
    data: null;
    status: "unauthenticated" | "loading";
} | undefined>;
/**
 * React Hook that gives you access
 * to the logged in user's session data.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#usesession)
 */
export declare function useSession<R extends boolean>(options?: UseSessionOptions<R>): SessionContextValue<R>;
export declare type GetSessionParams = CtxOrReq & {
    event?: "storage" | "timer" | "hidden" | string;
    triggerEvent?: boolean;
    broadcast?: boolean;
};
export declare function getSession(params?: GetSessionParams): Promise<Session | null>;
/**
 * Returns the current Cross Site Request Forgery Token (CSRF Token)
 * required to make POST requests (e.g. for signing in and signing out).
 * You likely only need to use this if you are not using the built-in
 * `signIn()` and `signOut()` methods.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#getcsrftoken)
 */
export declare function getCsrfToken(params?: CtxOrReq): Promise<string | undefined>;
/**
 * It calls `/api/auth/providers` and returns
 * a list of the currently configured authentication providers.
 * It can be useful if you are creating a dynamic custom sign in page.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#getproviders)
 */
export declare function getProviders(): Promise<Record<LiteralUnion<BuiltInProviderType, string>, ClientSafeProvider> | null>;
/**
 * Client-side method to initiate a signin flow
 * or send the user to the signin page listing all possible providers.
 * Automatically adds the CSRF token to the request.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#signin)
 */
export declare function signIn<P extends RedirectableProviderType | undefined = undefined>(provider?: LiteralUnion<P extends RedirectableProviderType ? P | BuiltInProviderType : BuiltInProviderType>, options?: SignInOptions, authorizationParams?: SignInAuthorizationParams): Promise<P extends RedirectableProviderType ? SignInResponse | undefined : undefined>;
/**
 * Signs the user out, by removing the session cookie.
 * Automatically adds the CSRF token to the request.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#signout)
 */
export declare function signOut<R extends boolean = true>(options?: SignOutParams<R>): Promise<R extends true ? undefined : SignOutResponse>;
/**
 * Provider to wrap the app in to make session data available globally.
 * Can also be used to throttle the number of requests to the endpoint
 * `/api/auth/session`.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#sessionprovider)
 */
export declare function SessionProvider(props: SessionProviderProps): JSX.Element;
//# sourceMappingURL=index.d.ts.map