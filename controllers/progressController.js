import mongoose from "mongoose";

import ActivityEvent from "../models/ActivityEvent.js";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import { recordActivity } from "../utils/activityTracker.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date = new Date()) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const formatDayKey = (date) => date.toISOString().slice(0, 10);

const formatShortLabel = (date) =>
  date.toLocaleDateString("en-IN", { weekday: "short" });

const buildDailyRange = (days) => {
  const today = startOfDay();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - index - 1) * DAY_IN_MS);
    return {
      key: formatDayKey(date),
      label: formatShortLabel(date),
      date,
    };
  });
};

const buildHeatmapRange = (days) => {
  const today = startOfDay();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - index - 1) * DAY_IN_MS);
    return {
      key: formatDayKey(date),
      date,
      label: date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      }),
      shortDay: date.toLocaleDateString("en-IN", { weekday: "short" }),
    };
  });
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const computeStudyStreak = (activeKeys) => {
  const active = new Set(activeKeys);
  let streak = 0;
  let cursor = startOfDay();

  while (active.has(formatDayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_IN_MS);
  }

  return streak;
};

// @desc    Track a study session for a document
// @route   POST /api/progress/study-session
// @access  Private
export const trackStudySession = async (req, res, next) => {
  try {
    const { documentId, durationSeconds } = req.body;

    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid documentId",
        statusCode: 400,
      });
    }

    const numericDuration = Number(durationSeconds);

    if (!Number.isFinite(numericDuration) || numericDuration < 15) {
      return res.status(400).json({
        success: false,
        error: "Study session is too short to record",
        statusCode: 400,
      });
    }

    const document = await Document.findOne({
      _id: documentId,
      userId: req.user._id,
    }).select("_id");

    if (!document) {
      return res.status(404).json({
        success: false,
        error: "Document not found",
        statusCode: 404,
      });
    }

    const durationMinutes = Number((numericDuration / 60).toFixed(2));

    await recordActivity({
      userId: req.user._id,
      documentId: document._id,
      type: "study_session",
      value: durationMinutes,
      metadata: {
        durationSeconds: Math.round(numericDuration),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        documentId: document._id,
        durationMinutes,
      },
      message: "Study session recorded successfully",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user learning statistics
// @route   GET /api/progress/dashboard
// @access  Private
export const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const dailyRange = buildDailyRange(7);
    const heatmapRange = buildHeatmapRange(35);
    const analyticsStartDate = heatmapRange[0].date;

    const [documents, flashcardSets, quizzes, activityEvents, studySummary] = await Promise.all(
      [
        Document.find({ userId })
          .select("title status createdAt lastAccessed")
          .sort({ lastAccessed: -1, createdAt: -1 }),
        Flashcard.find({ userId }).select("documentId cards createdAt"),
        Quiz.find({ userId })
          .populate("documentId", "title")
          .sort({ completedAt: -1, createdAt: -1 }),
        ActivityEvent.find({
          userId,
          createdAt: { $gte: analyticsStartDate },
        })
          .select("type value score documentId createdAt metadata")
          .sort({ createdAt: 1 }),
        ActivityEvent.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              type: "study_session",
            },
          },
          {
            $group: {
              _id: null,
              totalStudyMinutes: { $sum: "$value" },
            },
          },
        ]),
      ]
    );

    const totalDocuments = documents.length;
    const totalFlashcardSets = flashcardSets.length;
    const totalQuizzes = quizzes.length;
    const completedQuizzes = quizzes.filter((quiz) => quiz.completedAt).length;

    let totalFlashcards = 0;
    let reviewedFlashcards = 0;
    let starredFlashcards = 0;

    for (const set of flashcardSets) {
      totalFlashcards += set.cards.length;
      reviewedFlashcards += set.cards.filter((card) => card.reviewCount > 0).length;
      starredFlashcards += set.cards.filter((card) => card.isStarred).length;
    }

    const completedQuizScores = quizzes
      .filter((quiz) => quiz.completedAt)
      .map((quiz) => quiz.score);

    const averageScore = completedQuizScores.length
      ? Math.round(
          completedQuizScores.reduce((sum, score) => sum + score, 0) /
            completedQuizScores.length
        )
      : 0;

    const dailyBuckets = dailyRange.reduce((acc, day) => {
      acc[day.key] = {
        date: day.key,
        label: day.label,
        studyMinutes: 0,
        flashcardReviews: 0,
        quizCompletions: 0,
        chatQuestions: 0,
      };
      return acc;
    }, {});

    const heatmapBuckets = heatmapRange.reduce((acc, day) => {
      acc[day.key] = {
        date: day.key,
        label: day.label,
        shortDay: day.shortDay,
        activityCount: 0,
      };
      return acc;
    }, {});

    const split = {
      reading: 0,
      flashcards: 0,
      quizzes: 0,
      chat: 0,
    };

    const activeDayKeys = new Set();
    const documentMetrics = new Map();

    const getDocumentMetric = (documentId) => {
      const key = documentId?.toString();
      if (!key) return null;

      if (!documentMetrics.has(key)) {
        documentMetrics.set(key, {
          documentId: key,
          title: "Untitled Document",
          studyMinutes: 0,
          flashcardReviews: 0,
          quizCount: 0,
          averageScore: 0,
          totalScore: 0,
          chatQuestions: 0,
          summaries: 0,
        });
      }

      return documentMetrics.get(key);
    };

    for (const document of documents) {
      const metric = getDocumentMetric(document._id);
      if (metric) metric.title = document.title;
    }

    for (const event of activityEvents) {
      const dayKey = formatDayKey(event.createdAt);
      activeDayKeys.add(dayKey);

      if (heatmapBuckets[dayKey]) {
        heatmapBuckets[dayKey].activityCount += 1;
      }

      if (event.documentId) {
        const metric = getDocumentMetric(event.documentId);

        if (metric) {
          switch (event.type) {
            case "study_session":
              metric.studyMinutes += event.value || 0;
              break;
            case "flashcard_review":
              metric.flashcardReviews += 1;
              break;
            case "quiz_completed":
              metric.quizCount += 1;
              metric.totalScore += event.score || 0;
              break;
            case "chat_question":
              metric.chatQuestions += 1;
              break;
            case "summary_generated":
              metric.summaries += 1;
              break;
            default:
              break;
          }
        }
      }

      if (dailyBuckets[dayKey]) {
        if (event.type === "study_session") {
          dailyBuckets[dayKey].studyMinutes += event.value || 0;
        }
        if (event.type === "flashcard_review") {
          dailyBuckets[dayKey].flashcardReviews += 1;
        }
        if (event.type === "quiz_completed") {
          dailyBuckets[dayKey].quizCompletions += 1;
        }
        if (event.type === "chat_question") {
          dailyBuckets[dayKey].chatQuestions += 1;
        }
      }

      switch (event.type) {
        case "study_session":
          split.reading += event.value || 0;
          break;
        case "flashcard_review":
          split.flashcards += 1;
          break;
        case "quiz_completed":
          split.quizzes += 1;
          break;
        case "chat_question":
          split.chat += 1;
          break;
        default:
          break;
      }
    }

    for (const metric of documentMetrics.values()) {
      metric.averageScore = metric.quizCount
        ? Math.round(metric.totalScore / metric.quizCount)
        : 0;
      metric.mastery = clamp(
        Math.round(
          metric.averageScore * 0.55 +
            Math.min(metric.flashcardReviews * 2.5, 20) +
            Math.min(metric.studyMinutes / 3, 15) +
            Math.min(metric.chatQuestions * 2, 10)
        ),
        0,
        100
      );
    }

    const totalStudyMinutes = Number(
      (studySummary[0]?.totalStudyMinutes || 0).toFixed(1)
    );

    const weeklyLearningTrend = dailyRange.map((day) => ({
      ...dailyBuckets[day.key],
      studyMinutes: Number(dailyBuckets[day.key].studyMinutes.toFixed(1)),
    }));

    const practiceBreakdown = weeklyLearningTrend.map((day) => ({
      date: day.date,
      label: day.label,
      flashcardReviews: day.flashcardReviews,
      quizCompletions: day.quizCompletions,
      chatQuestions: day.chatQuestions,
    }));

    const learningHeatmap = heatmapRange.map((day) => ({
      ...heatmapBuckets[day.key],
      intensity: clamp(heatmapBuckets[day.key].activityCount, 0, 4),
    }));

    const quizScoreTrend = quizzes
      .filter((quiz) => quiz.completedAt)
      .slice(0, 6)
      .reverse()
      .map((quiz, index) => ({
        label: `Quiz ${index + 1}`,
        title: quiz.title,
        score: quiz.score,
        completedAt: quiz.completedAt,
      }));

    const documentMastery = Array.from(documentMetrics.values())
      .sort((a, b) => b.mastery - a.mastery)
      .slice(0, 6)
      .map((metric) => ({
        documentId: metric.documentId,
        title: metric.title,
        mastery: metric.mastery,
        studyMinutes: Number(metric.studyMinutes.toFixed(1)),
        flashcardReviews: metric.flashcardReviews,
        chatQuestions: metric.chatQuestions,
        averageScore: metric.averageScore,
      }));

    const focusAreas = Array.from(documentMetrics.values())
      .filter(
        (metric) =>
          metric.studyMinutes > 0 ||
          metric.flashcardReviews > 0 ||
          metric.quizCount > 0 ||
          metric.chatQuestions > 0
      )
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3)
      .map((metric) => ({
        documentId: metric.documentId,
        title: metric.title,
        mastery: metric.mastery,
        recommendation:
          metric.averageScore && metric.averageScore < 70
            ? "Retake a quiz on this topic to strengthen understanding."
            : metric.flashcardReviews < 5
            ? "Add more active recall with flashcard reviews."
            : "Spend a longer study session revisiting the document summary.",
      }));

    const learningSplit = [
      {
        label: "Reading",
        value: Number(split.reading.toFixed(1)),
        color: "#2563EB",
      },
      {
        label: "Flashcards",
        value: split.flashcards,
        color: "#EC4899",
      },
      {
        label: "Quizzes",
        value: split.quizzes,
        color: "#10B981",
      },
      {
        label: "Chat",
        value: split.chat,
        color: "#F59E0B",
      },
    ];

    const recentDocuments = documents
      .slice(0, 5)
      .map((document) => ({
        _id: document._id,
        title: document.title,
        lastAccessed: document.lastAccessed,
        createdAt: document.createdAt,
        status: document.status,
      }));

    const recentQuizzes = quizzes.slice(0, 5).map((quiz) => ({
      _id: quiz._id,
      title: quiz.title,
      score: quiz.score,
      totalQuestions: quiz.totalQuestions,
      completedAt: quiz.completedAt,
      createdAt: quiz.createdAt,
      documentId: quiz.documentId,
    }));

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalDocuments,
          totalFlashcardSets,
          totalFlashcards,
          reviewedFlashcards,
          starredFlashcards,
          totalQuizzes,
          completedQuizzes,
          averageScore,
          studyStreak: computeStudyStreak(activeDayKeys),
          totalStudyMinutes,
          activeDays: activeDayKeys.size,
        },
        charts: {
          weeklyLearningTrend,
          practiceBreakdown,
          quizScoreTrend,
          learningHeatmap,
          learningSplit,
        },
        documentInsights: {
          mastery: documentMastery,
          focusAreas,
        },
        recentActivity: {
          documents: recentDocuments,
          quizzes: recentQuizzes,
        },
      },
      message: "Dashboard data retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
};
