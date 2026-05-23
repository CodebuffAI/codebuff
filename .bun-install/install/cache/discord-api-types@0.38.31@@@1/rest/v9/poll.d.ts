import type { Snowflake } from '../../globals';
import type { APIBasePoll, APIBasePollAnswer, APIMessage, APIPollDefaults, APIUser } from '../../v9';
/**
 * @see {@link https://discord.com/developers/docs/resources/poll#get-answer-voters}
 */
export interface RESTGetAPIPollAnswerVotersQuery {
    /**
     * Get users after this user ID
     */
    after?: Snowflake;
    /**
     * Max number of users to return (1-100)
     *
     * @defaultValue `25`
     */
    limit?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/poll#poll-create-request-object-poll-create-request-object-structure}
 */
export interface RESTAPIPoll extends APIBasePoll, Partial<APIPollDefaults> {
    /**
     * Each of the answers available in the poll, up to 10
     */
    answers: APIBasePollAnswer[];
    /**
     * Number of hours the poll should be open for, up to 32 days
     *
     * @defaultValue `24`
     */
    duration?: number;
}
/**
 * @deprecated Use {@link RESTAPIPoll} instead
 */
export type RESTAPIPollCreate = RESTAPIPoll;
/**
 * @see {@link https://discord.com/developers/docs/resources/poll#get-answer-voters}
 */
export interface RESTGetAPIPollAnswerVotersResult {
    /**
     * Users who voted for this answer
     */
    users: APIUser[];
}
/**
 * @see {@link https://discord.com/developers/docs/resources/poll#expire-poll}
 */
export type RESTPostAPIPollExpireResult = APIMessage;
//# sourceMappingURL=poll.d.ts.map