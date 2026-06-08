"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * The dedicated migration screen has been replaced by a non-closable popup
 * that renders on the project page itself (see `MigrationOverlay`). This route
 * now just redirects to the project so any stale links land in the new flow.
 */
export default function MigratingRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const semanticIdentifier = typeof params.id === "string" ? params.id : "";

  useEffect(() => {
    if (!semanticIdentifier) return;
    router.replace(`/web/project/${semanticIdentifier}`);
  }, [router, semanticIdentifier]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
