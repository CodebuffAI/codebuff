"use client";

import React, { useCallback, useState } from "react";
import { X } from "lucide-react";
import ThemePickerModal from "@/vly/components/ThemePickerModal";
import DocumentInput from "@/vly/components/test-landing/DocumentInput";
import { HeroStorageProvider } from "@/vly/hooks/useSharedHeroStorage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
}: CreateProjectModalProps) {
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);

  const handleClose = useCallback(() => {
    setIsThemePickerOpen(false);
    onClose();
  }, [onClose]);

  return (
    <>
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
            className="w-[calc(100vw-1.5rem)] max-w-5xl overflow-hidden border border-border bg-card p-0 text-foreground shadow-2xl shadow-black/60 sm:rounded-[32px]"
          >
            <div className="relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 via-card to-transparent" />

              <DialogHeader className="relative border-b border-border px-5 pb-5 pt-5 text-left sm:px-8 sm:pb-6 sm:pt-7">
                <div className="flex items-start justify-between gap-6">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                      Project Composer
                    </p>
                    <DialogTitle className="mt-3 font-['PP_Cirka'] text-[2.25rem] font-normal leading-none text-foreground sm:text-5xl">
                      Create Project
                    </DialogTitle>
                    <DialogDescription className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                      Start from the landing-page composer, but in a proper
                      modal. Add a prompt, optional images, and a theme without
                      the old glass blur treatment.
                    </DialogDescription>
                  </div>

                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close create project modal"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </DialogHeader>

              <div className="relative px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
                <div className="rounded-[28px] border border-border bg-secondary p-3 sm:p-5">
                  <DocumentInput
                    setIsThemePickerOpen={setIsThemePickerOpen}
                    onProjectLimit={() => undefined}
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
