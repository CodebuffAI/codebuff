"use client";

import React, { useCallback, useState } from "react";
import { X } from "lucide-react";
import PricingTable from "@/components/autumn/pricing-table";
import ThemePickerModal from "@/components/ThemePickerModal";
import DocumentInput from "@/components/test-landing/DocumentInput";
import { HeroStorageProvider } from "@/hooks/useSharedHeroStorage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
}: CreateProjectModalProps) {
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const handleClose = useCallback(() => {
    setIsThemePickerOpen(false);
    setShowPaywall(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upgrade to Create More Projects</DialogTitle>
            <DialogDescription>
              You&apos;ve reached your project limit. Upgrade your plan to
              create more projects and continue building.
            </DialogDescription>
          </DialogHeader>
          <PricingTable showOnlyPlans />
        </DialogContent>
      </Dialog>

      <HeroStorageProvider>
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) {
              handleClose();
            }
          }}
        >
          <DialogContent
            hideCloseButton
            onOpenAutoFocus={(event) => event.preventDefault()}
            className="w-[calc(100vw-1.5rem)] max-w-5xl overflow-hidden border border-[#d8d2c5] bg-[#efede6] p-0 shadow-[0_32px_120px_rgba(21,21,18,0.18)] sm:rounded-[32px]"
          >
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#e6e0ef] via-[#efede6] to-transparent" />

              <DialogHeader className="relative border-b border-black/5 px-5 pb-5 pt-5 text-left sm:px-8 sm:pb-6 sm:pt-7">
                <div className="flex items-start justify-between gap-6">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#786f60]">
                      Project Composer
                    </p>
                    <DialogTitle className="mt-3 font-['PP_Cirka'] text-[2.25rem] font-normal leading-none text-[#151512] sm:text-5xl">
                      Create Project
                    </DialogTitle>
                    <DialogDescription className="mt-3 max-w-xl text-sm leading-6 text-[#5c574b] sm:text-[15px]">
                      Start from the landing-page composer, but in a proper
                      modal. Add a prompt, optional images, and a theme without
                      the old glass blur treatment.
                    </DialogDescription>
                  </div>

                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close create project modal"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/80 text-[#5c574b] transition-colors hover:bg-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </DialogHeader>

              <div className="relative px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
                <div className="rounded-[28px] border border-[#d8d2c5] bg-[#e9e6dd] p-3 sm:p-5">
                  <DocumentInput
                    setIsThemePickerOpen={setIsThemePickerOpen}
                    onProjectLimit={() => setShowPaywall(true)}
                    onSuccess={handleClose}
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ThemePickerModal
          isOpen={isThemePickerOpen}
          onClose={() => setIsThemePickerOpen(false)}
        />
      </HeroStorageProvider>
    </>
  );
}
