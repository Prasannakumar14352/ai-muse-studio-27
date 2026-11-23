/** What the shared MediaPicker returns, whichever tab (library / free stock) it came from. */
export type PickedMedia = {
  /** A fetchable URL for our own stored copy (signed Storage URL). */
  url: string;
  kind: "image" | "video";
  mimeType: string;
  title: string;
};

/** Fetch a picked item as a Blob (our own Storage copy, so CORS is fine). */
export async function fetchPickedBlob(item: PickedMedia): Promise<Blob> {
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`Couldn't load the file (${res.status})`);
  const blob = await res.blob();
  return blob.type ? blob : new Blob([blob], { type: item.mimeType });
}
