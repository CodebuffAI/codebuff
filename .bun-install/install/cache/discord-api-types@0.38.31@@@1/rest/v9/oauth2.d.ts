import type { Permissions, Snowflake } from '../../globals';
import type { APIApplication, APIGuild, APIUser, APIWebhook, OAuth2Scopes } from '../../payloads/v9/index';
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#get-current-bot-application-information}
 */
export type RESTGetAPIOAuth2CurrentApplicationResult = Omit<APIApplication, 'flags'>;
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#get-current-authorization-information}
 */
export interface RESTGetAPIOAuth2CurrentAuthorizationResult {
    /**
     * the current application
     */
    application: Partial<APIApplication>;
    /**
     * the scopes the user has authorized the application for
     */
    scopes: OAuth2Scopes[];
    /**
     * when the access token expires
     */
    expires: string;
    /**
     * the user who has authorized, if the user has authorized with the `identify` scope
     */
    user?: APIUser;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#authorization-code-grant}
 */
export interface RESTOAuth2AuthorizationQuery {
    response_type: 'code';
    client_id: Snowflake;
    scope: string;
    redirect_uri?: string;
    state?: string;
    prompt?: 'consent' | 'none';
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-token-revocation-example}
 */
export interface RESTPostOAuth2TokenRevocationQuery {
    token: string;
    token_type_hint?: 'access_token' | 'refresh_token';
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-redirect-url-example}
 */
export interface RESTPostOAuth2AuthorizationQueryResult {
    code: string;
    state?: string;
}
/**
 * @deprecated Use {@link RESTPostOAuth2AuthorizationQueryResult} instead
 */
export type RESTOAuth2AuthorizationQueryResult = RESTPostOAuth2AuthorizationQueryResult;
/**
 * @remarks
 * This endpoint requires either HTTP Basic authentication using `client_id:client_secret`,
 * or the `client_id` and `client_secret` must be provided in the form body.
 * @see {@link https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-redirect-url-example}
 */
export type RESTPostOAuth2AccessTokenURLEncodedData = RESTOAuth2TokenOptionalClientCredentials & {
    grant_type: 'authorization_code';
    code: string;
    redirect_uri?: string;
};
export type RESTOAuth2TokenOptionalClientCredentials = {
    client_id: Snowflake;
    client_secret: string;
} | {
    client_id?: never;
    client_secret?: never;
};
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-access-token-response}
 */
export interface RESTPostOAuth2AccessTokenResult {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
}
/**
 * @remarks
 * This endpoint requires either HTTP Basic authentication using `client_id:client_secret`,
 * or the `client_id` and `client_secret` must be provided in the form body.
 * @see {@link https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-refresh-token-exchange-example}
 */
export type RESTPostOAuth2RefreshTokenURLEncodedData = RESTOAuth2TokenOptionalClientCredentials & {
    grant_type: 'refresh_token';
    refresh_token: string;
};
export type RESTPostOAuth2RefreshTokenResult = RESTPostOAuth2AccessTokenResult;
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#implicit-grant}
 */
export interface RESTOAuth2ImplicitAuthorizationQuery {
    response_type: 'token';
    client_id: Snowflake;
    scope: string;
    redirect_uri?: string;
    state?: string;
    prompt?: 'consent' | 'none';
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#implicit-grant-redirect-url-example}
 */
export type RESTOAuth2ImplicitAuthorizationURLFragmentResult = Omit<RESTPostOAuth2AccessTokenResult, 'refresh_token'>;
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#client-credentials-grant}
 */
export interface RESTPostOAuth2ClientCredentialsURLEncodedData {
    grant_type: 'client_credentials';
    scope: string;
}
export type RESTPostOAuth2ClientCredentialsResult = RESTOAuth2ImplicitAuthorizationURLFragmentResult;
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow-bot-auth-parameters}
 */
export interface RESTOAuth2BotAuthorizationQuery {
    /**
     * Your app's client id
     */
    client_id: Snowflake;
    /**
     * Needs to include bot for the bot flow
     */
    scope: `${OAuth2Scopes.Bot} ${string}` | `${OAuth2Scopes.Bot}` | `${string} ${OAuth2Scopes.Bot} ${string}` | `${string} ${OAuth2Scopes.Bot}`;
    /**
     * The permissions you're requesting
     *
     * @see {@link https://discord.com/developers/docs/topics/permissions}
     */
    permissions?: Permissions;
    /**
     * Pre-fills the dropdown picker with a guild for the user
     */
    guild_id?: Snowflake;
    /**
     * `true` or `false`—disallows the user from changing the guild dropdown
     */
    disable_guild_select?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#advanced-bot-authorization}
 */
export interface RESTOAuth2AdvancedBotAuthorizationQuery {
    client_id: Snowflake;
    /**
     * This assumes you include the `bot` scope alongside others (like `identify` for example)
     */
    scope: `${OAuth2Scopes.Bot} ${string}` | `${OAuth2Scopes.Bot}` | `${string} ${OAuth2Scopes.Bot} ${string}` | `${string} ${OAuth2Scopes.Bot}`;
    /**
     * The required permissions bitfield, stringified
     */
    permissions?: Permissions;
    guild_id?: Snowflake;
    disable_guild_select?: boolean;
    response_type: string;
    redirect_uri?: string;
}
export interface RESTOAuth2AdvancedBotAuthorizationQueryResult {
    code: string;
    state?: string;
    guild_id: Snowflake;
    permissions: Permissions;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#advanced-bot-authorization-extended-bot-authorization-access-token-example}
 */
export interface RESTPostOAuth2AccessTokenWithBotAndGuildsScopeResult {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
    guild: APIGuild;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/oauth2#webhooks-webhook-token-response-example}
 */
export interface RESTPostOAuth2AccessTokenWithBotAndWebhookIncomingScopeResult {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
    webhook: APIWebhook;
}
export type RESTPostOAuth2AccessTokenWithBotAndGuildsAndWebhookIncomingScopeResult = RESTPostOAuth2AccessTokenWithBotAndGuildsScopeResult & RESTPostOAuth2AccessTokenWithBotAndWebhookIncomingScopeResult;
//# sourceMappingURL=oauth2.d.ts.map