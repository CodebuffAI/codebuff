import type { Snowflake } from '../globals';
import type { APIMessage, APIUser } from '../v8';
import type { RelationshipType, RPCAPIMessageParsedContentMention, RPCAPIMessageParsedContentText } from './common';
export * from './common';
/**
 * @unstable
 */
export interface Relationship {
    /**
     * The id of the user
     */
    id: Snowflake;
    /**
     * Relationship type
     */
    type: RelationshipType;
    /**
     * User
     */
    user: APIUser;
}
/**
 * @unstable
 */
export interface RPCAPIMessage extends Omit<APIMessage, 'channel_id'> {
    /**
     * The nickname of the user who sent the message
     */
    nick?: string;
    /**
     * The color of the author's name
     */
    author_color?: number;
    /**
     * The content of the message parsed into an array
     */
    content_parsed: (RPCAPIMessageParsedContentMention | RPCAPIMessageParsedContentText)[];
}
//# sourceMappingURL=v8.d.ts.map