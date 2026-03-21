import { AccountSecurityPanel } from "@/components/account-security-panel";

export default function AccountSecurityPage() {
  return (
    <div className="page-shell space-y-4" data-testid="page-account-security">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Account Security</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your password, MFA enrollment, and recovery posture.
        </p>
      </div>

      <AccountSecurityPanel />
    </div>
  );
}
