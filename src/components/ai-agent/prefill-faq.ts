import type { FAQItem } from '../../types/ai-agent';

export interface TimeRange {
  day: number;
  start: string;
  end: string;
}

export interface ScheduleLike {
  ranges: TimeRange[];
}

export interface LocationLike {
  address?: {
    address_number?: string;
    street?: string;
    unit?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    formatted_address?: string;
  };
}

export interface UserLike {
  name?: string | null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatScheduleAnswer(schedule: ScheduleLike): string {
  if (schedule.ranges.length === 0) return 'Please contact us for our current hours.';

  const byDay = new Map<number, string>();
  for (const r of schedule.ranges) {
    byDay.set(r.day, `${r.start} - ${r.end}`);
  }

  const groups: { days: number[]; hours: string }[] = [];
  for (const [day, hours] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const last = groups[groups.length - 1];
    if (last && last.hours === hours && last.days[last.days.length - 1] === day - 1) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], hours });
    }
  }

  return groups
    .map((g) => {
      const firstDay = g.days[0] ?? 0;
      const lastDay = g.days[g.days.length - 1] ?? firstDay;
      const dayLabel =
        g.days.length === 1
          ? (DAY_NAMES[firstDay] ?? `Day ${firstDay}`)
          : `${DAY_NAMES[firstDay] ?? `Day ${firstDay}`} to ${DAY_NAMES[lastDay] ?? `Day ${lastDay}`}`;
      return `${dayLabel}: ${g.hours}`;
    })
    .join('\n');
}

export function buildAIAgentPrefillFaq({
  locations,
  schedules,
  users,
}: {
  locations: LocationLike[];
  schedules: ScheduleLike[];
  users: UserLike[];
}): FAQItem[] {
  const items: FAQItem[] = [];

  const firstLocation = locations[0];
  if (firstLocation?.address) {
    const addr = firstLocation.address;
    const formatted =
      addr.formatted_address ||
      [addr.address_number, addr.street, addr.unit, addr.city, addr.state, addr.postal_code]
        .filter(Boolean)
        .join(', ');
    if (formatted) {
      items.push({
        question: 'What is your address?',
        answer: `We are located at ${formatted}.`,
      });
    }
  }

  const firstSchedule = schedules[0];
  if (firstSchedule) {
    items.push({
      question: 'What are your business hours?',
      answer: formatScheduleAnswer(firstSchedule),
    });
  }

  const names = users.map((u) => u.name).filter((name): name is string => !!name);
  if (names.length > 0) {
    items.push({
      question: 'Who are the members of your team?',
      answer: `Our team includes: ${names.join(', ')}.`,
    });
  }

  return items;
}

export function shouldApplyPrefillFaq({
  isCreate,
  prefillCount,
  faqDirty,
}: {
  isCreate: boolean;
  prefillCount: number;
  faqDirty: boolean;
}): boolean {
  return isCreate && prefillCount > 0 && !faqDirty;
}
