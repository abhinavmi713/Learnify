import React from "react"
import * as Icon1 from "react-icons/bi"
import * as Icon3 from "react-icons/hi2"
import * as Icon2 from "react-icons/io5"
import { Link } from "react-router-dom"

import { LEGAL_CONFIG } from "../../../data/legal"

const contactDetails = [
  {
    icon: "HiChatBubbleLeftRight",
    heading: "Email us",
    description: "Questions about a course, payment or your account? Write to us.",
    details: LEGAL_CONFIG.supportEmail,
  },
  {
    icon: "BiWorld",
    heading: "Want to teach?",
    description: "Create an instructor account and submit your first course for review.",
    details: "Sign up as an instructor",
    to: "/signup",
  },
]

const ContactDetails = () => {
  return (
    <div className="surface flex flex-col gap-6 p-4 lg:p-6">
      {contactDetails.map((ele, i) => {
        let Icon = Icon1[ele.icon] || Icon2[ele.icon] || Icon3[ele.icon]
        return (
          <div
            className="flex flex-col gap-[2px] p-3 text-sm text-richblack-200"
            key={i}
          >
            <div className="flex flex-row items-center gap-3">
              <Icon size={25} />
              <h1 className="text-lg font-semibold text-richblack-5">
                {ele?.heading}
              </h1>
            </div>
            <p className="font-medium">{ele?.description}</p>
            {ele.to ? (
              <Link to={ele.to} className="font-semibold text-yellow-50 hover:underline">
                {ele.details}
              </Link>
            ) : (
              <p className="font-semibold text-richblack-5">{ele?.details}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ContactDetails
