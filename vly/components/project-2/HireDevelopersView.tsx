"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Star,
  Clock,
  Zap,
  Users,
  Code,
  MessageCircle,
  ArrowRight,
  Sparkles,
  Target,
  Loader,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { FeaturePaywallDialog } from "@/components/billing/FeaturePaywallDialog";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

export default function HireDevelopersView() {
  const [showHiringForm, setShowHiringForm] = useState(false);
  const [showDeveloperForm, setShowDeveloperForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const { hasAccess } = useFeatureAccess("hire_developers");

  // Hiring form analysis state
  const [isAnalyzingHiring, setIsAnalyzingHiring] = useState(false);
  const [showHiringSuccess, setShowHiringSuccess] = useState(false);
  const [hiringAnalyzeMessageIndex, setHiringAnalyzeMessageIndex] = useState(0);

  // Developer form analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [devAnalyzeMessageIndex, setDevAnalyzeMessageIndex] = useState(0);

  // Rotating analyze messages for hiring
  const hiringAnalyzeMessages = [
    "Analyzing your request...",
    "Reviewing your project requirements...",
    "Evaluating your budget...",
    "Processing your information...",
  ];

  // Rotating analyze messages for developer
  const devAnalyzeMessages = [
    "Analyzing your application...",
    "Reviewing your experience...",
    "Evaluating your skills...",
    "Processing your profile...",
  ];

  // Rotate hiring analyze messages every 2 seconds
  useEffect(() => {
    if (!isAnalyzingHiring) return;

    const interval = setInterval(() => {
      setHiringAnalyzeMessageIndex(
        (prev) => (prev + 1) % hiringAnalyzeMessages.length,
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [isAnalyzingHiring, hiringAnalyzeMessages.length]);

  // Rotate developer analyze messages every 2 seconds
  useEffect(() => {
    if (!isAnalyzing) return;

    const interval = setInterval(() => {
      setDevAnalyzeMessageIndex(
        (prev) => (prev + 1) % devAnalyzeMessages.length,
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [isAnalyzing, devAnalyzeMessages.length]);

  // Hiring form state
  const [companyName, setCompanyName] = useState("");
  const [whatBuilding, setWhatBuilding] = useState("");
  const [budget, setBudget] = useState("");
  const [hiringPhoneNumber, setHiringPhoneNumber] = useState("");

  // Developer form state
  const [devName, setDevName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [pitch, setPitch] = useState("");
  const [devPhoneNumber, setDevPhoneNumber] = useState("");

  const submitHiringForm = useMutation(api.users.submitHiringInterestForm);
  const submitDeveloperForm = useMutation(
    api.users.submitDeveloperApplicationForm,
  );

  // Fetch existing forms
  const existingHiringForm = useQuery(api.users.getFormByType, {
    formType: "hiring",
  });
  const existingDevForm = useQuery(api.users.getFormByType, {
    formType: "developer_application",
  });

  const isEditingHiring = !!existingHiringForm;
  const isEditingDev = !!existingDevForm;

  // Load existing data when form opens
  useEffect(() => {
    if (showHiringForm && existingHiringForm) {
      setCompanyName(existingHiringForm.companyName || "");
      setWhatBuilding(existingHiringForm.whatBuilding || "");
      setBudget(existingHiringForm.budget || "");
      setHiringPhoneNumber(existingHiringForm.phoneNumber || "");
    } else if (!showHiringForm) {
      // Reset when closed
      setCompanyName("");
      setWhatBuilding("");
      setBudget("");
      setHiringPhoneNumber("");
    }
  }, [showHiringForm, existingHiringForm]);

  useEffect(() => {
    if (showDeveloperForm && existingDevForm) {
      setDevName(existingDevForm.name || "");
      setLinkedin(existingDevForm.linkedin || "");
      setGithub(existingDevForm.github || "");
      setPitch(existingDevForm.pitch || "");
      setDevPhoneNumber(existingDevForm.phoneNumber || "");
    } else if (!showDeveloperForm) {
      // Reset when closed
      setDevName("");
      setLinkedin("");
      setGithub("");
      setPitch("");
      setDevPhoneNumber("");
    }
  }, [showDeveloperForm, existingDevForm]);

  const handleGetStarted = () => {
    if (!hasAccess) {
      setShowPaywall(true);
      return;
    }
    setShowHiringForm(true);
  };

  const handleImADeveloper = () => {
    setShowDeveloperForm(true);
  };

  const handleSubmitHiringForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !whatBuilding || !budget || !hiringPhoneNumber) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitHiringForm({
        companyName,
        whatBuilding,
        budget,
        phoneNumber: hiringPhoneNumber,
      });

      // Start analysis phase with random delay (1-5 seconds)
      setIsAnalyzingHiring(true);
      setShowHiringSuccess(false);
      setHiringAnalyzeMessageIndex(0);

      const randomDelay = Math.random() * 4000 + 1000; // 1000ms to 5000ms

      setTimeout(() => {
        setIsAnalyzingHiring(false);
        setShowHiringSuccess(true);
      }, randomDelay);
    } catch (error) {
      console.error("Failed to submit form:", error);
      toast.error("Failed to submit form. Please try again.");
      setIsSubmitting(false);
      setIsAnalyzingHiring(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookHiringCall = () => {
    window.open("https://calendar.app.google/4Xo7vbtoZwmkknkZ9", "_blank");
    // Reset form state
    setShowHiringForm(false);
    setCompanyName("");
    setWhatBuilding("");
    setBudget("");
    setHiringPhoneNumber("");
    setIsAnalyzingHiring(false);
    setShowHiringSuccess(false);
  };

  const handleCloseHiringForm = () => {
    setShowHiringForm(false);
    setCompanyName("");
    setWhatBuilding("");
    setBudget("");
    setHiringPhoneNumber("");
    setIsAnalyzingHiring(false);
    setShowHiringSuccess(false);
  };

  const handleSubmitDeveloperForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devName || !linkedin || !github || !pitch || !devPhoneNumber) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitDeveloperForm({
        name: devName,
        linkedin,
        github,
        pitch,
        phoneNumber: devPhoneNumber,
      });

      // Start analysis phase with random delay (1-5 seconds)
      setIsAnalyzing(true);
      setShowSuccess(false);
      setDevAnalyzeMessageIndex(0);

      const randomDelay = Math.random() * 4000 + 1000; // 1000ms to 5000ms

      setTimeout(() => {
        setIsAnalyzing(false);
        setShowSuccess(true);
      }, randomDelay);
    } catch (error) {
      console.error("Failed to submit application:", error);
      toast.error("Failed to submit application. Please try again.");
      setIsSubmitting(false);
      setIsAnalyzing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for book call button - kept for future use
  const _handleBookCall = () => {
    window.open("https://calendar.app.google/jjwEoAV7BGW2JoZL9", "_blank");
    // Reset form state
    setShowDeveloperForm(false);
    setDevName("");
    setLinkedin("");
    setGithub("");
    setPitch("");
    setDevPhoneNumber("");
    setIsAnalyzing(false);
    setShowSuccess(false);
  };

  const handleCloseDeveloperForm = () => {
    setShowDeveloperForm(false);
    setDevName("");
    setLinkedin("");
    setGithub("");
    setPitch("");
    setDevPhoneNumber("");
    setIsAnalyzing(false);
    setShowSuccess(false);
  };

  return (
    <>
      <FeaturePaywallDialog
        featureId="hire_developers"
        requiredPlan="Ultra"
        message="Hire Developers On-Demand is available on Ultra plan and above. Upgrade to unlock access to our network of vetted developers."
        title="Unlock Hire Developers"
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />

      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-white to-blue-50">
        <div className="mx-auto max-w-7xl space-y-8 p-6">
          {/* Hero Section - Neo Brutalist */}
          <div className="relative overflow-hidden rounded-none border-4 border-black bg-white p-8 shadow-[8px_8px_0px_0px_#000000] md:p-12">
            <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-yellow-300 opacity-20"></div>
            <div className="absolute -bottom-8 -left-8 h-24 w-24 rotate-45 bg-blue-500 opacity-10"></div>

            <div className="relative z-10">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-none border-2 border-black bg-yellow-300 p-2">
                  <Users className="h-8 w-8 text-black" />
                </div>
                <h1 className="text-4xl font-black uppercase tracking-tight text-black md:text-6xl">
                  Hire Devs
                </h1>
              </div>

              <div className="mb-8 space-y-4">
                <p className="text-xl font-bold text-gray-800 md:text-2xl">
                  Expert developers for{" "}
                  <span className="bg-yellow-300 px-2 py-1 text-black">
                    $28/hour
                  </span>
                </p>
                <p className="max-w-2xl text-lg text-gray-600">
                  No bullsh*t. No contracts. No expensive margins. Vetted &
                  trained developers that will build anything you need for the
                  best price in the industry.
                </p>
              </div>

              <div className="mb-8 flex flex-wrap gap-3">
                <Badge className="rounded-none border-2 border-black bg-green-400 px-4 py-2 font-bold text-black hover:bg-green-500">
                  <Check className="mr-2 h-4 w-4" />
                  VETTED & TRAINED
                </Badge>
                <Badge className="rounded-none border-2 border-black bg-blue-400 px-4 py-2 font-bold text-black hover:bg-blue-500">
                  <Star className="mr-2 h-4 w-4" />
                  5-STAR RATED
                </Badge>
                <Badge className="rounded-none border-2 border-black bg-purple-400 px-4 py-2 font-bold text-black hover:bg-purple-500">
                  <Zap className="mr-2 h-4 w-4" />
                  HUMAN EXPERTS
                </Badge>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Button
                  onClick={handleGetStarted}
                  className="group rounded-none border-4 border-black bg-yellow-300 px-8 py-4 text-xl font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-yellow-400 hover:shadow-[2px_2px_0px_0px_#000000]"
                >
                  <MessageCircle className="mr-3 h-6 w-6" />
                  BOOK A CALL
                  {!hasAccess && (
                    <span className="ml-2 rounded-full border-2 border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                      Ultra
                    </span>
                  )}
                  <ArrowRight className="ml-3 h-6 w-6 transition-transform group-hover:translate-x-1" />
                </Button>

                <Button
                  onClick={handleImADeveloper}
                  className="group rounded-none border-4 border-black bg-white px-8 py-4 text-xl font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-gray-100 hover:shadow-[2px_2px_0px_0px_#000000]"
                >
                  <Code className="mr-3 h-6 w-6" />
                  I'M A DEVELOPER
                  <ArrowRight className="ml-3 h-6 w-6 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          </div>

          {/* Features Grid - Neo Brutalist Cards */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-none border-4 border-black bg-blue-100 shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_#000000]">
              <CardHeader className="pb-2">
                <div className="mb-3 w-fit rounded-none border-2 border-black bg-blue-500 p-2">
                  <Code className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-black uppercase text-black">
                  EXPERT DEVS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-gray-800">
                  Hand-picked developers with proven track records. No junior
                  devs, no BS.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-none border-4 border-black bg-purple-100 shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_#000000]">
              <CardHeader className="pb-2">
                <div className="mb-3 w-fit rounded-none border-2 border-black bg-purple-500 p-2">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-black uppercase text-black">
                  UNLIMITED AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-gray-800">
                  Your dev gets unlimited AI assistance. They code faster,
                  smarter, better.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-none border-4 border-black bg-green-100 shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_#000000]">
              <CardHeader className="pb-2">
                <div className="mb-3 w-fit rounded-none border-2 border-black bg-green-500 p-2">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-black uppercase text-black">
                  ON-DEMAND
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-gray-800">
                  Start within 24 hours. No contracts. Scale up or down as
                  needed.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-none border-4 border-black bg-orange-100 shadow-[6px_6px_0px_0px_#000000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_#000000]">
              <CardHeader className="pb-2">
                <div className="mb-3 w-fit rounded-none border-2 border-black bg-orange-500 p-2">
                  <Target className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-black uppercase text-black">
                  ZERO BS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-gray-800">
                  No recruitment fees. No hidden costs. Just great developers
                  doing great work.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pricing Section - Bold and Clean */}
          <Card className="rounded-none border-4 border-black bg-gradient-to-br from-green-200 to-green-300 shadow-[8px_8px_0px_0px_#000000]">
            <CardHeader className="text-center">
              <CardTitle className="mb-4 text-4xl font-black uppercase text-black">
                Simple Pricing
              </CardTitle>
              <div className="mx-auto mb-6 w-fit">
                <div className="rounded-none border-4 border-black bg-white p-6">
                  <div className="text-6xl font-black text-black">$28</div>
                  <div className="text-xl font-bold text-gray-600">/hour</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="mx-auto max-w-md space-y-3">
                {[
                  "Developer time: $29/hr",
                  "AI usage: UNLIMITED",
                  "Project management: INCLUDED",
                  "Quality assurance: INCLUDED",
                  "Hidden fees: ZERO",
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-none border-2 border-black bg-white p-3"
                  >
                    <span className="font-bold text-gray-800">
                      {item.split(":")[0]}:
                    </span>
                    <span className="font-black text-green-600">
                      {item.split(":")[1]}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-center text-lg font-bold text-black">
                Pay only for productive hours. No BS.
              </p>
            </CardContent>
          </Card>

          {/* What You Get Section */}
          <Card className="rounded-none border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
            <CardHeader>
              <CardTitle className="text-3xl font-black uppercase text-black">
                What You Get
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  "Skip the hiring nightmare",
                  "No recruitment agency fees",
                  "Start working in 24 hours",
                  "Pay only for actual work",
                  "Direct developer communication",
                  "Seamless project handoffs",
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="rounded-none border-2 border-black bg-green-300 p-1">
                      <Check className="h-4 w-4 text-black" />
                    </div>
                    <span className="text-lg font-medium text-gray-800">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* FAQ Section - Clean and Bold */}
          <Card className="rounded-none border-4 border-black bg-gray-100 shadow-[8px_8px_0px_0px_#000000]">
            <CardHeader>
              <CardTitle className="text-3xl font-black uppercase text-black">
                FAQ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                {
                  q: "How fast can I start?",
                  a: "Most projects start within 24 hours after your call.",
                },
                {
                  q: "What if the developer sucks?",
                  a: "Free switch within the first week. No questions asked.",
                },
                {
                  q: "How does unlimited AI work?",
                  a: "Your dev gets full platform access. Included in the rate.",
                },
                {
                  q: "What tech do you cover?",
                  a: "React, Node.js, Python, TypeScript, and most modern stacks.",
                },
              ].map((faq, index) => (
                <div
                  key={index}
                  className="rounded-none border-2 border-black bg-white p-4"
                >
                  <h4 className="mb-2 text-xl font-black text-black">
                    {faq.q}
                  </h4>
                  <p className="text-lg text-gray-700">{faq.a}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Final CTA */}
          <div className="text-center">
            <div className="mx-auto max-w-2xl rounded-none border-4 border-black bg-yellow-300 p-8 shadow-[8px_8px_0px_0px_#000000]">
              <h2 className="mb-4 text-3xl font-black uppercase text-black">
                Ready to Build?
              </h2>
              <p className="mb-6 text-lg font-bold text-black">
                Book a call. Tell us what you need. Get matched with a dev.
              </p>
              <Button
                onClick={handleGetStarted}
                className="group rounded-none border-4 border-black bg-black px-8 py-4 text-xl font-black uppercase text-white shadow-[4px_4px_0px_0px_#333333] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-gray-800 hover:shadow-[2px_2px_0px_0px_#333333]"
              >
                <MessageCircle className="mr-3 h-6 w-6" />
                BOOK YOUR CALL
                {!hasAccess && (
                  <span className="ml-2 rounded-full border-2 border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                    Ultra
                  </span>
                )}
                <ArrowRight className="ml-3 h-6 w-6 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        </div>

        {/* Hiring Form Dialog */}
        <Dialog open={showHiringForm} onOpenChange={handleCloseHiringForm}>
          <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col rounded-none border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
            {isAnalyzingHiring ? (
              <div className="flex flex-col items-center justify-center space-y-6 py-12">
                <Loader className="h-12 w-12 animate-spin text-yellow-500" />
                <div className="space-y-2 text-center">
                  <p className="text-xl font-black uppercase text-black">
                    {hiringAnalyzeMessages[hiringAnalyzeMessageIndex]}
                  </p>
                  <p className="text-base text-gray-600">
                    Please do not leave this page
                  </p>
                </div>
              </div>
            ) : showHiringSuccess ? (
              <div className="space-y-6 py-6">
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
                    <Check className="h-8 w-8 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase text-black">
                      Congrats! Your Request Has Passed Screening
                    </h3>
                    <p className="text-lg text-gray-700">
                      You can now interview with the CEO to hire a developer for
                      your project.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleBookHiringCall}
                  className="w-full rounded-none border-4 border-black bg-yellow-300 px-6 py-4 text-lg font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-yellow-400 hover:shadow-[2px_2px_0px_0px_#000000]"
                >
                  <MessageCircle className="mr-3 h-5 w-5" />
                  BOOK A CALL WITH CEO
                  {!hasAccess && (
                    <span className="ml-2 rounded-full border-2 border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                      Ultra
                    </span>
                  )}
                  <ArrowRight className="ml-3 h-5 w-5" />
                </Button>
              </div>
            ) : (
              <>
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle className="text-2xl font-black uppercase text-black">
                    Tell Us About Your Project
                  </DialogTitle>
                  <DialogDescription className="text-base text-gray-600">
                    Fill out this form and we'll review your request.
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <form
                    id="hiring-form"
                    onSubmit={handleSubmitHiringForm}
                    className="space-y-4 pr-2"
                  >
                    <div className="space-y-2">
                      <Label
                        htmlFor="companyName"
                        className="text-base font-bold text-black"
                      >
                        Company Name *
                      </Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="Your company name"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="whatBuilding"
                        className="text-base font-bold text-black"
                      >
                        What are you trying to build? *
                      </Label>
                      <Textarea
                        id="whatBuilding"
                        value={whatBuilding}
                        onChange={(e) => setWhatBuilding(e.target.value)}
                        className="min-h-[100px] rounded-none border-2 border-black bg-white text-base"
                        placeholder="Describe your project, goals, and requirements..."
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="budget"
                        className="text-base font-bold text-black"
                      >
                        Budget *
                      </Label>
                      <Input
                        id="budget"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="e.g., $10k-$20k, $50k+, etc."
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="hiringPhoneNumber"
                        className="text-base font-bold text-black"
                      >
                        Phone Number / WhatsApp *
                      </Label>
                      <Input
                        id="hiringPhoneNumber"
                        value={hiringPhoneNumber}
                        onChange={(e) => setHiringPhoneNumber(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="+1 (555) 123-4567"
                        type="tel"
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
                      form="hiring-form"
                      disabled={isSubmitting}
                      className="flex-1 rounded-none border-4 border-black bg-yellow-300 px-6 py-3 text-lg font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-yellow-400 hover:shadow-[2px_2px_0px_0px_#000000] disabled:opacity-50"
                    >
                      {isSubmitting
                        ? isEditingHiring
                          ? "UPDATING..."
                          : "SUBMITTING..."
                        : isEditingHiring
                          ? "UPDATE"
                          : "SUBMIT"}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCloseHiringForm}
                      className="rounded-none border-4 border-black bg-white px-6 py-3 text-lg font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-gray-100 hover:shadow-[2px_2px_0px_0px_#000000]"
                    >
                      CANCEL
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Developer Application Form Dialog */}
        <Dialog
          open={showDeveloperForm}
          onOpenChange={handleCloseDeveloperForm}
        >
          <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col rounded-none border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center space-y-6 py-12">
                <Loader className="h-12 w-12 animate-spin text-yellow-500" />
                <div className="space-y-2 text-center">
                  <p className="text-xl font-black uppercase text-black">
                    {devAnalyzeMessages[devAnalyzeMessageIndex]}
                  </p>
                  <p className="text-base text-gray-600">
                    Please do not leave this page
                  </p>
                </div>
              </div>
            ) : showSuccess ? (
              <div className="space-y-6 py-6">
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
                    <Check className="h-8 w-8 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase text-black">
                      Application Submitted!
                    </h3>
                    <p className="text-lg text-gray-700">
                      Thank you for applying. We'll review your application and
                      get back to you soon.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleCloseDeveloperForm}
                  className="w-full rounded-none border-4 border-black bg-yellow-300 px-6 py-4 text-lg font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-yellow-400 hover:shadow-[2px_2px_0px_0px_#000000]"
                >
                  DONE
                </Button>
              </div>
            ) : (
              <>
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle className="text-2xl font-black uppercase text-black">
                    Apply as a Developer
                  </DialogTitle>
                  <DialogDescription className="text-base text-gray-600">
                    Tell us about yourself and your experience with vly.
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <form
                    id="developer-form"
                    onSubmit={handleSubmitDeveloperForm}
                    className="space-y-4 pr-2"
                  >
                    <div className="space-y-2">
                      <Label
                        htmlFor="devName"
                        className="text-base font-bold text-black"
                      >
                        Name *
                      </Label>
                      <Input
                        id="devName"
                        value={devName}
                        onChange={(e) => setDevName(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="Your full name"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="linkedin"
                        className="text-base font-bold text-black"
                      >
                        LinkedIn Profile *
                      </Label>
                      <Input
                        id="linkedin"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="https://linkedin.com/in/yourprofile"
                        type="url"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="github"
                        className="text-base font-bold text-black"
                      >
                        GitHub Profile *
                      </Label>
                      <Input
                        id="github"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="https://github.com/yourusername"
                        type="url"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="pitch"
                        className="text-base font-bold text-black"
                      >
                        Tell us about yourself and your experience with vly *
                      </Label>
                      <Textarea
                        id="pitch"
                        value={pitch}
                        onChange={(e) => setPitch(e.target.value)}
                        className="min-h-[120px] rounded-none border-2 border-black bg-white text-base"
                        placeholder="Share your background, skills, and how you've used vly in your projects..."
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="devPhoneNumber"
                        className="text-base font-bold text-black"
                      >
                        Phone Number / WhatsApp *
                      </Label>
                      <Input
                        id="devPhoneNumber"
                        value={devPhoneNumber}
                        onChange={(e) => setDevPhoneNumber(e.target.value)}
                        className="rounded-none border-2 border-black bg-white text-base"
                        placeholder="+1 (555) 123-4567"
                        type="tel"
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
                      form="developer-form"
                      disabled={isSubmitting}
                      className="flex-1 rounded-none border-4 border-black bg-yellow-300 px-6 py-3 text-lg font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-yellow-400 hover:shadow-[2px_2px_0px_0px_#000000] disabled:opacity-50"
                    >
                      {isSubmitting
                        ? isEditingDev
                          ? "UPDATING..."
                          : "SUBMITTING..."
                        : isEditingDev
                          ? "UPDATE"
                          : "SUBMIT"}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCloseDeveloperForm}
                      className="rounded-none border-4 border-black bg-white px-6 py-3 text-lg font-black uppercase text-black shadow-[4px_4px_0px_0px_#000000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-gray-100 hover:shadow-[2px_2px_0px_0px_#000000]"
                    >
                      CANCEL
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
