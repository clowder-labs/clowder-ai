'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { AgentManagementIcon } from './AgentManagementIcon';

interface UploadFile {
  path: string;
  content: string; // base64
  size: number;
}

interface UploadSkillModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SKILL_UPLOAD_LIMITS = {
  maxFiles: 100,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
} as const;

function CloseIcon() {
  return <AgentManagementIcon name="close" className="h-4 w-4" />;
}

function RequiredIndicator() {
  return (
    <span className="ml-1 text-red-500" aria-hidden="true" data-testid="required-indicator">
      *
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function validateSkillUpload(name: string, files: UploadFile[]): string | null {
  if (!name.trim()) return '请输入技能名称';
  if (files.length === 0) return '请选择文件';
  if (files.length > SKILL_UPLOAD_LIMITS.maxFiles) {
    return `文件数量不能超过 ${SKILL_UPLOAD_LIMITS.maxFiles} 个`;
  }
  if (!files.some((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'))) {
    return '必须包含 SKILL.md 文件';
  }

  const oversizedFile = files.find((file) => file.size > SKILL_UPLOAD_LIMITS.maxFileBytes);
  if (oversizedFile) {
    return `文件 ${oversizedFile.path} 超过单文件限制（${formatBytes(SKILL_UPLOAD_LIMITS.maxFileBytes)}）`;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > SKILL_UPLOAD_LIMITS.maxTotalBytes) {
    return `文件总大小不能超过 ${formatBytes(SKILL_UPLOAD_LIMITS.maxTotalBytes)}`;
  }

  return null;
}

export function UploadSkillModal({ open, onClose, onSuccess }: UploadSkillModalProps) {
  const [name, setName] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setName('');
    setFiles([]);
    setFileNames([]);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  const readFiles = useCallback(async (fileList: FileList) => {
    const newEntries: UploadFile[] = [];

    for (const file of Array.from(fileList)) {
      const relPath = ('webkitRelativePath' in file ? (file.webkitRelativePath as string) : '') || file.name;
      const base64 = await fileToBase64(file);
      newEntries.push({ path: relPath, content: base64, size: file.size });
    }

    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.path));
      return [...prev, ...newEntries.filter((f) => !existing.has(f.path))];
    });
    setFileNames((prev) => {
      const existing = new Set(prev);
      return [...prev, ...newEntries.map((f) => f.path).filter((n) => !existing.has(n))];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileNames((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        void readFiles(e.dataTransfer.files);
      }
    },
    [readFiles],
  );

  const handleSubmit = useCallback(async () => {
    const validationError = validateSkillUpload(name, files);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/skills/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          files: files.map(({ path, content }) => ({ path, content })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (data.success) {
        handleClose();
        onSuccess();
      } else {
        setError(data.error ?? (res.status === 413 ? '上传内容过大，请减少文件数量或体积' : '上传失败'));
      }
    } catch {
      setError('网络错误，请确认本地 API 服务已启动，或减少上传文件数量后重试');
    } finally {
      setUploading(false);
    }
  }, [files, handleClose, name, onSuccess]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="upload-skill-overlay">
      <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-bold">导入技能</h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="close"
            className="flex h-6 w-6 items-center justify-center rounded text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            技能名称
            <RequiredIndicator />
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入"
            className="ui-input w-full rounded px-3 py-2 text-xs"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            选择文件
            <RequiredIndicator />
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
              isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
            }`}
          >
            <svg
              className="mx-auto mb-2 h-8 w-8 text-gray-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-xs text-gray-400">拖拽文件到这里</p>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              选择文件
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              选择文件夹
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => e.target.files && void readFiles(e.target.files)}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(e) => e.target.files && void readFiles(e.target.files)}
            className="hidden"
          />

          {fileNames.length > 0 && (
            <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto rounded bg-gray-50 px-2 py-1.5 text-[10px] text-gray-600">
              {fileNames.map((n, i) => (
                <div key={`${n}-${i}`} className="group flex items-center justify-between">
                  <span className="flex-1 truncate">{n}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-1 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-[10px] text-gray-500">
            最多 {SKILL_UPLOAD_LIMITS.maxFiles} 个文件，单文件不超过 {formatBytes(SKILL_UPLOAD_LIMITS.maxFileBytes)}，
            总大小不超过 {formatBytes(SKILL_UPLOAD_LIMITS.maxTotalBytes)}。
          </p>
        </div>

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="ui-button-default ui-modal-action-button">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading || !name.trim() || files.length === 0}
            className="ui-button-primary ui-modal-action-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  );
}
