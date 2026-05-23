import type { APIBaseInteraction } from './base';
import type { InteractionType } from './responses';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIPingInteraction = Omit<APIBaseInteraction<InteractionType.Ping, never>, 'locale'>;
//# sourceMappingURL=ping.d.ts.map