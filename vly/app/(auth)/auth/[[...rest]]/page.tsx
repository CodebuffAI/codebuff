import { SignUp } from "@clerk/nextjs";

export default function AuthPage() {
  return (
    <main className="flex h-screen w-screen items-center justify-center">
      <SignUp />
    </main>
  );
}
