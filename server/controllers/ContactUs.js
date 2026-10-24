const { enqueueEvent } = require("../events/outbox")
const { EVENTS } = require("../events/types")

exports.contactUsController = async (req, res) => {
  const { email, firstname, lastname, message, phoneNo, countrycode } = req.body
  try {
    // The confirmation email is sent by a worker; the form returns immediately.
    await enqueueEvent(EVENTS.CONTACT_SUBMITTED, { email, firstname, lastname, message, phoneNo, countrycode })
    return res.json({
      success: true,
      message: "Email send successfully",
    })
  } catch (error) {
    console.log("Error", error)
    console.log("Error message :", error.message)
    return res.json({
      success: false,
      message: "Something went wrong...",
    })
  }
}
