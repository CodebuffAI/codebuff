"use client";

import { Button } from "@/vly/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/vly/hooks/use-toast";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { useMutation } from "convex/react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isAccepting, setIsAccepting] = useState(false);
  const acceptInvite = useMutation(api.invites.acceptInvite);
  const { token } = use(params);
  const user = useSignedInUser();

  // If no user is found, show sign in
  if (user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Button
          onClick={() =>
            signIn("github", { callbackUrl: `/web/invite/${token}` })
          }
        >
          Sign in to accept invite
        </Button>
      </div>
    );
  }

  const handleAcceptInvite = async () => {
    setIsAccepting(true);
    console.log("Starting invite acceptance process...");
    console.log("Token:", token);
    console.log("User:", user);

    try {
      console.log("Calling acceptInvite mutation...");
      const semanticIdentifier = await acceptInvite({
        token,
      });

      console.log("AcceptInvite result:", semanticIdentifier);

      if (!semanticIdentifier) {
        throw new Error("No semantic identifier returned from acceptInvite");
      }

      console.log("Showing success toast...");
      toast({
        title: "Success",
        description: "You have been added to the project",
      });

      console.log("Navigating to project:", `/web/project/${semanticIdentifier}`);
      // Navigate using the semantic identifier
      router.push(`/web/project/${semanticIdentifier}`);
    } catch (error) {
      console.error("Full error object:", error);
      console.error(
        "Error message:",
        error instanceof Error ? error.message : String(error),
      );
      console.error(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack trace",
      );

      // Check if it's a Convex error with additional data
      if (error && typeof error === "object" && "data" in error) {
        console.error("Error data:", (error as any).data);
      }

      let errorMessage = "Failed to accept invitation";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object" && "message" in error) {
        errorMessage = String((error as any).message);
      }

      toast({
        title: "Error",
        description: `Invite acceptance failed: ${errorMessage}`,
        variant: "destructive",
      });
      setIsAccepting(false);
    }
  };

  // Show loading state while checking user
  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="mb-4 text-2xl font-bold">Project Invitation</h1>
        <p className="mb-4">
          You have been invited to collaborate on a project.
        </p>
        <Button onClick={handleAcceptInvite} disabled={isAccepting}>
          {isAccepting ? "Accepting..." : "Accept Invitation"}
        </Button>
      </div>
    </div>
  );
}
