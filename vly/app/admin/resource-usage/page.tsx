"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useSignedInUser } from "@/hooks/use-user";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";

export default function ResourceUsageAdminPage() {
  const user = useSignedInUser();
  const isAdmin = user?.role === "god" || user?.role === "admin";

  const leaderboard = useQuery(
    api.admin_usage.getUsageLeaderboard,
    isAdmin ? { limit: 80 } : "skip",
  );

  if (user === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin access is required to view usage estimates.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/40 p-2">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform usage estimates
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Convex does not attribute database bandwidth or action compute to
            individual users. This table ranks users by{" "}
            <strong>recorded agent runs</strong> (incremented when a user starts
            the VLY agent from chat). It is a practical proxy for who drives
            backend load; combine with the Convex dashboard for deployment-wide
            totals.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top users by agent invocations</CardTitle>
          <CardDescription>
            Sorted by total recorded runs. Data backfills only from deploy time
            forward.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard === undefined ? (
            <Skeleton className="h-48 w-full" />
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No usage rows yet. Agent runs will appear after this release is
              deployed and users send messages to the agent.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Agent runs</TableHead>
                  <TableHead className="text-right">Last run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((row, i) => (
                  <TableRow key={row.userId}>
                    <TableCell className="text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.email}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.agentInvocations.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(row.lastInvocationAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
