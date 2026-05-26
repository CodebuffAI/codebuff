"use client";

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useSignedInUser } from "@/vly/hooks/use-user";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/vly/components/ui/table";
import { Badge } from "@/vly/components/ui/badge";
import { Button } from "@/vly/components/ui/button";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { BarChart3, Cpu, Loader, RefreshCw, Users, Zap } from "lucide-react";
import { toast } from "sonner";

export default function ResourceUsageAdminPage() {
  const user = useSignedInUser();
  const isAdmin = user?.role === "god" || user?.role === "admin";
  const [refreshing, setRefreshing] = useState(false);

  const data = useQuery(
    api.admin_usage.getAdminUsageData,
    isAdmin ? {} : "skip",
  );

  const refreshModelStats = useMutation(
    (api as any).admin_usage_backfill.refreshModelStats,
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshModelStats({});
      toast.success(
        "Model stats refresh started. Data will update in a few minutes.",
      );
    } catch {
      toast.error("Failed to start refresh.");
    }
    setRefreshing(false);
  };

  const models = data?.models;
  const modelsByType = useMemo(() => {
    if (!models) return { cli: [], v2: [] };
    const cli = models
      .filter((m) => m.agentType !== "v2")
      .sort((a, b) => b.total - a.total);
    const v2 = models
      .filter((m) => m.agentType === "v2")
      .sort((a, b) => b.total - a.total);
    return { cli, v2 };
  }, [models]);

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

  const totalRuns = data?.users.reduce((sum, r) => sum + r.totalRuns, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-border bg-muted/40 p-2">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Platform usage
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Top 10 users (live) and model breakdown (on-demand).
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          {refreshing ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh model stats
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Top 10 users</CardTitle>
                </div>
                <Badge variant="outline">
                  {totalRuns.toLocaleString()} total runs
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {data.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">V2</TableHead>
                      <TableHead className="text-right">CLI</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Last run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.users.map((row, i) => (
                      <TableRow key={row.userId}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.email}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.v2Runs.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.cliRuns.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {row.totalRuns.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(row.lastRunAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {[
            { title: "CLI Agent Models", icon: Cpu, rows: modelsByType.cli },
            { title: "V2 Agent Models", icon: Zap, rows: modelsByType.v2 },
          ].map(({ title, icon: Icon, rows }) => (
            <Card key={title}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>{title}</CardTitle>
                  </div>
                  <Badge variant="outline">
                    {rows.reduce((s, r) => s + r.total, 0).toLocaleString()}{" "}
                    total
                  </Badge>
                </div>
                <CardDescription>
                  Click &quot;Refresh model stats&quot; to update.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No data yet. Click refresh to scan.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Today</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow key={row.model}>
                          <TableCell className="text-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.model}
                            {row.recent > 0 && (
                              <Badge
                                variant="outline"
                                className="ml-2 border-green-200 bg-green-50 text-xs text-green-700"
                              >
                                active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            {row.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.recent > 0 ? (
                              <span className="text-green-600">
                                +{row.recent.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
