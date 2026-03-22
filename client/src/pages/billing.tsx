import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Users, Rocket, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";

type Subscription = {
  id: string;
  tier: string;
  status: string;
  billingEmail: string | null;
  seatLimit: number;
  trialEndsAt: string | null;
  renewalAt: string | null;
  usageSummary: {
    activeMembers?: number;
    systems?: number;
    workflows?: number;
    incidents?: number;
  };
};

export default function BillingPage() {
  const pageCopy = usePageCopy();
  const subscriptionQuery = useQuery<Subscription>({ queryKey: ["/api/organization/subscription"] });
  const [form, setForm] = useState({
    tier: "pilot",
    status: "trialing",
    billingEmail: "",
    seatLimit: 25,
  });

  useEffect(() => {
    if (!subscriptionQuery.data) return;
    setForm({
      tier: subscriptionQuery.data.tier,
      status: subscriptionQuery.data.status,
      billingEmail: subscriptionQuery.data.billingEmail ?? "",
      seatLimit: subscriptionQuery.data.seatLimit,
    });
  }, [subscriptionQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/organization/subscription", {
        tier: form.tier,
        status: form.status,
        billingEmail: form.billingEmail || null,
        seatLimit: Number(form.seatLimit),
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/subscription"] });
    },
  });

  const usage = subscriptionQuery.data?.usageSummary ?? {};

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.billing.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.billing.description}
          </p>
        </div>
        <Badge variant="outline">{pageCopy.billing.badges?.readiness}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Plan tier" value={subscriptionQuery.data?.tier ?? "pilot"} icon={Rocket} />
        <Metric title="Status" value={subscriptionQuery.data?.status ?? "trialing"} icon={CreditCard} />
        <Metric title="Seat limit" value={String(subscriptionQuery.data?.seatLimit ?? 25)} icon={Users} />
        <Metric title="Active members" value={String(usage.activeMembers ?? 0)} icon={Building2} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Subscription controls</CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptionQuery.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <div className="space-y-3">
                <Field label="Plan tier">
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.tier} onChange={(event) => setForm((current) => ({ ...current, tier: event.target.value }))}>
                    <option value="pilot">Pilot</option>
                    <option value="growth">Growth</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    <option value="trialing">Trialing</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past due</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </Field>
                <Field label="Billing email">
                  <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} />
                </Field>
                <Field label="Seat limit">
                  <input type="number" min={1} className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.seatLimit} onChange={(event) => setForm((current) => ({ ...current, seatLimit: Number(event.target.value) }))} />
                </Field>
                <div className="flex justify-end">
                  <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save subscription"}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Usage and contract posture</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <UsageBox label="Active members" value={usage.activeMembers ?? 0} />
            <UsageBox label="Registered systems" value={usage.systems ?? 0} />
            <UsageBox label="Approval workflows" value={usage.workflows ?? 0} />
            <UsageBox label="AI incidents" value={usage.incidents ?? 0} />
            <UsageBox label="Trial ends" value={subscriptionQuery.data?.trialEndsAt ? new Date(subscriptionQuery.data.trialEndsAt).toLocaleDateString() : "Not set"} />
            <UsageBox label="Renewal" value={subscriptionQuery.data?.renewalAt ? new Date(subscriptionQuery.data.renewalAt).toLocaleDateString() : "Not set"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: string; icon: typeof CreditCard }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function UsageBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
