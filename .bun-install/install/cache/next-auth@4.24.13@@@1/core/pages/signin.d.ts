/// <reference types="react" />
import type { InternalProvider, Theme } from "../types";
/**
 * The following errors are passed as error query parameters to the default or overridden sign-in page.
 *
 * [Documentation](https://next-auth.js.org/configuration/pages#sign-in-page) */
export declare type SignInErrorTypes = "Signin" | "OAuthSignin" | "OAuthCallback" | "OAuthCreateAccount" | "EmailCreateAccount" | "Callback" | "OAuthAccountNotLinked" | "EmailSignin" | "CredentialsSignin" | "SessionRequired" | "default";
export interface SignInServerPageParams {
    csrfToken: string;
    providers: InternalProvider[];
    callbackUrl: string;
    email: string;
    error: SignInErrorTypes;
    theme: Theme;
}
export default function SigninPage(props: SignInServerPageParams): JSX.Element;
//# sourceMappingURL=signin.d.ts.map