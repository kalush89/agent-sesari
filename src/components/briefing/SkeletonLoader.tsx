/**
 * SkeletonLoader Component
 * 
 * Displays skeleton cards while briefing data is loading.
 * Matches the layout of actual insight cards for smooth transitions.
 */
export function SkeletonLoader() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="mb-4">
            <div className="h-8 w-64 bg-muted/20 rounded animate-pulse mb-2" />
            <div className="h-4 w-24 bg-muted/20 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-10 w-28 bg-muted/20 rounded animate-pulse" />
            <div className="h-10 w-40 bg-muted/20 rounded animate-pulse" />
            <div className="h-10 w-24 bg-muted/20 rounded animate-pulse" />
          </div>
        </div>
      </div>
      
      {/* Insight card skeletons */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {[1, 2, 3].map((index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Individual skeleton card matching InsightCard layout
 */
function SkeletonCard() {
  return (
    <article className="bg-card rounded-lg p-4 border border-border shadow-sm">
      {/* Narrative text skeleton */}
      <div className="space-y-2 mb-4">
        <div className="h-4 w-full bg-muted/20 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-muted/20 rounded animate-pulse" />
        <div className="h-4 w-4/6 bg-muted/20 rounded animate-pulse" />
      </div>
      
      {/* Thought Trace toggle skeleton */}
      <div className="h-5 w-16 bg-muted/20 rounded animate-pulse mb-4" />
      
      {/* Growth Play button skeleton */}
      <div className="h-10 w-36 bg-muted/20 rounded animate-pulse" />
    </article>
  );
}
