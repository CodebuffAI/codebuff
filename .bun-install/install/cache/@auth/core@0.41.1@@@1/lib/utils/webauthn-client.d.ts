/** @typedef {"authenticate"} WebAuthnAuthenticate */
/** @typedef {"register"} WebAuthnRegister */
/** @typedef {WebAuthnRegister | WebAuthnAuthenticate} WebAuthnOptionsAction */
/**
 * @template {WebAuthnOptionsAction} T
 * @typedef {T extends WebAuthnAuthenticate ?
 *  { options: import("@simplewebauthn/types").PublicKeyCredentialRequestOptionsJSON; action: "authenticate" } :
 *  T extends WebAuthnRegister ?
 *  { options: import("@simplewebauthn/types").PublicKeyCredentialCreationOptionsJSON; action: "register" } :
 * never
 * } WebAuthnOptionsReturn
 */
/**
 * webauthnScript is the client-side script that handles the webauthn form
 *
 * @param {string} authURL is the URL of the auth API
 * @param {string} providerID is the ID of the webauthn provider
 */
export function webauthnScript(authURL: string, providerID: string): Promise<void>;
export type WebAuthnAuthenticate = "authenticate";
export type WebAuthnRegister = "register";
export type WebAuthnOptionsAction = WebAuthnRegister | WebAuthnAuthenticate;
export type WebAuthnOptionsReturn<T extends WebAuthnOptionsAction> = T extends WebAuthnAuthenticate ? {
    options: import("@simplewebauthn/types").PublicKeyCredentialRequestOptionsJSON;
    action: "authenticate";
} : T extends WebAuthnRegister ? {
    options: import("@simplewebauthn/types").PublicKeyCredentialCreationOptionsJSON;
    action: "register";
} : never;
//# sourceMappingURL=webauthn-client.d.ts.map