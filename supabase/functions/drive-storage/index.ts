import { createClient } from "npm:@supabase/supabase-js@2";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 20 * 1024 * 1024;
const FOLDER_MIME = "application/vnd.google-apps.folder";

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
    .select("role, class_id, email")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile)
    throw new HttpError("Your portal profile could not be verified.", 403);
  return {
    admin,
    user: authData.user,
    profile: profile as { role: string; class_id: string | null; email: string | null },
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
  studentCode: string,
  assignmentTitle: string,
  attempt: number,
  extension: string,
): string {
  const classSlug = slug(className).slice(0, 32);
  return `${classSlug}-${studentCode}-${slug(assignmentTitle)}-attempt-${attempt}.${extension}`;
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

  const studentCode = user.email?.match(/^([0-9]{6})@student\.local$/i)?.[1];
  if (!studentCode)
    throw new HttpError("Your student code could not be verified for the private file name.", 403);
  const lastAttempt = (lastRows ?? [])[0] as { attempt_no: number; status: string } | undefined;
  const attemptNo = (lastAttempt?.attempt_no ?? 0) + 1;
  const driveFileName = makeDriveFileName(
    classRow.name,
    studentCode,
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
