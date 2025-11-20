"use client";

import { WorkflowTask, RecommendedTool } from "@/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface WorkflowBreakdownProps {
  tasks: WorkflowTask[];
  recommendedTools: RecommendedTool[];
}

const COLORS = ["#fa6715", "#ff8c42", "#ff6b00", "#ff9d5c", "#ffb380", "#ffc9a3"];

export default function WorkflowBreakdown({ tasks, recommendedTools }: WorkflowBreakdownProps) {
  const taskData = tasks.map((task) => ({
    name: task.name,
    hours: task.hoursPerRun,
    aiCoverage: task.aiCoveragePct,
    efficiency: task.efficiencyGainPct,
  }));

  const coverageData = tasks.map((task) => ({
    name: task.name,
    value: task.aiCoveragePct,
  }));

  return (
    <div className="bg-gray-900 rounded-lg shadow-lg border border-gray-800 p-6 mb-6">
      <h2 className="text-2xl font-bold mb-4 text-[#fa6715]">Workflow Breakdown</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="min-h-[450px]">
          <h3 className="text-lg font-semibold mb-3 text-gray-300">Hours per Task</h3>
          <div className="w-full" style={{ height: "450px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={taskData}
                margin={{ top: 20, right: 30, left: 20, bottom: 150 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={150}
                  interval={0}
                  tick={{ fontSize: 11 }}
                  width={200}
                />
                <YAxis />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #fa6715", borderRadius: "4px", maxWidth: "300px", color: "#ffffff" }}
                  formatter={(value: number) => [`${value} hours`, "Hours per Run"]}
                />
                <Bar dataKey="hours" fill="#fa6715" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-h-[450px]">
          <h3 className="text-lg font-semibold mb-3 text-gray-300">AI Coverage by Task</h3>
          <div className="w-full" style={{ height: "450px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={coverageData}
                  cx="50%"
                  cy="40%"
                  labelLine={false}
                  label={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {coverageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string) => [`${value}%`, "AI Coverage"]}
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #fa6715", borderRadius: "4px", color: "#ffffff" }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={200}
                  wrapperStyle={{ paddingTop: "20px", fontSize: "11px" }}
                  formatter={(value, entry: any) => {
                    const data = coverageData.find(d => d.name === value);
                    const displayName = value.length > 40 ? `${value.substring(0, 37)}...` : value;
                    return `${displayName}: ${data?.value || entry.payload?.value || 0}%`;
                  }}
                  iconSize={12}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-8 mb-8">
        <h3 className="text-lg font-semibold mb-4 text-gray-300">Task Details</h3>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-2/5">
                  Task
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Hours/Run
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  AI Coverage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Efficiency Gain
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-700">
              {tasks.map((task, index) => (
                <tr key={index} className="hover:bg-gray-800">
                  <td className="px-4 py-3 text-sm text-white break-words max-w-md">
                    {task.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                    {task.hoursPerRun.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                    {task.aiCoveragePct}%
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                    {task.efficiencyGainPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4 text-gray-300">Recommended AI Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendedTools.map((tool, index) => (
            <div key={index} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
              <div className="font-semibold text-[#fa6715]">{tool.name}</div>
              <div className="text-sm text-gray-400 mt-1">
                {tool.billingModel === "per_account" ? (
                  <>${tool.accountCostPerMonth || 0}/month (account-based)</>
                ) : (
                  <>${tool.licensePerUser || 0}/user/month</>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

