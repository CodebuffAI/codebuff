"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.withAuth = withAuth;
var _server = require("next/server");
var _jwt = require("../jwt");
var _parseUrl = _interopRequireDefault(require("../utils/parse-url"));
async function handleMiddleware(req, options, onSuccess) {
  var _options$pages$signIn, _options$pages, _options$pages$error, _options$pages2, _ref, _options$secret, _options$jwt, _options$cookies, _await$options$callba, _options$callbacks, _options$callbacks$au;
  const {
    pathname,
    search,
    origin,
    basePath
  } = req.nextUrl;
  const signInPage = (_options$pages$signIn = options === null || options === void 0 || (_options$pages = options.pages) === null || _options$pages === void 0 ? void 0 : _options$pages.signIn) !== null && _options$pages$signIn !== void 0 ? _options$pages$signIn : "/api/auth/signin";
  const errorPage = (_options$pages$error = options === null || options === void 0 || (_options$pages2 = options.pages) === null || _options$pages2 === void 0 ? void 0 : _options$pages2.error) !== null && _options$pages$error !== void 0 ? _options$pages$error : "/api/auth/error";
  const authPath = (0, _parseUrl.default)(process.env.NEXTAUTH_URL).path;
  const publicPaths = ["/_next", "/favicon.ico"];
  if (`${basePath}${pathname}`.startsWith(authPath) || [signInPage, errorPage].includes(pathname) || publicPaths.some(p => pathname.startsWith(p))) {
    return;
  }
  const secret = (_ref = (_options$secret = options === null || options === void 0 ? void 0 : options.secret) !== null && _options$secret !== void 0 ? _options$secret : process.env.NEXTAUTH_SECRET) !== null && _ref !== void 0 ? _ref : process.env.AUTH_SECRET;
  if (!secret) {
    console.error(`[next-auth][error][NO_SECRET]`, `\nhttps://next-auth.js.org/errors#no_secret`);
    const errorUrl = new URL(`${basePath}${errorPage}`, origin);
    errorUrl.searchParams.append("error", "Configuration");
    return _server.NextResponse.redirect(errorUrl);
  }
  const token = await (0, _jwt.getToken)({
    req,
    decode: options === null || options === void 0 || (_options$jwt = options.jwt) === null || _options$jwt === void 0 ? void 0 : _options$jwt.decode,
    cookieName: options === null || options === void 0 || (_options$cookies = options.cookies) === null || _options$cookies === void 0 || (_options$cookies = _options$cookies.sessionToken) === null || _options$cookies === void 0 ? void 0 : _options$cookies.name,
    secret
  });
  const isAuthorized = (_await$options$callba = await (options === null || options === void 0 || (_options$callbacks = options.callbacks) === null || _options$callbacks === void 0 || (_options$callbacks$au = _options$callbacks.authorized) === null || _options$callbacks$au === void 0 ? void 0 : _options$callbacks$au.call(_options$callbacks, {
    req,
    token
  }))) !== null && _await$options$callba !== void 0 ? _await$options$callba : !!token;
  if (isAuthorized) return await (onSuccess === null || onSuccess === void 0 ? void 0 : onSuccess(token));
  const signInUrl = new URL(`${basePath}${signInPage}`, origin);
  signInUrl.searchParams.append("callbackUrl", `${basePath}${pathname}${search}`);
  return _server.NextResponse.redirect(signInUrl);
}
function withAuth(...args) {
  if (!args.length || args[0] instanceof Request) {
    return handleMiddleware(...args);
  }
  if (typeof args[0] === "function") {
    const middleware = args[0];
    const options = args[1];
    return async (...args) => await handleMiddleware(args[0], options, async token => {
      args[0].nextauth = {
        token
      };
      return await middleware(...args);
    });
  }
  const options = args[0];
  return async (...args) => await handleMiddleware(args[0], options);
}
var _default = exports.default = withAuth;