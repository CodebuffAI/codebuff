/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Mailgun</b> integration.</span>
 * <a href="https://www.mailgun.com/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/mailgun.svg" height="48" width="48"/>
 * </a>
 * </div>
 *
 * @module providers/mailgun
 */
import type { EmailConfig, EmailUserConfig } from "./index.js";
/**
 * Add Mailgun login to your page.
 *
 * ### Setup
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Mailgun from "@auth/core/providers/mailgun"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Mailgun({
 *       from: MAILGUN_DOMAIN,
 *       region: "EU", // Optional
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Mailgun documentation](https://documentation.mailgun.com/docs/mailgun)
 *
 * :::info **Disclaimer**
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 *
 * :::
 */
export default function MailGun(config: EmailUserConfig & {
    /**
     * https://documentation.mailgun.com/docs/mailgun/api-reference/#base-url
     *
     * @default "US"
     */
    region?: "US" | "EU";
}): EmailConfig;
//# sourceMappingURL=mailgun.d.ts.map