"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = callbackHandler;
var _errors = require("../errors");
var _utils = require("./utils");
async function callbackHandler(params) {
  const {
    sessionToken,
    profile: _profile,
    account,
    options
  } = params;
  if (!(account !== null && account !== void 0 && account.providerAccountId) || !account.type) throw new Error("Missing or invalid provider account");
  if (!["email", "oauth"].includes(account.type)) throw new Error("Provider not supported");
  const {
    adapter,
    jwt,
    events,
    session: {
      strategy: sessionStrategy,
      generateSessionToken
    }
  } = options;
  if (!adapter) {
    return {
      user: _profile,
      account
    };
  }
  const profile = _profile;
  const {
    createUser,
    updateUser,
    getUser,
    getUserByAccount,
    getUserByEmail,
    linkAccount,
    createSession,
    getSessionAndUser,
    deleteSession
  } = adapter;
  let session = null;
  let user = null;
  let isNewUser = false;
  const useJwtSession = sessionStrategy === "jwt";
  if (sessionToken) {
    if (useJwtSession) {
      try {
        session = await jwt.decode({
          ...jwt,
          token: sessionToken
        });
        if (session && "sub" in session && session.sub) {
          user = await getUser(session.sub);
        }
      } catch (_unused) {}
    } else {
      const userAndSession = await getSessionAndUser(sessionToken);
      if (userAndSession) {
        session = userAndSession.session;
        user = userAndSession.user;
      }
    }
  }
  if (account.type === "email") {
    const userByEmail = await getUserByEmail(profile.email);
    if (userByEmail) {
      var _user, _events$updateUser;
      if (((_user = user) === null || _user === void 0 ? void 0 : _user.id) !== userByEmail.id && !useJwtSession && sessionToken) {
        await deleteSession(sessionToken);
      }
      user = await updateUser({
        id: userByEmail.id,
        emailVerified: new Date()
      });
      await ((_events$updateUser = events.updateUser) === null || _events$updateUser === void 0 ? void 0 : _events$updateUser.call(events, {
        user
      }));
    } else {
      var _events$createUser;
      const {
        id: _,
        ...newUser
      } = {
        ...profile,
        emailVerified: new Date()
      };
      user = await createUser(newUser);
      await ((_events$createUser = events.createUser) === null || _events$createUser === void 0 ? void 0 : _events$createUser.call(events, {
        user
      }));
      isNewUser = true;
    }
    session = useJwtSession ? {} : await createSession({
      sessionToken: await generateSessionToken(),
      userId: user.id,
      expires: (0, _utils.fromDate)(options.session.maxAge)
    });
    return {
      session,
      user,
      isNewUser
    };
  } else if (account.type === "oauth") {
    const userByAccount = await getUserByAccount({
      providerAccountId: account.providerAccountId,
      provider: account.provider
    });
    if (userByAccount) {
      if (user) {
        if (userByAccount.id === user.id) {
          return {
            session,
            user,
            isNewUser
          };
        }
        throw new _errors.AccountNotLinkedError("The account is already associated with another user");
      }
      session = useJwtSession ? {} : await createSession({
        sessionToken: await generateSessionToken(),
        userId: userByAccount.id,
        expires: (0, _utils.fromDate)(options.session.maxAge)
      });
      return {
        session,
        user: userByAccount,
        isNewUser
      };
    } else {
      var _events$createUser2, _events$linkAccount2;
      if (user) {
        var _events$linkAccount;
        await linkAccount({
          ...account,
          userId: user.id
        });
        await ((_events$linkAccount = events.linkAccount) === null || _events$linkAccount === void 0 ? void 0 : _events$linkAccount.call(events, {
          user,
          account,
          profile
        }));
        return {
          session,
          user,
          isNewUser
        };
      }
      const userByEmail = profile.email ? await getUserByEmail(profile.email) : null;
      if (userByEmail) {
        const provider = options.provider;
        if (provider !== null && provider !== void 0 && provider.allowDangerousEmailAccountLinking) {
          user = userByEmail;
        } else {
          throw new _errors.AccountNotLinkedError("Another account already exists with the same e-mail address");
        }
      } else {
        const {
          id: _,
          ...newUser
        } = {
          ...profile,
          emailVerified: null
        };
        user = await createUser(newUser);
      }
      await ((_events$createUser2 = events.createUser) === null || _events$createUser2 === void 0 ? void 0 : _events$createUser2.call(events, {
        user
      }));
      await linkAccount({
        ...account,
        userId: user.id
      });
      await ((_events$linkAccount2 = events.linkAccount) === null || _events$linkAccount2 === void 0 ? void 0 : _events$linkAccount2.call(events, {
        user,
        account,
        profile
      }));
      session = useJwtSession ? {} : await createSession({
        sessionToken: await generateSessionToken(),
        userId: user.id,
        expires: (0, _utils.fromDate)(options.session.maxAge)
      });
      return {
        session,
        user,
        isNewUser: true
      };
    }
  }
  throw new Error("Unsupported account type");
}