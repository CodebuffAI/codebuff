"use client";

import { AutumnProvider } from "autumn-js/react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

export function AutumnWrapper({ children }: { children: React.ReactNode }) {
  const convex = useConvex();

  // Wait for Convex to be ready before rendering AutumnProvider
  if (!convex) {
    return <>{children}</>;
  }

  return (
    <AutumnProvider convex={convex} convexApi={api.autumn}>
      {children}
    </AutumnProvider>
  );
}
