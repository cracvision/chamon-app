import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatBytes } from "@/lib/format";
import { toast } from "sonner";
import { Upload, FileText, Image as ImageIcon, Trash2, Download, FileSpreadsheet, File } from "lucide-react";
import type { Attachment } from "@/lib/queries";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = [
  "application/pdf", "image/png", "image/jpeg", "image/heic", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword", "application/vnd.ms-excel",
  "text/csv", "text/plain",
];

interface Props {
  missionId: string;
  taskId?: string;  // if provided, attachments belong to the task; else to the mission
}

function iconFor(mime: string | null) {
  if (!mime) return File;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
  if (mime.includes("pdf") || mime.includes("text") || mime.includes("word")) return FileText;
  return File;
}

export function AttachmentsList({ missionId, taskId }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    let q = supabase.from("attachments").select("*").order("created_at", { ascending: false });
    q = taskId ? q.eq("task_id", taskId) : q.is("task_id", null).eq("mission_id", missionId);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setItems(data as Attachment[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [missionId, taskId]);

  const upload = async (files: FileList | File[]) => {
    if (!user) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) { toast.error(`${file.name}: > 25 MB`); continue; }
        if (file.type && !ALLOWED.includes(file.type)) { toast.error(`${file.name}: type not allowed`); continue; }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${missionId}/${taskId || "mission"}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file, {
          contentType: file.type || "application/octet-stream", upsert: false,
        });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        const { error: dbErr } = await supabase.from("attachments").insert({
          mission_id: taskId ? null : missionId,
          task_id: taskId || null,
          filename: file.name,
          storage_path: path,
          file_size: file.size,
          mime_type: file.type || null,
        } as any);
        if (dbErr) { toast.error(`${file.name}: ${dbErr.message}`); continue; }
      }
      await load();
    } finally { setBusy(false); }
  };

  const download = async (a: Attachment) => {
    const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(a.storage_path, 60, { download: a.filename });
    if (error || !data) { toast.error(error?.message || "fail"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (a: Attachment) => {
    await supabase.storage.from("task-attachments").remove([a.storage_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("deleted"));
    await load();
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) upload(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-4 py-5 text-center transition-colors ${
          drag ? "border-accent bg-accent/5" : "border-border bg-card-elevated hover:border-border-strong"
        }`}>
        <Upload className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{busy ? t("loading") : t("uploadHint")}</p>
        <input ref={fileRef} type="file" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map(a => {
            const Icon = iconFor(a.mime_type);
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-card-elevated px-2.5 py-2">
                <Icon className="h-4 w-4 shrink-0 text-info" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground">{a.filename}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{formatBytes(a.file_size || 0)}</p>
                </div>
                <button onClick={() => download(a)} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground" title={t("download")}>
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(a)} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-destructive" title={t("delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
