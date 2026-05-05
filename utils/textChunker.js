/**
 * Split text into chunks for better AI processing
 * @param {string} text - Full text to chunk
 * @param {number} chunkSize - Target size per chunk (in words)
 * @param {number} overlap - Number of words to overlap between chunks
 * @returns {Array<{ content: string, chunkIndex: number, pageNumber: number }>}
 */
export const chunkText = (text, chunkSize = 500, overlap = 50) => {
  if (!text || text.trim().length === 0) return [];

  const cleanedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/ \n/g, "\n")
    .trim();

  const paragraphs = cleanedText
    .split(/\n+/)
    .filter((p) => p.trim().length > 0);

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;
  let chunkIndex = 0;

  const pushChunk = (content) => {
    const finalContent = content.trim();
    if (!finalContent) return; // 🔴 important fix

    chunks.push({
      content: finalContent,
      chunkIndex: chunkIndex++,
      pageNumber: 0,
    });
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);

    if (words.length > chunkSize) {
      if (currentChunk.length) {
        pushChunk(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWordCount = 0;
      }

      for (let i = 0; i < words.length; i += chunkSize - overlap) {
        pushChunk(words.slice(i, i + chunkSize).join(" "));
        if (i + chunkSize >= words.length) break;
      }
      continue;
    }

    if (currentWordCount + words.length > chunkSize && currentChunk.length) {
      pushChunk(currentChunk.join("\n\n"));

      const prevWords = currentChunk.join(" ").split(/\s+/);
      const overlapText = prevWords
        .slice(-Math.min(overlap, prevWords.length))
        .join(" ");

      currentChunk = overlapText ? [overlapText, paragraph] : [paragraph];
      currentWordCount = overlapText.split(/\s+/).length + words.length;
    } else {
      currentChunk.push(paragraph);
      currentWordCount += words.length;
    }
  }

  if (currentChunk.length) {
    pushChunk(currentChunk.join("\n\n"));
  }

  return chunks;
};

/**
 * Find relevant chunks based on keyword matching
 * @param {Array<Object>} chunks - Array of chunks
 * @param {string} query - Search query
 * @param {number} maxChunks - Maximum chunks to return
 * @returns {Array<Object>}
 */
export const findRelevantChunks = (chunks, query, maxChunks = 3) => {
  if (!chunks || chunks.length === 0 || !query) return [];

  const stopWords = new Set([
    "the",
    "is",
    "at",
    "which",
    "on",
    "an",
    "in",
    "with",
    "to",
    "for",
    "a",
    "and",
    "or",
    "of",
    "as",
    "by",
    "but",
    "this",
    "that",
    "it",
  ]);

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (queryWords.length === 0) {
    return chunks.slice(0, maxChunks).map((chunk) => ({
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      id: chunk.id,
    }));
  }

  const scoredChunks = chunks.map((chunk, index) => {
    const content = chunk.content.toLowerCase();
    const contentWords = content.split(/\s+/).length;
    let score = 0;

    for (const word of queryWords) {
      const exactMatches = (
        content.match(new RegExp(`\\b${word}\\b`, "g")) || []
      ).length;
      const partialMatches = (content.match(new RegExp(word, "g")) || [])
        .length;

      score += exactMatches * 3;
      score += Math.max(0, partialMatches - exactMatches) * 1.5;
    }

    const uniqueWordsFound = queryWords.filter((w) =>
      content.includes(w)
    ).length;

    if (uniqueWordsFound > 1) {
      score += uniqueWordsFound * 2;
    }

    const normalizedScore = score / Math.sqrt(contentWords);
    const positionBonus = 1 - (index / chunks.length) * 0.1;

    return {
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      id: chunk.id,
      score: normalizedScore * positionBonus,
      rawScore: score,
      matchedWords: uniqueWordsFound,
    };
  });

  return scoredChunks
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchedWords !== a.matchedWords)
        return b.matchedWords - a.matchedWords;
      return a.chunkIndex - b.chunkIndex;
    })
    .slice(0, maxChunks);
};
