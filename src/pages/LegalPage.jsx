import { Link } from "react-router-dom"

import Footer from "../components/Common/Footer"
import { LEGAL_CONFIG, LEGAL_DOCUMENTS } from "../data/legal"

const NAV = [
  { key: "terms", to: "/terms" },
  { key: "privacy", to: "/privacy-policy" },
  { key: "refund", to: "/refund-policy" },
  { key: "cookies", to: "/cookie-policy" },
]

export default function LegalPage({ docKey }) {
  const doc = LEGAL_DOCUMENTS[docKey]

  return (
    <>
    <div className="mx-auto w-11/12 max-w-3xl py-12 text-richblack-100">
      <nav className="mb-8 flex flex-wrap gap-2 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className={`rounded-full border px-3 py-1 ${
              item.key === docKey
                ? "border-yellow-50 text-yellow-50"
                : "border-richblack-700 text-richblack-300 hover:border-richblack-500"
            }`}
          >
            {LEGAL_DOCUMENTS[item.key].title}
          </Link>
        ))}
      </nav>

      <h1 className="text-3xl font-semibold text-richblack-5">{doc.title}</h1>
      <p className="mt-1 text-sm text-richblack-400">Last updated {LEGAL_CONFIG.lastUpdated}</p>
      <p className="mt-6 text-richblack-200">{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="mb-2 text-xl font-semibold text-richblack-5">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="mb-3 leading-relaxed text-richblack-200">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
    <Footer />
    </>
  )
}
