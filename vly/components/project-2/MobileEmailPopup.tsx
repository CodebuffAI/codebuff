"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Mail, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

interface MobileEmailPopupProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  semanticIdentifier?: string;
}

export function MobileEmailPopup({
  isOpen,
  onClose,
  projectName: _projectName,
  semanticIdentifier: _semanticIdentifier,
}: MobileEmailPopupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const sendMobileEmail = useAction(api.email.sendMobileEmail);
  const isMobile = useIsMobile();

  const handleSendEmail = async () => {
    try {
      setIsLoading(true);
      await sendMobileEmail();
      setEmailSent(true);
      setTimeout(() => {
        setEmailSent(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Only show on mobile
  if (!isMobile) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[90vw] max-w-md rounded-lg border-none bg-white/95 backdrop-blur-md">
        <DialogHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="font-['PP_Cirka'] text-2xl font-normal text-black">
            Mobile Experience Coming Soon!
          </DialogTitle>
          <DialogDescription className="font-['Geist'] text-base text-gray-600">
            Get the login link sent to your email so you can continue editing on
            your computer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {emailSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center space-y-3 py-4"
            >
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="font-['Geist'] text-lg font-medium text-green-600">
                Email sent! Check your inbox.
              </p>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center justify-center space-x-2 rounded-lg bg-gray-50 p-4">
                <Mail className="h-5 w-5 text-gray-500" />
                <span className="font-['Geist'] text-sm text-gray-600">
                  We'll send you a link to access this project on desktop
                </span>
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1 border-gray-300 font-['Geist'] text-gray-600 hover:bg-gray-50"
                >
                  Maybe Later
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500 font-['Geist'] text-white hover:from-purple-600 hover:to-blue-600"
                >
                  {isLoading ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Link
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
