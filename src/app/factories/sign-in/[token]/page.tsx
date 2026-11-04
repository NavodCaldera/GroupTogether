import { PartnerForm } from "@/components/partner-form";
import { PageHeader, Card } from "@/components/ui";
import { approvalSignInAction } from "@/server/partner-actions";
export default async function ApprovalSignIn({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-sm">
      <PageHeader title="Factory sign in" />
      <Card>
        <PartnerForm action={approvalSignInAction} submit="Sign in">
          <input type="hidden" name="token" value={token} />
        </PartnerForm>
      </Card>
    </div>
  );
}
