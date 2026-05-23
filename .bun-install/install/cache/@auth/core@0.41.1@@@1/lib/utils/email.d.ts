import type { Theme } from "../../types.js";
/**
 * Email HTML body
 * Insert invisible space into domains from being turned into a hyperlink by email
 * clients like Outlook and Apple mail, as this is confusing because it seems
 * like they are supposed to click on it to sign in.
 *
 * @note We don't add the email address to avoid needing to escape it, if you do, remember to sanitize it!
 */
export declare function html(params: {
    url: string;
    host: string;
    theme: Theme;
}): string;
/** Email Text body (fallback for email clients that don't render HTML, e.g. feature phones) */
export declare function text({ url, host }: {
    url: string;
    host: string;
}): string;
//# sourceMappingURL=email.d.ts.map