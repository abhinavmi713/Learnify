const Course = require("../models/Course")
const { invalidateCatalogCache, getOrSet } = require("../utils/cache")


const Category = require("../models/Category");

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const categoryDetails = await Category.create({ name, description });
    invalidateCatalogCache();

    console.log(categoryDetails);
    return res.status(200).json({
      success: true,
      message: "Category Created Successfully",
      data: categoryDetails,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "A category with this name already exists" })
    }
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

// Get all categories
// Counts come from the courses themselves, not from each category's stored
// `courses` array: that array kept ids of deleted, archived, draft and
// unpublished courses, so menus and the admin page showed inflated counts.
//   courses       ids of live (published, not archived) courses, for existing clients
//   courseCount   number of live courses
//   totalCourses  courses still assigned (any status except archived), for the delete guard
exports.showAllCategories = async (req, res) => {
  try {
    const [allCategories, counts] = await Promise.all([
      Category.find().lean(),
      Course.aggregate([
        { $match: { category: { $ne: null }, deletedAt: null } },
        {
          $group: {
            _id: "$category",
            total: { $sum: 1 },
            live: { $push: { $cond: [{ $eq: ["$status", "Published"] }, "$_id", "$$REMOVE"] } },
          },
        },
      ]),
    ]);
    const byCategory = new Map(counts.map((c) => [String(c._id), c]));
    res.status(200).json({
      success: true,
      data: allCategories.map((category) => {
        const c = byCategory.get(String(category._id));
        return { ...category, courses: c?.live || [], courseCount: c?.live.length || 0, totalCourses: c?.total || 0 };
      }),
    });
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

// Update a category's name/description
exports.updateCategory = async (req, res) => {
  try {
    const { categoryId, name, description } = req.body

    if (!categoryId || !name) {
      return res.status(400).json({
        success: false,
        message: "categoryId and name are required",
      })
    }

    const category = await Category.findByIdAndUpdate(
      categoryId,
      { name, description },
      { new: true }
    )

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" })
    }

    invalidateCatalogCache()
    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "A category with this name already exists" })
    }
    console.error(error)
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." })
  }
}

// Delete a category — refused if courses still reference it, so courses are
// never left with a dangling category reference.
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.body
    const category = await Category.findById(categoryId)

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" })
    }

    // Archived courses count too: restoring one must not bring back a missing category.
    if (await Course.exists({ category: category._id })) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a category that still has courses assigned to it",
      })
    }

    await Category.findByIdAndDelete(categoryId)
    invalidateCatalogCache()

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." })
  }
}

// Get category page details
// What a course card needs, for one bounded list of courses.
const COURSE_PAGE_SIZE = 48
const SLIDER_SIZE = 12
const BEST_SELLERS = 10

async function courseCards(match, { sort = { createdAt: -1, _id: -1 }, limit = COURSE_PAGE_SIZE } = {}) {
  const rows = await Course.aggregate([
    { $match: { ...match, status: "Published", deletedAt: null } },
    { $addFields: { studentsCount: { $size: { $ifNull: ["$studentsEnroled", []] } } } },
    { $sort: sort },
    { $limit: limit },
    {
      $lookup: {
        from: "ratingandreviews",
        localField: "ratingAndReviews",
        foreignField: "_id",
        as: "reviews",
        pipeline: [{ $project: { rating: 1 } }],
      },
    },
    {
      $project: {
        courseName: 1,
        price: 1,
        thumbnail: 1,
        instructor: 1,
        createdAt: 1,
        studentsCount: 1,
        avgRating: { $round: [{ $ifNull: [{ $avg: "$reviews.rating" }, 0] }, 1] },
        ratingCount: { $size: "$reviews" },
      },
    },
  ])
  return Course.populate(rows, { path: "instructor", select: "firstName lastName" })
}

// The category page: bounded lists, read directly from the courses themselves.
// (It used to load every course of every category on each request: 7 seconds and
// 11 MB on 20,000 courses.)
exports.categoryPageDetails = async (req, res) => {
  try {
    const { categoryId } = req.body
    const category = await Category.findById(categoryId).select("name description").lean()
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" })
    }

    const [courses, total] = await Promise.all([
      courseCards({ category: category._id }),
      Course.countDocuments({ category: category._id, status: "Published", deletedAt: null }),
    ])
    if (courses.length === 0) {
      return res.status(404).json({ success: false, message: "No courses found for the selected category." })
    }

    const others = await Category.find({ _id: { $ne: categoryId } }).select("name description").lean()
    let differentCategory = null
    if (others.length > 0) {
      const other = others[getRandomInt(others.length)]
      differentCategory = { ...other, courses: await courseCards({ category: other._id }, { limit: SLIDER_SIZE }) }
    }

    // Counting students across the whole catalog is the expensive part, and it
    // barely changes, so it's cached (and dropped when the catalog changes).
    const mostSellingCourses = await getOrSet("catalog", "best-sellers", 300, () =>
      courseCards({}, { sort: { studentsCount: -1, createdAt: -1 }, limit: BEST_SELLERS })
    )

    return res.status(200).json({
      success: true,
      data: {
        selectedCategory: { ...category, courses, total },
        differentCategory,
        mostSellingCourses,
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Internal server error" })
  }
}
