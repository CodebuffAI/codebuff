import type { Snowflake } from '../../../../../globals';
import type { APIApplicationCommandOptionBase, APIInteractionDataOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandAttachmentOption = APIApplicationCommandOptionBase<ApplicationCommandOptionType.Attachment>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteractionDataAttachmentOption = APIInteractionDataOptionBase<ApplicationCommandOptionType.Attachment, Snowflake>;
//# sourceMappingURL=attachment.d.ts.map