# Integration credentials at rest

Jira API tokens, connector authorization tokens, threat-feed tokens, and OIDC client secrets are stored as versioned AES-256-GCM envelopes. The envelope is authenticated against a purpose containing the credential type, organization, and connector identity, so ciphertext cannot be copied between tenants or credential fields.

`CONTROL_TOWER_VAULT_SECRET` is the encryption root. Keep it stable and available to every backend instance. Do not rotate or remove it until stored envelopes have been re-encrypted under a planned key-rotation procedure; losing the value makes existing credentials unrecoverable.

API responses never contain plaintext or ciphertext. They return only `hasCredential` or `hasOidcClientSecret`. Update behavior is:

- omitted, blank, or masked-placeholder credential: preserve the stored value;
- non-blank credential: encrypt and replace it;
- explicit `clearApiToken`, `clearAuthToken`, or `clearOidcClientSecret`: remove it.

Legacy plaintext values remain usable during rollout. A normal settings read, update, or server execution path attempts a compare-and-set lazy migration to the authenticated envelope without returning the value to the browser. Production startup already requires a dedicated `CONTROL_TOWER_VAULT_SECRET`, so migration is available as soon as the new code is deployed.
