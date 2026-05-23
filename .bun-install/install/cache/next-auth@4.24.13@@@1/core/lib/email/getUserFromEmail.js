"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getAdapterUserFromEmail;
async function getAdapterUserFromEmail({
  email,
  adapter
}) {
  const {
    getUserByEmail
  } = adapter;
  const adapterUser = email ? await getUserByEmail(email) : null;
  if (adapterUser) return adapterUser;
  return {
    id: email,
    email,
    emailVerified: null
  };
}