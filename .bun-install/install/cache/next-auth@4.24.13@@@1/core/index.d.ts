import type { AuthAction, AuthOptions } from "./types";
import type { Cookie } from "./lib/cookie";
export interface RequestInternal {
    /** @default "http://localhost:3000" */
    origin?: string;
    method?: string;
    cookies?: Partial<Record<string, string>>;
    headers?: Record<string, any>;
    query?: Record<string, any>;
    body?: Record<string, any>;
    action: AuthAction;
    providerId?: string;
    error?: string;
}
export interface NextAuthHeader {
    key: string;
    value: string;
}
export interface ResponseInternal<Body extends string | Record<string, any> | any[] = any> {
    status?: number;
    headers?: NextAuthHeader[];
    body?: Body;
    redirect?: string;
    cookies?: Cookie[];
}
export interface NextAuthHandlerParams {
    req: Request | RequestInternal;
    options: AuthOptions;
}
export declare function AuthHandler<Body extends string | Record<string, any> | any[]>(params: NextAuthHandlerParams): Promise<ResponseInternal<Body>>;
//# sourceMappingURL=index.d.ts.map