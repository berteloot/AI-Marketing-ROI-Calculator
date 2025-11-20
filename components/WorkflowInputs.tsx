"use client";

import { useState } from "react";
import { DepartmentType, PrimaryWorkflow, UserInputs } from "../types";

interface WorkflowInputsProps {
  onGenerate: (inputs: UserInputs) => void;
  loading: boolean;
}

const DEPARTMENT_TYPES: DepartmentType[] = [
  "B2B SaaS / Software",
  "B2B Services (Agency or Consulting)",
  "B2B Product / Manufacturing",
  "B2C / Commerce / Marketplace",
];

const WORKFLOWS: PrimaryWorkflow[] = [
  "LinkedIn content + campaigns",
  "LinkedIn outreach + list building",
  "Email nurture + sequences",
  "Podcast → content multipliers",
  "AI video creation",
  "Video editing + repurposing",
  "Demand gen reporting + attribution",
  "Ad variant + creative testing",
  "Sales enablement assets",
  "Trade shows + conferences",
  "Webinars + online events",
  "Live events (LinkedIn Live, virtual sessions)",
];

export default function WorkflowInputs({ onGenerate, loading }: WorkflowInputsProps) {
  const [departmentType, setDepartmentType] = useState<DepartmentType>("B2B SaaS / Software");
  const [primaryWorkflow, setPrimaryWorkflow] = useState<PrimaryWorkflow>(
    "LinkedIn content + campaigns"
  );
  const [teamSize, setTeamSize] = useState<number>(5);
  const [averageHourlyCost, setAverageHourlyCost] = useState<number>(75);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({
      departmentType,
      primaryWorkflow,
      teamSize,
      averageHourlyCost,
    });
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-lg border border-gray-800 p-6 mb-6">
      <h2 className="text-2xl font-bold mb-4 text-[#fa6715]">Marketing Department Profile</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Department Type
          </label>
          <select
            value={departmentType}
            onChange={(e) => setDepartmentType(e.target.value as DepartmentType)}
            className="w-full px-3 py-2 bg-black border border-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#fa6715] focus:border-[#fa6715]"
            required
          >
            {DEPARTMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Primary Workflow
          </label>
          <select
            value={primaryWorkflow}
            onChange={(e) => setPrimaryWorkflow(e.target.value as PrimaryWorkflow)}
            className="w-full px-3 py-2 bg-black border border-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#fa6715] focus:border-[#fa6715]"
            required
          >
            {WORKFLOWS.map((workflow) => (
              <option key={workflow} value={workflow}>
                {workflow}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Team Size
            </label>
            <input
              type="number"
              min="1"
              value={teamSize}
              onChange={(e) => setTeamSize(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 bg-black border border-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#fa6715] focus:border-[#fa6715]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Average Hourly Cost ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={averageHourlyCost}
              onChange={(e) => setAverageHourlyCost(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-black border border-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#fa6715] focus:border-[#fa6715]"
              required
            />
          </div>
        </div>

        {/* Honeypot field - hidden from users but visible to bots */}
        <input
          type="text"
          name="_honeypot"
          tabIndex={-1}
          autoComplete="off"
          style={{
            position: "absolute",
            left: "-9999px",
            opacity: 0,
            width: "1px",
            height: "1px",
            overflow: "hidden",
          }}
          aria-hidden="true"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#fa6715] text-white py-3 px-4 rounded-md hover:bg-[#e55a0f] disabled:bg-gray-700 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? "Generating Benchmarks with AI..." : "Generate Benchmarks with AI"}
        </button>
      </form>
    </div>
  );
}

