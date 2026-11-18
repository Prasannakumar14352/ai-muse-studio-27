import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, Section } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CreatorFlow AI" },
      { name: "description", content: "How CreatorFlow AI collects, uses, stores and deletes your data, including data from Google, YouTube, Meta and LinkedIn." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const mail = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<>CreatorFlow AI (“CreatorFlow”, “we”, “us”) is an AI content studio operated by ProdXStore, India, at creatorflowai.prodxstore.com. This policy explains what we collect, why, who we share it with, and how you can control or delete it.</>}
    >
      <Section title="1. Information we collect">
        <ul>
          <li><b>Account details:</b> your name, email address and profile picture when you sign up with email or with Google.</li>
          <li><b>Content you create:</b> prompts, scripts, uploaded images and references, and the images, videos, voiceovers, captions and other outputs you generate and save.</li>
          <li><b>Billing details:</b> your plan, credit balance, purchase history and invoices. Card, UPI and bank details are entered directly with our payment processor, Razorpay; we never see or store them.</li>
          <li><b>Connected social accounts:</b> if you connect YouTube, Instagram, Facebook or LinkedIn, we store the access tokens those services issue, plus the account or page name and ID you choose to post to.</li>
          <li><b>Technical data:</b> basic logs (time of request, error messages) needed to run, secure and debug the service.</li>
        </ul>
        <p>We do not use advertising trackers or third-party analytics, and we do not sell your personal data.</p>
      </Section>

      <Section title="2. How we use it">
        <ul>
          <li>To provide the service: generate content from your prompts, save your projects and deliver downloads.</li>
          <li>To publish or schedule posts to your connected social accounts — only content you choose, only when you click Publish or Schedule.</li>
          <li>To manage your plan, credits, payments and invoices.</li>
          <li>To respond to support requests and to prevent fraud and abuse.</li>
        </ul>
      </Section>

      <Section id="google" title="3. Google and YouTube data">
        <p>
          If you connect a YouTube channel, CreatorFlow requests the <code>youtube.upload</code> and <code>youtube.readonly</code> permissions.
          Together with your basic Google profile (name, email), we use them only to read your channel's name and ID (so you can see which channel is connected) and to upload the videos you choose to publish.
          We do not read, download or analyse your existing videos, comments, subscribers or analytics.
        </p>
        <p>
          CreatorFlow's use and transfer of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
          including the Limited Use requirements. Google user data is never used for advertising, never sold, and never used to train AI models.
        </p>
        <p>
          CreatorFlow uses YouTube API Services. By connecting YouTube you agree to the{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>, and Google's processing is governed by the{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
          You can revoke CreatorFlow's access at any time from your{" "}
          <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google Account third-party connections page</a>{" "}
          or by clicking Disconnect in CreatorFlow.
        </p>
      </Section>

      <Section title="4. Meta (Instagram, Facebook) and LinkedIn data">
        <p>
          When you connect Instagram or Facebook, we access the Facebook Pages and Instagram professional accounts you choose, only to publish the posts you ask us to publish.
          When you connect LinkedIn, we access your basic profile (name, picture) and permission to post on your behalf.
          We don't read your messages, followers or other people's content.
        </p>
      </Section>

      <Section title="5. Who we share data with">
        <p>We share data only with providers that help us run CreatorFlow, and only what each needs:</p>
        <ul>
          <li><b>Supabase</b> — database, authentication and file storage.</li>
          <li><b>Vercel</b> — application hosting.</li>
          <li><b>AI model providers</b> (fal.ai, which runs models such as FLUX, Seedance and ElevenLabs voices, and OpenRouter for text models) — receive the prompts and media needed to generate your content.</li>
          <li><b>Razorpay</b> — payment processing.</li>
          <li><b>YouTube, Instagram, Facebook, LinkedIn</b> — receive the content you choose to publish to them.</li>
        </ul>
        <p>We may disclose information if required by law or to protect the rights and safety of our users.</p>
      </Section>

      <Section title="6. Security and storage">
        <p>
          Data is transmitted over HTTPS. Social account tokens and app secrets are encrypted at rest with AES-256-GCM, and access to user data is restricted by per-user database security rules.
          No method of storage is perfectly secure, but we take reasonable measures to protect your data.
        </p>
      </Section>

      <Section id="data-deletion" title="7. Retention and deletion">
        <ul>
          <li><b>Disconnect a social account</b> in Connections at any time: its tokens are deleted from our database immediately.</li>
          <li><b>Delete projects and outputs</b> yourself in the app; they are removed from our storage.</li>
          <li><b>Delete your account and all data:</b> email {mail} from your account email with the subject “Delete my account”. We delete your account, content and connected-account tokens within 30 days, except records we must keep by law (such as invoices).</li>
        </ul>
        <p>Content you already published to YouTube, Instagram, Facebook or LinkedIn stays on those platforms; delete it there if you no longer want it public.</p>
      </Section>

      <Section title="8. Your rights">
        <p>You can ask to access, correct, export or delete your personal data, or withdraw consent for a connected account, by writing to {mail}. We respond within 30 days.</p>
      </Section>

      <Section title="9. Children">
        <p>CreatorFlow is not intended for anyone under 18, and we do not knowingly collect data from children.</p>
      </Section>

      <Section title="10. Changes and contact">
        <p>
          We will post any changes here and update the date above; significant changes will be notified by email or in the app.
          Questions? Contact us at {mail} or through our <Link to="/contact">contact page</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
