import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
/** Renders an error page. */
export default function ErrorPage(props) {
    const { url, error = "default", theme } = props;
    const signinPageUrl = `${url}/signin`;
    const errors = {
        default: {
            status: 200,
            heading: "Error",
            message: (_jsx("p", { children: _jsx("a", { className: "site", href: url?.origin, children: url?.host }) })),
        },
        Configuration: {
            status: 500,
            heading: "Server error",
            message: (_jsxs("div", { children: [_jsx("p", { children: "There is a problem with the server configuration." }), _jsx("p", { children: "Check the server logs for more information." })] })),
        },
        AccessDenied: {
            status: 403,
            heading: "Access Denied",
            message: (_jsxs("div", { children: [_jsx("p", { children: "You do not have permission to sign in." }), _jsx("p", { children: _jsx("a", { className: "button", href: signinPageUrl, children: "Sign in" }) })] })),
        },
        Verification: {
            status: 403,
            heading: "Unable to sign in",
            message: (_jsxs("div", { children: [_jsx("p", { children: "The sign in link is no longer valid." }), _jsx("p", { children: "It may have been used already or it may have expired." })] })),
            signin: (_jsx("a", { className: "button", href: signinPageUrl, children: "Sign in" })),
        },
    };
    const { status, heading, message, signin } = errors[error] ?? errors.default;
    return {
        status,
        html: (_jsxs("div", { className: "error", children: [theme?.brandColor && (_jsx("style", { dangerouslySetInnerHTML: {
                        __html: `
        :root {
          --brand-color: ${theme?.brandColor}
        }
      `,
                    } })), _jsxs("div", { className: "card", children: [theme?.logo && _jsx("img", { src: theme?.logo, alt: "Logo", className: "logo" }), _jsx("h1", { children: heading }), _jsx("div", { className: "message", children: message }), signin] })] })),
    };
}
