import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Popular Live',
  description: 'Learn how Popular Live protects your information and enforces its child safety standards against CSAE and CSAM.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Your privacy"
      title="Privacy Policy"
      description="This policy explains what information Popular Live collects, why we use it, when we share it, and the choices available to you."
      updated="September 13, 2026"
      accent="pink"
    >
      <aside className="mb-11 rounded-2xl border border-pink-400/20 bg-pink-500/[0.06] p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-400">Safety standards</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Popular Live has zero tolerance for child sexual abuse and exploitation. Read our externally published{' '}
          <a href="#child-safety-standards">Child Safety Standards against CSAE and CSAM</a>.
        </p>
      </aside>

      <section>
        <h2>1. Scope and who we are</h2>
        <p>
          This Privacy Policy applies to the Popular Live mobile application, websites, and related services (together, the “Service”). In this policy, “Popular Live,” “we,” “us,” and “our” refer to the team that operates the Service. By using the Service, you acknowledge the practices described here.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>We collect information you provide, information created through your use of the Service, and limited technical information collected automatically.</p>
        <h3>Information you provide</h3>
        <ul>
          <li>Account details, such as your name, username, phone number, email address, date of birth or age information, profile photo, and authentication credentials.</li>
          <li>Profile details and content you create, upload, broadcast, or send, including live audio or video, photos, comments, and direct messages.</li>
          <li>Support requests, reports, appeals, verification information, and other communications with us.</li>
          <li>Payment or withdrawal details needed to process purchases, top-ups, earnings, or payouts. Full payment-card details may be collected directly by the relevant payment provider rather than by us.</li>
        </ul>
        <h3>Information collected when you use Popular Live</h3>
        <ul>
          <li>Activity data, such as rooms joined, accounts followed, gifts sent or received, game activity, subscriptions, and interactions with features.</li>
          <li>Transaction records involving Diamonds, Beans, gifts, subscriptions, top-ups, refunds, and withdrawals.</li>
          <li>Device and network data, including IP address, device identifiers, device model, operating system, app version, language, time zone, mobile carrier, crash logs, and diagnostics.</li>
          <li>Approximate or precise location when you enable location-based or nearby features. You can control precise location access through your device settings.</li>
          <li>Safety and integrity signals used to detect spam, fraud, account compromise, abuse, and violations of our rules.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>create and secure accounts, authenticate users, and provide live rooms, messaging, discovery, virtual goods, subscriptions, games, and other Service features;</li>
          <li>process and maintain transaction, earnings, payout, and account records;</li>
          <li>personalize content, recommendations, rankings, language, and regional experiences;</li>
          <li>moderate content, investigate reports, enforce our Terms, and protect users and the Service;</li>
          <li>provide customer support and communicate about service, security, policy, and account updates;</li>
          <li>measure performance, fix errors, develop new features, and improve accessibility and reliability; and</li>
          <li>comply with law, respond to lawful requests, resolve disputes, and prevent fraud or other harmful activity.</li>
        </ul>
      </section>

      <section>
        <h2>4. When we share information</h2>
        <p>We do not sell your personal information. We may share information in the following circumstances:</p>
        <ul>
          <li><strong>With other users.</strong> Your profile, public activity, live broadcasts, room participation, rankings, and gifts may be visible to others depending on the feature and your settings.</li>
          <li><strong>With service providers.</strong> Vendors help us provide infrastructure, authentication, cloud storage, databases, analytics, customer support, payments, and live audio or video delivery. These include Supabase, Agora, Google when you choose Google sign-in, and relevant payment providers.</li>
          <li><strong>For safety and legal reasons.</strong> We may disclose information when reasonably necessary to comply with law or legal process, enforce our terms, investigate fraud or abuse, or protect the rights and safety of users, the public, or Popular Live.</li>
          <li><strong>During a business transaction.</strong> Information may be transferred as part of a merger, financing, acquisition, reorganization, or sale of assets, subject to appropriate safeguards.</li>
          <li><strong>With your direction or consent.</strong> We share information when you ask us to or clearly authorize it.</li>
        </ul>
      </section>

      <section>
        <h2>5. Retention</h2>
        <p>
          We retain information for as long as necessary to provide the Service and for the purposes described in this policy. Retention depends on the type of information, why it was collected, and legal or operational requirements. After an account-deletion request, we delete or anonymize profile information where reasonably possible. We may retain limited transaction, gift, game, payout, safety, fraud-prevention, and dispute records where required for accounting, legal compliance, security, or the establishment or defense of legal claims.
        </p>
      </section>

      <section>
        <h2>6. Your choices and privacy rights</h2>
        <p>
          You may update certain profile information and permissions in the app or your device settings. You can request account deletion through <strong>Settings → Delete Account</strong>. You may also contact us to request access, correction, deletion, or a copy of your information, or to object to or restrict certain processing where applicable. We may need to verify your identity before completing a request, and some rights may be limited by local law.
        </p>
      </section>

      <section>
        <h2>7. Security and international processing</h2>
        <p>
          We use technical and organizational safeguards designed to protect information, including encrypted network connections, access controls, and monitoring. No online service can guarantee absolute security. Popular Live and its providers may process information in countries other than the country where you live. Where required, we use appropriate safeguards for these transfers.
        </p>
      </section>

      <section>
        <h2>8. Children</h2>
        <p>
          Popular Live is not intended for children under 18. We do not knowingly collect personal information from anyone under 18. If you believe a child has provided information to us, contact us so we can investigate and take appropriate action.
        </p>
      </section>

      <section id="child-safety-standards" className="scroll-mt-8">
        <h2>9. Child Safety Standards against CSAE and CSAM</h2>
        <p>
          Popular Live has zero tolerance for child sexual abuse and exploitation (“CSAE”) and child sexual abuse material (“CSAM”). CSAE includes content or conduct that sexually exploits, abuses, or endangers a child, including grooming, sextortion, sexual trafficking of a child, and attempts to obtain or share sexual content involving a child. CSAM includes visual depictions of a minor engaged in sexually explicit conduct. These standards apply worldwide to every Popular Live user, host, agency, reseller, and account.
        </p>

        <h3>Prohibited content and behavior</h3>
        <p>Users must not use Popular Live to:</p>
        <ul>
          <li>create, upload, broadcast, request, possess, store, share, promote, or distribute CSAM;</li>
          <li>groom, coerce, threaten, sextort, traffic, solicit, or otherwise sexually exploit or endanger a child;</li>
          <li>sexualize children or facilitate inappropriate sexual contact or communication with a child;</li>
          <li>identify, advertise, normalize, or direct others to CSAE, CSAM, or services that facilitate child exploitation; or</li>
          <li>attempt, encourage, coordinate, or assist any of the prohibited activity above.</li>
        </ul>

        <h3>How to report child-safety concerns</h3>
        <p>
          Users can submit concerns without leaving the app by opening the relevant user or room controls, selecting <strong>Report</strong>, choosing the applicable reason, and adding details. Reports may also be emailed to our designated Child Safety Point of Contact at{' '}
          <a href="mailto:carelive785@gmail.com?subject=Urgent%20Child%20Safety%20Report">carelive785@gmail.com</a>. Include the reported username or ID, room details, and a description of what occurred when it is safe to do so. Do not download, save, forward, or email suspected CSAM.
        </p>
        <p>
          If a child is in immediate danger, contact local emergency services or law enforcement first. The in-app and email reporting channels are not emergency services.
        </p>

        <h3>Review, enforcement, and reporting to authorities</h3>
        <p>
          We review child-safety reports and take appropriate action when we obtain actual knowledge of CSAE or CSAM. Actions may include immediately restricting access, removing content, suspending or permanently terminating accounts, preserving relevant evidence where lawful, and preventing repeat abuse. We comply with applicable child-safety laws and report confirmed CSAM to the National Center for Missing &amp; Exploited Children (NCMEC) or the appropriate regional authority when required by law. We may cooperate with lawful investigations by relevant authorities.
        </p>

        <h3>Designated child-safety contact</h3>
        <p>
          Google Play and child-safety organizations may contact Popular Live’s designated representative at{' '}
          <a href="mailto:carelive785@gmail.com?subject=Child%20Safety%20Notice">carelive785@gmail.com</a>. This contact receives CSAE-related notices and can address our review and enforcement procedures.
        </p>
      </section>

      <section>
        <h2>10. Changes to this policy</h2>
        <p>
          We may update this policy as the Service or legal requirements change. We will post the revised policy here and update the effective date. If a change materially affects your rights, we will provide additional notice where required.
        </p>
      </section>

      <section>
        <h2>11. Contact us</h2>
        <p>
          For privacy questions, rights requests, or account-deletion help, email us at{' '}
          <a href="mailto:carelive785@gmail.com">carelive785@gmail.com</a>. Please do not include passwords or sensitive payment information in your email.
        </p>
      </section>
    </LegalPage>
  );
}
