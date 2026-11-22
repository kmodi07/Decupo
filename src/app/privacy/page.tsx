import Link from "next/link";
import { Wordmark } from "@/components/ui";

export const metadata = { title: "Privacy" };

/**
 * Plain-language privacy notice. It states what Decupo actually does today;
 * update it when a new connector, provider or data flow lands.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Wordmark />
      <h1 className="mt-10 text-[34px] font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-[14px] text-mute">Last updated 21 November 2026. Decupo is a working name and this notice is a plain statement of current practice, not legal advice.</p>

      <div className="prose-decupo mt-8 space-y-6 text-[16px] leading-relaxed text-ink">
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">What we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your name and email address when you sign up, or the name and email Google gives us when you choose &ldquo;Continue with Google&rdquo;. With Google we request only the basic profile scopes (openid, email, profile) and we do not store Google&rsquo;s tokens.</li>
            <li>The goals, answers and files you give Cupi, and the plans, steps, events and deliverables the crew produces for your workspace.</li>
            <li>Credit ledger entries, approvals and an access log of what each connector did on your behalf.</li>
            <li>Session cookies needed to keep you signed in. We do not use advertising trackers.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">How we use it</h2>
          <p className="mt-2">To run the missions you authorise, show you their progress and deliverables, settle credits, and contact you about your account. Nothing leaves your workspace, and no message is sent or post published, without a connected account and your approval of each batch.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Where it lives</h2>
          <p className="mt-2">Decupo runs on Cloudflare Workers with a PostgreSQL database hosted by Neon in the United States. Connector tokens are encrypted at rest and are never shown to anyone, including us, in plain text.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Third parties</h2>
          <p className="mt-2">We share data only with the services you connect yourself (for example an email, WhatsApp, Instagram or lead-data account), and only for the actions you approve. We do not sell personal data and we do not train AI models on your content.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Your choices</h2>
          <p className="mt-2">You can download every deliverable, revoke any connected account from Connected apps, and ask us to delete your account and its data by emailing the support address shown on the Google consent screen. Deleting your account removes your workspace, missions, deliverables and connections.</p>
        </section>
      </div>
      <p className="mt-10 text-[14px] text-mute">
        See also the <Link href="/terms" className="font-semibold text-lavender-deep underline-offset-2 hover:underline">terms of service</Link>.
      </p>
    </main>
  );
}
