"use client";

import { useState } from "react";
import WorkflowInputs from "../components/WorkflowInputs";
import ScenarioCard from "../components/ScenarioCard";
import WorkflowBreakdown from "../components/WorkflowBreakdown";
import BusinessCaseGenerator from "../components/BusinessCaseGenerator";
import { UserInputs, AIBenchmarkResponse, Scenario } from "../types";
import { ROICalculator } from "../lib/roi-calculator";

export default function Home() {
  const [inputs, setInputs] = useState<UserInputs | null>(null);
  const [benchmarks, setBenchmarks] = useState<AIBenchmarkResponse | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (userInputs: UserInputs) => {
    setLoading(true);
    setError(null);
    setInputs(userInputs);

    try {
      // Call OpenAI API to get benchmarks
      const response = await fetch("/api/benchmarks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userInputs),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate benchmarks");
      }

      const benchmarkData: AIBenchmarkResponse = await response.json();
      setBenchmarks(benchmarkData);

      // Calculate ROI scenarios using deterministic math
      const calculatedScenarios = ROICalculator.generateScenarios(
        benchmarkData.tasks,
        benchmarkData.recommendedTools,
        userInputs.teamSize,
        userInputs.averageHourlyCost,
        benchmarkData.revenueModel,
        5000, // training cost
        10 // runs per month (default)
      );

      setScenarios(calculatedScenarios);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error generating benchmarks:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-[#fa6715] mb-2">
            Nytelligence ROI
          </h1>
          <p className="text-lg text-gray-300">
            Marketing AI Workflow ROI Calculator + Recommender
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Powered by OpenAI for benchmarks • Deterministic ROI calculations
          </p>
        </header>

        <WorkflowInputs onGenerate={handleGenerate} loading={loading} />

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400 font-semibold">Error</p>
            <p className="text-red-300 text-sm">{error}</p>
            <p className="text-red-400 text-xs mt-2">
              Make sure you have set OPENAI_API_KEY in your environment variables.
            </p>
          </div>
        )}

        {loading && (
          <div className="bg-[#fa6715]/10 border border-[#fa6715]/50 rounded-lg p-6 mb-6 text-center">
            <p className="text-[#fa6715] font-semibold">Generating AI-powered benchmarks...</p>
            <p className="text-gray-300 text-sm mt-2">
              This may take a few moments
            </p>
          </div>
        )}

        {benchmarks && scenarios.length > 0 && inputs && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-4 text-[#fa6715]">ROI Scenarios</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {scenarios.map((scenario) => (
                  <ScenarioCard key={scenario.name} scenario={scenario} />
                ))}
              </div>
            </div>

            <WorkflowBreakdown
              tasks={benchmarks.tasks}
              recommendedTools={benchmarks.recommendedTools}
            />

            <BusinessCaseGenerator
              inputs={inputs}
              scenarios={scenarios}
              benchmarks={benchmarks}
            />
          </>
        )}

        {!loading && !benchmarks && (
          <div className="bg-gray-900 rounded-lg shadow-lg border border-gray-800 p-8 text-center">
            <p className="text-gray-300 mb-4">
              Enter your marketing department details above to generate AI-powered ROI calculations.
            </p>
            <div className="text-sm text-gray-400 space-y-2">
              <p>✓ OpenAI generates workflow breakdowns and efficiency estimates</p>
              <p>✓ Deterministic math calculates ROI (no AI hallucinations)</p>
              <p>✓ Generate CFO-ready business cases and pilot plans</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

