import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSpace } from "@remotion/google-fonts/SpaceGrotesk";

const inter = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const space = loadSpace("normal", { weights: ["500", "700"], subsets: ["latin"] });

// Palette — matches CreatorVault AI dark neon theme
const C = {
  bg: "#0a0a12",
  bg2: "#12121f",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.09)",
  text: "#f5f5fa",
  muted: "#8b8ba0",
  pink: "#ff2d87",
  purple: "#8b5cf6",
  cyan: "#22d3ee",
};

const gradientText: React.CSSProperties = {
  background: `linear-gradient(135deg, ${C.pink} 0%, ${C.purple} 60%, ${C.cyan} 100%)`,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

const AnimatedBg: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div
        style={{
          position: "absolute",
          inset: -200,
          background: `radial-gradient(circle at ${50 + Math.sin(t * 0.4) * 20}% ${40 + Math.cos(t * 0.3) * 15}%, rgba(139,92,246,0.35), transparent 55%), radial-gradient(circle at ${70 + Math.cos(t * 0.5) * 15}% ${70 + Math.sin(t * 0.4) * 15}%, rgba(255,45,135,0.28), transparent 50%), radial-gradient(circle at 20% 80%, rgba(34,211,238,0.18), transparent 55%)`,
          filter: "blur(20px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
    </AbsoluteFill>
  );
};

// ============ Scene 1: Brand intro (0-90) ============
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  const logoScale = interpolate(s, [0, 1], [0.7, 1]);
  const titleY = interpolate(spring({ frame: frame - 10, fps, config: { damping: 18 } }), [0, 1], [30, 0]);
  const titleOp = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [75, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ transform: `scale(${logoScale})`, marginBottom: 40 }}>
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 32,
            background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 78,
            fontFamily: space.fontFamily,
            fontWeight: 700,
            color: "white",
            boxShadow: `0 20px 80px ${C.pink}55, 0 0 0 1px rgba(255,255,255,0.1) inset`,
          }}
        >
          C
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleOp,
          fontFamily: space.fontFamily,
          fontWeight: 700,
          fontSize: 120,
          letterSpacing: -3,
          color: C.text,
        }}
      >
        Creator<span style={gradientText}>Vault</span> AI
      </div>
      <div
        style={{
          opacity: subOp,
          marginTop: 24,
          fontFamily: inter.fontFamily,
          fontSize: 30,
          color: C.muted,
          letterSpacing: 0.5,
        }}
      >
        One idea. A complete creator project.
      </div>
    </AbsoluteFill>
  );
};

// ============ Scene 2: Prompt input (90-270) ============
const PROMPT = "10 productivity hacks that changed my life as a creator";
const SceneInput: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 18 } });
  const panelY = interpolate(inS, [0, 1], [50, 0]);
  const panelOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const typedChars = Math.max(0, Math.min(PROMPT.length, Math.floor((frame - 25) / 1.6)));
  const typed = PROMPT.slice(0, typedChars);
  const caretOn = Math.floor(frame / 8) % 2 === 0;
  const chipsStart = 130;
  const btnPulse = 1 + Math.sin(Math.max(0, frame - 155) / 6) * 0.03;
  const btnPress = frame >= 165 && frame < 172 ? 0.94 : 1;

  const styles = ["Cinematic", "Anime", "3D", "Ghibli", "Cyberpunk"];
  const platforms = ["YouTube", "Instagram", "TikTok"];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity: panelOp,
          transform: `translateY(${panelY}px)`,
          width: 1200,
          padding: 48,
          borderRadius: 28,
          background: "rgba(18,18,31,0.7)",
          border: `1px solid ${C.border}`,
          backdropFilter: "blur(20px)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            fontFamily: inter.fontFamily,
            fontSize: 20,
            color: C.muted,
            marginBottom: 20,
            textTransform: "uppercase",
            letterSpacing: 3,
          }}
        >
          ✦ Step 1 · Describe your idea
        </div>
        <div
          style={{
            padding: "32px 36px",
            borderRadius: 18,
            background: "rgba(0,0,0,0.35)",
            border: `1px solid ${C.border}`,
            fontFamily: inter.fontFamily,
            fontSize: 38,
            color: C.text,
            minHeight: 110,
            lineHeight: 1.35,
          }}
        >
          {typed}
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 40,
              background: C.pink,
              marginLeft: 4,
              verticalAlign: "middle",
              opacity: caretOn ? 1 : 0,
            }}
          />
        </div>

        {/* Chip row — style selector */}
        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
          {styles.map((label, i) => {
            const chipS = spring({ frame: frame - (chipsStart + i * 4), fps, config: { damping: 15 } });
            const selected = i === 0;
            return (
              <div
                key={label}
                style={{
                  transform: `translateY(${interpolate(chipS, [0, 1], [12, 0])}px)`,
                  opacity: chipS,
                  padding: "12px 22px",
                  borderRadius: 999,
                  fontFamily: inter.fontFamily,
                  fontSize: 22,
                  color: selected ? "white" : C.muted,
                  background: selected
                    ? `linear-gradient(135deg, ${C.pink}, ${C.purple})`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected ? "transparent" : C.border}`,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {platforms.map((label, i) => {
            const chipS = spring({ frame: frame - (chipsStart + 25 + i * 4), fps, config: { damping: 15 } });
            return (
              <div
                key={label}
                style={{
                  transform: `translateY(${interpolate(chipS, [0, 1], [12, 0])}px)`,
                  opacity: chipS,
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontFamily: inter.fontFamily,
                  fontSize: 20,
                  color: C.muted,
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${C.border}`,
                }}
              >
                # {label}
              </div>
            );
          })}
        </div>

        {/* Generate button */}
        <div
          style={{
            marginTop: 40,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              transform: `scale(${btnPulse * btnPress})`,
              padding: "22px 44px",
              borderRadius: 16,
              background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`,
              color: "white",
              fontFamily: space.fontFamily,
              fontWeight: 700,
              fontSize: 28,
              boxShadow: `0 15px 50px ${C.pink}66`,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            ✨ Generate Project
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ============ Scene 3: Generating (270-420) ============
const PIPELINE = [
  { label: "Writing script & scenes", color: C.pink },
  { label: "Generating cinematic images", color: C.purple },
  { label: "Crafting captions & hashtags", color: C.cyan },
  { label: "Selecting voiceover & music", color: C.pink },
];

const SceneGenerating: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const ringRot = (frame / fps) * 180;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: headOp, textAlign: "center", marginBottom: 60 }}>
        <div
          style={{
            fontFamily: inter.fontFamily,
            fontSize: 22,
            color: C.muted,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          ✦ Step 2 · AI at work
        </div>
        <div
          style={{
            fontFamily: space.fontFamily,
            fontWeight: 700,
            fontSize: 76,
            color: C.text,
          }}
        >
          Building your <span style={gradientText}>project</span>
        </div>
      </div>

      {/* Spinning ring */}
      <div style={{ position: "relative", width: 180, height: 180, marginBottom: 60 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `4px solid ${C.border}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "4px solid transparent",
            borderTopColor: C.pink,
            borderRightColor: C.purple,
            transform: `rotate(${ringRot}deg)`,
            boxShadow: `0 0 40px ${C.pink}55`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 40,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.pink}22, ${C.purple}33)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 50,
          }}
        >
          ✨
        </div>
      </div>

      {/* Pipeline steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 780 }}>
        {PIPELINE.map((step, i) => {
          const startF = 30 + i * 25;
          const doneF = startF + 22;
          const appear = spring({ frame: frame - startF, fps, config: { damping: 18 } });
          const done = frame >= doneF;
          const barP = interpolate(frame, [startF, doneF], [0, 100], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={step.label}
              style={{
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [-20, 0])}px)`,
                padding: "18px 26px",
                background: "rgba(18,18,31,0.6)",
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: done ? step.color : "transparent",
                  border: `2px solid ${done ? step.color : C.border}`,
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                {done ? "✓" : ""}
              </div>
              <div
                style={{
                  fontFamily: inter.fontFamily,
                  fontSize: 26,
                  color: done ? C.text : C.muted,
                  flex: 1,
                }}
              >
                {step.label}
              </div>
              <div
                style={{
                  width: 180,
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${barP}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${step.color}, ${C.purple})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ============ Scene 4: Results grid (420-630) ============

const StylePreview: React.FC<{ label: string; delay: number; grad: string; icon: string }> = ({
  label,
  delay,
  grad,
  icon,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 15 } });
  const t = frame / fps;
  return (
    <div
      style={{
        opacity: s,
        transform: `scale(${interpolate(s, [0, 1], [0.85, 1])}) translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
        borderRadius: 20,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        position: "relative",
        aspectRatio: "1 / 1",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: grad,
        }}
      />
      {/* soft orbs to fake imagery */}
      <div
        style={{
          position: "absolute",
          width: 200,
          height: 200,
          borderRadius: "50%",
          top: `${20 + Math.sin(t + delay) * 8}%`,
          left: `${25 + Math.cos(t + delay) * 8}%`,
          background: "rgba(255,255,255,0.35)",
          filter: "blur(30px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 140,
          height: 140,
          borderRadius: "50%",
          bottom: "10%",
          right: "10%",
          background: "rgba(0,0,0,0.35)",
          filter: "blur(25px)",
        }}
      />
      <div style={{ position: "absolute", top: 16, left: 16, fontSize: 42 }}>{icon}</div>
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 16,
          fontFamily: inter.fontFamily,
          fontSize: 20,
          fontWeight: 600,
          color: "white",
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </div>
    </div>
  );
};

const Card: React.FC<{ delay: number; title: string; tag: string; children: React.ReactNode; span?: number }> = ({
  delay,
  title,
  tag,
  children,
  span = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px)`,
        padding: 24,
        borderRadius: 20,
        background: "rgba(18,18,31,0.75)",
        border: `1px solid ${C.border}`,
        backdropFilter: "blur(20px)",
      }}
    >
      <div
        style={{
          fontFamily: inter.fontFamily,
          fontSize: 14,
          color: C.pink,
          textTransform: "uppercase",
          letterSpacing: 2,
          marginBottom: 6,
        }}
      >
        {tag}
      </div>
      <div
        style={{
          fontFamily: space.fontFamily,
          fontSize: 26,
          fontWeight: 700,
          color: C.text,
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
};

const SceneResults: React.FC = () => {
  const frame = useCurrentFrame();
  const headOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const headY = interpolate(frame, [0, 25], [20, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ padding: "70px 100px", alignItems: "center" }}>
      <div style={{ opacity: headOp, transform: `translateY(${headY}px)`, textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            fontFamily: inter.fontFamily,
            fontSize: 20,
            color: C.muted,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          ✦ Step 3 · Your ready-to-ship project
        </div>
        <div
          style={{
            fontFamily: space.fontFamily,
            fontWeight: 700,
            fontSize: 68,
            color: C.text,
          }}
        >
          Everything, <span style={gradientText}>in seconds</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 22,
          width: "100%",
          maxWidth: 1680,
        }}
      >
        {/* Script */}
        <Card delay={20} title="Script & Scenes" tag="📝 Story" span={2}>
          <div style={{ fontFamily: inter.fontFamily, fontSize: 18, color: C.text, lineHeight: 1.6 }}>
            <div style={{ color: C.cyan, marginBottom: 6 }}>Scene 01 — Hook</div>
            <div style={{ color: C.muted, marginBottom: 12 }}>
              "I used to burn out every 2 weeks — until I found these 10 habits..."
            </div>
            <div style={{ color: C.cyan, marginBottom: 6 }}>Scene 02 — Value</div>
            <div style={{ color: C.muted, marginBottom: 12 }}>
              Split-screen: creator writing at 5am, then editing at sunset.
            </div>
            <div style={{ color: C.cyan, marginBottom: 6 }}>Scene 03 — CTA</div>
            <div style={{ color: C.muted }}>Close-up smile + text: "Save this for tomorrow."</div>
          </div>
        </Card>

        {/* Captions */}
        <Card delay={30} title="Captions" tag="✍️ Copy">
          <div style={{ fontFamily: inter.fontFamily, fontSize: 18, color: C.text, lineHeight: 1.55 }}>
            Ten habits that saved my creative career. Steal them — no gatekeeping.
            <div style={{ marginTop: 12, color: C.muted, fontSize: 16 }}>
              #creatorlife #productivity #contentcreator #focus #youtubetips
            </div>
          </div>
        </Card>

        {/* Image styles — 4 tiles */}
        <Card delay={40} title="AI Image Styles" tag="🎨 Visuals" span={2}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StylePreview
              label="Cinematic"
              delay={45}
              icon="🎬"
              grad="linear-gradient(135deg, #1a1a3a, #ff6b35 90%)"
            />
            <StylePreview
              label="Anime"
              delay={50}
              icon="🌸"
              grad="linear-gradient(135deg, #ff9ec7, #6bc5f8)"
            />
            <StylePreview
              label="Ghibli"
              delay={55}
              icon="🌿"
              grad="linear-gradient(135deg, #8ec5a1, #f4e3b2)"
            />
            <StylePreview
              label="Cyberpunk"
              delay={60}
              icon="⚡"
              grad="linear-gradient(135deg, #ff2d87, #22d3ee)"
            />
          </div>
        </Card>

        {/* Voice + music */}
        <Card delay={50} title="Voice & Music" tag="🎙 Audio">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 24 }}>🎙</div>
              <div style={{ fontFamily: inter.fontFamily, fontSize: 17, color: C.text, flex: 1 }}>
                Storyteller · Warm male
              </div>
              <WaveBars color={C.pink} />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 24 }}>🎵</div>
              <div style={{ fontFamily: inter.fontFamily, fontSize: 17, color: C.text, flex: 1 }}>
                Cinematic · Motivational
              </div>
              <WaveBars color={C.purple} />
            </div>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

const WaveBars: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 26 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const h = 6 + Math.abs(Math.sin((frame + i * 4) / 4)) * 20;
        return <div key={i} style={{ width: 3, height: h, background: color, borderRadius: 2 }} />;
      })}
    </div>
  );
};

// ============ Scene 5: Outro (630-720) ============
const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16 } });
  const scale = interpolate(s, [0, 1], [0.9, 1]);
  const titleOp = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });
  const ctaOp = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${scale})` }}>
      <div
        style={{
          opacity: titleOp,
          fontFamily: space.fontFamily,
          fontWeight: 700,
          fontSize: 130,
          textAlign: "center",
          lineHeight: 1.05,
          color: C.text,
        }}
      >
        Create <span style={gradientText}>viral content</span><br />
        faster than you can scroll.
      </div>
      <div
        style={{
          opacity: ctaOp,
          marginTop: 44,
          padding: "24px 56px",
          borderRadius: 20,
          background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`,
          color: "white",
          fontFamily: space.fontFamily,
          fontWeight: 700,
          fontSize: 34,
          boxShadow: `0 25px 80px ${C.pink}55`,
        }}
      >
        ✨ Start Creating Free
      </div>
      <div
        style={{
          opacity: ctaOp,
          marginTop: 22,
          fontFamily: inter.fontFamily,
          fontSize: 22,
          color: C.muted,
        }}
      >
        CreatorVault AI · 5 free generations every month
      </div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg, color: C.text }}>
      <AnimatedBg />
      <Sequence from={0} durationInFrames={90}>
        <SceneIntro />
      </Sequence>
      <Sequence from={90} durationInFrames={180}>
        <SceneInput />
      </Sequence>
      <Sequence from={270} durationInFrames={150}>
        <SceneGenerating />
      </Sequence>
      <Sequence from={420} durationInFrames={210}>
        <SceneResults />
      </Sequence>
      <Sequence from={630} durationInFrames={90}>
        <SceneOutro />
      </Sequence>
    </AbsoluteFill>
  );
};
