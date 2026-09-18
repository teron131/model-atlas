# Model Atlas Documentation Style

- Keep only UI documentation and its assets in `docs/`, except this file. No temporary docs, plans, reports, or implementation notes; put findings in the conversation.
- These rules cover prose, captions, alt text, and illustration text.
- Write directly and neutrally. Never use “we,” “our,” or “us,” or introduce symbols with “Let …”.
- Keep each paragraph on one source line; separate paragraphs with blank lines. No manual wrapping or sentence-per-line formatting.
- Explain what a calculation does and why before its equation. Define symbols at first use, simplify notation, and preserve the full calculation and units.
- Use consistent terms: “weighted mean,” “imputation” for missing values, and “crosswalk” for source conversion. Avoid invented labels such as “context score.”
- Keep paragraphs focused; remove repetition, including explanations duplicated by illustrations. Never restore wording explicitly removed by the user.
- Use descriptive headings without unnecessary numbering. Include function names only when useful, with clear inputs and outputs.
- Place illustrations beside their explanations or immediately after their equations. Show the mechanics without unnecessary guides, labels, or decoration.
- Use consistent examples across prose and figures; verify values, weights, ranks, boundaries, and captions. Label illustrative values and policy thresholds. Typical prediction errors are not confidence intervals or guaranteed bounds.
- Match the current implementation. Distinguish observations from estimates, evidence credit from direct evidence, and policy choices from validated findings.
- Review the entire affected section and its illustrations before finishing; stay within the requested scope.
