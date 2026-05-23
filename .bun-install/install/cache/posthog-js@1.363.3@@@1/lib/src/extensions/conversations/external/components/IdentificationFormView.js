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
exports.IdentificationFormView = IdentificationFormView;
var jsx_runtime_1 = require("preact/jsx-runtime");
function IdentificationFormView(_a) {
    var config = _a.config, styles = _a.styles, formName = _a.formName, formEmail = _a.formEmail, formEmailError = _a.formEmailError, onNameChange = _a.onNameChange, onEmailChange = _a.onEmailChange, onSubmit = _a.onSubmit;
    var title = config.identificationFormTitle || 'Before we start...';
    var description = config.identificationFormDescription || 'Please provide your details so we can help you better.';
    var showNameField = config.collectName !== false;
    return ((0, jsx_runtime_1.jsxs)("div", { style: styles.identificationForm, children: [(0, jsx_runtime_1.jsx)("div", { style: styles.formTitle, children: title }), (0, jsx_runtime_1.jsx)("div", { style: styles.formDescription, children: description }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: onSubmit, children: [showNameField && ((0, jsx_runtime_1.jsxs)("div", { style: styles.formField, children: [(0, jsx_runtime_1.jsxs)("label", { style: styles.formLabel, children: ["Name ", (0, jsx_runtime_1.jsx)("span", { style: styles.formOptional, children: "(optional)" })] }), (0, jsx_runtime_1.jsx)("input", { type: "text", style: styles.formInput, value: formName, onInput: onNameChange, placeholder: "Your name", autoComplete: "name" })] })), (0, jsx_runtime_1.jsxs)("div", { style: styles.formField, children: [(0, jsx_runtime_1.jsxs)("label", { style: styles.formLabel, children: ["Email ", !config.requireEmail && (0, jsx_runtime_1.jsx)("span", { style: styles.formOptional, children: "(optional)" })] }), (0, jsx_runtime_1.jsx)("input", { type: "email", style: __assign(__assign({}, styles.formInput), (formEmailError ? styles.formInputError : {})), value: formEmail, onInput: onEmailChange, placeholder: "you@example.com", autoComplete: "email" }), formEmailError && (0, jsx_runtime_1.jsx)("div", { style: styles.formError, children: formEmailError })] }), (0, jsx_runtime_1.jsx)("button", { type: "submit", style: styles.formSubmitButton, onMouseEnter: function (e) {
                            e.currentTarget.style.opacity = '0.9';
                        }, onMouseLeave: function (e) {
                            e.currentTarget.style.opacity = '1';
                        }, children: "Start Chat" })] })] }));
}
//# sourceMappingURL=IdentificationFormView.js.map