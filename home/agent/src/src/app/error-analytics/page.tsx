"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ErrorAnalytics {
  summary: {
    totalErrors: number;
    errorsToday: number;
    errorsThisWeek: number;
    affectedUsers: number;
    mostCommonType: string;
  };
  byType: Array<{
    errorType: string;
    count: number;
    percentage: number;
  }>;
  byDay: Array<{
    date: string;
    count: number;
  }>;
  topErrors: Array<{
    error: string;
    count: number;
    lastOccurred: string;
  }>;
  recentErrors: Array<{
    id: string;
    error: string;
    errorType: string;
    url: string | null;
    createdAt: string;
    userId?: string;
    user?: {
      id: string;
      name: string | null;
      email: string | null;
    };
  }>;
}

export default function ErrorAnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<ErrorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user?.id) {
      router.push("/");
      return;
    }

    fetchAnalytics();
  }, [session, status]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/error-analytics");

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/");
          return;
        }
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-lg text-gray-800">Loading error analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg font-semibold"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  // Prepare chart data
  const trendChartData = {
    labels: analytics.byDay.map((item) => item.date),
    datasets: [
      {
        label: "Errors per Day",
        data: analytics.byDay.map((item) => item.count),
        borderColor: "rgb(236, 72, 153)",
        backgroundColor: "rgba(236, 72, 153, 0.1)",
        tension: 0.4,
      },
    ],
  };

  const typeChartData = {
    labels: analytics.byType.map((item) => item.errorType),
    datasets: [
      {
        label: "Error Count",
        data: analytics.byType.map((item) => item.count),
        backgroundColor: [
          "rgba(236, 72, 153, 0.8)",
          "rgba(147, 51, 234, 0.8)",
          "rgba(59, 130, 246, 0.8)",
          "rgba(16, 185, 129, 0.8)",
          "rgba(245, 158, 11, 0.8)",
        ],
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Error Analytics {isAdmin ? "(Admin View)" : ""}
          </h1>
          <p className="text-gray-600">
            {isAdmin
              ? "Viewing error analytics for all users"
              : "Viewing your error analytics"}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm font-medium text-gray-500 mb-2">
              Total Errors
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {analytics.summary.totalErrors}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm font-medium text-gray-500 mb-2">
              Errors Today
            </div>
            <div className="text-3xl font-bold text-pink-600">
              {analytics.summary.errorsToday}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm font-medium text-gray-500 mb-2">
              This Week
            </div>
            <div className="text-3xl font-bold text-purple-600">
              {analytics.summary.errorsThisWeek}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm font-medium text-gray-500 mb-2">
              Affected Users
            </div>
            <div className="text-3xl font-bold text-blue-600">
              {analytics.summary.affectedUsers}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm font-medium text-gray-500 mb-2">
              Most Common
            </div>
            <div className="text-sm font-bold text-gray-900 break-words">
              {analytics.summary.mostCommonType}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Trend Chart */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Error Trends (Last 30 Days)
            </h2>
            <div style={{ height: "300px" }}>
              <Line data={trendChartData} options={chartOptions} />
            </div>
          </div>

          {/* Type Breakdown Chart */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Errors by Type
            </h2>
            <div style={{ height: "300px" }}>
              <Bar data={typeChartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Error Type Breakdown Table */}
        <div className="bg-white rounded-lg shadow-lg mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              Error Type Breakdown
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.byType.map((item) => (
                  <tr key={item.errorType} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.errorType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <div className="flex-1 mr-4">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-pink-500 h-2 rounded-full"
                              style={{ width: `${item.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                        <span>{item.percentage.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Errors */}
        <div className="bg-white rounded-lg shadow-lg mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">
              Most Frequent Errors
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error Message
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Occurred
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.topErrors.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                      {item.error}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.lastOccurred).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Errors */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Recent Errors</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Error
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    URL
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.recentErrors.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      setExpandedErrorId(
                        expandedErrorId === item.id ? null : item.id
                      )
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {item.error}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                        {item.errorType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {item.url || "N/A"}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.user
                          ? item.user.email || item.user.name || "Unknown"
                          : "Anonymous"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/")}
            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
