/**
 * database.types.ts — Types générés pour Supabase
 * Reflète les tables définies dans src/types/index.ts
 */

import type {
  Profile,
  DailyCheckIn,
  TradingSession,
  Trade,
  PlaybookSetup,
  WeeklyReview,
  BehavioralEvent,
  RoutineLog,
} from '@/types'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile>
        Update: Partial<Profile>
      }
      daily_checkins: {
        Row: DailyCheckIn
        Insert: Partial<Omit<DailyCheckIn, 'id' | 'created_at'>> & { user_id: string }
        Update: Partial<DailyCheckIn>
      }
      trading_sessions: {
        Row: TradingSession
        Insert: Partial<Omit<TradingSession, 'id' | 'created_at'>> & { user_id: string }
        Update: Partial<TradingSession>
      }
      trades: {
        Row: Trade
        Insert: Partial<Omit<Trade, 'id' | 'created_at' | 'updated_at'>> & { user_id: string }
        Update: Partial<Trade>
      }
      playbook_setups: {
        Row: PlaybookSetup
        Insert: Partial<Omit<PlaybookSetup, 'id' | 'created_at' | 'updated_at'>> & { user_id: string }
        Update: Partial<PlaybookSetup>
      }
      weekly_reviews: {
        Row: WeeklyReview
        Insert: Partial<Omit<WeeklyReview, 'id' | 'created_at'>> & { user_id: string }
        Update: Partial<WeeklyReview>
      }
      behavioral_events: {
        Row: BehavioralEvent
        Insert: Partial<Omit<BehavioralEvent, 'id' | 'created_at'>> & { user_id: string }
        Update: Partial<BehavioralEvent>
      }
      routine_logs: {
        Row: RoutineLog
        Insert: Partial<Omit<RoutineLog, 'id' | 'created_at'>> & { user_id: string }
        Update: Partial<RoutineLog>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
