import AccountSecurity from "./AccountSecurity"
import Appearance from "./Appearance"
import ChangeProfilePicture from "./ChangeProfilePicture"
import DeleteAccount from "./DeleteAccount"
import EditProfile from "./EditProfile"
import UpdatePassword from "./UpdatePassword"

export default function Settings() {
  return (
    <>
      <h1 className="mb-10 text-3xl font-bold text-richblack-5">
        Settings
      </h1>
      <Appearance />
      {/* Change Profile Picture */}
      <ChangeProfilePicture />
      {/* Profile */}
      <EditProfile />
      {/* Password */}
      <UpdatePassword />
      {/* Two-factor authentication and sessions */}
      <AccountSecurity />
      {/* Delete Account */}
      <DeleteAccount />
    </>
  )
}
