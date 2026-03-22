import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallEvent(null);
    };

    if (window.matchMedia?.("(display-mode: standalone)")?.matches) {
      setIsInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!installEvent || isInstalled) {
    return null;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPrompting}
      onClick={async () => {
        if (!installEvent) {
          return;
        }
        setIsPrompting(true);
        await installEvent.prompt();
        const choice = await installEvent.userChoice.catch(() => null);
        if (choice?.outcome === "accepted") {
          setIsInstalled(true);
        }
        setInstallEvent(null);
        setIsPrompting(false);
      }}
      data-testid="button-install-pwa"
    >
      <Download className="mr-2 h-4 w-4" />
      {isPrompting ? "Installing..." : "Install app"}
    </Button>
  );
}
