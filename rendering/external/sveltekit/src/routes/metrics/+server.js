export function GET() {
  const usage = process.resourceUsage();
  return Response.json({ cpuTimeMicros: usage.userCPUTime + usage.systemCPUTime, peakRssBytes: usage.maxRSS * 1024 }, { headers: { 'cache-control': 'no-store' } });
}
