export type DepartmentType =
  | "B2B SaaS / Software"
  | "B2B Services (Agency or Consulting)"
  | "B2B Product / Manufacturing"
  | "B2C / Commerce / Marketplace";

export type PrimaryWorkflow =
  | "LinkedIn content + campaigns"
  | "LinkedIn outreach + list building"
  | "Email nurture + sequences"
  | "Podcast → content multipliers"
  | "AI video creation"
  | "Video editing + repurposing"
  | "Demand gen reporting + attribution"
  | "Ad variant + creative testing"
  | "Sales enablement assets"
  | "Trade shows + conferences"
  | "Webinars + online events"
  | "Live events (LinkedIn Live, virtual sessions)";

export interface WorkflowTask {
  name: string;
  hoursPerRun: number;
  aiCoveragePct: number;
  efficiencyGainPct: number;
}

export interface RecommendedTool {
  name: string;
  billingModel: "per_user" | "per_account";
  licensePerUser?: number; // Required if billingModel is "per_user"
  accountCostPerMonth?: number; // Required if billingModel is "per_account"
}

export interface RevenueModel {
  revenuePerAsset?: number;
  expectedIncrementalConversionLiftPct?: number;
}

export interface AIBenchmarkResponse {
  tasks: WorkflowTask[];
  recommendedTools: RecommendedTool[];
  revenueModel?: RevenueModel;
  confidencePct: number;
}

export interface UserInputs {
  departmentType: DepartmentType;
  primaryWorkflow: PrimaryWorkflow;
  teamSize: number;
  averageHourlyCost: number;
  _honeypot?: string; // Hidden field for bot detection
}

export interface ROICalculation {
  totalHoursCurrent: number;
  totalHoursFuture: number;
  costCurrent: number;
  costFuture: number;
  monthlySavings: number;
  aiRecurringCostPerMonth: number;
  trainingCostOneTime: number;
  revenueLiftPerRun?: number;
  monthlyNetBenefit: number;
  roiPercentage: number;
  paybackMonths: number;
  pilot3MonthSavings: number;
  riskAdjustedSavings: number;

  /**
   * Theoretical throughput multiplier if freed capacity is reinvested
   * (how many more workflow cycles could be run at the same labor budget).
   */
  throughputMultiplier?: number;

  /**
   * Net additional monthly cost before considering revenue uplift:
   * AI recurring cost minus labor savings, floored at 0.
   */
  additionalMonthlyCost?: number;

  /**
   * Monthly revenue uplift attributable to AI (if revenueModel is provided).
   */
  monthlyUplift?: number;

  /**
   * Classification label for the initiative, e.g. "AI Performance Investment".
   */
  classification?: string;

  /**
   * Whether the UI should gray out the Net Benefit row and show a tooltip
   * that cost savings are not the primary driver.
   */
  showNetBenefitTooltip?: boolean;
}

export interface Scenario {
  name: "Base" | "Conservative" | "Aggressive";
  multiplier: number;
  calculation: ROICalculation;
}
