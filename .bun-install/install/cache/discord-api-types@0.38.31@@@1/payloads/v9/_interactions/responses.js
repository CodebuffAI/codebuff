"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionResponseType = exports.InteractionType = void 0;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type}
 */
var InteractionType;
(function (InteractionType) {
    InteractionType[InteractionType["Ping"] = 1] = "Ping";
    InteractionType[InteractionType["ApplicationCommand"] = 2] = "ApplicationCommand";
    InteractionType[InteractionType["MessageComponent"] = 3] = "MessageComponent";
    InteractionType[InteractionType["ApplicationCommandAutocomplete"] = 4] = "ApplicationCommandAutocomplete";
    InteractionType[InteractionType["ModalSubmit"] = 5] = "ModalSubmit";
})(InteractionType || (exports.InteractionType = InteractionType = {}));
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type}
 */
var InteractionResponseType;
(function (InteractionResponseType) {
    /**
     * ACK a `Ping`
     */
    InteractionResponseType[InteractionResponseType["Pong"] = 1] = "Pong";
    /**
     * Respond to an interaction with a message
     */
    InteractionResponseType[InteractionResponseType["ChannelMessageWithSource"] = 4] = "ChannelMessageWithSource";
    /**
     * ACK an interaction and edit to a response later, the user sees a loading state
     */
    InteractionResponseType[InteractionResponseType["DeferredChannelMessageWithSource"] = 5] = "DeferredChannelMessageWithSource";
    /**
     * ACK a button interaction and update it to a loading state
     */
    InteractionResponseType[InteractionResponseType["DeferredMessageUpdate"] = 6] = "DeferredMessageUpdate";
    /**
     * ACK a button interaction and edit the message to which the button was attached
     */
    InteractionResponseType[InteractionResponseType["UpdateMessage"] = 7] = "UpdateMessage";
    /**
     * For autocomplete interactions
     */
    InteractionResponseType[InteractionResponseType["ApplicationCommandAutocompleteResult"] = 8] = "ApplicationCommandAutocompleteResult";
    /**
     * Respond to an interaction with an modal for a user to fill-out
     */
    InteractionResponseType[InteractionResponseType["Modal"] = 9] = "Modal";
    /**
     * Respond to an interaction with an upgrade button, only available for apps with monetization enabled
     *
     * @deprecated Send a button with Premium type instead.
     * {@link https://discord.com/developers/docs/change-log#premium-apps-new-premium-button-style-deep-linking-url-schemes | Learn more here}
     */
    InteractionResponseType[InteractionResponseType["PremiumRequired"] = 10] = "PremiumRequired";
    /**
     * Launch the Activity associated with the app.
     *
     * @remarks
     * Only available for apps with Activities enabled
     */
    InteractionResponseType[InteractionResponseType["LaunchActivity"] = 12] = "LaunchActivity";
})(InteractionResponseType || (exports.InteractionResponseType = InteractionResponseType = {}));
//# sourceMappingURL=responses.js.map