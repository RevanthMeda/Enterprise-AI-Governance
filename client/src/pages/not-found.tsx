import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { usePageCopy } from "@/lib/page-copy";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const pageCopy = usePageCopy();
  const notFoundCopy = pageCopy.notFound;
  const badges = notFoundCopy.badges ?? {};

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-background px-6 py-10">
      <Card className="mx-4 w-full max-w-md border-border/60 bg-card">
        <CardContent className="pt-6">
          <div className="mb-4 flex gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">{notFoundCopy.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{notFoundCopy.description}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => setLocation("/dashboard")}>
              {badges.dashboard ?? "Go to dashboard"}
            </Button>
            <Button variant="outline" onClick={() => setLocation("/")}>
              {badges.home ?? "Back to home"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
