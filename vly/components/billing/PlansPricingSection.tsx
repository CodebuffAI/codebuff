"use client";

import { useCustomer, usePricingTable } from "autumn-js/react";
import { lazy, Suspense, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  Building2,
  Users,
  Headphones,
  Wrench,
  Phone,
  Code,
  Shield,
  Loader,
  Tag,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { SignInButton, SignUpButton } from "@/components/auth/AuthComponents";

const PricingTable = lazy(() => import("@/components/autumn/pricing-table"));
import { getProductDetails } from "./billing-section-utils";
import { PricingTableSkeleton } from "./PricingTableSkeleton";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { ReviewComparison } from "@/components/test-landing/ReviewComparison";

interface PlansPricingSectionProps {
  organizationId?: string;
}

export function PlansPricingSection({
  organizationId,
}: PlansPricingSectionProps = {}) {
  const { customer } = useCustomer({
    expand: ["payment_method"],
  });

  // Feature flags
  const { enabled: organizationsEnabled } = useFeatureFlag(
    "organizations_enabled",
  );

  // Check if we're in organization context (only if feature is enabled)
  const isOrganizationContext = organizationsEnabled && !!organizationId;

  // Get plan data using same source as pricing table
  const productDetails = getProductDetails(isOrganizationContext);
  usePricingTable({ productDetails });

  // Enterprise form state
  const [showEnterpriseForm, setShowEnterpriseForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzingEnterprise, setIsAnalyzingEnterprise] = useState(false);
  const [showEnterpriseSuccess, setShowEnterpriseSuccess] = useState(false);
  const [analyzeMessageIndex, setAnalyzeMessageIndex] = useState(0);
  const [companyName, setCompanyName] = useState("");
  const [whatBuilding, setWhatBuilding] = useState("");
  const [budget, setBudget] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const submitEnterpriseForm = useMutation(
    api.users.submitEnterpriseInterestForm,
  );
  const existingEnterpriseForm = useQuery(api.users.getFormByType, {
    formType: "enterprise",
  });

  const isEditingEnterprise = !!existingEnterpriseForm;

  // Load existing data when form opens
  useEffect(() => {
    if (showEnterpriseForm && existingEnterpriseForm) {
      setCompanyName(existingEnterpriseForm.companyName || "");
      setWhatBuilding(existingEnterpriseForm.whatBuilding || "");
      setBudget(existingEnterpriseForm.budget || "");
      setPhoneNumber(existingEnterpriseForm.phoneNumber || "");
    } else if (!showEnterpriseForm) {
      // Reset when closed
      setCompanyName("");
      setWhatBuilding("");
      setBudget("");
      setPhoneNumber("");
    }
  }, [showEnterpriseForm, existingEnterpriseForm]);

  // Rotating analyze messages for enterprise
  const enterpriseAnalyzeMessages = [
    "Analyzing your enterprise requirements...",
    "Reviewing your budget and project scope...",
    "Evaluating your company's needs...",
    "Processing your request...",
  ];

  // Rotate analyze messages every 2 seconds
  useEffect(() => {
    if (!isAnalyzingEnterprise) return;

    const interval = setInterval(() => {
      setAnalyzeMessageIndex(
        (prev) => (prev + 1) % enterpriseAnalyzeMessages.length,
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [isAnalyzingEnterprise, enterpriseAnalyzeMessages.length]);

  const handleSubmitEnterpriseForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !whatBuilding || !budget || !phoneNumber) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitEnterpriseForm({
        companyName,
        whatBuilding,
        budget,
        phoneNumber,
      });

      // Start analysis phase with random delay (1-5 seconds)
      setIsAnalyzingEnterprise(true);
      setShowEnterpriseSuccess(false);
      setAnalyzeMessageIndex(0);

      const randomDelay = Math.random() * 4000 + 1000; // 1000ms to 5000ms

      setTimeout(() => {
        setIsAnalyzingEnterprise(false);
        setShowEnterpriseSuccess(true);
      }, randomDelay);
    } catch (error) {
      console.error("Failed to submit form:", error);
      toast.error("Failed to submit form. Please try again.");
      setIsSubmitting(false);
      setIsAnalyzingEnterprise(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookEnterpriseCall = () => {
    window.open("https://calendar.app.google/4Xo7vbtoZwmkknkZ9", "_blank");
    setShowEnterpriseForm(false);
    setCompanyName("");
    setWhatBuilding("");
    setBudget("");
    setPhoneNumber("");
    setIsAnalyzingEnterprise(false);
    setShowEnterpriseSuccess(false);
  };

  const handleCloseEnterpriseForm = () => {
    setShowEnterpriseForm(false);
    setCompanyName("");
    setWhatBuilding("");
    setBudget("");
    setPhoneNumber("");
    setIsAnalyzingEnterprise(false);
    setShowEnterpriseSuccess(false);
  };

  const { isSignedIn, isLoaded } = useUser();

  // Show loading state while checking auth
  if (!isLoaded) {
    return <PricingTableSkeleton />;
  }

  // If user is not signed in, show login prompt with preview marketing
  if (!isSignedIn) {
    return (
      <div className="space-y-8">
        {/* Login Required Section */}
        <div className="mx-auto max-w-2xl space-y-6 p-8">
          <div className="text-center">
            <h2 className="mb-2 text-2xl font-semibold text-gray-900">
              An account is required to access pricing
            </h2>
            <p className="text-gray-600">
              Sign in or create an account to view our pricing plans
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <SignInButton mode="modal" asChild>
              <button className="text-sm font-normal text-gray-900 transition-colors hover:text-[#A37FBC]">
                Log in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="flex w-full items-center justify-center rounded-full bg-[#1a1a1a] px-4 py-2 text-sm font-normal text-white transition-colors hover:bg-black sm:w-auto">
                Sign up
              </button>
            </SignUpButton>
          </div>
        </div>

        {/* Preview Marketing Section */}
        <div className="mx-auto max-w-4xl space-y-12 p-8">
          <div className="text-center">
            <h3 className="mb-6 text-4xl font-bold text-gray-900">
              7x cheaper than Lovable
            </h3>
          </div>

          {/* Unified Preview Content List */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h5 className="text-lg font-medium text-gray-800">
                    Access pricing starting at $3
                  </h5>
                  <p className="text-gray-600">
                    Get started with affordable plans that scale with your needs
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="text-lg font-medium text-gray-800">
                    <a
                      href="/earn"
                      className="underline decoration-emerald-300"
                    >
                      Earn free unlimited credits
                    </a>
                  </h5>
                  <p className="text-gray-600">
                    Unlock unlimited credits through referrals, spin rewards,
                    and community bounties
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="text-lg font-medium text-gray-800">
                    Transparent Pricing
                  </h5>
                  <p className="text-gray-600">
                    No hidden fees or surprise charges. Our pricing is
                    straightforward and honest, with plans designed to grow with
                    your project needs.
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="text-lg font-medium text-gray-800">
                    Flexible Plans
                  </h5>
                  <p className="text-gray-600">
                    From individual developers to enterprise teams, we have
                    plans that fit every stage of your journey. Upgrade or
                    downgrade anytime with no long-term commitments.
                  </p>
                </div>
                <div className="space-y-2">
                  <h5 className="text-lg font-medium text-gray-800">
                    Generous Free Tier
                  </h5>
                  <p className="text-gray-600">
                    Start building immediately with our free plan. Get access to
                    core features and credits to explore what vly.ai can do for
                    your projects.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-2xl font-semibold text-gray-900">
                Value Comparison
              </h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">
                      vly.ai Starter Plan
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      $3/month
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Includes 4M credits, custom domains, and all core features
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">
                      Competitor Equivalent
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      $25/month
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Similar features at 7x the cost with fewer included credits
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-2xl font-semibold text-gray-900">
                Get Started Today
              </h4>
              <p className="text-gray-600">
                Join thousands of developers who are building faster and smarter
                with vly.ai. Sign up now to see our full pricing plans and start
                your free trial.
              </p>
              <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-center">
                <SignInButton mode="modal" asChild>
                  <button className="text-sm font-normal text-gray-900 transition-colors hover:text-[#A37FBC]">
                    Log in to View Pricing
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="flex w-full items-center justify-center rounded-full bg-[#1a1a1a] px-4 py-2 text-sm font-normal text-white transition-colors hover:bg-black sm:w-auto">
                    Create Free Account
                  </button>
                </SignUpButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User is signed in, show loading while customer data loads
  if (!customer) {
    return <PricingTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Plans Section - Fixed Tiers */}
      <div>
        <Suspense fallback={<PricingTableSkeleton />}>
          <PricingTable showOnlyPlans={true} productDetails={productDetails} />
        </Suspense>
      </div>

      {/* Enterprise Section */}
      <div className="mt-12 rounded-lg bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)]">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-md bg-[#1a1a1a] p-4">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="mb-2 text-2xl font-medium text-gray-800">
            Enterprise Plan
          </h2>
          <p className="text-gray-600">
            Custom solutions for large organizations with advanced requirements
          </p>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-start gap-3 rounded-lg bg-[#F9FBFD] p-4 shadow-sm">
            <Users className="h-5 w-5 flex-shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="font-medium text-gray-800">Unlimited Members</h3>
              <p className="text-sm text-muted-foreground">
                No limits on team size
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[#F9FBFD] p-4 shadow-sm">
            <Headphones className="h-5 w-5 flex-shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="font-medium text-gray-800">Unlimited Support</h3>
              <p className="text-sm text-muted-foreground">
                24/7 priority assistance
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[#F9FBFD] p-4 shadow-sm">
            <Wrench className="h-5 w-5 flex-shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="font-medium text-gray-800">Custom Features</h3>
              <p className="text-sm text-muted-foreground">
                Tailored to your needs
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[#F9FBFD] p-4 shadow-sm">
            <Phone className="h-5 w-5 flex-shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="font-medium text-gray-800">Phone Number of CEO</h3>
              <p className="text-sm text-muted-foreground">
                Direct access to leadership
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[#F9FBFD] p-4 shadow-sm">
            <Code className="h-5 w-5 flex-shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="font-medium text-gray-800">
                On-demand Developers
              </h3>
              <p className="text-sm text-muted-foreground">
                Dedicated development team
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[#F9FBFD] p-4 shadow-sm">
            <Shield className="h-5 w-5 flex-shrink-0 text-zinc-700" />
            <div>
              <h3 className="font-semibold text-zinc-900">SOC II Compliance</h3>
              <p className="text-sm text-muted-foreground">
                Enterprise-grade security
              </p>
            </div>
          </div>
        </div>

        {/* White Labeling Section */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-zinc-600" />
            <h3 className="text-lg font-medium text-zinc-900">
              White label vly.ai software
            </h3>
          </div>
          <p className="mb-3 text-sm text-zinc-600">
            Resell vly.ai as your own branded product with custom pricing and
            high margins. Perfect for agencies, consultancies, and SaaS
            companies looking to offer AI development tools under their own
            brand.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Fully Branded Experience
                </p>
                <p className="text-xs text-zinc-600">
                  Your logo, colors, and domain
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Custom Pricing
                </p>
                <p className="text-xs text-zinc-600">
                  Set your own prices with high margins
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Revenue Share Model
                </p>
                <p className="text-xs text-zinc-600">
                  Keep the majority of profits
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Full Platform Access
                </p>
                <p className="text-xs text-zinc-600">
                  All features included in white label
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Button
            onClick={() => setShowEnterpriseForm(true)}
            className="rounded-md bg-zinc-900 px-8 py-6 text-base font-medium text-white hover:bg-zinc-800"
          >
            Contact Us for Enterprise Plan
          </Button>
        </div>
      </div>

      {/* Review Comparison Section */}
      <div className="mt-12">
        <ReviewComparison />
      </div>

      {/* Enterprise Form Dialog */}
      <Dialog
        open={showEnterpriseForm}
        onOpenChange={handleCloseEnterpriseForm}
      >
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          {isAnalyzingEnterprise ? (
            <div className="flex flex-col items-center justify-center space-y-6 py-12">
              <Loader className="h-12 w-12 animate-spin text-zinc-600" />
              <div className="space-y-2 text-center">
                <p className="text-xl font-semibold text-zinc-900">
                  {enterpriseAnalyzeMessages[analyzeMessageIndex]}
                </p>
                <p className="text-base text-zinc-600">
                  Please do not leave this page
                </p>
              </div>
            </div>
          ) : showEnterpriseSuccess ? (
            <div className="space-y-6 py-6">
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
                  <Check className="h-8 w-8 text-white" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-zinc-900">
                    Congrats! Your Enterprise Request Has Passed Screening
                  </h3>
                  <p className="text-lg text-zinc-700">
                    You can now schedule a call with our team to discuss your
                    enterprise needs.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleBookEnterpriseCall}
                className="w-full bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Book a Call
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader className="flex-shrink-0">
                <DialogTitle className="text-2xl font-semibold">
                  Enterprise Plan Inquiry
                </DialogTitle>
                <DialogDescription>
                  Fill out this form and we'll get back to you to discuss your
                  enterprise needs.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                <form
                  id="enterprise-form"
                  onSubmit={handleSubmitEnterpriseForm}
                  className="space-y-4 px-1"
                >
                  <div className="space-y-2">
                    <Label htmlFor="enterpriseCompanyName">
                      Company Name *
                    </Label>
                    <Input
                      id="enterpriseCompanyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Your company name"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="enterpriseWhatBuilding">
                      What are you trying to build? *
                    </Label>
                    <Textarea
                      id="enterpriseWhatBuilding"
                      value={whatBuilding}
                      onChange={(e) => setWhatBuilding(e.target.value)}
                      className="min-h-[100px]"
                      placeholder="Describe your project, goals, and requirements..."
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="enterpriseBudget">Budget *</Label>
                    <Input
                      id="enterpriseBudget"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="e.g., $50k+, $100k+, etc."
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="enterprisePhoneNumber">
                      Phone Number / WhatsApp *
                    </Label>
                    <Input
                      id="enterprisePhoneNumber"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </form>
              </div>
              <div className="flex-shrink-0 border-t border-zinc-200 bg-white pt-4">
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    form="enterprise-form"
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting
                      ? isEditingEnterprise
                        ? "Updating..."
                        : "Submitting..."
                      : isEditingEnterprise
                        ? "Update"
                        : "Submit"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseEnterpriseForm}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
