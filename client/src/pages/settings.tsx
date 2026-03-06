import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings as SettingsIcon,
  Shield,
  Globe,
  Building2,
  Clock,
} from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-settings">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform configuration and compliance settings
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Organization</span>
              <span className="text-xs font-medium">Enterprise Corp</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Plan</span>
              <Badge variant="secondary" className="text-[10px]">Enterprise</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Users</span>
              <span className="text-xs font-medium">12 active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Compliance Frameworks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs">EU AI Act</span>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">Active</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs">NIST AI RMF</span>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">Active</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs">ISO/IEC 42001</span>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">Active</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Geographic Scope
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Primary Region</span>
              <span className="text-xs font-medium">European Union</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Secondary Regions</span>
              <span className="text-xs font-medium">US, UK</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">Data Residency</span>
              <span className="text-xs font-medium">EU (Frankfurt)</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Key Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <span className="text-xs font-medium block">EU AI Act - Prohibited AI</span>
                <span className="text-[10px] text-muted-foreground">Chapters I-II enforcement</span>
              </div>
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-active-elevate">In Effect</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <div>
                <span className="text-xs font-medium block">EU AI Act - High Risk</span>
                <span className="text-[10px] text-muted-foreground">Full obligations apply</span>
              </div>
              <Badge className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 no-default-active-elevate">Aug 2026</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-1">
              <div>
                <span className="text-xs font-medium block">ISO/IEC 42001 Certification</span>
                <span className="text-[10px] text-muted-foreground">Target certification date</span>
              </div>
              <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 no-default-active-elevate">Q4 2026</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
