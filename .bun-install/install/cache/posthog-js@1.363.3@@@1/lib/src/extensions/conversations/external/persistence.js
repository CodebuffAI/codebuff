"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationsPersistence = void 0;
var logger_1 = require("../../../utils/logger");
var globals_1 = require("../../../utils/globals");
var uuidv7_1 = require("../../../uuidv7");
var logger = (0, logger_1.createLogger)('[ConversationsPersistence]');
// Old persistence keys (in PostHog's main persistence blob).
// Kept for one-time migration to dedicated storage.
var LEGACY_WIDGET_SESSION_ID = '$conversations_widget_session_id';
var LEGACY_TICKET_ID = '$conversations_ticket_id';
var LEGACY_WIDGET_STATE = '$conversations_widget_state';
var LEGACY_USER_TRAITS = '$conversations_user_traits';
/**
 * Dedicated localStorage key scoped to the PostHog project token.
 * Format: `ph_conv_<token>`
 */
function storageKey(posthog) {
    var _a;
    var token = (_a = posthog.config) === null || _a === void 0 ? void 0 : _a.token;
    return token ? 'ph_conv_' + token : null;
}
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
var ConversationsPersistence = /** @class */ (function () {
    function ConversationsPersistence(_posthog) {
        this._posthog = _posthog;
        this._cachedWidgetSessionId = null;
        this._storageKey = storageKey(_posthog);
        this._migrateFromLegacyPersistence();
    }
    /**
     * Get or create the widget session ID (random UUID for access control).
     * This ID is generated once per browser and persists across sessions.
     * It is NOT tied to distinct_id - it stays the same even when user identifies.
     *
     * SECURITY: This is the key for access control. Only the browser that created
     * the widget_session_id can access tickets associated with it.
     */
    ConversationsPersistence.prototype.getOrCreateWidgetSessionId = function () {
        var _a;
        if (this._cachedWidgetSessionId) {
            return this._cachedWidgetSessionId;
        }
        var sessionId = (_a = this._read()) === null || _a === void 0 ? void 0 : _a.widgetSessionId;
        if (!sessionId) {
            sessionId = (0, uuidv7_1.uuidv7)();
            this._write({ widgetSessionId: sessionId });
        }
        this._cachedWidgetSessionId = sessionId;
        return sessionId;
    };
    /**
     * Overwrite the widget session ID (used by restore flow).
     */
    ConversationsPersistence.prototype.setWidgetSessionId = function (id) {
        this._cachedWidgetSessionId = id;
        var data = this._read() || {};
        this._write(__assign(__assign({}, data), { widgetSessionId: id }));
    };
    /**
     * Clear the widget session ID (called on posthog.reset()).
     * This will create a new session and lose access to previous tickets.
     */
    ConversationsPersistence.prototype.clearWidgetSessionId = function () {
        this._cachedWidgetSessionId = null;
        var data = this._read();
        if (data) {
            delete data.widgetSessionId;
            this._write(data);
        }
    };
    ConversationsPersistence.prototype.saveTicketId = function (ticketId) {
        var data = this._read() || {};
        this._write(__assign(__assign({}, data), { ticketId: ticketId }));
    };
    ConversationsPersistence.prototype.loadTicketId = function () {
        var _a;
        return ((_a = this._read()) === null || _a === void 0 ? void 0 : _a.ticketId) || null;
    };
    ConversationsPersistence.prototype.clearTicketId = function () {
        var data = this._read();
        if (data) {
            delete data.ticketId;
            this._write(data);
        }
    };
    ConversationsPersistence.prototype.saveWidgetState = function (state) {
        var data = this._read() || {};
        this._write(__assign(__assign({}, data), { widgetState: state }));
    };
    ConversationsPersistence.prototype.loadWidgetState = function () {
        var _a;
        var state = (_a = this._read()) === null || _a === void 0 ? void 0 : _a.widgetState;
        return state === 'open' || state === 'closed' ? state : null;
    };
    ConversationsPersistence.prototype.saveUserTraits = function (traits) {
        var data = this._read() || {};
        this._write(__assign(__assign({}, data), { userTraits: traits }));
    };
    ConversationsPersistence.prototype.loadUserTraits = function () {
        var _a;
        var traits = (_a = this._read()) === null || _a === void 0 ? void 0 : _a.userTraits;
        return traits && (traits.name || traits.email) ? traits : null;
    };
    ConversationsPersistence.prototype.clearUserTraits = function () {
        var data = this._read();
        if (data) {
            delete data.userTraits;
            this._write(data);
        }
    };
    ConversationsPersistence.prototype.clearAll = function () {
        var _a;
        this._cachedWidgetSessionId = null;
        if (this._storageKey) {
            try {
                (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.localStorage) === null || _a === void 0 ? void 0 : _a.removeItem(this._storageKey);
            }
            catch (_b) {
                logger.error('Failed to remove localStorage item');
            }
        }
    };
    ConversationsPersistence.prototype._read = function () {
        var _a;
        if (!this._storageKey) {
            return null;
        }
        try {
            var raw = (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.localStorage) === null || _a === void 0 ? void 0 : _a.getItem(this._storageKey);
            return raw ? JSON.parse(raw) : null;
        }
        catch (_b) {
            return null;
        }
    };
    ConversationsPersistence.prototype._write = function (data) {
        var _a;
        if (!this._storageKey) {
            return;
        }
        try {
            (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.localStorage) === null || _a === void 0 ? void 0 : _a.setItem(this._storageKey, JSON.stringify(data));
        }
        catch (error) {
            logger.error('Failed to write to localStorage', error);
        }
    };
    /**
     * One-time migration: copy conversations data from PostHog's main
     * persistence blob into the dedicated localStorage key, then remove
     * the old keys from PostHog persistence so they stop bloating it.
     */
    ConversationsPersistence.prototype._migrateFromLegacyPersistence = function () {
        var _a, _b;
        if (!this._storageKey || ((_a = this._read()) === null || _a === void 0 ? void 0 : _a.widgetSessionId)) {
            return;
        }
        try {
            var persistence = this._posthog.persistence;
            if (!persistence || ((_b = persistence.isDisabled) === null || _b === void 0 ? void 0 : _b.call(persistence))) {
                return;
            }
            var widgetSessionId = persistence.get_property(LEGACY_WIDGET_SESSION_ID);
            if (!widgetSessionId) {
                // persistence.props may be empty (the bug) — try raw localStorage
                var legacyFromRaw = this._readLegacyFromRawStorage();
                if (legacyFromRaw) {
                    this._write(legacyFromRaw);
                    logger.info('Migrated conversations data from raw localStorage');
                }
                return;
            }
            var data = { widgetSessionId: widgetSessionId };
            var ticketId = persistence.get_property(LEGACY_TICKET_ID);
            if (ticketId) {
                data.ticketId = ticketId;
            }
            var widgetState = persistence.get_property(LEGACY_WIDGET_STATE);
            if (widgetState === 'open' || widgetState === 'closed') {
                data.widgetState = widgetState;
            }
            var userTraits = persistence.get_property(LEGACY_USER_TRAITS);
            if (userTraits) {
                data.userTraits = userTraits;
            }
            this._write(data);
            persistence.unregister(LEGACY_WIDGET_SESSION_ID);
            persistence.unregister(LEGACY_TICKET_ID);
            persistence.unregister(LEGACY_WIDGET_STATE);
            persistence.unregister(LEGACY_USER_TRAITS);
            logger.info('Migrated conversations data to dedicated storage');
        }
        catch (error) {
            logger.error('Migration from legacy persistence failed', error);
        }
    };
    /**
     * Fallback for migration: read legacy keys directly from raw localStorage
     * when PostHog persistence.props didn't load them (the original bug).
     */
    ConversationsPersistence.prototype._readLegacyFromRawStorage = function () {
        var _a, _b;
        try {
            var token = (_a = this._posthog.config) === null || _a === void 0 ? void 0 : _a.token;
            if (!token) {
                return null;
            }
            var key = this._posthog.config.persistence_name
                ? 'ph_' + this._posthog.config.persistence_name
                : 'ph_' + token + '_posthog';
            var raw = (_b = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.localStorage) === null || _b === void 0 ? void 0 : _b.getItem(key);
            if (!raw) {
                return null;
            }
            var parsed = JSON.parse(raw);
            var widgetSessionId = parsed === null || parsed === void 0 ? void 0 : parsed[LEGACY_WIDGET_SESSION_ID];
            if (typeof widgetSessionId !== 'string' || !widgetSessionId) {
                return null;
            }
            var data = { widgetSessionId: widgetSessionId };
            var ticketId = parsed === null || parsed === void 0 ? void 0 : parsed[LEGACY_TICKET_ID];
            if (ticketId) {
                data.ticketId = ticketId;
            }
            var widgetState = parsed === null || parsed === void 0 ? void 0 : parsed[LEGACY_WIDGET_STATE];
            if (widgetState === 'open' || widgetState === 'closed') {
                data.widgetState = widgetState;
            }
            var userTraits = parsed === null || parsed === void 0 ? void 0 : parsed[LEGACY_USER_TRAITS];
            if (userTraits) {
                data.userTraits = userTraits;
            }
            return data;
        }
        catch (_c) {
            return null;
        }
    };
    return ConversationsPersistence;
}());
exports.ConversationsPersistence = ConversationsPersistence;
//# sourceMappingURL=persistence.js.map