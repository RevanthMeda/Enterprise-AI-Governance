import { bootstrapApp, log } from "./app";

const nodeEnvKey = "NODE_ENV";

if (!process.env[nodeEnvKey]) {
  process.env[nodeEnvKey] = "production";
}

(async () => {
  const { httpServer } = await bootstrapApp({
    serveStaticClient: true,
    enableCronRoutes: false,
  });

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
