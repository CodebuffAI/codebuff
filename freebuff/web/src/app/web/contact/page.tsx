import { Suspense } from "react";
import { ContactPage as ContactPageComponent } from "@/vly/components/ContactPage";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Contact | vly.ai",
  description: "Get in touch with the vly.ai team.",
  path: "/web/contact",
});

export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactPageComponent />
    </Suspense>
  );
}
