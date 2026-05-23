/**
 * <div style={{backgroundColor: "#24292f", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Loops</b> integration.</span>
 * <a href="https://loops.so">
 *  <img style={{display: "block"}} src="https://authjs.dev/img/providers/loops.svg" width="48"/>
 * </a>
 * </div>
 *
 * @module providers/loops
 */
import type { EmailConfig } from "./email.js";
export type LoopsUserConfig = Omit<Partial<LoopsConfig>, "options" | "type">;
export interface LoopsConfig extends Omit<EmailConfig, "sendVerificationRequest" | "options"> {
    id: string;
    apiKey: string;
    transactionalId: string;
    sendVerificationRequest: (params: Params) => Promise<void>;
    options: LoopsUserConfig;
}
type Params = Parameters<EmailConfig["sendVerificationRequest"]>[0] & {
    provider: LoopsConfig;
};
/**
 *
 * @param config
 * @returns LoopsConfig
 * @requires LoopsUserConfig
 * @example
 * ```ts
 * Loops({
 *   apiKey: process.env.AUTH_LOOPS_KEY,
 *   transactionalId: process.env.AUTH_LOOPS_TRANSACTIONAL_ID,
 * })
 * ```
 *
 * @typedef LoopsUserConfig
 */
export default function Loops(config: LoopsUserConfig): LoopsConfig;
export {};
//# sourceMappingURL=loops.d.ts.map