import type { Snowflake } from '../../../../globals';
import type { ApplicationCommandType } from '../applicationCommands';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIBaseApplicationCommandInteractionData<Type extends ApplicationCommandType> {
    id: Snowflake;
    type: Type;
    name: string;
}
//# sourceMappingURL=internals.d.ts.map