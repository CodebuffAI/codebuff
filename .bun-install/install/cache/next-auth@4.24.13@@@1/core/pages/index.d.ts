import type { InternalOptions } from "../types";
import type { RequestInternal, ResponseInternal } from "..";
import type { Cookie } from "../lib/cookie";
import type { ErrorType } from "./error";
declare type RenderPageParams = {
    query?: RequestInternal["query"];
    cookies?: Cookie[];
} & Partial<Pick<InternalOptions, "url" | "callbackUrl" | "csrfToken" | "providers" | "theme">>;
/**
 * Unless the user defines their [own pages](https://next-auth.js.org/configuration/pages),
 * we render a set of default ones, using Preact SSR.
 */
export default function renderPage(params: RenderPageParams): {
    signin(props?: any): ResponseInternal<any>;
    signout(props?: any): ResponseInternal<any>;
    verifyRequest(props?: any): ResponseInternal<any>;
    error(props?: {
        error?: ErrorType;
    }): ResponseInternal<any>;
};
export {};
//# sourceMappingURL=index.d.ts.map