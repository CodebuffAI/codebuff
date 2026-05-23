// TODO: Kepts for backwards compatibility
// Remove this import and encourage users
// to import it from @auth/core/providers/nodemailer directly
import Nodemailer from "./nodemailer.js";
/**
 * @deprecated
 *
 * Import this provider from the `providers/nodemailer` submodule instead of `providers/email`.
 *
 * To log in with nodemailer, change `signIn("email")` to `signIn("nodemailer")`
 */
export default function Email(config) {
    return {
        ...Nodemailer(config),
        id: "email",
        name: "Email",
    };
}
