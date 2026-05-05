import express from "express";
import {
  getDashboard,
  trackStudySession,
} from "../controllers/progressController.js";
import protect from "../middleware/auth.js";

const router = express.Router();

// All routes are protected
router.use(protect);

router.get("/dashboard", getDashboard);
router.post("/study-session", trackStudySession);

export default router;
