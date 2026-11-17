import { useEffect, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { DownloadRegular } from "@mingcute/react/core-regular";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Shows an install button only once the browser offers a prompt, which is the
 * only way to install from inside the page. Handy on a demo table: one tap and
 * the dashboard lands on the home screen.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt) return null;

  return (
    <Tooltip label="Install as an app">
      <ActionIcon
        variant="default"
        aria-label="Install PinkEggs as an app"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        <DownloadRegular size={20} />
      </ActionIcon>
    </Tooltip>
  );
}
