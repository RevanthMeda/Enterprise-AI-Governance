# Outbound HTTP security

User-configurable connector webhooks, threat-intelligence feeds, Jira endpoints, and inline model-provider gateways use the server's guarded outbound HTTP client. The same client is used for lead, invite, password-reset, governance-event, and monitoring webhooks configured through environment variables.

The guard applies these rules before a connection is opened:

- Production destinations must use HTTPS. HTTP remains available only outside production for public, non-sensitive destinations.
- URLs containing embedded usernames or passwords are rejected.
- Localhost, single-label/local network names, cloud metadata names, and non-HTTP protocols are rejected.
- Every resolved address must be globally routable. Loopback, private, carrier-grade NAT, link-local, multicast, documentation, benchmark, metadata, and other reserved IPv4/IPv6 ranges are rejected.
- The selected validated address is pinned into the connection so a second DNS lookup cannot redirect the request to a private address.
- Redirect responses are rejected and are never followed, preventing credentials from being forwarded to another destination.
- Each request has a bounded deadline and response-size limit. Callers may select a smaller limit but cannot disable either control or exceed the server maximum.
- Network, DNS, timeout, redirect, and size-limit failures are returned as stable, sanitized errors without destination URLs, credentials, IP addresses, or low-level socket details.

Production startup also validates configured delivery webhook and threat-feed environment variables for HTTPS and rejects URL credentials. DNS safety is checked again at delivery time so a hostname whose records change after startup cannot bypass the network rules.

Model-provider traffic has an additional credential boundary. Provider destinations always require HTTPS. A base URL supplied on an individual gateway request is accepted only when that same request supplies its own complete provider credential set. It cannot inherit an API key, AWS credential, session token, or custom header from the tenant vault or server environment. Vault and environment credentials are sent only to a canonical provider origin or a base URL configured by an administrator. Absolute upstream paths are also constrained to that configured origin.
