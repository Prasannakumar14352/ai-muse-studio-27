/** Full-screen loading screen shown while the app and the sign-in session load. */
export function AppSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-background text-foreground"
    >
      <img src="/brand/creatorflow-mark.svg" alt="" width={56} height={56} className="animate-pulse" />
      <div className="text-sm text-muted-foreground">Loading CreatorFlow AI…</div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
