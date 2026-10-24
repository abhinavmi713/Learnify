// Business-specific details used across the legal pages. Change them here.
// IMPORTANT: this text describes what the app actually does today, but it is
// a starting point, not legal advice — have a lawyer review it (and set the
// refund terms to what you really intend to honour) before launching.
export const LEGAL_CONFIG = {
  companyName: "Learnify",
  supportEmail: "support@learnify.com",
  refundWindowDays: 7,
  refundMaxProgressPercent: 25,
  lastUpdated: "7 October 2026",
}

const { companyName, supportEmail, refundWindowDays, refundMaxProgressPercent } = LEGAL_CONFIG

export const LEGAL_DOCUMENTS = {
  terms: {
    title: "Terms of Service",
    intro: `These terms govern your use of ${companyName}. By creating an account or using the platform you agree to them.`,
    sections: [
      {
        heading: "Accounts",
        body: [
          "You must provide accurate information and keep your password confidential. You are responsible for activity under your account.",
          "You choose a Student or Instructor account when you sign up. We may suspend or deactivate accounts that violate these terms.",
        ],
      },
      {
        heading: "Students",
        body: [
          "Purchasing a course gives you a personal, non-transferable licence to view it for your own learning. You may not copy, resell, or share course content or your login.",
          "Certificates are issued automatically when you complete every lecture and pass every quiz in a course. They can be verified publicly through their certificate ID.",
        ],
      },
      {
        heading: "Instructors",
        body: [
          "You keep ownership of the content you upload and grant us a licence to host and deliver it to enrolled students. You confirm you have the rights to everything you upload.",
          "Courses are reviewed before they are published. We may reject or remove a course that is inaccurate, infringing, or low quality.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Do not post unlawful, abusive, or misleading content in discussions, reviews or notes, attempt to access other users' data, or interfere with the platform.",
        ],
      },
      {
        heading: "AI assistant",
        body: [
          "The learning assistant and AI authoring tools are provided for convenience. Their output can be wrong — verify anything important.",
        ],
      },
      {
        heading: "Payments",
        body: [
          "Prices are shown in Indian rupees. Payments are processed by Razorpay; we do not store your card details. Refunds are covered by our Refund Policy.",
        ],
      },
      {
        heading: "Liability and changes",
        body: [
          "The platform is provided “as is”. To the extent permitted by law we are not liable for indirect or consequential losses. We may update these terms; continued use after a change means you accept it.",
        ],
      },
      { heading: "Contact", body: [`Questions about these terms: ${supportEmail}.`] },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    intro: `This explains what personal data ${companyName} collects, why, and the choices you have.`,
    sections: [
      {
        heading: "What we collect",
        body: [
          "Account data: name, email address, and a securely hashed password (we never store your password in readable form). Optional profile details you add: date of birth, gender, phone number, about text, profile picture.",
          "Learning data: courses you are enrolled in, lecture progress and playback position, quiz attempts, certificates, notes, discussion posts, reviews, wishlist and cart.",
          "Payment data: order and payment identifiers and amounts. Card or UPI details are entered with Razorpay and never reach our servers.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To run your account and courses, process payments, send transactional emails (verification codes, enrolment and payment confirmations, password changes), issue and verify certificates, and keep the platform secure.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "Service providers that operate the platform on our behalf: Razorpay (payments), Cloudinary (image and video hosting), our email delivery provider, and Google (the AI learning assistant — your chat message and, when you are viewing a course, that course's title, description and lecture titles are sent to Google's Gemini API to generate a reply).",
          "Instructors see the names of students who post in their course discussions. Certificate verification pages show the holder's name and course to anyone who has the certificate ID. We do not sell your data.",
        ],
      },
      {
        heading: "Retention and deletion",
        body: [
          "You can delete your account from Settings. It is deactivated immediately and you are signed out everywhere. We retain the underlying records so a mistaken deletion can be reversed.",
          `To request a copy of your data, or permanent erasure of a deleted account, contact ${supportEmail}.`,
        ],
      },
      {
        heading: "Security",
        body: [
          "Passwords are hashed, traffic is encrypted in transit, repeated failed logins lock the account temporarily, and changing your password signs you out of every other session.",
        ],
      },
      {
        heading: "Cookies and local storage",
        body: [
          "See our Cookie Policy. We use only what is needed to keep you signed in and remember your cart.",
        ],
      },
      { heading: "Contact", body: [`Privacy questions: ${supportEmail}.`] },
    ],
  },

  refund: {
    title: "Refund Policy",
    intro: "We want you to be happy with what you buy. Here is how refunds work.",
    sections: [
      {
        heading: "Eligibility",
        body: [
          `You can request a refund within ${refundWindowDays} days of purchase if you have completed less than ${refundMaxProgressPercent}% of the course.`,
          "Courses bought with a 100%-off coupon or at no cost are not refundable because nothing was charged.",
        ],
      },
      {
        heading: "How to request one",
        body: [
          `Email ${supportEmail} from your account email with the course name and your payment ID (it is in your payment confirmation email).`,
        ],
      },
      {
        heading: "How refunds are paid",
        body: [
          "Approved refunds go back to the original payment method through Razorpay and usually take 5–10 business days to appear. When a refund is issued, your access to that course is removed.",
        ],
      },
      {
        heading: "Course problems",
        body: [
          "If a course is materially different from its description or content is broken, tell us — we will fix it or refund you regardless of the window above.",
        ],
      },
    ],
  },

  cookies: {
    title: "Cookie Policy",
    intro: `${companyName} uses a small amount of browser storage that is strictly necessary to work. We do not use advertising or third-party tracking cookies.`,
    sections: [
      {
        heading: "What is stored",
        body: [
          "Sign-in: a session token (in your browser's local storage, and an authentication cookie) so you stay logged in for up to 24 hours.",
          "Cart: the courses in your cart and their total, so they survive a page reload.",
        ],
      },
      {
        heading: "Third parties",
        body: [
          "When you pay, Razorpay's checkout may set its own cookies to process and secure the payment. Videos and images are delivered from Cloudinary.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          "You can clear this storage any time in your browser settings; you will simply be signed out and your cart emptied.",
        ],
      },
    ],
  },
}
