import {
  WorkflowTask,
  RecommendedTool,
  RevenueModel,
  ROICalculation,
  Scenario,
} from "../types";

/**
 * Deterministic ROI Calculator
 * All calculations are strict math - no AI hallucinations
 */
export class ROICalculator {
  /**
   * Calculate effective efficiency percentage per task
   */
  static calculateEffectiveEfficiency(
    aiCoveragePct: number,
    efficiencyGainPct: number
  ): number {
    return (aiCoveragePct * efficiencyGainPct) / 100;
  }

  /**
   * Calculate hours saved per run for a task
   */
  static calculateHoursSavedPerRun(
    hoursPerRun: number,
    effectiveEfficiencyPct: number
  ): number {
    return hoursPerRun * (effectiveEfficiencyPct / 100);
  }

  /**
   * Calculate future hours per run after AI implementation
   */
  static calculateFutureHoursPerRun(
    hoursPerRun: number,
    hoursSavedPerRun: number
  ): number {
    return hoursPerRun - hoursSavedPerRun;
  }

  /**
   * Calculate total hours (current and future) across all tasks
   */
  static calculateTotalHours(tasks: WorkflowTask[]): {
    current: number;
    future: number;
  } {
    let totalCurrent = 0;
    let totalFuture = 0;

    tasks.forEach((task) => {
      const effectiveEfficiency = this.calculateEffectiveEfficiency(
        task.aiCoveragePct,
        task.efficiencyGainPct
      );
      const hoursSaved = this.calculateHoursSavedPerRun(
        task.hoursPerRun,
        effectiveEfficiency
      );
      const futureHours = this.calculateFutureHoursPerRun(
        task.hoursPerRun,
        hoursSaved
      );

      totalCurrent += task.hoursPerRun;
      totalFuture += futureHours;
    });

    return { current: totalCurrent, future: totalFuture };
  }

  /**
   * Calculate labor costs
   */
  static calculateLaborCosts(
    totalHoursCurrent: number,
    totalHoursFuture: number,
    averageHourlyCost: number
  ): { current: number; future: number; savings: number } {
    const costCurrent = totalHoursCurrent * averageHourlyCost;
    const costFuture = totalHoursFuture * averageHourlyCost;
    const savings = costCurrent - costFuture;

    return { current: costCurrent, future: costFuture, savings };
  }

  /**
   * Calculate AI tech costs
   */
  static calculateTechCosts(
    recommendedTools: RecommendedTool[],
    teamSize: number,
    trainingCostOneTime: number = 5000
  ): {
    recurringPerMonth: number;
    oneTime: number;
  } {
    const recurringPerMonth = recommendedTools.reduce((sum, tool) => {
      if (tool.billingModel === "per_account") {
        // Account-based pricing: use accountCostPerMonth (one cost regardless of team size)
        return sum + (tool.accountCostPerMonth || 0);
      } else {
        // Per-user pricing: multiply by team size
        return sum + (tool.licensePerUser || 0) * teamSize;
      }
    }, 0);

    return {
      recurringPerMonth,
      oneTime: trainingCostOneTime,
    };
  }

  /**
   * Calculate revenue impact (optional)
   */
  static calculateRevenueImpact(
    revenueModel?: RevenueModel,
    runsPerMonth: number = 10
  ): number | undefined {
    if (!revenueModel?.revenuePerAsset || !revenueModel?.expectedIncrementalConversionLiftPct) {
      return undefined;
    }

    const revenueLiftPerAsset =
      revenueModel.revenuePerAsset *
      (revenueModel.expectedIncrementalConversionLiftPct / 100);
    return revenueLiftPerAsset * runsPerMonth;
  }

  /**
   * Calculate complete ROI metrics
   */
  static calculateROI(
    tasks: WorkflowTask[],
    recommendedTools: RecommendedTool[],
    teamSize: number,
    averageHourlyCost: number,
    revenueModel?: RevenueModel,
    trainingCostOneTime: number = 5000,
    runsPerMonth: number = 10,
    scenarioMultiplier: number = 1.0
  ): ROICalculation {
    // Horizon and pilot assumptions
    const horizonMonths = 12;
    const pilotMonths = 3;
    const riskFactor = 0.7; // 70% confidence / risk adjustment

    // Apply scenario multiplier to efficiency gains (clamped 0–100)
    const adjustedTasks: WorkflowTask[] = tasks.map((task) => ({
      ...task,
      efficiencyGainPct: Math.min(
        100,
        Math.max(0, task.efficiencyGainPct * scenarioMultiplier)
      ),
    }));

    // Calculate total hours per run with adjusted efficiency
    const {
      current: totalHoursCurrentPerRun,
      future: totalHoursFuturePerRun,
    } = this.calculateTotalHours(adjustedTasks);

    // Convert to monthly hours (based on runsPerMonth)
    const safeRunsPerMonth = Math.max(runsPerMonth, 0);
    const totalHoursCurrent =
      totalHoursCurrentPerRun * safeRunsPerMonth;
    const totalHoursFuture =
      totalHoursFuturePerRun * safeRunsPerMonth;

    // Calculate labor costs per month
    const { current: costCurrent, future: costFuture, savings: rawSavings } =
      this.calculateLaborCosts(
        totalHoursCurrent,
        totalHoursFuture,
        averageHourlyCost
      );

    const rawLaborSavings = rawSavings;
    const monthlySavings = Math.max(rawLaborSavings, 0);

    // Calculate tech costs
    const {
      recurringPerMonth: aiRecurringCostPerMonth,
      oneTime: calculatedTrainingCost,
    } = this.calculateTechCosts(
      recommendedTools,
      teamSize,
      trainingCostOneTime
    );

    // Calculate revenue impact per month (if any)
    const revenueLiftPerMonth =
      this.calculateRevenueImpact(revenueModel, safeRunsPerMonth) || 0;

    // Gross and net benefit per month
    const grossBenefitPerMonth =
      monthlySavings + revenueLiftPerMonth;
    const monthlyNetBenefit =
      grossBenefitPerMonth - aiRecurringCostPerMonth;

    // Payback period (months)
    const paybackMonths =
      monthlyNetBenefit > 0
        ? calculatedTrainingCost / monthlyNetBenefit
        : Infinity;

    // ROI over a fixed horizon (12 months by default)
    const totalNetBenefitOverHorizon =
      monthlyNetBenefit * horizonMonths - calculatedTrainingCost;
    const totalInvestmentOverHorizon =
      calculatedTrainingCost + aiRecurringCostPerMonth * horizonMonths;

    const roiPercentage =
      totalInvestmentOverHorizon > 0
        ? ((totalNetBenefitOverHorizon / totalInvestmentOverHorizon) * 100)
        : 0;

    // Pilot metrics (e.g. 3‑month pilot)
    const pilotGrossBenefit =
      grossBenefitPerMonth * pilotMonths;
    const pilotAIRecurringCost =
      aiRecurringCostPerMonth * pilotMonths;
    const pilotTotalCost =
      calculatedTrainingCost + pilotAIRecurringCost;
    const pilotNetValue = pilotGrossBenefit - pilotTotalCost;

    // Risk‑adjusted pilot savings (e.g. 70% of predicted net benefit)
    const riskAdjustedSavings =
      pilotNetValue * riskFactor;

    // Note: revenueLiftPerRun field in ROICalculation has historically been used
    // as a monthly revenue lift value. We keep that convention here for compatibility.
    const revenueLiftPerRun = revenueLiftPerMonth;

    // Theoretical throughput multiplier: if we reinvest saved time,
    // how many more workflow cycles per month could we run at the same labor budget?
    const throughputMultiplier =
      totalHoursFuture > 0 ? totalHoursCurrent / totalHoursFuture : 1;

    // Additional monthly cost BEFORE considering revenue uplift:
    // AI recurring cost minus labor savings (floored at 0).
    const additionalMonthlyCost = Math.max(
      aiRecurringCostPerMonth - monthlySavings,
      0
    );

    // Monthly uplift is simply the revenue lift per month (if any).
    const monthlyUplift = revenueLiftPerMonth;

    // Classification logic:
    // - "AI Performance Investment" when we are spending more on a net monthly basis
    //   before uplift (additionalMonthlyCost > 0), but expected monthly uplift
    //   from AI is greater than that added cost.
    // - "Cost Savings Initiative" when labor savings clearly exceed AI recurring cost.
    // - "Neutral" otherwise.
    let classification: string | undefined = undefined;
    let showNetBenefitTooltip = false;

    if (additionalMonthlyCost > 0 && monthlyUplift > additionalMonthlyCost) {
      classification = "AI Performance Investment";
      showNetBenefitTooltip = true;
    } else if (monthlySavings > aiRecurringCostPerMonth) {
      classification = "Cost Savings Initiative";
    } else {
      classification = "Neutral";
    }

    return {
      totalHoursCurrent,
      totalHoursFuture,
      costCurrent,
      costFuture,
      monthlySavings,
      aiRecurringCostPerMonth,
      trainingCostOneTime: calculatedTrainingCost,
      revenueLiftPerRun,
      monthlyNetBenefit,
      roiPercentage,
      paybackMonths,
      pilot3MonthSavings: pilotNetValue,
      riskAdjustedSavings,

      // New fields for AI Performance Investment logic
      throughputMultiplier,
      additionalMonthlyCost,
      monthlyUplift,
      classification,
      showNetBenefitTooltip,
    };
  }

  /**
   * Generate scenarios (Base, Conservative, Aggressive)
   */
  static generateScenarios(
    tasks: WorkflowTask[],
    recommendedTools: RecommendedTool[],
    teamSize: number,
    averageHourlyCost: number,
    revenueModel?: RevenueModel,
    trainingCostOneTime: number = 5000,
    runsPerMonth: number = 10
  ): Scenario[] {
    const scenarios: Scenario[] = [
      {
        name: "Conservative",
        multiplier: 0.7, // 70% of efficiency gains
        calculation: this.calculateROI(
          tasks,
          recommendedTools,
          teamSize,
          averageHourlyCost,
          revenueModel,
          trainingCostOneTime,
          runsPerMonth,
          0.7
        ),
      },
      {
        name: "Base",
        multiplier: 1.0,
        calculation: this.calculateROI(
          tasks,
          recommendedTools,
          teamSize,
          averageHourlyCost,
          revenueModel,
          trainingCostOneTime,
          runsPerMonth,
          1.0
        ),
      },
      {
        name: "Aggressive",
        multiplier: 1.3, // 130% of efficiency gains
        calculation: this.calculateROI(
          tasks,
          recommendedTools,
          teamSize,
          averageHourlyCost,
          revenueModel,
          trainingCostOneTime,
          runsPerMonth,
          1.3
        ),
      },
    ];

    return scenarios;
  }
}
