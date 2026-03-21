import { bootstrapApp, log } from "./app";
import { isProductionEnvironment } from "./env";

(async () => {
  const { app, httpServer } = await bootstrapApp({
    serveStaticClient: isProductionEnvironment(),
    enableCronRoutes: false,
  });

  if (!isProductionEnvironment()) {
    const viteModulePath = "./vite";
    const { setupVite } = await import(viteModulePath);
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
