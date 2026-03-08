import { createRoot } from "react-dom/client";
import App from "./App";
import { resolveApiUrl } from "./lib/api-url";
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
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const rewrittenInput = rewriteApiFetchInput(input);
    return originalFetch(rewrittenInput, init);
  }) as typeof window.fetch;
}

createRoot(document.getElementById("root")!).render(<App />);
