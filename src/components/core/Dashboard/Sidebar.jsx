import * as Dialog from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "framer-motion"
import { Menu, X } from "lucide-react"
import { useState } from "react"
import { VscSignOut } from "react-icons/vsc"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import { sidebarLinks } from "../../../data/dashboard-links"
import { logout } from "../../../services/operations/authAPI"
import ConfirmationModal from "../../Common/ConfirmationModal"
import SidebarLink from "./SidebarLink"

function SidebarLinks({ user, onNavigate, dispatch, navigate, setConfirmationModal }) {
  return (
    <>
      <div className="flex flex-col">
        {sidebarLinks.map((link) => {
          if (link.type && user?.accountType !== link.type) return null
          return (
            <SidebarLink
              key={link.id}
              link={link}
              iconName={link.icon}
              onClick={onNavigate}
            />
          )
        })}
      </div>
      <div className="mx-auto my-4 h-px w-full bg-richblack-700" />
      <div className="flex flex-col">
        <SidebarLink
          link={{ name: "Settings", path: "/dashboard/settings" }}
          iconName="VscSettingsGear"
          onClick={onNavigate}
        />
        <button
          onClick={() => {
            onNavigate?.()
            setConfirmationModal({
              text1: "Are you sure?",
              text2: "You will be logged out of your account.",
              btn1Text: "Logout",
              btn2Text: "Cancel",
              btn1Handler: () => dispatch(logout(navigate)),
              btn2Handler: () => setConfirmationModal(null),
            })
          }}
          className="rounded-xl px-4 py-2.5 text-left text-sm font-medium text-richblack-300 transition-colors hover:bg-richblack-700 hover:text-richblack-5"
        >
          <div className="flex items-center gap-x-2">
            <VscSignOut className="text-lg" />
            <span>Logout</span>
          </div>
        </button>
      </div>
    </>
  )
}

export default function Sidebar() {
  const { user, loading: profileLoading } = useSelector(
    (state) => state.profile
  )
  const { loading: authLoading } = useSelector((state) => state.auth)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [confirmationModal, setConfirmationModal] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (profileLoading || authLoading) {
    return (
      <div className="surface grid h-64 w-64 shrink-0 items-center max-md:hidden">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile trigger bar */}
      <div className="surface flex items-center px-4 py-3 md:hidden">
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Trigger asChild>
            <button
              aria-label="Open dashboard menu"
              className="flex items-center gap-2 text-richblack-25"
            >
              <Menu size={22} />
              <span className="font-medium">Menu</span>
            </button>
          </Dialog.Trigger>
          <AnimatePresence>
            {mobileOpen && (
              <Dialog.Portal forceMount>
                <Dialog.Overlay asChild forceMount>
                  <motion.div
                    className="fixed inset-0 z-[70] bg-black/60"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                </Dialog.Overlay>
                <Dialog.Content asChild forceMount>
                  <motion.div
                    className="fixed left-0 top-0 z-[80] flex h-full w-[78%] max-w-xs flex-col overflow-y-auto border-r border-richblack-700 bg-richblack-800 py-6"
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "tween", duration: 0.25 }}
                  >
                    <div className="mb-4 flex items-center justify-between px-6">
                      <Dialog.Title className="font-semibold text-richblack-5">
                        Dashboard
                      </Dialog.Title>
                      <Dialog.Close asChild>
                        <button aria-label="Close menu" className="text-richblack-100">
                          <X size={22} />
                        </button>
                      </Dialog.Close>
                    </div>
                    <SidebarLinks
                      user={user}
                      onNavigate={() => setMobileOpen(false)}
                      dispatch={dispatch}
                      navigate={navigate}
                      setConfirmationModal={setConfirmationModal}
                    />
                  </motion.div>
                </Dialog.Content>
              </Dialog.Portal>
            )}
          </AnimatePresence>
        </Dialog.Root>
      </div>

      {/* Desktop static sidebar */}
      <div className="surface sticky top-24 hidden w-64 shrink-0 flex-col p-3 md:flex">
        <SidebarLinks
          user={user}
          dispatch={dispatch}
          navigate={navigate}
          setConfirmationModal={setConfirmationModal}
        />
      </div>

      {confirmationModal && <ConfirmationModal modalData={confirmationModal} />}
    </>
  )
}
