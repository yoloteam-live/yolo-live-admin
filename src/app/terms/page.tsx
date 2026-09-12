import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service | Popular Live',
  description: 'The terms that govern access to and use of Popular Live.',
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Using our service"
      title="Terms of Service"
      description="These terms set the rules for accessing Popular Live, creating content, and using virtual goods and paid features."
      updated="September 13, 2026"
      accent="violet"
    >
      <section>
        <h2>1. Acceptance of these terms</h2>
        <p>
          These Terms of Service (“Terms”) govern your access to the Popular Live mobile application, websites, and related services (the “Service”). By creating an account or using the Service, you agree to these Terms and our <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and accounts</h2>
        <p>
          You must be at least 18 years old and legally able to enter into these Terms. You must provide accurate information, keep your login credentials secure, and promptly tell us if you suspect unauthorized account use. You are responsible for activity under your account. You may not sell, transfer, or share access to an account without our written permission.
        </p>
      </section>

      <section>
        <h2>3. Content and conduct</h2>
        <p>You keep ownership of content you create. You give Popular Live a worldwide, non-exclusive, royalty-free license to host, store, reproduce, display, distribute, and technically adapt that content only as needed to operate, improve, promote, and protect the Service. This license ends when your content is deleted, except where copies must be retained for legal, safety, backup, or technical reasons.</p>
        <p>You may not use the Service to:</p>
        <ul>
          <li>create, broadcast, or share illegal, sexually exploitative, abusive, hateful, harassing, fraudulent, or dangerously misleading content;</li>
          <li>violate another person’s privacy, publicity, intellectual-property, or other rights;</li>
          <li>impersonate others, manipulate engagement, send spam, or operate deceptive schemes;</li>
          <li>interfere with the Service, bypass security or access controls, scrape data without permission, or reverse engineer protected parts of the Service; or</li>
          <li>use virtual goods, payments, or withdrawals for money laundering, unauthorized gambling, fraud, or other unlawful activity.</li>
        </ul>
        <p>We may review content and account activity, remove content, restrict features, or suspend or terminate accounts to enforce these Terms and protect the community.</p>
      </section>

      <section>
        <h2>4. Virtual goods, earnings, and payments</h2>
        <p>
          Popular Live may offer virtual items such as Diamonds, Beans, gifts, and status benefits. Virtual items are licensed, not sold; they are not legal tender, deposits, or property and cannot be transferred or exchanged outside methods expressly offered by the Service. Prices, conversion rates, availability, balances, and feature rules may change where permitted by law.
        </p>
        <p>
          Purchases are generally final and non-refundable except where required by law or the applicable app store’s rules. Creator or host earnings and withdrawals remain subject to eligibility, identity verification, thresholds, conversion rates, fees, tax obligations, fraud review, and applicable program rules. We may correct balances or reverse transactions affected by error, chargeback, fraud, or a violation of these Terms.
        </p>
      </section>

      <section>
        <h2>5. Subscriptions</h2>
        <p>
          VIP, SVIP, VVIP, or similar subscriptions may provide benefits described at purchase. Billing, renewal, cancellation, and refunds are handled under the terms shown at checkout and the rules of your app store or payment provider. Cancelling stops future renewal but ordinarily does not refund the current billing period. We may update benefits prospectively and will provide notice where required.
        </p>
      </section>

      <section>
        <h2>6. Intellectual property</h2>
        <p>
          The Service, excluding user content, is owned by Popular Live or its licensors and is protected by intellectual-property laws. These Terms give you a limited, personal, revocable, non-exclusive, non-transferable right to use the Service as intended. No other rights are granted.
        </p>
      </section>

      <section>
        <h2>7. Suspension and termination</h2>
        <p>
          You may stop using the Service or delete your account at any time. We may restrict, suspend, or terminate access when we reasonably believe you violated these Terms, created risk or legal exposure, or endangered users or the Service. Where appropriate, we may provide notice or an opportunity to appeal. Provisions that by their nature should survive termination will remain in effect.
        </p>
      </section>

      <section>
        <h2>8. Disclaimers and limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the Service is provided “as is” and “as available.” We do not guarantee uninterrupted, error-free, or completely secure operation, or that user content will always be accurate or available. To the fullest extent permitted by law, Popular Live and its team will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, goodwill, or business opportunities arising from your use of the Service. Nothing in these Terms excludes liability that cannot legally be excluded.
        </p>
      </section>

      <section>
        <h2>9. Changes to the Service or Terms</h2>
        <p>
          We may modify features or update these Terms as the Service and applicable law evolve. We will post updated Terms and change the effective date. When required, we will give additional notice. Continued use after updated Terms take effect means you accept them; if you do not agree, you must stop using the Service.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about these Terms may be sent to <a href="mailto:carelive785@gmail.com">carelive785@gmail.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
