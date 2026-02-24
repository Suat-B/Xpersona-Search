import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Xpersona",
  description: "Privacy policy for Xpersona search and agent tools.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <Link href="/" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-heart)]">Back to home</Link>
        <h1 className="mt-3 text-3xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-[var(--text-secondary)]">Last updated: February 24, 2026</p>
      </header>

      <section className="agent-card p-6 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
{`This Privacy Policy ("Policy") explains how Xpersona ("Xpersona," "we," "us," or "our") collects, uses, discloses, and retains information in connection with the Xpersona website, applications, and related services (collectively, the "Services"). By accessing or using the Services, you acknowledge that you have read and understood this Policy.

1. Information We Collect
We may collect the following categories of information, depending on how you interact with the Services:
- Account and profile data (e.g., name, email address, authentication credentials, profile settings, and agent-claim/customization records).
- Usage and device data (e.g., search queries, agent interactions, feature usage, timestamps, IP address, device identifiers, browser type, and operating system).
- Communications (e.g., support requests, feedback, or other communications you send to us).
- Transactional and operational data (e.g., system logs, audit trails, and security events).

2. How We Use Information
We use information for the following purposes:
- Provide, maintain, and improve authentication, search, and claimed-agent management features.
- Personalize and optimize the Services, including relevance and ranking of search results.
- Detect, prevent, investigate, and respond to fraud, abuse, security incidents, and technical issues.
- Comply with legal obligations, enforce our terms, and protect our rights, safety, and property.
- Communicate with you about your account, updates, and service-related notices.

3. Legal Bases for Processing (where applicable)
Where required by law, we process personal data based on one or more legal bases, including: performance of a contract, legitimate interests (such as service improvement and security), compliance with legal obligations, and your consent.

4. Sharing and Disclosure
We may disclose information as follows:
- Service providers and subprocessors (e.g., hosting, database, analytics, and email providers) that process data on our behalf under contractual confidentiality and security obligations.
- Legal and regulatory disclosures, including in response to lawful requests, court orders, or to comply with applicable laws.
- Business transfers in connection with a merger, acquisition, financing, reorganization, or sale of assets.
We do not sell personal data.

5. Data Retention
We retain information only for as long as reasonably necessary to provide the Services, comply with legal obligations, resolve disputes, enforce agreements, and maintain security and operational integrity. Retention periods may vary depending on data type and legal requirements.

6. Data Security
We implement administrative, technical, and physical safeguards designed to protect information. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.

7. Your Choices and Rights
Depending on your location, you may have rights to access, correct, delete, or restrict processing of your personal data, and to request data portability or object to certain processing. You can submit requests through support channels on xpersona.co. We may verify your identity before fulfilling requests.

8. International Transfers
Your information may be processed in countries other than your own. Where required, we use appropriate safeguards (such as standard contractual clauses) to protect data transferred internationally.

9. Children’s Privacy
The Services are not directed to children under the age of 13 (or other age as required by local law). We do not knowingly collect personal data from children without verifiable parental consent.

10. Third-Party Links
The Services may contain links to third-party sites. We are not responsible for the privacy practices of those third parties, and this Policy does not apply to their services.

11. Region-Specific Notices
The following notices apply only to residents of the specified jurisdictions, in addition to the sections above.

11.1 California (CCPA/CPRA)
California residents may have the right to know the categories and specific pieces of personal information we collect, use, disclose, and share; the right to delete personal information; the right to correct inaccurate personal information; the right to opt out of the sale or sharing of personal information; and the right to limit the use and disclosure of sensitive personal information. We do not sell or share personal information as those terms are defined under California law. We do not use or disclose sensitive personal information for purposes that would require a “limit” request. You may exercise applicable rights by contacting us through support channels on xpersona.co. Authorized agents may submit requests on your behalf where permitted by law.

11.2 Texas (TDPSA)
Texas residents may have the right to confirm whether we process their personal data, access their personal data, correct inaccuracies, delete personal data, obtain a portable copy of personal data, and opt out of certain processing (including targeted advertising, the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects). We do not sell personal data. You can submit a request through support channels on xpersona.co, and you may appeal a decision by replying to our response or contacting support.

11.3 Delaware (DPDPA)
Delaware residents may have the right to confirm whether we process their personal data, access their personal data, correct inaccuracies, delete personal data, obtain a portable copy of personal data, and opt out of certain processing (including targeted advertising, the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects). We do not sell personal data. You can submit a request through support channels on xpersona.co, and you may appeal a decision by replying to our response or contacting support.

11.4 European Economic Area (EEA) and United Kingdom (UK GDPR)
If you are located in the EEA or the UK, you may have rights to access, correct, erase, restrict, or object to processing of your personal data, and to data portability. You may also withdraw consent at any time where processing is based on consent, without affecting the lawfulness of processing before withdrawal. You may lodge a complaint with a supervisory authority in your country of residence, place of work, or where an alleged infringement occurred. We rely on legal bases described in Section 3 and apply appropriate safeguards for international transfers as described in Section 8.

12. Changes to This Policy
We may update this Policy from time to time. If we make material changes, we will update the “Last updated” date and may provide additional notice as required by law.

13. Contact Us
If you have questions about this Policy or our privacy practices, contact us through support channels on xpersona.co.

By using Xpersona, you consent to this Policy.`}
      </section>
    </div>
  );
}
