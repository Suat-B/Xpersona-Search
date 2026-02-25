import { recomputeAllMetrics } from "@/lib/reliability/metrics";

async function main() {
  const result = await recomputeAllMetrics();
  console.log(
    `Reliability metrics recomputed. Agents processed: ${result.agentsProcessed}`
  );
}

main().catch((err) => {
  console.error("Failed to recompute reliability metrics.", err);
  process.exit(1);
});
