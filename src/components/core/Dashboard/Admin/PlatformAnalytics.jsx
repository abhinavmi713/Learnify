import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Chart, registerables } from "chart.js"
import { Line } from "react-chartjs-2"

import useTheme from "../../../../hooks/useTheme"
import { themeColor } from "../../../../utils/theme"
import { getPlatformAnalytics } from "../../../../services/operations/adminAPI"

Chart.register(...registerables)

function StatCard({ label, value }) {
  return (
    <div className="flex flex-1 flex-col gap-y-2 surface p-6">
      <p className="text-sm text-richblack-300">{label}</p>
      <p className="text-3xl font-semibold text-richblack-5">{value}</p>
    </div>
  )
}

export default function PlatformAnalytics() {
  const { token } = useSelector((state) => state.auth)
  useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setData(await getPlatformAnalytics(token))
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div className="spinner"></div>
  if (!data) return <p className="text-richblack-300">Could not load analytics.</p>

  const trendData = {
    labels: data.enrollmentTrend.map((b) => b.month),
    datasets: [
      {
        label: "Enrollments",
        data: data.enrollmentTrend.map((b) => b.count),
        borderColor: themeColor("yellow-50"),
        backgroundColor: themeColor("yellow-50", 0.2),
        tension: 0.3,
        fill: true,
        yAxisID: "y",
      },
      {
        label: "Revenue (₹)",
        data: data.revenueTrend.map((b) => b.amount),
        borderColor: themeColor("richblue-300"),
        backgroundColor: themeColor("richblue-300", 0.2),
        tension: 0.3,
        fill: true,
        yAxisID: "y1",
      },
    ],
  }

  const trendOptions = {
    maintainAspectRatio: false,
    scales: {
      y: { type: "linear", position: "left", beginAtZero: true },
      y1: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
    },
  }

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Platform Analytics</h1>

      <div className="mb-6 flex flex-wrap gap-4">
        <StatCard label="Students" value={data.usersByRole.Student} />
        <StatCard label="Instructors" value={data.usersByRole.Instructor} />
        <StatCard label="Published Courses" value={data.coursesByStatus.Published} />
        <StatCard label="Pending Review" value={data.coursesByStatus.Pending} />
        <StatCard label="Total Enrollments" value={data.totalEnrollments} />
        <StatCard label="Total Revenue" value={`₹${data.totalRevenue}`} />
      </div>

      <div className="mb-6 h-[350px] surface p-6">
        <p className="mb-4 text-lg font-bold text-richblack-5">
          Enrollments &amp; Revenue (last 6 months)
        </p>
        <div className="relative h-[260px] w-full">
          <Line data={trendData} options={trendOptions} />
        </div>
      </div>

      <div className="surface p-6">
        <p className="mb-4 text-lg font-bold text-richblack-5">Top Courses by Enrollment</p>
        {data.topCourses.length === 0 ? (
          <p className="text-richblack-300">No enrollments yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.topCourses.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-richblack-700 py-2 text-richblack-100 last:border-0"
              >
                <span>{c.courseName}</span>
                <span className="font-semibold text-yellow-50">{c.enrollments} students</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
