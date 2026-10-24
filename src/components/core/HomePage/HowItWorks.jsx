import { GraduationCap, PlayCircle, Search } from "lucide-react"

const steps = [
  {
    icon: Search,
    step: "01",
    title: "Find your course",
    description: "Browse by category or skill level and pick a course that matches your goal.",
  },
  {
    icon: PlayCircle,
    step: "02",
    title: "Learn by doing",
    description: "Work through lectures and projects at your own pace, on any device.",
  },
  {
    icon: GraduationCap,
    step: "03",
    title: "Finish and level up",
    description: "Complete the course, take the quiz, and earn a certificate you can share.",
  },
]

const HowItWorks = () => {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {steps.map(({ icon: Icon, step, title, description }) => (
        <div key={step} className="surface relative overflow-hidden p-7">
          <span className="pointer-events-none absolute -right-2 -top-6 font-display text-[110px] font-extrabold leading-none text-richblack-700">
            {step}
          </span>
          <div className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-50 text-richblack-900">
            <Icon size={24} />
          </div>
          <h3 className="relative mb-2 font-display text-xl font-bold text-richblack-5">
            {title}
          </h3>
          <p className="relative text-sm leading-relaxed text-richblack-300">{description}</p>
        </div>
      ))}
    </div>
  )
}

export default HowItWorks
