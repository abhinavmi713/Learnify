import * as Icons from "react-icons/vsc"
import { useDispatch } from "react-redux"
import { NavLink, matchPath, useLocation } from "react-router-dom"

import { resetCourseState } from "../../../slices/courseSlice"

export default function SidebarLink({ link, iconName, onClick }) {
  const Icon = Icons[iconName]
  const location = useLocation()
  const dispatch = useDispatch()

  const matchRoute = (route) => {
    return matchPath({ path: route }, location.pathname)
  }

  return (
    <NavLink
      to={link.path}
      onClick={() => {
        dispatch(resetCourseState())
        onClick?.()
      }}
      className={`relative rounded-xl px-4 py-2.5 text-sm font-medium ${
        matchRoute(link.path)
          ? "bg-yellow-50 text-richblack-900"
          : "text-richblack-300 hover:bg-richblack-700 hover:text-richblack-5"
      } transition-all duration-200`}
    >
      <div className="flex items-center gap-x-2">
        {/* Icon Goes Here */}
        <Icon className="text-lg" />
        <span>{link.name}</span>
      </div>
    </NavLink>
  )
}
