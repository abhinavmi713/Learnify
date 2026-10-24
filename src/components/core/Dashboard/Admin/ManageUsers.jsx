import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { getAllUsersAdmin, setUserActive } from "../../../../services/operations/adminAPI"
import useDebouncedValue from "../../../../hooks/useDebouncedValue"
import Pagination from "../../../Common/Pagination"

export default function ManageUsers() {
  const { token } = useSelector((state) => state.auth)
  const { user: currentUser } = useSelector((state) => state.profile)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [accountType, setAccountType] = useState("")
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const debouncedSearch = useDebouncedValue(search, 300)

  const fetchUsers = async () => {
    setLoading(true)
    const { items, pagination } = await getAllUsersAdmin(token, {
      search: debouncedSearch,
      accountType,
      page,
    })
    setUsers(items)
    setPagination(pagination)
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, accountType, page])

  // A new search/filter starts again from the first page.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, accountType])

  const handleToggleActive = async (u) => {
    setBusyId(u._id)
    const ok = await setUserActive(u._id, !u.active, token)
    if (ok) fetchUsers()
    setBusyId(null)
  }

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Manage Users</h1>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          className="form-style flex-1"
        />
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
          className="form-style"
        >
          <option value="">All roles</option>
          <option value="Student">Student</option>
          <option value="Instructor">Instructor</option>
          <option value="Admin">Admin</option>
        </select>
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : users.length === 0 ? (
        <p className="text-richblack-300">No users found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-richblack-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-richblack-800 text-richblack-300">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-t border-richblack-700 text-richblack-100">
                  <td className="p-3 font-semibold">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.accountType}</td>
                  <td className="p-3">
                    <span className={u.active !== false ? "text-caribbeangreen-100" : "text-pink-200"}>
                      {u.active !== false ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="p-3">
                    {u._id === currentUser?._id ? (
                      <span className="text-richblack-300">You</span>
                    ) : (
                      <button
                        disabled={busyId === u._id}
                        onClick={() => handleToggleActive(u)}
                        className="text-richblue-200 hover:underline"
                      >
                        {u.active !== false ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={pagination} onChange={setPage} />
    </div>
  )
}
