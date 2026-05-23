import type { APIApplicationCommandDMInteraction, APIApplicationCommandGuildInteraction, APIApplicationCommandInteraction } from './_interactions/applicationCommands';
import type { APIApplicationCommandAutocompleteDMInteraction, APIApplicationCommandAutocompleteGuildInteraction, APIApplicationCommandAutocompleteInteraction } from './_interactions/autocomplete';
import type { APIMessageComponentDMInteraction, APIMessageComponentGuildInteraction, APIMessageComponentInteraction } from './_interactions/messageComponents';
import type { APIModalSubmitDMInteraction, APIModalSubmitGuildInteraction, APIModalSubmitInteraction } from './_interactions/modalSubmit';
import type { APIPingInteraction } from './_interactions/ping';
export * from './_interactions/applicationCommands';
export type * from './_interactions/autocomplete';
export type * from './_interactions/base';
export type * from './_interactions/messageComponents';
export type * from './_interactions/modalSubmit';
export type * from './_interactions/ping';
export * from './_interactions/responses';
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIInteraction = APIApplicationCommandAutocompleteInteraction | APIApplicationCommandInteraction | APIMessageComponentInteraction | APIModalSubmitInteraction | APIPingInteraction;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIDMInteraction = APIApplicationCommandAutocompleteDMInteraction | APIApplicationCommandDMInteraction | APIMessageComponentDMInteraction | APIModalSubmitDMInteraction;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIGuildInteraction = APIApplicationCommandAutocompleteGuildInteraction | APIApplicationCommandGuildInteraction | APIMessageComponentGuildInteraction | APIModalSubmitGuildInteraction;
//# sourceMappingURL=interactions.d.ts.map