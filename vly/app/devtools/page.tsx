"use client";
import { useSignedInUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import NotFound from "@/app/not-found";
import Devtools from "@/components/devtools";

export default function DevtoolsPage() {
  const user = useSignedInUser();
  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading ...</p>
        </div>
      </div>
    );
  }
  return user && user.role === "god" ? <Devtools /> : <NotFound />;
}
