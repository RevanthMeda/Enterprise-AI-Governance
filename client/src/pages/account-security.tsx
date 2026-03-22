import { AccountSecurityPanel } from "@/components/account-security-panel";
import { usePageCopy } from "@/lib/page-copy";

export default function AccountSecurityPage() {
  const pageCopy = usePageCopy();
  return (
    <div className="page-shell space-y-4" data-testid="page-account-security">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{pageCopy.accountSecurity.title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {pageCopy.accountSecurity.description}
        </p>
      </div>

      <AccountSecurityPanel />
    </div>
  );
}
