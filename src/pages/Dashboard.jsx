import { useSelector } from "react-redux"
import { Outlet } from "react-router-dom"

import Sidebar from "../components/core/Dashboard/Sidebar"

function Dashboard() {
  const { loading: profileLoading } = useSelector((state) => state.profile)
  const { loading: authLoading } = useSelector((state) => state.auth)

  if (profileLoading || authLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-11/12 max-w-maxContent flex-col gap-6 py-6 md:flex-row md:items-start">
      <Sidebar />
      <div className="min-w-0 flex-1 py-2">
        <Outlet />
      </div>
    </div>
  )
}

export default Dashboard
