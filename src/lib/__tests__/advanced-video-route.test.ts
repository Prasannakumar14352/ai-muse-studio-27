import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: vi.fn<() => Promise<string | null>>() }));
vi.mock("@/lib/route-auth.server", () => ({
  getUserIdFromRequest: auth.user,
  unauthorized: () => new Response(null, { status: 401 }),
}));
vi.mock("@/lib/fal.server", () => {
  throw new Error("Gated requests must never load the provider");
});
vi.mock("@/lib/credits-guard.server", () => {
  throw new Error("Gated requests must never load the ledger");
});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (args: unknown) => args,
}));

import { Route } from "../../routes/api/generate-video-clip";

const post = (
  Route as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;

function request(model: string) {
  return new Request("https://local.example/api/generate-video-clip", {
    method: "POST",
    body: JSON.stringify({ model, image: "https://example.com/source.jpg", prompt: "Animate" }),
  });
}

afterEach(() => vi.unstubAllEnvs());

it("requires authentication before model selection", async () => {
  auth.user.mockResolvedValue(null);
  expect((await post({ request: request("veo-fast") })).status).toBe(401);
});

it("fails closed when the paid Veo flag is false", async () => {
  auth.user.mockResolvedValue("owner");
  vi.stubEnv("VIDEO_ADVANCED_MODELS_ENABLED", "false");
  const result = await post({ request: request("veo-fast") });
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ ok: false, reason: "advanced_video_disabled" });
});

it("rejects arbitrary endpoint IDs rather than forwarding them", async () => {
  auth.user.mockResolvedValue("owner");
  const result = await post({ request: request("fal-ai/arbitrary") });
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ ok: false, reason: "unknown_video_model" });
});
