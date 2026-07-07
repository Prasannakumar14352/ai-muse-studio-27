export type StructuredJsonParseResult = {
  value: unknown;
  repaired: boolean;
  note?: string;
};

export class InvalidStructuredJsonError extends Error {
  rawResponse: string;

  constructor(rawResponse: string, reason: string) {
    super(`${reason}\nRAW_AI_RESPONSE:\n${rawResponse}`);
    this.name = "InvalidStructuredJsonError";
    this.rawResponse = rawResponse;
  }
}

export function parseStructuredJsonResponse(raw: string): StructuredJsonParseResult {
  if (!raw.trim()) {
    console.error(raw);
    throw new InvalidStructuredJsonError(raw, "AI returned empty content");
  }

  const cleaned = cleanJsonCandidate(raw);
  try {
    return {
      value: JSON.parse(cleaned),
      repaired: cleaned !== raw.trim(),
      note: cleaned !== raw.trim() ? "Cleaned JSON wrapper before parsing" : undefined,
    };
  } catch (e) {
    console.error(raw);
    console.error(e);
  }

  const repaired = repairTruncatedJson(raw);
  if (repaired) {
    return { value: repaired, repaired: true, note: "Repaired truncated JSON response" };
  }

  throw new InvalidStructuredJsonError(raw, "AI response was not valid JSON");
}

function cleanJsonCandidate(raw: string): string {
  let cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (cleaned.startsWith("{") || cleaned.startsWith("[")) return cleaned;

  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const useArray = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart);
  const start = useArray ? arrayStart : objectStart;
  const end = useArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");

  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1).trim();
  return cleaned;
}

function repairTruncatedJson(raw: string): unknown | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const source = raw.slice(start);

  try {
    return JSON.parse(source);
  } catch {
    // continue with tolerant repair
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let lastGoodCut = -1;
  let lastGoodClose = "";

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") stack.pop();

    if ((char === "}" || char === "]") && stack.length > 0) {
      lastGoodCut = i;
      lastGoodClose = stack.slice().reverse().join("");
    }
  }

  const tryParse = (candidate: string): unknown | null => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  if (lastGoodCut > 0) {
    let end = lastGoodCut + 1;
    while (end < source.length && /\s/.test(source[end])) end++;

    const trimmed = source.slice(0, end).replace(/,\s*$/, "");
    const parsed = tryParse(trimmed + lastGoodClose);
    if (parsed) return parsed;

    return tryParse(trimmed + stack.slice().reverse().join(""));
  }

  return null;
}