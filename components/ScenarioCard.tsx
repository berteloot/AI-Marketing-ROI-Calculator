"use client";

import { Scenario } from "@/types";

interface ScenarioCardProps {
  scenario: Scenario;
}

export default function ScenarioCard({ scenario }: ScenarioCardProps) {
  const { name, calculation } = scenario;
  const isPositive = calculation.monthlyNetBenefit > 0;

  const getColorClass = () => {
    switch (name) {
      case "Conservative":
        return "border-[#fa6715]/50 bg-[#fa6715]/10";
      case "Base":
        return "border-[#fa6715] bg-[#fa6715]/20";
      case "Aggressive":
        return "border-[#fa6715] bg-[#fa6715]/15";
      default:
        return "border-gray-700 bg-gray-900";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  };

  return (
    <div className={`border-2 rounded-lg p-6 ${getColorClass()}`}>
      <h3 className="text-xl font-bold mb-4 text-[#fa6715]">{name} Scenario</h3>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Monthly Net Benefit:</span>
          <span className={`text-lg font-bold ${isPositive ? "text-[#fa6715]" : "text-red-400"}`}>
            {formatCurrency(calculation.monthlyNetBenefit)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-300">ROI:</span>
          <span className={`text-lg font-bold ${calculation.roiPercentage >= 0 ? "text-[#fa6715]" : "text-red-400"}`}>
            {formatPercentage(calculation.roiPercentage)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-300">Payback Period:</span>
          <span className="text-lg font-semibold text-white">
            {calculation.paybackMonths === Infinity
              ? "N/A"
              : `${calculation.paybackMonths.toFixed(1)} months`}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-300">3-Month Pilot Savings:</span>
          <span className={`text-lg font-semibold ${calculation.pilot3MonthSavings >= 0 ? "text-[#fa6715]" : "text-red-400"}`}>
            {formatCurrency(calculation.pilot3MonthSavings)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-300">Risk-Adjusted Savings:</span>
          <span className={`text-lg font-semibold ${calculation.riskAdjustedSavings >= 0 ? "text-[#fa6715]" : "text-red-400"}`}>
            {formatCurrency(calculation.riskAdjustedSavings)}
          </span>
        </div>

        <div className="pt-3 border-t border-gray-700 mt-3">
          <div className="text-sm text-gray-400 space-y-1">
            <div>Current Cost: {formatCurrency(calculation.costCurrent)}</div>
            <div>Future Cost: {formatCurrency(calculation.costFuture)}</div>
            <div>AI Tech Cost: {formatCurrency(calculation.aiRecurringCostPerMonth)}/mo</div>
            {calculation.revenueLiftPerRun && (
              <div>Revenue Lift: {formatCurrency(calculation.revenueLiftPerRun)}/mo</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

