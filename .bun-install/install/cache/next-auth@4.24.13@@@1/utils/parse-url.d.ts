export interface InternalUrl {
    /** @default "http://localhost:3000" */
    origin: string;
    /** @default "localhost:3000" */
    host: string;
    /** @default "/api/auth" */
    path: string;
    /** @default "http://localhost:3000/api/auth" */
    base: string;
    /** @default "http://localhost:3000/api/auth" */
    toString: () => string;
}
/** Returns an `URL` like object to make requests/redirects from server-side */
export default function parseUrl(url?: string): InternalUrl;
//# sourceMappingURL=parse-url.d.ts.map