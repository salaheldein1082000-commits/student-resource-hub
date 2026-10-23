import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/AppShell";
import { meQuery } from "@/lib/auth";
import { useLocale } from "@/lib/locale";
import { callDriveOAuth, callDriveStorage, type DriveStorageStatus } from "@/lib/drive";

interface PickerFolder {
  id: string;
  name: string;
  mimeType: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerFolder[];
}

interface PickerView {
  setIncludeFolders(include: boolean): PickerView;
  setSelectFolderEnabled(enabled: boolean): PickerView;
  setMimeTypes(mimeTypes: string): PickerView;
}

interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface GooglePickerApi {
  ViewId: { FOLDERS: string };
  Action: { PICKED: string; CANCEL: string };
  DocsView: new (viewId: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
}

declare global {
  interface Window {
    gapi?: { load(api: string, callback: () => void): void };
    google?: { picker: GooglePickerApi };
  }
}

let pickerLoadPromise: Promise<void> | null = null;

export const Route = createFileRoute("/_authenticated/manage/drive")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me?.role !== "unit_leader") throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Google Drive storage — BTEC Assessment Portal" },
      {
        name: "description",
        content: "Connect private Google Drive folders for student submissions.",
      },
    ],
  }),
  component: DriveSettingsPage,
});

function DriveSettingsPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [selectingClassId, setSelectingClassId] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["drive-storage-status"],
    queryFn: () => callDriveStorage<DriveStorageStatus>("status"),
    retry: false,
    staleTime: 10_000,
  });
  const status = statusQuery.data;

  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("drive_connected");
    const failure = url.searchParams.get("drive_error");
    if (connected === "1") {
      toast.success(t("driveConnected"));
      void queryClient.invalidateQueries({ queryKey: ["drive-storage-status"] });
    } else if (failure) {
      const message =
        failure === "access_denied"
          ? "Google Drive connection was cancelled."
          : failure === "missing_refresh_token"
            ? "Google did not issue a refresh token. Reconnect and approve the requested Drive access."
            : "Google Drive could not be connected. Check the OAuth setup and try again.";
      toast.error(message);
    }
    if (connected || failure) {
      url.searchParams.delete("drive_connected");
      url.searchParams.delete("drive_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [queryClient, t]);

  async function connectDrive() {
    setConnecting(true);
    try {
      const returnTo = `${window.location.origin}/manage/drive`;
      const result = await callDriveOAuth<{ authUrl: string }>("start", { returnTo });
      window.location.assign(result.authUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start Google Drive authorization.",
      );
      setConnecting(false);
    }
  }

  async function loadPicker() {
    if (window.google?.picker) return;
    if (!pickerLoadPromise) {
      pickerLoadPromise = new Promise<void>((resolve, reject) => {
        const initialize = () => {
          if (!window.gapi) {
            reject(new Error("Google Picker could not be loaded."));
            return;
          }
          window.gapi.load("picker", () => {
            if (window.google?.picker) resolve();
            else reject(new Error("Google Picker did not initialize."));
          });
        };
        const scriptId = "google-picker-api";
        const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
        if (existing) {
          if (window.gapi) initialize();
          else {
            existing.addEventListener("load", initialize, { once: true });
            existing.addEventListener(
              "error",
              () => reject(new Error("Google Picker could not be loaded.")),
              { once: true },
            );
          }
          return;
        }
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://apis.google.com/js/api.js";
        script.async = true;
        script.onload = initialize;
        script.onerror = () => reject(new Error("Google Picker could not be loaded."));
        document.head.append(script);
      }).catch((error: unknown) => {
        pickerLoadPromise = null;
        throw error;
      });
    }
    await pickerLoadPromise;
  }

  async function saveFolder(classId: string, folder: PickerFolder) {
    setSelectingClassId(classId);
    try {
      await callDriveStorage("save_class_folder", { classId, folderId: folder.id });
      toast.success(`${folder.name} — ${t("folderMapped")}`);
      await queryClient.invalidateQueries({ queryKey: ["drive-storage-status"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the private folder mapping.",
      );
    } finally {
      setSelectingClassId(null);
    }
  }

  async function chooseFolder(classId: string) {
    setSelectingClassId(classId);
    try {
      const config = await callDriveOAuth<{ accessToken: string; apiKey: string; appId: string }>(
        "picker_config",
      );
      await loadPicker();
      const pickerApi = window.google?.picker;
      if (!pickerApi)
        throw new Error("Google Picker is unavailable. Reload the page and try again.");
      const view = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes("application/vnd.google-apps.folder");
      const picker = new pickerApi.PickerBuilder()
        .addView(view)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .setCallback((response) => {
          if (response.action === pickerApi.Action.PICKED) {
            const folder = response.docs?.[0];
            if (folder?.id) void saveFolder(classId, folder);
            else setSelectingClassId(null);
          } else if (response.action === pickerApi.Action.CANCEL) {
            setSelectingClassId(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (error) {
      setSelectingClassId(null);
      toast.error(error instanceof Error ? error.message : "Could not open Google Picker.");
    }
  }

  const connected = status?.connected === true;
  const pageBusy = statusQuery.isLoading || statusQuery.isFetching;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("driveStorage")} sub={t("driveSubtitle")}>
        <Button onClick={connectDrive} disabled={connecting}>
          {connecting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <HardDrive className="h-4 w-4" />
          )}
          {connected ? t("reconnectDrive") : t("connectDrive")}
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3">
              {t("driveStorage")}
              {connected ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("driveConnected")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3.5 w-3.5" />
                  {t("driveNotConnected")}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>{t("drivePrivateNotice")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{t("existingFilesNotice")}</span>
            </p>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("driveSetupHelp")}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("mapFolders")}</CardTitle>
            <CardDescription>
              {t("folder")} · {t("classes")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusQuery.error ? (
              <div
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
                role="alert"
              >
                {statusQuery.error.message}
                <Button
                  className="ms-3"
                  variant="outline"
                  size="sm"
                  onClick={() => void statusQuery.refetch()}
                >
                  {t("tryAgain")}
                </Button>
              </div>
            ) : pageBusy && !status ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" /> {t("loading")}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(status?.classes ?? []).map((classRow) => {
                  const mapped = Boolean(classRow.folderName);
                  const isSelecting = selectingClassId === classRow.id;
                  return (
                    <div
                      key={classRow.id}
                      className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="font-semibold">{classRow.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {mapped
                              ? `${t("folderMapped")}: ${classRow.folderName}`
                              : t("folderNotMapped")}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={mapped ? "outline" : "default"}
                        disabled={!connected || isSelecting || selectingClassId !== null}
                        onClick={() => void chooseFolder(classRow.id)}
                      >
                        {isSelecting ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <FolderOpen className="h-4 w-4" />
                        )}
                        {mapped ? t("changePrivateFolder") : t("selectPrivateFolder")}
                      </Button>
                    </div>
                  );
                })}
                {!status?.classes.length && !statusQuery.isLoading && (
                  <p className="text-sm text-muted-foreground">{t("noClassesAssigned")}</p>
                )}
              </div>
            )}
            {!connected && !statusQuery.error && (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("connectDrive")} {t("mapFolders").toLowerCase()}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
