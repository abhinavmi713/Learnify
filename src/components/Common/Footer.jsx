import { Link } from "react-router-dom"

import Logo from "./Logo"
import { LEGAL_CONFIG } from "../../data/legal"

// Only links to pages that exist. The previous footer was the tutorial
// template's, full of Blog / Forums / Careers / subject links that all led to
// the 404 page.
const COLUMNS = [
  {
    title: "Learn",
    links: [
      { label: "Browse courses", to: "/search" },
      { label: "Learning paths", to: "/learning-paths" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", to: "/about" },
      { label: "Contact us", to: "/contact" },
      { label: "Become an instructor", to: "/signup" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy-policy" },
      { label: "Refund Policy", to: "/refund-policy" },
      { label: "Cookie Policy", to: "/cookie-policy" },
    ],
  },
]

const Footer = () => {
  return (
    <footer className="mt-10 border-t border-richblack-700 bg-richblack-800">
      <div className="mx-auto flex w-11/12 max-w-maxContent flex-col gap-10 py-14 text-richblack-400 lg:flex-row lg:justify-between">
        <div className="max-w-xs">
          <Logo className="mb-4" />
          <p className="text-sm leading-6">
            Practical, project-based courses taught by people who do the work.
          </p>
          <a
            href={`mailto:${LEGAL_CONFIG.supportEmail}`}
            className="mt-3 inline-block text-sm hover:text-richblack-50"
          >
            {LEGAL_CONFIG.supportEmail}
          </a>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="mb-3 text-base font-semibold text-richblack-50">{column.title}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="transition-colors duration-200 hover:text-richblack-50"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-richblack-700">
        <p className="mx-auto w-11/12 max-w-maxContent py-5 text-center text-sm text-richblack-400">
          © {new Date().getFullYear()} {LEGAL_CONFIG.companyName}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

export default Footer
