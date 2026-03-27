'use client';

import { useMemo, useState } from 'react';
import { DRAFT_MODEL_OPTIONS, ModelSelectDropdownDraft, type DraftModelOption } from './ModelSelectDropdownDraft';

interface CreateAgentModalDraftProps {
  open: boolean;
  name?: string;
  description?: string;
  selectedModelId?: string | null;
  models?: DraftModelOption[];
  title?: string;
  onClose?: () => void;
  onConfirm?: (payload: { name: string; description: string; selectedModelId: string | null }) => void;
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6 text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 10.5L12 7L15.5 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 17.5V18C6 18.55 6.45 19 7 19H17C17.55 19 18 18.55 18 18V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-5 w-5 text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CreateAgentModalDraft({
  open,
  name = 'BOT',
  description = '',
  selectedModelId = 'deepseek-v3-2',
  models = DRAFT_MODEL_OPTIONS,
  title = '创建智能体',
  onClose,
  onConfirm,
}: CreateAgentModalDraftProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftModelId, setDraftModelId] = useState<string | null>(selectedModelId);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const selectedModel = useMemo(
    () => models.find((item) => item.id === draftModelId) ?? models[0] ?? null,
    [draftModelId, models],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 py-8">
      <div className="relative flex w-[860px] flex-col overflow-visible rounded-2xl bg-white shadow-[0_18px_42px_rgba(0,0,0,0.14)]">
        <div className="flex h-[72px] items-center justify-between border-b border-[#E9EDF3] px-6">
          <h2 className="text-[28px] font-bold text-[#20242B]">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 transition hover:bg-[#F5F7FA]">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-[18px] px-6 pb-[22px] pt-5">
          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">名称</div>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="h-[52px] w-full rounded-[10px] border border-[#D8DEE8] px-4 text-base text-[#2D3643] outline-none"
            />
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">描述（可选）</div>
            <div className="rounded-[10px] border border-[#D8DEE8] bg-white px-4 py-3">
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="请输入"
                maxLength={1000}
                className="h-[72px] w-full resize-none border-0 bg-transparent text-sm text-[#2D3643] outline-none placeholder:text-[#A4ADBA]"
              />
              <div className="text-right text-xs text-[#A4ADBA]">{draftDescription.length}/1000</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">图标</div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#75B8FF] text-[28px] text-white">🤖</div>
              <button
                type="button"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#D8DEE8] bg-white transition hover:bg-[#F8FAFC]"
              >
                <UploadIcon />
              </button>
            </div>
            <div className="text-xs text-[#8F98A7]">支持上传 png、jpeg、gif、jpg 格式图片，限制 200kb 内</div>
          </div>

          <div className="relative space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">模型</div>
            <button
              type="button"
              onClick={() => setModelMenuOpen((current) => !current)}
              className="flex h-12 w-full items-center justify-between rounded-[10px] border border-[#D8DEE8] bg-white px-[14px] text-left"
            >
              <span className="text-[15px] text-[#2D3643]">{selectedModel?.name ?? '请选择模型'}</span>
              <ChevronDownIcon />
            </button>

            {modelMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-20">
                <ModelSelectDropdownDraft
                  items={models}
                  selectedId={draftModelId}
                  onSelect={(item) => {
                    setDraftModelId(item.id);
                    setModelMenuOpen(false);
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[42px] min-w-[112px] rounded-full border border-[#C9D1DC] bg-white px-6 text-base font-medium text-[#2D3643] transition hover:bg-[#F8FAFC]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirm?.({
                  name: draftName,
                  description: draftDescription,
                  selectedModelId: draftModelId,
                })
              }
              className="h-[42px] min-w-[112px] rounded-full bg-[#1E2430] px-6 text-base font-semibold text-white transition hover:bg-[#151A22]"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
