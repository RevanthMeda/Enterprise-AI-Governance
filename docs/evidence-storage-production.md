# Production Evidence Storage

Evidence metadata is stored in PostgreSQL, but uploaded evidence file bytes are stored under `UPLOAD_ROOT`. A host's normal application filesystem is often replaced during a deploy, so it must not be treated as durable evidence storage.

## Render configuration

1. Attach a Render persistent disk to the backend service. Use a mount path such as `/var/data`.
2. Set `UPLOAD_ROOT=/var/data/uploads`.
3. After verifying that the mount is present and writable, set `EVIDENCE_STORAGE_DURABLE=true`.
4. Set `REQUIRE_DURABLE_EVIDENCE_STORAGE=true`.
5. Redeploy and verify that `/api/ready` returns:
   - `ready: true`
   - `checks.evidenceStorage.writable: true`
   - `checks.evidenceStorage.durable: true`
   - `checks.evidenceStorage.required: true`
6. Upload a test file, redeploy the backend, and download the same file again before treating the storage setup as production-ready.

Only files written below a Render disk's mount path survive redeploys. Mounting a disk does not make the rest of the service filesystem persistent.

## Safe rollout

`REQUIRE_DURABLE_EVIDENCE_STORAGE` defaults to `false`, so adding this release does not unexpectedly stop an existing deployment. Until durable storage is configured, readiness remains available but reports `EVIDENCE_STORAGE_NOT_DURABLE` in the evidence-storage check.

Once `REQUIRE_DURABLE_EVIDENCE_STORAGE=true`, an unwritable or unattested evidence store makes `/api/ready` return `503`. The production release workflow will then stop before publishing a newer frontend.

`EVIDENCE_STORAGE_DURABLE=true` is an operator attestation, not a mechanism that creates a persistent volume. Do not enable it for `/tmp`, Vercel local storage, or the normal Render application directory.

## Other hosts

Use an absolute `UPLOAD_ROOT` located on a persistent volume and follow the same two-phase rollout. Serverless local filesystems are not durable; use a persistent Node host/disk for this implementation or migrate the evidence service to object storage before production use.
