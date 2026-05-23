"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = session;
var _utils = require("../lib/utils");
async function session(params) {
  const {
    options,
    sessionStore,
    newSession,
    isUpdate
  } = params;
  const {
    adapter,
    jwt,
    events,
    callbacks,
    logger,
    session: {
      strategy: sessionStrategy,
      maxAge: sessionMaxAge
    }
  } = options;
  const response = {
    body: {},
    headers: [{
      key: "Content-Type",
      value: "application/json"
    }, ...(isUpdate ? [] : [{
      key: "Cache-Control",
      value: "private, no-cache, no-store"
    }, {
      key: "Pragma",
      value: "no-cache"
    }, {
      key: "Expires",
      value: "0"
    }])].filter(Boolean),
    cookies: []
  };
  const sessionToken = sessionStore.value;
  if (!sessionToken) return response;
  if (sessionStrategy === "jwt") {
    try {
      var _response$cookies, _events$session;
      const decodedToken = await jwt.decode({
        ...jwt,
        token: sessionToken
      });
      if (!decodedToken) throw new Error("JWT invalid");
      const token = await callbacks.jwt({
        token: decodedToken,
        ...(isUpdate && {
          trigger: "update"
        }),
        session: newSession
      });
      const newExpires = (0, _utils.fromDate)(sessionMaxAge);
      const updatedSession = await callbacks.session({
        session: {
          user: {
            name: decodedToken === null || decodedToken === void 0 ? void 0 : decodedToken.name,
            email: decodedToken === null || decodedToken === void 0 ? void 0 : decodedToken.email,
            image: decodedToken === null || decodedToken === void 0 ? void 0 : decodedToken.picture
          },
          expires: newExpires.toISOString()
        },
        token
      });
      response.body = updatedSession;
      const newToken = await jwt.encode({
        ...jwt,
        token,
        maxAge: options.session.maxAge
      });
      const sessionCookies = sessionStore.chunk(newToken, {
        expires: newExpires
      });
      (_response$cookies = response.cookies) === null || _response$cookies === void 0 || _response$cookies.push(...sessionCookies);
      await ((_events$session = events.session) === null || _events$session === void 0 ? void 0 : _events$session.call(events, {
        session: updatedSession,
        token
      }));
    } catch (error) {
      var _response$cookies2;
      logger.error("JWT_SESSION_ERROR", error);
      (_response$cookies2 = response.cookies) === null || _response$cookies2 === void 0 || _response$cookies2.push(...sessionStore.clean());
    }
  } else {
    try {
      const {
        getSessionAndUser,
        deleteSession,
        updateSession
      } = adapter;
      let userAndSession = await getSessionAndUser(sessionToken);
      if (userAndSession && userAndSession.session.expires.valueOf() < Date.now()) {
        await deleteSession(sessionToken);
        userAndSession = null;
      }
      if (userAndSession) {
        var _response$cookies3, _events$session2;
        const {
          user,
          session
        } = userAndSession;
        const sessionUpdateAge = options.session.updateAge;
        const sessionIsDueToBeUpdatedDate = session.expires.valueOf() - sessionMaxAge * 1000 + sessionUpdateAge * 1000;
        const newExpires = (0, _utils.fromDate)(sessionMaxAge);
        if (sessionIsDueToBeUpdatedDate <= Date.now()) {
          await updateSession({
            sessionToken,
            expires: newExpires
          });
        }
        const sessionPayload = await callbacks.session({
          session: {
            user: {
              name: user.name,
              email: user.email,
              image: user.image
            },
            expires: session.expires.toISOString()
          },
          user,
          newSession,
          ...(isUpdate ? {
            trigger: "update"
          } : {})
        });
        response.body = sessionPayload;
        (_response$cookies3 = response.cookies) === null || _response$cookies3 === void 0 || _response$cookies3.push({
          name: options.cookies.sessionToken.name,
          value: sessionToken,
          options: {
            ...options.cookies.sessionToken.options,
            expires: newExpires
          }
        });
        await ((_events$session2 = events.session) === null || _events$session2 === void 0 ? void 0 : _events$session2.call(events, {
          session: sessionPayload
        }));
      } else if (sessionToken) {
        var _response$cookies4;
        (_response$cookies4 = response.cookies) === null || _response$cookies4 === void 0 || _response$cookies4.push(...sessionStore.clean());
      }
    } catch (error) {
      logger.error("SESSION_ERROR", error);
    }
  }
  return response;
}