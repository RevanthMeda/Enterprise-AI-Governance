import path from "path";

export function resolveEvidenceStoragePath(
  uploadsRoot: string,
  organizationId: string,
  storedPath: string,
): string {
  const tenantRoot = path.resolve(uploadsRoot, organizationId);
  const candidate = path.resolve(uploadsRoot, storedPath);
  const relative = path.relative(tenantRoot, candidate);

  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Evidence storage path is invalid");
  }

  return candidate;
}
