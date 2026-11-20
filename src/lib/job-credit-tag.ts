// Tags every credit charge made while a video job runs with that job's id, so
// a failed final render can refund exactly those charges (and nothing else).
let activeJobId: string | null = null;

export const JOB_TAG_HEADER = "x-cf-job";

export function setCreditJobTag(jobId: string | null) {
  activeJobId = jobId;
}
export function getCreditJobTag(): string | null {
  return activeJobId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Server side: the job id from the request header, if it's a valid UUID. */
export function jobTagFromRequest(request: Request): string | undefined {
  const v = request.headers.get(JOB_TAG_HEADER) ?? "";
  return UUID.test(v) ? v : undefined;
}
