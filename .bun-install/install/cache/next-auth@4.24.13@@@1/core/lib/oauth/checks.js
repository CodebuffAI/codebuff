"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.pkce = exports.nonce = exports.PKCE_CODE_CHALLENGE_METHOD = void 0;
exports.signCookie = signCookie;
exports.state = void 0;
var _openidClient = require("openid-client");
var jwt = _interopRequireWildcard(require("../../../jwt"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
async function signCookie(type, value, maxAge, options) {
  const {
    cookies,
    logger
  } = options;
  logger.debug(`CREATE_${type.toUpperCase()}`, {
    value,
    maxAge
  });
  const {
    name
  } = cookies[type];
  const expires = new Date();
  expires.setTime(expires.getTime() + maxAge * 1000);
  return {
    name,
    value: await jwt.encode({
      ...options.jwt,
      maxAge,
      token: {
        value
      },
      salt: name
    }),
    options: {
      ...cookies[type].options,
      expires
    }
  };
}
const PKCE_MAX_AGE = 60 * 15;
const PKCE_CODE_CHALLENGE_METHOD = exports.PKCE_CODE_CHALLENGE_METHOD = "S256";
const pkce = exports.pkce = {
  async create(options, cookies, resParams) {
    var _options$provider, _options$cookies$pkce;
    if (!((_options$provider = options.provider) !== null && _options$provider !== void 0 && (_options$provider = _options$provider.checks) !== null && _options$provider !== void 0 && _options$provider.includes("pkce"))) return;
    const code_verifier = _openidClient.generators.codeVerifier();
    const value = _openidClient.generators.codeChallenge(code_verifier);
    resParams.code_challenge = value;
    resParams.code_challenge_method = PKCE_CODE_CHALLENGE_METHOD;
    const maxAge = (_options$cookies$pkce = options.cookies.pkceCodeVerifier.options.maxAge) !== null && _options$cookies$pkce !== void 0 ? _options$cookies$pkce : PKCE_MAX_AGE;
    cookies.push(await signCookie("pkceCodeVerifier", code_verifier, maxAge, options));
  },
  async use(cookies, resCookies, options, checks) {
    var _options$provider2;
    if (!((_options$provider2 = options.provider) !== null && _options$provider2 !== void 0 && (_options$provider2 = _options$provider2.checks) !== null && _options$provider2 !== void 0 && _options$provider2.includes("pkce"))) return;
    const codeVerifier = cookies === null || cookies === void 0 ? void 0 : cookies[options.cookies.pkceCodeVerifier.name];
    if (!codeVerifier) throw new TypeError("PKCE code_verifier cookie was missing.");
    const {
      name
    } = options.cookies.pkceCodeVerifier;
    const value = await jwt.decode({
      ...options.jwt,
      token: codeVerifier,
      salt: name
    });
    if (!(value !== null && value !== void 0 && value.value)) throw new TypeError("PKCE code_verifier value could not be parsed.");
    resCookies.push({
      name,
      value: "",
      options: {
        ...options.cookies.pkceCodeVerifier.options,
        maxAge: 0
      }
    });
    checks.code_verifier = value.value;
  }
};
const STATE_MAX_AGE = 60 * 15;
const state = exports.state = {
  async create(options, cookies, resParams) {
    var _options$provider$che, _options$cookies$stat;
    if (!((_options$provider$che = options.provider.checks) !== null && _options$provider$che !== void 0 && _options$provider$che.includes("state"))) return;
    const value = _openidClient.generators.state();
    resParams.state = value;
    const maxAge = (_options$cookies$stat = options.cookies.state.options.maxAge) !== null && _options$cookies$stat !== void 0 ? _options$cookies$stat : STATE_MAX_AGE;
    cookies.push(await signCookie("state", value, maxAge, options));
  },
  async use(cookies, resCookies, options, checks) {
    var _options$provider$che2;
    if (!((_options$provider$che2 = options.provider.checks) !== null && _options$provider$che2 !== void 0 && _options$provider$che2.includes("state"))) return;
    const state = cookies === null || cookies === void 0 ? void 0 : cookies[options.cookies.state.name];
    if (!state) throw new TypeError("State cookie was missing.");
    const {
      name
    } = options.cookies.state;
    const value = await jwt.decode({
      ...options.jwt,
      token: state,
      salt: name
    });
    if (!(value !== null && value !== void 0 && value.value)) throw new TypeError("State value could not be parsed.");
    resCookies.push({
      name,
      value: "",
      options: {
        ...options.cookies.state.options,
        maxAge: 0
      }
    });
    checks.state = value.value;
  }
};
const NONCE_MAX_AGE = 60 * 15;
const nonce = exports.nonce = {
  async create(options, cookies, resParams) {
    var _options$provider$che3, _options$cookies$nonc;
    if (!((_options$provider$che3 = options.provider.checks) !== null && _options$provider$che3 !== void 0 && _options$provider$che3.includes("nonce"))) return;
    const value = _openidClient.generators.nonce();
    resParams.nonce = value;
    const maxAge = (_options$cookies$nonc = options.cookies.nonce.options.maxAge) !== null && _options$cookies$nonc !== void 0 ? _options$cookies$nonc : NONCE_MAX_AGE;
    cookies.push(await signCookie("nonce", value, maxAge, options));
  },
  async use(cookies, resCookies, options, checks) {
    var _options$provider3;
    if (!((_options$provider3 = options.provider) !== null && _options$provider3 !== void 0 && (_options$provider3 = _options$provider3.checks) !== null && _options$provider3 !== void 0 && _options$provider3.includes("nonce"))) return;
    const nonce = cookies === null || cookies === void 0 ? void 0 : cookies[options.cookies.nonce.name];
    if (!nonce) throw new TypeError("Nonce cookie was missing.");
    const {
      name
    } = options.cookies.nonce;
    const value = await jwt.decode({
      ...options.jwt,
      token: nonce,
      salt: name
    });
    if (!(value !== null && value !== void 0 && value.value)) throw new TypeError("Nonce value could not be parsed.");
    resCookies.push({
      name,
      value: "",
      options: {
        ...options.cookies.nonce.options,
        maxAge: 0
      }
    });
    checks.nonce = value.value;
  }
};