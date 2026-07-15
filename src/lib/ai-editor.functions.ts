import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const editTextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    text: string;
    instruction: string;
    targetType?: string;
    projectId?: string | null;
    targetRef?: string | null;
  }) => {
    if (!i.text?.trim()) throw new Error("text required");
    if (!i.instruction?.trim()) throw new Error("instruction required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { gatewayChatText } = await import("@/lib/ai-gateway.server");
    const after = await gatewayChatText({
      messages: [
        { role: "system", content: "You rewrite text following the user's instruction. Return ONLY the rewritten text with no preface, quotes or commentary." },
        { role: "user", content: `Instruction: ${data.instruction}\n\nOriginal text:\n${data.text}` },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    });

    if (data.projectId) {
      await context.supabase.from("ai_edits" as never).insert({
        user_id: context.userId,
        project_id: data.projectId,
        target: data.targetType ?? "text",
        target_ref: data.targetRef ?? null,
        instruction: data.instruction,
        before_text: data.text,
        after_text: after,
      } as never);
    }
    return { after };
  });
