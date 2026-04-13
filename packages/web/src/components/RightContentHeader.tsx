'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { getIsSkipAuth, getUserId } from '@/utils/userId';

function WindowSmileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6.1" cy="6.6" r="0.7" fill="currentColor" />
      <circle cx="9.9" cy="6.6" r="0.7" fill="currentColor" />
      <path
        d="M5.5 9.2C6.1 10.1 7 10.6 8 10.6C9 10.6 9.9 10.1 10.5 9.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WindowMinimizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4 8H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function WindowMaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function WindowCloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11 5L5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PopoverCloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.75 4.75L11.25 11.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.25 4.75L4.75 11.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

type HeaderActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'type'> & {
  title: string;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement>;
};

function HeaderAction({ title, children, buttonRef, ...buttonProps }: HeaderActionProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="ui-content-header-action"
      title={title}
      aria-label={title}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

type IssueOption = {
  id: string;
  label: string;
  hint?: string;
};

const SATISFACTION_SCORES = Array.from({ length: 11 }, (_, index) => index);
const LOW_SCORE_ISSUE_OPTIONS: IssueOption[] = [
  {
    id: 'usability_flow',
    label: '\u64cd\u4f5c\u4fbf\u5229\u6027',
    hint: '\uff08\u5982\uff1a\u64cd\u4f5c\u6d41\u7a0b\u590d\u6742\u3001\u529f\u80fd\u5165\u53e3\u96be\u627e\u7b49\uff09',
  },
  {
    id: 'content_clarity',
    label: '\u5185\u5bb9/\u5e2e\u52a9\u8bf4\u660e\u6e05\u6670\u5ea6',
    hint: '\uff08\u5982\uff1a\u6587\u6863\u6307\u5f15\u4e0d\u660e\u786e\u3001\u95ee\u9898\u89e3\u7b54\u4e0d\u6e05\u6670\uff09',
  },
  {
    id: 'response_speed',
    label: '\u54cd\u5e94\u901f\u5ea6\u4e0e\u6548\u7387',
    hint: '\uff08\u5982\uff1a\u5bf9\u8bdd\u5ef6\u8fdf\u9ad8\u3001\u4efb\u52a1\u5904\u7406\u6162\uff09',
  },
  {
    id: 'feature_coverage',
    label: '\u529f\u80fd\u8986\u76d6\u5168\u9762\u6027',
    hint: '\uff08\u5982\uff1a\u7f3a\u5c11\u5173\u952e\u4e1a\u52a1\u573a\u666f\u652f\u6301\uff09',
  },
  {
    id: 'ui_intuitive',
    label: '\u754c\u9762\u76f4\u89c2\u4e0e\u6613\u7528\u6027',
    hint: '\uff08\u5982\uff1a\u5e03\u5c40\u6df7\u4e71\u3001\u6309\u94ae\u8bbe\u8ba1\u4e0d\u5408\u7406\uff09',
  },
  {
    id: 'system_stability',
    label: '\u7cfb\u7edf\u7a33\u5b9a\u6027',
    hint: '\uff08\u5982\uff1a\u9891\u7e41\u5361\u987f\u3001\u62a5\u9519\u6216\u5d29\u6e83\uff09',
  },
  {
    id: 'security_privacy',
    label: '\u5b89\u5168\u4e0e\u9690\u79c1\u4fdd\u62a4',
    hint: '\uff08\u5982\uff1a\u6570\u636e\u6743\u9650\u4e0d\u660e\u786e\u3001\u9690\u79c1\u62c5\u5fe7\uff09',
  },
  {
    id: 'other_issue',
    label: '\u5176\u4ed6\u95ee\u9898',
    hint: '\uff08\u8bf7\u5177\u4f53\u586b\u5199\uff09',
  },
];
const FEEDBACK_DATE_ENDPOINT = '/v1/external/survey/feedback-date';
const FEEDBACK_SAVE_ENDPOINT = 'https://voc.huaweicloud.com/survey-api/api/save';
const FEEDBACK_DATE_CHECKED_KEY = 'cat-cafe:survey-feedback-date-checked';
const DEFAULT_SURVEY_ID = 'agentarts_satisfaction';
const DEFAULT_SERVICE_ID = 'officeclaw';
const DEFAULT_CONTACT_ID = 'web_home';
const DEFAULT_FEEDBACK_SAVE_SURVEY_ID = 'hwcloudbusurvey_key_fbd25bdbdb87';
const DEFAULT_FEEDBACK_SAVE_SERVICE_ID = 'CCS2025081800123';
const DEFAULT_FEEDBACK_SAVE_CONTACT_ID = 'global.cf';
const DEFAULT_FEEDBACK_SAVE_W3ACCOUNT = 'pclclawclient';
const SCORE_QUESTION_ID = 'question_0';
const SCORE_REASON_QUESTION_ID = 'question_1';
const DETAIL_QUESTION_ID = 'question_99';
const SCORE_REASON_DEFAULT_REASON = '0';
const DETAIL_DEFAULT_SUB_REMARK = 'null';
const DETAIL_DEFAULT_REASON = '0';
const OTHER_ISSUE_MAX_LENGTH = 400;
const OTHER_ISSUE_LENGTH_ERROR_MESSAGE = '\u8bf7\u5c06\u5185\u5bb9\u63a7\u5236\u5728400\u5b57\u4ee5\u5185';
const DETAIL_MAX_LENGTH = 1000;
const DETAIL_LENGTH_ERROR_MESSAGE = '\u8bf7\u5c06\u5185\u5bb9\u63a7\u5236\u57281000\u5b57\u7b26\u4ee5\u5185';
const DETAIL_PREFILL_TEMPLATE = '\u3010\u4f7f\u7528\u573a\u666f\u3011\uff1a\n\u3010\u4f18\u5316\u610f\u89c1\u3011\uff1a';
const REQUIRED_SELECT_ERROR_MESSAGE = '\u9009\u62e9\u4e0d\u80fd\u4e3a\u7a7a';
const REQUIRED_INPUT_ERROR_MESSAGE = '\u8f93\u5165\u4e0d\u80fd\u4e3a\u7a7a';

type FeedbackDateResponse = {
  latest_feedback_date?: string;
  data?: {
    latest_feedback_date?: string;
  };
};

type FeedbackSubmitAnswer = {
  questionId: string;
  subQuestionId: string | null;
  subName: string;
  answer: string;
  subRemark?: string;
  reason?: string;
};

type FeedbackSubmitResponse = {
  error_code?: string;
  error_msg?: string;
  errorCode?: string;
  errorMsg?: string;
  msg?: string;
  code?: string | number;
  feedback_data?: string;
  message?: string;
  error?: string;
};

export function RightContentHeader() {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackPopoverMaxHeight, setFeedbackPopoverMaxHeight] = useState<number | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [lowScoreSelectedIssues, setLowScoreSelectedIssues] = useState<string[]>([]);
  const [highScoreSelectedIssues, setHighScoreSelectedIssues] = useState<string[]>([]);
  const [lowScoreDetail, setLowScoreDetail] = useState('');
  const [isDetailTooLong, setIsDetailTooLong] = useState(false);
  const [isIssueRequiredError, setIsIssueRequiredError] = useState(false);
  const [isDetailRequiredError, setIsDetailRequiredError] = useState(false);
  const [isOtherIssueRequiredError, setIsOtherIssueRequiredError] = useState(false);
  const [otherIssueDetail, setOtherIssueDetail] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const addToast = useToastStore((s) => s.addToast);
  const headerRef = useRef<HTMLDivElement>(null);
  const smileActionRef = useRef<HTMLButtonElement>(null);
  const feedbackPopoverRef = useRef<HTMLDivElement | null>(null);
  const feedbackPopoverId = useId();
  const isScoreUnselected = selectedScore == null;
  const isVeryLowScoreDetailVisible = selectedScore != null && selectedScore <= 6;
  const isLowScoreDetailVisible = selectedScore != null && selectedScore <= 8;
  const isHighScoreDetailVisible = selectedScore != null && selectedScore >= 9;
  const currentIssueOptions = LOW_SCORE_ISSUE_OPTIONS;
  const currentSelectedIssues = isHighScoreDetailVisible ? highScoreSelectedIssues : lowScoreSelectedIssues;
  const isOtherIssueSelected = currentSelectedIssues.includes('other_issue');
  const isOtherIssueTooLong = isOtherIssueSelected && otherIssueDetail.length > OTHER_ISSUE_MAX_LENGTH;
  const currentSurveyTitle = '\u60a8\u7684\u4f7f\u7528\u4f53\u9a8c\u5982\u4f55\uff1f\u6211\u4eec\u671f\u5f85\u503e\u542c';
  const currentPrimaryTitle = isHighScoreDetailVisible
    ? '\u60a8\u6700\u6ee1\u610f\u6211\u4eec\u7684\u54ea\u4e09\u4e2a\u529f\u80fd\uff1f'
    : '\u60a8\u6700\u5e0c\u671b\u6211\u4eec\u4f18\u5148\u5904\u7406\u54ea\u4e09\u4e2a\u95ee\u9898\uff1f';
  const currentPrimarySubtitle = isLowScoreDetailVisible
    ? '\uff08\u6700\u591a\u9009\u4e09\u9879\uff09'
    : '';
  const currentDetailTitle = '\u8bda\u9080\u60a8\u8be6\u7ec6\u63cf\u8ff0\u95ee\u9898\uff0c\u5e2e\u52a9\u6211\u4eec\u51c6\u786e\u8bc4\u4f30\u4e0e\u6539\u8fdb';
  const currentDetailSubtitle = null;
  const currentDetailMaxLength = DETAIL_MAX_LENGTH;
  const currentDetailPlaceholder =
    '\u8bf7\u63cf\u8ff0\u60a8\u7684\u4f7f\u7528\u573a\u666f\uff1a\n\u8bf7\u63d0\u51fa\u60a8\u7684\u4f18\u5316\u5efa\u8bae\uff1a';
  const resetFeedbackState = useCallback(() => {
    setSelectedScore(null);
    setLowScoreSelectedIssues([]);
    setHighScoreSelectedIssues([]);
    setLowScoreDetail('');
    setIsDetailTooLong(false);
    setIsIssueRequiredError(false);
    setIsDetailRequiredError(false);
    setIsOtherIssueRequiredError(false);
    setOtherIssueDetail('');
    setSubmitErrorMessage('');
    setIsSubmittingFeedback(false);
  }, []);
  const closeFeedbackPopover = useCallback(() => {
    setIsFeedbackOpen(false);
    setFeedbackPopoverMaxHeight(null);
    resetFeedbackState();
  }, [resetFeedbackState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (getIsSkipAuth()) return;
    if (window.sessionStorage.getItem(FEEDBACK_DATE_CHECKED_KEY) === '1') return;
    window.sessionStorage.setItem(FEEDBACK_DATE_CHECKED_KEY, '1');

    const surveyId = process.env.NEXT_PUBLIC_SURVEY_ID?.trim() || DEFAULT_SURVEY_ID;
    const serviceId = process.env.NEXT_PUBLIC_SURVEY_SERVICE_ID?.trim() || DEFAULT_SERVICE_ID;
    const contactId = process.env.NEXT_PUBLIC_SURVEY_CONTACT_ID?.trim() || DEFAULT_CONTACT_ID;
    const userId = getUserId();
    const query = new URLSearchParams({
      user_id: userId,
      survey_id: surveyId,
      service_id: serviceId,
      contact_id: contactId,
    });
    let cancelled = false;

    const fetchLatestFeedbackDate = async () => {
      try {
        const response = await apiFetch(`${FEEDBACK_DATE_ENDPOINT}?${query.toString()}`, {
          method: 'GET',
        });
        if (cancelled) return;
        if (!response.ok) return;

        const payload = (await response.json()) as FeedbackDateResponse;
        if (cancelled) return;
        const latestFeedbackDate =
          typeof payload?.latest_feedback_date === 'string'
            ? payload.latest_feedback_date
            : typeof payload?.data?.latest_feedback_date === 'string'
              ? payload.data.latest_feedback_date
              : '';

        if (!latestFeedbackDate) return;
        resetFeedbackState();
        setIsFeedbackOpen(true);
      } catch {
        // Ignore survey check errors to avoid blocking page render.
      }
    };

    void fetchLatestFeedbackDate();

    return () => {
      cancelled = true;
    };
  }, [resetFeedbackState]);

  useEffect(() => {
    if (isLowScoreDetailVisible) return;
    setIsIssueRequiredError(false);
    setIsDetailRequiredError(false);
    setIsOtherIssueRequiredError(false);
  }, [isLowScoreDetailVisible]);

  useEffect(() => {
    if (!isFeedbackOpen) return;

    const updatePopoverMaxHeight = () => {
      const buttonRect = smileActionRef.current?.getBoundingClientRect();
      if (!buttonRect) return;

      const contentFrameRect = headerRef.current?.parentElement?.getBoundingClientRect();
      const contentBottom = contentFrameRect?.bottom ?? window.innerHeight;
      const nextMaxHeight = Math.max(0, Math.floor(contentBottom - (buttonRect.bottom + 12) - 32));

      setFeedbackPopoverMaxHeight(nextMaxHeight);
    };

    updatePopoverMaxHeight();
    window.addEventListener('resize', updatePopoverMaxHeight);

    return () => {
      window.removeEventListener('resize', updatePopoverMaxHeight);
    };
  }, [isFeedbackOpen]);

  useEffect(() => {
    if (!isFeedbackOpen) return;

    const handlePointerDownOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (feedbackPopoverRef.current?.contains(target)) return;
      if (smileActionRef.current?.contains(target)) return;

      closeFeedbackPopover();
    };

    document.addEventListener('mousedown', handlePointerDownOutside, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside, true);
    };
  }, [closeFeedbackPopover, isFeedbackOpen]);

  const handleToggleIssue = (issue: string) => {
    const setCurrentIssues = isHighScoreDetailVisible ? setHighScoreSelectedIssues : setLowScoreSelectedIssues;
    setCurrentIssues((prev) => {
      let nextIssues = prev;
      if (prev.includes(issue)) {
        nextIssues = prev.filter((item) => item !== issue);
      } else if (prev.length < 3) {
        nextIssues = [...prev, issue];
      }

      if (nextIssues.length > 0) {
        setIsIssueRequiredError(false);
      }
      if (!nextIssues.includes('other_issue')) {
        setIsOtherIssueRequiredError(false);
      }

      return nextIssues;
    });
  };

  const handleDetailChange = useCallback(
    (value: string) => {
      if (value.length > currentDetailMaxLength) {
        setIsDetailTooLong(true);
        return;
      }
      setIsDetailTooLong(false);
      setLowScoreDetail(value);
      if (value.trim().length > 0) {
        setIsDetailRequiredError(false);
      }
    },
    [currentDetailMaxLength],
  );

  const handleDetailFocus = useCallback(() => {
    if (lowScoreDetail.trim().length > 0) return;
    setLowScoreDetail(DETAIL_PREFILL_TEMPLATE);
    setIsDetailTooLong(false);
    setIsDetailRequiredError(false);
  }, [lowScoreDetail]);

  const handleOtherIssueDetailChange = useCallback((value: string) => {
    setOtherIssueDetail(value);
    if (value.trim().length > 0) {
      setIsOtherIssueRequiredError(false);
    }
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    setSubmitErrorMessage('');

    if (!isLowScoreDetailVisible) {
      setIsIssueRequiredError(false);
      setIsDetailRequiredError(false);
      setIsOtherIssueRequiredError(false);
    }

    if (isSubmittingFeedback) return;
    if (selectedScore == null) {
      const message = '\u8bf7\u5148\u9009\u62e9\u6ee1\u610f\u5ea6\u8bc4\u5206';
      setSubmitErrorMessage(message);
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message,
        duration: 3200,
      });
      return;
    }
    if (isLowScoreDetailVisible) {
      const hasIssueSelection = currentSelectedIssues.length > 0;
      const hasDetailInput = lowScoreDetail.trim().length > 0;
      const needOtherIssueInput = currentSelectedIssues.includes('other_issue');
      const hasOtherIssueInput = otherIssueDetail.trim().length > 0;

      setIsIssueRequiredError(!hasIssueSelection);
      setIsDetailRequiredError(!hasDetailInput);
      setIsOtherIssueRequiredError(needOtherIssueInput && !hasOtherIssueInput);

      if (!hasIssueSelection || !hasDetailInput || (needOtherIssueInput && !hasOtherIssueInput)) {
        const message = '\u8bf7\u5148\u5b8c\u6210\u5fc5\u586b\u9879';
        setSubmitErrorMessage(message);
        addToast({
          type: 'error',
          title: '\u63d0\u4ea4\u5931\u8d25',
          message,
          duration: 3200,
        });
        return;
      }
    }
    if (currentSelectedIssues.includes('other_issue') && otherIssueDetail.length > OTHER_ISSUE_MAX_LENGTH) {
      setSubmitErrorMessage(OTHER_ISSUE_LENGTH_ERROR_MESSAGE);
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message: OTHER_ISSUE_LENGTH_ERROR_MESSAGE,
        duration: 3200,
      });
      return;
    }
    if (lowScoreDetail.length > currentDetailMaxLength) {
      setSubmitErrorMessage(DETAIL_LENGTH_ERROR_MESSAGE);
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message: DETAIL_LENGTH_ERROR_MESSAGE,
        duration: 3200,
      });
      return;
    }

    const surveyId = process.env.NEXT_PUBLIC_FEEDBACK_SAVE_SURVEY_ID?.trim() || DEFAULT_FEEDBACK_SAVE_SURVEY_ID;
    const serviceId = process.env.NEXT_PUBLIC_FEEDBACK_SAVE_SERVICE_ID?.trim() || DEFAULT_FEEDBACK_SAVE_SERVICE_ID;
    const contactId = process.env.NEXT_PUBLIC_FEEDBACK_SAVE_CONTACT_ID?.trim() || DEFAULT_FEEDBACK_SAVE_CONTACT_ID;
    const w3account =
      process.env.NEXT_PUBLIC_FEEDBACK_SAVE_W3ACCOUNT?.trim() || DEFAULT_FEEDBACK_SAVE_W3ACCOUNT;
    const scoreValue = String(selectedScore);
    const selectedIssueCodes = currentIssueOptions
      .map((issue, index) => (currentSelectedIssues.includes(issue.id) ? String(index + 1) : ''))
      .filter(Boolean)
      .join(',');
    const selectedIssueLabels = currentIssueOptions
      .filter((issue) => currentSelectedIssues.includes(issue.id))
      .map((issue) => issue.label)
      .join(',');
    const detailText = lowScoreDetail.trim();
    const otherIssueReason = currentSelectedIssues.includes('other_issue')
      ? otherIssueDetail.trim()
      : SCORE_REASON_DEFAULT_REASON;
    const answers: FeedbackSubmitAnswer[] = [
      {
        questionId: SCORE_QUESTION_ID,
        subQuestionId: null,
        subName: currentSurveyTitle,
        answer: scoreValue,
        subRemark: scoreValue,
        reason: SCORE_REASON_DEFAULT_REASON,
      },
      {
        questionId: SCORE_REASON_QUESTION_ID,
        subQuestionId: null,
        subName: isLowScoreDetailVisible
          ? '\u60a8\u5728\u4f7f\u7528\u8fc7\u7a0b\u4e2d\u9047\u5230\u4e86\u54ea\u4e9b\u95ee\u9898\uff1f'
          : '\u60a8\u611f\u5230\u6ee1\u610f\u7684\u539f\u56e0\u662f\uff1f',
        answer: selectedIssueCodes,
        subRemark: selectedIssueLabels,
        reason: otherIssueReason || SCORE_REASON_DEFAULT_REASON,
      },
      {
        questionId: DETAIL_QUESTION_ID,
        subQuestionId: null,
        subName: currentDetailTitle,
        answer: detailText,
        subRemark: DETAIL_DEFAULT_SUB_REMARK,
        reason: DETAIL_DEFAULT_REASON,
      },
    ];

    setIsSubmittingFeedback(true);
    try {
      const response = await fetch(FEEDBACK_SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf8' },
        body: JSON.stringify({
          data: {
            surveyId: surveyId,
            serviceId: serviceId,
            contactId: contactId,
            w3account,
            answers,
          },
        }),
      });

      let payload: FeedbackSubmitResponse | null = null;
      try {
        payload = (await response.json()) as FeedbackSubmitResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload?.error_msg?.trim() ||
          payload?.errorMsg?.trim() ||
          payload?.message?.trim() ||
          payload?.msg?.trim() ||
          payload?.error?.trim() ||
          `\u63d0\u4ea4\u5931\u8d25\uff08HTTP ${response.status}\uff09`;
        setSubmitErrorMessage(message);
        addToast({
          type: 'error',
          title: '\u63d0\u4ea4\u5931\u8d25',
          message,
          duration: 4200,
        });
        return;
      }

      if (payload?.error_code || payload?.errorCode) {
        const message =
          payload?.error_msg?.trim() ||
          payload?.errorMsg?.trim() ||
          payload?.message?.trim() ||
          payload?.msg?.trim() ||
          payload?.error_code ||
          payload?.errorCode || '';
        setSubmitErrorMessage(message);
        addToast({
          type: 'error',
          title: '\u63d0\u4ea4\u5931\u8d25',
          message,
          duration: 4200,
        });
        return;
      }

      setSubmitErrorMessage('');
      addToast({
        type: 'success',
        title: '\u63d0\u4ea4\u6210\u529f',
        message: '\u611f\u8c22\u60a8\u7684\u53cd\u9988',
        duration: 2600,
      });
      closeFeedbackPopover();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : '\u7f51\u7edc\u5f02\u5e38';
      setSubmitErrorMessage(message);
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message,
        duration: 4200,
      });
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [
    addToast,
    currentDetailMaxLength,
    currentIssueOptions,
    currentSelectedIssues,
    closeFeedbackPopover,
    isLowScoreDetailVisible,
    isSubmittingFeedback,
    lowScoreDetail,
    otherIssueDetail,
    selectedScore,
  ]);

  return (
    <div ref={headerRef} className="ui-content-header" data-testid="right-content-header">
      <div aria-hidden="true" />
      <div className="ui-content-header-actions">
        <div className="ui-content-header-feedback-anchor">
          <HeaderAction
            title={'\u7b11\u8138'}
            buttonRef={smileActionRef}
            aria-expanded={isFeedbackOpen}
            aria-controls={feedbackPopoverId}
            aria-haspopup="dialog"
            onClick={() => setIsFeedbackOpen(true)}
          >
            <WindowSmileIcon />
          </HeaderAction>
          {isFeedbackOpen ? (
            <div
              ref={feedbackPopoverRef}
              id={feedbackPopoverId}
              role="dialog"
              aria-modal="false"
              aria-label={'\u6ee1\u610f\u5ea6\u8bc4\u5206'}
              style={{ height: 'auto' }}
              className={
                isScoreUnselected
                  ? 'ui-content-header-feedback-popover ui-content-header-feedback-popover-compact'
                  : 'ui-content-header-feedback-popover'
              }
            >
              <div
                className="ui-content-header-feedback-popover-content"
                style={{ maxHeight: feedbackPopoverMaxHeight != null ? `${feedbackPopoverMaxHeight}px` : undefined }}
              >
                <div className="ui-content-header-feedback-popover-header">
                  <p className="ui-content-header-feedback-popover-title">
                    {currentSurveyTitle}
                  </p>
                  <button
                    type="button"
                    aria-label={'\u5173\u95ed\u6ee1\u610f\u5ea6\u8bc4\u4ef7\u5f39\u7a97'}
                    className="ui-content-header-feedback-popover-close"
                    onClick={closeFeedbackPopover}
                  >
                    <PopoverCloseIcon />
                  </button>
                </div>
                <div className="ui-content-header-feedback-popover-body">
                  <div className="ui-content-header-feedback-score-row">
                    {SATISFACTION_SCORES.map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setSelectedScore(score)}
                        aria-label={`\u8bc4\u5206 ${score}`}
                        aria-pressed={selectedScore === score}
                        className={
                          selectedScore === score
                            ? isHighScoreDetailVisible
                              ? 'ui-content-header-feedback-score ui-content-header-feedback-score-active-positive'
                              : isVeryLowScoreDetailVisible
                                ? 'ui-content-header-feedback-score ui-content-header-feedback-score-active-negative'
                              : 'ui-content-header-feedback-score ui-content-header-feedback-score-active-warning'
                            : 'ui-content-header-feedback-score'
                        }
                      >
                        {selectedScore === score
                          ? isHighScoreDetailVisible
                            ? '\ud83d\ude42'
                            : isVeryLowScoreDetailVisible
                              ? '\u2639\ufe0f'
                              : isLowScoreDetailVisible
                              ? '\ud83d\ude10'
                              : score
                          : score}
                      </button>
                    ))}
                  </div>
                  {isLowScoreDetailVisible || isHighScoreDetailVisible ? (
                    <div className="ui-content-header-feedback-low-score">
                      <div className="ui-content-header-feedback-low-score-section">
                        <p className="ui-content-header-feedback-low-score-title">
                          {currentPrimaryTitle}
                          <span className="ui-content-header-feedback-low-score-subtitle">
                            {currentPrimarySubtitle}
                          </span>
                        </p>
                        <div className="ui-content-header-feedback-low-score-options">
                          {currentIssueOptions.map((issue) => {
                            const isChecked = currentSelectedIssues.includes(issue.id);
                            const isDisabled = !isChecked && currentSelectedIssues.length >= 3;
                            return (
                              <label
                                key={issue.id}
                                className={
                                  isDisabled
                                    ? 'ui-content-header-feedback-low-score-option ui-content-header-feedback-low-score-option-disabled'
                                    : 'ui-content-header-feedback-low-score-option'
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => handleToggleIssue(issue.id)}
                                />
                                <span className="ui-content-header-feedback-low-score-option-content">
                                  <span className="ui-content-header-feedback-low-score-option-label">{issue.label}</span>
                                  {issue.hint ? (
                                    <span className="ui-content-header-feedback-low-score-option-hint">{issue.hint}</span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {isLowScoreDetailVisible && isIssueRequiredError ? (
                          <p className="ui-content-header-feedback-other-error">
                            {REQUIRED_SELECT_ERROR_MESSAGE}
                          </p>
                        ) : null}
                        {isOtherIssueSelected ? (
                          <>
                            <input
                              type="text"
                              className="ui-input"
                              placeholder={'\u662f\u4ec0\u4e48\u95ee\u9898\u5462\uff1f\u8bf7\u7b80\u8981\u8bf4\u660e'}
                              value={otherIssueDetail}
                              onChange={(event) => handleOtherIssueDetailChange(event.target.value)}
                            />
                            {isLowScoreDetailVisible && isOtherIssueRequiredError ? (
                              <p className="ui-content-header-feedback-other-error">
                                {REQUIRED_INPUT_ERROR_MESSAGE}
                              </p>
                            ) : isOtherIssueTooLong ? (
                              <p className="ui-content-header-feedback-other-error">
                                {OTHER_ISSUE_LENGTH_ERROR_MESSAGE}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      <div className="ui-content-header-feedback-low-score-section">
                        <p className="ui-content-header-feedback-low-score-title">
                          {currentDetailTitle}
                          {currentDetailSubtitle ? (
                            <span className="ui-content-header-feedback-low-score-subtitle">{currentDetailSubtitle}</span>
                          ) : null}
                        </p>
                        <div className="ui-content-header-feedback-detail-shell">
                          <textarea
                            className="ui-textarea ui-content-header-feedback-detail-input"
                            placeholder={currentDetailPlaceholder}
                            value={lowScoreDetail}
                            onFocus={handleDetailFocus}
                            onChange={(event) => handleDetailChange(event.target.value)}
                          />
                          <span className="ui-content-header-feedback-detail-counter">
                            {lowScoreDetail.length}/{currentDetailMaxLength}
                          </span>
                        </div>
                        {isLowScoreDetailVisible && isDetailRequiredError ? (
                          <p className="ui-content-header-feedback-detail-error">
                            {REQUIRED_INPUT_ERROR_MESSAGE}
                          </p>
                        ) : isDetailTooLong ? (
                          <p className="ui-content-header-feedback-detail-error">
                            {DETAIL_LENGTH_ERROR_MESSAGE}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                {isLowScoreDetailVisible || isHighScoreDetailVisible ? (
                  <div className="ui-content-header-feedback-low-score-actions">
                    {submitErrorMessage ? (
                      <p className="mr-3 self-center text-xs text-red-600">{submitErrorMessage}</p>
                    ) : null}
                    <button
                      type="button"
                      className="ui-button-default ui-modal-action-button"
                      onClick={closeFeedbackPopover}
                    >
                      {'\u53d6\u6d88'}
                    </button>
                    <button
                      type="button"
                      className="ui-button-primary ui-modal-action-button"
                      onClick={() => void handleSubmitFeedback()}
                      disabled={isSubmittingFeedback}
                    >
                      {isSubmittingFeedback ? '\u63d0\u4ea4\u4e2d...' : '\u63d0\u4ea4'}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="ui-content-header-feedback-popover-arrow" aria-hidden="true" />
            </div>
          ) : null}
        </div>
        <div className="ui-content-header-divider" data-testid="right-content-header-divider" aria-hidden="true" />
        <HeaderAction title={'\u6700\u5c0f\u5316'}>
          <WindowMinimizeIcon />
        </HeaderAction>
        <HeaderAction title={'\u6700\u5927\u5316'}>
          <WindowMaximizeIcon />
        </HeaderAction>
        <HeaderAction title={'\u5173\u95ed'}>
          <WindowCloseIcon />
        </HeaderAction>
      </div>
    </div>
  );
}
