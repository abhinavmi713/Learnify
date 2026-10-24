import { useState } from "react"

import instructorImg from "../assets/Images/Instructor.png"
import signupImg from "../assets/Images/signup.webp"
import Template from "../components/core/Auth/Template"
import { ACCOUNT_TYPE } from "../utils/constants"

// Copy and artwork change with the role chosen in the form.
const CONTENT = {
  [ACCOUNT_TYPE.STUDENT]: {
    title: "Start learning for free",
    description1: "Join Learnify to learn at your own pace and",
    description2: "earn certificates you can share.",
    quote: "Finish what you start. Learn at your pace and earn a certificate you can share.",
    image: signupImg,
  },
  [ACCOUNT_TYPE.INSTRUCTOR]: {
    title: "Share what you know",
    description1: "Build and publish courses, reach learners everywhere and",
    description2: "earn from every enrollment.",
    quote: "Teach what you love. We handle video, payments and certificates.",
    image: instructorImg,
  },
}

function Signup() {
  const [accountType, setAccountType] = useState(ACCOUNT_TYPE.STUDENT)
  const content = CONTENT[accountType]

  return (
    <Template
      {...content}
      formType="signup"
      accountType={accountType}
      setAccountType={setAccountType}
    />
  )
}

export default Signup
