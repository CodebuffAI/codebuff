"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRightLeft,
  Mail,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/vly/components/ui/alert-dialog";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import { Input } from "@/vly/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/vly/components/ui/table";

type ProjectMember = {
  _id: string;
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  role: "owner" | "admin" | "member";
  addedAt: number;
};

function sortMembers(members: ProjectMember[]) {
  const roleOrder = {
    owner: 0,
    admin: 1,
    member: 2,
  } as const;

  return [...members].sort((a, b) => {
    const byRole = roleOrder[a.role] - roleOrder[b.role];
    if (byRole !== 0) {
      return byRole;
    }

    return a.userName.localeCompare(b.userName);
  });
}

export function AdminProjectOwnershipManager() {
  const [semanticIdentifierInput, setSemanticIdentifierInput] = useState("");
  const [submittedSemanticIdentifier, setSubmittedSemanticIdentifier] =
    useState<string | null>(null);
  const [memberPendingTransfer, setMemberPendingTransfer] =
    useState<ProjectMember | null>(null);
  const [transferringUserId, setTransferringUserId] = useState<string | null>(
    null,
  );
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [transferEmail, setTransferEmail] = useState("");
  const [isTransferringByEmail, setIsTransferringByEmail] = useState(false);

  const projectManagement = useQuery(
    api.admin.getProjectManagementBySemanticIdentifier,
    submittedSemanticIdentifier
      ? { semanticIdentifier: submittedSemanticIdentifier }
      : "skip",
  );
  const transferProjectOwnershipByEmail = useAction(
    api.invites.transferProjectOwnershipByEmail,
  );
  const removeProjectMember = useMutation(api.project.removeProjectMember);
  const transferProjectOwnership = useMutation(
    api.project.transferProjectOwnership,
  );

  const sortedMembers = useMemo(
    () => sortMembers(projectManagement?.members ?? []),
    [projectManagement?.members],
  );

  const currentOwner = sortedMembers.find((member) => member.role === "owner");

  const handleLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const semanticIdentifier = semanticIdentifierInput.trim();
    if (!semanticIdentifier) {
      return;
    }

    setSubmittedSemanticIdentifier(semanticIdentifier);
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    if (!projectManagement) {
      return;
    }

    try {
      setRemovingUserId(member.userId);
      await removeProjectMember({
        projectId: projectManagement.project._id,
        userId: member.userId,
      });
      toast.success(`${member.userName} was removed from the project`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove member",
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleTransferOwnership = async () => {
    if (!projectManagement || !memberPendingTransfer) {
      return;
    }

    try {
      setTransferringUserId(memberPendingTransfer.userId);
      await transferProjectOwnership({
        projectId: projectManagement.project._id,
        newOwnerUserId: memberPendingTransfer.userId,
      });
      toast.success(
        `${memberPendingTransfer.userName} is now the project owner`,
      );
      setMemberPendingTransfer(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to transfer project ownership",
      );
    } finally {
      setTransferringUserId(null);
    }
  };

  const handleTransferByEmail = async () => {
    if (!projectManagement) {
      return;
    }

    const normalizedEmail = transferEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    try {
      setIsTransferringByEmail(true);
      const result = await transferProjectOwnershipByEmail({
        projectId: projectManagement.project._id,
        email: normalizedEmail,
      });

      if (result.status === "transferred") {
        toast.success(`${normalizedEmail} is now the project owner`);
      } else {
        toast.success(
          `Ownership invite sent to ${normalizedEmail}. The transfer will complete when they accept.`,
        );
      }

      setTransferEmail("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to transfer project ownership by email",
      );
    } finally {
      setIsTransferringByEmail(false);
    }
  };

  const isLookingUpProject =
    submittedSemanticIdentifier !== null && projectManagement === undefined;

  return (
    <>
      <Card className="border border-gray-200 bg-white shadow-sm">
        <CardHeader className="border-b border-gray-100 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl text-black">
            <Users className="h-5 w-5 text-purple-600" />
            Project Ownership Manager
          </CardTitle>
          <CardDescription className="text-sm text-gray-600">
            Look up a project by semantic ID, review collaborators, remove
            members, and transfer ownership to another existing member.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <form
            onSubmit={handleLookup}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Input
              value={semanticIdentifierInput}
              onChange={(event) =>
                setSemanticIdentifierInput(event.target.value)
              }
              placeholder="Enter project semantic ID"
              className="h-10 border-gray-200"
            />
            <Button
              type="submit"
              className="h-10 px-4"
              disabled={!semanticIdentifierInput.trim() || isLookingUpProject}
            >
              {isLookingUpProject ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking up
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Load project
                </>
              )}
            </Button>
          </form>

          {!submittedSemanticIdentifier && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
              Enter a semantic ID to load a project and manage its
              collaborators.
            </div>
          )}

          {submittedSemanticIdentifier && isLookingUpProject && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
              Loading project details for{" "}
              <span className="font-mono text-gray-900">
                {submittedSemanticIdentifier}
              </span>
              .
            </div>
          )}

          {submittedSemanticIdentifier && projectManagement === null && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              No project matched{" "}
              <span className="font-mono">{submittedSemanticIdentifier}</span>.
            </div>
          )}

          {projectManagement && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Project
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {projectManagement.project.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-gray-600">
                    {projectManagement.project.semantic_identifier}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Current Owner
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {currentOwner?.userName ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {currentOwner?.userEmail ?? "No email"}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Project State
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {projectManagement.project.state}
                    </Badge>
                    {projectManagement.project.deleted && (
                      <Badge className="bg-red-100 text-red-700">Deleted</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Project Link
                  </p>
                  <Link
                    href={`/web/project/${projectManagement.project.semantic_identifier}`}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    Open project
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Transfer To Email
                  </h3>
                </div>
                <p className="mb-3 text-xs text-gray-600">
                  Admins can transfer ownership to any email. If the email
                  already belongs to a user, the transfer happens immediately.
                  Otherwise an ownership invite is sent and the current owner
                  stays owner until it is accepted.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={transferEmail}
                    onChange={(event) => setTransferEmail(event.target.value)}
                    placeholder="new-owner@example.com"
                    className="h-10 border-gray-200 bg-white"
                  />
                  <Button
                    type="button"
                    className="h-10 px-4"
                    disabled={
                      !transferEmail.trim() ||
                      isTransferringByEmail ||
                      !!transferringUserId ||
                      !!removingUserId
                    }
                    onClick={() => {
                      void handleTransferByEmail();
                    }}
                  >
                    {isTransferringByEmail ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Transfer to email
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Collaborators
                    </h3>
                    <p className="text-xs text-gray-600">
                      Promoting a collaborator to owner automatically demotes
                      the current owner to member.
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {sortedMembers.length} member
                    {sortedMembers.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedMembers.map((member) => {
                      const isOwner = member.role === "owner";
                      const isRemoving = removingUserId === member.userId;
                      const isTransferring =
                        transferringUserId === member.userId;

                      return (
                        <TableRow key={member._id}>
                          <TableCell className="font-medium text-gray-900">
                            {member.userName}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {member.userEmail}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isOwner ? "default" : "secondary"}
                              className={
                                isOwner
                                  ? "bg-purple-500 hover:bg-purple-600"
                                  : ""
                              }
                            >
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isOwner ? (
                              <span className="text-xs text-gray-500">
                                Current owner
                              </span>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 px-2.5"
                                  disabled={
                                    !!removingUserId || !!transferringUserId
                                  }
                                  onClick={() =>
                                    setMemberPendingTransfer(member)
                                  }
                                >
                                  {isTransferring ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                  )}
                                  Transfer ownership
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 px-2.5 text-red-600 hover:text-red-700"
                                  disabled={
                                    !!transferringUserId || !!removingUserId
                                  }
                                  onClick={() => handleRemoveMember(member)}
                                >
                                  {isRemoving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  Remove
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={memberPendingTransfer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMemberPendingTransfer(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer project ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberPendingTransfer?.userName} will become the new owner. The
              current owner will be downgraded to member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!transferringUserId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleTransferOwnership();
              }}
              disabled={!!transferringUserId}
            >
              {transferringUserId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Transferring
                </>
              ) : (
                "Transfer ownership"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
