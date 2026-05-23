"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = signin;
var _authorizationUrl = _interopRequireDefault(require("../lib/oauth/authorization-url"));
var _signin = _interopRequireDefault(require("../lib/email/signin"));
var _getUserFromEmail = _interopRequireDefault(require("../lib/email/getUserFromEmail"));
async function signin(params) {
  const {
    options,
    query,
    body
  } = params;
  const {
    url,
    callbacks,
    logger,
    provider
  } = options;
  if (!provider.type) {
    return {
      status: 500,
      text: `Error: Type not specified for ${provider.name}`
    };
  }
  if (provider.type === "oauth") {
    try {
      const response = await (0, _authorizationUrl.default)({
        options,
        query
      });
      return response;
    } catch (error) {
      logger.error("SIGNIN_OAUTH_ERROR", {
        error: error,
        providerId: provider.id
      });
      return {
        redirect: `${url}/error?error=OAuthSignin`
      };
    }
  } else if (provider.type === "email") {
    var _provider$normalizeId;
    let email = body === null || body === void 0 ? void 0 : body.email;
    if (!email) return {
      redirect: `${url}/error?error=EmailSignin`
    };
    const normalizer = (_provider$normalizeId = provider.normalizeIdentifier) !== null && _provider$normalizeId !== void 0 ? _provider$normalizeId : identifier => {
      var _trimmedEmail$match;
      const trimmedEmail = identifier.trim();
      const atCount = ((_trimmedEmail$match = trimmedEmail.match(/@/g)) !== null && _trimmedEmail$match !== void 0 ? _trimmedEmail$match : []).length;
      if (atCount !== 1) {
        throw new Error("Invalid email address format.");
      }
      if (trimmedEmail.includes('"')) {
        throw new Error("Invalid email address format.");
      }
      let [local, domain] = trimmedEmail.toLowerCase().split("@");
      if (!local || !domain) {
        throw new Error("Invalid email address format.");
      }
      domain = domain.split(",")[0];
      if (!domain.includes(".")) {
        throw new Error("Invalid email address format.");
      }
      return `${local}@${domain}`;
    };
    try {
      email = normalizer(body === null || body === void 0 ? void 0 : body.email);
    } catch (error) {
      logger.error("SIGNIN_EMAIL_ERROR", {
        error,
        providerId: provider.id
      });
      return {
        redirect: `${url}/error?error=EmailSignin`
      };
    }
    const user = await (0, _getUserFromEmail.default)({
      email,
      adapter: options.adapter
    });
    const account = {
      providerAccountId: email,
      userId: email,
      type: "email",
      provider: provider.id
    };
    try {
      const signInCallbackResponse = await callbacks.signIn({
        user,
        account,
        email: {
          verificationRequest: true
        }
      });
      if (!signInCallbackResponse) {
        return {
          redirect: `${url}/error?error=AccessDenied`
        };
      } else if (typeof signInCallbackResponse === "string") {
        return {
          redirect: signInCallbackResponse
        };
      }
    } catch (error) {
      return {
        redirect: `${url}/error?${new URLSearchParams({
          error: error
        })}`
      };
    }
    try {
      const redirect = await (0, _signin.default)(email, options);
      return {
        redirect
      };
    } catch (error) {
      logger.error("SIGNIN_EMAIL_ERROR", {
        error,
        providerId: provider.id
      });
      return {
        redirect: `${url}/error?error=EmailSignin`
      };
    }
  }
  return {
    redirect: `${url}/signin`
  };
}