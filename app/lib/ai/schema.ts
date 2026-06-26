import { z } from 'zod';


export const eventCategories = [
  'interview',
  'briefing',
  'deadline',
  'web_test',
  'lab',
  'part_time_job',
  'other',
] as const;


export const extractedCalendarEventSchema = z.object({
  title: z.string().min(1),
  category: z.enum(eventCategories),
  isAllDay: z.boolean(),
  startDateTime: z.string().datetime({ offset: true }).nullable(),
  endDateTime: z.string().datetime({ offset: true }).nullable(),
  location: z.string().nullable(),

  meetingUrl: z.string().url().nullable(),

  description: z.string(),
  sourceText: z.string(),
  confidence: z.number().min(0).max(1),
  needsConfirmation: z.boolean(),
  missingFields: z.array(z.string()),
  ambiguityNotes: z.array(z.string()),
});


export const extractEventsResponseSchema = z.object({
  events: z.array(extractedCalendarEventSchema),
  globalAmbiguityNotes: z.array(z.string()),
});

export const extractEventsRequestSchema = z.object({
  text: z.string().min(1),
  receivedDate: z.string().optional().nullable(),
  timeZone: z.string().default('Asia/Tokyo'),
});



export type ExtractedCalendarEvent = z.infer<typeof extractedCalendarEventSchema>;
export type ExtractEventsResponse = z.infer<typeof extractEventsResponseSchema>;
export type ExtractEventsRequest = z.infer<typeof extractEventsRequestSchema>;
