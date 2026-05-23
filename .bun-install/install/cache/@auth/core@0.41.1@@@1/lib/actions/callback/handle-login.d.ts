import type { AdapterAccount, AdapterSession, AdapterUser } from "../../../adapters.js";
import type { Account, InternalOptions, User } from "../../../types.js";
import type { JWT } from "../../../jwt.js";
import type { SessionToken } from "../../utils/cookie.js";
/**
 * This function handles the complex flow of signing users in, and either creating,
 * linking (or not linking) accounts depending on if the user is currently logged
 * in, if they have account already and the authentication mechanism they are using.
 *
 * It prevents insecure behaviour, such as linking OAuth accounts unless a user is
 * signed in and authenticated with an existing valid account.
 *
 * All verification (e.g. OAuth flows or email address verification flows) are
 * done prior to this handler being called to avoid additional complexity in this
 * handler.
 */
export declare function handleLoginOrRegister(sessionToken: SessionToken, _profile: User | AdapterUser | {
    email: string;
}, _account: AdapterAccount | Account | null, options: InternalOptions): Promise<{
    user: User;
    account: Account;
    session?: undefined;
    isNewUser?: undefined;
} | {
    session: JWT | AdapterSession | null;
    user: AdapterUser;
    isNewUser: boolean;
    account: AdapterAccount;
} | {
    session: JWT | AdapterSession | null;
    user: AdapterUser;
    isNewUser: boolean;
    account?: undefined;
}>;
//# sourceMappingURL=handle-login.d.ts.map