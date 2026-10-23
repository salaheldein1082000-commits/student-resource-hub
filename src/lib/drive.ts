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
    
    const details = await uploadRespo

















































































