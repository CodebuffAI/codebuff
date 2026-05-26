import { Metadata } from "next";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Privacy Policy | vly.ai",
    description: "Read the vly.ai privacy policy.",
    path: "/web/privacy",
  }),
};

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <main className="prose prose-lg">
        <h1 className="mb-6 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-6 text-sm text-gray-600">Last updated: 09/24/24</p>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">Introduction</h2>
          <p>
            Vly Labs Inc. ("we", "our", "us") operates the website
            https://vly.ai (the "Site"). This privacy policy explains how we
            collect, use, and protect the personal information of users who
            visit our Site and use our services. By using the Site, you agree to
            the collection and use of information in accordance with this
            policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">
            1. Information We Collect
          </h2>
          <p>
            We collect several types of information to provide and improve our
            service, including:
          </p>
          <ul className="mb-4 list-disc pl-6">
            <li className="mb-2">
              <strong>Personal Information:</strong> When you register on our
              Site, we may ask for personal information such as your name, email
              address, phone number, and billing details.
            </li>
            <li className="mb-2">
              <strong>Usage Data:</strong> We may collect information about how
              the Site is accessed and used. This may include your IP address,
              browser type, pages visited, and the time and date of your visit.
            </li>
            <li className="mb-2">
              <strong>Cookies and Tracking:</strong> We use cookies and similar
              tracking technologies to track user behavior and store certain
              information to improve your experience on our Site.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">
            2. How We Use Your Information
          </h2>
          <p>We use the collected data for various purposes:</p>
          <ul className="list-disc pl-6">
            <li>To provide and maintain our services</li>
            <li>To notify you of changes to our services</li>
            <li>To provide customer support</li>
            <li>
              To gather analytics and valuable insights to improve our services
            </li>
            <li>To detect, prevent, and address technical issues</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">
            3. Sharing Your Information
          </h2>
          <p>
            We do not share your personal information with third parties except
            in the following cases:
          </p>
          <ul className="list-disc pl-6">
            <li>To comply with legal obligations</li>
            <li>
              To protect and defend the rights or property of Vly Labs Inc.
            </li>
            <li>
              With service providers who assist in operating the Site, subject
              to confidentiality agreements
            </li>
            <li>
              Other service providers who help support the operations of the
              Site
            </li>
          </ul>
          <p>
            Individuals on paid plans versus free plans may be subject to
            different privacy policies, including options to opt-out, etc.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">4. Data Security</h2>
          <p>
            We are committed to protecting your personal information. We use a
            variety of security measures, including encryption and secure
            servers, to ensure the safety of your data. However, no method of
            transmission over the internet or method of electronic storage is
            100% secure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">5. Data Retention</h2>
          <p>
            We retain your personal data only for as long as necessary for the
            purposes set out in this policy, unless a longer retention period is
            required by law.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6">
            <li>Access and receive a copy of your personal data</li>
            <li>
              Request the correction of inaccurate or incomplete information
            </li>
            <li>
              Request the deletion of your personal data, subject to certain
              conditions
            </li>
            <li>
              Object to the processing of your personal data for marketing
              purposes
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">7. Third-Party Links</h2>
          <p>
            Our Site may contain links to other websites. We are not responsible
            for the privacy practices of third-party sites. We encourage you to
            read their privacy policies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">8. Children's Privacy</h2>
          <p>
            Our services are not intended for anyone under the age of 13. We do
            not knowingly collect personally identifiable information from
            children under 13.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">
            9. Changes to This Privacy Policy
          </h2>
          <p>
            We may update our privacy policy from time to time. We will notify
            you of any changes by posting the new policy on this page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold">Contact Us</h2>
          <p>
            If you have any questions or concerns about this Privacy Policy,
            please contact us:
          </p>
          <address className="not-italic">
            Vly Labs Inc.
            <br />
            2235 3rd Street W309
            <br />
            San Francisco, CA 94107
            <br />
            Email:{" "}
            <a href="mailto:team@vly.ai" className="text-blue-600">
              team@vly.ai
            </a>
          </address>
        </section>
      </main>
    </div>
  );
}
