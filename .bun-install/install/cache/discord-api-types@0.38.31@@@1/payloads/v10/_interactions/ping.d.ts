import type { APIBaseInteraction } from './base';
import type { InteractionType } from './responses';
export type APIPingInteraction = Omit<APIBaseInteraction<InteractionType.Ping, never>, 'locale'>;
//# sourceMappingURL=ping.d.ts.map