/**
 * @see [Vipps Login API](https://developer.vippsmobilepay.com/docs/APIs/login-api/api-guide)
 *
 * ## Example
 *
 * ```ts
 * import Vipps from "@auth/core/providers/vipps"
 * ...
 * providers: [
 *  Vipps({
 *    clientId: process.env.AUTH_VIPPS_ID,
 *    clientSecret: process.env.AUTH_VIPPS_SECRET,
 *  })
 * ]
 * ...
 * ```
 * ::: note
 * If you're testing, make sure to override the issuer option with apitest.vipps.no
 * :::
 */
export default function Vipps(options) {
    return {
        id: "vipps",
        name: "Vipps",
        type: "oidc",
        issuer: "https://api.vipps.no/access-management-1.0/access/",
        authorization: { params: { scope: "openid name email" } },
        idToken: false,
        style: { brandColor: "#f05c18" },
        checks: ["pkce", "state", "nonce"],
        options,
    };
}
