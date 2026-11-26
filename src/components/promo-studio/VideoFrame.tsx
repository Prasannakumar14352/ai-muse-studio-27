// One still frame of a promo video, drawn at full size (1080×1920 Shorts or 1920×1080 YouTube).
// The renderer adds camera motion and the voiceover on top. All text is drawn here, never by AI.
import { PROMO_VIDEO_FRAME, type PromoVideoFormat } from "@/lib/promo-studio/constants";
import {
  BrandLogo,
  CtaButton,
  DeviceFrame,
  FitText,
  FONT_STACK,
  OfferChip,
  type Brand,
} from "./templates/parts";

type Common = {
  format: PromoVideoFormat;
  brand: Brand;
  festive?: boolean;
  onOverflow?: (o: boolean) => void;
};

function Canvas({ format, brand, festive, children }: Common & { children: React.ReactNode }) {
  const { width, height } = PROMO_VIDEO_FRAME[format];
  const c = brand.colors;
  const bg = festive
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
        padding: format === "short" ? 80 : 72,
        display: "flex",
        flexDirection: format === "short" ? "column" : "row",
        gap: format === "short" ? 0 : 64,
      }}
    >
      {children}
    </div>
  );
}

function Subtitle({ text, format }: { text: string; format: PromoVideoFormat }) {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.55)",
        borderRadius: 24,
        padding: format === "short" ? "24px 32px" : "20px 28px",
        fontSize: format === "short" ? 44 : 38,
        fontWeight: 700,
        lineHeight: 1.3,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

export function SceneFrame(
  p: Common & {
    caption: string;
    subtitle: string;
    shot: string | null;
    index: number;
    total: number;
  },
) {
  const { width, height } = PROMO_VIDEO_FRAME[p.format];
  if (p.format === "short") {
    const innerH = height - 160;
    const deviceH = Math.round(innerH * 0.52);
    return (
      <Canvas {...p}>
        <BrandLogo brand={p.brand} />
        <div style={{ marginTop: 40 }}>
          <FitText
            text={p.caption}
            max={110}
            height={innerH * 0.17}
            align="center"
            onOverflow={p.onOverflow}
          />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {p.shot && (
            <DeviceFrame
              src={p.shot}
              kind="phone"
              width={Math.round(deviceH * 0.5)}
              height={deviceH}
            />
          )}
        </div>
        <Subtitle text={p.subtitle} format={p.format} />
      </Canvas>
    );
  }
  const innerW = width - 144;
  const innerH = height - 144;
  return (
    <Canvas {...p}>
      <div
        style={{
          width: innerW * 0.38,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <BrandLogo brand={p.brand} />
        <FitText text={p.caption} max={104} height={innerH * 0.45} onOverflow={p.onOverflow} />
        <Subtitle text={p.subtitle} format={p.format} />
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {p.shot && (
          <DeviceFrame
            src={p.shot}
            kind="browser"
            width={Math.round(innerW * 0.58)}
            height={Math.round(innerH * 0.86)}
          />
        )}
      </div>
    </Canvas>
  );
}

export function EndFrame(
  p: Common & { headline: string; cta: string; offer: { code: string; label: string } | null },
) {
  const { height } = PROMO_VIDEO_FRAME[p.format];
  const innerH = height - 160;
  return (
    <Canvas {...p} festive={p.festive || !!p.offer}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          textAlign: "center",
        }}
      >
        <BrandLogo brand={p.brand} align="left" />
        <div style={{ width: "100%" }}>
          <FitText
            text={p.headline}
            max={p.format === "short" ? 112 : 100}
            height={innerH * (p.format === "short" ? 0.22 : 0.3)}
            align="center"
            onOverflow={p.onOverflow}
          />
        </div>
        {p.offer && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <OfferChip code={p.offer.code} label={p.offer.label} brand={p.brand} big />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <CtaButton text={p.cta} brand={p.brand} />
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.9 }}>Sign up free · 50 credits</div>
      </div>
    </Canvas>
  );
}
