export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      answers: {
        Row: {
          color: string | null
          contract_id: string | null
          created_time: string | null
          data: Json | null
          id: string
          index: number | null
          is_other: boolean
          pool_no: number | null
          pool_yes: number | null
          prob: number | null
          prob_change_day: number | null
          prob_change_month: number | null
          prob_change_week: number | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          resolver_id: string | null
          subsidy_pool: number | null
          text: string | null
          text_fts: unknown | null
          total_liquidity: number | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          contract_id?: string | null
          created_time?: string | null
          data?: Json | null
          id?: string
          index?: number | null
          is_other?: boolean
          pool_no?: number | null
          pool_yes?: number | null
          prob?: number | null
          prob_change_day?: number | null
          prob_change_month?: number | null
          prob_change_week?: number | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          resolver_id?: string | null
          subsidy_pool?: number | null
          text?: string | null
          text_fts?: unknown | null
          total_liquidity?: number | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          contract_id?: string | null
          created_time?: string | null
          data?: Json | null
          id?: string
          index?: number | null
          is_other?: boolean
          pool_no?: number | null
          pool_yes?: number | null
          prob?: number | null
          prob_change_day?: number | null
          prob_change_month?: number | null
          prob_change_week?: number | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          resolver_id?: string | null
          subsidy_pool?: number | null
          text?: string | null
          text_fts?: unknown | null
          total_liquidity?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          comment_id: string | null
          contract_id: string | null
          created_time: string
          data: Json | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          data?: Json | null
          id?: never
          name: string
          user_id: string
        }
        Update: {
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          data?: Json | null
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_annotations: {
        Row: {
          answer_id: string | null
          comment_id: string | null
          contract_id: string
          created_time: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          down_votes: number
          event_time: number
          external_url: string | null
          id: number
          prob_change: number | null
          text: string | null
          thumbnail_url: string | null
          up_votes: number
          user_avatar_url: string | null
          user_id: string | null
          user_name: string | null
          user_username: string | null
        }
        Insert: {
          answer_id?: string | null
          comment_id?: string | null
          contract_id: string
          created_time?: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          down_votes?: number
          event_time: number
          external_url?: string | null
          id?: never
          prob_change?: number | null
          text?: string | null
          thumbnail_url?: string | null
          up_votes?: number
          user_avatar_url?: string | null
          user_id?: string | null
          user_name?: string | null
          user_username?: string | null
        }
        Update: {
          answer_id?: string | null
          comment_id?: string | null
          contract_id?: string
          created_time?: string
          creator_avatar_url?: string
          creator_id?: string
          creator_name?: string
          creator_username?: string
          down_votes?: number
          event_time?: number
          external_url?: string | null
          id?: never
          prob_change?: number | null
          text?: string | null
          thumbnail_url?: string | null
          up_votes?: number
          user_avatar_url?: string | null
          user_id?: string | null
          user_name?: string | null
          user_username?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: Json
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          channel_id: string
          content: Json
          created_time?: string
          id?: number
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: Json
          created_time?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      contract_bets: {
        Row: {
          amount: number | null
          answer_id: string | null
          bet_id: string
          contract_id: string
          created_time: string
          data: Json
          is_api: boolean | null
          is_cancelled: boolean | null
          is_filled: boolean | null
          is_redemption: boolean | null
          loan_amount: number | null
          outcome: string | null
          prob_after: number | null
          prob_before: number | null
          shares: number | null
          updated_time: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          answer_id?: string | null
          bet_id?: string
          contract_id: string
          created_time?: string
          data: Json
          is_api?: boolean | null
          is_cancelled?: boolean | null
          is_filled?: boolean | null
          is_redemption?: boolean | null
          loan_amount?: number | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          updated_time?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          answer_id?: string | null
          bet_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          is_api?: boolean | null
          is_cancelled?: boolean | null
          is_filled?: boolean | null
          is_redemption?: boolean | null
          loan_amount?: number | null
          outcome?: string | null
          prob_after?: number | null
          prob_before?: number | null
          shares?: number | null
          updated_time?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_comment_edits: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          editor_id: string
          id: number
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string
          data: Json
          editor_id: string
          id?: number
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          editor_id?: string
          id?: number
        }
        Relationships: []
      }
      contract_comments: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          likes: number
          user_id: string
          visibility: string | null
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time: string
          data: Json
          likes?: number
          user_id: string
          visibility?: string | null
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          data?: Json
          likes?: number
          user_id?: string
          visibility?: string | null
        }
        Relationships: []
      }
      contract_edits: {
        Row: {
          contract_id: string
          created_time: string
          data: Json
          editor_id: string
          id: number
          idempotency_key: string | null
          updated_keys: string[] | null
        }
        Insert: {
          contract_id: string
          created_time?: string
          data: Json
          editor_id: string
          id?: number
          idempotency_key?: string | null
          updated_keys?: string[] | null
        }
        Update: {
          contract_id?: string
          created_time?: string
          data?: Json
          editor_id?: string
          id?: number
          idempotency_key?: string | null
          updated_keys?: string[] | null
        }
        Relationships: []
      }
      contract_embeddings: {
        Row: {
          contract_id: string
          created_at: string
          embedding: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          embedding: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          embedding?: string
        }
        Relationships: []
      }
      contract_follows: {
        Row: {
          contract_id: string
          created_time: string
          follow_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          follow_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          follow_id?: string
        }
        Relationships: []
      }
      contract_liquidity: {
        Row: {
          contract_id: string
          data: Json
          liquidity_id: string
        }
        Insert: {
          contract_id: string
          data: Json
          liquidity_id: string
        }
        Update: {
          contract_id?: string
          data?: Json
          liquidity_id?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          close_time: string | null
          conversion_score: number
          created_time: string | null
          creator_id: string | null
          daily_score: number
          data: Json
          deleted: boolean | null
          description_fts: unknown | null
          freshness_score: number
          group_slugs: string[] | null
          id: string
          importance_score: number
          is_spice_payout: boolean | null
          last_bet_time: string | null
          last_comment_time: string | null
          last_updated_time: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number
          question: string | null
          question_fts: unknown | null
          question_nostop_fts: unknown | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          tier: string | null
          token: string
          unique_bettor_count: number
          view_count: number
          visibility: string | null
        }
        Insert: {
          close_time?: string | null
          conversion_score?: number
          created_time?: string | null
          creator_id?: string | null
          daily_score?: number
          data: Json
          deleted?: boolean | null
          description_fts?: unknown | null
          freshness_score?: number
          group_slugs?: string[] | null
          id: string
          importance_score?: number
          is_spice_payout?: boolean | null
          last_bet_time?: string | null
          last_comment_time?: string | null
          last_updated_time?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number
          question?: string | null
          question_fts?: unknown | null
          question_nostop_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          tier?: string | null
          token?: string
          unique_bettor_count?: number
          view_count?: number
          visibility?: string | null
        }
        Update: {
          close_time?: string | null
          conversion_score?: number
          created_time?: string | null
          creator_id?: string | null
          daily_score?: number
          data?: Json
          deleted?: boolean | null
          description_fts?: unknown | null
          freshness_score?: number
          group_slugs?: string[] | null
          id?: string
          importance_score?: number
          is_spice_payout?: boolean | null
          last_bet_time?: string | null
          last_comment_time?: string | null
          last_updated_time?: string | null
          mechanism?: string | null
          outcome_type?: string | null
          popularity_score?: number
          question?: string | null
          question_fts?: unknown | null
          question_nostop_fts?: unknown | null
          resolution?: string | null
          resolution_probability?: number | null
          resolution_time?: string | null
          slug?: string | null
          tier?: string | null
          token?: string
          unique_bettor_count?: number
          view_count?: number
          visibility?: string | null
        }
        Relationships: []
      }
      creator_portfolio_history: {
        Row: {
          fees_earned: number
          id: number
          ts: string
          unique_bettors: number
          user_id: string
          views: number
          volume: number
        }
        Insert: {
          fees_earned: number
          id?: never
          ts?: string
          unique_bettors: number
          user_id: string
          views: number
          volume: number
        }
        Update: {
          fees_earned?: number
          id?: never
          ts?: string
          unique_bettors?: number
          user_id?: string
          views?: number
          volume?: number
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          activation: number | null
          active_d1_to_d3: number | null
          avg_user_actions: number | null
          bet_amount: number | null
          bet_count: number | null
          comment_count: number | null
          contract_count: number | null
          d1: number | null
          d1_bet_3_day_average: number | null
          d1_bet_average: number | null
          dau: number | null
          engaged_users: number | null
          feed_conversion: number | null
          m1: number | null
          mau: number | null
          nd1: number | null
          nw1: number | null
          sales: number | null
          signups: number | null
          signups_real: number | null
          start_date: string
          w1: number | null
          wau: number | null
        }
        Insert: {
          activation?: number | null
          active_d1_to_d3?: number | null
          avg_user_actions?: number | null
          bet_amount?: number | null
          bet_count?: number | null
          comment_count?: number | null
          contract_count?: number | null
          d1?: number | null
          d1_bet_3_day_average?: number | null
          d1_bet_average?: number | null
          dau?: number | null
          engaged_users?: number | null
          feed_conversion?: number | null
          m1?: number | null
          mau?: number | null
          nd1?: number | null
          nw1?: number | null
          sales?: number | null
          signups?: number | null
          signups_real?: number | null
          start_date: string
          w1?: number | null
          wau?: number | null
        }
        Update: {
          activation?: number | null
          active_d1_to_d3?: number | null
          avg_user_actions?: number | null
          bet_amount?: number | null
          bet_count?: number | null
          comment_count?: number | null
          contract_count?: number | null
          d1?: number | null
          d1_bet_3_day_average?: number | null
          d1_bet_average?: number | null
          dau?: number | null
          engaged_users?: number | null
          feed_conversion?: number | null
          m1?: number | null
          mau?: number | null
          nd1?: number | null
          nw1?: number | null
          sales?: number | null
          signups?: number | null
          signups_real?: number | null
          start_date?: string
          w1?: number | null
          wau?: number | null
        }
        Relationships: []
      }
      dashboard_follows: {
        Row: {
          created_time: string | null
          dashboard_id: string
          follower_id: string
        }
        Insert: {
          created_time?: string | null
          dashboard_id: string
          follower_id: string
        }
        Update: {
          created_time?: string | null
          dashboard_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      dashboard_groups: {
        Row: {
          dashboard_id: string
          group_id: string
        }
        Insert: {
          dashboard_id: string
          group_id: string
        }
        Update: {
          dashboard_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dashboard_groups_dashboard_id_fkey'
            columns: ['dashboard_id']
            isOneToOne: false
            referencedRelation: 'dashboards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'public_dashboard_groups_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_dashboard_groups_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      dashboards: {
        Row: {
          ai_importance_score: number
          created_time: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          id: string
          importance_score: number
          items: Json | null
          politics_importance_score: number
          slug: string
          title: string
          title_fts: unknown | null
          visibility: string | null
        }
        Insert: {
          ai_importance_score?: number
          created_time?: string
          creator_avatar_url: string
          creator_id: string
          creator_name: string
          creator_username: string
          id?: string
          importance_score?: number
          items?: Json | null
          politics_importance_score?: number
          slug: string
          title: string
          title_fts?: unknown | null
          visibility?: string | null
        }
        Update: {
          ai_importance_score?: number
          created_time?: string
          creator_avatar_url?: string
          creator_id?: string
          creator_name?: string
          creator_username?: string
          id?: string
          importance_score?: number
          items?: Json | null
          politics_importance_score?: number
          slug?: string
          title?: string
          title_fts?: unknown | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'dashboards_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'user_referrals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dashboards_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dashboards_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      discord_messages_markets: {
        Row: {
          channel_id: string
          last_updated_thread_time: number | null
          market_id: string
          market_slug: string
          message_id: string
          thread_id: string | null
        }
        Insert: {
          channel_id: string
          last_updated_thread_time?: number | null
          market_id: string
          market_slug: string
          message_id: string
          thread_id?: string | null
        }
        Update: {
          channel_id?: string
          last_updated_thread_time?: number | null
          market_id?: string
          market_slug?: string
          message_id?: string
          thread_id?: string | null
        }
        Relationships: []
      }
      discord_users: {
        Row: {
          api_key: string
          discord_user_id: string
          user_id: string
        }
        Insert: {
          api_key: string
          discord_user_id: string
          user_id: string
        }
        Update: {
          api_key?: string
          discord_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      group_contracts: {
        Row: {
          contract_id: string
          group_id: string
        }
        Insert: {
          contract_id: string
          group_id: string
        }
        Update: {
          contract_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_contracts_group_id_fke'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'group_contracts_group_id_fke'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      group_embeddings: {
        Row: {
          created_time: string
          embedding: string
          group_id: string
        }
        Insert: {
          created_time?: string
          embedding: string
          group_id: string
        }
        Update: {
          created_time?: string
          embedding?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'public_group_embeddings_group_id_fkey'
            columns: ['group_id']
            isOneToOne: true
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_group_embeddings_group_id_fkey'
            columns: ['group_id']
            isOneToOne: true
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      group_invites: {
        Row: {
          created_time: string
          duration: unknown | null
          expire_time: string | null
          group_id: string
          id: string
          is_forever: boolean | null
          is_max_uses_reached: boolean | null
          max_uses: number | null
          uses: number
        }
        Insert: {
          created_time?: string
          duration?: unknown | null
          expire_time?: string | null
          group_id: string
          id?: string
          is_forever?: boolean | null
          is_max_uses_reached?: boolean | null
          max_uses?: number | null
          uses?: number
        }
        Update: {
          created_time?: string
          duration?: unknown | null
          expire_time?: string | null
          group_id?: string
          id?: string
          is_forever?: boolean | null
          is_max_uses_reached?: boolean | null
          max_uses?: number | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: 'public_group_invites_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_group_invites_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      group_members: {
        Row: {
          created_time: string | null
          group_id: string
          member_id: string
          role: string
        }
        Insert: {
          created_time?: string | null
          group_id: string
          member_id: string
          role?: string
        }
        Update: {
          created_time?: string | null
          group_id?: string
          member_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'public_group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      groups: {
        Row: {
          creator_id: string | null
          data: Json
          id: string
          importance_score: number | null
          name: string
          name_fts: unknown | null
          privacy_status: string | null
          slug: string
          total_members: number | null
        }
        Insert: {
          creator_id?: string | null
          data: Json
          id?: string
          importance_score?: number | null
          name: string
          name_fts?: unknown | null
          privacy_status?: string | null
          slug: string
          total_members?: number | null
        }
        Update: {
          creator_id?: string | null
          data?: Json
          id?: string
          importance_score?: number | null
          name?: string
          name_fts?: unknown | null
          privacy_status?: string | null
          slug?: string
          total_members?: number | null
        }
        Relationships: []
      }
      league_chats: {
        Row: {
          channel_id: string
          cohort: string
          created_time: string
          division: number
          id: number
          owner_id: string | null
          season: number
        }
        Insert: {
          channel_id: string
          cohort: string
          created_time?: string
          division: number
          id?: number
          owner_id?: string | null
          season: number
        }
        Update: {
          channel_id?: string
          cohort?: string
          created_time?: string
          division?: number
          id?: number
          owner_id?: string | null
          season?: number
        }
        Relationships: []
      }
      leagues: {
        Row: {
          cohort: string
          created_time: string
          division: number
          id: string
          mana_earned: number
          mana_earned_breakdown: Json
          rank_snapshot: number | null
          season: number
          user_id: string
        }
        Insert: {
          cohort: string
          created_time?: string
          division: number
          id?: string
          mana_earned?: number
          mana_earned_breakdown?: Json
          rank_snapshot?: number | null
          season: number
          user_id: string
        }
        Update: {
          cohort?: string
          created_time?: string
          division?: number
          id?: string
          mana_earned?: number
          mana_earned_breakdown?: Json
          rank_snapshot?: number | null
          season?: number
          user_id?: string
        }
        Relationships: []
      }
      love_answers: {
        Row: {
          created_time: string
          creator_id: string
          free_response: string | null
          id: number
          integer: number | null
          multiple_choice: number | null
          question_id: number
        }
        Insert: {
          created_time?: string
          creator_id: string
          free_response?: string | null
          id?: never
          integer?: number | null
          multiple_choice?: number | null
          question_id: number
        }
        Update: {
          created_time?: string
          creator_id?: string
          free_response?: string | null
          id?: never
          integer?: number | null
          multiple_choice?: number | null
          question_id?: number
        }
        Relationships: []
      }
      love_compatibility_answers: {
        Row: {
          created_time: string
          creator_id: string
          explanation: string | null
          id: number
          importance: number
          multiple_choice: number
          pref_choices: number[]
          question_id: number
        }
        Insert: {
          created_time?: string
          creator_id: string
          explanation?: string | null
          id?: never
          importance: number
          multiple_choice: number
          pref_choices: number[]
          question_id: number
        }
        Update: {
          created_time?: string
          creator_id?: string
          explanation?: string | null
          id?: never
          importance?: number
          multiple_choice?: number
          pref_choices?: number[]
          question_id?: number
        }
        Relationships: []
      }
      love_likes: {
        Row: {
          created_time: string
          creator_id: string
          like_id: string
          target_id: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          like_id?: string
          target_id: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          like_id?: string
          target_id?: string
        }
        Relationships: []
      }
      love_questions: {
        Row: {
          answer_type: string
          created_time: string
          creator_id: string
          id: number
          importance_score: number
          multiple_choice_options: Json | null
          question: string
        }
        Insert: {
          answer_type?: string
          created_time?: string
          creator_id: string
          id?: never
          importance_score?: number
          multiple_choice_options?: Json | null
          question: string
        }
        Update: {
          answer_type?: string
          created_time?: string
          creator_id?: string
          id?: never
          importance_score?: number
          multiple_choice_options?: Json | null
          question?: string
        }
        Relationships: []
      }
      love_ships: {
        Row: {
          created_time: string
          creator_id: string
          ship_id: string
          target1_id: string
          target2_id: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          ship_id?: string
          target1_id: string
          target2_id: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          ship_id?: string
          target1_id?: string
          target2_id?: string
        }
        Relationships: []
      }
      love_stars: {
        Row: {
          created_time: string
          creator_id: string
          star_id: string
          target_id: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          star_id?: string
          target_id: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          star_id?: string
          target_id?: string
        }
        Relationships: []
      }
      love_waitlist: {
        Row: {
          created_time: string
          email: string
          id: number
        }
        Insert: {
          created_time?: string
          email: string
          id?: never
        }
        Update: {
          created_time?: string
          email?: string
          id?: never
        }
        Relationships: []
      }
      lover_comments: {
        Row: {
          content: Json
          created_time: string
          hidden: boolean
          id: number
          on_user_id: string
          reply_to_comment_id: number | null
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Insert: {
          content: Json
          created_time?: string
          hidden?: boolean
          id?: never
          on_user_id: string
          reply_to_comment_id?: number | null
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Update: {
          content?: Json
          created_time?: string
          hidden?: boolean
          id?: never
          on_user_id?: string
          reply_to_comment_id?: number | null
          user_avatar_url?: string
          user_id?: string
          user_name?: string
          user_username?: string
        }
        Relationships: []
      }
      lovers: {
        Row: {
          age: number
          bio: Json | null
          born_in_location: string | null
          city: string
          city_latitude: number | null
          city_longitude: number | null
          comments_enabled: boolean
          company: string | null
          country: string | null
          created_time: string
          drinks_per_month: number | null
          education_level: string | null
          ethnicity: string[] | null
          gender: string
          geodb_city_id: string | null
          has_kids: number | null
          height_in_inches: number | null
          id: number
          is_smoker: boolean | null
          is_vegetarian_or_vegan: boolean | null
          last_online_time: string
          looking_for_matches: boolean
          messaging_status: string
          occupation: string | null
          occupation_title: string | null
          photo_urls: string[] | null
          pinned_url: string | null
          political_beliefs: string[] | null
          pref_age_max: number
          pref_age_min: number
          pref_gender: string[]
          pref_relation_styles: string[]
          referred_by_username: string | null
          region_code: string | null
          religious_belief_strength: number | null
          religious_beliefs: string | null
          twitter: string | null
          university: string | null
          user_id: string
          visibility: string
          wants_kids_strength: number
          website: string | null
        }
        Insert: {
          age?: number
          bio?: Json | null
          born_in_location?: string | null
          city: string
          city_latitude?: number | null
          city_longitude?: number | null
          comments_enabled?: boolean
          company?: string | null
          country?: string | null
          created_time?: string
          drinks_per_month?: number | null
          education_level?: string | null
          ethnicity?: string[] | null
          gender: string
          geodb_city_id?: string | null
          has_kids?: number | null
          height_in_inches?: number | null
          id?: never
          is_smoker?: boolean | null
          is_vegetarian_or_vegan?: boolean | null
          last_online_time?: string
          looking_for_matches?: boolean
          messaging_status?: string
          occupation?: string | null
          occupation_title?: string | null
          photo_urls?: string[] | null
          pinned_url?: string | null
          political_beliefs?: string[] | null
          pref_age_max?: number
          pref_age_min?: number
          pref_gender: string[]
          pref_relation_styles: string[]
          referred_by_username?: string | null
          region_code?: string | null
          religious_belief_strength?: number | null
          religious_beliefs?: string | null
          twitter?: string | null
          university?: string | null
          user_id: string
          visibility?: string
          wants_kids_strength?: number
          website?: string | null
        }
        Update: {
          age?: number
          bio?: Json | null
          born_in_location?: string | null
          city?: string
          city_latitude?: number | null
          city_longitude?: number | null
          comments_enabled?: boolean
          company?: string | null
          country?: string | null
          created_time?: string
          drinks_per_month?: number | null
          education_level?: string | null
          ethnicity?: string[] | null
          gender?: string
          geodb_city_id?: string | null
          has_kids?: number | null
          height_in_inches?: number | null
          id?: never
          is_smoker?: boolean | null
          is_vegetarian_or_vegan?: boolean | null
          last_online_time?: string
          looking_for_matches?: boolean
          messaging_status?: string
          occupation?: string | null
          occupation_title?: string | null
          photo_urls?: string[] | null
          pinned_url?: string | null
          political_beliefs?: string[] | null
          pref_age_max?: number
          pref_age_min?: number
          pref_gender?: string[]
          pref_relation_styles?: string[]
          referred_by_username?: string | null
          region_code?: string | null
          religious_belief_strength?: number | null
          religious_beliefs?: string | null
          twitter?: string | null
          university?: string | null
          user_id?: string
          visibility?: string
          wants_kids_strength?: number
          website?: string | null
        }
        Relationships: []
      }
      mana_supply_stats: {
        Row: {
          amm_liquidity: number
          balance: number
          created_time: string
          end_time: string
          id: number
          investment_value: number
          loan_total: number
          spice_balance: number
          start_time: string
          total_value: number
        }
        Insert: {
          amm_liquidity: number
          balance: number
          created_time?: string
          end_time: string
          id?: never
          investment_value: number
          loan_total: number
          spice_balance: number
          start_time: string
          total_value: number
        }
        Update: {
          amm_liquidity?: number
          balance?: number
          created_time?: string
          end_time?: string
          id?: never
          investment_value?: number
          loan_total?: number
          spice_balance?: number
          start_time?: string
          total_value?: number
        }
        Relationships: []
      }
      manachan_tweets: {
        Row: {
          cost: number | null
          created_time: number | null
          id: string
          tweet: string | null
          tweet_id: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          cost?: number | null
          created_time?: number | null
          id?: string
          tweet?: string | null
          tweet_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          cost?: number | null
          created_time?: number | null
          id?: string
          tweet?: string | null
          tweet_id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      manalink_claims: {
        Row: {
          manalink_id: string
          txn_id: string
        }
        Insert: {
          manalink_id: string
          txn_id: string
        }
        Update: {
          manalink_id?: string
          txn_id?: string
        }
        Relationships: []
      }
      manalinks: {
        Row: {
          amount: number
          created_time: string | null
          creator_id: string
          expires_time: string | null
          id: string
          max_uses: number | null
          message: string | null
        }
        Insert: {
          amount: number
          created_time?: string | null
          creator_id: string
          expires_time?: string | null
          id?: string
          max_uses?: number | null
          message?: string | null
        }
        Update: {
          amount?: number
          created_time?: string | null
          creator_id?: string
          expires_time?: string | null
          id?: string
          max_uses?: number | null
          message?: string | null
        }
        Relationships: []
      }
      market_ads: {
        Row: {
          cost_per_view: number
          created_at: string
          embedding: string
          funds: number
          id: string
          market_id: string
          user_id: string
        }
        Insert: {
          cost_per_view: number
          created_at?: string
          embedding: string
          funds: number
          id?: string
          market_id: string
          user_id: string
        }
        Update: {
          cost_per_view?: number
          created_at?: string
          embedding?: string
          funds?: number
          id?: string
          market_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'market_ads_market_id_fkey'
            columns: ['market_id']
            isOneToOne: false
            referencedRelation: 'contracts'
            referencedColumns: ['id']
          }
        ]
      }
      mod_reports: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          mod_note: string | null
          report_id: number
          status: Database['public']['Enums']['status_type']
          user_id: string
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string
          mod_note?: string | null
          report_id?: number
          status?: Database['public']['Enums']['status_type']
          user_id: string
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          mod_note?: string | null
          report_id?: number
          status?: Database['public']['Enums']['status_type']
          user_id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          author: string | null
          contract_ids: string[] | null
          created_time: string
          description: string | null
          group_ids: string[] | null
          id: number
          image_url: string | null
          published_time: string
          source_id: string | null
          source_name: string | null
          title: string
          title_embedding: string
          url: string
        }
        Insert: {
          author?: string | null
          contract_ids?: string[] | null
          created_time?: string
          description?: string | null
          group_ids?: string[] | null
          id?: number
          image_url?: string | null
          published_time: string
          source_id?: string | null
          source_name?: string | null
          title: string
          title_embedding: string
          url: string
        }
        Update: {
          author?: string | null
          contract_ids?: string[] | null
          created_time?: string
          description?: string | null
          group_ids?: string[] | null
          id?: number
          image_url?: string | null
          published_time?: string
          source_id?: string | null
          source_name?: string | null
          title?: string
          title_embedding?: string
          url?: string
        }
        Relationships: []
      }
      old_post_comments: {
        Row: {
          comment_id: string
          created_time: string | null
          data: Json
          fs_updated_time: string | null
          post_id: string
          user_id: string | null
        }
        Insert: {
          comment_id?: string
          created_time?: string | null
          data: Json
          fs_updated_time?: string | null
          post_id: string
          user_id?: string | null
        }
        Update: {
          comment_id?: string
          created_time?: string | null
          data?: Json
          fs_updated_time?: string | null
          post_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      old_posts: {
        Row: {
          created_time: string | null
          creator_id: string | null
          data: Json
          group_id: string | null
          id: string
          visibility: string | null
        }
        Insert: {
          created_time?: string | null
          creator_id?: string | null
          data: Json
          group_id?: string | null
          id?: string
          visibility?: string | null
        }
        Update: {
          created_time?: string | null
          creator_id?: string | null
          data?: Json
          group_id?: string | null
          id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'public_old_posts_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'group_role'
            referencedColumns: ['group_id']
          },
          {
            foreignKeyName: 'public_old_posts_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      platform_calibration: {
        Row: {
          created_time: string
          data: Json
          id: number
        }
        Insert: {
          created_time?: string
          data: Json
          id?: never
        }
        Update: {
          created_time?: string
          data?: Json
          id?: never
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          created_time: string
          creator_id: string
          id: string
          items: Json
          name: string
          slug: string
        }
        Insert: {
          created_time?: string
          creator_id: string
          id: string
          items: Json
          name: string
          slug: string
        }
        Update: {
          created_time?: string
          creator_id?: string
          id?: string
          items?: Json
          name?: string
          slug?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          bet_id: string | null
          contract_comment_id: string | null
          contract_id: string | null
          created_time: string
          id: number
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Insert: {
          bet_id?: string | null
          contract_comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          user_avatar_url: string
          user_id: string
          user_name: string
          user_username: string
        }
        Update: {
          bet_id?: string | null
          contract_comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          user_avatar_url?: string
          user_id?: string
          user_name?: string
          user_username?: string
        }
        Relationships: []
      }
      private_user_message_channel_members: {
        Row: {
          channel_id: number
          created_time: string
          id: number
          notify_after_time: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          channel_id: number
          created_time?: string
          id?: never
          notify_after_time?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          channel_id?: number
          created_time?: string
          id?: never
          notify_after_time?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      private_user_message_channels: {
        Row: {
          created_time: string
          id: number
          last_updated_time: string
          title: string | null
        }
        Insert: {
          created_time?: string
          id?: never
          last_updated_time?: string
          title?: string | null
        }
        Update: {
          created_time?: string
          id?: never
          last_updated_time?: string
          title?: string | null
        }
        Relationships: []
      }
      private_user_messages: {
        Row: {
          channel_id: number
          content: Json
          created_time: string
          id: number
          user_id: string
          visibility: string
        }
        Insert: {
          channel_id: number
          content: Json
          created_time?: string
          id?: never
          user_id: string
          visibility?: string
        }
        Update: {
          channel_id?: number
          content?: Json
          created_time?: string
          id?: never
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      private_user_phone_numbers: {
        Row: {
          created_time: string
          id: number
          last_updated_time: string
          phone_number: string
          user_id: string
        }
        Insert: {
          created_time?: string
          id?: never
          last_updated_time?: string
          phone_number: string
          user_id: string
        }
        Update: {
          created_time?: string
          id?: never
          last_updated_time?: string
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      private_user_seen_message_channels: {
        Row: {
          channel_id: number
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          channel_id: number
          created_time?: string
          id?: never
          user_id: string
        }
        Update: {
          channel_id?: number
          created_time?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      private_users: {
        Row: {
          data: Json
          id: string
          weekly_portfolio_email_sent: boolean | null
          weekly_trending_email_sent: boolean | null
        }
        Insert: {
          data: Json
          id: string
          weekly_portfolio_email_sent?: boolean | null
          weekly_trending_email_sent?: boolean | null
        }
        Update: {
          data?: Json
          id?: string
          weekly_portfolio_email_sent?: boolean | null
          weekly_trending_email_sent?: boolean | null
        }
        Relationships: []
      }
      push_notification_tickets: {
        Row: {
          created_time: string
          id: string
          notification_id: string
          receipt_error: string | null
          receipt_status: string
          status: string
          user_id: string
        }
        Insert: {
          created_time?: string
          id: string
          notification_id: string
          receipt_error?: string | null
          receipt_status: string
          status: string
          user_id: string
        }
        Update: {
          created_time?: string
          id?: string
          notification_id?: string
          receipt_error?: string | null
          receipt_status?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      q_and_a: {
        Row: {
          bounty: number
          created_time: string
          deleted: boolean
          description: string
          id: string
          question: string
          user_id: string
        }
        Insert: {
          bounty: number
          created_time?: string
          deleted?: boolean
          description: string
          id: string
          question: string
          user_id: string
        }
        Update: {
          bounty?: number
          created_time?: string
          deleted?: boolean
          description?: string
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      q_and_a_answers: {
        Row: {
          award: number
          created_time: string
          deleted: boolean
          id: string
          q_and_a_id: string
          text: string
          user_id: string
        }
        Insert: {
          award?: number
          created_time?: string
          deleted?: boolean
          id: string
          q_and_a_id: string
          text: string
          user_id: string
        }
        Update: {
          award?: number
          created_time?: string
          deleted?: boolean
          id?: string
          q_and_a_id?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time: string | null
          description: string | null
          id: string
          parent_id: string | null
          parent_type: string | null
          user_id: string
        }
        Insert: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time?: string | null
          description?: string | null
          id?: string
          parent_id?: string | null
          parent_type?: string | null
          user_id: string
        }
        Update: {
          content_id?: string
          content_owner_id?: string
          content_type?: string
          created_time?: string | null
          description?: string | null
          id?: string
          parent_id?: string | null
          parent_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reports_content_owner_id_fkey'
            columns: ['content_owner_id']
            isOneToOne: false
            referencedRelation: 'user_referrals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_content_owner_id_fkey'
            columns: ['content_owner_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_content_owner_id_fkey'
            columns: ['content_owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      reviews: {
        Row: {
          content: Json | null
          created_time: string
          market_id: string
          rating: number
          reviewer_id: string
          vendor_id: string
        }
        Insert: {
          content?: Json | null
          created_time?: string
          market_id: string
          rating: number
          reviewer_id: string
          vendor_id: string
        }
        Update: {
          content?: Json | null
          created_time?: string
          market_id?: string
          rating?: number
          reviewer_id?: string
          vendor_id?: string
        }
        Relationships: []
      }
      scheduler_info: {
        Row: {
          created_time: string
          id: number
          job_name: string
          last_end_time: string | null
          last_start_time: string | null
        }
        Insert: {
          created_time?: string
          id?: never
          job_name: string
          last_end_time?: string | null
          last_start_time?: string | null
        }
        Update: {
          created_time?: string
          id?: never
          job_name?: string
          last_end_time?: string | null
          last_start_time?: string | null
        }
        Relationships: []
      }
      sent_emails: {
        Row: {
          created_time: string
          email_template_id: string
          id: number
          user_id: string
        }
        Insert: {
          created_time?: string
          email_template_id: string
          id?: never
          user_id: string
        }
        Update: {
          created_time?: string
          email_template_id?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      stats: {
        Row: {
          daily_values: number[] | null
          title: string
        }
        Insert: {
          daily_values?: number[] | null
          title: string
        }
        Update: {
          daily_values?: number[] | null
          title?: string
        }
        Relationships: []
      }
      topic_embeddings: {
        Row: {
          created_at: string
          embedding: string
          topic: string
        }
        Insert: {
          created_at?: string
          embedding: string
          topic: string
        }
        Update: {
          created_at?: string
          embedding?: string
          topic?: string
        }
        Relationships: []
      }
      tv_schedule: {
        Row: {
          contract_id: string
          creator_id: string
          end_time: string
          id: number
          is_featured: boolean | null
          schedule_created_time: string | null
          source: string
          start_time: string
          stream_id: string
          title: string
        }
        Insert: {
          contract_id: string
          creator_id: string
          end_time: string
          id?: number
          is_featured?: boolean | null
          schedule_created_time?: string | null
          source: string
          start_time: string
          stream_id: string
          title: string
        }
        Update: {
          contract_id?: string
          creator_id?: string
          end_time?: string
          id?: number
          is_featured?: boolean | null
          schedule_created_time?: string | null
          source?: string
          start_time?: string
          stream_id?: string
          title?: string
        }
        Relationships: []
      }
      txn_summary_stats: {
        Row: {
          category: string
          created_time: string
          end_time: string
          from_type: string
          id: number
          quest_type: string | null
          start_time: string
          to_type: string
          token: string
          total_amount: number
        }
        Insert: {
          category: string
          created_time?: string
          end_time: string
          from_type: string
          id?: never
          quest_type?: string | null
          start_time: string
          to_type: string
          token: string
          total_amount: number
        }
        Update: {
          category?: string
          created_time?: string
          end_time?: string
          from_type?: string
          id?: never
          quest_type?: string | null
          start_time?: string
          to_type?: string
          token?: string
          total_amount?: number
        }
        Relationships: []
      }
      txns: {
        Row: {
          amount: number
          category: string
          created_time: string
          data: Json
          from_id: string
          from_type: string
          id: string
          to_id: string
          to_type: string
          token: string
        }
        Insert: {
          amount: number
          category: string
          created_time?: string
          data: Json
          from_id: string
          from_type: string
          id?: string
          to_id: string
          to_type: string
          token?: string
        }
        Update: {
          amount?: number
          category?: string
          created_time?: string
          data?: Json
          from_id?: string
          from_type?: string
          id?: string
          to_id?: string
          to_type?: string
          token?: string
        }
        Relationships: []
      }
      user_comment_view_events: {
        Row: {
          comment_id: string
          contract_id: string
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          comment_id: string
          contract_id: string
          created_time?: string
          id?: never
          user_id: string
        }
        Update: {
          comment_id?: string
          contract_id?: string
          created_time?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_contract_interactions: {
        Row: {
          bet_group_id: string | null
          bet_id: string | null
          comment_id: string | null
          contract_id: string
          created_time: string
          feed_reasons: string[] | null
          feed_type: string | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          bet_group_id?: string | null
          bet_id?: string | null
          comment_id?: string | null
          contract_id: string
          created_time?: string
          feed_reasons?: string[] | null
          feed_type?: string | null
          id?: never
          name: string
          user_id: string
        }
        Update: {
          bet_group_id?: string | null
          bet_id?: string | null
          comment_id?: string | null
          contract_id?: string
          created_time?: string
          feed_reasons?: string[] | null
          feed_type?: string | null
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_contract_metrics: {
        Row: {
          answer_id: string | null
          contract_id: string
          data: Json
          has_no_shares: boolean | null
          has_shares: boolean | null
          has_yes_shares: boolean | null
          id: number
          profit: number | null
          profit_adjustment: number | null
          total_shares_no: number | null
          total_shares_yes: number | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          contract_id: string
          data: Json
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          id?: never
          profit?: number | null
          profit_adjustment?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          contract_id?: string
          data?: Json
          has_no_shares?: boolean | null
          has_shares?: boolean | null
          has_yes_shares?: boolean | null
          id?: never
          profit?: number | null
          profit_adjustment?: number | null
          total_shares_no?: number | null
          total_shares_yes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_contract_views: {
        Row: {
          card_views: number
          contract_id: string
          id: number
          last_card_view_ts: string | null
          last_page_view_ts: string | null
          last_promoted_view_ts: string | null
          page_views: number
          promoted_views: number
          user_id: string | null
        }
        Insert: {
          card_views?: number
          contract_id: string
          id?: never
          last_card_view_ts?: string | null
          last_page_view_ts?: string | null
          last_promoted_view_ts?: string | null
          page_views?: number
          promoted_views?: number
          user_id?: string | null
        }
        Update: {
          card_views?: number
          contract_id?: string
          id?: never
          last_card_view_ts?: string | null
          last_page_view_ts?: string | null
          last_promoted_view_ts?: string | null
          page_views?: number
          promoted_views?: number
          user_id?: string | null
        }
        Relationships: []
      }
      user_disinterests: {
        Row: {
          comment_id: string | null
          contract_id: string
          created_time: string
          creator_id: string
          feed_id: number | null
          id: number
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          contract_id: string
          created_time?: string
          creator_id: string
          feed_id?: number | null
          id?: never
          user_id: string
        }
        Update: {
          comment_id?: string | null
          contract_id?: string
          created_time?: string
          creator_id?: string
          feed_id?: number | null
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_embeddings: {
        Row: {
          contract_view_embedding: string | null
          created_at: string
          disinterest_embedding: string | null
          interest_embedding: string
          user_id: string
        }
        Insert: {
          contract_view_embedding?: string | null
          created_at?: string
          disinterest_embedding?: string | null
          interest_embedding: string
          user_id: string
        }
        Update: {
          contract_view_embedding?: string | null
          created_at?: string
          disinterest_embedding?: string | null
          interest_embedding?: string
          user_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          ad_id: string | null
          comment_id: string | null
          contract_id: string | null
          data: Json
          id: number
          name: string
          ts: string | null
          user_id: string | null
        }
        Insert: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          data: Json
          id?: never
          name: string
          ts?: string | null
          user_id?: string | null
        }
        Update: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          data?: Json
          id?: never
          name?: string
          ts?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_time: string
          follow_id: string
          user_id: string
        }
        Insert: {
          created_time?: string
          follow_id: string
          user_id: string
        }
        Update: {
          created_time?: string
          follow_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          data: Json
          notification_id: string
          user_id: string
        }
        Insert: {
          data: Json
          notification_id: string
          user_id: string
        }
        Update: {
          data?: Json
          notification_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_portfolio_history: {
        Row: {
          balance: number | null
          cash_balance: number
          cash_investment_value: number
          id: number
          investment_value: number | null
          loan_total: number | null
          profit: number | null
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number | null
          ts: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          cash_balance?: number
          cash_investment_value?: number
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number | null
          ts?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          cash_balance?: number
          cash_investment_value?: number
          id?: never
          investment_value?: number | null
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number | null
          ts?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_portfolio_history_latest: {
        Row: {
          balance: number
          cash_balance: number
          cash_investment_value: number
          investment_value: number
          last_calculated: string
          loan_total: number | null
          profit: number | null
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number
          ts: string
          user_id: string
        }
        Insert: {
          balance: number
          cash_balance?: number
          cash_investment_value?: number
          investment_value: number
          last_calculated: string
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits: number
          ts: string
          user_id: string
        }
        Update: {
          balance?: number
          cash_balance?: number
          cash_investment_value?: number
          investment_value?: number
          last_calculated?: string
          loan_total?: number | null
          profit?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number
          ts?: string
          user_id?: string
        }
        Relationships: []
      }
      user_quest_metrics: {
        Row: {
          idempotency_key: string | null
          score_id: string
          score_value: number
          user_id: string
        }
        Insert: {
          idempotency_key?: string | null
          score_id: string
          score_value: number
          user_id: string
        }
        Update: {
          idempotency_key?: string | null
          score_id?: string
          score_value?: number
          user_id?: string
        }
        Relationships: []
      }
      user_reactions: {
        Row: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time: string
          reaction_id: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_owner_id: string
          content_type: string
          created_time?: string
          reaction_id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_owner_id?: string
          content_type?: string
          created_time?: string
          reaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_seen_chats: {
        Row: {
          channel_id: string
          created_time: string
          id: number
          user_id: string
        }
        Insert: {
          channel_id: string
          created_time?: string
          id?: never
          user_id: string
        }
        Update: {
          channel_id?: string
          created_time?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_topic_interests: {
        Row: {
          created_time: string
          group_ids_to_activity: Json
          id: number
          user_id: string
        }
        Insert: {
          created_time?: string
          group_ids_to_activity: Json
          id?: never
          user_id: string
        }
        Update: {
          created_time?: string
          group_ids_to_activity?: Json
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      user_topics: {
        Row: {
          created_at: string
          topic_embedding: string
          topics: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          topic_embedding: string
          topics: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          topic_embedding?: string
          topics?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_view_events: {
        Row: {
          ad_id: string | null
          comment_id: string | null
          contract_id: string | null
          created_time: string
          id: number
          name: string
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          name: string
          user_id: string
        }
        Update: {
          ad_id?: string | null
          comment_id?: string | null
          contract_id?: string | null
          created_time?: string
          id?: never
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          balance: number
          cash_balance: number
          created_time: string
          data: Json
          id: string
          name: string
          name_username_vector: unknown | null
          resolved_profit_adjustment: number | null
          spice_balance: number
          total_cash_deposits: number
          total_deposits: number
          username: string
        }
        Insert: {
          balance?: number
          cash_balance?: number
          created_time?: string
          data: Json
          id?: string
          name: string
          name_username_vector?: unknown | null
          resolved_profit_adjustment?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number
          username: string
        }
        Update: {
          balance?: number
          cash_balance?: number
          created_time?: string
          data?: Json
          id?: string
          name?: string
          name_username_vector?: unknown | null
          resolved_profit_adjustment?: number | null
          spice_balance?: number
          total_cash_deposits?: number
          total_deposits?: number
          username?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          contract_id: string
          created_time: string
          id: string
          user_id: string
        }
        Insert: {
          contract_id: string
          created_time?: string
          id: string
          user_id: string
        }
        Update: {
          contract_id?: string
          created_time?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_update: {
        Row: {
          contract_metrics: Json
          created_time: string
          id: string
          profit: number
          range_end: string
          user_id: string
        }
        Insert: {
          contract_metrics: Json
          created_time?: string
          id?: string
          profit: number
          range_end: string
          user_id: string
        }
        Update: {
          contract_metrics?: Json
          created_time?: string
          id?: string
          profit?: number
          range_end?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'weekly_update_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'weekly_update_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_referrals_profit'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'weekly_update_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      group_role: {
        Row: {
          avatar_url: string | null
          createdtime: number | null
          creator_id: string | null
          group_id: string | null
          group_name: string | null
          group_slug: string | null
          member_id: string | null
          name: string | null
          privacy_status: string | null
          role: string | null
          total_members: number | null
          username: string | null
        }
        Relationships: []
      }
      user_league_info: {
        Row: {
          cohort: string | null
          created_time: string | null
          division: number | null
          mana_earned: number | null
          mana_earned_breakdown: Json | null
          rank: number | null
          rank_snapshot: number | null
          season: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_referrals: {
        Row: {
          data: Json | null
          id: string | null
          rank: number | null
          total_referrals: number | null
        }
        Relationships: []
      }
      user_referrals_profit: {
        Row: {
          data: Json | null
          id: string | null
          rank: number | null
          total_referrals: number | null
          total_referred_profit: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_creator_name_to_description: {
        Args: {
          data: Json
        }
        Returns: string
      }
      calculate_earth_distance_km: {
        Args: {
          lat1: number
          lon1: number
          lat2: number
          lon2: number
        }
        Returns: number
      }
      can_access_private_messages: {
        Args: {
          channel_id: number
          user_id: string
        }
        Returns: boolean
      }
      close_contract_embeddings: {
        Args: {
          input_contract_id: string
          similarity_threshold: number
          match_count: number
        }
        Returns: {
          contract_id: string
          similarity: number
          data: Json
        }[]
      }
      count_recent_comments: {
        Args: {
          contract_id: string
        }
        Returns: number
      }
      count_recent_comments_by_contract: {
        Args: Record<PropertyKey, never>
        Returns: {
          contract_id: string
          comment_count: number
        }[]
      }
      creator_leaderboard: {
        Args: {
          limit_n: number
        }
        Returns: {
          user_id: string
          total_traders: number
          name: string
          username: string
          avatar_url: string
        }[]
      }
      creator_rank: {
        Args: {
          uid: string
        }
        Returns: number
      }
      date_to_midnight_pt: {
        Args: {
          d: string
        }
        Returns: string
      }
      extract_text_from_rich_text_json: {
        Args: {
          description: Json
        }
        Returns: string
      }
      firebase_uid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_average_rating: {
        Args: {
          user_id: string
        }
        Returns: number
      }
      get_compatibility_questions_with_answer_count: {
        Args: Record<PropertyKey, never>
        Returns: Database['public']['CompositeTypes']['love_question_with_count_type'][]
      }
      get_contract_metrics_with_contracts:
        | {
            Args: {
              uid: string
              count: number
            }
            Returns: {
              contract_id: string
              metrics: Json
              contract: Json
            }[]
          }
        | {
            Args: {
              uid: string
              count: number
              start: number
            }
            Returns: {
              contract_id: string
              metrics: Json
              contract: Json
            }[]
          }
      get_contract_voters: {
        Args: {
          this_contract_id: string
        }
        Returns: {
          data: Json
        }[]
      }
      get_contracts_in_group_slugs_1: {
        Args: {
          contract_ids: string[]
          p_group_slugs: string[]
          ignore_slugs: string[]
        }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_cpmm_pool_prob: {
        Args: {
          pool: Json
          p: number
        }
        Returns: number
      }
      get_daily_claimed_boosts: {
        Args: {
          user_id: string
        }
        Returns: {
          total: number
        }[]
      }
      get_donations_by_charity: {
        Args: Record<PropertyKey, never>
        Returns: {
          charity_id: string
          num_supporters: number
          total: number
        }[]
      }
      get_group_contracts: {
        Args: {
          this_group_id: string
        }
        Returns: {
          data: Json
        }[]
      }
      get_love_question_answers_and_lovers: {
        Args: {
          p_question_id: number
        }
        Returns: Database['public']['CompositeTypes']['other_lover_answers_type'][]
      }
      get_market_ads: {
        Args: {
          uid: string
        }
        Returns: {
          ad_id: string
          market_id: string
          ad_funds: number
          ad_cost_per_view: number
          market_data: Json
        }[]
      }
      get_non_empty_private_message_channel_ids:
        | {
            Args: {
              p_user_id: string
              p_ignored_statuses: string[]
              p_limit: number
            }
            Returns: {
              created_time: string
              id: number
              last_updated_time: string
              title: string | null
            }[]
          }
        | {
            Args: {
              p_user_id: string
              p_limit?: number
            }
            Returns: {
              id: number
            }[]
          }
      get_noob_questions: {
        Args: Record<PropertyKey, never>
        Returns: {
          close_time: string | null
          conversion_score: number
          created_time: string | null
          creator_id: string | null
          daily_score: number
          data: Json
          deleted: boolean | null
          description_fts: unknown | null
          freshness_score: number
          group_slugs: string[] | null
          id: string
          importance_score: number
          is_spice_payout: boolean | null
          last_bet_time: string | null
          last_comment_time: string | null
          last_updated_time: string | null
          mechanism: string | null
          outcome_type: string | null
          popularity_score: number
          question: string | null
          question_fts: unknown | null
          question_nostop_fts: unknown | null
          resolution: string | null
          resolution_probability: number | null
          resolution_time: string | null
          slug: string | null
          tier: string | null
          token: string
          unique_bettor_count: number
          view_count: number
          visibility: string | null
        }[]
      }
      get_option_voters: {
        Args: {
          this_contract_id: string
          this_option_id: string
        }
        Returns: {
          data: Json
        }[]
      }
      get_rating: {
        Args: {
          user_id: string
        }
        Returns: {
          count: number
          rating: number
        }[]
      }
      get_recently_active_contracts_in_group_slugs_1: {
        Args: {
          p_group_slugs: string[]
          ignore_slugs: string[]
          max: number
        }
        Returns: {
          data: Json
          importance_score: number
        }[]
      }
      get_top_market_ads: {
        Args: {
          uid: string
          distance_threshold: number
        }
        Returns: {
          ad_id: string
          market_id: string
          ad_funds: number
          ad_cost_per_view: number
          market_data: Json
        }[]
      }
      get_user_bet_contracts: {
        Args: {
          this_user_id: string
          this_limit: number
        }
        Returns: {
          data: Json
        }[]
      }
      get_user_group_id_for_current_user: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_manalink_claims: {
        Args: {
          creator_id: string
        }
        Returns: {
          manalink_id: string
          claimant_id: string
          ts: number
        }[]
      }
      get_user_topic_interests_2: {
        Args: {
          p_user_id: string
        }
        Returns: {
          group_id: string
          score: number
        }[]
      }
      get_your_contract_ids:
        | {
            Args: {
              uid: string
            }
            Returns: {
              contract_id: string
            }[]
          }
        | {
            Args: {
              uid: string
              n: number
              start: number
            }
            Returns: {
              contract_id: string
            }[]
          }
      get_your_daily_changed_contracts: {
        Args: {
          uid: string
          n: number
          start: number
        }
        Returns: {
          data: Json
          daily_score: number
        }[]
      }
      get_your_recent_contracts: {
        Args: {
          uid: string
          n: number
          start: number
        }
        Returns: {
          data: Json
          max_ts: number
        }[]
      }
      gtrgm_compress: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      gtrgm_in: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      gtrgm_options: {
        Args: {
          '': unknown
        }
        Returns: undefined
      }
      gtrgm_out: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      has_moderator_or_above_role: {
        Args: {
          this_group_id: string
          this_user_id: string
        }
        Returns: boolean
      }
      hnswhandler: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      install_available_extensions_and_test: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin: {
        Args: {
          input_string: string
        }
        Returns: boolean
      }
      is_group_member: {
        Args: {
          this_group_id: string
          this_user_id: string
        }
        Returns: boolean
      }
      is_valid_contract: {
        Args: {
          ct: unknown
        }
        Returns: boolean
      }
      ivfflathandler: {
        Args: {
          '': unknown
        }
        Returns: unknown
      }
      jsonb_array_to_text_array: {
        Args: {
          _js: Json
        }
        Returns: string[]
      }
      millis_interval: {
        Args: {
          start_millis: number
          end_millis: number
        }
        Returns: unknown
      }
      millis_to_ts: {
        Args: {
          millis: number
        }
        Returns: string
      }
      profit_leaderboard: {
        Args: {
          limit_n: number
        }
        Returns: {
          user_id: string
          profit: number
          name: string
          username: string
          avatar_url: string
        }[]
      }
      profit_rank: {
        Args: {
          uid: string
          excluded_ids?: string[]
        }
        Returns: number
      }
      random_alphanumeric: {
        Args: {
          length: number
        }
        Returns: string
      }
      recently_liked_contract_counts: {
        Args: {
          since: number
        }
        Returns: {
          contract_id: string
          n: number
        }[]
      }
      sample_resolved_bets: {
        Args: {
          trader_threshold: number
          p: number
        }
        Returns: {
          prob: number
          is_yes: boolean
        }[]
      }
      save_user_topics_blank: {
        Args: {
          p_user_id: string
        }
        Returns: undefined
      }
      search_contract_embeddings: {
        Args: {
          query_embedding: string
          similarity_threshold: number
          match_count: number
        }
        Returns: {
          contract_id: string
          similarity: number
        }[]
      }
      set_limit: {
        Args: {
          '': number
        }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: {
          '': string
        }
        Returns: string[]
      }
      test: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      to_jsonb: {
        Args: {
          '': Json
        }
        Returns: Json
      }
      ts_to_millis:
        | {
            Args: {
              ts: string
            }
            Returns: number
          }
        | {
            Args: {
              ts: string
            }
            Returns: number
          }
      vector_avg: {
        Args: {
          '': number[]
        }
        Returns: string
      }
      vector_dims: {
        Args: {
          '': string
        }
        Returns: number
      }
      vector_norm: {
        Args: {
          '': string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          '': string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          '': string
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          '': unknown[]
        }
        Returns: number
      }
    }
    Enums: {
      status_type: 'new' | 'under review' | 'resolved' | 'needs admin'
    }
    CompositeTypes: {
      love_question_with_count_type: {
        id: number | null
        creator_id: string | null
        created_time: string | null
        question: string | null
        importance_score: number | null
        answer_type: string | null
        multiple_choice_options: Json | null
        answer_count: number | null
      }
      other_lover_answers_type: {
        question_id: number | null
        created_time: string | null
        free_response: string | null
        multiple_choice: number | null
        integer: number | null
        age: number | null
        gender: string | null
        city: string | null
        data: Json | null
      }
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
      PublicSchema['Views'])
  ? (PublicSchema['Tables'] &
      PublicSchema['Views'])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema['Enums']
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
  ? PublicSchema['Enums'][PublicEnumNameOrOptions]
  : never
