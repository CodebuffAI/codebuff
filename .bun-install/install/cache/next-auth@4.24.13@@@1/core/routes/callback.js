"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = callback;
var _callback = _interopRequireDefault(require("../lib/oauth/callback"));
var _callbackHandler = _interopRequireDefault(require("../lib/callback-handler"));
var _utils = require("../lib/utils");
var _getUserFromEmail = _interopRequireDefault(require("../lib/email/getUserFromEmail"));
async function callback(params) {
  const {
    options,
    query,
    body,
    method,
    headers,
    sessionStore
  } = params;
  const {
    provider,
    adapter,
    url,
    callbackUrl,
    pages,
    jwt,
    events,
    callbacks,
    session: {
      strategy: sessionStrategy,
      maxAge: sessionMaxAge
    },
    logger
  } = options;
  const cookies = [];
  const useJwtSession = sessionStrategy === "jwt";
  if (provider.type === "oauth") {
    try {
      const {
        profile,
        account,
        OAuthProfile,
        cookies: oauthCookies
      } = await (0, _callback.default)({
        query,
        body,
        method,
        options,
        cookies: params.cookies
      });
      if (oauthCookies.length) cookies.push(...oauthCookies);
      try {
        var _events$signIn;
        logger.debug("OAUTH_CALLBACK_RESPONSE", {
          profile,
          account,
          OAuthProfile
        });
        if (!profile || !account || !OAuthProfile) {
          return {
            redirect: `${url}/signin`,
            cookies
          };
        }
        let userOrProfile = profile;
        if (adapter) {
          const {
            getUserByAccount
          } = adapter;
          const userByAccount = await getUserByAccount({
            providerAccountId: account.providerAccountId,
            provider: provider.id
          });
          if (userByAccount) userOrProfile = userByAccount;
        }
        try {
          const isAllowed = await callbacks.signIn({
            user: userOrProfile,
            account,
            profile: OAuthProfile
          });
          if (!isAllowed) {
            return {
              redirect: `${url}/error?error=AccessDenied`,
              cookies
            };
          } else if (typeof isAllowed === "string") {
            return {
              redirect: isAllowed,
              cookies
            };
          }
        } catch (error) {
          return {
            redirect: `${url}/error?error=${encodeURIComponent(error.message)}`,
            cookies
          };
        }
        const {
          user,
          session,
          isNewUser
        } = await (0, _callbackHandler.default)({
          sessionToken: sessionStore.value,
          profile,
          account,
          options
        });
        if (useJwtSession) {
          var _user$id;
          const defaultToken = {
            name: user.name,
            email: user.email,
            picture: user.image,
            sub: (_user$id = user.id) === null || _user$id === void 0 ? void 0 : _user$id.toString()
          };
          const token = await callbacks.jwt({
            token: defaultToken,
            user,
            account,
            profile: OAuthProfile,
            isNewUser,
            trigger: isNewUser ? "signUp" : "signIn"
          });
          const newToken = await jwt.encode({
            ...jwt,
            token
          });
          const cookieExpires = new Date();
          cookieExpires.setTime(cookieExpires.getTime() + sessionMaxAge * 1000);
          const sessionCookies = sessionStore.chunk(newToken, {
            expires: cookieExpires
          });
          cookies.push(...sessionCookies);
        } else {
          cookies.push({
            name: options.cookies.sessionToken.name,
            value: session.sessionToken,
            options: {
              ...options.cookies.sessionToken.options,
              expires: session.expires
            }
          });
        }
        await ((_events$signIn = events.signIn) === null || _events$signIn === void 0 ? void 0 : _events$signIn.call(events, {
          user,
          account,
          profile,
          isNewUser
        }));
        if (isNewUser && pages.newUser) {
          return {
            redirect: `${pages.newUser}${pages.newUser.includes("?") ? "&" : "?"}callbackUrl=${encodeURIComponent(callbackUrl)}`,
            cookies
          };
        }
        return {
          redirect: callbackUrl,
          cookies
        };
      } catch (error) {
        if (error.name === "AccountNotLinkedError") {
          return {
            redirect: `${url}/error?error=OAuthAccountNotLinked`,
            cookies
          };
        } else if (error.name === "CreateUserError") {
          return {
            redirect: `${url}/error?error=OAuthCreateAccount`,
            cookies
          };
        }
        logger.error("OAUTH_CALLBACK_HANDLER_ERROR", error);
        return {
          redirect: `${url}/error?error=Callback`,
          cookies
        };
      }
    } catch (error) {
      if (error.name === "OAuthCallbackError") {
        logger.error("OAUTH_CALLBACK_ERROR", {
          error: error,
          providerId: provider.id
        });
        return {
          redirect: `${url}/error?error=OAuthCallback`,
          cookies
        };
      }
      logger.error("OAUTH_CALLBACK_ERROR", error);
      return {
        redirect: `${url}/error?error=Callback`,
        cookies
      };
    }
  } else if (provider.type === "email") {
    try {
      var _events$signIn2;
      const paramToken = query === null || query === void 0 ? void 0 : query.token;
      const paramIdentifier = query === null || query === void 0 ? void 0 : query.email;
      if (!paramToken) {
        return {
          redirect: `${url}/error?error=configuration`,
          cookies
        };
      }
      const invite = await adapter.useVerificationToken({
        identifier: paramIdentifier,
        token: (0, _utils.hashToken)(paramToken, options)
      });
      const invalidInvite = !invite || invite.expires.valueOf() < Date.now() || paramIdentifier && invite.identifier !== paramIdentifier;
      if (invalidInvite) {
        return {
          redirect: `${url}/error?error=Verification`,
          cookies
        };
      }
      const profile = await (0, _getUserFromEmail.default)({
        email: invite.identifier,
        adapter
      });
      const account = {
        providerAccountId: profile.email,
        type: "email",
        provider: provider.id
      };
      try {
        const signInCallbackResponse = await callbacks.signIn({
          user: profile,
          account
        });
        if (!signInCallbackResponse) {
          return {
            redirect: `${url}/error?error=AccessDenied`,
            cookies
          };
        } else if (typeof signInCallbackResponse === "string") {
          return {
            redirect: signInCallbackResponse,
            cookies
          };
        }
      } catch (error) {
        return {
          redirect: `${url}/error?error=${encodeURIComponent(error.message)}`,
          cookies
        };
      }
      const {
        user,
        session,
        isNewUser
      } = await (0, _callbackHandler.default)({
        sessionToken: sessionStore.value,
        profile,
        account,
        options
      });
      if (useJwtSession) {
        var _user$id2;
        const defaultToken = {
          name: user.name,
          email: user.email,
          picture: user.image,
          sub: (_user$id2 = user.id) === null || _user$id2 === void 0 ? void 0 : _user$id2.toString()
        };
        const token = await callbacks.jwt({
          token: defaultToken,
          user,
          account,
          isNewUser,
          trigger: isNewUser ? "signUp" : "signIn"
        });
        const newToken = await jwt.encode({
          ...jwt,
          token
        });
        const cookieExpires = new Date();
        cookieExpires.setTime(cookieExpires.getTime() + sessionMaxAge * 1000);
        const sessionCookies = sessionStore.chunk(newToken, {
          expires: cookieExpires
        });
        cookies.push(...sessionCookies);
      } else {
        cookies.push({
          name: options.cookies.sessionToken.name,
          value: session.sessionToken,
          options: {
            ...options.cookies.sessionToken.options,
            expires: session.expires
          }
        });
      }
      await ((_events$signIn2 = events.signIn) === null || _events$signIn2 === void 0 ? void 0 : _events$signIn2.call(events, {
        user,
        account,
        isNewUser
      }));
      if (isNewUser && pages.newUser) {
        return {
          redirect: `${pages.newUser}${pages.newUser.includes("?") ? "&" : "?"}callbackUrl=${encodeURIComponent(callbackUrl)}`,
          cookies
        };
      }
      return {
        redirect: callbackUrl,
        cookies
      };
    } catch (error) {
      if (error.name === "CreateUserError") {
        return {
          redirect: `${url}/error?error=EmailCreateAccount`,
          cookies
        };
      }
      logger.error("CALLBACK_EMAIL_ERROR", error);
      return {
        redirect: `${url}/error?error=Callback`,
        cookies
      };
    }
  } else if (provider.type === "credentials" && method === "POST") {
    var _user$id3, _events$signIn3;
    const credentials = body;
    let user;
    try {
      user = await provider.authorize(credentials, {
        query,
        body,
        headers,
        method
      });
      if (!user) {
        return {
          status: 401,
          redirect: `${url}/error?${new URLSearchParams({
            error: "CredentialsSignin",
            provider: provider.id
          })}`,
          cookies
        };
      }
    } catch (error) {
      return {
        status: 401,
        redirect: `${url}/error?error=${encodeURIComponent(error.message)}`,
        cookies
      };
    }
    const account = {
      providerAccountId: user.id,
      type: "credentials",
      provider: provider.id
    };
    try {
      const isAllowed = await callbacks.signIn({
        user,
        account,
        credentials
      });
      if (!isAllowed) {
        return {
          status: 403,
          redirect: `${url}/error?error=AccessDenied`,
          cookies
        };
      } else if (typeof isAllowed === "string") {
        return {
          redirect: isAllowed,
          cookies
        };
      }
    } catch (error) {
      return {
        redirect: `${url}/error?error=${encodeURIComponent(error.message)}`,
        cookies
      };
    }
    const defaultToken = {
      name: user.name,
      email: user.email,
      picture: user.image,
      sub: (_user$id3 = user.id) === null || _user$id3 === void 0 ? void 0 : _user$id3.toString()
    };
    const token = await callbacks.jwt({
      token: defaultToken,
      user,
      account,
      isNewUser: false,
      trigger: "signIn"
    });
    const newToken = await jwt.encode({
      ...jwt,
      token
    });
    const cookieExpires = new Date();
    cookieExpires.setTime(cookieExpires.getTime() + sessionMaxAge * 1000);
    const sessionCookies = sessionStore.chunk(newToken, {
      expires: cookieExpires
    });
    cookies.push(...sessionCookies);
    await ((_events$signIn3 = events.signIn) === null || _events$signIn3 === void 0 ? void 0 : _events$signIn3.call(events, {
      user,
      account
    }));
    return {
      redirect: callbackUrl,
      cookies
    };
  }
  return {
    status: 500,
    body: `Error: Callback for provider type ${provider.type} not supported`,
    cookies
  };
}