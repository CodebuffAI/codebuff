"use client";

import Footer from "@/components/landing-4/Footer";
import Navigation from "@/components/landing-4/Navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSignedInUser } from "@/hooks/use-user";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export default function ReferralsPage() {
  const user = useSignedInUser();
  const isGod = user?.role === "god";

  const summary = useQuery(api.referrals.getReferralSummary);
  const userCodes = useQuery(api.referrals.getUserReferralCodes);
  const allCodes = useQuery(
    api.referrals.getAllReferralCodes,
    isGod ? {} : "skip",
  );
  const createCode = useMutation(api.referrals.createReferralCode);
  const toggleCode = useMutation(api.referrals.toggleReferralCode);

  const [selectedCodeId, setSelectedCodeId] =
    useState<Id<"referral_codes"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [useCustomCode, setUseCustomCode] = useState(false);

  const selectedCodeStats = useQuery(
    api.referrals.getReferralStats,
    selectedCodeId ? { codeId: selectedCodeId } : "skip",
  );

  const codes = isGod ? allCodes : userCodes;

  const handleCreateCode = async () => {
    setIsCreating(true);
    try {
      const result = await createCode({
        customCode: useCustomCode && customCode ? customCode : undefined,
      });
      toast.success(`Created referral code: ${result.code}`);
      setShowCreateDialog(false);
      setCustomCode("");
      setUseCustomCode(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create referral code");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = (url: string, code: string) => {
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleToggleCode = async (codeId: Id<"referral_codes">) => {
    try {
      const result = await toggleCode({ codeId });
      toast.success(result.active ? "Code activated" : "Code deactivated");
    } catch (error) {
      toast.error("Failed to toggle code status");
    }
  };

  const getFullUrl = (code: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/?ref=${code}`;
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-semibold">Please sign in</h2>
          <p className="text-muted-foreground">
            You need to be signed in to view referral codes
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">Referral Dashboard</h1>
            <p className="text-muted-foreground">
              {isGod
                ? "View and manage all referral codes"
                : "Manage your referral codes and track signups"}
            </p>
          </div>

          {/* Summary Cards */}
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Codes
                </CardTitle>
                <Link2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary?.totalCodes ?? <Skeleton className="h-8 w-20" />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary?.activeCodes} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Signups
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary?.totalSignups ?? <Skeleton className="h-8 w-20" />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  From referral links
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Conversion Rate
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary && summary.totalCodes > 0
                    ? `${((summary.totalSignups / summary.totalCodes) * 100).toFixed(1)}%`
                    : "0%"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Average per code
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Create New Code Button */}
          {!isGod && (
            <div className="mb-6">
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Referral Code
              </Button>
            </div>
          )}

          {/* Referral Codes List */}
          <Card>
            <CardHeader>
              <CardTitle>
                {isGod ? "All Referral Codes" : "Your Referral Codes"}
              </CardTitle>
              <CardDescription>
                Click on a code to view detailed statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {codes === undefined ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : codes.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="mb-4 text-muted-foreground">
                    {isGod
                      ? "No referral codes created yet"
                      : "You haven't created any referral codes yet"}
                  </p>
                  {!isGod && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First Code
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {codes.map((code) => (
                    <div
                      key={code._id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50"
                      onClick={() => setSelectedCodeId(code._id)}
                    >
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <code className="font-mono text-lg font-semibold">
                            {code.code}
                          </code>
                          <Badge
                            variant={code.active ? "default" : "secondary"}
                          >
                            {code.active ? "Active" : "Inactive"}
                          </Badge>
                          {isGod && "ownerEmail" in code && (
                            <span className="text-sm text-muted-foreground">
                              ({code.ownerEmail as string})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{code.uses_count} signups</span>
                          <span>
                            Created{" "}
                            {new Date(code.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCode(code._id);
                          }}
                        >
                          {code.active ? (
                            <>
                              <EyeOff className="mr-1 h-4 w-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Eye className="mr-1 h-4 w-4" />
                              Activate
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(getFullUrl(code.code), code.code);
                          }}
                        >
                          {copiedCode === code.code ? (
                            <>
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 h-4 w-4" />
                              Copy Link
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Code Details Dialog */}
          <Dialog
            open={!!selectedCodeId}
            onOpenChange={() => setSelectedCodeId(null)}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Referral Code Details</DialogTitle>
                <DialogDescription>
                  View detailed statistics and users who signed up with this
                  code
                </DialogDescription>
              </DialogHeader>
              {selectedCodeStats === undefined ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : selectedCodeStats ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Code</p>
                      <p className="font-mono text-lg font-semibold">
                        {selectedCodeStats.code}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge
                        variant={
                          selectedCodeStats.active ? "default" : "secondary"
                        }
                      >
                        {selectedCodeStats.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Signups
                      </p>
                      <p className="text-lg font-semibold">
                        {selectedCodeStats.uses_count}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="text-lg">
                        {new Date(
                          selectedCodeStats.created_at,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Referral Link
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted p-2 text-sm">
                        {getFullUrl(selectedCodeStats.code)}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleCopyLink(
                            getFullUrl(selectedCodeStats.code),
                            selectedCodeStats.code,
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedCodeStats.referred_users.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm text-muted-foreground">
                        Users ({selectedCodeStats.referred_users.length})
                      </p>
                      <div className="max-h-60 overflow-y-auto">
                        <div className="space-y-2">
                          {selectedCodeStats.referred_users.map(
                            (user, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between rounded border p-2"
                              >
                                <div>
                                  <p className="font-medium">{user.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {user.email}
                                  </p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(
                                    user.signupDate,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">
                  Failed to load code details
                </p>
              )}
            </DialogContent>
          </Dialog>

          {/* Create Code Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Referral Code</DialogTitle>
                <DialogDescription>
                  Create a custom referral code or auto-generate one
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!useCustomCode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setUseCustomCode(false);
                        setCustomCode("");
                      }}
                      className="flex-1"
                    >
                      Auto-Generate
                    </Button>
                    <Button
                      type="button"
                      variant={useCustomCode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUseCustomCode(true)}
                      className="flex-1"
                    >
                      Custom Code
                    </Button>
                  </div>

                  {useCustomCode ? (
                    <div className="space-y-2">
                      <Input
                        placeholder="Enter custom code (e.g., SUMMER2024)"
                        value={customCode}
                        onChange={(e) =>
                          setCustomCode(e.target.value.toUpperCase())
                        }
                        maxLength={20}
                        pattern="[A-Z0-9]*"
                      />
                      <p className="text-xs text-muted-foreground">
                        3-20 characters, letters and numbers only
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      A unique 8-character code will be automatically generated.
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleCreateCode}
                  disabled={
                    isCreating ||
                    (useCustomCode && (!customCode || customCode.length < 3))
                  }
                  className="w-full"
                >
                  {isCreating
                    ? "Creating..."
                    : useCustomCode
                      ? "Create Custom Code"
                      : "Generate Code"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Footer />
    </>
  );
}
