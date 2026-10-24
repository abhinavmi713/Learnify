import { Award, BookOpen, MessageSquare, ShieldCheck, Target, Users } from "lucide-react"
import { Link } from "react-router-dom"

import FoundingStory from "../assets/Images/FoundingStory.png"
import BannerImage1 from "../assets/Images/aboutus1.webp"
import BannerImage2 from "../assets/Images/aboutus2.webp"
import BannerImage3 from "../assets/Images/aboutus3.webp"
import Footer from "../components/Common/Footer"
import ContactFormSection from "../components/core/AboutPage/ContactFormSection"
import HighlightText from "../components/core/HomePage/HighlightText"

const OFFERINGS = [
  {
    icon: BookOpen,
    title: "Structured courses",
    text: "Sections and lectures with resume-where-you-left-off video, notes and progress tracking.",
  },
  {
    icon: Target,
    title: "Quizzes that count",
    text: "Instructors build quizzes per course; you get instant scoring and can retake them.",
  },
  {
    icon: Award,
    title: "Verifiable certificates",
    text: "Finish a course and get a certificate with a public link anyone can use to verify it.",
  },
  {
    icon: MessageSquare,
    title: "Lecture discussions",
    text: "Ask questions on any lecture and get answers from the instructor and other learners.",
  },
  {
    icon: Users,
    title: "Learning paths",
    text: "Curated sequences of courses that take you from the basics to a real skill.",
  },
  {
    icon: ShieldCheck,
    title: "Reviewed content",
    text: "Every course is checked by an admin before it is published to learners.",
  },
]

const About = () => {
  return (
    <div>
      {/* Hero */}
      <section className="hero-glow">
        <div className="mx-auto w-11/12 max-w-maxContent py-16 text-center lg:py-24">
          <p className="text-sm font-semibold uppercase tracking-wide text-yellow-50">About Learnify</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-richblack-5 sm:text-6xl">
            Learning that respects your time and
            <HighlightText text={"rewards your effort"} />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-richblack-200">
            Learnify is an online learning platform built around finishing what you start: clear
            courses, honest progress tracking, and credentials that mean something.
          </p>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-3 gap-3 sm:gap-5">
            {[BannerImage1, BannerImage2, BannerImage3].map((src, i) => (
              <img
                key={src}
                src={src}
                alt=""
                className={`aspect-[3/4] w-full rounded-2xl object-cover shadow-card ${
                  i === 1 ? "sm:translate-y-8" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="mx-auto grid w-11/12 max-w-maxContent items-center gap-12 py-24 lg:grid-cols-2">
        <div>
          <h2 className="section_heading">Why we built it</h2>
          <p className="mt-5 leading-relaxed text-richblack-200">
            Most online courses are easy to start and hard to finish. We wanted a place where
            learners can see exactly where they are, instructors can understand how their
            students are doing, and a finished course ends in something you can show to others.
          </p>
          <p className="mt-4 leading-relaxed text-richblack-200">
            That is why progress, quizzes, discussion and certificates are part of the platform
            itself rather than add-ons.
          </p>
        </div>
        <img
          src={FoundingStory}
          alt="Learners collaborating"
          className="w-full rounded-[2rem] border border-richblack-700 shadow-card"
        />
      </section>

      {/* What you get */}
      <section className="bg-richblack-800/60 py-20">
        <div className="mx-auto w-11/12 max-w-maxContent">
          <h2 className="section_heading mb-10 text-center">What you get on Learnify</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {OFFERINGS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="surface p-6 transition-transform hover:-translate-y-1">
                <span className="mb-4 inline-grid h-11 w-11 place-items-center rounded-xl bg-yellow-50 text-richblack-900">
                  <Icon size={22} />
                </span>
                <h3 className="font-display text-lg font-bold text-richblack-5">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-richblack-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="mx-auto w-11/12 max-w-maxContent py-24">
        <ContactFormSection />
      </section>

      <section className="mx-auto w-11/12 max-w-maxContent pb-24 text-center">
        <h2 className="section_heading">Ready to start?</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link to="/search" className="yellowButton">
            Browse courses
          </Link>
          <Link to="/signup" className="blackButton">
            Create a free account
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default About
