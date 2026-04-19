import type { PromptGuardrailResult } from "../types.js";
import { classifyPrompt } from "./classifyPrompt.js";
import { basePolicies, policyPacks } from "./policyPacks.js";

const concisePrefix = "System: Secure by default. Validate input, authorize access, protect secrets.";

export function buildGuardrailPrompt(prompt: string): PromptGuardrailResult {
  const classification = classifyPrompt(prompt);
  const selectedPacks = policyPacks.filter((pack) => classification.categories.includes(pack.id));
  const injectedPolicies = uniqueStrings([
    ...basePolicies,
    ...selectedPacks.flatMap((pack) => pack.policies)
  ]);

  const policyText = injectedPolicies.map((policy) => `- ${policy}`).join("\n");
  const modifiedPrompt = [
    concisePrefix,
    "Security requirements:",
    policyText,
    "",
    "User request:",
    prompt
  ].join("\n");

  return {
    originalPrompt: prompt,
    modifiedPrompt,
    classification,
    injectedPolicies
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
