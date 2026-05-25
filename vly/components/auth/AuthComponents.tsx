"use client";

import React from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  SignInButton as ClerkSignInButton,
  SignUpButton as ClerkSignUpButton,
} from "@clerk/nextjs";

interface SignedInProps {
  children: React.ReactNode;
}

export function SignedIn({ children }: SignedInProps) {
  const { isSignedIn, isLoaded } = useUser();
  // Don't render anything until Clerk has loaded to prevent hydration mismatch
  if (!isLoaded) return null;
  return isSignedIn ? <>{children}</> : null;
}

interface SignedOutProps {
  children: React.ReactNode;
}

export function SignedOut({ children }: SignedOutProps) {
  const { isSignedIn, isLoaded } = useUser();
  // Don't render anything until Clerk has loaded to prevent hydration mismatch
  if (!isLoaded) return null;
  return !isSignedIn ? <>{children}</> : null;
}

interface SignInButtonProps {
  children?: React.ReactNode;
  mode?: "modal" | "redirect";
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

export function SignInButton({
  children,
  mode = "modal",
  className,
  variant = "default",
  size = "default",
  asChild = false,
}: SignInButtonProps) {
  // Legacy custom modal implementation (commented out per request)
  // import { SignInModal } from "./SignInModal";
  // import { SignUpModal } from "./SignUpModal";
  // const [showSignIn, setShowSignIn] = useState(false);
  // const [showSignUp, setShowSignUp] = useState(false);
  // const handleClick = () => {
  //   if (mode === "redirect") {
  //     window.location.href = "/login";
  //   } else {
  //     setShowSignIn(true);
  //   }
  // };
  // const handleSwitchToSignUp = () => setTimeout(() => setShowSignUp(true), 100);
  // const handleSwitchToSignIn = () => setTimeout(() => setShowSignIn(true), 100);
  // if (asChild && React.isValidElement(children)) {
  //   return (
  //     <>
  //       {React.cloneElement(children as React.ReactElement<any>, { onClick: handleClick })}
  //       {mode === "modal" && (
  //         <>
  //           <SignInModal open={showSignIn} onOpenChange={setShowSignIn} onSwitchToSignUp={handleSwitchToSignUp} />
  //           <SignUpModal open={showSignUp} onOpenChange={setShowSignUp} onSwitchToSignIn={handleSwitchToSignIn} />
  //         </>
  //       )}
  //     </>
  //   );
  // }
  // return (
  //   <>
  //     <Button onClick={handleClick} className={className} variant={variant} size={size}>
  //       {children || "Sign In"}
  //     </Button>
  //     {mode === "modal" && (
  //       <>
  //         <SignInModal open={showSignIn} onOpenChange={setShowSignIn} onSwitchToSignUp={handleSwitchToSignUp} />
  //         <SignUpModal open={showSignUp} onOpenChange={setShowSignUp} onSwitchToSignIn={handleSwitchToSignIn} />
  //       </>
  //     )}
  //   </>
  // );

  // Use Clerk default modal; wrap provided children or render a Button
  if (asChild && React.isValidElement(children)) {
    return <ClerkSignInButton mode={mode}>{children}</ClerkSignInButton>;
  }
  return (
    <ClerkSignInButton mode={mode}>
      <Button className={className} variant={variant} size={size}>
        {children || "Sign In"}
      </Button>
    </ClerkSignInButton>
  );
}

interface SignUpButtonProps {
  children?: React.ReactNode;
  mode?: "modal" | "redirect";
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export function SignUpButton({
  children,
  mode = "modal",
  className,
  variant = "default",
  size = "default",
}: SignUpButtonProps) {
  // Legacy custom modal implementation (commented out per request)
  // import { SignInModal } from "./SignInModal";
  // import { SignUpModal } from "./SignUpModal";
  // const [showSignUp, setShowSignUp] = useState(false);
  // const [showSignIn, setShowSignIn] = useState(false);
  // const handleClick = () => {
  //   if (mode === "redirect") {
  //     window.location.href = "/signup";
  //   } else {
  //     setShowSignUp(true);
  //   }
  // };
  // const handleSwitchToSignIn = () => setTimeout(() => setShowSignIn(true), 100);
  // const handleSwitchToSignUp = () => setTimeout(() => setShowSignUp(true), 100);
  // return (
  //   <>
  //     <Button onClick={handleClick} className={className} variant={variant} size={size}>
  //       {children || "Sign Up"}
  //     </Button>
  //     {mode === "modal" && (
  //       <>
  //         <SignUpModal open={showSignUp} onOpenChange={setShowSignUp} onSwitchToSignIn={handleSwitchToSignIn} />
  //         <SignInModal open={showSignIn} onOpenChange={setShowSignIn} onSwitchToSignUp={handleSwitchToSignUp} />
  //       </>
  //     )}
  //   </>
  // );

  // Use Clerk default modal; wrap provided children or render a Button
  if (React.isValidElement(children)) {
    return <ClerkSignUpButton mode={mode}>{children}</ClerkSignUpButton>;
  }
  return (
    <ClerkSignUpButton mode={mode}>
      <Button className={className} variant={variant} size={size}>
        {children || "Sign Up"}
      </Button>
    </ClerkSignUpButton>
  );
}
