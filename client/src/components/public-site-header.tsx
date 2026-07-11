import { ActurusPublicHeader } from "@/components/acturus-public-shell";

/**
 * Shared public-page navigation. The sticky variant keeps existing forms,
 * trust pages, legal pages, and authentication layouts in normal document flow.
 */
interface PublicSiteHeaderProps {
  renderSkipTarget?: boolean;
}

export function PublicSiteHeader({ renderSkipTarget = true }: PublicSiteHeaderProps) {
  return (
    <>
      <ActurusPublicHeader position="sticky" />
      {renderSkipTarget ? (
        <div id="public-main-content" tabIndex={-1} className="sr-only" />
      ) : null}
    </>
  );
}
