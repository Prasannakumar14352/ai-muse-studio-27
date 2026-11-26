// The three v1 templates (design §8): feature spotlight, offer/festival, before → after.
// Pure components of (creative, slide index, brand). There is never text inside an AI image:
// headline, logo, CTA, URL and the offer chip are all drawn here.
import { SIZE_PX } from "@/lib/promo-studio/constants";
import type { PromoCreativeView } from "@/lib/promo-studio.functions";
import {
  BrandLogo,
  CtaButton,
  DeviceFrame,
  FitText,
  OfferChip,
  PromoCanvas,
  type Brand,
} from "./parts";

const BEFORE_AFTER: Record<string, [string, string]> = {
  en: ["Before", "After"],
  te: ["ముందు", "తర్వాత"],
  hi: ["पहले", "बाद में"],
};

export function slideCount(c: Pick<PromoCreativeView, "format" | "slides">): number {
  return c.format === "carousel" ? c.slides.length + 2 : 1;
}

type SlideProps = {
  c: PromoCreativeView;
  index: number;
  brand: Brand;
  onOverflow?: (o: boolean) => void;
};

export function PromoSlide({ c, index, brand, onOverflow }: SlideProps) {
  const { width, height } = SIZE_PX[c.size];
  const innerW = width - 144;
  const innerH = height - 144;
  const tall = c.size === "9:16";
  const shot = (i: number) => (c.assetUrls.length ? c.assetUrls[i % c.assetUrls.length] : null);
  const festive = c.template === "offer_festival";
  const total = slideCount(c);
  const isCarousel = c.format === "carousel";
  const isLast = isCarousel && index === total - 1;
  const isCover = !isCarousel || index === 0;

  // Carousel closing slide: CTA (+ offer when there is one).
  if (isLast) {
    return (
      <PromoCanvas size={c.size} brand={brand} backgroundUrl={c.backgroundUrl} festive={festive}>
        <BrandLogo brand={brand} />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 48,
          }}
        >
          <FitText text={c.headline} max={96} height={innerH * 0.35} onOverflow={onOverflow} />
          {c.offer && <OfferChip code={c.offer.code} label={c.offer.label} brand={brand} big />}
        </div>
        <CtaButton text={c.cta} brand={brand} />
      </PromoCanvas>
    );
  }

  // Carousel middle slides: one benefit each, with a screenshot.
  if (isCarousel && !isCover) {
    const s = c.slides[index - 1];
    const img = shot(index - 1);
    return (
      <PromoCanvas size={c.size} brand={brand} backgroundUrl={c.backgroundUrl} festive={festive}>
        <BrandLogo brand={brand} />
        <div style={{ marginTop: 36 }}>
          <FitText text={s.title} max={76} height={innerH * 0.16} onOverflow={onOverflow} />
          <div
            style={{ fontSize: 34, fontWeight: 700, opacity: 0.9, marginTop: 12, lineHeight: 1.3 }}
          >
            {s.body}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingTop: 28,
          }}
        >
          {img && (
            <DeviceFrame
              src={img}
              kind="phone"
              width={Math.round(innerH * 0.5 * 0.5)}
              height={Math.round(innerH * 0.5)}
            />
          )}
        </div>
        <div
          style={{ textAlign: "right", fontSize: 30, fontWeight: 700, opacity: 0.8, marginTop: 20 }}
        >
          {index + 1}/{total}
        </div>
      </PromoCanvas>
    );
  }

  const headlineText = isCarousel ? c.hook : c.headline;

  if (c.template === "before_after") {
    const [b, a] = BEFORE_AFTER[c.language] ?? BEFORE_AFTER.en;
    const panelH = Math.round(innerH * (tall ? 0.28 : 0.27));
    const label = (t: string) => (
      <div
        style={{
          fontSize: 34,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: 2,
          marginBottom: 12,
        }}
      >
        {t}
      </div>
    );
    return (
      <PromoCanvas size={c.size} brand={brand} backgroundUrl={c.backgroundUrl}>
        <BrandLogo brand={brand} />
        <div style={{ marginTop: 28 }}>
          <FitText text={headlineText} max={84} height={innerH * 0.17} onOverflow={onOverflow} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <div style={{ opacity: 0.85 }}>
            {label(b)}
            {c.beforeUrl && (
              <img
                src={c.beforeUrl}
                alt=""
                style={{
                  width: innerW,
                  height: panelH,
                  objectFit: "cover",
                  borderRadius: 20,
                  filter: "grayscale(0.7)",
                }}
              />
            )}
          </div>
          <div>
            {label(a)}
            {shot(0) && (
              <DeviceFrame src={shot(0)!} kind="browser" width={innerW} height={panelH + 40} />
            )}
          </div>
        </div>
        <CtaButton text={c.cta} brand={brand} />
      </PromoCanvas>
    );
  }

  if (c.template === "offer_festival") {
    const img = shot(0);
    return (
      <PromoCanvas size={c.size} brand={brand} backgroundUrl={c.backgroundUrl} festive>
        <BrandLogo brand={brand} align="right" />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 40,
          }}
        >
          <FitText text={headlineText} max={100} height={innerH * 0.26} onOverflow={onOverflow} />
          {c.offer && <OfferChip code={c.offer.code} label={c.offer.label} brand={brand} big />}
          {img && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <DeviceFrame
                src={img}
                kind="phone"
                width={Math.round(innerH * 0.32 * 0.5)}
                height={Math.round(innerH * 0.32)}
              />
            </div>
          )}
        </div>
        <CtaButton text={c.cta} brand={brand} />
      </PromoCanvas>
    );
  }

  // Feature spotlight (default).
  const img = shot(0);
  const deviceH = Math.round(innerH * (tall ? 0.55 : 0.5));
  return (
    <PromoCanvas size={c.size} brand={brand} backgroundUrl={c.backgroundUrl}>
      <BrandLogo brand={brand} />
      <div style={{ marginTop: 32 }}>
        <FitText text={headlineText} max={92} height={innerH * 0.2} onOverflow={onOverflow} />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
        }}
      >
        {img && (
          <DeviceFrame
            src={img}
            kind={c.size === "1:1" ? "browser" : "phone"}
            width={c.size === "1:1" ? innerW : Math.round(deviceH * 0.5)}
            height={c.size === "1:1" ? Math.round(innerH * 0.5) : deviceH}
          />
        )}{" "}
      </div>
      {c.offer && (
        <div style={{ marginBottom: 28 }}>
          <OfferChip code={c.offer.code} label={c.offer.label} brand={brand} />
        </div>
      )}
      <CtaButton text={c.cta} brand={brand} />
    </PromoCanvas>
  );
}
