import Quiz from "../models/Quiz.js";
import { recordActivity } from "../utils/activityTracker.js";

/* =========================
   GET ALL QUIZZES
========================= */
export const getQuizzes = async (req, res, next) => {
  try {
    const quizzes = await Quiz.find({
      userId: req.user._id,
      documentId: req.params.documentId,
    })
      .populate("documentId", "title fileName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: quizzes.length,
      data: quizzes,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================
   GET QUIZ BY ID
========================= */
export const getQuizById = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: "Quiz not found",
        statusCode: 404,
      });
    }

    res.status(200).json({
      success: true,
      data: quiz,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================
   SUBMIT QUIZ (FIXED)
========================= */
/* =========================
   SUBMIT QUIZ (FIXED)
========================= */
export const submitQuiz = async (req, res, next) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        error: "Please provide answers array",
        statusCode: 400,
      });
    }

    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: "Quiz not found",
        statusCode: 404,
      });
    }

    if (quiz.completedAt) {
      return res.status(400).json({
        success: false,
        error: "Quiz already completed",
        statusCode: 400,
      });
    }

    // ✅ helper: "03: Facebook" → "Facebook"
    const normalizeAnswer = (ans) => {
      if (!ans) return "";
      return ans.includes(":") ? ans.split(":")[1].trim() : ans.trim();
    };

    let correctCount = 0;
    const userAnswers = [];

    answers.forEach((answer) => {
      const { questionIndex, selectedAnswer } = answer;

      if (questionIndex >= quiz.questions.length) return;

      const question = quiz.questions[questionIndex];

      const correctAnswerText = normalizeAnswer(question.correctAnswer);
      const selectedAnswerText = normalizeAnswer(selectedAnswer);

      const isCorrect = correctAnswerText === selectedAnswerText;

      if (isCorrect) correctCount++;

      userAnswers.push({
        questionIndex,
        selectedAnswer: selectedAnswerText,
        isCorrect,
        answeredAt: new Date(),
      });
    });

    const score = Math.round((correctCount / quiz.totalQuestions) * 100);

    quiz.userAnswers = userAnswers;
    quiz.score = score;
    quiz.completedAt = new Date();
    quiz.attempts.push({
      score,
      correctCount,
      totalQuestions: quiz.totalQuestions,
      submittedAt: quiz.completedAt,
    });

    await quiz.save();

    await recordActivity({
      userId: req.user._id,
      documentId: quiz.documentId,
      type: "quiz_completed",
      value: 1,
      score,
      metadata: {
        quizId: quiz._id.toString(),
        correctCount,
        totalQuestions: quiz.totalQuestions,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        quizId: quiz._id,
        score,
        correctCount,
        totalQuestions: quiz.totalQuestions,
        percentage: score,
        userAnswers,
      },
      message: "Quiz submitted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/* =========================
   GET QUIZ RESULTS (FIXED)
========================= */
export const getQuizResults = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).populate("documentId", "title");

    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: "Quiz not found",
        statusCode: 404,
      });
    }

    if (!quiz.completedAt) {
      return res.status(400).json({
        success: false,
        error: "Quiz not completed yet",
        statusCode: 400,
      });
    }

    const detailedResults = quiz.questions.map((question, index) => {
      const userAnswer = quiz.userAnswers.find(
        (a) => a.questionIndex === index
      );

      return {
        questionIndex: index,
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        selectedAnswer: userAnswer?.selectedAnswer || null,
        isCorrect: userAnswer?.isCorrect || false,
        explanation: question.explanation || "",
      };
    });

    res.status(200).json({
      success: true,
      data: {
        quiz: {
          id: quiz._id,
          title: quiz.title,
          document: quiz.documentId,
          score: quiz.score,
          totalQuestions: quiz.totalQuestions,
          completedAt: quiz.completedAt,
        },
        results: detailedResults,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* =========================
   DELETE QUIZ
========================= */
export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        error: "Quiz not found",
        statusCode: 404,
      });
    }

    await quiz.deleteOne();

    res.status(200).json({
      success: true,
      message: "Quiz deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
