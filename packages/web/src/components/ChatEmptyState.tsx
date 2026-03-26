import type { ReactNode } from 'react';
import { BootcampIcon } from './icons/BootcampIcon';

interface ChatEmptyStateProps {
  bootcampCount: number;
  isCurrentBootcampThread: boolean;
  onOpenBootcampList: () => void;
}

interface EmptyStateCard {
  accentClassName: string;
  description: string;
  icon: ReactNode;
  title: string;
}

const SHOW_BOOTCAMP_ENTRY = false;

const COPY = {
  headingBrand: 'OfficeClaw',
  headingPunctuation: '，',
  headingMain: '制定目标自动规划执行',
  subheading: '即刻部署专属 AI 专家，成为 7x24 小时在线的超级助手。',
  cards: [
    {
      title: '智能体配置',
      description: '设置智能体人设及记忆，让 OfficeClaw 更了解你。',
    },
    {
      title: '一键接入IM',
      description: '一键接入飞书、钉钉、小艺、WeLink 渠道，无缝推进办公流程。',
    },
  ],
  bootcampList: '我的训练营',
  bootcampStart: '第一次来？开始猫猫训练营',
} as const;

const heroCards: EmptyStateCard[] = [
  {
    title: COPY.cards[0].title,
    description: COPY.cards[0].description,
    icon: <RocketCardIcon />,
    accentClassName: 'bg-[#FFF1EB] text-[#FF7A59]',
  },
  {
    title: COPY.cards[1].title,
    description: COPY.cards[1].description,
    icon: <ImCardIcon />,
    accentClassName: 'bg-[#EEF1FF] text-[#5B6CFF]',
  },
];

export function ChatEmptyState({
  bootcampCount,
  isCurrentBootcampThread,
  onOpenBootcampList,
}: ChatEmptyStateProps) {
  const shouldShowBootcampEntry = SHOW_BOOTCAMP_ENTRY && !isCurrentBootcampThread;

  return (
    <section className="min-h-full px-4 py-10 sm:px-6" data-testid="chat-empty-state">
      <div className="mx-auto flex min-h-[calc(100vh-21rem)] max-w-4xl items-center justify-center">
        <div className="w-full text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.03em] text-[#1F1F24] sm:text-[42px]">
              <span className="text-[#4D6BFF]">{COPY.headingBrand}</span>
              <span className="text-[#4D6BFF]">{COPY.headingPunctuation}</span>
              <span>{COPY.headingMain}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#8E8E98] sm:text-[15px]">{COPY.subheading}</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {heroCards.map((card) => (
              <article
                key={card.title}
                className="rounded-[22px] border border-[#EEF0F5] bg-white px-6 py-6 text-left shadow-[0_14px_40px_rgba(17,24,39,0.05)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${card.accentClassName}`}
                  >
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[#202127]">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#8E8E98]">{card.description}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {shouldShowBootcampEntry &&
            (bootcampCount > 0 ? (
              <button
                type="button"
                onClick={onOpenBootcampList}
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                data-testid="empty-state-bootcamp-list"
              >
                <BootcampIcon className="h-4 w-4" />
                {COPY.bootcampList}（{bootcampCount}）
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenBootcampList}
                className="mt-8 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
                data-testid="empty-state-bootcamp"
              >
                <BootcampIcon className="h-4 w-4" />
                {COPY.bootcampStart}
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}

function RocketCardIcon() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M18.5 4.5c3.6 1 6.4 3.8 7.4 7.4l-5.3 5.3-7.4-7.4 5.3-5.3Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M12.7 10.2 7.8 15.1c-1.7 1.7-2.8 3.9-3.2 6.2l-.9 5.2 5.2-.9c2.4-.4 4.5-1.5 6.2-3.2l4.9-4.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19.8" cy="12.2" r="1.9" fill="white" />
      <path d="M8.3 21.9 5.6 28l6.1-2.7" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

function ImCardIcon() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="7" width="11" height="14" rx="3" fill="currentColor" opacity="0.9" />
      <rect x="17" y="11" width="11" height="14" rx="3" fill="currentColor" opacity="0.75" />
      <path
        d="M11 21v4.2c0 .4.5.7.8.4l3.7-3.1M24 25v4.2c0 .4-.5.7-.8.4L19.5 26"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
