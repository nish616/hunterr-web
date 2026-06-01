import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const RESUME_TXT_PATH = path.join(DATA_DIR, "resume.txt");
export const PROFILE_MD_PATH = path.join(DATA_DIR, "profile.md");
