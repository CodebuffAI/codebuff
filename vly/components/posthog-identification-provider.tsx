"use client";

import { useSignedInUser } from "@/hooks/use-user";
import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

export function PosthogIdentificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const posthog = usePostHog();
  const user = useSignedInUser();

  useEffect(() => {
    if (user && !posthog._isIdentified()) {
      posthog.identify(user._id, {
        email: user.email,
        name: user.name,
      });
    }

    if (user === null && posthog._isIdentified()) {
      posthog.reset();
    }
  }, [posthog, user]);

  return <>{children}</>;
}
