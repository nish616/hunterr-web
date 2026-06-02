"use server";

import { auth } from "@/auth";
import { extractResumeText } from "@/lib/resume/extract";
import { profileAndSaveResume } from "@/lib/resume/profile";

export type UploadState = {
  status: "idle" | "success" | "error";
  message?: string;
  profileMd?: string;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function uploadResumeAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await auth();
  if (!session?.user) {
    return { status: "error", message: "Not signed in." };
  }

  const file = formData.get("resume");
  if (!(file instanceof File)) {
    return { status: "error", message: "No file uploaded." };
  }
  if (file.size === 0) {
    return { status: "error", message: "File is empty." };
  }
  if (file.size > MAX_BYTES) {
    return {
      status: "error",
      message: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`,
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractResumeText(buffer, file.name);
    if (text.length < 100) {
      return {
        status: "error",
        message: `Extracted only ${text.length} characters from the file — that's suspiciously short. Make sure the file isn't a scanned image.`,
      };
    }
    const { profileMd } = await profileAndSaveResume(session.user.id, text);
    return {
      status: "success",
      message: `Resume updated (${text.length.toLocaleString()} chars extracted).`,
      profileMd,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Upload failed.",
    };
  }
}
