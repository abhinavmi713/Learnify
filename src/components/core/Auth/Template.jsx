import { useSelector } from "react-redux"

import LoginForm from "./LoginForm"
import SignupForm from "./SignupForm"

function Template({ title, description1, description2, image, quote, formType, accountType, setAccountType }) {
  const { loading } = useSelector((state) => state.auth)

  return (
    <div className="hero-glow grid min-h-[calc(100vh-5rem)] place-items-center px-3 py-10">
      {loading ? (
        <div className="spinner"></div>
      ) : (
        <div className="surface mx-auto grid w-full max-w-5xl overflow-hidden md:grid-cols-2">
          <div className="p-6 sm:p-10">
            <h1 className="text-3xl font-extrabold leading-tight text-richblack-5">{title}</h1>
            <p className="mt-3 text-base leading-relaxed">
              <span className="text-richblack-200">{description1}</span>{" "}
              <span className="font-semibold text-yellow-50">{description2}</span>
            </p>
            {formType === "signup" ? (
              <SignupForm accountType={accountType} setAccountType={setAccountType} />
            ) : (
              <LoginForm />
            )}
          </div>
          <div className="relative hidden min-h-[480px] md:block">
            <img
              key={image}
              src={image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full animate-[fadeIn_0.4s_ease] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <p className="absolute bottom-8 left-8 right-8 font-display text-2xl font-bold leading-snug text-white">
              {quote || "Finish what you start. Learn at your pace and earn a certificate you can share."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Template
