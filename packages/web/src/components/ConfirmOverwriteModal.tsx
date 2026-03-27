'use client';

interface ConfirmOverwriteModalProps {
  open: boolean;
  skillName: string;
  existingSource: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const sourceLabels: Record<string, string> = {
  local: '本地上传',
  skillhub: 'SkillHub 安装',
  unknown: '未知来源',
};

export function ConfirmOverwriteModal({
  open,
  skillName,
  existingSource,
  onConfirm,
  onCancel,
}: ConfirmOverwriteModalProps) {
  if (!open) return null;

  const sourceLabel = sourceLabels[existingSource] ?? existingSource;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-5 h-5 text-yellow-500 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 9v4m0 4h.01M12 3l9.5 16.5H2.5L12 3z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-sm font-bold text-gray-800">同名 Skill 已存在</h3>
        </div>

        <p className="text-xs text-gray-600 mb-1">
          Skill <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-800 font-mono">{skillName}</code> 已存在
          （来源：{sourceLabel}）。
        </p>
        <p className="text-xs text-gray-600 mb-5">是否覆盖已有内容？覆盖后无法撤销。</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-medium rounded bg-red-500 text-white hover:bg-red-600"
          >
            覆盖
          </button>
        </div>
      </div>
    </div>
  );
}
