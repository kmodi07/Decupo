import Link from "next/link";
import { Wordmark } from "@/components/ui";

export const metadata = { title: "Terms" };

/** Short, honest terms for the foundation phase. Replace with reviewed terms before paid plans launch. */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Wordmark />
      <h1 className="mt-10 text-[34px] font-bold tracking-tight">Terms of service</h1>
      <p className="mt-2 text-[14px] text-mute">Last updated 21 November 2026. Decupo is in its foundation phase; these terms are deliberately short and will be reviewed before paid plans launch.</p>

      <div className="mt-8 space-y-6 text-[16px] leading-relaxed text-ink">
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">The service</h2>
          <p className="mt-2">Decupo turns a goal you describe into a mission run by software agents. Every mission shows its plan, estimated credits and what is not possible yet before you authorise it. Steps that act outside your workspace always wait for your approval.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Your account</h2>
          <p className="mt-2">You must be at least 18 and provide accurate details. You are responsible for what you ask the crew to do and for the content, products and messages you approve. Keep your sign-in method secure; with Google sign-in that means your Google account.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Credits</h2>
          <p className="mt-2">New accounts receive Explore credits at no charge. A mission reserves its estimate, each step settles what it actually used, and the remainder returns to your balance. Paid plans are not available yet; when they are, their terms will be stated before purchase.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Acceptable use</h2>
          <p className="mt-2">Do not use Decupo to send unsolicited messages in breach of applicable law, to impersonate others, to infringe rights, or to publish unlawful or harmful content. We may pause missions or accounts that do.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Your content and ours</h2>
          <p className="mt-2">You own the goals you give and the deliverables the crew produces for you. Decupo owns the service and its software. Deliverables may be offline drafts and must be reviewed before use; Decupo makes no promise that a generated site, message or plan is fit for a particular purpose.</p>
        </section>
        <section>
          <h2 className="text-[20px] font-semibold tracking-tight">Changes and contact</h2>
          <p className="mt-2">We may update these terms; material changes will be announced in the app. Questions go to the support address shown on the Google consent screen.</p>
        </section>
      </div>
      <p className="mt-10 text-[14px] text-mute">
        See also the <Link href="/privacy" className="font-semibold text-lavender-deep underline-offset-2 hover:underline">privacy notice</Link>.
      </p>
    </main>
  );
}
