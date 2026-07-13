import assert from "node:assert/strict";
import test from "node:test";
import {
  SafeOutboundHttpError,
  SafeOutboundResponse,
  createSafeOutboundHttpClient,
  type OutboundTransport,
} from "../server/safe-outbound-http";
import {
  bedrockJsonRequest,
  providerJsonRequest,
  type GatewayOutboundFetch,
} from "../server/provider-egress";
import {
  upstreamProviderVaultService,
  type UpstreamProviderProtocol,
} from "../server/services/upstreamProviderVaultService";

const STORED_API_KEY = "stored-key-sentinel-must-never-leave";
const STORED_ACCESS_KEY_ID = "stored-access-sentinel";
const STORED_SECRET_ACCESS_KEY = "stored-secret-sentinel-must-never-leave";
const STORED_HEADER_SECRET = "stored-header-sentinel-must-never-leave";
const REQUEST_API_KEY = "caller-owned-request-key";
const REQUEST_ACCESS_KEY_ID = "caller-owned-access-key";
const REQUEST_SECRET_ACCESS_KEY = "caller-owned-secret-key";
const ATTACKER_BASE_URL = "https://attacker.example.net";
const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 } as const;

type ProviderCase = {
  name: string;
  provider: string;
  protocol: UpstreamProviderProtocol;
  storedBaseUrl: string;
  region?: string;
  compatible?: boolean;
};

const PROVIDERS: ProviderCase[] = [
  {
    name: "OpenAI chat and responses",
    provider: "openai",
    protocol: "openai",
    storedBaseUrl: "https://api.openai.com",
  },
  {
    name: "Anthropic",
    provider: "anthropic",
    protocol: "anthropic",
    storedBaseUrl: "https://api.anthropic.com",
  },
  {
    name: "Gemini and Google",
    provider: "gemini",
    protocol: "gemini",
    storedBaseUrl: "https://generativelanguage.googleapis.com",
  },
  {
    name: "Azure OpenAI",
    provider: "azureOpenAi",
    protocol: "azure_openai",
    storedBaseUrl: "https://tenant.openai.azure.com",
  },
  {
    name: "Vertex AI",
    provider: "vertexAi",
    protocol: "vertex_ai",
    storedBaseUrl: "https://us-central1-aiplatform.googleapis.com",
  },
  {
    name: "Bedrock",
    provider: "bedrock",
    protocol: "bedrock",
    storedBaseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    region: "us-east-1",
  },
  {
    name: "generic OpenAI-compatible provider",
    provider: "vendor-compatible",
    protocol: "openai",
    storedBaseUrl: "https://api.vendor.example.net",
    compatible: true,
  },
];

function providerPatch(providerCase: ProviderCase) {
  const patch =
    providerCase.protocol === "bedrock"
      ? {
          baseUrl: providerCase.storedBaseUrl,
          region: providerCase.region,
          accessKeyId: STORED_ACCESS_KEY_ID,
          secretAccessKey: STORED_SECRET_ACCESS_KEY,
          headers: { "x-stored-secret": STORED_HEADER_SECRET },
        }
      : {
          baseUrl: providerCase.storedBaseUrl,
          apiKey: STORED_API_KEY,
          headers: { "x-stored-secret": STORED_HEADER_SECRET },
        };

  return providerCase.compatible
    ? { compatibleProviders: { [providerCase.provider]: patch } }
    : { [providerCase.provider]: patch };
}

function buildVault(providerCase: ProviderCase) {
  return upstreamProviderVaultService.mergeForStorage({}, providerPatch(providerCase));
}

function requestCredentials(providerCase: ProviderCase) {
  return providerCase.protocol === "bedrock"
    ? {
        requestAccessKeyId: REQUEST_ACCESS_KEY_ID,
        requestSecretAccessKey: REQUEST_SECRET_ACCESS_KEY,
        requestRegion: providerCase.region,
      }
    : { requestApiKey: REQUEST_API_KEY };
}

function makeCaptureFetch(calls: Array<{ url: string; headers: Headers }>): GatewayOutboundFetch {
  return async (input, init) => {
    calls.push({
      url: input.toString(),
      headers: new Headers(init?.headers),
    });
    return new SafeOutboundResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"ok":true}'),
    });
  };
}

function assertSafeError(error: unknown, code: SafeOutboundHttpError["code"]): boolean {
  assert.ok(error instanceof SafeOutboundHttpError);
  assert.equal(error.code, code);
  return true;
}

async function* responseBody(value: string) {
  yield value;
}

test("request base URLs cannot inherit stored credentials for any gateway provider", async () => {
  const previousVaultSecret = process.env.CONTROL_TOWER_VAULT_SECRET;
  process.env.CONTROL_TOWER_VAULT_SECRET = "provider-egress-test-vault-secret";
  try {
    for (const providerCase of PROVIDERS) {
      const vault = buildVault(providerCase);
      let dispatches = 0;
      const captureFetch: GatewayOutboundFetch = async () => {
        dispatches += 1;
        throw new Error("dispatch must not run");
      };

      await assert.rejects(
        async () => {
          const config = upstreamProviderVaultService.resolveProviderConfig(vault, providerCase.provider, {
            protocol: providerCase.protocol,
            requestBaseUrl: ATTACKER_BASE_URL,
            requestRegion: providerCase.region,
          });
          if (providerCase.protocol === "bedrock") {
            await bedrockJsonRequest(config, "/model/test-model/converse", { messages: [] }, captureFetch);
          } else {
            await providerJsonRequest(config, "/v1/security-test", { input: "test" }, captureFetch);
          }
        },
        (error: unknown) => {
          assert.ok(error instanceof Error, providerCase.name);
          assert.match(error.message, /requires request-supplied credentials/i, providerCase.name);
          assert.doesNotMatch(error.message, /stored-key-sentinel|stored-secret-sentinel/i);
          return true;
        },
      );
      assert.equal(dispatches, 0, `${providerCase.name} dispatched before credential validation`);
    }
  } finally {
    if (previousVaultSecret === undefined) delete process.env.CONTROL_TOWER_VAULT_SECRET;
    else process.env.CONTROL_TOWER_VAULT_SECRET = previousVaultSecret;
  }
});

test("safe public custom URLs work only with caller-owned credentials and never receive stored headers", async () => {
  const previousVaultSecret = process.env.CONTROL_TOWER_VAULT_SECRET;
  process.env.CONTROL_TOWER_VAULT_SECRET = "provider-egress-test-vault-secret";
  try {
    for (const providerCase of PROVIDERS) {
      const config = upstreamProviderVaultService.resolveProviderConfig(
        buildVault(providerCase),
        providerCase.provider,
        {
          protocol: providerCase.protocol,
          requestBaseUrl: ATTACKER_BASE_URL,
          ...requestCredentials(providerCase),
        },
      );
      assert.equal(config.credentialSource, "request", providerCase.name);
      assert.equal(config.baseUrlSource, "request", providerCase.name);
      assert.equal(config.headers["x-stored-secret"], undefined, providerCase.name);

      const calls: Array<{ url: string; headers: Headers }> = [];
      const captureFetch = makeCaptureFetch(calls);
      if (providerCase.protocol === "bedrock") {
        await bedrockJsonRequest(config, "/model/test-model/converse", { messages: [] }, captureFetch);
      } else {
        await providerJsonRequest(config, "/v1/security-test", { input: "test" }, captureFetch);
      }

      assert.equal(calls.length, 1, providerCase.name);
      assert.equal(new URL(calls[0].url).origin, ATTACKER_BASE_URL, providerCase.name);
      const serializedHeaders = JSON.stringify(Object.fromEntries(calls[0].headers.entries()));
      assert.doesNotMatch(serializedHeaders, /stored-key-sentinel|stored-secret-sentinel|stored-header-sentinel/i);
      if (providerCase.protocol === "bedrock") {
        assert.match(calls[0].headers.get("authorization") ?? "", /caller-owned-access-key/);
      } else {
        assert.match(serializedHeaders, /caller-owned-request-key/);
      }
    }
  } finally {
    if (previousVaultSecret === undefined) delete process.env.CONTROL_TOWER_VAULT_SECRET;
    else process.env.CONTROL_TOWER_VAULT_SECRET = previousVaultSecret;
  }
});

test("vault credentials resolve only with their administrator-configured provider destinations", () => {
  const previousVaultSecret = process.env.CONTROL_TOWER_VAULT_SECRET;
  process.env.CONTROL_TOWER_VAULT_SECRET = "provider-egress-test-vault-secret";
  try {
    for (const providerCase of PROVIDERS) {
      const config = upstreamProviderVaultService.resolveProviderConfig(
        buildVault(providerCase),
        providerCase.provider,
        {
          protocol: providerCase.protocol,
          requestRegion: providerCase.region,
        },
      );
      assert.equal(config.credentialSource, "stored", providerCase.name);
      assert.equal(config.baseUrlSource, "stored", providerCase.name);
      assert.equal(config.baseUrl, providerCase.storedBaseUrl, providerCase.name);
      assert.equal(config.headers["x-stored-secret"], STORED_HEADER_SECRET, providerCase.name);
      if (providerCase.protocol === "bedrock") {
        assert.equal(config.accessKeyId, STORED_ACCESS_KEY_ID, providerCase.name);
        assert.equal(config.secretAccessKey, STORED_SECRET_ACCESS_KEY, providerCase.name);
      } else {
        assert.equal(config.apiKey, STORED_API_KEY, providerCase.name);
      }
    }
  } finally {
    if (previousVaultSecret === undefined) delete process.env.CONTROL_TOWER_VAULT_SECRET;
    else process.env.CONTROL_TOWER_VAULT_SECRET = previousVaultSecret;
  }
});

test("stored provider secrets are origin-bound and client views never expose custom header values", () => {
  const previousVaultSecret = process.env.CONTROL_TOWER_VAULT_SECRET;
  process.env.CONTROL_TOWER_VAULT_SECRET = "provider-egress-test-vault-secret";
  try {
    for (const providerCase of PROVIDERS) {
      const vault = buildVault(providerCase);
      const clientView = upstreamProviderVaultService.sanitizeForClient(vault);
      const serializedClientView = JSON.stringify(clientView);
      assert.doesNotMatch(
        serializedClientView,
        /stored-key-sentinel|stored-secret-sentinel|stored-header-sentinel|stored-access-sentinel/i,
        providerCase.name,
      );
      assert.match(serializedClientView, /x-stored-secret/i, providerCase.name);

      const movedVault = upstreamProviderVaultService.mergeForStorage(
        vault,
        providerCase.compatible
          ? { compatibleProviders: { [providerCase.provider]: { baseUrl: ATTACKER_BASE_URL } } }
          : { [providerCase.provider]: { baseUrl: ATTACKER_BASE_URL } },
      );
      assert.throws(
        () =>
          upstreamProviderVaultService.resolveProviderConfig(movedVault, providerCase.provider, {
            protocol: providerCase.protocol,
            requestRegion: providerCase.region,
          }),
        /bound to a different provider origin/i,
        providerCase.name,
      );
    }
  } finally {
    if (previousVaultSecret === undefined) delete process.env.CONTROL_TOWER_VAULT_SECRET;
    else process.env.CONTROL_TOWER_VAULT_SECRET = previousVaultSecret;
  }
});

test("environment credentials ignore tenant-stored destinations", () => {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "environment-key-sentinel";
  delete process.env.OPENAI_BASE_URL;
  try {
    const vault = upstreamProviderVaultService.mergeForStorage({}, {
      openai: { baseUrl: ATTACKER_BASE_URL },
    });
    const config = upstreamProviderVaultService.resolveProviderConfig(vault, "openai", {
      protocol: "openai",
    });
    assert.equal(config.credentialSource, "environment");
    assert.equal(config.baseUrlSource, "canonical");
    assert.equal(config.baseUrl, "https://api.openai.com");
  } finally {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
    if (previousOpenAiBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousOpenAiBaseUrl;
  }
});

test("request base URLs cannot inherit environment credentials", () => {
  const envKeys = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "VERTEX_AI_ACCESS_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ] as const;
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.OPENAI_API_KEY = STORED_API_KEY;
  process.env.ANTHROPIC_API_KEY = STORED_API_KEY;
  process.env.GEMINI_API_KEY = STORED_API_KEY;
  process.env.AZURE_OPENAI_API_KEY = STORED_API_KEY;
  process.env.VERTEX_AI_ACCESS_TOKEN = STORED_API_KEY;
  process.env.AWS_ACCESS_KEY_ID = STORED_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY = STORED_SECRET_ACCESS_KEY;

  try {
    for (const providerCase of PROVIDERS) {
      assert.throws(
        () =>
          upstreamProviderVaultService.resolveProviderConfig({}, providerCase.provider, {
            protocol: providerCase.protocol,
            requestBaseUrl: ATTACKER_BASE_URL,
            requestRegion: providerCase.region,
          }),
        /requires request-supplied credentials/i,
        providerCase.name,
      );
    }
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Bedrock request credentials are atomic and never mix with stored AWS secrets", () => {
  const previousVaultSecret = process.env.CONTROL_TOWER_VAULT_SECRET;
  process.env.CONTROL_TOWER_VAULT_SECRET = "provider-egress-test-vault-secret";
  try {
    const bedrock = PROVIDERS.find((entry) => entry.protocol === "bedrock")!;
    const vault = buildVault(bedrock);
    for (const partialCredentials of [
      { requestAccessKeyId: REQUEST_ACCESS_KEY_ID },
      { requestSecretAccessKey: REQUEST_SECRET_ACCESS_KEY },
      { requestSessionToken: "caller-owned-session-token" },
      {
        requestAccessKeyId: REQUEST_ACCESS_KEY_ID,
        requestSessionToken: "caller-owned-session-token",
      },
    ]) {
      assert.throws(
        () =>
          upstreamProviderVaultService.resolveProviderConfig(vault, bedrock.provider, {
            protocol: "bedrock",
            requestRegion: bedrock.region,
            ...partialCredentials,
          }),
        /must include both access key ID and secret access key/i,
      );
    }
  } finally {
    if (previousVaultSecret === undefined) delete process.env.CONTROL_TOWER_VAULT_SECRET;
    else process.env.CONTROL_TOWER_VAULT_SECRET = previousVaultSecret;
  }
});

test("private, metadata, cross-origin, and insecure provider targets fail before dispatch", async () => {
  let dispatches = 0;
  const captureFetch: GatewayOutboundFetch = async () => {
    dispatches += 1;
    throw new Error("dispatch must not run");
  };

  for (const baseUrl of [
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/computeMetadata/v1",
    "https://127.0.0.1/admin",
    "http://attacker.example.net",
  ]) {
    assert.throws(
      () =>
        upstreamProviderVaultService.resolveProviderConfig({}, "openai", {
          protocol: "openai",
          requestApiKey: REQUEST_API_KEY,
          requestBaseUrl: baseUrl,
        }),
      (error: unknown) => error instanceof SafeOutboundHttpError,
      baseUrl,
    );
  }

  const safeConfig = upstreamProviderVaultService.resolveProviderConfig({}, "openai", {
    protocol: "openai",
    requestApiKey: REQUEST_API_KEY,
    requestBaseUrl: ATTACKER_BASE_URL,
  });
  await assert.rejects(
    providerJsonRequest(
      safeConfig,
      "https://different-origin.example.net/v1/chat/completions",
      { messages: [] },
      captureFetch,
    ),
    /must remain on the configured origin/i,
  );
  assert.equal(dispatches, 0);
});

test("DNS-private destinations and redirects are stopped by the gateway-safe transport", async () => {
  const config = upstreamProviderVaultService.resolveProviderConfig({}, "openai", {
    protocol: "openai",
    requestApiKey: REQUEST_API_KEY,
    requestBaseUrl: ATTACKER_BASE_URL,
  });

  let privateTransportCalled = false;
  const privateClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [{ address: "10.20.30.40", family: 4 }],
    transport: async () => {
      privateTransportCalled = true;
      throw new Error("private transport must not run");
    },
  });
  await assert.rejects(
    providerJsonRequest(config, "/v1/chat/completions", { messages: [] }, privateClient),
    (error) => assertSafeError(error, "UNSAFE_ADDRESS"),
  );
  assert.equal(privateTransportCalled, false);

  let redirectCalls = 0;
  let redirectDestroyed = false;
  const redirectTransport: OutboundTransport = async () => {
    redirectCalls += 1;
    return {
      status: 302,
      headers: { location: "https://redirect-target.example.net/steal" },
      body: responseBody("redirecting"),
      destroy: () => {
        redirectDestroyed = true;
      },
    };
  };
  const redirectClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport: redirectTransport,
  });
  await assert.rejects(
    providerJsonRequest(config, "/v1/chat/completions", { messages: [] }, redirectClient),
    (error) => assertSafeError(error, "REDIRECT_NOT_ALLOWED"),
  );
  assert.equal(redirectCalls, 1, "the redirect target must never receive a second request");
  assert.equal(redirectDestroyed, true);
});
