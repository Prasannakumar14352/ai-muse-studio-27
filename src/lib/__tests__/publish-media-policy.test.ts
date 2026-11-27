import { describe, expect, it } from "vitest";
import { ownedPublishObject } from "../publish-media-policy";

describe("publish media ownership", () => {
  const origin = "https://storage.example.test";
  const path = "/storage/v1/object/sign/renders/alice/publish/my-image.png";

  it("resolves an object under the authenticated user's prefix", () => {
    expect(ownedPublishObject(`${origin}${path}?token=fixture`, origin, "alice")).toBe(
      "alice/publish/my-image.png",
    );
  });

  it("rejects foreign origins, buckets, owners, and encoded traversal", () => {
    for (const url of [
      `https://untrusted.example.test${path}`,
      `${origin}${path.replace("renders", "approved-video-exports")}`,
      `${origin}${path.replace("alice", "bob")}`,
      `${origin}${path.replace("publish/", "publish%2F..%2F..%2F")}`,
      `${origin}${path.replace("publish/", "publish%5Cbob/")}`,
    ]) {
      expect(ownedPublishObject(url, origin, "alice")).toBeNull();
    }
  });
});
