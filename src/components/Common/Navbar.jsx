import * as Dialog from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Menu, ShoppingCart, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Link, matchPath, useLocation } from "react-router-dom"

import { NavbarLinks } from "../../data/navbar-links"
import { apiConnector } from "../../services/apiConnector"
import { categories } from "../../services/apis"
import { ACCOUNT_TYPE } from "../../utils/constants"
import { landingPathFor } from "../../utils/landing"
import ProfileDropdown from "../core/Auth/ProfileDropdown"
import NotificationBell from "./NotificationBell"
import Logo from "./Logo"
import SearchBar from "./SearchBar"
import ThemeSwitcher from "./ThemeSwitcher"

function Navbar() {
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const { totalItems } = useSelector((state) => state.cart)
  const location = useLocation()

  const [subLinks, setSubLinks] = useState([])
  const [loading, setLoading] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileCatalogOpen, setMobileCatalogOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await apiConnector("GET", categories.CATEGORIES_API)
        setSubLinks(res?.data?.data || [])
      } catch (error) {
        console.log("Could not fetch Categories.", error)
        setSubLinks([])
      }
      setLoading(false)
    })()
  }, [])

  // Close the mobile drawer automatically on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const matchRoute = (route) => {
    return matchPath({ path: route }, location.pathname)
  }

  // Signed-in users already have the sidebar (dashboard) or the lecture list
  // (player), so those screens get a slim bar: logo, search and account only.
  // Elsewhere a signed-in user drops the marketing links (Home / About / Contact,
  // which live in the footer) and keeps Catalog and Learning Paths.
  const inWorkspace = Boolean(
    matchPath({ path: "/dashboard/*" }, location.pathname) ||
      matchPath({ path: "/view-course/*" }, location.pathname)
  )
  const signedIn = token !== null
  const visibleLinks = signedIn
    ? inWorkspace
      ? []
      : NavbarLinks.filter((l) => ["Catalog", "Learning Paths"].includes(l.title))
    : NavbarLinks

  return (
    <div className="sticky top-0 z-[60] px-3 pt-3">
      <div className="mx-auto flex h-14 w-full max-w-maxContent items-center justify-between rounded-full border border-richblack-700 bg-richblack-800/85 px-4 shadow-card backdrop-blur-md sm:px-6">
        {/* Logo */}
        <Link to="/">
          <Logo size={28} />
        </Link>

        {/* Desktop navigation links */}
        <nav className={`${visibleLinks.length ? "md:block" : ""} hidden`}>
          <ul className="flex gap-x-1 text-sm font-medium text-richblack-25">
            {visibleLinks.map((link, index) => (
              <li key={index}>
                {link.title === "Catalog" ? (
                  <div
                    className={`group relative flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 transition-colors hover:bg-richblack-700 ${
                      matchRoute("/catalog/:catalogName")
                        ? "bg-yellow-50/10 text-yellow-50"
                        : "text-richblack-25"
                    }`}
                  >
                    <p>{link.title}</p>
                    <ChevronDown size={16} />
                    <div className="invisible absolute left-[50%] top-[50%] z-[1000] flex w-[220px] translate-x-[-50%] translate-y-[2.2em] flex-col rounded-xl border border-richblack-700 bg-richblack-800 p-2 opacity-0 shadow-card transition-all duration-150 group-hover:visible group-hover:translate-y-[1.4em] group-hover:opacity-100 lg:w-[280px]">
                      {loading ? (
                        <p className="p-3 text-center text-richblack-300">Loading...</p>
                      ) : subLinks.length ? (
                        <>
                          {subLinks
                            ?.filter(
                              (subLink) =>
                                Array.isArray(subLink?.courses) &&
                                subLink.courses.length > 0
                            )
                            ?.map((subLink, i) => (
                              <Link
                                to={`/catalog/${subLink.name
                                  .split(" ")
                                  .join("-")
                                  .toLowerCase()}`}
                                className="rounded-lg px-3 py-2 text-richblack-25 transition-colors hover:bg-richblack-700"
                                key={i}
                              >
                                <p>{subLink.name}</p>
                              </Link>
                            ))}
                        </>
                      ) : (
                        <p className="p-3 text-center text-richblack-300">No Courses Found</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <Link to={link?.path}>
                    <p
                      className={`rounded-full px-3 py-1.5 transition-colors hover:bg-richblack-700 ${
                        matchRoute(link?.path) ? "bg-yellow-50/10 text-yellow-50" : "text-richblack-25"
                      }`}
                    >
                      {link.title}
                    </p>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Search (desktop) */}
        <div className={`mx-4 hidden flex-1 lg:block ${inWorkspace ? "max-w-md" : "max-w-[260px]"}`}>
          <SearchBar />
        </div>

        {/* Login / Signup / Dashboard */}
        <div className="hidden items-center gap-x-3 md:flex">
          <ThemeSwitcher />
          {user && user?.accountType !== ACCOUNT_TYPE.INSTRUCTOR && (
            <Link to="/dashboard/cart" className="relative">
              <ShoppingCart size={22} className="text-richblack-100" />
              {totalItems > 0 && (
                <span className="absolute -bottom-2 -right-2 grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-yellow-50 text-center text-xs font-bold text-richblack-900">
                  {totalItems}
                </span>
              )}
            </Link>
          )}

          {token === null && (
            <>
              <Link to="/login">
                <button className="rounded-full border border-richblack-600 px-4 py-1.5 text-sm font-medium text-richblack-100 transition-colors hover:border-yellow-50 hover:text-yellow-50">
                  Log in
                </button>
              </Link>
              <Link to="/signup">
                <button className="rounded-full bg-yellow-50 px-4 py-1.5 text-sm font-semibold text-richblack-900 transition-colors hover:bg-yellow-100">
                  Sign up
                </button>
              </Link>
            </>
          )}

          {token !== null && (
            <>
              <NotificationBell />
              <ProfileDropdown />
            </>
          )}
        </div>

        {/* Mobile: notifications + cart + hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          {token !== null && <NotificationBell />}
          {user && user?.accountType !== ACCOUNT_TYPE.INSTRUCTOR && (
            <Link to="/dashboard/cart" className="relative">
              <ShoppingCart size={22} className="text-richblack-100" />
              {totalItems > 0 && (
                <span className="absolute -bottom-2 -right-2 grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-yellow-50 text-center text-xs font-bold text-richblack-900">
                  {totalItems}
                </span>
              )}
            </Link>
          )}
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button aria-label="Open menu" className="rounded-lg p-1 text-richblack-100">
                <Menu size={26} />
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
                      className="fixed right-0 top-0 z-[80] flex h-full w-[82%] max-w-sm flex-col overflow-y-auto border-l border-richblack-700 bg-richblack-900 p-5"
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "100%" }}
                      transition={{ type: "tween", duration: 0.25 }}
                    >
                      <div className="mb-6 flex items-center justify-between">
                        <Dialog.Title className="text-lg font-semibold text-richblack-5">
                          Menu
                        </Dialog.Title>
                        <Dialog.Close asChild>
                          <button aria-label="Close menu" className="rounded-lg p-1 text-richblack-100">
                            <X size={24} />
                          </button>
                        </Dialog.Close>
                      </div>

                      <div className="mb-4">
                        <SearchBar onNavigate={() => setMobileOpen(false)} />
                      </div>

                      <nav className="flex flex-col gap-1">
                        {visibleLinks.map((link, index) =>
                          link.title === "Catalog" ? (
                            <div key={index}>
                              <button
                                onClick={() => setMobileCatalogOpen((v) => !v)}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-richblack-25"
                              >
                                <span>Catalog</span>
                                <ChevronDown
                                  size={18}
                                  className={`transition-transform ${
                                    mobileCatalogOpen ? "rotate-180" : ""
                                  }`}
                                />
                              </button>
                              {mobileCatalogOpen && (
                                <div className="flex flex-col gap-1 pl-4">
                                  {(() => {
                                    const items = subLinks?.filter(
                                      (subLink) =>
                                        Array.isArray(subLink?.courses) &&
                                        subLink.courses.length > 0
                                    )
                                    if (!items?.length) {
                                      return (
                                        <p className="px-3 py-2 text-richblack-400">
                                          No categories found
                                        </p>
                                      )
                                    }
                                    return items.map((subLink, i) => (
                                      <Link
                                        key={i}
                                        to={`/catalog/${subLink.name
                                          .split(" ")
                                          .join("-")
                                          .toLowerCase()}`}
                                        className="rounded-lg px-3 py-2 text-richblack-300 hover:bg-richblack-800"
                                      >
                                        {subLink.name}
                                      </Link>
                                    ))
                                  })()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Link
                              key={index}
                              to={link?.path}
                              className="rounded-lg px-3 py-3 text-richblack-25 hover:bg-richblack-800"
                            >
                              {link.title}
                            </Link>
                          )
                        )}
                      </nav>

                      <div className="mt-6 border-t border-richblack-700 pt-4">
                        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-richblack-300">
                          Theme
                        </p>
                        <ThemeSwitcher inline />
                      </div>

                      <div className="mt-6 flex flex-col gap-3 border-t border-richblack-700 pt-6">
                        {token === null ? (
                          <>
                            <Link to="/login">
                              <button className="w-full rounded-lg border border-richblack-700 bg-richblack-800 px-4 py-3 text-richblack-100">
                                Log in
                              </button>
                            </Link>
                            <Link to="/signup">
                              <button className="w-full rounded-lg bg-yellow-50 px-4 py-3 font-semibold text-richblack-900">
                                Sign up
                              </button>
                            </Link>
                          </>
                        ) : (
                          <Link
                            to={landingPathFor(user)}
                            className="rounded-lg px-3 py-3 text-richblack-25 hover:bg-richblack-800"
                          >
                            My Dashboard
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  </Dialog.Content>
                </Dialog.Portal>
              )}
            </AnimatePresence>
          </Dialog.Root>
        </div>
      </div>
    </div>
  )
}

export default Navbar
