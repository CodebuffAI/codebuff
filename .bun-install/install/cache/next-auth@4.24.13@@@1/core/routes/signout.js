"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = signout;
async function signout(params) {
  const {
    options,
    sessionStore
  } = params;
  const {
    adapter,
    events,
    jwt,
    callbackUrl,
    logger,
    session
  } = options;
  const sessionToken = sessionStore === null || sessionStore === void 0 ? void 0 : sessionStore.value;
  if (!sessionToken) {
    return {
      redirect: callbackUrl
    };
  }
  if (session.strategy === "jwt") {
    try {
      var _events$signOut;
      const decodedJwt = await jwt.decode({
        ...jwt,
        token: sessionToken
      });
      await ((_events$signOut = events.signOut) === null || _events$signOut === void 0 ? void 0 : _events$signOut.call(events, {
        token: decodedJwt
      }));
    } catch (error) {
      logger.error("SIGNOUT_ERROR", error);
    }
  } else {
    try {
      var _events$signOut2;
      const session = await adapter.deleteSession(sessionToken);
      await ((_events$signOut2 = events.signOut) === null || _events$signOut2 === void 0 ? void 0 : _events$signOut2.call(events, {
        session
      }));
    } catch (error) {
      logger.error("SIGNOUT_ERROR", error);
    }
  }
  const sessionCookies = sessionStore.clean();
  return {
    redirect: callbackUrl,
    cookies: sessionCookies
  };
}