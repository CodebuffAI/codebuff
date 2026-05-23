import type { Snowflake } from '../../../../../globals';
import type { APIApplicationCommandOptionBase, APIInteractionDataOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
export type APIApplicationCommandAttachmentOption = APIApplicationCommandOptionBase<ApplicationCommandOptionType.Attachment>;
export type APIApplicationCommandInteractionDataAttachmentOption = APIInteractionDataOptionBase<ApplicationCommandOptionType.Attachment, Snowflake>;
//# sourceMappingURL=attachment.d.ts.map