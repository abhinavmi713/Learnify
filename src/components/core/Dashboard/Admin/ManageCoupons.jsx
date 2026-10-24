import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { useSelector } from "react-redux"

import { apiConnector } from "../../../../services/apiConnector"
import { couponEndpoints } from "../../../../services/apis"
import Pagination from "../../../Common/Pagination"

const { CREATE_COUPON_API, GET_ALL_COUPONS_API, SET_COUPON_ACTIVE_API } = couponEndpoints

export default function ManageCoupons() {
  const { token } = useSelector((state) => state.auth)
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    maxUses: "",
    expiresAt: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)

  const fetchCoupons = async () => {
    setLoading(true)
    try {
      const res = await apiConnector(
        "GET",
        GET_ALL_COUPONS_API,
        null,
        { Authorization: `Bearer ${token}` },
        { page }
      )
      setCoupons(res?.data?.data || [])
      setPagination(res?.data?.pagination || null)
    } catch (error) {
      toast.error("Could not load coupons")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCoupons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.code.trim() || !form.discountValue) {
      toast.error("Code and discount value are required")
      return
    }
    setSubmitting(true)
    try {
      const res = await apiConnector(
        "POST",
        CREATE_COUPON_API,
        {
          code: form.code.trim(),
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          maxUses: form.maxUses ? Number(form.maxUses) : undefined,
          expiresAt: form.expiresAt || undefined,
        },
        { Authorization: `Bearer ${token}` }
      )
      if (!res.data.success) throw new Error(res.data.message)
      toast.success("Coupon created")
      setForm({ code: "", discountType: "percentage", discountValue: "", maxUses: "", expiresAt: "" })
      fetchCoupons()
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || "Failed to create coupon")
    }
    setSubmitting(false)
  }

  const handleToggleActive = async (coupon) => {
    try {
      await apiConnector(
        "POST",
        SET_COUPON_ACTIVE_API,
        { couponId: coupon._id, active: !coupon.active },
        { Authorization: `Bearer ${token}` }
      )
      fetchCoupons()
    } catch (error) {
      toast.error("Could not update coupon")
    }
  }

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Manage Coupons</h1>

      <form
        onSubmit={handleCreate}
        className="mb-10 grid grid-cols-1 gap-4 surface p-6 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          placeholder="CODE"
          className="form-style"
        />
        <select
          value={form.discountType}
          onChange={(e) => setForm({ ...form, discountType: e.target.value })}
          className="form-style"
        >
          <option value="percentage">Percentage %</option>
          <option value="flat">Flat ₹</option>
        </select>
        <input
          type="number"
          value={form.discountValue}
          onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
          placeholder="Value"
          className="form-style"
        />
        <input
          type="number"
          value={form.maxUses}
          onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
          placeholder="Max uses (optional)"
          className="form-style"
        />
        <button type="submit" disabled={submitting} className="yellowButton">
          {submitting ? "Creating..." : "Create Coupon"}
        </button>
      </form>

      {loading ? (
        <div className="spinner"></div>
      ) : coupons.length === 0 ? (
        <p className="text-richblack-300">No coupons created yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-richblack-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-richblack-800 text-richblack-300">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Discount</th>
                <th className="p-3">Used</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c._id} className="border-t border-richblack-700 text-richblack-100">
                  <td className="p-3 font-semibold">{c.code}</td>
                  <td className="p-3">
                    {c.discountType === "percentage" ? `${c.discountValue}%` : `₹${c.discountValue}`}
                  </td>
                  <td className="p-3">
                    {c.usedCount}
                    {c.maxUses ? ` / ${c.maxUses}` : ""}
                  </td>
                  <td className="p-3">
                    <span className={c.active ? "text-caribbeangreen-100" : "text-pink-200"}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleToggleActive(c)}
                      className="text-richblue-200 hover:underline"
                    >
                      {c.active ? "Deactivate" : "Activate"}
                    </button>
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
