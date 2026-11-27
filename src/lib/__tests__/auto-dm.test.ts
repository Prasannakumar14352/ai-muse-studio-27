import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  ruleMatches,
  parseWebhook,
  verifyMetaSignature,
  hasDmScopes,
  DM_SCOPES,
} from "../auto-dm.server";

const kw = (
  keywords: string[],
  extra: Partial<{ trigger: string; match_mode: string; media_id: string | null }> = {},
) => ({
  trigger: "comment_keyword",
  match_mode: "contains",
  media_id: null,
  keywords,
  ...extra,
});

describe("ruleMatches", () => {
  it("matches Latin keywords as whole words, case-insensitive", () => {
    expect(ruleMatches(kw(["guide"]), "Send me the GUIDE please")).toBe(true);
    expect(ruleMatches(kw(["guide"]), "guidebook")).toBe(false);
  });
  it("matches Telugu keywords as substrings", () => {
    expect(ruleMatches(kw(["గైడ్"]), "నాకు గైడ్ కావాలి")).toBe(true);
  });
  it("exact mode needs the whole comment", () => {
    expect(ruleMatches(kw(["link"], { match_mode: "exact" }), " Link ")).toBe(true);
    expect(ruleMatches(kw(["link"], { match_mode: "exact" }), "link pls")).toBe(false);
  });
  it("respects the target post", () => {
    expect(ruleMatches(kw(["guide"], { media_id: "m1" }), "guide", "m2")).toBe(false);
    expect(ruleMatches(kw(["guide"], { media_id: "m1" }), "guide", "m1")).toBe(true);
  });
  it("any_comment ignores keywords; empty keyword lists never match", () => {
    expect(ruleMatches(kw([], { trigger: "any_comment" }), "nice")).toBe(true);
    expect(ruleMatches(kw([]), "nice")).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("reads Instagram comments and skips the account's own comments", () => {
    const ev = parseWebhook({
      object: "instagram",
      entry: [
        {
          id: "IG1",
          changes: [
            {
              field: "comments",
              value: {
                id: "c1",
                text: "GUIDE",
                from: { id: "u1", username: "ravi" },
                media: { id: "m1" },
              },
            },
            {
              field: "comments",
              value: { id: "c2", text: "thanks", from: { id: "IG1" }, media: { id: "m1" } },
            },
          ],
        },
      ],
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "comment",
      platform: "instagram",
      accountId: "IG1",
      eventKey: "cmt:c1",
      fromId: "u1",
      mediaId: "m1",
    });
  });
  it("reads messages and ignores echoes", () => {
    const ev = parseWebhook({
      object: "page",
      entry: [
        {
          id: "P1",
          messaging: [
            {
              sender: { id: "u2" },
              recipient: { id: "P1" },
              timestamp: 1,
              message: { mid: "x", text: "price" },
            },
            {
              sender: { id: "P1" },
              recipient: { id: "u2" },
              timestamp: 2,
              message: { mid: "y", text: "hi", is_echo: true },
            },
          ],
        },
      ],
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "message",
      platform: "facebook",
      eventKey: "msg:x",
      text: "price",
    });
  });
  it("reads Facebook Page comments from the feed", () => {
    const ev = parseWebhook({
      object: "page",
      entry: [
        {
          id: "P1",
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "c9",
                post_id: "P1_5",
                message: "info",
                from: { id: "u3", name: "Asha" },
              },
            },
          ],
        },
      ],
    });
    expect(ev[0]).toMatchObject({
      kind: "comment",
      eventKey: "cmt:c9",
      mediaId: "P1_5",
      fromName: "Asha",
    });
  });
  it("ignores other objects", () => {
    expect(parseWebhook({ object: "user", entry: [] })).toEqual([]);
  });
});

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "page" });
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
  it("accepts a valid signature and rejects bad ones", () => {
    expect(verifyMetaSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, null, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "s3cret")).toBe(false);
  });
});

describe("hasDmScopes", () => {
  it("needs every messaging permission", () => {
    expect(hasDmScopes("instagram", DM_SCOPES.instagram)).toBe(true);
    expect(hasDmScopes("instagram", DM_SCOPES.instagram.slice(1))).toBe(false);
    expect(hasDmScopes("youtube", [])).toBe(false);
  });
});
