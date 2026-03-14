import { mkdir, copyFile } from "fs/promises";

const SPEC_TARGETS = [
  {
    source: "docs/openapi.enterprise-identity.yaml",
    target: "client/public/openapi.enterprise-identity.yaml",
  },
  {
    source: "docs/openapi.enterprise-identity.yaml",
    target: "client/public/api-docs/identity.yaml",
  },
  {
    source: "docs/openapi.platform.yaml",
    target: "client/public/openapi.platform.yaml",
  },
  {
    source: "docs/openapi.platform.yaml",
    target: "client/public/api-docs/platform.yaml",
  },
];

async function main() {
  await mkdir("client/public", { recursive: true });
  await mkdir("client/public/api-docs", { recursive: true });

  for (const item of SPEC_TARGETS) {
    await copyFile(item.source, item.target);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
