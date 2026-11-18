import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CreatorFlow AI" },
      { name: "description", content: "The terms for using CreatorFlow AI: accounts, credits, payments, refunds, content and publishing to social platforms." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
  return (
    <LegalPage
      title="Terms of Service"
      intro={<>These terms govern your use of CreatorFlow AI (“CreatorFlow”, “we”, “us”), operated by ProdXStore, India, at creatorflowai.prodxstore.com. By creating an account or using CreatorFlow you agree to them.</>}
    >
      <Section title="1. Your account">
        <ul>
          <li>You must be at least 18 years old and give accurate account information.</li>
          <li>You are responsible for activity on your account and for keeping your login secure.</li>
          <li>One person per account; don't share or resell access.</li>
        </ul>
      </Section>

      <Section title="2. Plans, credits and payments">
        <ul>
          <li>Generations use credits. The credit cost of each action is shown in the app before you run it.</li>
          <li>Monthly and yearly plans include a monthly credit allowance that resets each billing month; unused plan credits do not carry over. Yearly plans are billed once a year and refill monthly.</li>
          <li>Lifetime plans include the one-time credits stated at purchase, which don't expire while your account is active. Lifetime plans also include a monthly bonus allowance (shown on the pricing page) that refills on your purchase day each month for as long as CreatorFlow operates. Bonus credits are used before your other credits, don't carry over to the next month, and the monthly amount may be adjusted with reasonable notice.</li>
          <li>Top-up credits stay on your account until used while your account is active.</li>
          <li>Payments are processed by Razorpay. Prices are shown on the <Link to="/pricing">pricing page</Link> and may change for future purchases.</li>
          <li>If a generation fails, its credits are refunded to your balance automatically.</li>
        </ul>
      </Section>

      <Section title="3. Refunds">
        <p>Refunds or account credit are available for verified platform issues, including:</p>
        <ul>
          <li>payment succeeded but the plan or credits were never activated;</li>
          <li>a verified platform issue prevents you from using what you paid for and we cannot fix it;</li>
          <li>credits were deducted because of a confirmed bug;</li>
          <li>a duplicate charge caused by the payment gateway.</li>
        </ul>
        <p>Refunds are not available for credits already used on successful generations, change of mind, or restrictions imposed by third-party platforms. Request a refund by emailing {mail} within 7 days of the issue.</p>
      </Section>

      <Section title="4. Your content">
        <ul>
          <li>You own the prompts and materials you provide and, as between you and us, the outputs you generate, subject to the terms of the underlying AI model providers.</li>
          <li>You give us a limited licence to store and process your content only to operate the service for you (for example, to generate, save and publish it).</li>
          <li>AI output can be inaccurate or resemble existing works. You are responsible for reviewing what you publish and for having the rights to anything you upload (photos, faces, logos, music).</li>
        </ul>
      </Section>

      <Section title="5. Acceptable use">
        <p>You must not use CreatorFlow to create or publish content that is illegal, sexually explicit, involves minors, harasses or impersonates real people, infringes intellectual property, spreads deliberate misinformation, or violates the rules of the platforms you publish to. We may refuse, remove content, or suspend accounts that break these rules.</p>
      </Section>

      <Section title="6. Publishing to social platforms">
        <ul>
          <li>When you connect YouTube, Instagram, Facebook or LinkedIn, you authorise CreatorFlow to publish the content you choose to the account you select. We only post when you click Publish or schedule a post.</li>
          <li>Your use of those platforms is governed by their own terms, including the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>. We are not responsible for their availability, rules, takedowns or account decisions.</li>
          <li>You can disconnect any account at any time in Connections. See our <Link to="/privacy">Privacy Policy</Link> for how this data is handled.</li>
        </ul>
      </Section>

      <Section title="7. Service availability">
        <p>We work to keep CreatorFlow available and reliable, but the service depends on third-party AI and platform providers and is provided “as is”. Features, models and credit costs may change over time.</p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>To the extent permitted by law, CreatorFlow is not liable for indirect or consequential losses, and our total liability for any claim is limited to the amount you paid us in the 3 months before the claim.</p>
      </Section>

      <Section title="9. Ending your account">
        <p>You can stop using CreatorFlow at any time and ask us to delete your account (see the Privacy Policy). We may suspend or close accounts that violate these terms.</p>
      </Section>

      <Section title="10. Governing law and contact">
        <p>These terms are governed by the laws of India. We may update them and will post changes here with a new date. Questions: {mail}.</p>
      </Section>
    </LegalPage>
  );
}
