import { createRoot } from "react-dom/client";
import App from "./App";
import { resolveApiUrl } from "./lib/api-url";
import { installGlobalErrorReporting, setLatestRequestId } from "./lib/monitoring";
import "./index.css";

function rewriteApiFetchInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input === "string") {
    return resolveApiUrl(input);
  }

  if (input instanceof URL) {
    return resolveApiUrl(input.toString());
  }

  if (input instanceof Request) {
    const rewritten = resolveApiUrl(input.url);
    if (rewritten !== input.url) {
      return new Request(rewritten, input);
    }
  }

  return input;
}

if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  installGlobalErrorReporting();

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rewrittenInput = rewriteApiFetchInput(input);
    const response = await originalFetch(rewrittenInput, init);
    setLatestRequestId(response.headers.get("x-request-id"));
    return response;
  }) as typeof window.fetch;

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js");
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
