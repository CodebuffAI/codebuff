import { Button } from "@/vly/components/ui/button";
import { Input } from "@/vly/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/vly/components/ui/table";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getRootDomain, getSubdomain } from "@/vly/lib/utils";
import { useAction, useQuery } from "convex/react";
import { ArrowLeft, Check, Copy, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

const validateDomain = (
  domain: string,
): { isValid: boolean; error?: string } => {
  if (!domain.trim()) {
    return { isValid: false, error: "Domain is required" };
  }

  // Remove protocol prefixes
  if (domain.startsWith("http://") || domain.startsWith("https://")) {
    return {
      isValid: false,
      error: "Remove http:// or https:// from the domain",
    };
  }

  // Remove trailing slash
  const cleanDomain = domain.replace(/\/$/, "");

  // Basic domain regex pattern
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!domainRegex.test(cleanDomain)) {
    return { isValid: false, error: "Please enter a valid domain name" };
  }

  // Check for minimum domain structure (at least one dot)
  if (!cleanDomain.includes(".")) {
    return {
      isValid: false,
      error: "Domain must include a top-level domain (e.g., .com)",
    };
  }

  // Check for common invalid patterns
  if (cleanDomain.startsWith(".") || cleanDomain.endsWith(".")) {
    return { isValid: false, error: "Domain cannot start or end with a dot" };
  }

  if (cleanDomain.includes("..")) {
    return { isValid: false, error: "Domain cannot contain consecutive dots" };
  }

  // Check length constraints
  if (cleanDomain.length > 253) {
    return { isValid: false, error: "Domain name is too long" };
  }

  return { isValid: true };
};

const CopyButton = ({ text }: { text: string }) => {
  const [isCopied, setIsCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => {
          setIsCopied(false);
        }, 2000);
      }}
    >
      {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
};

const DNSRecordTable = ({
  records,
}: {
  records: { type: string; name: string; value: string; success: boolean }[];
}) => {
  return (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-[560px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead className="w-1/2">Name/Host</TableHead>
            <TableHead className="w-1/2">Value</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono">
          {records.map((record) => (
            <TableRow key={record.name}>
              <TableCell className="w-[100px]">{record.type}</TableCell>
              <TableCell className="overflow-x-auto whitespace-nowrap scrollbar-hide">
                <div className="flex items-center gap-1">
                  <CopyButton text={record.name} />
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground">
                    {record.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="overflow-x-auto whitespace-nowrap scrollbar-hide">
                <div className="flex items-center gap-1">
                  <CopyButton text={record.value} />
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground">
                    {record.value}
                  </span>
                </div>
              </TableCell>
              <TableCell className="w-[50px]">
                {record.success ? (
                  <Check className="text-green-500" />
                ) : (
                  <X className="text-red-500" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const NumberedStep = ({
  number,
  children,
}: {
  number: number;
  children: React.ReactNode;
}) => {
  return (
    <div>
      <span className="flex items-center gap-2 text-sm font-semibold">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted/30 text-foreground">
          <span>{number}</span>
        </div>
        {children}
      </span>
    </div>
  );
};

export type NewDomainWorkflowPage = "new" | "set-records";

const NewDomainPage = ({
  onNext,
  projectId,
}: {
  onNext: (domain: string) => void;
  projectId: string;
}) => {
  const [unconfirmedDomain, setUnconfirmedDomain] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registerDomainAndGetVerificationCode = useAction(
    api.domains.registerDomainAndGetVerificationCode,
  );

  const handleDomainChange = (value: string) => {
    setUnconfirmedDomain(value);
    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError("");
    }
  };

  const handleNext = async () => {
    // Validate domain before submitting
    const validation = validateDomain(unconfirmedDomain);
    if (!validation.isValid) {
      setValidationError(validation.error || "Invalid domain");
      return;
    }

    setIsSubmitting(true);
    setValidationError("");

    try {
      await registerDomainAndGetVerificationCode({
        projectId: projectId as Id<"project">,
        domain: unconfirmedDomain.replace(/\/$/, ""), // Clean domain before submitting
      });
      onNext(unconfirmedDomain);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        setValidationError("Failed to register domain. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const validation = validateDomain(unconfirmedDomain);
  const isValid = validation.isValid;

  return (
    <div className="flex flex-col gap-4">
      <NumberedStep number={1}>
        <span>Enter a domain</span>
      </NumberedStep>
      <div className="flex flex-col gap-2">
        <Input
          placeholder="example.com"
          value={unconfirmedDomain}
          onChange={(e) => handleDomainChange(e.target.value)}
          className={validationError ? "border-red-500" : ""}
        />
        {validationError && (
          <span className="text-sm text-red-500">{validationError}</span>
        )}
      </div>

      <div className="flex justify-between">
        <Button
          disabled={!unconfirmedDomain || !isValid || isSubmitting}
          onClick={handleNext}
        >
          {isSubmitting ? "Adding..." : "Next"}
        </Button>
      </div>
    </div>
  );
};

type DNSRecord = {
  type: "TXT" | "CNAME" | "A";
  name: string;
  value: string;
  success: boolean;
};

const SetRecordsPage = ({
  domain,
  onComplete,
}: {
  domain: string;
  onComplete: () => void;
}) => {
  const domainDetails = useQuery(api.domains.getDomainDetails, {
    domain,
  });

  const getPointingRecords = useCallback(
    (domain: string): DNSRecord[] => {
      const rootDomain = getRootDomain(domain);

      if (domain === rootDomain) {
        return [
          {
            type: "A",
            name: "@",
            value: "76.76.21.21",
            success: domainDetails?.pointing_verified ?? false,
          },
        ];
      } else {
        return [
          {
            type: "CNAME",
            name: getSubdomain(domain),
            value: "cname.vercel-dns.com.",
            success: domainDetails?.pointing_verified ?? false,
          },
        ];
      }
    },
    [domainDetails],
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState(0);

  const verifyAllRecords = useAction(api.domains.verifyAll);

  const startCooldown = () => {
    setCooldownActive(true);
    setCooldownTimeLeft(60);

    const interval = setInterval(() => {
      setCooldownTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCooldownActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const verifyRecords = async () => {
    if (cooldownActive) return;

    setIsGenerating(true);
    setGenerateError(null);
    const result = await verifyAllRecords({ domain });

    if (result.success) {
      onComplete();
    } else {
      setGenerateError(result.message);
      startCooldown();
    }
    setIsGenerating(false);
  };

  return (
    <div className="max-w-full">
      <NumberedStep number={2}>
        <span>Set DNS records</span>
      </NumberedStep>
      <div className="my-2 text-sm text-foreground/90">
        Set the following DNS records on your domain{" "}
        <span className="font-bold">{getRootDomain(domain)}</span>:
      </div>
      <div className="mb-4 rounded-md border border-border bg-muted/25 p-3">
        <p className="text-sm leading-6 text-muted-foreground">
          <strong>Note:</strong> DNS changes can take up to 48 hours to
          propagate globally, though most changes are visible within a few
          minutes to an hour. If verification fails, please wait a few minutes
          and try again.
        </p>
      </div>
      <div className="w-full">
        <DNSRecordTable
          records={[
            ...getPointingRecords(domain),
            ...(domainDetails?.ownershipVerificationCode
              ? [
                  {
                    type: "TXT" as const,
                    name: `_vercel.${getRootDomain(domain)}`,
                    value: domainDetails.ownershipVerificationCode,
                    success: domainDetails?.ownership_verified ?? false,
                  },
                ]
              : []),
          ]}
        />
      </div>

      {generateError && (
        <span className="mt-8 block text-right text-sm text-red-400">
          {generateError}
        </span>
      )}

      <div className="mt-2 flex justify-end">
        <Button
          onClick={verifyRecords}
          disabled={isGenerating || cooldownActive}
        >
          {isGenerating
            ? "Verifying..."
            : cooldownActive
              ? `Re-verify in ${cooldownTimeLeft}s`
              : "Verify"}
        </Button>
      </div>
    </div>
  );
};

export const NewDomainWorkflow = ({
  domain: initialDomain,
  onFinish,
  projectId,
  initialPage,
}: {
  domain?: string;
  onFinish: () => void;
  projectId: string;
  initialPage?: NewDomainWorkflowPage;
}) => {
  const [domain, setDomain] = useState<string>(initialDomain || "");
  const [page, setPage] = useState<NewDomainWorkflowPage>(initialPage ?? "new");

  const handleNextFromNew = (unconfirmedDomain: string) => {
    setDomain(unconfirmedDomain);
    setPage("set-records");
  };

  return (
    <div className="max-w-full">
      <Button variant="ghost" className="px-1 py-2 text-foreground" onClick={() => onFinish()}>
        <ArrowLeft className="h-4 w-4" /> Domains
      </Button>
      <div id="workflow-container" className="max-w-full px-0 py-4 sm:p-4">
        {page === "new" && (
          <NewDomainPage onNext={handleNextFromNew} projectId={projectId} />
        )}
        {page === "set-records" && (
          <SetRecordsPage
            domain={domain}
            onComplete={() => {
              onFinish();
            }}
          />
        )}
      </div>
    </div>
  );
};
