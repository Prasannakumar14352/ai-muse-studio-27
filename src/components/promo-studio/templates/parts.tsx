// Shared building blocks for Promo Studio templates. Everything is laid out in exact pixels
// (1080-wide canvas) so the PNG export matches SIZE_PX exactly.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SIZE_PX, type PromoSize } from "@/lib/promo-studio/constants";

export type Brand = {
  colors: { primary: string; secondary: string; accent: string; text: string };
  appUrl: string;
  logoUrl: string | null;
};

export const FONT_STACK = '"Noto Sans", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif';

export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function PromoCanvas(props: {
  size: PromoSize;
  brand: Brand;
  backgroundUrl?: string | null;
  festive?: boolean;
  children: ReactNode;
}) {
  const { width, height } = SIZE_PX[props.size];
  const c = props.brand.colors;
  const bg = props.backgroundUrl
    ? `url("${props.backgroundUrl}") center/cover no-repeat`
    : props.festive
      ? `radial-gradient(circle at 20% 15%, ${c.accent}55 0, transparent 35%), radial-gradient(circle at 85% 80%, ${c.secondary}66 0, transparent 40%), linear-gradient(160deg, ${c.primary}, ${c.secondary})`
      : `linear-gradient(160deg, ${c.primary} 0%, ${c.secondary} 100%)`;
  return (
    <div
      data-render-root
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        background: bg,
        color: c.text,
        fontFamily: FONT_STACK,
        boxSizing: "border-box",
        padding: 72,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {props.children}
    </div>
  );
}

/** Shrinks text from `max` down to 70% until it fits its box; reports overflow if it still doesn't. */
export function FitText(props: {
  text: string;
  max: number;
  height: number;
  weight?: number;
  align?: CSSProperties["textAlign"];
  onOverflow?: (overflow: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(props.max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lo = Math.floor(props.max * 0.7);
    let hi = props.max;
    let best = lo;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = `${mid}px`;
      if (el.scrollHeight <= props.height + 1) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    el.style.fontSize = `${best}px`;
    setSize(best);
    props.onOverflow?.(el.scrollHeight > props.height + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.text, props.max, props.height]);
  return (
    <div
      ref={ref}
      style={{
        fontSize: size,
        lineHeight: 1.15,
        fontWeight: props.weight ?? 900,
        height: props.height,
        overflow: "hidden",
        textAlign: props.align ?? "left",
        wordBreak: "break-word",
      }}
    >
      {props.text}
    </div>
  );
}

export function BrandLogo({ brand, align = "left" }: { brand: Brand; align?: "left" | "right" }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        height: 72,
      }}
    >
      {brand.logoUrl ? (
        <img
          src={brand.logoUrl}
          alt=""
          style={{ height: 72, maxWidth: 320, objectFit: "contain" }}
        />
      ) : (
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>CreatorFlow AI</div>
      )}
    </div>
  );
}

export function CtaButton({ text, brand }: { text: string; brand: Brand }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <div
        style={{
          background: brand.colors.accent,
          color: brand.colors.primary,
          fontSize: 44,
          fontWeight: 900,
          padding: "26px 52px",
          borderRadius: 999,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, opacity: 0.9 }}>{displayHost(brand.appUrl)}</div>
    </div>
  );
}

export function OfferChip({
  code,
  label,
  brand,
  big,
}: {
  code: string;
  label: string;
  brand: Brand;
  big?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignSelf: "flex-start",
        background: brand.colors.text,
        color: brand.colors.primary,
        borderRadius: 28,
        padding: big ? "28px 44px" : "18px 30px",
        border: `6px dashed ${brand.colors.accent}`,
      }}
    >
      <div style={{ fontSize: big ? 36 : 26, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: big ? 84 : 52, fontWeight: 900, letterSpacing: 2 }}>{code}</div>
    </div>
  );
}

/** Phone or browser mockup with the screenshot clipped inside. */
export function DeviceFrame(props: {
  src: string;
  kind?: "phone" | "browser";
  width: number;
  height: number;
}) {
  if (props.kind === "browser") {
    return (
      <div
        style={{
          width: props.width,
          height: props.height,
          background: "#111",
          borderRadius: 24,
          padding: 12,
          boxShadow: "0 30px 80px rgba(0,0,0,.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", gap: 10, padding: "6px 10px 14px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />
          ))}
        </div>
        <img
          src={props.src}
          alt=""
          style={{
            flex: 1,
            width: "100%",
            minHeight: 0,
            objectFit: "cover",
            objectPosition: "top",
            borderRadius: 12,
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        width: props.width,
        height: props.height,
        background: "#0b0b0f",
        borderRadius: 64,
        padding: 18,
        boxShadow: "0 30px 80px rgba(0,0,0,.45)",
        position: "relative",
      }}
    >
      <img
        src={props.src}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top",
          borderRadius: 48,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 30,
          left: "50%",
          transform: "translateX(-50%)",
          width: 140,
          height: 34,
          borderRadius: 17,
          background: "#0b0b0f",
        }}
      />
    </div>
  );
}
