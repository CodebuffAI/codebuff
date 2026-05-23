import type { InternalProvider, SignInPageErrorParam, Theme } from "../../types.js";
export default function SigninPage(props: {
    csrfToken?: string;
    providers?: InternalProvider[];
    callbackUrl?: string;
    email?: string;
    error?: SignInPageErrorParam;
    theme?: Theme;
}): import("preact").JSX.Element;
//# sourceMappingURL=signin.d.ts.map