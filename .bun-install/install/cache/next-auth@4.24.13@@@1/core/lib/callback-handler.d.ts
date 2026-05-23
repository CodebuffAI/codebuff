import type { InternalOptions } from "../types";
import type { AdapterSession, AdapterUser } from "../../adapters";
import type { JWT } from "../../jwt";
import type { Account, User } from "../..";
import type { SessionToken } from "./cookie";
/**
 * This function handles the complex flow of signing users in, and either creating,
 * linking (or not linking) accounts depending on if the user is currently logged
 * in, if they have account already and the authentication mechanism they are using.
 *
 * It prevents insecure behaviour, such as linking OAuth accounts unless a user is
 * signed in and authenticated with an existing valid account.
 *
 * All verification (e.g. OAuth flows or email address verificaiton flows) are
 * done prior to this handler being called to avoid additonal complexity in this
 * handler.
 */
export default function callbackHandler(params: {
    sessionToken?: SessionToken;
    profile: User | AdapterUser | {
        email: string;
    };
    account: Account | null;
    options: InternalOptions;
}): Promise<{
    user: User;
    account: Account;
    session?: undefined;
    isNewUser?: undefined;
} | {
    session: JWT | AdapterSession | null;
    user: AdapterUser;
    isNewUser: boolean;
    account?: undefined;
}>;
//# sourceMappingURL=callback-handler.d.ts.map