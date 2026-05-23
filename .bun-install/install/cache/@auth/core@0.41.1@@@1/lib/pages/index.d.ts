import type { InternalOptions, RequestInternal, ResponseInternal, InternalProvider, PublicProvider } from "../../types.js";
import type { Cookie } from "../utils/cookie.js";
type RenderPageParams = {
    query?: RequestInternal["query"];
    cookies?: Cookie[];
} & Partial<Pick<InternalOptions, "url" | "callbackUrl" | "csrfToken" | "providers" | "theme" | "pages">>;
/**
 * Unless the user defines their [own pages](https://authjs.dev/reference/core#pages),
 * we render a set of default ones, using Preact SSR.
 */
export default function renderPage(params: RenderPageParams): {
    csrf(skip: boolean, options: InternalOptions, cookies: Cookie[]): {
        headers: {
            "Content-Type": string;
            "Cache-Control": string;
            Expires: string;
            Pragma: string;
        };
        body: {
            csrfToken: string | undefined;
        };
        cookies: Cookie[];
        status?: undefined;
    } | {
        status: number;
        cookies: Cookie[];
        headers?: undefined;
        body?: undefined;
    };
    providers(providers: InternalProvider[]): {
        headers: {
            "Content-Type": string;
        };
        body: Record<string, PublicProvider>;
    };
    signin(providerId?: string, error?: any): ResponseInternal<any>;
    signout(): ResponseInternal<any>;
    verifyRequest(props?: any): ResponseInternal<any>;
    error(error?: string): ResponseInternal<any>;
};
export {};
//# sourceMappingURL=index.d.ts.map