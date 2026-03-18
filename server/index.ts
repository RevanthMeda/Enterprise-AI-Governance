import { bootstrapApp, log } from "./app";

(async () => {
  const { app, httpServer } = await bootstrapApp({
    serveStaticClient: process.env.NODE_ENV === "production",
    enableCronRoutes: false,
  });

  if (process.env.NODE_ENV !== "production") {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  if (process.platform === "win32") {
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  } else {
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );
  }
})();
