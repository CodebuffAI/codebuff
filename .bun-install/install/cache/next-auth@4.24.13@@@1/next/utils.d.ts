import { Cookie } from "../core/lib/cookie";
import { type ResponseInternal } from "../core";
export declare function setCookie(res: any, cookie: Cookie): void;
export declare function getBody(req: Request): Promise<Record<string, any> | undefined>;
export declare function toResponse(res: ResponseInternal): Response;
//# sourceMappingURL=utils.d.ts.map