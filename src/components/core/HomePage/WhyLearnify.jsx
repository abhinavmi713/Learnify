import { Award, Clock, Sparkles, Users } from "lucide-react"

const features = [
  {
    icon: Sparkles,
    title: "Structured learning paths",
    description:
      "Every course is broken into clear sections and lectures so you always know what is next. Follow a guided path across several courses to reach a bigger goal.",
    big: true,
  },
  {
    icon: Users,
    title: "Taught by practitioners",
    description: "Learn from instructors who build the things they teach.",
  },
  {
    icon: Clock,
    title: "Learn at your own pace",
    description: "Lifetime access to every course you enroll in.",
  },
  {
    icon: Award,
    title: "Track real progress",
    description: "Quizzes, completion tracking and certificates you can share.",
  },
]

const WhyLearnify = () => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-2">
    {features.map(({ icon: Icon, title, description, big }) => (
      <div
        key={title}
        className={`rounded-card p-7 transition-transform duration-300 hover:-translate-y-1 ${
          big
            ? "flex flex-col justify-between bg-yellow-50 text-richblack-900 md:row-span-2"
            : "surface"
        }`}
      >
        <div
          className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${
            big ? "bg-richblack-900/15 text-richblack-900" : "bg-richblue-300/15 text-richblue-300"
          }`}
        >
          <Icon size={24} />
        </div>
        <div>
          <h3 className={`font-display text-xl font-bold ${big ? "" : "text-richblack-5"}`}>
            {title}
          </h3>
          <p className={`mt-2 text-sm leading-relaxed ${big ? "opacity-85" : "text-richblack-300"}`}>
            {description}
          </p>
        </div>
      </div>
    ))}
  </div>
)

export default WhyLearnify
