"use client";

import React, { createContext, useContext } from "react";

/**
 * Opt-in switch for the WebContainer project-creation path.
 *
 * Production /web renders the landing WITHOUT this provider, so all its
 * project creations stay on the Daytona pool. The admin-only /web/test page
 * wraps the landing in <WebContainerOptInProvider>, which makes the hero
 * inputs pass `useWebContainer: true` to `codesandbox.create.create`.
 *
 * This is a UX-level switch only — the real gate is server-side in the
 * create mutation, which honors the arg exclusively for god/admin users.
 */
const WebContainerOptInContext = createContext(false);

export function WebContainerOptInProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WebContainerOptInContext.Provider value={true}>
      {children}
    </WebContainerOptInContext.Provider>
  );
}

export function useWebContainerOptIn(): boolean {
  return useContext(WebContainerOptInContext);
}
