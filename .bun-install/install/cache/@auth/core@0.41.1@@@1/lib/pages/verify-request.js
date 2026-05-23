import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
export default function VerifyRequestPage(props) {
    const { url, theme } = props;
    return (_jsxs("div", { className: "verify-request", children: [theme.brandColor && (_jsx("style", { dangerouslySetInnerHTML: {
                    __html: `
        :root {
          --brand-color: ${theme.brandColor}
        }
      `,
                } })), _jsxs("div", { className: "card", children: [theme.logo && _jsx("img", { src: theme.logo, alt: "Logo", className: "logo" }), _jsx("h1", { children: "Check your email" }), _jsx("p", { children: "A sign in link has been sent to your email address." }), _jsx("p", { children: _jsx("a", { className: "site", href: url.origin, children: url.host }) })] })] }));
}
