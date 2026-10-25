import { useEffect, useState } from "react"
import useConfirm from "../../../../hooks/useConfirm"
import { useSelector } from "react-redux"
import { toast } from "react-hot-toast"

import { apiConnector } from "../../../../services/apiConnector"
import { categories as categoriesEndpoints } from "../../../../services/apis"
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "../../../../services/operations/adminAPI"

// Live (published) courses, plus drafts and courses in review when there are any.
const courseCountLabel = (c) => {
  const live = c.courseCount ?? c.courses?.length ?? 0
  const other = (c.totalCourses ?? live) - live
  return other > 0 ? `${live} live, ${other} in progress` : String(live)
}

export default function ManageCategories() {
  const { token } = useSelector((state) => state.auth)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: "", description: "" })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: "", description: "" })
  const [submitting, setSubmitting] = useState(false)

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const res = await apiConnector("GET", categoriesEndpoints.CATEGORIES_API)
      setCategories(res?.data?.data || [])
    } catch (error) {
      toast.error("Could not load categories")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error("Category name is required")
      return
    }
    setSubmitting(true)
    const ok = await createCategory(form, token)
    if (ok) {
      setForm({ name: "", description: "" })
      fetchCategories()
    }
    setSubmitting(false)
  }

  const startEdit = (category) => {
    setEditingId(category._id)
    setEditForm({ name: category.name, description: category.description || "" })
  }

  const handleUpdate = async (categoryId) => {
    const ok = await updateCategory({ categoryId, ...editForm }, token)
    if (ok) {
      setEditingId(null)
      fetchCategories()
    }
  }

  const [confirm, confirmModal] = useConfirm()

  const handleDelete = async (categoryId) => {
    const sure = await confirm({ title: "Delete this category?", body: "This cannot be undone." })
    if (!sure) return
    const ok = await deleteCategory(categoryId, token)
    if (ok) fetchCategories()
  }

  return (
    <div>
      {confirmModal}
      <h1 className="mb-8 font-display text-3xl font-bold text-richblack-5">Manage Categories</h1>

      <form
        onSubmit={handleCreate}
        className="mb-10 grid grid-cols-1 gap-4 surface p-6 sm:grid-cols-3"
      >
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Category name"
          className="form-style"
        />
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Description (optional)"
          className="form-style"
        />
        <button type="submit" disabled={submitting} className="yellowButton">
          {submitting ? "Creating..." : "Add Category"}
        </button>
      </form>

      {loading ? (
        <div className="spinner"></div>
      ) : categories.length === 0 ? (
        <p className="text-richblack-300">No categories yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-richblack-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-richblack-800 text-richblack-300">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Description</th>
                <th className="p-3">Courses</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c._id} className="border-t border-richblack-700 text-richblack-100">
                  {editingId === c._id ? (
                    <>
                      <td className="p-3">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="form-style"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({ ...editForm, description: e.target.value })
                          }
                          className="form-style"
                        />
                      </td>
                      <td className="p-3">{courseCountLabel(c)}</td>
                      <td className="p-3 flex gap-3">
                        <button
                          onClick={() => handleUpdate(c._id)}
                          className="text-caribbeangreen-100 hover:underline"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-richblack-400 hover:underline"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-semibold">{c.name}</td>
                      <td className="p-3 text-richblack-300">{c.description || "—"}</td>
                      <td className="p-3">{courseCountLabel(c)}</td>
                      <td className="p-3 flex gap-3">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-richblue-200 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(c._id)}
                          disabled={(c.totalCourses ?? c.courses?.length) > 0}
                          title={(c.totalCourses ?? c.courses?.length) > 0 ? "Move or archive this category's courses first" : ""}
                          className="text-pink-200 hover:underline disabled:cursor-not-allowed disabled:text-richblack-300"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
