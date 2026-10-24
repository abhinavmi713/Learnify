const { escapeHtml } = require("../../utils/escapeHtml")

exports.contactUsEmail = (
  email,
  firstname,
  lastname,
  message,
  phoneNo,
  countrycode
) => {
  email = escapeHtml(email)
  firstname = escapeHtml(firstname)
  lastname = escapeHtml(lastname)
  message = escapeHtml(message)
  phoneNo = escapeHtml(phoneNo)
  return `<!DOCTYPE html>
  <html>
  
  <head>
      <meta charset="UTF-8">
      <title>Contact Form Confirmation</title>
      <style>
          body {
              background-color: #ffffff;
              font-family: Arial, sans-serif;
              font-size: 16px;
              line-height: 1.4;
              color: #333333;
              margin: 0;
              padding: 0;
          }
  
  
          .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
          }
  
          .logo {
              max-width: 200px;
              margin-bottom: 20px;
          }
  
          .message {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 20px;
          }
  
          .body {
              font-size: 16px;
              margin-bottom: 20px;
          }
  
          .cta {
              display: inline-block;
              padding: 10px 20px;
              background-color: #FFD60A;
              color: #000000;
              text-decoration: none;
              border-radius: 5px;
              font-size: 16px;
              font-weight: bold;
              margin-top: 20px;
          }
  
          .support {
              font-size: 14px;
              color: #999999;
              margin-top: 20px;
          }
  
          .highlight {
              font-weight: bold;
          }

          .logo-text {
              display: inline-block;
              font-size: 28px;
              font-weight: 800;
              color: #000000;
              text-decoration: none;
              margin-bottom: 20px;
          }

          .logo-text span {
              color: #FFD60A;
          }
      </style>

  </head>

  <body>
      <div class="container">
          <a href="${process.env.CLIENT_URL || "http://localhost:3000"}" class="logo-text">Learn<span>i</span>fy.</a>
          <div class="message">Contact Form Confirmation</div>
          <div class="body">
              <p>Dear ${firstname} ${lastname},</p>
              <p>Thank you for contacting us. We have received your message and will respond to you as soon as possible.
              </p>
              <p>Here are the details you provided:</p>
              <p>Name: ${firstname} ${lastname}</p>
              <p>Email: ${email}</p>
              <p>Phone Number: ${phoneNo}</p>
              <p>Message: ${message}</p>
              <p>We appreciate your interest and will get back to you shortly. </p>
          </div>
          <div class="support">If you have any further questions or need immediate assistance, please feel free to reach
              out to us at <a href="mailto:support@learnify.com">support@learnify.com</a>. We are here to help!</div>
      </div>
  </body>
  
  </html>`
}
