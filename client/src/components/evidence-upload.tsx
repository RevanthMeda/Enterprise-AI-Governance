import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, File, Trash2, Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/api-url";
import { formatLawPackLabel, formatLegalProfileLabel } from "@/lib/governance-display";
import { captureCsrfTokenFromResponse, getCsrfToken, queryClient } from "@/lib/queryClient";
import type { EvidenceFile } from "@shared/schema";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getEvidenceGovernanceMetadata(file: EvidenceFile) {
  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : null;

  return {
    legalProfileApplied:
      typeof metadata?.legalProfileApplied === "string" ? metadata.legalProfileApplied : null,
    lawPackIdsApplied: Array.isArray(metadata?.lawPackIdsApplied)
      ? metadata.lawPackIdsApplied.filter((entry): entry is string => typeof entry === "string")
      : [],
    lawPackSources: Array.isArray(metadata?.lawPackSources)
      ? metadata.lawPackSources.filter((entry): entry is string => typeof entry === "string")
      : [],
    governanceScopeSource:
      typeof metadata?.governanceScopeSource === "string" ? metadata.governanceScopeSource : null,
  };
}

function getEvidenceUserMetadata(file: EvidenceFile) {
  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : null;

  return {
    category: typeof metadata?.category === "string" ? metadata.category : null,
    tags: Array.isArray(metadata?.tags)
      ? metadata.tags.filter((entry): entry is string => typeof entry === "string")
      : [],
    expiryDate: typeof metadata?.expiryDate === "string" ? metadata.expiryDate : null,
  };
}

function getExpiryBadge(expiryDate: string | null) {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

  if (daysUntilExpiry < 0) {
    return {
      label: `Expired ${expiry.toLocaleDateString()}`,
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300",
    };
  }

  if (daysUntilExpiry <= 30) {
    return {
      label: `Expires ${expiry.toLocaleDateString()}`,
      className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
    };
  }

  return {
    label: `Expires ${expiry.toLocaleDateString()}`,
    className: "border-border text-muted-foreground",
  };
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
  const [category, setCategory] = useState("policy");
  const [tags, setTags] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
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
      const res = await fetch(resolveApiUrl(`/api/evidence?${queryParams.toString()}`), { credentials: "include" });
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
      formData.append("category", category);
      formData.append("tags", tags);
      if (expiryDate) formData.append("expiryDate", expiryDate);
      const csrfToken = getCsrfToken();
      const res = await fetch(resolveApiUrl("/api/evidence"), {
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
      const res = await fetch(resolveApiUrl(`/api/evidence/${id}`), {
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
            category={category}
            onCategoryChange={setCategory}
            tags={tags}
            onTagsChange={setTags}
            expiryDate={expiryDate}
            onExpiryDateChange={setExpiryDate}
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
      category={category}
      onCategoryChange={setCategory}
      tags={tags}
      onTagsChange={setTags}
      expiryDate={expiryDate}
      onExpiryDateChange={setExpiryDate}
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
  category,
  onCategoryChange,
  tags,
  onTagsChange,
  expiryDate,
  onExpiryDateChange,
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
  category: string;
  onCategoryChange: (value: string) => void;
  tags: string;
  onTagsChange: (value: string) => void;
  expiryDate: string;
  onExpiryDateChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="font-medium">Category</span>
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-evidence-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="policy">Policy</SelectItem>
              <SelectItem value="control_test">Control test</SelectItem>
              <SelectItem value="approval">Approval</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="runtime">Runtime</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Tags</span>
          <Input
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="audit, renewal"
            className="h-8 text-xs"
            data-testid="input-evidence-tags"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Expiry date</span>
          <Input
            type="date"
            value={expiryDate}
            onChange={(event) => onExpiryDateChange(event.target.value)}
            className="h-8 text-xs"
            data-testid="input-evidence-expiry"
          />
        </label>
      </div>

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
                {(() => {
                  const governance = getEvidenceGovernanceMetadata(file);
                  const userMetadata = getEvidenceUserMetadata(file);
                  const expiryBadge = getExpiryBadge(userMetadata.expiryDate);
                  return (
                    <>
                <p className="text-xs font-medium truncate">{file.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatFileSize(file.fileSize)} - {file.uploadedBy} - {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : ""}
                </p>
                      {(userMetadata.category || userMetadata.tags.length > 0 || expiryBadge) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {userMetadata.category ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                              {userMetadata.category.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                          {userMetadata.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="h-5 px-1.5 text-[9px]">
                              {tag}
                            </Badge>
                          ))}
                          {expiryBadge ? (
                            <Badge variant="outline" className={`h-5 px-1.5 text-[9px] ${expiryBadge.className}`}>
                              {expiryBadge.label}
                            </Badge>
                          ) : null}
                        </div>
                      )}
                      {(governance.legalProfileApplied || governance.lawPackIdsApplied.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {governance.legalProfileApplied && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                              {formatLegalProfileLabel(governance.legalProfileApplied)}
                            </Badge>
                          )}
                          {governance.lawPackIdsApplied.map((packId) => (
                            <Badge key={packId} variant="secondary" className="h-5 px-1.5 text-[9px]">
                              {formatLawPackLabel(packId)}
                            </Badge>
                          ))}
                          {governance.governanceScopeSource && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                              Scope: {governance.governanceScopeSource.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                      )}
                      {governance.lawPackSources.length > 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Sources: {governance.lawPackSources.join(", ")}
                        </p>
                      )}
                    </>
                  );
                })()}
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
      const res = await fetch(resolveApiUrl(`/api/evidence?systemId=${encodeURIComponent(systemId)}`), { credentials: "include" });
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
