// Seeds a separate database for load tests (never your real one) and builds its
// own search index, so benchmarks run on realistic volumes.
//
//   node loadtest/seedLoadData.js [courses=10000]
//
// Database: <your MONGODB_URL database>_load. Search index alias: courses_load.
// Start the API against it with:
//   MONGODB_URL=<..._load> ELASTICSEARCH_INDEX=courses_load NODE_ENV=test PORT=4010 node index.js
require("dotenv").config({ quiet: true })
const mongoose = require("mongoose")

const COURSES = Number(process.argv[2]) || 10000
const REVIEWS = COURSES * 3

function loadDbUrl(url) {
  const u = new URL(url)
  u.pathname = `/${(u.pathname.replace(/^\//, "") || "learnify")}_load`
  return u.toString()
}

const SUBJECTS = ["JavaScript", "Python", "React", "Node.js", "Docker", "Kubernetes", "SQL", "Machine Learning", "UI Design", "Figma", "Go", "Rust", "TypeScript", "Data Analysis", "Pandas", "AWS", "Linux", "Git", "System Design", "GraphQL", "Redis", "MongoDB", "Excel", "Product Management", "Photography"]
const LEVELS = ["Fundamentals", "for Beginners", "in Depth", "Masterclass", "Crash Course", "Bootcamp", "Advanced Patterns", "from Scratch", "in Practice", "Essentials"]
const WORDS = ["build", "projects", "testing", "performance", "deploy", "production", "patterns", "debugging", "architecture", "security", "hooks", "async", "containers", "queries", "dashboards", "automation", "APIs", "scaling", "layouts", "visualization"]
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const sentence = (n) => Array.from({ length: n }, () => pick(WORDS)).join(" ")

async function main() {
  const url = loadDbUrl(process.env.MONGODB_URL)
  await mongoose.connect(url)
  const db = mongoose.connection.db
  console.log(`seeding ${db.databaseName}: ${COURSES} courses, ${REVIEWS} reviews`)
  await db.dropDatabase()

  const User = require("../models/User")
  const Profile = require("../models/Profile")
  const Category = require("../models/Category")
  const profile = await Profile.create({})
  const instructors = await User.insertMany(
    Array.from({ length: 50 }, (_, i) => ({
      firstName: pick(["Asha", "Ravi", "Meera", "Karan", "Sara", "Vikram", "Nina", "Arjun"]),
      lastName: `Teacher${i}`,
      email: `load-instructor-${i}@example.com`,
      password: "x",
      accountType: "Instructor",
      additionalDetails: profile._id,
    }))
  )
  const categories = await Category.insertMany(
    ["Web Development", "Data Science", "Cloud Computing", "Design", "Programming", "Business"].map((name) => ({ name, description: name }))
  )

  const courses = []
  for (let i = 0; i < COURSES; i++) {
    const subject = pick(SUBJECTS)
    courses.push({
      _id: new mongoose.Types.ObjectId(),
      courseName: `${subject} ${pick(LEVELS)} ${i}`,
      courseDescription: `Learn ${subject} by doing: ${sentence(25)}.`,
      whatYouWillLearn: `- ${sentence(6)}\n- ${sentence(6)}`,
      instructor: pick(instructors)._id,
      category: pick(categories)._id,
      tag: [subject.toLowerCase(), pick(WORDS)],
      price: pick([0, 299, 499, 799, 999, 1499, 1999]),
      thumbnail: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      instructions: ["A laptop"],
      status: Math.random() < 0.9 ? "Published" : "Draft",
      deletedAt: null,
      courseContent: [],
      ratingAndReviews: [],
      studentsEnroled: [],
      createdAt: new Date(Date.now() - Math.random() * 3e10),
    })
  }
  const reviewsByCourse = new Map()
  const reviews = Array.from({ length: REVIEWS }, () => {
    const course = pick(courses)
    const _id = new mongoose.Types.ObjectId()
    if (!reviewsByCourse.has(course._id)) reviewsByCourse.set(course._id, [])
    reviewsByCourse.get(course._id).push(_id)
    return { _id, user: pick(instructors)._id, rating: pick([3, 4, 4, 5, 5]), review: sentence(8), course: course._id }
  })
  for (const c of courses) c.ratingAndReviews = reviewsByCourse.get(c._id) || []
  for (let i = 0; i < courses.length; i += 2000) await db.collection("courses").insertMany(courses.slice(i, i + 2000))
  for (let i = 0; i < reviews.length; i += 5000) await db.collection("ratingandreviews").insertMany(reviews.slice(i, i + 5000))
  // Same indexes as the app.
  await require("../models/Course").syncIndexes()

  if (process.env.ELASTICSEARCH_URL) {
    process.env.ELASTICSEARCH_INDEX = "courses_load"
    const { rebuild } = require("../search/courseIndex")
    const started = Date.now()
    const result = await rebuild()
    console.log(`search index ${result.index}: ${result.count} documents in ${Date.now() - started} ms`)
  }
  console.log(`load database ready: ${url.replace(/\/\/[^@]*@/, "//")}`)
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
