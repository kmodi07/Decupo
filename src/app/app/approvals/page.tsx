import { ApprovalsList } from "@/components/approvals-list";

export const metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-[30px] font-bold tracking-tight">Approvals</h1>
        <p className="mt-1 max-w-[60ch] text-[15px] text-mute">
          Publishing, deploying, spending, sending and deleting always stop here first. Approving lets exactly that one step continue.
        </p>
      </header>
      <ApprovalsList />
    </div>
  );
}
