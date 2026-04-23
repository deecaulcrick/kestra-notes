export const NBSP = "\u00a0";
export const EMPTY_TASK_MARKDOWN = "&nbsp;";

export function preserveMarkdownSpaces(text: string): string {
  return text
    .replace(/ {2,}/g, (spaces) => ` ${NBSP.repeat(spaces.length - 1)}`)
    .replace(/^ +/gm, (spaces) => NBSP.repeat(spaces.length))
    .replace(/ +$/gm, (spaces) => NBSP.repeat(spaces.length));
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeMarkdownForEditor(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmedStart = line.trimStart();

    if (trimmedStart.startsWith("```") || trimmedStart.startsWith("~~~")) {
      inFence = !inFence;
      normalized.push(line);
      continue;
    }

    if (inFence || line.trim().length > 0) {
      normalized.push(line);
      continue;
    }

    let runEnd = i;
    while (runEnd < lines.length && lines[runEnd].trim().length === 0) {
      runEnd += 1;
    }

    const runLength = runEnd - i;
    const hasContentBefore = normalized.some((candidate) => candidate.trim().length > 0);
    const hasContentAfter = lines.slice(runEnd).some((candidate) => candidate.trim().length > 0);

    if (hasContentBefore && hasContentAfter) {
      normalized.push("");

      for (let extra = 1; extra < runLength; extra += 1) {
        normalized.push("<p></p>", "");
      }
    } else {
      for (let blank = 0; blank < runLength; blank += 1) {
        normalized.push("<p></p>", "");
      }
    }

    i = runEnd - 1;
  }

  return normalized.join("\n");
}
