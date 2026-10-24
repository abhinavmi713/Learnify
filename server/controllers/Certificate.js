const { PDFDocument, rgb, StandardFonts } = require("pdf-lib")
const Certificate = require("../models/Certificate")
const Course = require("../models/Course")
const User = require("../models/User")

// Student: list their own earned certificates.
exports.getMyCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find({ user: req.user.id })
      .populate("course", "courseName")
      .sort({ issuedAt: -1 })
    return res.status(200).json({ success: true, data: certificates })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to fetch certificates" })
  }
}

// Public: verify a certificate by its ID — no auth required, this is the
// whole point of a certificate being independently checkable.
exports.verifyCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params
    const certificate = await Certificate.findOne({ certificateId })
      .populate("user", "firstName lastName")
      .populate("course", "courseName")

    if (!certificate) {
      return res.status(404).json({ success: false, valid: false, message: "Certificate not found" })
    }

    return res.status(200).json({
      success: true,
      valid: true,
      data: {
        studentName: `${certificate.user.firstName} ${certificate.user.lastName}`,
        courseName: certificate.course.courseName,
        issuedAt: certificate.issuedAt,
        certificateId: certificate.certificateId,
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to verify certificate" })
  }
}

// Student: download their certificate as a PDF, generated on demand.
exports.downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params
    const certificate = await Certificate.findOne({ certificateId })
    if (!certificate) {
      return res.status(404).json({ success: false, message: "Certificate not found" })
    }
    if (certificate.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "This certificate is not yours" })
    }

    const [user, course] = await Promise.all([
      User.findById(certificate.user),
      Course.findById(certificate.course),
    ])

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([842, 595]) // A4 landscape
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const { width, height } = page.getSize()

    page.drawRectangle({
      x: 20,
      y: 20,
      width: width - 40,
      height: height - 40,
      borderColor: rgb(1, 0.478, 0.149), // brand orange
      borderWidth: 3,
    })

    page.drawText("Certificate of Completion", {
      x: width / 2 - 200,
      y: height - 130,
      size: 28,
      font,
      color: rgb(0.1, 0.1, 0.15),
    })

    page.drawText("This certifies that", {
      x: width / 2 - 70,
      y: height - 200,
      size: 14,
      font: regularFont,
      color: rgb(0.3, 0.3, 0.3),
    })

    const studentName = `${user.firstName} ${user.lastName}`
    page.drawText(studentName, {
      x: width / 2 - font.widthOfTextAtSize(studentName, 26) / 2,
      y: height - 240,
      size: 26,
      font,
      color: rgb(0.05, 0.05, 0.1),
    })

    page.drawText("has successfully completed the course", {
      x: width / 2 - 130,
      y: height - 280,
      size: 14,
      font: regularFont,
      color: rgb(0.3, 0.3, 0.3),
    })

    const courseName = course.courseName
    page.drawText(courseName, {
      x: width / 2 - font.widthOfTextAtSize(courseName, 20) / 2,
      y: height - 315,
      size: 20,
      font,
      color: rgb(0.05, 0.05, 0.1),
    })

    page.drawText(`Issued on ${new Date(certificate.issuedAt).toLocaleDateString()}`, {
      x: 60,
      y: 60,
      size: 10,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    page.drawText(`Certificate ID: ${certificate.certificateId}`, {
      x: width - 300,
      y: 60,
      size: 10,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    const pdfBytes = await pdfDoc.save()

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="certificate-${certificate.certificateId}.pdf"`
    )
    return res.send(Buffer.from(pdfBytes))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: "Failed to generate certificate" })
  }
}
