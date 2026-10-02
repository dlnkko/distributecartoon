export function generationCreditCost(project: { targetDurationSeconds?: number; song?: { durationSeconds?: number } | null }) {
  const seconds = project.song?.durationSeconds || project.targetDurationSeconds || 15;
  const cost = Math.round(Number(seconds));
  return Number.isFinite(cost) && cost > 0 ? cost : 15;
}
