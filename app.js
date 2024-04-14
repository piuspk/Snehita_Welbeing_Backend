require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const app = express();
const cors = require("cors");
require("./db/conn");
const PORT = process.env.PORT || 8000;
const session = require("express-session");
const passport = require("passport");
const OAuth2Strategy = require("passport-google-oauth2").Strategy;
const userdb = require("./model/userSchema");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const BASE_URL = process.env.BASE_URL
app.use(cors({ credentials: true, origin: BASE_URL }));
app.use(express.json());
app.use(cookieParser());

const Appointment = require("./model/appointment");
const { authenticate } = require("./db/jwt.config");

const clienId = process.env.CLIENTID;
const clientSecret = process.env.CLIENTSECRET;

app.use(
  cors({
    origin: BASE_URL,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new OAuth2Strategy(
    {
      clientID: clienId,
      clientSecret: clientSecret,
      callbackURL: "/auth/google/callback",
      scope: ["profile", "email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log("profile", profile);
      try {
        // Check if the email is from the specific domain
        if (!profile.emails[0].value.endsWith("@iitrpr.ac.in")) {
          return done(
            new Error("Not allowed, Try to login with IIT Ropar institute id"),
            null
          );
        }

        let user = await userdb.findOne({ googleId: profile.id });

        if (!user) {
          user = new userdb({
            googleId: profile.id,
            displayName: profile.displayName,
            email: profile.emails[0].value,
            image: profile.photos[0].value,
          });

          await user.save();
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    const token = jwt.sign({ id: req.user.id }, "1123326285sfgdgvx", { expiresIn: "1h" });
    res.cookie("usertoken", token, { httpOnly: true });
    res.redirect(BASE_URL);
  }
);

app.get("/login/sucess", async (req, res) => {
  if (req.user) {
    res
      .status(200)
      .json({ message: "user logged in successfully", user: req.user });
  } else {
    res.status(400).json({ message: "not authorized" });
  }
});

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect(BASE_URL);
  });
});

const createAppointment = async (req, res) => {
  try {
    const token = req.cookies.usertoken;
    console.log("Token received:", token);
    const decoded = jwt.verify(token, "1123326285sfgdgvx");
    const userId = decoded.id;
    const {
      fullName,
      mobileNumber,
      emailAddress,
      appointmentDate,
      counselorName,
      appointmentSlot,
    } = req.body;
    const appointment = new Appointment({
      fullName,
      mobileNumber,
      emailAddress,
      appointmentDate,
      counselorName,
      appointmentSlot,
      userId,
    });
    await appointment.save();

    res.status(201).json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

const getAppointments = async (req, res) => {
  try {
    const token = req.cookies.usertoken;
    console.log("Token received:", token);
    const decoded = jwt.verify(token, "1123326285sfgdgvx");
    const userId = decoded.id;
    console.log(userId);
    const appointments = await Appointment.find({ userId: userId });
    res.json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};
const sendEmail = async (req, res) => {
    const formData = req.body;
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL,
            pass: process.env.PASSWORD
        }
    });

    // Map counselor names to their email addresses
    const counselorEmails = {
        "Deepak Phogat": "2021csb1123@iitrpr.ac.in",
        "Gargi Tiwari": "kumarchspiyush@gmail.com"
    };

    // Get the email address of the chosen counselor
    const counselorEmail = counselorEmails[formData.counselorName];

    // Construct a formatted string
    // let formattedText = '';
    // for (let key in formData) {
    //     formattedText += `<b>${key}:</b>&nbsp;&nbsp;${formData[key]}<br><br>`;
    // }
    let formattedText = '';
    let text = `Hello  ${formData.counselorName}, <br> The following person has taken an appointment from you, please find the required details <br> <br> `
    formattedText+=text;
    
    for (let key in formData) {
        // Exclude the counselorName from the email
        if (key !== 'counselorName') {
            formattedText += `<b>${key}:</b>&nbsp;&nbsp;${formData[key]}<br><br>`;
        }
    }

    let info = await transporter.sendMail({
        from: '"Piyush" pushkr.1090@gmail.com', // sender address
        to: counselorEmail, // send to the chosen counselor
        subject: "New Counselling Appointment", // Subject line
        html: formattedText, // formatted text body
    });
    res.json({ message: 'Email sent' });
}

const getBookedSlots = async (req, res) => {
  try {
    const { counselorName, appointmentDate } = req.query;
    const appointments = await Appointment.find({ 
      counselorName: counselorName, 
      appointmentDate: new Date(appointmentDate) 
    });
    const bookedSlots = appointments.map(appointment => appointment.appointmentSlot);
    res.json(bookedSlots);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};




app.post("/create", authenticate, createAppointment);
app.get("/data", authenticate, getAppointments);
app.post("/send-email", authenticate, sendEmail);
app.get("/bookedSlots", authenticate, getBookedSlots);

app.listen(PORT, () => {
  console.log(`server start at port no ${PORT}`);
});