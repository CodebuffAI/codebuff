import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "preact/jsx-runtime";
import { webauthnScript } from "../utils/webauthn-client.js";
const signinErrors = {
    default: "Unable to sign in.",
    Signin: "Try signing in with a different account.",
    OAuthSignin: "Try signing in with a different account.",
    OAuthCallbackError: "Try signing in with a different account.",
    OAuthCreateAccount: "Try signing in with a different account.",
    EmailCreateAccount: "Try signing in with a different account.",
    Callback: "Try signing in with a different account.",
    OAuthAccountNotLinked: "To confirm your identity, sign in with the same account you used originally.",
    EmailSignin: "The e-mail could not be sent.",
    CredentialsSignin: "Sign in failed. Check the details you provided are correct.",
    SessionRequired: "Please sign in to access this page.",
};
function ConditionalUIScript(providerID) {
    const startConditionalUIScript = `
const currentURL = window.location.href;
const authURL = currentURL.substring(0, currentURL.lastIndexOf('/'));
(${webauthnScript})(authURL, "${providerID}");
`;
    return (_jsx(_Fragment, { children: _jsx("script", { dangerouslySetInnerHTML: { __html: startConditionalUIScript } }) }));
}
export default function SigninPage(props) {
    const { csrfToken, providers = [], callbackUrl, theme, email, error: errorType, } = props;
    if (typeof document !== "undefined" && theme?.brandColor) {
        document.documentElement.style.setProperty("--brand-color", theme.brandColor);
    }
    if (typeof document !== "undefined" && theme?.buttonText) {
        document.documentElement.style.setProperty("--button-text-color", theme.buttonText);
    }
    const error = errorType && (signinErrors[errorType] ?? signinErrors.default);
    const providerLogoPath = "https://authjs.dev/img/providers";
    const conditionalUIProviderID = providers.find((provider) => provider.type === "webauthn" && provider.enableConditionalUI)?.id;
    return (_jsxs("div", { className: "signin", children: [theme?.brandColor && (_jsx("style", { dangerouslySetInnerHTML: {
                    __html: `:root {--brand-color: ${theme.brandColor}}`,
                } })), theme?.buttonText && (_jsx("style", { dangerouslySetInnerHTML: {
                    __html: `
        :root {
          --button-text-color: ${theme.buttonText}
        }
      `,
                } })), _jsxs("div", { className: "card", children: [error && (_jsx("div", { className: "error", children: _jsx("p", { children: error }) })), theme?.logo && _jsx("img", { src: theme.logo, alt: "Logo", className: "logo" }), providers.map((provider, i) => {
                        let bg, brandColor, logo;
                        if (provider.type === "oauth" || provider.type === "oidc") {
                            ;
                            ({
                                bg = "#fff",
                                brandColor,
                                logo = `${providerLogoPath}/${provider.id}.svg`,
                            } = provider.style ?? {});
                        }
                        const color = brandColor ?? bg ?? "#fff";
                        return (_jsxs("div", { className: "provider", children: [provider.type === "oauth" || provider.type === "oidc" ? (_jsxs("form", { action: provider.signinUrl, method: "POST", children: [_jsx("input", { type: "hidden", name: "csrfToken", value: csrfToken }), callbackUrl && (_jsx("input", { type: "hidden", name: "callbackUrl", value: callbackUrl })), _jsxs("button", { type: "submit", className: "button", style: {
                                                "--provider-brand-color": color,
                                            }, tabIndex: 0, children: [_jsxs("span", { style: {
                                                        filter: "invert(1) grayscale(1) brightness(1.3) contrast(9000)",
                                                        "mix-blend-mode": "luminosity",
                                                        opacity: 0.95,
                                                    }, children: ["Sign in with ", provider.name] }), logo && _jsx("img", { loading: "lazy", height: 24, src: logo })] })] })) : null, (provider.type === "email" ||
                                    provider.type === "credentials" ||
                                    provider.type === "webauthn") &&
                                    i > 0 &&
                                    providers[i - 1].type !== "email" &&
                                    providers[i - 1].type !== "credentials" &&
                                    providers[i - 1].type !== "webauthn" && _jsx("hr", {}), provider.type === "email" && (_jsxs("form", { action: provider.signinUrl, method: "POST", children: [_jsx("input", { type: "hidden", name: "csrfToken", value: csrfToken }), _jsx("label", { className: "section-header", htmlFor: `input-email-for-${provider.id}-provider`, children: "Email" }), _jsx("input", { id: `input-email-for-${provider.id}-provider`, autoFocus: true, type: "email", name: "email", value: email, placeholder: "email@example.com", required: true }), _jsxs("button", { id: "submitButton", type: "submit", tabIndex: 0, children: ["Sign in with ", provider.name] })] })), provider.type === "credentials" && (_jsxs("form", { action: provider.callbackUrl, method: "POST", children: [_jsx("input", { type: "hidden", name: "csrfToken", value: csrfToken }), Object.keys(provider.credentials).map((credential) => {
                                            return (_jsxs("div", { children: [_jsx("label", { className: "section-header", htmlFor: `input-${credential}-for-${provider.id}-provider`, children: provider.credentials[credential].label ?? credential }), _jsx("input", { name: credential, id: `input-${credential}-for-${provider.id}-provider`, type: provider.credentials[credential].type ?? "text", placeholder: provider.credentials[credential].placeholder ?? "", ...provider.credentials[credential] })] }, `input-group-${provider.id}`));
                                        }), _jsxs("button", { id: "submitButton", type: "submit", tabIndex: 0, children: ["Sign in with ", provider.name] })] })), provider.type === "webauthn" && (_jsxs("form", { action: provider.callbackUrl, method: "POST", id: `${provider.id}-form`, children: [_jsx("input", { type: "hidden", name: "csrfToken", value: csrfToken }), Object.keys(provider.formFields).map((field) => {
                                            return (_jsxs("div", { children: [_jsx("label", { className: "section-header", htmlFor: `input-${field}-for-${provider.id}-provider`, children: provider.formFields[field].label ?? field }), _jsx("input", { name: field, "data-form-field": true, id: `input-${field}-for-${provider.id}-provider`, type: provider.formFields[field].type ?? "text", placeholder: provider.formFields[field].placeholder ?? "", ...provider.formFields[field] })] }, `input-group-${provider.id}`));
                                        }), _jsxs("button", { id: `submitButton-${provider.id}`, type: "submit", tabIndex: 0, children: ["Sign in with ", provider.name] })] })), (provider.type === "email" ||
                                    provider.type === "credentials" ||
                                    provider.type === "webauthn") &&
                                    i + 1 < providers.length && _jsx("hr", {})] }, provider.id));
                    })] }), conditionalUIProviderID && ConditionalUIScript(conditionalUIProviderID)] }));
}
