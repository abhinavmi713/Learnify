const fs = require("fs")
const os = require("os")
const fileUpload = require("express-fileupload")

// Parses multipart uploads. Only routes that take files use it, always after
// `auth` and the role check, so anonymous requests can never write to disk.
const parser = (maxBytes, label) =>
  fileUpload({
    useTempFiles: true,
    tempFileDir: os.tmpdir(),
    limits: { fileSize: maxBytes },
    abortOnLimit: true,
    responseOnLimit: `File is too large. Maximum upload size is ${label}.`,
  })

// Temp files are only needed while the request runs.
function removeTempFiles(req) {
  for (const value of Object.values(req.files || {})) {
    for (const file of [].concat(value)) {
      if (file.tempFilePath) fs.unlink(file.tempFilePath, () => {})
    }
  }
}

const withCleanup = (parse) => (req, res, next) => {
  res.once("close", () => removeTempFiles(req))
  return parse(req, res, next)
}

exports.uploadImage = withCleanup(parser(20 * 1024 * 1024, "20MB"))
// Videos normally go straight to Cloudinary. This is the through-the-server path.
exports.uploadVideo = withCleanup(parser(512 * 1024 * 1024, "512MB"))
