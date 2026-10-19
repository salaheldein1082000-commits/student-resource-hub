import { useState } from "react";
import { Download, ExternalLink, FileText, Link2, Pin, Presentation, PlayCircle, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toEmbedUrl, toPdfViewerUrl } from "@/lib/embed";
import { logView, type Resource } from "@/lib/data";
import { useMe } from "@/lib/auth";

export const TYPE_ICON = {
  video: PlayCircle,
  pdf: FileText,
  link: Link2,
  slides: Presentation,
  template: FileSpreadsheet,
} as const;

export function ResourceCard({ r }: { r: Resource }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const Icon = TYPE_ICON[r.type as keyof typeof TYPE_ICON] ?? Link2;
  const inline = r.type === "video" ? toEmbedUrl(r.url) : r.type === "pdf" || r.type === "slides" ? toPdfViewerUrl(r.url) : null;

  function openIt() {
    if (me?.role === "student") void logView(r.id, me.id);
    if (inline) setOpen(true);
    else window.open(r.url, "_blank", "noopener");
  }

  return (
    <>
      <button
        onClick={openIt}
        className="group flex w-full flex-col rounded-xl border bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon className="h-5 w-5" />
          </span>
          {r.is_pinned && (
            <Badge className="gap-1 bg-accent text-accent-foreground hover:bg-accent">
              <Pin className="h-3 w-3" /> Pinned
            </Badge>
          )}
        </div>
        <h3 className="mt-4 font-display text-lg font-bold leading-snug group-hover:text-primary">{r.title}</h3>
        {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="capitalize">{r.type}</Badge>
          {r.linked_criteria.map((c) => (
            <Badge key={c} variant="secondary" className="font-mono">{c}</Badge>
          ))}
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{r.title}</DialogTitle>
          </DialogHeader>
          {inline && (
            <div className={r.type === "video" ? "aspect-video" : "h-[70vh]"}>
              <iframe
                src={inline}
                title={r.title}
                className="h-full w-full rounded-lg border"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            {r.type !== "video" && (
              <Button asChild variant="outline">
                <a href={r.url} download target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> Download</a>
              </Button>
            )}
            <Button asChild variant="ghost">
              <a href={r.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open in new tab</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
