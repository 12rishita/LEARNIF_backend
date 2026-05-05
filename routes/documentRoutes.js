import express from "express";
import {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
  // updateDocument,
} from "../controllers/documentController.js";

import protect from "../middleware/auth.js";
import upload from "../config/multer.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Upload document
router.post("/upload", upload.single("file"), uploadDocument);

// Get all documents
router.get("/", getDocuments);

// Get single document
router.get("/:id", getDocument);

// Delete document
router.delete("/:id", deleteDocument);

// Update document
// router.put("/:id", updateDocument);

export default router;
