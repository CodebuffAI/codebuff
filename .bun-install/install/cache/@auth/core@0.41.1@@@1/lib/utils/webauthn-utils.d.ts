import type { WebAuthnProviderType } from "../../providers/webauthn.js";
import type { Account, Authenticator, Awaited, InternalOptions, RequestInternal, ResponseInternal, User } from "../../types.js";
import type { Cookie } from "./cookie.js";
import { type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import type { Adapter, AdapterAccount } from "../../adapters.js";
import type { GetUserInfo } from "../../providers/webauthn.js";
export type WebAuthnRegister = "register";
export type WebAuthnAuthenticate = "authenticate";
export type WebAuthnAction = WebAuthnRegister | WebAuthnAuthenticate;
type InternalOptionsWebAuthn = InternalOptions<WebAuthnProviderType> & {
    adapter: Required<Adapter>;
};
export type WebAuthnOptionsResponseBody = {
    action: WebAuthnAuthenticate;
    options: PublicKeyCredentialRequestOptionsJSON;
} | {
    action: WebAuthnRegister;
    options: PublicKeyCredentialCreationOptionsJSON;
};
type WebAuthnOptionsResponse = ResponseInternal & {
    body: WebAuthnOptionsResponseBody;
};
export type CredentialDeviceType = "singleDevice" | "multiDevice";
interface InternalAuthenticator {
    providerAccountId: string;
    credentialID: Uint8Array;
    credentialPublicKey: Uint8Array;
    counter: number;
    credentialDeviceType: CredentialDeviceType;
    credentialBackedUp: boolean;
    transports?: AuthenticatorTransport[];
}
type RGetUserInfo = Awaited<ReturnType<GetUserInfo>>;
/**
 * Infers the WebAuthn options based on the provided parameters.
 *
 * @param action - The WebAuthn action to perform (optional).
 * @param loggedInUser - The logged-in user (optional).
 * @param userInfoResponse - The response containing user information (optional).
 *
 * @returns The WebAuthn action to perform, or null if no inference could be made.
 */
export declare function inferWebAuthnOptions(action: WebAuthnAction | undefined, loggedIn: boolean, userInfoResponse: RGetUserInfo): WebAuthnAction | null;
/**
 * Retrieves the registration response for WebAuthn options request.
 *
 * @param options - The internal options for WebAuthn.
 * @param request - The request object.
 * @param user - The user information.
 * @param resCookies - Optional cookies to be included in the response.
 * @returns A promise that resolves to the WebAuthnOptionsResponse.
 */
export declare function getRegistrationResponse(options: InternalOptionsWebAuthn, request: RequestInternal, user: User & {
    email: string;
}, resCookies?: Cookie[]): Promise<WebAuthnOptionsResponse>;
/**
 * Retrieves the authentication response for WebAuthn options request.
 *
 * @param options - The internal options for WebAuthn.
 * @param request - The request object.
 * @param user - Optional user information.
 * @param resCookies - Optional array of cookies to be included in the response.
 * @returns A promise that resolves to a WebAuthnOptionsResponse object.
 */
export declare function getAuthenticationResponse(options: InternalOptionsWebAuthn, request: RequestInternal, user?: User, resCookies?: Cookie[]): Promise<WebAuthnOptionsResponse>;
export declare function verifyAuthenticate(options: InternalOptionsWebAuthn, request: RequestInternal, resCookies: Cookie[]): Promise<{
    account: AdapterAccount;
    user: User;
}>;
export declare function verifyRegister(options: InternalOptions<WebAuthnProviderType>, request: RequestInternal, resCookies: Cookie[]): Promise<{
    account: Account;
    user: User;
    authenticator: Authenticator;
}>;
export declare function assertInternalOptionsWebAuthn(options: InternalOptions): InternalOptionsWebAuthn;
export declare function fromBase64(base64: string): Uint8Array;
export declare function toBase64(bytes: Uint8Array): string;
export declare function transportsToString(transports: InternalAuthenticator["transports"]): string | undefined;
export declare function stringToTransports(tstring: string | undefined | null): InternalAuthenticator["transports"];
export {};
//# sourceMappingURL=webauthn-utils.d.ts.map