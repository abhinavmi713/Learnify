// // // Importing necessary modules and packages
// // const express = require("express");
// // const app = express();
// // const userRoutes = require("./routes/user");
// // const profileRoutes = require("./routes/profile");
// // const courseRoutes = require("./routes/Course");
// // const paymentRoutes = require("./routes/Payments");
// // const contactUsRoute = require("./routes/Contact");
// // const database = require("./config/database");
// // const cookieParser = require("cookie-parser");
// // const cors = require("cors");
// // const { cloudinaryConnect } = require("./config/cloudinary");
// // const fileUpload = require("express-fileupload");
// // const dotenv = require("dotenv");

// // // Setting up port number
// // const PORT = process.env.PORT || 4000;

// // // Loading environment variables from .env file
// // dotenv.config();

// // // Connecting to database
// // database.connect();
 
// // // Middlewares
// // app.use(express.json());
// // app.use(cookieParser());
// // app.use(
// // 	cors({
// // 		origin: "*",
// // 		credentials: true,
// // 	})
// // );
// // app.use(
// // 	fileUpload({
// // 		useTempFiles: true,
// // 		tempFileDir: "/tmp/",
// // 	})
// // );

// // // Connecting to cloudinary
// // cloudinaryConnect();

// // // Setting up routes
// // app.use("/api/v1/auth", userRoutes);
// // app.use("/api/v1/profile", profileRoutes);
// // app.use("/api/v1/course", courseRoutes);
// // app.use("/api/v1/payment", paymentRoutes);
// // app.use("/api/v1/reach", contactUsRoute);

// // // Testing the server
// // app.get("/", (req, res) => {
// // 	return res.json({
// // 		success: true,
// // 		message: "Your server is up and running ...",
// // 	});
// // });

// // // Listening to the server
// // app.listen(PORT, () => {
// // 	console.log(`App is listening at ${PORT}`);
// // });

// // // End of code.

// // Importing necessary modules and packages
// const express = require("express");
// const app = express();

// const userRoutes = require("./routes/user");
// const profileRoutes = require("./routes/profile");
// const courseRoutes = require("./routes/Course");
// const categoryRoutes = require("./routes/Category"); // ✅ ADDED THIS LINE
// const paymentRoutes = require("./routes/Payments");
// const contactUsRoute = require("./routes/Contact");
// const chatBotRoute = require("./routes/chatbot");

// const database = require("./config/database");
// const cookieParser = require("cookie-parser");
// const cors = require("cors");
// const { cloudinaryConnect } = require("./config/cloudinary");
// const fileUpload = require("express-fileupload");
// const dotenv = require("dotenv");

// // Load environment variables
// dotenv.config();

// // Set up port
// const PORT = process.env.PORT || 4000;

// // Connect to the database
// database.connect();

// // Middlewares
// app.use(express.json());
// app.use(cookieParser());
// app.use(
//   cors({
//     origin: "*",
//     credentials: true,
//   })
// );
// app.use(
//   fileUpload({
//     useTempFiles: true,
//     tempFileDir: "/tmp/",
//   })
// );
// app.use("/chatbot", chatBotRoute);

// // Connect to Cloudinary
// cloudinaryConnect();

// // Mount routes
// app.use("/api/v1/auth", userRoutes);
// app.use("/api/v1/profile", profileRoutes);
// app.use("/api/v1/course", courseRoutes);
// app.use("/api/v1/category", categoryRoutes); // ✅ ADDED THIS LINE
// app.use("/api/v1/payment", paymentRoutes);
// app.use("/api/v1/reach", contactUsRoute);

// // Test route
// app.get("/", (req, res) => {
//   return res.json({
//     success: true,
//     message: "Your server is up and running ...",
//   });
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`App is listening at ${PORT}`);
// });


// // Load environment variables
// require("dotenv").config();


// // Import necessary modules
// const express = require("express");
// const app = express();
// const cors = require("cors");
// const cookieParser = require("cookie-parser");
// const fileUpload = require("express-fileupload");

// // Import configurations
// const database = require("./config/database");
// const { cloudinaryConnect } = require("./config/cloudinary");

// // Import routes
// const userRoutes = require("./routes/user");
// const profileRoutes = require("./routes/profile");
// const courseRoutes = require("./routes/Course");
// const paymentRoutes = require("./routes/Payments");
// const contactUsRoute = require("./routes/Contact");
// const chatBotRoute = require("./routes/chatbot");
// app.use("/api/v1/chatbot", chatBotRoute); // ✅ NEW

// // Connect to MongoDB
// database.connect();

// // Middlewares

// app.use(express.json());
// app.use(cookieParser());
// app.use(
//   cors({
//     origin: "*", // Or your frontend: "http://localhost:3000"
//     credentials: true,
//   })
// );
// app.use(
//   fileUpload({
//     useTempFiles: true,
//     tempFileDir: "/tmp/",
//   })
// );

// // Connect to Cloudinary
// cloudinaryConnect();

// // Routes
// app.use("/api/v1/auth", userRoutes);
// app.use("/api/v1/profile", profileRoutes);
// app.use("/api/v1/course", courseRoutes);
// app.use("/api/v1/payment", paymentRoutes);
// app.use("/api/v1/reach", contactUsRoute);
// app.use("/chatbot", chatBotRoute); // ✅ New ChatBot route

// // Health check route
// app.get("/", (req, res) => {
//   return res.json({
//     success: true,
//     message: "Your server is up and running ...",
//   });
// });

// // Start server
// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => {
//   console.log(`Server listening on port ${PORT}`);
// });


// server/index.js

// Importing necessary modules and packages
const express = require("express");
const app = express();

const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const fileUpload = require("express-fileupload");

// Load environment variables
dotenv.config();

// Set up port
const PORT = process.env.PORT || 4000;

// Import routes
const userRoutes = require("./routes/user");
const profileRoutes = require("./routes/profile");
const courseRoutes = require("./routes/Course");
const categoryRoutes = require("./routes/Category");
const paymentRoutes = require("./routes/Payments");
const contactUsRoute = require("./routes/Contact");
const chatBotRoute = require("./routes/chatbot"); // ✅ Chatbot route

// Import config files
const database = require("./config/database");
const { cloudinaryConnect } = require("./config/cloudinary");

// Connect to the database
database.connect();

// Middleware setup
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "*", // OR replace "*" with "http://localhost:3000" for frontend dev
    credentials: true,
  })
);
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// Connect to Cloudinary
cloudinaryConnect();

// Mount routes
app.use("/api/v1/auth", userRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/course", courseRoutes);
app.use("/api/v1/category", categoryRoutes);
app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/reach", contactUsRoute);
app.use("/chatbot", chatBotRoute); // ✅ ChatBot route mounted

// Root test route
app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Your server is up and running ...",
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`App is listening at http://localhost:${PORT}`);
});
