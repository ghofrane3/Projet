import express from "express";
import User from "../models/User.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  if (!req.body || !req.body.email) {
    return res.status(400).json({ message: "Email requis" });
  }

  const user = await User.findOne({ email: req.body.email });
  if (!user)
    return res.status(401).json({ message: "Utilisateur non trouvé" });

  res.json({ message: "Login OK", user });
});


export default router;
