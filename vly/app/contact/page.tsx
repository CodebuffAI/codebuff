import { Suspense } from "react";
import { ContactPage as ContactPageComponent } from "@/components/ContactPage";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Contact | vly.ai",
  description: "Get in touch with the vly.ai team.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactPageComponent />
    </Suspense>
  );
}
