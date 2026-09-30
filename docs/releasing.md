# Releasing AI CONTROL GRID

AI CONTROL GRID uses a maintainer-led release process.

## Versioning

The project follows semantic versioning in spirit:

- `0.x.y` — pre-stable development. Breaking changes are allowed when documented.
- `1.x.y` — stable public compatibility expectations after the project declares 1.0 readiness.

The root application workspace is private and is not intended to be published to npm. Publishable subpackages, such as the telemetry SDK, maintain their own package metadata.

## Release checklist

Before cutting a release:

1. Confirm all intended changes are merged to `main`.
2. Confirm required GitHub Actions checks are green.
3. Run or verify:
   - `npm run check`
   - `npm run build`
   - `npm run test:regression:all`
   - `npm run security:all` where the release environment supports dependency/SBOM steps
4. Review database and configuration migration requirements.
5. Review `CHANGELOG.md` and move relevant entries from **Unreleased** into the target version.
6. Confirm no secrets, local environment files, generated credentials, production exports, or customer data are present.
7. Confirm the exact release commit on `main`.
8. Create an annotated Git tag named `vX.Y.Z`.
9. Create the matching GitHub Release with:
   - user-visible changes;
   - security-relevant changes;
   - breaking changes;
   - deployment or migration notes;
   - known limitations.
10. Verify the release source archive points to the intended commit.

## First release

The first public pre-stable release is planned as `v0.1.0`.

Do not create the tag until the OSS foundation and selected release-blocking follow-up work are merged and the required repository-native regression/security checks are green.
