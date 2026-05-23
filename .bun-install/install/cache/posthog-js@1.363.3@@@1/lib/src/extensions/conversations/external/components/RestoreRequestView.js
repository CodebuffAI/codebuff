"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestoreRequestView = RestoreRequestView;
var jsx_runtime_1 = require("preact/jsx-runtime");
function RestoreRequestView(_a) {
    var styles = _a.styles, restoreEmail = _a.restoreEmail, restoreEmailError = _a.restoreEmailError, restoreRequestLoading = _a.restoreRequestLoading, restoreRequestSuccess = _a.restoreRequestSuccess, onEmailChange = _a.onEmailChange, onSubmit = _a.onSubmit;
    return ((0, jsx_runtime_1.jsxs)("div", { style: styles.identificationForm, children: [(0, jsx_runtime_1.jsx)("div", { style: styles.formTitle, children: "Restore conversations" }), (0, jsx_runtime_1.jsx)("div", { style: styles.formDescription, children: "Don't see your previous conversations? Maybe you use another browser or computer. Enter your email and we will send a secure restore link if matching conversations exist." }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: onSubmit, children: [(0, jsx_runtime_1.jsxs)("div", { style: styles.formField, children: [(0, jsx_runtime_1.jsx)("label", { style: styles.formLabel, children: "Email" }), (0, jsx_runtime_1.jsx)("input", { type: "email", style: __assign(__assign({}, styles.formInput), (restoreEmailError ? styles.formInputError : {})), value: restoreEmail, onInput: onEmailChange, placeholder: "you@example.com", autoComplete: "email", disabled: restoreRequestLoading }), restoreEmailError && (0, jsx_runtime_1.jsx)("div", { style: styles.formError, children: restoreEmailError })] }), (0, jsx_runtime_1.jsx)("button", { type: "submit", style: styles.formSubmitButton, disabled: restoreRequestLoading, children: restoreRequestLoading ? 'Sending...' : 'Send restore link' })] }), restoreRequestSuccess && ((0, jsx_runtime_1.jsx)("div", { style: styles.restoreRequestSuccess, children: "Check your email for a secure restore link. If an account is found, we sent it." }))] }));
}
//# sourceMappingURL=RestoreRequestView.js.map