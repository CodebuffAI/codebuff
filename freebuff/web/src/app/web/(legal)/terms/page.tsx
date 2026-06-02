import { Metadata } from "next";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Terms of Service | Freebuff Web",
    description: "Read the Freebuff Web terms of service.",
    path: "/web/terms",
  }),
};

export default function TermsOfService() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <main className="prose prose-invert prose-lg max-w-none">
        <h1 className="mb-6 text-3xl font-bold">Terms of Service</h1>
        <p className="mb-6 text-sm text-zinc-400">Last updated: 05/26/26</p>

        <p className="mb-4">Welcome to Freebuff Web.</p>
        <p className="mb-6">
          These Terms of Service ("Terms") govern your access to and use of
          https://freebuff.com (the "Site") and the Freebuff Web services
          ("Freebuff", "we", "our", or "us"), an AI-powered web app builder
          developed by the Freebuff team. Freebuff Web is a distinct product
          from the original Freebuff command-line agent and is governed by
          these Terms. By accessing or using the Site, you agree to be bound
          by these Terms. If you do not agree to these Terms, do not use our
          services.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          1. Use of the Site and Services
        </h2>
        <p className="mb-4">
          By using the Site and our services, you agree to:
        </p>
        <ul className="mb-6 list-disc pl-6">
          <li>
            Use Freebuff Web for lawful purposes only and in compliance with
            all applicable laws.
          </li>
          <li>
            Provide accurate and complete information when registering or
            purchasing services from us.
          </li>
          <li>
            Not engage in any activity that disrupts or interferes with our
            services, networks, or systems.
          </li>
          <li>
            Not attempt to access unauthorized areas of the Site or our
            systems.
          </li>
        </ul>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">2. User Accounts</h2>
        <p className="mb-6">
          To use certain features of Freebuff Web, you may be required to
          create an account. You are responsible for safeguarding your
          password and account information and for any activity that occurs
          under your account. If you suspect unauthorized access to your
          account, please notify us immediately.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          3. Payment and Billing
        </h2>
        <p className="mb-6">
          When you purchase Freebuff Web services, you agree to provide
          accurate billing information and to pay all applicable fees. Prices
          for services are subject to change at our discretion, and you will
          be informed of any such changes before your next billing cycle.
          Failure to pay may result in termination of your access to the
          services. You are required to pay for the credits and services you
          consume. You may not circumvent payments by fraudulently taking
          advantage of discounts and promotions, including but not limited to
          faking geographical location, fraudulently claiming student status,
          or creating multiple accounts to abuse referral bonuses. You are
          responsible for any price differences owed due to fraudulent
          activity.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          4. Intellectual Property
        </h2>
        <p className="mb-6">
          All content on the Site, including but not limited to text,
          graphics, logos, images, software, and code, is the property of
          Freebuff and is protected by intellectual property laws. You may
          not use, copy, reproduce, or distribute any part of the Site
          without our prior written consent.
          <br />
          Because we underwrite the cost of running Freebuff Web's model and
          infrastructure, different property rules apply: content generated
          on free plans (including generated code, text, and assets) is not
          subject to intellectual property protections, since Freebuff is
          paying for the generation. Users on paid plans retain intellectual
          property protections on content generated while on the paid plan.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">5. Restrictions</h2>
        <p className="mb-4">You agree not to:</p>
        <ul className="mb-6 list-disc pl-6">
          <li>
            Modify, reverse-engineer, or attempt to derive the source code of
            the proprietary software used in our services.
          </li>
          <li>
            Use Freebuff Web to transmit any content that is unlawful,
            harmful, threatening, or otherwise objectionable.
          </li>
          <li>
            Attempt to interfere with or compromise the security or integrity
            of our services or servers.
          </li>
          <li>
            Impersonate any person or entity or falsely state or misrepresent
            your affiliation with a person or entity.
          </li>
          <li>
            Expose our underlying intellectual property, such as system
            prompt injections, proprietary source code, or other confidential
            information.
          </li>
          <li>To defame, disparage, or otherwise harm Freebuff's reputation.</li>
        </ul>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">6. Termination</h2>
        <p className="mb-6">
          We reserve the right to terminate or suspend your account and access
          to Freebuff Web at any time, with or without notice, for any
          reason, including if you breach these Terms. Upon termination, you
          must cease all use of the Site and any associated services.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          7. Disclaimer of Warranties
        </h2>
        <p className="mb-6">
          Freebuff Web is provided on an "as is" and "as available" basis. We
          do not warrant that the services will be uninterrupted or
          error-free, and we make no representations or warranties of any
          kind, express or implied, regarding the accuracy, reliability, or
          availability of our services.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          8. Limitation of Liability
        </h2>
        <p className="mb-6">
          To the fullest extent permitted by law, Freebuff shall not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages arising out of or related to your use of the Site
          or Freebuff Web. In no event shall our total liability to you
          exceed the amount you paid to us for services.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">9. Indemnification</h2>
        <p className="mb-6">
          You agree to indemnify, defend, and hold harmless Freebuff and its
          affiliates, officers, directors, employees, and agents from and
          against any claims, liabilities, damages, losses, and expenses
          (including reasonable attorney's fees) arising out of or related to
          your use of Freebuff Web or breach of these Terms.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          10. Relationship to Other Freebuff Products
        </h2>
        <p className="mb-6">
          Freebuff Web is governed by these Terms. Other Freebuff products,
          such as the Freebuff command-line interface, are governed by their
          own separate terms. Use of those products is not governed by this
          document; please consult the terms specific to each product.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          11. Changes to the Terms
        </h2>
        <p className="mb-6">
          We may update these Terms from time to time. We will notify you of
          any changes by posting the new Terms on the Site. Your continued
          use of the Site after any changes to the Terms constitutes your
          acceptance of the new Terms.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">12. Governing Law</h2>
        <p className="mb-6">
          These Terms shall be governed and construed in accordance with the
          laws of the State of Delaware, without regard to its conflict of
          law provisions.
        </p>

        <h2 className="mb-4 mt-8 text-2xl font-semibold">
          13. Contact Information
        </h2>
        <p className="mb-6">
          If you have any questions or concerns about these Terms, please
          contact us at:
        </p>
        <address className="mb-6 not-italic">
          Freebuff
          <br />
          Email:{" "}
          <a
            href="mailto:team@freebuff.com"
            className="text-[#7CFF3F] hover:underline"
          >
            team@freebuff.com
          </a>
        </address>
      </main>
    </div>
  );
}
