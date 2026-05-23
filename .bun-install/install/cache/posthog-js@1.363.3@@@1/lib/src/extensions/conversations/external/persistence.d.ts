import { PostHog } from '../../../posthog-core';
import { UserProvidedTraits } from '../../../posthog-conversations-types';
/**
 * ConversationsPersistence manages conversation data in its own dedicated
 * localStorage entry, independent of PostHog's core persistence layer.
 *
 * This avoids a known issue where PostHog's persistence.props can lose data
 * when the cookie+localStorage merge in _parse() fails on large entries.
 *
 * Pattern follows toolbar and surveys extensions which also use dedicated
 * localStorage keys.
 */
export declare class ConversationsPersistence {
    private readonly _posthog;
    private _cachedWidgetSessionId;
    private _storageKey;
    constructor(_posthog: PostHog);
    /**
     * Get or create the widget session ID (random UUID for access control).
     * This ID is generated once per browser and persists across sessions.
     * It is NOT tied to distinct_id - it stays the same even when user identifies.
     *
     * SECURITY: This is the key for access control. Only the browser that created
     * the widget_session_id can access tickets associated with it.
     */
    getOrCreateWidgetSessionId(): string;
    /**
     * Overwrite the widget session ID (used by restore flow).
     */
    setWidgetSessionId(id: string): void;
    /**
     * Clear the widget session ID (called on posthog.reset()).
     * This will create a new session and lose access to previous tickets.
     */
    clearWidgetSessionId(): void;
    saveTicketId(ticketId: string): void;
    loadTicketId(): string | null;
    clearTicketId(): void;
    saveWidgetState(state: 'open' | 'closed'): void;
    loadWidgetState(): 'open' | 'closed' | null;
    saveUserTraits(traits: UserProvidedTraits): void;
    loadUserTraits(): UserProvidedTraits | null;
    clearUserTraits(): void;
    clearAll(): void;
    private _read;
    private _write;
    /**
     * One-time migration: copy conversations data from PostHog's main
     * persistence blob into the dedicated localStorage key, then remove
     * the old keys from PostHog persistence so they stop bloating it.
     */
    private _migrateFromLegacyPersistence;
    /**
     * Fallback for migration: read legacy keys directly from raw localStorage
     * when PostHog persistence.props didn't load them (the original bug).
     */
    private _readLegacyFromRawStorage;
}
