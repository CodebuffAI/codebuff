"use client";

// Legacy custom login modal page kept for reference
// import { SignInModal } from "@/components/auth/SignInModal";
// import { SignUpModal } from "@/components/auth/SignUpModal";
// import { useState, useEffect } from "react";
// import { useRouter } from "next/navigation";
// export default function LoginPage() {
//   const [showSignIn, setShowSignIn] = useState(true);
//   const [showSignUp, setShowSignUp] = useState(false);
//   const router = useRouter();
//   useEffect(() => { setShowSignIn(true); }, []);
//   const handleSignInClose = (open: boolean) => { if (!open) router.push("/"); };
//   const handleSignUpClose = (open: boolean) => { setShowSignUp(open); if (!open) setShowSignIn(true); };
//   const switchToSignUp = () => { setShowSignIn(false); setShowSignUp(true); };
//   const switchToSignIn = () => { setShowSignUp(false); setShowSignIn(true); };
//   return (
//     <main className="flex h-screen w-screen items-center justify-center">
//       <SignInModal open={showSignIn} onOpenChange={handleSignInClose} onSwitchToSignUp={switchToSignUp} />
//       <SignUpModal open={showSignUp} onOpenChange={handleSignUpClose} onSwitchToSignIn={switchToSignIn} />
//     </main>
//   );
// }

import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <SignIn path="/login" routing="path" signUpUrl="/signup" />
    </main>
  );
}
