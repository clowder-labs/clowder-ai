/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

type ParsedField =
  | { kind: 'any'; raw: string }
  | { kind: 'single'; raw: string; value: number }
  | { kind: 'list'; raw: string; values: number[] }
  | { kind: 'range'; raw: string; from: number; to: number }
  | { kind: 'step'; raw: string; step: number }
  | { kind: 'range-step'; raw: string; from: number; to: number; step: number }
  | { kind: 'mixed'; raw: string };

type ParseFieldOptions = {
  min: number;
  max: number;
  nameMap?: Record<string, number>;
  normalize?: (value: number) => number;
};

const WEEKDAY_NAME_TO_NUM: Record<string, number> = {
  SUN: 0,
  SUNDAY: 0,
  MON: 1,
  MONDAY: 1,
  TUE: 2,
  TUESDAY: 2,
  WED: 3,
  WEDNESDAY: 3,
  THU: 4,
  THURSDAY: 4,
  FRI: 5,
  FRIDAY: 5,
  SAT: 6,
  SATURDAY: 6,
};

const MONTH_NAME_TO_NUM: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

const WEEKDAY_LABELS = ['\u65e5', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d'] as const;
const LIST_SEPARATOR = '\u3001';

function formatClock(hour: number, minute: number, second?: number): string {
  const period = hour < 12 ? '\u4e0a\u5348' : '\u4e0b\u5348';
  const hour12 = ((hour + 11) % 12) + 1;
  const minuteText = String(minute).padStart(2, '0');
  if (typeof second === 'number') {
    const secondText = String(second).padStart(2, '0');
    return `${period} ${hour12}\uff1a${minuteText}\uff1a${secondText}`;
  }
  return `${period} ${hour12}\uff1a${minuteText}`;
}

function parseToken(rawToken: string, options: ParseFieldOptions): number | null {
  const token = rawToken.trim().toUpperCase();
  if (!token) return null;
  const mapped = options.nameMap?.[token];
  const numeric = mapped ?? Number(token);
  if (!Number.isFinite(numeric)) return null;
  const normalized = options.normalize ? options.normalize(numeric) : numeric;
  if (normalized < options.min || normalized > options.max) return null;
  return normalized;
}

function dedupeKeepOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parseCronField(rawValue: string, options: ParseFieldOptions): ParsedField {
  const raw = rawValue.trim();
  const upper = raw.toUpperCase();
  if (!raw) return { kind: 'mixed', raw };
  if (upper === '*' || upper === '?') return { kind: 'any', raw };

  // Pure value list (e.g. "5,35" / "MON,WED,FRI")
  if (upper.includes(',')) {
    const values: number[] = [];
    for (const part of upper.split(',')) {
      const segment = part.trim();
      if (!segment || segment.includes('/') || segment.includes('-')) return { kind: 'mixed', raw };
      const value = parseToken(segment, options);
      if (value === null) return { kind: 'mixed', raw };
      values.push(value);
    }
    return { kind: 'list', raw, values: dedupeKeepOrder(values) };
  }

  // Step forms: */n | a-b/n | a/n
  const stepMatch = upper.match(/^(.+)\/(\d+)$/);
  if (stepMatch) {
    const step = Number(stepMatch[2]);
    if (!Number.isFinite(step) || step <= 0) return { kind: 'mixed', raw };
    const left = stepMatch[1]!.trim();
    if (left === '*' || left === '?') {
      return { kind: 'step', raw, step };
    }
    const rangeMatch = left.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
    if (rangeMatch) {
      const from = parseToken(rangeMatch[1]!, options);
      const to = parseToken(rangeMatch[2]!, options);
      if (from === null || to === null || from > to) return { kind: 'mixed', raw };
      return { kind: 'range-step', raw, from, to, step };
    }
    const start = parseToken(left, options);
    if (start === null) return { kind: 'mixed', raw };
    return { kind: 'range-step', raw, from: start, to: options.max, step };
  }

  // Range form: a-b
  const rangeMatch = upper.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
  if (rangeMatch) {
    const from = parseToken(rangeMatch[1]!, options);
    const to = parseToken(rangeMatch[2]!, options);
    if (from === null || to === null || from > to) return { kind: 'mixed', raw };
    return { kind: 'range', raw, from, to };
  }

  const single = parseToken(upper, options);
  if (single !== null) return { kind: 'single', raw, value: single };
  return { kind: 'mixed', raw };
}

function isAny(field: ParsedField): field is { kind: 'any'; raw: string } {
  return field.kind === 'any';
}

function formatValues(values: number[]): string {
  return values.join(LIST_SEPARATOR);
}

function formatMonthText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'single':
      return `${field.value}\u6708`;
    case 'list':
      return `${field.values.map((value) => `${value}\u6708`).join(LIST_SEPARATOR)}`;
    case 'range':
      return `${field.from}\u6708\u81f3${field.to}\u6708`;
    case 'step':
      return `\u6bcf\u9694 ${field.step} \u4e2a\u6708`;
    case 'range-step':
      return `${field.from}\u6708\u81f3${field.to}\u6708\u6bcf\u9694 ${field.step} \u4e2a\u6708`;
    default:
      return null;
  }
}

function formatDayOfMonthText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'single':
      return `${field.value}\u53f7`;
    case 'list':
      return `${field.values.map((value) => `${value}\u53f7`).join(LIST_SEPARATOR)}`;
    case 'range':
      return `${field.from}\u53f7\u81f3${field.to}\u53f7`;
    case 'step':
      return `\u6bcf\u9694 ${field.step} \u5929`;
    case 'range-step':
      return `${field.from}\u53f7\u81f3${field.to}\u53f7\u6bcf\u9694 ${field.step} \u5929`;
    default:
      return null;
  }
}

function formatWeekdaySpan(field: ParsedField): string | null {
  const toLabel = (value: number): string => WEEKDAY_LABELS[value] ?? String(value);
  switch (field.kind) {
    case 'single':
      return toLabel(field.value);
    case 'list':
      return field.values.map((value) => toLabel(value)).join(LIST_SEPARATOR);
    case 'range':
      return `${toLabel(field.from)}\u81f3${toLabel(field.to)}`;
    case 'step':
      return `\u6bcf\u9694 ${field.step} \u5929`;
    case 'range-step':
      return `${toLabel(field.from)}\u81f3${toLabel(field.to)}\u6bcf\u9694 ${field.step} \u5929`;
    default:
      return null;
  }
}

function formatSecondText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'any':
      return '\u6bcf\u79d2';
    case 'single':
      return `\u7b2c${field.value}\u79d2`;
    case 'list':
      return `\u7b2c${formatValues(field.values)}\u79d2`;
    case 'range':
      return `${field.from}-${field.to}\u79d2`;
    case 'step':
      return `\u6bcf\u9694 ${field.step} \u79d2`;
    case 'range-step':
      return `${field.from}-${field.to}\u79d2\u6bcf\u9694 ${field.step} \u79d2`;
    default:
      return null;
  }
}

function formatMinuteText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'any':
      return '\u6bcf\u5206\u949f';
    case 'single':
      return `\u7b2c${field.value}\u5206\u949f`;
    case 'list':
      return `\u7b2c${formatValues(field.values)}\u5206\u949f`;
    case 'range':
      return `${field.from}-${field.to}\u5206\u949f`;
    case 'step':
      return `\u6bcf\u9694 ${field.step} \u5206\u949f`;
    case 'range-step':
      return `${field.from}-${field.to}\u5206\u949f\u6bcf\u9694 ${field.step} \u5206\u949f`;
    default:
      return null;
  }
}

function secondSuffix(field: ParsedField, hasExplicitSeconds: boolean): string {
  if (!hasExplicitSeconds) return '';
  if (field.kind === 'single' && field.value === 0) return '';
  const text = formatSecondText(field);
  if (!text) return '';
  return `\uff08${text}\uff09`;
}

function formatDatePart(month: ParsedField, dayOfMonth: ParsedField, dayOfWeek: ParsedField): string | null {
  const monthAny = isAny(month);
  const dayOfMonthAny = isAny(dayOfMonth);
  const dayOfWeekAny = isAny(dayOfWeek);

  if (monthAny && dayOfMonthAny && dayOfWeekAny) return null;

  if (monthAny && dayOfMonthAny && !dayOfWeekAny) {
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!dayOfWeekText) return null;
    return `\u6bcf\u5468${dayOfWeekText}`;
  }

  if (monthAny && !dayOfMonthAny && dayOfWeekAny) {
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    if (!dayOfMonthText) return null;
    if (dayOfMonth.kind === 'step' || dayOfMonth.kind === 'range-step') return dayOfMonthText;
    return `\u6bcf\u6708${dayOfMonthText}`;
  }

  if (!monthAny && dayOfMonthAny && dayOfWeekAny) {
    const monthText = formatMonthText(month);
    if (!monthText) return null;
    if (month.kind === 'step' || month.kind === 'range-step') return monthText;
    return `\u6bcf\u5e74${monthText}`;
  }

  if (!monthAny && !dayOfMonthAny && dayOfWeekAny) {
    const monthText = formatMonthText(month);
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    if (!monthText || !dayOfMonthText) return null;
    const yearPrefix = month.kind === 'step' || month.kind === 'range-step' ? monthText : `\u6bcf\u5e74${monthText}`;
    return `${yearPrefix}${dayOfMonthText}`;
  }

  if (monthAny && !dayOfMonthAny && !dayOfWeekAny) {
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!dayOfMonthText || !dayOfWeekText) return null;
    return `\u6bcf\u6708${dayOfMonthText}\uff0c\u6bcf\u5468${dayOfWeekText}`;
  }

  if (!monthAny && dayOfMonthAny && !dayOfWeekAny) {
    const monthText = formatMonthText(month);
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!monthText || !dayOfWeekText) return null;
    const yearPrefix = month.kind === 'step' || month.kind === 'range-step' ? monthText : `\u6bcf\u5e74${monthText}`;
    return `${yearPrefix}\uff0c\u6bcf\u5468${dayOfWeekText}`;
  }

  if (!monthAny && !dayOfMonthAny && !dayOfWeekAny) {
    const monthText = formatMonthText(month);
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!monthText || !dayOfMonthText || !dayOfWeekText) return null;
    const yearPrefix = month.kind === 'step' || month.kind === 'range-step' ? monthText : `\u6bcf\u5e74${monthText}`;
    return `${yearPrefix}${dayOfMonthText}\uff0c\u6bcf\u5468${dayOfWeekText}`;
  }

  return null;
}

function formatFixedTimesForHours(hours: number[], minute: number, second?: number): string {
  return hours.map((hour) => formatClock(hour, minute, second)).join(LIST_SEPARATOR);
}

function formatTimePart(
  hour: ParsedField,
  minute: ParsedField,
  second: ParsedField,
  hasExplicitSeconds: boolean,
  hasDateConstraint: boolean,
): string | null {
  const hourAny = isAny(hour);
  const minuteAny = isAny(minute);

  if (hourAny && minuteAny) {
    if (!hasExplicitSeconds) return '\u6bcf\u5206\u949f';
    if (second.kind === 'single' && second.value === 0) return '\u6bcf\u5206\u949f';
    if (second.kind === 'any') return '\u6bcf\u79d2';
    if (second.kind === 'step') return `\u6bcf\u9694 ${second.step} \u79d2`;
    const secondText = formatSecondText(second);
    return secondText ? `\u6bcf\u5206\u949f${secondText}` : null;
  }

  if (hourAny) {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    let base = minuteText;
    if (minute.kind !== 'step' && minute.kind !== 'any') {
      base = `\u6bcf\u5c0f\u65f6${minuteText}`;
    }
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`.trim();
  }

  if (hour.kind === 'step') {
    if (minute.kind === 'single') {
      return `\u6bcf\u9694 ${hour.step} \u5c0f\u65f6\uff08\u7b2c${minute.value}\u5206\u949f\uff09${secondSuffix(second, hasExplicitSeconds)}`.trim();
    }
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    return `\u6bcf\u9694 ${hour.step} \u5c0f\u65f6\uff08${minuteText}\uff09${secondSuffix(second, hasExplicitSeconds)}`.trim();
  }

  if (hour.kind === 'range-step') {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    return `\u6bcf\u5929${hour.from}\u70b9\u81f3${hour.to}\u70b9\u6bcf\u9694 ${hour.step} \u5c0f\u65f6\uff08${minuteText}\uff09${secondSuffix(second, hasExplicitSeconds)}`.trim();
  }

  if (hour.kind === 'single' && minute.kind === 'single') {
    const secondValue = hasExplicitSeconds && second.kind === 'single' ? second.value : undefined;
    const prefix = hasDateConstraint ? '' : '\u6bcf\u5929 ';
    const base = `${prefix}${formatClock(hour.value, minute.value, secondValue)}`;
    if (!hasExplicitSeconds || second.kind === 'single') return base;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'list' && minute.kind === 'single') {
    const secondValue = hasExplicitSeconds && second.kind === 'single' ? second.value : undefined;
    const prefix = hasDateConstraint ? '' : '\u6bcf\u5929 ';
    const times = formatFixedTimesForHours(hour.values, minute.value, secondValue);
    if (!hasExplicitSeconds || second.kind === 'single') return `${prefix}${times}`;
    return `${prefix}${times}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'range' && minute.kind === 'single') {
    const prefix = hasDateConstraint ? '' : '\u6bcf\u5929 ';
    const base = `${prefix}${hour.from}\u70b9\u81f3${hour.to}\u70b9\u7b2c${minute.value}\u5206\u949f`;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'single') {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    const prefix = hasDateConstraint ? '' : '\u6bcf\u5929 ';
    const base = `${prefix}${hour.value}\u70b9${minuteText}`;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  return null;
}

export function formatCronFrequency(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return expression;

  let secondRaw = '0';
  let minuteRaw = '*';
  let hourRaw = '*';
  let dayOfMonthRaw = '*';
  let monthRaw = '*';
  let dayOfWeekRaw = '*';
  let hasExplicitSeconds = false;

  if (parts.length === 5) {
    [minuteRaw, hourRaw, dayOfMonthRaw, monthRaw, dayOfWeekRaw] = parts;
  } else {
    // Supports both 6-field (sec min hour dom mon dow) and 7-field variants (ignores trailing year).
    [secondRaw, minuteRaw, hourRaw, dayOfMonthRaw, monthRaw, dayOfWeekRaw] = parts;
    hasExplicitSeconds = true;
  }

  const second = parseCronField(secondRaw, { min: 0, max: 59 });
  const minute = parseCronField(minuteRaw, { min: 0, max: 59 });
  const hour = parseCronField(hourRaw, { min: 0, max: 23 });
  const dayOfMonth = parseCronField(dayOfMonthRaw, { min: 1, max: 31 });
  const month = parseCronField(monthRaw, { min: 1, max: 12, nameMap: MONTH_NAME_TO_NUM });
  const dayOfWeek = parseCronField(dayOfWeekRaw, {
    min: 0,
    max: 6,
    nameMap: WEEKDAY_NAME_TO_NUM,
    normalize: (value) => (value === 7 ? 0 : value),
  });

  const hasDateConstraint = !(isAny(month) && isAny(dayOfMonth) && isAny(dayOfWeek));
  const datePart = formatDatePart(month, dayOfMonth, dayOfWeek);
  const timePart = formatTimePart(hour, minute, second, hasExplicitSeconds, hasDateConstraint);

  if (datePart && timePart) return `${datePart} ${timePart}`.replace(/\s+/g, ' ').trim();
  if (datePart) return datePart;
  if (timePart) return timePart;
  return expression;
}

