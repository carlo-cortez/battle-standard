import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean);

const findings = [];
const allowedEnvironmentFiles = new Set([".env.example"]);
const secretPatterns = [
  ["Gemini API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["Groq API key", /gsk_[0-9A-Za-z]{20,}/],
  ["Google OAuth client secret", /GOCSPX-[0-9A-Za-z_-]{20,}/],
  ["OpenAI API key", /sk-(?:proj-)?[0-9A-Za-z_-]{20,}/],
  ["GitHub token", /gh[pousr]_[0-9A-Za-z]{30,}/],
  ["GitHub fine-grained token", /github_pat_[0-9A-Za-z_]{30,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Supabase secret key", /sb_secret_[0-9A-Za-z_-]{20,}/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "client-exposed privileged variable",
    new RegExp("VITE_" + "(?:GROQ|GEMINI|GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE|[A-Z0-9_]*SECRET)"),
  ],
];

for (const file of files) {
  const fileName = basename(file);
  if (fileName.startsWith(".env") && !allowedEnvironmentFiles.has(fileName)) {
    findings.push(`${file}: environment file must stay untracked`);
    continue;
  }

  let buffer;
  try {
    if (statSync(file).size > 5_000_000) continue;
    buffer = readFileSync(file);
  } catch {
    continue;
  }
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length) {
  console.error("Potential secrets detected. No values are printed:\n");
  for (const finding of findings) console.error(`- ${finding}`);
  console.error("\nMove credentials to an ignored .env file or deployment secrets, then run this check again.");
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} commit-candidate files checked).`);
