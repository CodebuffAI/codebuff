"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = renderPage;
var _preactRenderToString = _interopRequireDefault(require("preact-render-to-string"));
var _signin = _interopRequireDefault(require("./signin"));
var _signout = _interopRequireDefault(require("./signout"));
var _verifyRequest = _interopRequireDefault(require("./verify-request"));
var _error = _interopRequireDefault(require("./error"));
var _css = _interopRequireDefault(require("../../css"));
function renderPage(params) {
  const {
    url,
    theme,
    query,
    cookies
  } = params;
  function send({
    html,
    title,
    status
  }) {
    var _theme$colorScheme;
    return {
      cookies,
      status,
      headers: [{
        key: "Content-Type",
        value: "text/html"
      }],
      body: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${(0, _css.default)()}</style><title>${title}</title></head><body class="__next-auth-theme-${(_theme$colorScheme = theme === null || theme === void 0 ? void 0 : theme.colorScheme) !== null && _theme$colorScheme !== void 0 ? _theme$colorScheme : "auto"}"><div class="page">${(0, _preactRenderToString.default)(html)}</div></body></html>`
    };
  }
  return {
    signin(props) {
      return send({
        html: (0, _signin.default)({
          csrfToken: params.csrfToken,
          providers: params.providers,
          callbackUrl: params.callbackUrl,
          theme,
          ...query,
          ...props
        }),
        title: "Sign In"
      });
    },
    signout(props) {
      return send({
        html: (0, _signout.default)({
          csrfToken: params.csrfToken,
          url,
          theme,
          ...props
        }),
        title: "Sign Out"
      });
    },
    verifyRequest(props) {
      return send({
        html: (0, _verifyRequest.default)({
          url,
          theme,
          ...props
        }),
        title: "Verify Request"
      });
    },
    error(props) {
      return send({
        ...(0, _error.default)({
          url,
          theme,
          ...props
        }),
        title: "Error"
      });
    }
  };
}