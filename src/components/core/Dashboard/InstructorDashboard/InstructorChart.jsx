import { useState } from "react"
import { Chart, registerables } from "chart.js"
import { Bar, Doughnut, Line } from "react-chartjs-2"

import useTheme from "../../../../hooks/useTheme"
import { chartPalette, themeColor } from "../../../../utils/theme"

Chart.register(...registerables)

const TABS = [
  { id: "students", label: "Students" },
  { id: "income", label: "Income" },
  { id: "trend", label: "Enrollment trend" },
]

export default function InstructorChart({ courses, enrollmentTrend = [] }) {
  const [currChart, setCurrChart] = useState("students")
  // Re-render (and re-read the palette) whenever the theme changes.
  useTheme()

  const textColor = themeColor("richblack-200")
  const gridColor = themeColor("richblack-600")
  const labels = courses.map((c) => c.courseName)
  const isIncome = currChart === "income"
  const values = courses.map((c) => (isIncome ? c.totalAmountGenerated : c.totalStudentsEnrolled))
  const total = values.reduce((a, b) => a + b, 0)
  const colors = chartPalette(courses.length)
  const fmt = (v) => (isIncome ? `₹${v}` : String(v))

  const baseOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y ?? ctx.parsed)}` } },
    },
  }

  const axisOptions = {
    ...baseOptions,
    scales: {
      x: {
        ticks: {
          color: textColor,
          // Long course names would be clipped under the axis, so shorten them here.
          callback(value) {
            const label = String(this.getLabelForValue(value))
            return label.length > 18 ? `${label.slice(0, 17)}…` : label
          },
        },
        grid: { display: false },
      },
      y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } },
    },
  }

  const trendData = {
    labels: enrollmentTrend.map((b) => b.month),
    datasets: [
      {
        label: "Enrollments",
        data: enrollmentTrend.map((b) => b.count),
        borderColor: themeColor("yellow-50"),
        backgroundColor: themeColor("yellow-50", 0.18),
        tension: 0.35,
        fill: true,
        pointRadius: 4,
      },
    ],
  }

  const pieData = {
    labels,
    datasets: [{ data: values, backgroundColor: colors, borderColor: themeColor("richblack-800"), borderWidth: 3 }],
  }

  // One or two courses make a poor pie, so compare them with bars instead.
  const useBars = courses.length < 3

  return (
    <div className="surface flex min-w-0 flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-bold text-richblack-5">Performance</p>
        <div role="tablist" className="flex gap-1 rounded-full border border-richblack-600 bg-richblack-900 p-1 text-sm font-medium">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={currChart === tab.id}
              onClick={() => setCurrChart(tab.id)}
              className={`rounded-full px-3 py-1 transition-colors ${
                currChart === tab.id
                  ? "bg-yellow-50 text-richblack-900"
                  : "text-richblack-200 hover:text-richblack-5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {currChart === "trend" ? (
        enrollmentTrend.length ? (
          <div className="relative h-[300px]">
            <Line data={trendData} options={axisOptions} />
          </div>
        ) : (
          <p className="grid h-[300px] place-items-center text-richblack-300">
            No enrollments yet, so there is no trend to show.
          </p>
        )
      ) : total === 0 ? (
        <p className="grid h-[300px] place-items-center text-richblack-300">
          No {isIncome ? "income" : "students"} yet.
        </p>
      ) : useBars ? (
        <div className="relative h-[300px]">
          <Bar
            data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 8, maxBarThickness: 90 }] }}
            options={axisOptions}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-[240px] w-[240px] shrink-0">
            <Doughnut data={pieData} options={{ ...baseOptions, cutout: "68%" }} />
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <p className="font-display text-2xl font-extrabold text-richblack-5">{fmt(total)}</p>
              <p className="text-xs text-richblack-300">{isIncome ? "total income" : "total students"}</p>
            </div>
          </div>
          <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
            {courses.map((c, i) => (
              <li key={c.courseName + i} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colors[i] }} />
                <span className="min-w-0 flex-1 truncate text-richblack-100">{c.courseName}</span>
                <span className="font-semibold text-richblack-5">{fmt(values[i])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
