"use client";

import { useState } from "react";
import { UserInputs, Scenario, AIBenchmarkResponse } from "@/types";

interface BusinessCaseGeneratorProps {
  inputs: UserInputs;
  scenarios: Scenario[];
  benchmarks: AIBenchmarkResponse;
}

export default function BusinessCaseGenerator({
  inputs,
  scenarios,
  benchmarks,
}: BusinessCaseGeneratorProps) {
  const [generatedText, setGeneratedText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const baseScenario = scenarios.find((s) => s.name === "Base");
  if (!baseScenario) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const generateCFOSummary = () => {
    const calc = baseScenario.calculation;
    const totalCoverage = benchmarks.tasks.reduce(
      (sum, task) => sum + task.aiCoveragePct,
      0
    ) / benchmarks.tasks.length;

    return `Based on ${inputs.teamSize} marketers executing ${inputs.primaryWorkflow}, our current cost is ${formatCurrency(calc.costCurrent)} per month. With AI covering ${totalCoverage.toFixed(0)}% of tasks, we expect a reduction of ${(calc.totalHoursCurrent - calc.totalHoursFuture).toFixed(1)} hours and a net monthly benefit of ${formatCurrency(calc.monthlyNetBenefit)}. Initial investment is ${formatCurrency(calc.trainingCostOneTime)} with a payback period of ${calc.paybackMonths.toFixed(1)} months.`;
  };

  const generatePilotPitch = () => {
    const calc = baseScenario.calculation;
    const budget = calc.trainingCostOneTime + calc.aiRecurringCostPerMonth * 3;

    return `We recommend a 90-day pilot for ${formatCurrency(budget)}, with expected risk-adjusted savings of ${formatCurrency(calc.riskAdjustedSavings * 3)} and increased marketing throughput. This represents a small bet with a potential ${formatCurrency(calc.pilot3MonthSavings)} net benefit over the pilot period.`;
  };

  const generateSlideBullets = () => {
    const calc = baseScenario.calculation;
    const conservative = scenarios.find((s) => s.name === "Conservative");
    const aggressive = scenarios.find((s) => s.name === "Aggressive");

    return [
      `Current monthly workflow cost: ${formatCurrency(calc.costCurrent)}`,
      `AI implementation reduces cost to: ${formatCurrency(calc.costFuture)}`,
      `Monthly net benefit: ${formatCurrency(calc.monthlyNetBenefit)}`,
      `ROI: ${calc.roiPercentage.toFixed(1)}%`,
      `Payback period: ${calc.paybackMonths.toFixed(1)} months`,
      conservative && `Conservative scenario: ${formatCurrency(conservative.calculation.monthlyNetBenefit)}/mo`,
      aggressive && `Aggressive scenario: ${formatCurrency(aggressive.calculation.monthlyNetBenefit)}/mo`,
    ].filter(Boolean);
  };

  const handleGenerateFullCase = async () => {
    setLoading(true);
    try {
      // In a real implementation, you might call OpenAI to generate a more detailed business case
      // For now, we'll combine the templates
      const fullCase = `
# Business Case: Marketing AI Workflow Implementation

## Executive Summary

${generateCFOSummary()}

## Pilot Recommendation

${generatePilotPitch()}

## Key Metrics

${generateSlideBullets().map((bullet) => `- ${bullet}`).join("\n")}

## Workflow Impact

The implementation will affect ${benchmarks.tasks.length} distinct tasks within the ${inputs.primaryWorkflow} workflow, with AI coverage ranging from ${Math.min(...benchmarks.tasks.map(t => t.aiCoveragePct))}% to ${Math.max(...benchmarks.tasks.map(t => t.aiCoveragePct))}% per task.

## Recommended Tools

${benchmarks.recommendedTools.map((tool) => {
  const cost = tool.billingModel === "per_account" 
    ? `${formatCurrency(tool.accountCostPerMonth || 0)}/month (account-based)`
    : `${formatCurrency(tool.licensePerUser || 0)}/user/month`;
  return `- ${tool.name}: ${cost}`;
}).join("\n")}

## Risk Assessment

The risk-adjusted savings model assumes 70% confidence in achieving base case projections, resulting in ${formatCurrency(baseScenario.calculation.riskAdjustedSavings)} monthly savings.

## Next Steps

1. Approve 90-day pilot budget
2. Select pilot team members
3. Implement recommended AI tools
4. Track metrics against projections
5. Review after 90 days for full rollout decision
      `.trim();

      setGeneratedText(fullCase);
    } catch (error) {
      console.error("Error generating business case:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-lg border border-gray-800 p-6">
      <h2 className="text-2xl font-bold mb-4 text-[#fa6715]">Business Case Generator</h2>

      <div className="space-y-4 mb-6">
        <div className="border-l-4 border-[#fa6715] pl-4 py-2 bg-[#fa6715]/10">
          <h3 className="font-semibold text-[#fa6715] mb-1">CFO Summary</h3>
          <p className="text-gray-300 text-sm">{generateCFOSummary()}</p>
        </div>

        <div className="border-l-4 border-[#fa6715] pl-4 py-2 bg-[#fa6715]/10">
          <h3 className="font-semibold text-[#fa6715] mb-1">Pilot Pitch</h3>
          <p className="text-gray-300 text-sm">{generatePilotPitch()}</p>
        </div>

        <div className="border-l-4 border-[#fa6715] pl-4 py-2 bg-[#fa6715]/10">
          <h3 className="font-semibold text-[#fa6715] mb-1">Slide Bullets</h3>
          <ul className="list-disc list-inside text-gray-300 text-sm space-y-1">
            {generateSlideBullets().map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        </div>
      </div>

      <button
        onClick={handleGenerateFullCase}
        disabled={loading}
        className="w-full bg-[#fa6715] text-white py-3 px-4 rounded-md hover:bg-[#e55a0f] disabled:bg-gray-700 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {loading ? "Generating..." : "Generate Full Business Case Document"}
      </button>

      {generatedText && (
        <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="font-semibold text-[#fa6715] mb-2">Full Business Case</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono">
            {generatedText}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(generatedText);
              alert("Copied to clipboard!");
            }}
            className="mt-4 bg-[#fa6715] text-white py-2 px-4 rounded-md hover:bg-[#e55a0f] text-sm"
          >
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}

