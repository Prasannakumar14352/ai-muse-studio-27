import { describe, expect, it } from "vitest";
import {
  publicShowcaseMetadata,
  selectShowcaseItems,
  showcaseTemplate,
  validateShowcasePublication,
} from "../showcase-template";
import { showcaseStarterDrafts } from "../showcase-starters";

describe("showcase public data and template policy", () => {
  it("projects only supported metadata and strips nested credentials and private references", () => {
    const metadata = publicShowcaseMetadata({
      rights: true,
      reviewed: true,
      storage_path: "private/path",
      categories: ["Telugu Stories"],
      template: {
        version: 1,
        topic: "Village Story",
        apiKey: "sensitive",
        imageUrl: "https://private.example",
      },
    });
    expect(metadata?.template?.topic).toBe("Village Story");
    expect(metadata).not.toHaveProperty("rights");
    expect(JSON.stringify(metadata)).not.toMatch(/private|sensitive|imageUrl/);
  });

  it("rejects unknown schema versions and arbitrary models", () => {
    expect(showcaseTemplate.safeParse({ version: 2, topic: "Example" }).success).toBe(false);
    expect(
      showcaseTemplate.safeParse({ version: 1, topic: "Example", motionModel: "fal/undocumented" })
        .success,
    ).toBe(false);
    expect(showcaseTemplate.parse({ version: 1, topic: "Example" }).motionMode).toBe("off");
  });

  it("requires a private source, poster, dimensions, reviewed playback and rights", () => {
    const row = {
      title: "Example",
      prompt: "An approved example",
      showcase_video_path: "private/video",
      showcase_poster_path: "private/poster",
      showcase_metadata: {
        categories: [],
        language: "English",
        description: "",
        attribution: "",
        featured: false,
        provenance: "external" as const,
        promptKind: "example" as const,
        width: 720,
        height: 1280,
        durationSeconds: 30,
        rights: true,
        reviewed: true,
      },
    };
    expect(validateShowcasePublication(row)).toBe(true);
    expect(validateShowcasePublication({ ...row, showcase_poster_path: null })).toBe(false);
    expect(
      validateShowcasePublication({
        ...row,
        showcase_metadata: { ...row.showcase_metadata, rights: false },
      }),
    ).toBe(false);
    expect(
      validateShowcasePublication({
        ...row,
        showcase_metadata: { ...row.showcase_metadata, reviewed: false },
      }),
    ).toBe(false);
  });

  it("combines search, multiple tags and language while ordering featured first", () => {
    const items = showcaseStarterDrafts.slice(0, 2).map((draft, display_order) => ({
      ...draft,
      display_order,
      showcase_metadata: { ...draft.showcase_metadata, featured: display_order === 1 },
    }));
    expect(selectShowcaseItems(items, "", "", "")[0].title).toContain("Village Hero");
    expect(selectShowcaseItems(items, "Telugu Stories", "Telugu", "monsoon")).toHaveLength(1);
    expect(selectShowcaseItems(items, "Indian Mythology", "Telugu", "")).toEqual([]);
  });

  it("ships eight draft recipes with no media references", () => {
    expect(showcaseStarterDrafts).toHaveLength(8);
    expect(
      showcaseStarterDrafts.every(
        (item) =>
          item.showcase_metadata.template?.version === 1 &&
          !item.showcase_metadata.reviewed &&
          !item.showcase_metadata.rights,
      ),
    ).toBe(true);
  });
});
