import type { OAuthConfig, OAuthUserConfig } from ".";
/**
 * @see https://developer.todoist.com/sync/v9/#user
 */
interface TodoistProfile extends Record<string, any> {
    avatar_big: string;
    email: string;
    full_name: string;
    id: string;
}
export default function TodoistProvider<P extends TodoistProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
export {};
//# sourceMappingURL=todoist.d.ts.map