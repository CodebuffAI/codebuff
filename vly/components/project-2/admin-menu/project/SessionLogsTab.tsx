"use client";

import { useState, useEffect } from "react";
import { Terminal, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface SessionLogsTabProps {
  projectId: Id<"project"> | null;
}

interface SessionInfo {
  sessionId: string;
  commands: Array<{
    commandId: string;
    command: string;
    isRunning: boolean;
  }>;
}

interface CommandLog {
  sessionId: string;
  commandId: string;
  stdout: string;
  stderr: string;
  combined: string;
  timestamp: number;
}

export function SessionLogsTab({ projectId }: SessionLogsTabProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionLogs, setSessionLogs] = useState<Map<string, CommandLog[]>>(
    new Map(),
  );
  const [commandMaps, setCommandMaps] = useState<
    Map<string, Map<string, string>>
  >(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState<Set<string>>(new Set());

  const listSessions = useAction(api.monitoring.listSandboxSessions);
  const getSandboxLogs = useAction(api.monitoring.getSandboxSessionLogs);

  // Load sessions on mount and when projectId changes
  useEffect(() => {
    if (projectId) {
      fetchSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchSessions = async () => {
    if (!projectId) return;

    setLoadingSessions(true);
    setError(null);

    try {
      const result = await listSessions({ projectId });

      if (result.success) {
        setSessions(result.sessions);
        if (result.sessions.length === 0) {
          setError("No active sessions found in this sandbox");
        } else {
          // Auto-fetch logs for all sessions
          result.sessions.forEach((session) => {
            fetchSessionLogs(session.sessionId, session.commands);
          });
        }
      } else {
        setError(result.error || "Failed to fetch sessions");
        setSessions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchSessionLogs = async (
    sessionId: string,
    commands: Array<{ commandId: string; command: string; isRunning: boolean }>,
  ) => {
    if (!projectId) return;

    setLoadingLogs((prev) => new Set(prev).add(sessionId));

    try {
      const logs: CommandLog[] = [];
      const commandMap = new Map<string, string>();

      // Build command lookup map
      for (const cmd of commands) {
        commandMap.set(cmd.commandId, cmd.command);
      }

      // Fetch logs for all commands in this session
      for (const cmd of commands) {
        try {
          const result = await getSandboxLogs({
            projectId,
            sessionId,
            commandId: cmd.commandId,
          });

          if (result.success && result.logs.length > 0) {
            logs.push(...result.logs);
          }
        } catch (err) {
          console.error(
            `Failed to fetch logs for ${sessionId}/${cmd.commandId}:`,
            err,
          );
        }
      }

      setSessionLogs((prev) => new Map(prev).set(sessionId, logs));

      // Store command map for this session
      setCommandMaps((prev) => new Map(prev).set(sessionId, commandMap));
    } finally {
      setLoadingLogs((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-green-50">
              <Terminal className="h-3.5 w-3.5 text-green-600" />
            </div>
            Sandbox Session Logs
          </h3>
          <Button
            onClick={fetchSessions}
            disabled={loadingSessions}
            variant="outline"
            size="sm"
            className="h-8"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingSessions ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">Notice</p>
                <p className="mt-1 text-xs text-amber-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {sessions.length > 0 && (
          <Tabs defaultValue={sessions[0]?.sessionId} className="w-full">
            <TabsList className="w-full justify-start">
              {sessions.map((session) => (
                <TabsTrigger
                  key={session.sessionId}
                  value={session.sessionId}
                  className="text-xs"
                >
                  {session.sessionId}
                  {loadingLogs.has(session.sessionId) && (
                    <RefreshCw className="ml-1 h-3 w-3 animate-spin" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {sessions.map((session) => {
              const logs = sessionLogs.get(session.sessionId) || [];
              const commandMap =
                commandMaps.get(session.sessionId) || new Map();
              return (
                <TabsContent
                  key={session.sessionId}
                  value={session.sessionId}
                  className="space-y-3"
                >
                  {loadingLogs.has(session.sessionId) ? (
                    <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-8 text-center">
                      <RefreshCw className="mx-auto mb-3 h-10 w-10 animate-spin text-zinc-300" />
                      <p className="text-sm font-medium text-zinc-600">
                        Loading logs...
                      </p>
                    </div>
                  ) : logs.length > 0 ? (
                    <div className="rounded-lg border border-zinc-800 bg-[#0a0a0a] p-4 font-mono text-sm shadow-lg">
                      <div className="max-h-96 overflow-auto">
                        {logs.map((log, index) => {
                          const timestamp = new Date(log.timestamp);
                          const timeStr = timestamp.toLocaleTimeString(
                            "en-US",
                            {
                              hour12: false,
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          );
                          const command =
                            commandMap.get(log.commandId) || log.commandId;

                          return (
                            <div key={index} className="mb-4 last:mb-0">
                              <div className="mb-2">
                                <span className="text-xs text-zinc-500">
                                  [{timeStr}]{" "}
                                </span>
                                <span className="text-cyan-400">$ </span>
                                <span className="text-zinc-300">{command}</span>
                                {!log.combined &&
                                  !log.stdout &&
                                  !log.stderr && (
                                    <span className="ml-4 text-xs italic text-zinc-600">
                                      No output
                                    </span>
                                  )}
                              </div>

                              {log.combined && log.combined.trim() && (
                                <div className="mb-1">
                                  <pre className="whitespace-pre-wrap break-words text-green-400">
                                    {log.combined.trim()}
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-8 text-center">
                      <Terminal className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
                      <p className="text-sm font-medium text-zinc-600">
                        No logs available
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        This session has no command logs
                      </p>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {!loadingSessions && sessions.length === 0 && !error && (
          <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-8 text-center">
            <Terminal className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-600">
              No sessions found
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Click refresh to check for active sessions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
