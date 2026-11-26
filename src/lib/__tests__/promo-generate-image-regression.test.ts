// Regression for the Promo Studio PR 1 refactor of /api/generate-image (design §2.2): the fal
// call moved to providers/fal-image.server.ts, and nothing else may change. The route must still
// require auth, charge before calling fal, refund on every failure, finalize on success, and
// ignore any injected "free" flags in the body (A4, A6).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getUserIdFromRequest = vi.fn<(r: Request) => Promise<string | null>>();
vi.mock("@/lib/route-auth.server", () => ({
  getUserIdFromRequest: (r: Request) => getUserIdFromRequest(r),
  unauthorized: () => new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 }),
}));

const reservation = { refund: vi.fn(async (_reason: string) => {}), finalize: vi.fn(async () => {}) };
const chargeCredits = vi.fn(async (_opts: Record<string, unknown>) => reservation);
vi.mock("@/lib/credits-guard.server", () => ({
  ACTION_COSTS: { image: 1, image_hd: 4 },
  chargeCredits: (opts: Record<string, unknown>) => chargeCredits(opts),
}));

import { Route } from "@/routes/api/generate-image";

type Handler = (a: { request: Request }) => Promise<Response>;
const POST = (Route.options as unknown as { server: { handlers: { POST: Handler } } }).server.handlers.POST;

const fetchMock = vi.fn<typeof fetch>();

function req(body: Record<string, unknown>, auth = true) {
  return new Request("http://localhost/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer a.b.c" } : {}) },
    body: JSON.stringify(body),
  });
}

const okFal = () =>
  new Response(JSON.stringify({ images: [{ url: "data:image/jpeg;base64,AAAA", content_type: "image/jpeg" }] }), {
    status: 200,
  });

beforeEach(() => {
  process.env.FAL_KEY = "test-fal-key";
  getUserIdFromRequest.mockReset().mockResolvedValue("user-1");
  chargeCredits.mockClear();
  reservation.refund.mockClear();
  reservation.finalize.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/generate-image after the callFal swap", () => {
  it("still charges 1 credit, calls fal once with the server key, finalizes, and returns the same shape", async () => {
    fetchMock.mockResolvedValueOnce(okFal());
    const res = await POST({ request: req({ prompt: "a red bicycle" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: "data:image/jpeg;base64,AAAA", model: "fal-ai/flux/schnell", credits: 1 });

    expect(chargeCredits).toHaveBeenCalledTimes(1);
    expect(chargeCredits.mock.calls[0][0]).toMatchObject({ userId: "user-1", action: "image", amount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fal.run/fal-ai/flux/schnell");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Key test-fal-key");
    expect(init).not.toHaveProperty("signal"); // no timeout added to the paid route
    expect(reservation.finalize).toHaveBeenCalledTimes(1);
    expect(reservation.refund).not.toHaveBeenCalled();
  });

  it("charges before calling the provider", async () => {
    const order: string[] = [];
    chargeCredits.mockImplementationOnce(async () => {
      order.push("charge");
      return reservation;
    });
    fetchMock.mockImplementationOnce(async () => {
      order.push("fal");
      return okFal();
    });
    await POST({ request: req({ prompt: "x" }) });
    expect(order).toEqual(["charge", "fal"]);
  });

  it("ignores injected admin / skipCredits / noCharge / promo / free body fields", async () => {
    fetchMock.mockResolvedValueOnce(okFal());
    await POST({ request: req({ prompt: "a red bicycle" }) });
    const baselineCharge = chargeCredits.mock.calls[0][0];
    const baselineFalBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    fetchMock.mockResolvedValueOnce(okFal());
    const res = await POST({
      request: req({
        prompt: "a red bicycle",
        admin: true,
        isAdmin: true,
        skipCredits: true,
        noCharge: true,
        promo: true,
        free: true,
        credits: 0,
        userId: "someone-else",
      }),
    });
    expect(res.status).toBe(200);
    expect(chargeCredits).toHaveBeenCalledTimes(2);
    const injectedCharge = chargeCredits.mock.calls[1][0];
    expect({ ...injectedCharge, idempotencyKey: undefined }).toEqual({ ...baselineCharge, idempotencyKey: undefined });
    expect(injectedCharge.userId).toBe("user-1");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(baselineFalBody);
    expect(reservation.finalize).toHaveBeenCalledTimes(2);
  });

  it("refunds when fal returns an error status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "upstream exploded" }), { status: 500 }));
    const res = await POST({ request: req({ prompt: "x" }) });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Credits refunded/);
    expect(reservation.refund).toHaveBeenCalledWith("provider_500");
    expect(reservation.finalize).not.toHaveBeenCalled();
  });

  it("refunds when fal is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const res = await POST({ request: req({ prompt: "x" }) });
    expect(res.status).toBe(502);
    expect(reservation.refund).toHaveBeenCalledWith("provider_unreachable");
    expect(reservation.finalize).not.toHaveBeenCalled();
  });

  it("refunds when fal returns no image", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ images: [] }), { status: 200 }));
    const res = await POST({ request: req({ prompt: "x" }) });
    expect(res.status).toBe(502);
    expect(reservation.refund).toHaveBeenCalledWith("no_image");
  });

  it("refunds a policy block after the Kontext retry also fails", async () => {
    const block = () =>
      new Response(JSON.stringify({ detail: [{ type: "content_policy_violation" }] }), { status: 422 });
    fetchMock.mockResolvedValueOnce(block()).mockResolvedValueOnce(block());
    const res = await POST({ request: req({ prompt: "remove the hat", image: "data:image/png;base64,AA" }) });
    expect(res.status).toBe(422);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://fal.run/fal-ai/nano-banana/edit",
      "https://fal.run/fal-ai/flux-pro/kontext",
    ]);
    expect(chargeCredits.mock.calls[0][0]).toMatchObject({ action: "image_hd", amount: 4 });
    expect(reservation.refund).toHaveBeenCalledWith("provider_422");
  });

  it("still rejects an unauthenticated caller before charging or calling fal", async () => {
    getUserIdFromRequest.mockResolvedValueOnce(null);
    const res = await POST({ request: req({ prompt: "x", admin: true }, false) });
    expect(res.status).toBe(401);
    expect(chargeCredits).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still refuses to charge when FAL_KEY is missing", async () => {
    delete process.env.FAL_KEY;
    const res = await POST({ request: req({ prompt: "x" }) });
    expect(res.status).toBe(500);
    expect(chargeCredits).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
