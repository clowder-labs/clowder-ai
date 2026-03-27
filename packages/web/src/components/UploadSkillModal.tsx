'use client';

import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { ConfirmOverwriteModal } from './ConfirmOverwriteModal';

interface UploadFile {
  path: string;
  content: string; // base64
}

interface UploadSkillModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:xxx;base64,xxxx → extract base64 part
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadSkillModal({ open, onClose, onSuccess }: UploadSkillModalProps) {
  const [name, setName] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skippedFiles, setSkippedFiles] = useState<{ path: string; reason: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [conflictSource, setConflictSource] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setName('');
    setFiles([]);
    setFileNames([]);
    setError(null);
    setSkippedFiles([]);
    setShowConflict(false);
    setConflictSource('');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const readFiles = useCallback(async (fileList: FileList) => {
    const newEntries: UploadFile[] = [];

    for (const file of Array.from(fileList)) {
      const relPath = ('webkitRelativePath' in file ? (file.webkitRelativePath as string) : '') || file.name;
      const base64 = await fileToBase64(file);
      newEntries.push({ path: relPath, content: base64 });
    }

    // Append to existing files, skip duplicates by path
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
        readFiles(e.dataTransfer.files);
      }
    },
    [readFiles],
  );

  const doUpload = useCallback(
    async (force: boolean) => {
      const res = await apiFetch('/api/skills/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), files, force }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        skipped?: { path: string; reason: string }[];
        conflict?: { name: string; source: string };
      };

      if (res.status === 409 && data.conflict) {
        // 冲突，显示确认框
        setConflictSource(data.conflict.source);
        setShowConflict(true);
        return;
      }

      if (data.success) {
        if (data.skipped?.length) {
          setSkippedFiles(data.skipped);
          setError('部分文件被跳过，请查看下方提示');
        } else {
          handleClose();
          onSuccess();
        }
      } else {
        setError(data.error ?? '上传失败');
      }
    },
    [name, files, handleClose, onSuccess],
  );

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError('请输入 Skill 名称');
      return;
    }
    if (files.length === 0) {
      setError('请选择文件');
      return;
    }
    if (!files.some((f) => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'))) {
      setError('必须包含 SKILL.md 文件');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await doUpload(false);
    } catch {
      setError('网络错误');
    } finally {
      setUploading(false);
    }
  }, [name, files, doUpload]);

  const handleOverwriteConfirm = useCallback(async () => {
    setShowConflict(false);
    setUploading(true);
    setError(null);
    try {
      await doUpload(true);
    } catch {
      setError('网络错误');
    } finally {
      setUploading(false);
    }
  }, [doUpload]);

  const handleOverwriteCancel = useCallback(() => {
    setShowConflict(false);
  }, []);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-sm font-bold text-gray-800 mb-5">上传 Skill</h3>

          {/* Name input */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Skill 名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-custom-skill"
              className="w-full text-xs px-3 py-2 rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* File upload */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">选择文件</label>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
              }`}
            >
              <svg
                className="w-8 h-8 mx-auto text-gray-300 mb-2"
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
              <p className="text-xs text-gray-400">拖拽文件到此处</p>
            </div>

            {/* Buttons below drop zone */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
              >
                选择文件
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex-1 px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
              >
                选择文件夹
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => e.target.files && readFiles(e.target.files)}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              {...({ webkitdirectory: '' } as Record<string, string>)}
              onChange={(e) => e.target.files && readFiles(e.target.files)}
              className="hidden"
            />

            {/* File list */}
            {fileNames.length > 0 && (
              <div className="mt-2 text-[10px] text-gray-600 bg-gray-50 rounded px-2 py-1.5 max-h-32 overflow-y-auto space-y-0.5">
                {fileNames.map((n, i) => (
                  <div key={`${n}-${i}`} className="flex items-center justify-between group">
                    <span className="truncate flex-1">{n}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

          {/* Skipped files warning */}
          {skippedFiles.length > 0 && (
            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-[10px] font-medium text-yellow-700 mb-1">被跳过的文件:</p>
              <div className="max-h-20 overflow-y-auto space-y-0.5">
                {skippedFiles.map((sf, i) => (
                  <div key={`${sf.path}-${i}`} className="text-[10px] text-yellow-600 flex gap-1">
                    <span className="font-mono truncate max-w-[180px]">{sf.path}</span>
                    <span className="shrink-0">— {sf.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
            >
              {skippedFiles.length > 0 ? '关闭' : '取消'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={uploading || !name.trim() || files.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? '上传中...' : '上传'}
            </button>
          </div>
        </div>
      </div>

      {/* Overwrite confirmation modal */}
      <ConfirmOverwriteModal
        open={showConflict}
        skillName={name.trim()}
        existingSource={conflictSource}
        onConfirm={handleOverwriteConfirm}
        onCancel={handleOverwriteCancel}
      />
    </>
  );
}
