import type { PromptClassification } from "../types.js";
import { policyPacks } from "./policyPacks.js";

export function classifyPrompt(prompt: string): PromptClassification {
  const matchedKeywords: Record<string, string[]> = {};
  const categories: string[] = [];

  for (const pack of policyPacks) {
    const matches = pack.keywords
      .filter((keyword) => keyword.test(prompt))
      .map((keyword) => keyword.source);

    if (matches.length > 0) {
      categories.push(pack.id);
      matchedKeywords[pack.id] = matches;
    }
  }

  const confidence = categories.length >= 2 ? "high" : categories.length === 1 ? "medium" : "low";

  return {
    categories: categories.length > 0 ? categories : ["general"],
    matchedKeywords,
    confidence
  };
}
