"use client";

// Legacy custom signup modal page kept for reference
// import { SignInModal } from "@/components/auth/SignInModal";
// import { SignUpModal } from "@/components/auth/SignUpModal";
// import { useState, useEffect } from "react";
// import { useRouter } from "next/navigation";
// export default function SignUpPage() {
//   const [showSignIn, setShowSignIn] = useState(false);
//   const [showSignUp, setShowSignUp] = useState(true);
//   const router = useRouter();
//   useEffect(() => { setShowSignUp(true); }, []);
//   const handleSignUpClose = (open: boolean) => { if (!open) router.push("/"); };
//   const handleSignInClose = (open: boolean) => { setShowSignIn(open); if (!open) setShowSignUp(true); };
//   const switchToSignIn = () => { setShowSignUp(false); setShowSignIn(true); };
//   const switchToSignUp = () => { setShowSignIn(false); setShowSignUp(true); };
//   return (
//     <main className="flex h-screen w-screen items-center justify-center">
//       <SignUpModal open={showSignUp} onOpenChange={handleSignUpClose} onSwitchToSignIn={switchToSignIn} />
//       <SignInModal open={showSignIn} onOpenChange={handleSignInClose} onSwitchToSignUp={switchToSignUp} />
//     </main>
//   );
// }

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <SignUp path="/signup" routing="path" signInUrl="/login" />
    </main>
  );
}
