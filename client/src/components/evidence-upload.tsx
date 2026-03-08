import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, File, Trash2, Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/api-url";
import { captureCsrfTokenFromResponse, getCsrfToken, queryClient } from "@/lib/queryClient";
import type { EvidenceFile } from "@shared/schema";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

interface EvidenceUploadProps {
  systemId: string;
  controlId?: string;
  workflowId?: string;
  compact?: boolean;
}

export function EvidenceUpload({ systemId, controlId, workflowId, compact }: EvidenceUploadProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const queryParams = new URLSearchParams();
  queryParams.set("systemId", systemId);
  if (controlId) queryParams.set("controlId", controlId);
  if (workflowId) queryParams.set("workflowId", workflowId);

  const queryKey = ["/api/evidence", queryParams.toString()];

  const { data: files = [], isLoading } = useQuery<EvidenceFile[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/evidence?${queryParams.toString()}`, { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Failed to fetch evidence");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("systemId", systemId);
      if (controlId) formData.append("controlId", controlId);
      if (workflowId) formData.append("workflowId", workflowId);
      const csrfToken = getCsrfToken();
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        body: formData,
        credentials: "include",
      });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      toast({ title: "Evidence uploaded successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const csrfToken = getCsrfToken();
      const res = await fetch(`/api/evidence/${id}`, {
        method: "DELETE",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        credentials: "include",
      });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence"] });
      toast({ title: "Evidence file deleted" });
    },
  });

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (let i = 0; i < fileList.length; i++) {
      await uploadMutation.mutateAsync(fileList[i]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  if (compact) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-[10px]" data-testid={`button-evidence-${controlId || workflowId || systemId}`}>
            <Paperclip className="h-3 w-3 mr-1" />
            {files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""}` : "Attach"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Evidence Files</DialogTitle>
          </DialogHeader>
          <EvidenceContent
            files={files}
            isLoading={isLoading}
            uploading={uploading}
            dragOver={dragOver}
            fileInputRef={fileInputRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onUpload={handleUpload}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EvidenceContent
      files={files}
      isLoading={isLoading}
      uploading={uploading}
      dragOver={dragOver}
      fileInputRef={fileInputRef}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onUpload={handleUpload}
      onDelete={(id) => deleteMutation.mutate(id)}
    />
  );
}

function EvidenceContent({
  files,
  isLoading,
  uploading,
  dragOver,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onUpload,
  onDelete,
}: {
  files: EvidenceFile[];
  isLoading: boolean;
  uploading: boolean;
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onUpload: (files: FileList | null) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="dropzone-evidence"
      >
        <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          {uploading ? "Uploading..." : "Drop files here or click to browse"}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">Max 50MB per file</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onUpload(e.target.files)}
          data-testid="input-evidence-file"
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{files.length} file{files.length > 1 ? "s" : ""} attached</p>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 group"
              data-testid={`evidence-file-${file.id}`}
            >
              <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{file.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatFileSize(file.fileSize)} - {file.uploadedBy} - {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : ""}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={resolveApiUrl(`/api/evidence/${file.id}/download`)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-background"
                  data-testid={`button-download-evidence-${file.id}`}
                >
                  <Download className="h-3 w-3 text-muted-foreground" />
                </a>
                <button
                  className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-background"
                  onClick={() => onDelete(file.id)}
                  data-testid={`button-delete-evidence-${file.id}`}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EvidenceCount({ systemId }: { systemId: string }) {
  const { data: files = [] } = useQuery<EvidenceFile[]>({
    queryKey: ["/api/evidence", `systemId=${systemId}`],
    queryFn: async () => {
      const res = await fetch(`/api/evidence?systemId=${systemId}`, { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Failed to fetch evidence");
      return res.json();
    },
  });

  if (files.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`evidence-count-${systemId}`}>
      <Paperclip className="h-3 w-3" />
      {files.length} evidence file{files.length > 1 ? "s" : ""}
    </span>
  );
}
