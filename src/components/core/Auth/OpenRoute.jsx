// This will prevent authenticated users from accessing this route
import { useSelector } from "react-redux"
import { Navigate } from "react-router-dom"

import { landingPathFor } from "../../../utils/landing"

function OpenRoute({ children }) {
  const { token } = useSelector((state) => state.auth)
  const user = useSelector((state) => state.profile?.user)

  if (token === null) {
    return children
  } else {
    return <Navigate to={landingPathFor(user)} />
  }
}

export default OpenRoute
