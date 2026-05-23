import type { APIApplicationCommandDMInteraction, APIApplicationCommandGuildInteraction, APIApplicationCommandInteraction } from './_interactions/applicationCommands';
import type { APIApplicationCommandAutocompleteDMInteraction, APIApplicationCommandAutocompleteGuildInteraction, APIApplicationCommandAutocompleteInteraction } from './_interactions/autocomplete';
import type { APIMessageComponentDMInteraction, APIMessageComponentGuildInteraction, APIMessageComponentInteraction } from './_interactions/messageComponents';
import type { APIModalSubmitDMInteraction, APIModalSubmitGuildInteraction, APIModalSubmitInteraction } from './_interactions/modalSubmit';
import type { APIPingInteraction } from './_interactions/ping';
export * from './_interactions/applicationCommands';
export * from './_interactions/autocomplete';
export * from './_interactions/base';
export * from './_interactions/messageComponents';
export * from './_interactions/modalSubmit';
export * from './_interactions/ping';
export * from './_interactions/responses';
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIInteraction = APIApplicationCommandAutocompleteInteraction | APIApplicationCommandInteraction | APIMessageComponentInteraction | APIModalSubmitInteraction | APIPingInteraction;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIDMInteraction = APIApplicationCommandAutocompleteDMInteraction | APIApplicationCommandDMInteraction | APIMessageComponentDMInteraction | APIModalSubmitDMInteraction;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIGuildInteraction = APIApplicationCommandAutocompleteGuildInteraction | APIApplicationCommandGuildInteraction | APIMessageComponentGuildInteraction | APIModalSubmitGuildInteraction;
//# sourceMappingURL=interactions.d.ts.map