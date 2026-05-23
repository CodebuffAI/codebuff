import type { AdapterUser } from "../../../adapters";
import type { InternalOptions } from "../../types";
/**
 * Query the database for a user by email address.
 * If is an existing user return a user object (otherwise use placeholder).
 */
export default function getAdapterUserFromEmail({ email, adapter, }: {
    email: string;
    adapter: InternalOptions<"email">["adapter"];
}): Promise<AdapterUser>;
//# sourceMappingURL=getUserFromEmail.d.ts.map