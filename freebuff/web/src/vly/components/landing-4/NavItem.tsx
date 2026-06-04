import React from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/vly/components/auth/AuthComponents";

interface NavItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
  requiresAuth?: boolean;
  showWhenSignedOut?: boolean;
  className: string;
  mounted: boolean;
  isLoaded: boolean;
  badge?: React.ReactNode;
}

export default function NavItem({
  label,
  onClick,
  requiresAuth,
  showWhenSignedOut,
  className,
  mounted,
  isLoaded,
  badge,
}: NavItemProps) {
  if (requiresAuth) {
    if (!mounted || !isLoaded) {
      return (
        <div className={className}>
          <span className="inline-flex items-center">
            {label}
            {badge}
          </span>
        </div>
      );
    }

    return (
      <React.Fragment>
        <SignedIn>
          <div className={className} onClick={onClick}>
            <span className="inline-flex items-center">
              {label}
              {badge}
            </span>
          </div>
        </SignedIn>
        {showWhenSignedOut && (
          <SignedOut>
            <SignInButton mode="modal" asChild>
              <div className={className}>
                <span className="inline-flex items-center">
                  {label}
                  {badge}
                </span>
              </div>
            </SignInButton>
          </SignedOut>
        )}
      </React.Fragment>
    );
  }

  return (
    <div className={className} onClick={onClick}>
      <span className="inline-flex items-center">
        {label}
        {badge}
      </span>
    </div>
  );
}
