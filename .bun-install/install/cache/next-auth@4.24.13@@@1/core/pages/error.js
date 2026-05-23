"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ErrorPage;
var _preact = require("preact");
function ErrorPage(props) {
  var _errors$error$toLower;
  const {
    url,
    error = "default",
    theme
  } = props;
  const signinPageUrl = `${url}/signin`;
  const errors = {
    default: {
      status: 200,
      heading: "Error",
      message: (0, _preact.h)("p", null, (0, _preact.h)("a", {
        className: "site",
        href: url === null || url === void 0 ? void 0 : url.origin
      }, url === null || url === void 0 ? void 0 : url.host))
    },
    configuration: {
      status: 500,
      heading: "Server error",
      message: (0, _preact.h)("div", null, (0, _preact.h)("p", null, "There is a problem with the server configuration."), (0, _preact.h)("p", null, "Check the server logs for more information."))
    },
    accessdenied: {
      status: 403,
      heading: "Access Denied",
      message: (0, _preact.h)("div", null, (0, _preact.h)("p", null, "You do not have permission to sign in."), (0, _preact.h)("p", null, (0, _preact.h)("a", {
        className: "button",
        href: signinPageUrl
      }, "Sign in")))
    },
    verification: {
      status: 403,
      heading: "Unable to sign in",
      message: (0, _preact.h)("div", null, (0, _preact.h)("p", null, "The sign in link is no longer valid."), (0, _preact.h)("p", null, "It may have been used already or it may have expired.")),
      signin: (0, _preact.h)("a", {
        className: "button",
        href: signinPageUrl
      }, "Sign in")
    }
  };
  const {
    status,
    heading,
    message,
    signin
  } = (_errors$error$toLower = errors[error.toLowerCase()]) !== null && _errors$error$toLower !== void 0 ? _errors$error$toLower : errors.default;
  return {
    status,
    html: (0, _preact.h)("div", {
      className: "error"
    }, (theme === null || theme === void 0 ? void 0 : theme.brandColor) && (0, _preact.h)("style", {
      dangerouslySetInnerHTML: {
        __html: `
        :root {
          --brand-color: ${theme === null || theme === void 0 ? void 0 : theme.brandColor}
        }
      `
      }
    }), (0, _preact.h)("div", {
      className: "card"
    }, (theme === null || theme === void 0 ? void 0 : theme.logo) && (0, _preact.h)("img", {
      src: theme.logo,
      alt: "Logo",
      className: "logo"
    }), (0, _preact.h)("h1", null, heading), (0, _preact.h)("div", {
      className: "message"
    }, message), signin))
  };
}