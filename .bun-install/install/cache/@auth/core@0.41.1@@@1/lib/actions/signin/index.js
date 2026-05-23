import { getAuthorizationUrl } from "./authorization-url.js";
import { sendToken } from "./send-token.js";
export async function signIn(request, cookies, options) {
    const signInUrl = `${options.url.origin}${options.basePath}/signin`;
    if (!options.provider)
        return { redirect: signInUrl, cookies };
    switch (options.provider.type) {
        case "oauth":
        case "oidc": {
            const { redirect, cookies: authCookies } = await getAuthorizationUrl(request.query, options);
            if (authCookies)
                cookies.push(...authCookies);
            return { redirect, cookies };
        }
        case "email": {
            const response = await sendToken(request, options);
            return { ...response, cookies };
        }
        default:
            return { redirect: signInUrl, cookies };
    }
}
