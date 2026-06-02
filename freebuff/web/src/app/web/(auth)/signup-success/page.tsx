"use client";

import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";

export default function SignupSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (router && searchParams) {
      posthog.capture("user_signed_up");
      const redirect = searchParams.get("redirect") || "/";
      router.push(redirect);
    }
  }, [router, searchParams]);

  return <div></div>;
}
