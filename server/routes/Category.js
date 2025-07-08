const express = require("express");
const router = express.Router();

const {
  createCategory,
  showAllCategories,
  categoryPageDetails,
} = require("../controllers/Category");

// Create new category
router.post("/createCategory", createCategory);

// Get all categories
router.get("/showAllCategories", showAllCategories);

// Get category details for catalog page
router.post("/getCategoryPageDetails", categoryPageDetails);

module.exports = router;
