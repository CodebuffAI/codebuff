const actions = [
    "providers",
    "session",
    "csrf",
    "signin",
    "signout",
    "callback",
    "verify-request",
    "error",
    "webauthn-options",
];
export function isAuthAction(action) {
    return actions.includes(action);
}
