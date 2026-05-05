import fs from "fs/promises";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

/**
 * Extract text from PDF file
 * @param {string} filePath
 */
export const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);

    const data = await pdfParse(dataBuffer);

    return {
      text: data.text || "",
      numPages: data.numpages || 0,
      info: data.info || {},
    };
  } catch (error) {
    console.error("❌ PDF parsing error:", error);
    throw new Error("Failed to extract text from PDF");
  }
};
