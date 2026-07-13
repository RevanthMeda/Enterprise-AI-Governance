export function normalizeCredentialOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

export function assertCredentialOriginPreserved(params: {
  label: string;
  currentUrl: string | null | undefined;
  nextUrl: string | null | undefined;
  hasCurrentCredential: boolean;
  replacementCredential?: string | null;
  clearCredential?: boolean;
}): void {
  if (!params.hasCurrentCredential || params.clearCredential || params.replacementCredential?.trim()) {
    return;
  }
  const currentOrigin = normalizeCredentialOrigin(params.currentUrl);
  const nextOrigin = normalizeCredentialOrigin(params.nextUrl);
  if (currentOrigin !== nextOrigin) {
    throw Object.assign(
      new Error(`${params.label} credential must be re-entered or cleared when its destination origin changes`),
      { status: 400 },
    );
  }
}
