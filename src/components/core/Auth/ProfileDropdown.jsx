import { useRef, useState } from "react"
import { AiOutlineCaretDown } from "react-icons/ai"
import { VscAccount, VscDashboard, VscSignOut } from "react-icons/vsc"
import { useDispatch, useSelector } from "react-redux"
import { Link, useNavigate } from "react-router-dom"

import useOnClickOutside from "../../../hooks/useOnClickOutside"
import { logout } from "../../../services/operations/authAPI"
import { landingPathFor } from "../../../utils/landing"

export default function ProfileDropdown() {
  const { user } = useSelector((state) => state.profile)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useOnClickOutside(ref, () => setOpen(false))

  if (!user) return null

  return (
    <button className="relative" onClick={() => setOpen(true)}>
      <div className="flex items-center gap-x-1">
        <img
          src={user?.image}
          alt={`profile-${user?.firstName}`}
          className="aspect-square w-[30px] rounded-full object-cover"
        />
        <AiOutlineCaretDown className="text-sm text-richblack-100" />
      </div>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-[130%] z-[1000] w-56 overflow-hidden rounded-2xl border border-richblack-700 bg-richblack-800 text-left shadow-card"
          ref={ref}
        >
          <div className="border-b border-richblack-700 px-4 py-3">
            <p className="truncate text-sm font-semibold text-richblack-5">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-richblack-300">{user?.email}</p>
          </div>
          <Link to={landingPathFor(user)} onClick={() => setOpen(false)}>
            <div className="flex w-full items-center gap-x-2 px-4 py-2.5 text-sm text-richblack-100 hover:bg-richblack-700">
              <VscDashboard className="text-lg" />
              Dashboard
            </div>
          </Link>
          <Link to="/dashboard/my-profile" onClick={() => setOpen(false)}>
            <div className="flex w-full items-center gap-x-2 px-4 py-2.5 text-sm text-richblack-100 hover:bg-richblack-700">
              <VscAccount className="text-lg" />
              My profile
            </div>
          </Link>
          <div
            onClick={() => {
              dispatch(logout(navigate))
              setOpen(false)
            }}
            className="flex w-full cursor-pointer items-center gap-x-2 border-t border-richblack-700 px-4 py-2.5 text-sm text-richblack-100 hover:bg-richblack-700"
          >
            <VscSignOut className="text-lg" />
            Logout
          </div>
        </div>
      )}
    </button>
  )
}
