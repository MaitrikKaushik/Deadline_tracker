const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const User = require("../models/user");

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: "Google credential is required",
      });
    }

    // Verify the ID token received from Google
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const {
      sub: googleId,
      name,
      email,
      picture,
      email_verified,
    } = payload;

    // Make sure Google has verified the email
    if (!email || !email_verified) {
      return res.status(401).json({
        message: "Google email could not be verified",
      });
    }

    // Find existing user by Google ID
    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if the email already belongs to a user
      user = await User.findOne({ email });

      if (user) {
        // Link Google account to existing user
        user.googleId = googleId;
        user.name = name;
        user.picture = picture || "";

        await user.save();
      } else {
        // Create new user
        user = await User.create({
          googleId,
          name,
          email,
          picture: picture || "",
        });
      }
    }

    // Create our application's JWT
    const token = jwt.sign(
      {
        userId: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // Store JWT in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,

      secure: process.env.NODE_ENV === "production",

      sameSite:
        process.env.NODE_ENV === "production"
          ? "none"
          : "lax",

      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Google login successful",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);

    res.status(401).json({
      message: "Google authentication failed",
    });
  }
};

exports.logout = (req, res) => {
  res.clearCookie("token");

  res.json({
    message: "Logged out successfully",
  });
};

exports.getMe = async (req, res) => {
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        picture: req.user.picture,
      },
    });
  };