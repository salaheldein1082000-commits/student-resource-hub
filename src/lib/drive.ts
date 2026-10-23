import { supabase } from "@/integrations/supabase/client";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DriveStorageStatus = {
  connected: boolean;
  classes: Array<{ id: string; name: string; folderName: string | null; mappedAt: string | null }>;
};

export type PrivateSubmissionFile = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

type DriveUploadStart = {
  uploadUrl: string;
  uploadSessionId: string;
  attemptNo: number;
  fileName: string;
  mimeType: string;
};

type DriveUploadComplete = { submissionId: string; attemptNo: number };

type DriveFunctionError = Error & { context?: unknown };

async function responseError(error: unknown): Promise<Error> {
  const fallback = error instanceof Error ? error.message : "The private Drive request failed.";
  const context = (error as DriveFunctionError | null)?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body.error === "string") return new Error(body.error);
    } catch {
      // Keep the SDK's safe fallback message when the response is not JSON.
    }
  }
  return new Error(fallback);
}

export async function callDriveStorage<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("drive-storage", {
    body: { action, ...payload },
  });
  if (error) throw await responseError(error);
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data as T;
}

export async function callDriveOAuth<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("drive-oauth", {
    body: { action, ...payload },
  });
  if (error) throw await responseError(error);
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data as T;
}

export async function uploadStudentSubmission(
  assignmentId: string,
  file: File,
): Promise<DriveUploadComplete> {
  const mimeType = file.name.toLowerCase().endsWith(".pdf")
    ? PDF_MIME
    : file.name.toLowerCase().endsWith(".docx")
      ? DOCX_MIME
      : "";
  if (!mimeType) throw new Error("Only PDF and DOCX files are accepted.");
  if (file.size < 1 || file.size > 20 * 1024 * 1024) {
    throw new Error("Files must be non-empty and 20 MB or smaller.");
  }

  const start = await callDriveStorage<DriveUploadStart>("initiate_upload", {
    assignmentId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(start.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: file,
    });
  } catch {
    throw new Error(
      "The Google Drive upload could not be reached. Please check the portal's Drive configuration and try again.",
    );
  }
  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => "");
    const reason = details.slice(0, 300);
    throw new Error(
      reason
        ? `Google Drive upload failed: ${reason}`
        : "Google Drive upload failed. Please try again.",
    );
  }
  const uploaded = (await uploadResponse.json().catch(() => ({}))) as { id?: unknown };
  if (typeof uploaded.id !== "string") {
    throw new Error(
      "Google Drive received the file but did not return its file identifier. Contact the Unit Leader before retrying.",
    );
  }
  return await callDriveStorage<DriveUploadComplete>("finalize_upload", {
    uploadSessionId: start.uploadSessionId,
    driveFileId: uploaded.id,
  });
}

function safeFileName(value: string): string {
  return (
    Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return character === "/" || character === "\\" || code < 32 || code === 127 ? "_" : character;
    })
      .join("")
      .replace(/^\.+$/, "submission")
      .slice(0, 180) || "submission"
  );
}

export function decodeDriveFileName(encoded: string | null, fallback: string): string {
  if (!encoded) return fallback;
  try {
    return safeFileName(decodeURIComponent(encoded));
  } catch {
    return safeFileName(encoded);
  }
}

export async function getDriveSubmissionFile(submissionId: string): Promise<PrivateSubmissionFile> {
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session.session?.access_token)
    throw new Error("Sign in to the portal to access this submission.");

  const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const publicKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!supabaseUrl || !publicKey)
    throw new Error("The portal's Supabase connection is not configured.");

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/drive-storage`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      apikey: publicKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "download", submissionId }),
  });
  if (!response.ok) {
    let message = "Could not open the private submission file.";
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // The response may be an upstream plain-text error.
    }
    throw new Error(message);
  }
  const fallbackName = `submission-${submissionId}`;
  return {
    blob: await response.blob(),
    fileName: decodeDriveFileName(response.headers.get("x-file-name"), fallbackName),
    mimeType: response.headers.get("content-type") ?? PDF_MIME,
  };
}

export async function openDriveSubmissionFile(submissionId: string, forceDownload = false) {
  const previewTab = forceDownload ? null : window.open("about:blank", "_blank");
  if (previewTab) previewTab.opener = null;
  try {
    const file = await getDriveSubmissionFile(submissionId);
    const url = URL.createObjectURL(file.blob);
    const shouldDownload = forceDownload || file.mimeType !== PDF_MIME;
    if (shouldDownload) {
      previewTab?.close();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeFileName(file.fileName);
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } else if (previewTab && !previewTab.closed) {
      previewTab.location.replace(url);
    } else {
      window.location.assign(url);
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    previewTab?.close();
    throw error;
  }
}
