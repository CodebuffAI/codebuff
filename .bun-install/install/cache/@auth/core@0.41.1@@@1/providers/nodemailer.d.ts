import type { Transport, TransportOptions } from "nodemailer";
import * as JSONTransport from "nodemailer/lib/json-transport/index.js";
import * as SendmailTransport from "nodemailer/lib/sendmail-transport/index.js";
import * as SESTransport from "nodemailer/lib/ses-transport/index.js";
import * as SMTPPool from "nodemailer/lib/smtp-pool/index.js";
import * as SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import * as StreamTransport from "nodemailer/lib/stream-transport/index.js";
import type { Awaitable, Theme } from "../types.js";
import type { EmailConfig } from "./email.js";
type AllTransportOptions = string | SMTPTransport | SMTPTransport.Options | SMTPPool | SMTPPool.Options | SendmailTransport | SendmailTransport.Options | StreamTransport | StreamTransport.Options | JSONTransport | JSONTransport.Options | SESTransport | SESTransport.Options | Transport<any> | TransportOptions;
export interface NodemailerConfig extends EmailConfig {
    server?: AllTransportOptions;
    sendVerificationRequest: (params: {
        identifier: string;
        url: string;
        expires: Date;
        provider: NodemailerConfig;
        token: string;
        theme: Theme;
        request: Request;
    }) => Awaitable<void>;
    options?: NodemailerUserConfig;
}
export type NodemailerUserConfig = Omit<Partial<NodemailerConfig>, "options" | "type">;
export default function Nodemailer(config: NodemailerUserConfig): NodemailerConfig;
export {};
//# sourceMappingURL=nodemailer.d.ts.map