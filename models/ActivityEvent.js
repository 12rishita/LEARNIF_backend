import mongoose from "mongoose";

const activityEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "document_view",
        "study_session",
        "flashcard_review",
        "quiz_completed",
        "chat_question",
        "summary_generated",
        "concept_explained",
      ],
      required: true,
      index: true,
    },
    value: {
      type: Number,
      default: 1,
    },
    score: {
      type: Number,
      default: null,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

activityEventSchema.index({ userId: 1, createdAt: -1 });
activityEventSchema.index({ userId: 1, type: 1, createdAt: -1 });
activityEventSchema.index({ userId: 1, documentId: 1, createdAt: -1 });

const ActivityEvent = mongoose.model("ActivityEvent", activityEventSchema);

export default ActivityEvent;
