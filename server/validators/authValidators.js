const { z } = require("zod")

// A minimum length requirement didn't exist anywhere before this — signup and
// password-reset would happily accept a 1-character password since the
// controllers only checked for truthiness, not strength.
const password = z.string().min(8, "Password must be at least 8 characters")

const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    email: z.string().trim().email("Enter a valid email address"),
    password,
    confirmPassword: z.string(),
    accountType: z.enum(["Student", "Instructor"]),
    contactNumber: z.string().trim().optional().or(z.literal("")),
    otp: z.string().trim().min(1, "OTP is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password and Confirm Password do not match",
    path: ["confirmPassword"],
  })

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

const sendOtpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
})

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Old password is required"),
  newPassword: password,
})

const resetPasswordTokenSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
})

const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
    token: z.string().min(1, "Reset token is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password and Confirm Password do not match",
    path: ["confirmPassword"],
  })

module.exports = {
  signupSchema,
  loginSchema,
  sendOtpSchema,
  changePasswordSchema,
  resetPasswordTokenSchema,
  resetPasswordSchema,
}
