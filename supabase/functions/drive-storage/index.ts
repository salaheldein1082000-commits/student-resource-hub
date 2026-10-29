import { createClient } from "npm:@supabase/supabase-js@2";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 20 * 1024 * 1024;
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(`Missing server configuration: ${name}.`, 503);
  return value;
}

function allowedOrigins(): Set<string> {
  const configured =
    Deno.env.get("DRIVE_ALLOWED_ORIGINS") ??
    "https://unit1-offecial-portal.vercel.app,http://localhost:5173";
  return new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, range",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers":
      "Content-Disposition, Content-Type, Content-Length, Accept-Ranges, Content-Range, X-File-Name",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function assertOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().has(origin))
    throw new HttpError("This portal origin is not authorized for Drive access.", 403);
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearer(req: Request): string {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer "))
    throw new HttpError("Sign in to the portal first.", 401);
  const value = header.slice(7).trim();
  if (!value) throw new HttpError("Sign in to the portal first.", 401);
  return value;
}

async function authenticate(req: Request) {
  const token = bearer(req);
  const admin = adminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user)
    throw new HttpError("Your portal session is invalid or expired.", 401);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, class_id, email, full_name")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile)
    throw new HttpError("Your portal profile could not be verified.", 403);
  return {
    admin,
    user: authData.user,
    profile: profile as {
      role: string;
      class_id: string | null;
      email: string | null;
      full_name: string | null;
    },
    token,
  };
}

async function requireUnitLeader(req: Request) {
  const auth = await authenticate(req);
  if (auth.profile.role !== "unit_leader")
    throw new HttpError("Only the Unit Leader can configure Google Drive.", 403);
  return auth;
}

async function driveAccessToken(admin: ReturnType<typeof adminClient>): Promise<string> {
  const { data: refreshToken, error: secretError } = await admin.rpc("drive_get_refresh_token");
  if (secretError || typeof refreshToken !== "string" || !refreshToken) {
    throw new HttpError(
      "Connect the Unit Leader Google Drive account before using Drive storage.",
      409,
    );
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenResult = await response.json().catch(() => ({}));
  if (!response.ok || typeof tokenResult.access_token !== "string") {
    throw new HttpError(
      "Google Drive authorization expired. Reconnect the Unit Leader account.",
      409,
    );
  }
  return tokenResult.access_token;
}

function driveApiUrl(fileId: string, params: Record<string, string> = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function driveJson(url: URL, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new HttpError(
      "Google Drive could not verify that private folder or file.",
      response.status === 401 ? 409 : 400,
    );
  return data as Record<string, unknown>;
}

function safeOriginalName(value: unknown): string {
  if (typeof value !== "string") throw new HttpError("Choose a PDF or DOCX file.");
  const name = value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  if (!name || name === "." || name === "..") throw new HttpError("The file name is not valid.");
  return name;
}

function slug(value: string): string {
  const clean = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return clean.slice(0, 56) || "assignment";
}

function makeDriveFileName(
  className: string,
  studentName: string,
  assignmentTitle: string,
  attempt: number,
  extension: string,
): string {
  const classSlug = slug(className).slice(0, 32);
  const studentSlug = slug(studentName).slice(0, 56);
  return `${classSlug}-${studentSlug}-${slug(assignmentTitle)}-attempt-${attempt}.${extension}`;
}

function safeHeaderFileName(value: string): string {
  return (
    value
      .replace(/[\r\n\u0000-\u001f\u007f"\\]/g, "_")
      .replace(/[\/]/g, "_")
      .slice(0, 180) || "submission"
  );
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain ? plain.replace(/[\r\n\u0000-\u001f\u007f]/g, "_") : fallback;
}

async function status(req: Request): Promise<Response> {
  const { admin } = await requireUnitLeader(req);
  const [classesResult, foldersResult, tokenResult] = await Promise.all([
    admin.from("classes").select("id, name").order("name"),
    admin.from("drive_class_folders").select("class_id, drive_folder_name, mapped_at"),
    admin.rpc("drive_get_refresh_token"),
  ]);
  if (classesResult.error || foldersResult.error)
    throw new HttpError("Could not load the Drive folder map.", 500);
  const folders = new Map(
    (foldersResult.data ?? []).map(
      (row: { class_id: string; drive_folder_name: string; mapped_at: string }) => [
        row.class_id,
        row,
      ],
    ),
  );
  const classes = (classesResult.data ?? []).map((row: { id: string; name: string }) => {
    const mapped = folders.get(row.id);
    return {
      id: row.id,
      name: row.name,
      folderName: mapped?.drive_folder_name ?? null,
      mappedAt: mapped?.mapped_at ?? null,
    };
  });
  return json(req, 200, {
    connected:
      !tokenResult.error && typeof tokenResult.data === "string" && tokenResult.data.length > 0,
    classes,
  });
}

async function saveClassFolder(req: Request, payload: Record<string, unknown>): Promise<Response> {
  const { admin } = await requireUnitLeader(req);
  const classId = typeof payload.classId === "string" ? payload.classId : "";
  const folderId = typeof payload.folderId === "string" ? payload.folderId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(classId)) throw new HttpError("Select a valid portal class.");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId))
    throw new HttpError("The Drive folder ID is not valid.");

  const token = await driveAccessToken(admin);
  const folder = await driveJson(
    driveApiUrl(folderId, { fields: "id,name,mimeType,trashed" }),
    token,
  );
  if (
    folder.id !== folderId ||
    folder.mimeType !== FOLDER_MIME ||
    folder.trashed === true ||
    typeof folder.name !== "string"
  ) {
    throw new HttpError(
      "Choose an active Google Drive folder that the Unit Leader account can access.",
    );
  }
  const { data: duplicate, error: duplicateError } = await admin
    .from("drive_class_folders")
    .select("class_id")
    .eq("drive_folder_id", folderId)
    .neq("class_id", classId)
    .limit(1)
    .maybeSingle();
  if (duplicateError) throw new HttpError("Could not verify the class folder map.", 500);
  if (duplicate)
    throw new HttpError("That private Drive folder is already mapped to another class.");

  const { error } = await admin.from("drive_class_folders").upsert(
    {
      class_id: classId,
      drive_folder_id: folderId,
      drive_folder_name: safeHeaderFileName(folder.name),
      mapped_at: new Date().toISOString(),
    },
    { onConflict: "class_id" },
  );
  if (error) throw new HttpError("Could not save the class folder mapping.", 500);
  return json(req, 200, { saved: true, folderName: safeHeaderFileName(folder.name) });
}

async function initiateUpload(req: Request, payload: Record<string, unknown>): Promise<Response> {
  const { admin, user, profile } = await authenticate(req);
  if (profile.role !== "student")
    throw new HttpError("Only student accounts can upload coursework.", 403);
  if (!profile.class_id)
    throw new HttpError("Your portal account is not assigned to a class.", 403);

  const assignmentId = typeof payload.assignmentId === "string" ? payload.assignmentId : "";
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new HttpError("The assignment is not valid.");
  const originalFileName = safeOriginalName(payload.fileName);
  const extension = originalFileName.toLowerCase().endsWith(".pdf")
    ? "pdf"
    : originalFileName.toLowerCase().endsWith(".docx")
      ? "docx"
      : "";
  if (!extension) throw new HttpError("Only PDF and DOCX files are accepted.");
  const mimeType = extension === "pdf" ? PDF_MIME : DOCX_MIME;
  if (typeof payload.mimeType === "string" && payload.mimeType && payload.mimeType !== mimeType) {
    throw new HttpError("The selected file type does not match its extension.");
  }
  const size = Number(payload.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES)
    throw new HttpError("Files must be non-empty and 20 MB or smaller.");

  const { data: canSubmit, error: permissionError } = await admin.rpc(
    "drive_can_student_submit_for_upload",
    {
      _user_id: user.id,
      _assignment_id: assignmentId,
    },
  );
  if (permissionError || canSubmit !== true)
    throw new HttpError(
      "This assignment is not open for submission. Check the deadline or ask your Assessor to allow a resubmission.",
      403,
    );

  const [
    { data: assignment, error: assignmentError },
    { data: classRow, error: classError },
    { data: mapping, error: mappingError },
    { data: lastRows, error: submissionError },
  ] = await Promise.all([
    admin.from("assignments").select("id, title").eq("id", assignmentId).maybeSingle(),
    admin.from("classes").select("id, name").eq("id", profile.class_id).maybeSingle(),
    admin
      .from("drive_class_folders")
      .select("drive_folder_id")
      .eq("class_id", profile.class_id)
      .maybeSingle(),
    admin
      .from("submissions")
      .select("attempt_no, status")
      .eq("assignment_id", assignmentId)
      .eq("student_id", user.id)
      .order("attempt_no", { ascending: false })
      .limit(1),
  ]);
  if (assignmentError || !assignment)
    throw new HttpError("The assignment could not be found.", 404);
  if (classError || !classRow) throw new HttpError("Your assigned class could not be found.", 403);
  if (mappingError || !mapping?.drive_folder_id)
    throw new HttpError(
      "Your class's private Drive folder has not been configured yet. Contact the Unit Leader.",
      409,
    );
  if (submissionError) throw new HttpError("Could not determine the next submission attempt.", 500);

  const studentName = profile.full_name?.trim();
  if (!studentName)
    throw new HttpError("Your student name could not be verified for the private file name.", 403);
  const lastAttempt = (lastRows ?? [])[0] as { attempt_no: number; status: string } | undefined;
  const attemptNo = (lastAttempt?.attempt_no ?? 0) + 1;
  const driveFileName = makeDriveFileName(
    classRow.name,
    studentName,
    assignment.title,
    attemptNo,
    extension,
  );
  const uploadSessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { error: sessionError } = await admin.from("drive_upload_sessions").insert({
    id: uploadSessionId,
    user_id: user.id,
    assignment_id: assignmentId,
    class_id: profile.class_id,
    drive_folder_id: mapping.drive_folder_id,
    drive_file_name: driveFileName,
    original_file_name: originalFileName,
    mime_type: mimeType,
    file_size_bytes: size,
    attempt_no: attemptNo,
    status: "pending",
    expires_at: expiresAt,
  });
  if (sessionError) throw new HttpError("Could not create a secure Drive upload session.", 500);

  return json(req, 200, {
    uploadSessionId,
    attemptNo,
    fileName: driveFileName,
    mimeType,
  });
}

async function uploadFile(req: Request): Promise<Response> {
  const { admin, user, profile } = await authenticate(req);
  if (profile.role !== "student")
    throw new HttpError("Only student accounts can upload coursework files.", 403);
  const form = await req.formData();
  const sessionId = typeof form.get("uploadSessionId") === "string" ? form.get("uploadSessionId") as string : "";
  const fileValue = form.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !(fileValue instanceof File))
    throw new HttpError("The coursework file upload is invalid.");
  const { data: session, error: sessionError } = await admin
    .from("drive_upload_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError || !session) throw new HttpError("The Drive upload session was not found.", 404);
  if (session.status !== "pending" || new Date(session.expires_at).getTime() <= Date.now())
    throw new HttpError("The Drive upload session expired. Start a new submission attempt.", 409);
  if (fileValue.size !== Number(session.file_size_bytes))
    throw new HttpError("The uploaded file size does not match the secure upload session.");

  const token = await driveAccessToken(admin);
  const uploadResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,parents,appProperties",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": session.mime_type,
        "X-Upload-Content-Length": String(fileValue.size),
      },
      body: JSON.stringify({
        name: session.drive_file_name,
        mimeType: session.mime_type,
        parents: [session.drive_folder_id],
        appProperties: {
          btecPortal: "unit1-assessment",
          btecStudentId: user.id,
          btecAssignmentId: session.assignment_id,
          btecUploadSession: sessionId,
        },
      }),
    },
  );
  const uploadUrl = uploadResponse.headers.get("location");
  if (!uploadResponse.ok || !uploadUrl)
    throw new HttpError(
      "Google Drive could not start a resumable upload. Check the connected account and folder permissions.",
      502,
    );
  const driveUpload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": session.mime_type,
      "Content-Length": String(fileValue.size),
    },
    body: await fileValue.arrayBuffer(),
  });
  if (!driveUpload.ok) {
    const reason = (await driveUpload.text().catch(() => "")).slice(0, 300);
    throw new HttpError(reason ? `Google Drive upload failed: ${reason}` : "Google Drive upload failed.", 502);
  }
  const uploaded = (await driveUpload.json().catch(() => ({}))) as { id?: unknown };
  if (typeof uploaded.id !== "string") throw new HttpError("Google Drive did not return the uploaded file identifier.", 502);
  return json(req, 200, { driveFileId: uploaded.id });
}

async function finalizeUpload(req: Request, payload: Record<string, unknown>): Promise<Response> {
  const { admin, user, profile } = await authenticate(req);
  if (profile.role !== "student")
    throw new HttpError("Only student accounts can finalize coursework uploads.", 403);
  const sessionId = typeof payload.uploadSessionId === "string" ? payload.uploadSessionId : "";
  const driveFileId = typeof payload.driveFileId === "string" ? payload.driveFileId : "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[A-Za-z0-9_-]{10,200}$/.test(driveFileId))
    throw new HttpError("The uploaded file could not be verified.");

  const { data: session, error: sessionError } = await admin
    .from("drive_upload_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError || !session) throw new HttpError("The Drive upload session was not found.", 404);
  if (session.status === "completed" && session.drive_file_id === driveFileId) {
    const { data: existing } = await admin
      .from("submissions")
      .select("id, attempt_no")
      .eq("drive_upload_session_id", sessionId)
      .maybeSingle();
    if (existing)
      return json(req, 200, { submissionId: existing.id, attemptNo: existing.attempt_no });
  }
  if (session.status !== "pending" || new Date(session.expires_at).getTime() <= Date.now())
    throw new HttpError("The Drive upload session expired. Start a new submission attempt.", 409);

  const token = await driveAccessToken(admin);
  const driveFile = await driveJson(
    driveApiUrl(driveFileId, { fields: "id,name,mimeType,size,parents,appProperties,trashed" }),
    token,
  );
  const appProperties = driveFile.appProperties as Record<string, string> | undefined;
  const parents = driveFile.parents as string[] | undefined;
  const size = Number(driveFile.size);
  if (
    driveFile.id !== driveFileId ||
    driveFile.trashed === true ||
    driveFile.name !== session.drive_file_name ||
    driveFile.mimeType !== session.mime_type ||
    !Number.isSafeInteger(size) ||
    size !== Number(session.file_size_bytes) ||
    !parents?.includes(session.drive_folder_id) ||
    appProperties?.btecPortal !== "unit1-assessment" ||
    appProperties?.btecStudentId !== user.id ||
    appProperties?.btecAssignmentId !== session.assignment_id ||
    appProperties?.btecUploadSession !== sessionId
  ) {
    throw new HttpError(
      "The file in Google Drive does not match this student's private upload session. No submission record was created.",
      403,
    );
  }

  const { data: completed, error: completeError } = await admin.rpc("drive_complete_upload", {
    _upload_session_id: sessionId,
    _drive_file_id: driveFileId,
  });
  if (completeError || !Array.isArray(completed) || !completed[0]?.submission_id) {
    throw new HttpError(
      "Google Drive verified the file, but the submission could not be recorded. Please contact the Unit Leader before uploading again.",
      500,
    );
  }
  return json(req, 200, {
    submissionId: completed[0].submission_id,
    attemptNo: completed[0].attempt_no,
  });
}

async function downloadSubmission(
  req: Request,
  payload: Record<string, unknown>,
): Promise<Response> {
  const { token } = await authenticate(req);
  const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(submissionId))
    throw new HttpError("The submission file was not found.", 404);

  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!publicKey)
    throw new HttpError("Supabase public API key is missing from the Edge Function runtime.", 503);
  const callerClient = createClient(env("SUPABASE_URL"), publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: submission, error: submissionError } = await callerClient
    .from("submissions")
    .select(
      "id, storage_provider, file_url, drive_file_id, original_file_name, mime_type, file_size_bytes",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError || !submission)
    throw new HttpError(
      "The submission file was not found or is outside your authorized classes.",
      404,
    );
  if (
    submission.storage_provider !== "google_drive" ||
    !submission.drive_file_id ||
    submission.file_url !== "drive:private"
  ) {
    throw new HttpError("This submission uses the legacy private storage path.", 409);
  }

  const admin = adminClient();
  const tokenForDrive = await driveAccessToken(admin);
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(submission.drive_file_id)}`,
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const requestHeaders: Record<string, string> = { Authorization: `Bearer ${tokenForDrive}` };
  const range = req.headers.get("range");
  if (range) requestHeaders.Range = range;
  const upstream = await fetch(url, { headers: requestHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    throw new HttpError(
      upstream.status === 404
        ? "The private Drive file could not be found."
        : "Google Drive could not stream this private file.",
      upstream.status === 404 ? 404 : 502,
    );
  }

  const fallbackName = `submission-${submissionId}.${submission.mime_type === PDF_MIME ? "pdf" : "docx"}`;
  const downloadName = safeHeaderFileName(
    typeof submission.original_file_name === "string"
      ? submission.original_file_name
      : fallbackName,
  );
  const dispositionType = submission.mime_type === PDF_MIME ? "inline" : "attachment";
  const headers: Record<string, string> = {
    ...cors(req),
    "Content-Type": submission.mime_type === PDF_MIME ? PDF_MIME : DOCX_MIME,
    "Content-Disposition": `${dispositionType}; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "X-File-Name": encodeURIComponent(downloadName),
  };
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (contentLength) headers["Content-Length"] = contentLength;
  if (contentRange) headers["Content-Range"] = contentRange;
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function deleteAllSubmissions(req: Request): Promise<Response> {
  const { admin, profile } = await authenticate(req);
  if (profile.role !== "unit_leader")
    throw new HttpError("Only the Unit Leader can clear all submissions.", 403);
  const { data: submissions, error } = await admin.from("submissions").select("id");
  if (error) throw new HttpError("The submissions could not be listed for deletion.", 500);
  let deletedCount = 0;
  const failedSubmissionIds: string[] = [];
  for (const submission of submissions ?? []) {
    try {
      const response = await deleteSubmission(req, { submissionId: submission.id });
      if (!response.ok) throw new Error("Submission deletion failed.");
      deletedCount += 1;
    } catch {
      failedSubmissionIds.push(String(submission.id));
    }
  }
  return json(req, failedSubmissionIds.length ? 207 : 200, {
    deleted: failedSubmissionIds.length === 0,
    deletedCount,
    failedCount: failedSubmissionIds.length,
    failedSubmissionIds,
  });
}

async function deleteSubmission(req: Request, payload: Record<string, unknown>): Promise<Response> {
  const { admin, user, profile } = await authenticate(req);
  if (profile.role !== "unit_leader" && profile.role !== "engineer")
    throw new HttpError("Only assessors and Unit Leaders can delete submissions.", 403);
  const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(submissionId))
    throw new HttpError("The submission identifier is not valid.");

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select("id, student_id, assignment_id, attempt_no, file_url, original_file_name, storage_provider, drive_file_id, drive_upload_session_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError || !submission)
    throw new HttpError("The submission was not found or has already been deleted.", 404);

  const token = submission.storage_provider === "google_drive" ? await driveAccessToken(admin) : null;
  if (token && submission.drive_file_id) {
    const response = await fetch(
      driveApiUrl(submission.drive_file_id, { supportsAllDrives: "true" }),
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok && response.status !== 404)
      throw new HttpError("Google Drive could not remove the submission file. The record was not deleted.", 502);
  } else if (submission.storage_provider === "supabase" && submission.file_url) {
    const { error: storageError } = await admin.storage.from("submissions").remove([submission.file_url]);
    if (storageError)
      throw new HttpError("The stored submission file could not be removed. The record was not deleted.", 502);
  }

  const { error: logError } = await admin.from("submission_deletion_log").insert({
    submission_id: submission.id,
    deleted_by: user.id,
    student_id: submission.student_id,
    assignment_id: submission.assignment_id,
    attempt_no: submission.attempt_no,
    original_file_name: submission.original_file_name,
    storage_provider: submission.storage_provider,
  });
  if (logError) throw new HttpError("The deletion could not be audited, so the submission was not deleted.", 500);

  const { error: deleteError } = await admin.from("submissions").delete().eq("id", submission.id);
  if (deleteError) throw new HttpError("The submission record could not be deleted.", 500);
  if (submission.drive_upload_session_id) {
    await admin.from("drive_upload_sessions").delete().eq("id", submission.drive_upload_session_id);
  }
  return json(req, 200, { deleted: true });
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  return btoa(binary);
}

async function readSubmissionBytes(
  admin: ReturnType<typeof adminClient>,
  submission: Record<string, unknown>,
): Promise<Uint8Array> {
  if (submission.storage_provider === "supabase") {
    const file = await admin.storage.from("submissions").download(String(submission.file_url));
    if (file.error || !file.data) throw new HttpError("The submission file could not be read.", 502);
    return new Uint8Array(await file.data.arrayBuffer());
  }
  if (submission.storage_provider === "google_drive" && typeof submission.drive_file_id === "string") {
    const token = await driveAccessToken(admin);
    const url = driveApiUrl(submission.drive_file_id, { alt: "media" });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new HttpError("Google Drive could not read the submission file.", 502);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new HttpError("This submission does not have a readable file.", 409);
}

async function assessWithGemini(
  req: Request,
  payload: Record<string, unknown>,
): Promise<Response> {
  const { admin, user, profile } = await authenticate(req);
  if (profile.role !== "unit_leader" && profile.role !== "engineer")
    throw new HttpError("Only assessors and Unit Leaders can run AI assessment.", 403);
  const settings = await admin.from("portal_settings").select("ai_assessment_enabled").eq("id", true).maybeSingle();
  if (settings.error || settings.data?.ai_assessment_enabled !== true)
    throw new HttpError("AI assessment is currently disabled by the Unit Leader.", 409);
  const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new HttpError("The submission identifier is not valid.");

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select("id, assignment_id, storage_provider, file_url, drive_file_id, mime_type, file_size_bytes")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError || !submission) throw new HttpError("The submission was not found.", 404);
  const [{ data: assignment }, { data: config }, { data: rubric }] = await Promise.all([
    admin.from("assignments").select("id, title, brief").eq("id", submission.assignment_id).maybeSingle(),
    admin.from("ai_assignment_configs").select("enabled, model_answer, marking_guidance").eq("assignment_id", submission.assignment_id).maybeSingle(),
    admin.from("ai_rubric_items").select("criterion_id, max_points, guidance, model_answer, criteria(code, description)").eq("assignment_id", submission.assignment_id).order("sort_order"),
  ]);
  if (!assignment || !config || config.enabled !== true || !rubric?.length)
    throw new HttpError("Configure and enable the AI rubric for this assignment first.", 409);
  const bytes = await readSubmissionBytes(admin, submission as Record<string, unknown>);
  if (bytes.byteLength > MAX_BYTES) throw new HttpError("The submission is too large for AI review (20 MB maximum).", 413);

  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const run = await admin.from("ai_assessment_runs").insert({
    submission_id: submissionId,
    assignment_id: submission.assignment_id,
    provider: "google_gemini",
    model,
    status: "running",
    started_by: user.id,
  }).select("id").single();
  if (run.error || !run.data) throw new HttpError("The AI assessment run could not be started.", 500);

  const items = (rubric as Array<Record<string, unknown>>).map((item) => ({
    criterion_code: (item.criteria as Record<string, unknown> | null)?.code,
    criterion_description: (item.criteria as Record<string, unknown> | null)?.description,
    max_points: item.max_points,
    marking_guidance: item.guidance,
    criterion_model_answer: item.model_answer,
  }));
  const prompt = `You are an assessment assistant. Grade only against the supplied rubric. Do not invent evidence. Return a cautious recommendation for a human assessor. The recommendation is not a final grade.\n\nAssignment: ${assignment.title}\nAssignment brief: ${assignment.brief ?? ""}\nOverall model answer: ${config.model_answer}\nOverall marking guidance: ${config.marking_guidance}\nRubric: ${JSON.stringify(items)}\n\nFor each criterion, award an integer from 0 to max_points, quote concise evidence from the submission, explain the decision, and suggest feedback. Also give a total and an overall summary.`;
  const schema = {
    type: "object",
    properties: {
      total_points: { type: "integer", minimum: 0 },
      overall_summary: { type: "string" },
      criteria: { type: "array", items: { type: "object", properties: {
        criterion_code: { type: "string" }, suggested_points: { type: "integer", minimum: 0 },
        evidence: { type: "string" }, reasoning: { type: "string" }, feedback: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      }, required: ["criterion_code", "suggested_points", "evidence", "reasoning", "feedback", "confidence"], additionalProperties: false } },
    }, required: ["total_points", "overall_summary", "criteria"], additionalProperties: false,
  };
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY") },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: submission.mime_type || DOCX_MIME, data: base64(bytes) } }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 } }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || "Gemini returned an error.");
    const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
    if (!text) throw new Error("Gemini returned no assessment result.");
    const result = JSON.parse(text);
    const maxByCode = new Map(items.map((item) => [String(item.criterion_code), Number(item.max_points)]));
    result.criteria = Array.isArray(result.criteria) ? result.criteria.map((item: Record<string, unknown>) => ({
      ...item,
      suggested_points: Math.max(0, Math.min(Number(item.suggested_points) || 0, maxByCode.get(String(item.criterion_code)) ?? 0)),
    })) : [];
    const { error: saveError } = await admin.from("ai_assessment_runs").update({ status: "completed", result, completed_at: new Date().toISOString() }).eq("id", run.data.id);
    if (saveError) throw saveError;
    return json(req, 200, { runId: run.data.id, result });
  } catch (error) {
    await admin.from("ai_assessment_runs").update({ status: "failed", error_message: error instanceof Error ? error.message : "Gemini assessment failed.", completed_at: new Date().toISOString() }).eq("id", run.data.id);
    throw new HttpError(error instanceof Error ? error.message : "Gemini assessment failed.", 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigins().has(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors(req) });
  }
  if (req.method !== "POST") return json(req, 405, { error: "Method not allowed." });
  try {
    assertOrigin(req);
    if (req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      const form = await req.clone().formData();
      if (form.get("action") === "upload_file") return await uploadFile(req);
      throw new HttpError("Unknown Drive storage action.");
    }
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (payload.action) {
      case "status":
        return await status(req);
      case "save_class_folder":
        return await saveClassFolder(req, payload);
      case "initiate_upload":
        return await initiateUpload(req, payload);
      case "upload_file":
        return await uploadFile(req);
      case "finalize_upload":
        return await finalizeUpload(req, payload);
      case "download":
        return await downloadSubmission(req, payload);
      case "delete_submission":
        return await deleteSubmission(req, payload);
      case "delete_all_submissions":
        return await deleteAllSubmissions(req);
      case "ai_assess_submission":
        return await assessWithGemini(req, payload);
      default:
        throw new HttpError("Unknown Drive storage action.");
    }
  } catch (error) {
    if (error instanceof HttpError) return json(req, error.status, { error: error.message });
    return json(req, 500, {
      error:
        "The private Google Drive operation failed. Check the portal configuration and try again.",
    });
  }
});
