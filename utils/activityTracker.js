import ActivityEvent from "../models/ActivityEvent.js";

export const recordActivity = async ({
  userId,
  documentId = null,
  type,
  value = 1,
  score = null,
  metadata = {},
}) => {
  if (!userId || !type) return null;

  try {
    return await ActivityEvent.create({
      userId,
      documentId,
      type,
      value,
      score,
      metadata,
    });
  } catch (error) {
    console.error("Activity tracking failed:", error.message);
    return null;
  }
};
