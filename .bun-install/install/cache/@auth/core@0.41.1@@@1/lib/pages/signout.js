import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
export default function SignoutPage(props) {
    const { url, csrfToken, theme } = props;
    return (_jsxs("div", { className: "signout", children: [theme?.brandColor && (_jsx("style", { dangerouslySetInnerHTML: {
                    __html: `
        :root {
          --brand-color: ${theme.brandColor}
        }
      `,
                } })), theme?.buttonText && (_jsx("style", { dangerouslySetInnerHTML: {
                    __html: `
        :root {
          --button-text-color: ${theme.buttonText}
        }
      `,
                } })), _jsxs("div", { className: "card", children: [theme?.logo && _jsx("img", { src: theme.logo, alt: "Logo", className: "logo" }), _jsx("h1", { children: "Signout" }), _jsx("p", { children: "Are you sure you want to sign out?" }), _jsxs("form", { action: url?.toString(), method: "POST", children: [_jsx("input", { type: "hidden", name: "csrfToken", value: csrfToken }), _jsx("button", { id: "submitButton", type: "submit", children: "Sign out" })] })] })] }));
}
