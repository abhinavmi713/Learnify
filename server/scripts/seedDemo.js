// Demo catalog for local testing and demos.
//
//   node scripts/seedDemo.js           add the demo data (safe to re-run)
//   node scripts/seedDemo.js --clean   remove exactly what this script added
//
// Uses the demo instructor (instructor@learnify.com) and Cloudinary's public
// demo media, so no uploads are needed. Re-running skips anything that exists.
require("dotenv").config()
const mongoose = require("mongoose")

const User = require("../models/User")
const Course = require("../models/Course")
const Section = require("../models/Section")
const SubSection = require("../models/Subsection")
const Category = require("../models/Category")
const Quiz = require("../models/Quiz")
const Coupon = require("../models/Coupon")
const LearningPath = require("../models/LearningPath")
const LiveClass = require("../models/LiveClass")

const IMG = (id) => `https://res.cloudinary.com/demo/image/upload/${id}.jpg`
const VID = (id) => `https://res.cloudinary.com/demo/video/upload/${id}.mp4`

const COURSES = [
  {
    courseName: "JavaScript Fundamentals",
    category: "Web Development",
    price: 499,
    status: "Published",
    thumbnail: IMG("cld-sample-2"),
    courseDescription: "Variables, functions, arrays, objects and the DOM, from zero to building small interactive pages.",
    whatYouWillLearn: "- Write modern JavaScript (ES2023)\n- Work with arrays and objects\n- Manipulate the DOM\n- Debug with DevTools",
    tag: ["javascript", "web", "beginner"],
    instructions: ["A laptop with a modern browser", "No prior programming needed"],
    sections: [
      { name: "Getting started", lectures: [["Why JavaScript?", "dog", 13], ["Setting up your editor", "elephants", 30]] },
      { name: "Core language", lectures: [["Functions and scope", "sea_turtle", 25], ["Arrays and objects", "ski_jump", 15]] },
    ],
    quiz: {
      title: "JavaScript basics check",
      questions: [
        { questionText: "Which keyword declares a block-scoped variable?", options: ["var", "let", "function", "this"], correctOptionIndex: 1 },
        { questionText: "What does Array.prototype.map return?", options: ["undefined", "The same array", "A new array", "A number"], correctOptionIndex: 2 },
        { questionText: "Which value is falsy?", options: ["'0'", "[]", "0", "{}"], correctOptionIndex: 2 },
      ],
    },
  },
  {
    courseName: "Python for Data Analysis",
    category: "Data Science",
    price: 799,
    status: "Published",
    thumbnail: IMG("cld-sample-3"),
    courseDescription: "Load, clean and explore real datasets with pandas, then present what you find with clear charts.",
    whatYouWillLearn: "- pandas DataFrames\n- Cleaning messy data\n- Grouping and aggregation\n- Charts with matplotlib",
    tag: ["python", "pandas", "data"],
    instructions: ["Python 3.11+ installed", "Basic programming knowledge helps"],
    sections: [{ name: "pandas essentials", lectures: [["DataFrames in 10 minutes", "elephants", 30], ["Cleaning data", "dog", 13]] }],
  },
  {
    courseName: "UI Design Basics",
    category: "Mobile Development",
    price: 0,
    status: "Published",
    thumbnail: IMG("cld-sample-4"),
    courseDescription: "A free, practical introduction to layout, typography and colour for app and web interfaces.",
    whatYouWillLearn: "- Visual hierarchy\n- Choosing type and colour\n- Spacing systems",
    tag: ["design", "ui", "free"],
    instructions: ["Nothing to install"],
    sections: [{ name: "Foundations", lectures: [["Hierarchy and layout", "sea_turtle", 25]] }],
  },
  {
    courseName: "Docker in Practice",
    category: "Cloud Computing",
    price: 999,
    status: "Pending",
    thumbnail: IMG("cld-sample-5"),
    courseDescription: "Containerise a Node.js app, write a compose file and ship it. Submitted for review.",
    whatYouWillLearn: "- Images and containers\n- Dockerfiles\n- docker compose",
    tag: ["docker", "devops"],
    instructions: ["Docker Desktop installed"],
    sections: [{ name: "Containers", lectures: [["Your first container", "ski_jump", 15]] }],
  },
]

async function seed() {
  const instructor = await User.findOne({ email: "instructor@learnify.com" })
  if (!instructor) throw new Error("Demo instructor not found (instructor@learnify.com)")
  const admin = await User.findOne({ accountType: "Admin" })

  const created = []
  for (const spec of COURSES) {
    let course = await Course.findOne({ courseName: spec.courseName })
    if (course) {
      created.push(course)
      continue
    }
    const category = await Category.findOne({ name: spec.category })
    const sectionIds = []
    for (const sec of spec.sections) {
      const lectureIds = []
      for (const [title, video, seconds] of sec.lectures) {
        const lecture = await SubSection.create({ title, description: `${title} (demo lecture)`, videoUrl: VID(video), timeDuration: String(seconds) })
        lectureIds.push(lecture._id)
      }
      const section = await Section.create({ sectionName: sec.name, subSection: lectureIds })
      sectionIds.push(section._id)
    }
    course = await Course.create({
      courseName: spec.courseName,
      courseDescription: spec.courseDescription,
      instructor: instructor._id,
      whatYouWillLearn: spec.whatYouWillLearn,
      courseContent: sectionIds,
      price: spec.price,
      thumbnail: spec.thumbnail,
      tag: spec.tag,
      category: category?._id,
      instructions: spec.instructions,
      status: spec.status,
      studentsEnroled: [],
    })
    if (category) await Category.updateOne({ _id: category._id }, { $addToSet: { courses: course._id } })
    await User.updateOne({ _id: instructor._id }, { $addToSet: { courses: course._id } })
    if (spec.quiz) await Quiz.create({ course: course._id, title: spec.quiz.title, passingScore: 60, questions: spec.quiz.questions })
    created.push(course)
    console.log(`course: ${spec.courseName} (${spec.status}, ₹${spec.price})`)
  }

  if (!(await Coupon.findOne({ code: "WELCOME20" }))) {
    await Coupon.create({ code: "WELCOME20", discountType: "percentage", discountValue: 20, maxUses: 100, active: true, createdBy: admin?._id })
    console.log("coupon: WELCOME20 (20% off)")
  }

  const published = created.filter((c) => c.status === "Published")
  if (!(await LearningPath.findOne({ title: "Web Developer Starter Path" }))) {
    await LearningPath.create({
      title: "Web Developer Starter Path",
      description: "Design basics, then JavaScript: a guided start into building for the web.",
      courses: published.filter((c) => ["UI Design Basics", "JavaScript Fundamentals"].includes(c.courseName)).map((c) => c._id),
      createdBy: admin?._id,
    })
    console.log("learning path: Web Developer Starter Path")
  }

  const js = created.find((c) => c.courseName === "JavaScript Fundamentals")
  if (js && !(await LiveClass.findOne({ title: "JavaScript Q&A office hours" }))) {
    await LiveClass.create({
      course: js._id,
      title: "JavaScript Q&A office hours",
      description: "Bring your questions about functions and scope.",
      meetingLink: "https://meet.google.com/abc-defg-hij",
      scheduledAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    })
    console.log("live class: JavaScript Q&A office hours")
  }
}

async function clean() {
  const names = COURSES.map((c) => c.courseName)
  const courses = await Course.find({ courseName: { $in: names } })
  for (const course of courses) {
    const sections = await Section.find({ _id: { $in: course.courseContent } })
    await SubSection.deleteMany({ _id: { $in: sections.flatMap((s) => s.subSection) } })
    await Section.deleteMany({ _id: { $in: course.courseContent } })
    await Quiz.deleteMany({ course: course._id })
    await LiveClass.deleteMany({ course: course._id })
    await Category.updateMany({}, { $pull: { courses: course._id } })
    await User.updateMany({}, { $pull: { courses: course._id } })
    await Course.deleteOne({ _id: course._id })
  }
  await Coupon.deleteOne({ code: "WELCOME20" })
  await LearningPath.deleteOne({ title: "Web Developer Starter Path" })
  console.log(`removed ${courses.length} demo courses and their content`)
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URL)
  try {
    if (process.argv.includes("--clean")) await clean()
    else await seed()
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
