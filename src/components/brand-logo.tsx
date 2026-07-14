import { useState } from "react";

type Props = {
  className?: string;
  alt?: string;
};

/**
 * Renders the CreatorFlow AI logo from the repo-bundled asset in /public/brand.
 * Falls back to a local SVG mark if the primary PNG fails to load (e.g. static
 * asset misconfigured on the hosting provider). Guarantees the header always
 * shows a brand mark on Vercel, Lovable, or any other host.
 */
export function BrandLogo({ className, alt = "" }: Props) {
  const [src, setSrc] = useState("/brand/logo.png");
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (!src.endsWith(".svg")) setSrc("/brand/logo-fallback.svg");
      }}
      loading="eager"
      decoding="async"
    />
  );
}
