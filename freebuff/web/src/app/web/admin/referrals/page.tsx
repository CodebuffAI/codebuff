"use client";

import { useSignedInUser } from "@/vly/hooks/use-user";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/vly/components/ui/card";
import { Badge } from "@/vly/components/ui/badge";
import { Skeleton } from "@/vly/components/ui/skeleton";
import { Input } from "@/vly/components/ui/input";
import { useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Plus,
  Users,
  Link2,
  TrendingUp,
  CheckCircle,
  Search,
  User,
  Calendar,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/vly/components/ui/table";
import { useRouter } from "next/navigation";

export default function AdminReferralsPage() {
  const user = useSignedInUser();
  const router = useRouter();
  const isAdmin = user?.role === "god" || user?.role === "admin";

  const allCodes = useQuery(api.referrals.getAllReferralCodes);
  const summary = useQuery(api.referrals.getReferralSummary);
  const createCode = useMutation(api.referrals.createReferralCode);
  const toggleCode = useMutation(api.referrals.toggleReferralCode);

  const [selectedCodeId, setSelectedCodeId] =
    useState<Id<"referral_codes"> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCodeOwnerEmail, setNewCodeOwnerEmail] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [useCustomCode, setUseCustomCode] = useState(false);

  const selectedCodeStats = useQuery(
    api.referrals.getReferralStats,
    selectedCodeId ? { codeId: selectedCodeId } : "skip",
  );

  // Filter codes based on search
  const filteredCodes = allCodes?.filter(
    (code) =>
      code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.ownerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.ownerName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCreateCode = async () => {
    setIsCreating(true);
    try {
      const result = await createCode({
        customCode: useCustomCode && customCode ? customCode : undefined,
      });
      toast.success(`Created referral code: ${result.code}`);
      setShowCreateDialog(false);
      setNewCodeOwnerEmail("");
      setCustomCode("");
      setUseCustomCode(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create referral code");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = (url: string, code: string) => {
    const fullUrl = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(fullUrl);
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

  // Redirect non-admin users
  if (user && !isAdmin) {
    router.push("/web/referrals");
    return null;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You need admin access to view this page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">Admin Referral Management</h1>
          <p className="text-muted-foreground">
            Create and manage all referral codes across the platform
          </p>
        </div>

        {/* Summary Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Codes</CardTitle>
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
                From all referral links
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg. Signups/Code
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary && summary.totalCodes > 0
                  ? (summary.totalSignups / summary.totalCodes).toFixed(1)
                  : "0"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Average performance
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Rate</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary && summary.totalCodes > 0
                  ? `${((summary.activeCodes / summary.totalCodes) * 100).toFixed(0)}%`
                  : "0%"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Of codes are active
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by code, email, or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Code
          </Button>
        </div>

        {/* Referral Codes Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Referral Codes</CardTitle>
            <CardDescription>
              Manage all referral codes across the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredCodes === undefined ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredCodes.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">
                  {searchTerm
                    ? "No referral codes found matching your search"
                    : "No referral codes created yet"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Signups</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCodes.map((code) => (
                    <TableRow
                      key={code._id}
                      className="cursor-pointer"
                      onClick={() => setSelectedCodeId(code._id)}
                    >
                      <TableCell>
                        <code className="font-mono font-semibold">
                          {code.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{code.ownerName}</p>
                          <p className="text-sm text-muted-foreground">
                            {code.ownerEmail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={code.active ? "default" : "secondary"}>
                          {code.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">{code.uses_count}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {new Date(code.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCode(code._id);
                            }}
                          >
                            {code.active ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyLink(getFullUrl(code.code), code.code);
                            }}
                          >
                            {copiedCode === code.code ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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

        {/* Code Details Dialog */}
        <Dialog
          open={!!selectedCodeId}
          onOpenChange={() => setSelectedCodeId(null)}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Referral Code Details</DialogTitle>
              <DialogDescription>
                Detailed information about this referral code
              </DialogDescription>
            </DialogHeader>
            {selectedCodeStats === undefined ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : selectedCodeStats ? (
              <div className="space-y-6">
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

                {selectedCodeStats.referred_users.length > 0 ? (
                  <div>
                    <p className="mb-3 font-medium">
                      Referred Users ({selectedCodeStats.referred_users.length})
                    </p>
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Signup Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedCodeStats.referred_users.map(
                            (user, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {user.name}
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                  {new Date(
                                    user.signupDate,
                                  ).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted p-6 text-center">
                    <User className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No users have signed up with this code yet
                    </p>
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
      </div>
    </div>
  );
}
