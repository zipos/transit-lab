/* Challenge progress from model stats. Stars = how many objectives are met, mapped by challenge.stars. */

export function loadChallengeBook(regionId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`transit-lab:${regionId}:challenges`) || '');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_) {}
  return { active: null, stars: {} };
}

export function saveChallengeBook(regionId, book) {
  try {
    localStorage.setItem(`transit-lab:${regionId}:challenges`, JSON.stringify(book));
    return true;
  } catch (_) {
    return false;
  }
}

export function countPlayerLines(scenario) {
  return (scenario?.customRoutes || []).filter(route => route.source === 'player').length;
}

export function challengeAllowsMode(challenge, mode) {
  const modes = challenge?.constraints?.modes;
  if (!modes?.length) return true;
  return modes.includes(mode);
}

export function evaluateObjective(objective, ctx) {
  const { stats, baseline, budget, odMinutes } = ctx;
  if (!stats) return { ok: false, value: null };
  switch (objective.type) {
    case 'tripsDelta': {
      const delta = stats.passengers - (baseline?.passengers || 0);
      return { ok: delta >= objective.min, value: delta };
    }
    case 'boardingsDelta': {
      const delta = stats.boardings - (baseline?.boardings || 0);
      return { ok: delta >= objective.min, value: delta };
    }
    case 'modeShareDelta': {
      const delta = stats.share - (baseline?.share || 0);
      return { ok: delta >= objective.min, value: delta };
    }
    case 'coverage': {
      const delta = stats.accessResidents - (baseline?.accessResidents || 0);
      const target = objective.minDelta ?? objective.min ?? 0;
      return { ok: delta >= target, value: delta };
    }
    case 'municipalityTrips': {
      const trips = stats.cityStats?.[objective.municipality]?.passengers || 0;
      return { ok: trips >= objective.min, value: trips };
    }
    case 'maxLoad': {
      const worst = stats.flows?.top?.[0]?.vc ?? 0;
      const limit = objective.maxVc ?? 1;
      return { ok: !(worst > limit), value: worst };
    }
    case 'costPerRider': {
      if (!budget || budget.costPerNewRider == null) return { ok: false, value: null };
      return { ok: budget.costPerNewRider <= objective.max, value: budget.costPerNewRider };
    }
    case 'odTime': {
      if (odMinutes == null || !Number.isFinite(odMinutes)) return { ok: false, value: null };
      return { ok: odMinutes <= objective.maxMinutes, value: odMinutes };
    }
    default:
      return { ok: false, value: null };
  }
}

export function evaluateChallenge(challenge, ctx) {
  const results = (challenge.objectives || []).map(objective => ({
    objective,
    ...evaluateObjective(objective, ctx),
  }));
  const met = results.filter(item => item.ok).length;
  let stars = 0;
  const thresholds = challenge.stars || [];
  for (let index = 0; index < thresholds.length; index++) {
    if (met >= thresholds[index]) stars = index + 1;
  }
  const overBudget = ctx.budget && challenge.constraints?.budgetPLN != null
    && ctx.budget.capital > challenge.constraints.budgetPLN;
  return { results, met, stars, complete: stars > 0 && !overBudget, overBudget: !!overBudget };
}
