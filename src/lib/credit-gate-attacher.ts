/**
 * Client-side function middleware: catches `insufficient_credits:{...}`
 * errors thrown by any server function's `chargeMiddleware` and opens the
 * global upgrade / top-up modal without losing the user's current work.
 *
 * Must be registered as a `functionMiddleware` in `src/start.ts`.
 */
import { createMiddleware } from "@tanstack/react-start";

const PREFIX = "insufficient_credits:";

export const surfaceCreditGate = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (typeof window !== "undefined" && message.startsWith(PREFIX)) {
      try {
        const payload = JSON.parse(message.slice(PREFIX.length)) as {
          required?: number;
          available?: number;
          shortage?: number;
          plan_type?: string;
        };
        const { fireCreditGate } = await import("@/components/global-credit-gate");
        fireCreditGate({
          required: payload.required,
          available: payload.available,
          shortage: payload.shortage,
          planType: payload.plan_type,
        });
      } catch {
        /* ignore parse failures */
      }
      // Replace the noisy raw message with a user-friendly one so any
      // toast surface shows the same wording as the modal.
      const nice = new Error("You don't have enough credits for this generation.");
      (nice as { code?: string }).code = "insufficient_credits";
      throw nice;
    }
    throw err;
  }
});
