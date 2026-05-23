"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntryPointCommandHandlerType = exports.InteractionContextType = exports.ApplicationIntegrationType = exports.ApplicationCommandType = void 0;
__exportStar(require("./_applicationCommands/chatInput"), exports);
__exportStar(require("./_applicationCommands/permissions"), exports);
/**
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-types}
 */
var ApplicationCommandType;
(function (ApplicationCommandType) {
    /**
     * Slash commands; a text-based command that shows up when a user types `/`
     */
    ApplicationCommandType[ApplicationCommandType["ChatInput"] = 1] = "ChatInput";
    /**
     * A UI-based command that shows up when you right click or tap on a user
     */
    ApplicationCommandType[ApplicationCommandType["User"] = 2] = "User";
    /**
     * A UI-based command that shows up when you right click or tap on a message
     */
    ApplicationCommandType[ApplicationCommandType["Message"] = 3] = "Message";
    /**
     * A UI-based command that represents the primary way to invoke an app's Activity
     */
    ApplicationCommandType[ApplicationCommandType["PrimaryEntryPoint"] = 4] = "PrimaryEntryPoint";
})(ApplicationCommandType || (exports.ApplicationCommandType = ApplicationCommandType = {}));
/**
 * @see {@link https://discord.com/developers/docs/resources/application#application-object-application-integration-types}
 */
var ApplicationIntegrationType;
(function (ApplicationIntegrationType) {
    /**
     * App is installable to servers
     */
    ApplicationIntegrationType[ApplicationIntegrationType["GuildInstall"] = 0] = "GuildInstall";
    /**
     * App is installable to users
     */
    ApplicationIntegrationType[ApplicationIntegrationType["UserInstall"] = 1] = "UserInstall";
})(ApplicationIntegrationType || (exports.ApplicationIntegrationType = ApplicationIntegrationType = {}));
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-context-types}
 */
var InteractionContextType;
(function (InteractionContextType) {
    /**
     * Interaction can be used within servers
     */
    InteractionContextType[InteractionContextType["Guild"] = 0] = "Guild";
    /**
     * Interaction can be used within DMs with the app's bot user
     */
    InteractionContextType[InteractionContextType["BotDM"] = 1] = "BotDM";
    /**
     * Interaction can be used within Group DMs and DMs other than the app's bot user
     */
    InteractionContextType[InteractionContextType["PrivateChannel"] = 2] = "PrivateChannel";
})(InteractionContextType || (exports.InteractionContextType = InteractionContextType = {}));
/**
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-entry-point-command-handler-types}
 */
var EntryPointCommandHandlerType;
(function (EntryPointCommandHandlerType) {
    /**
     * The app handles the interaction using an interaction token
     */
    EntryPointCommandHandlerType[EntryPointCommandHandlerType["AppHandler"] = 1] = "AppHandler";
    /**
     * Discord handles the interaction by launching an Activity and sending a follow-up message without coordinating with
     * the app
     */
    EntryPointCommandHandlerType[EntryPointCommandHandlerType["DiscordLaunchActivity"] = 2] = "DiscordLaunchActivity";
})(EntryPointCommandHandlerType || (exports.EntryPointCommandHandlerType = EntryPointCommandHandlerType = {}));
//# sourceMappingURL=applicationCommands.js.map