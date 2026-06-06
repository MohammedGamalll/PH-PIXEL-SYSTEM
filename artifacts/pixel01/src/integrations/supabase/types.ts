export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          account_id: string
          owner_id: string
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          account_id: string
          owner_id: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          owner_id?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_number: string
          account_type: string
          created_at: string
          created_by: string | null
          details: Json
          id: string
          is_cash_equivalent: boolean
          is_closed: boolean
          is_default_cash: boolean
          is_system: boolean
          name: string
          note: string | null
          opening_balance: number
          owner_id: string
          sub_account_type: string | null
          updated_at: string
        }
        Insert: {
          account_number: string
          account_type: string
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          is_cash_equivalent?: boolean
          is_closed?: boolean
          is_default_cash?: boolean
          is_system?: boolean
          name: string
          note?: string | null
          opening_balance?: number
          owner_id: string
          sub_account_type?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: string
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          is_cash_equivalent?: boolean
          is_closed?: boolean
          is_default_cash?: boolean
          is_system?: boolean
          name?: string
          note?: string | null
          opening_balance?: number
          owner_id?: string
          sub_account_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          owner_id: string
          target_employee_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id: string
          target_employee_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string
          target_employee_id?: string | null
          title?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          employee_id: string
          employee_name_snapshot: string | null
          id: string
          late_minutes: number
          notes: string | null
          overtime_minutes: number
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          employee_id: string
          employee_name_snapshot?: string | null
          id?: string
          late_minutes?: number
          notes?: string | null
          overtime_minutes?: number
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          employee_name_snapshot?: string | null
          id?: string
          late_minutes?: number
          notes?: string | null
          overtime_minutes?: number
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
          use_for_repair: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          use_for_repair?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          use_for_repair?: boolean
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          business_name: string
          created_at: string
          currency_code: string
          currency_placement: string
          currency_symbol: string
          enable_expiry_dates: boolean
          id: string
          nav_bg: string | null
          nav_text: string | null
          owner_id: string
          sidebar_bg: string | null
          sidebar_business_name_color: string | null
          sidebar_text: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          business_name?: string
          created_at?: string
          currency_code?: string
          currency_placement?: string
          currency_symbol?: string
          enable_expiry_dates?: boolean
          id?: string
          nav_bg?: string | null
          nav_text?: string | null
          owner_id: string
          sidebar_bg?: string | null
          sidebar_business_name_color?: string | null
          sidebar_text?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          currency_code?: string
          currency_placement?: string
          currency_symbol?: string
          enable_expiry_dates?: boolean
          id?: string
          nav_bg?: string | null
          nav_text?: string | null
          owner_id?: string
          sidebar_bg?: string | null
          sidebar_business_name_color?: string | null
          sidebar_text?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cashier_sessions: {
        Row: {
          cash_variance: number
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          owner_id: string
          status: string
          updated_at: string
          user_id: string | null
          user_name_snapshot: string | null
          warehouse_id: string | null
        }
        Insert: {
          cash_variance?: number
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          owner_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          user_name_snapshot?: string | null
          warehouse_id?: string | null
        }
        Update: {
          cash_variance?: number
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          owner_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          user_name_snapshot?: string | null
          warehouse_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          has_sub_category: boolean
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          has_sub_category?: boolean
          id?: string
          name: string
          owner_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          has_sub_category?: boolean
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contact_documents: {
        Row: {
          contact_id: string
          created_at: string
          file_path: string
          file_type: string | null
          id: string
          owner_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          file_path: string
          file_type?: string | null
          id?: string
          owner_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          file_path?: string
          file_type?: string | null
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      contact_payment_invoice_allocations: {
        Row: {
          allocated_amount: number
          contact_payment_id: string
          created_at: string
          document_id: string
          document_type: string
          id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          contact_payment_id: string
          created_at?: string
          document_id: string
          document_type: string
          id?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          contact_payment_id?: string
          created_at?: string
          document_id?: string
          document_type?: string
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_payment_invoice_allocations_contact_payment_id_fkey"
            columns: ["contact_payment_id"]
            isOneToOne: false
            referencedRelation: "contact_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_payments: {
        Row: {
          allocated_amount: number
          amount: number
          contact_id: string
          contact_name_snapshot: string | null
          contact_type: string
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          direction: string
          id: string
          is_reversal: boolean
          notes: string | null
          original_payment_id: string | null
          owner_id: string
          payment_date: string
          payment_method: string | null
          ref_no: string | null
          reversal_reason: string | null
          reversed_amount: number
          reversed_at: string | null
          reversed_by_payment_id: string | null
          session_id: string | null
          treasury_account_id: string | null
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          amount?: number
          contact_id: string
          contact_name_snapshot?: string | null
          contact_type: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          direction: string
          id?: string
          is_reversal?: boolean
          notes?: string | null
          original_payment_id?: string | null
          owner_id: string
          payment_date?: string
          payment_method?: string | null
          ref_no?: string | null
          reversal_reason?: string | null
          reversed_amount?: number
          reversed_at?: string | null
          reversed_by_payment_id?: string | null
          session_id?: string | null
          treasury_account_id?: string | null
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          amount?: number
          contact_id?: string
          contact_name_snapshot?: string | null
          contact_type?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          direction?: string
          id?: string
          is_reversal?: boolean
          notes?: string | null
          original_payment_id?: string | null
          owner_id?: string
          payment_date?: string
          payment_method?: string | null
          ref_no?: string | null
          reversal_reason?: string | null
          reversed_amount?: number
          reversed_at?: string | null
          reversed_by_payment_id?: string | null
          session_id?: string | null
          treasury_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_payments_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "contact_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_payments_reversed_by_payment_id_fkey"
            columns: ["reversed_by_payment_id"]
            isOneToOne: false
            referencedRelation: "contact_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          address_line_1: string | null
          address_line_2: string | null
          advance_balance: number
          alt_mobile: string | null
          assigned_to: string | null
          business_name: string | null
          business_type: string
          city: string | null
          contact_id: string | null
          created_at: string
          credit_limit: number
          custom_field_1: string | null
          custom_field_10: string | null
          custom_field_2: string | null
          custom_field_3: string | null
          custom_field_4: string | null
          custom_field_5: string | null
          custom_field_6: string | null
          custom_field_7: string | null
          custom_field_8: string | null
          custom_field_9: string | null
          customer_group_id: string | null
          discount_note: string | null
          discount_percent: number
          dob: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string | null
          middle_name: string | null
          mobile: string | null
          opening_balance: number
          owner_id: string
          pay_term: string | null
          phone: string | null
          prefix: string | null
          shipping_address: string | null
          state: string | null
          tax_number: string | null
          type: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          advance_balance?: number
          alt_mobile?: string | null
          assigned_to?: string | null
          business_name?: string | null
          business_type?: string
          city?: string | null
          contact_id?: string | null
          created_at?: string
          credit_limit?: number
          custom_field_1?: string | null
          custom_field_10?: string | null
          custom_field_2?: string | null
          custom_field_3?: string | null
          custom_field_4?: string | null
          custom_field_5?: string | null
          custom_field_6?: string | null
          custom_field_7?: string | null
          custom_field_8?: string | null
          custom_field_9?: string | null
          customer_group_id?: string | null
          discount_note?: string | null
          discount_percent?: number
          dob?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          middle_name?: string | null
          mobile?: string | null
          opening_balance?: number
          owner_id: string
          pay_term?: string | null
          phone?: string | null
          prefix?: string | null
          shipping_address?: string | null
          state?: string | null
          tax_number?: string | null
          type: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          advance_balance?: number
          alt_mobile?: string | null
          assigned_to?: string | null
          business_name?: string | null
          business_type?: string
          city?: string | null
          contact_id?: string | null
          created_at?: string
          credit_limit?: number
          custom_field_1?: string | null
          custom_field_10?: string | null
          custom_field_2?: string | null
          custom_field_3?: string | null
          custom_field_4?: string | null
          custom_field_5?: string | null
          custom_field_6?: string | null
          custom_field_7?: string | null
          custom_field_8?: string | null
          custom_field_9?: string | null
          customer_group_id?: string | null
          discount_note?: string | null
          discount_percent?: number
          dob?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          middle_name?: string | null
          mobile?: string | null
          opening_balance?: number
          owner_id?: string
          pay_term?: string | null
          phone?: string | null
          prefix?: string | null
          shipping_address?: string | null
          state?: string | null
          tax_number?: string | null
          type?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_groups: {
        Row: {
          amount: number
          calc_type: string
          created_at: string
          id: string
          name: string
          owner_id: string
          price_group_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          calc_type?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          price_group_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          calc_type?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          price_group_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      damaged_stock: {
        Row: {
          branch: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          damage_date: string
          damage_type: string
          id: string
          owner_id: string
          reason: string | null
          recovered_total: number
          ref_number: string | null
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          damage_date?: string
          damage_type?: string
          id?: string
          owner_id: string
          reason?: string | null
          recovered_total?: number
          ref_number?: string | null
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          damage_date?: string
          damage_type?: string
          id?: string
          owner_id?: string
          reason?: string | null
          recovered_total?: number
          ref_number?: string | null
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      damaged_stock_items: {
        Row: {
          base_quantity: number | null
          created_at: string
          damaged_stock_id: string
          description: string
          expiry_date: string | null
          id: string
          product_id: string | null
          product_name_snapshot: string | null
          quantity: number
          total: number
          unit_name: string | null
          unit_price: number
        }
        Insert: {
          base_quantity?: number | null
          created_at?: string
          damaged_stock_id: string
          description: string
          expiry_date?: string | null
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          quantity?: number
          total?: number
          unit_name?: string | null
          unit_price?: number
        }
        Update: {
          base_quantity?: number | null
          created_at?: string
          damaged_stock_id?: string
          description?: string
          expiry_date?: string | null
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          quantity?: number
          total?: number
          unit_name?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "damaged_stock_items_damaged_stock_id_fkey"
            columns: ["damaged_stock_id"]
            isOneToOne: false
            referencedRelation: "damaged_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_activity_log: {
        Row: {
          action_type: string
          actor_name: string | null
          admin_id: string
          created_at: string
          details: Json | null
          employee_id: string | null
          id: string
          ip_address: string | null
          owner_id: string
          subject_id: string | null
          subject_label: string | null
          subject_type: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_name?: string | null
          admin_id: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          owner_id: string
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_name?: string | null
          admin_id?: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          owner_id?: string
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          admin_id: string
          basic_salary: number
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          name: string
          permissions: Json
          phone: string | null
          status: string
          updated_at: string
          working_hours: number
        }
        Insert: {
          admin_id: string
          basic_salary?: number
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          name: string
          permissions?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          working_hours?: number
        }
        Update: {
          admin_id?: string
          basic_salary?: number
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          name?: string
          permissions?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          working_hours?: number
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          account_id: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          due_amount: number
          expense_account_id: string | null
          expense_date: string
          id: string
          is_recurring: boolean
          notes: string | null
          owner_id: string
          paid_amount: number
          payment_account: string | null
          payment_account_id: string | null
          payment_method: string | null
          payment_note: string | null
          payment_status: string
          reason: string | null
          recur_count: number | null
          recur_interval_number: number | null
          recur_interval_type: string | null
          ref_no: string | null
          sales_rep_id: string | null
          sales_rep_name_snapshot: string | null
          spent_by: string | null
          spent_to: string | null
          sub_category_id: string | null
          tax_applied: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          category?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          description?: string | null
          due_amount?: number
          expense_account_id?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          owner_id: string
          paid_amount?: number
          payment_account?: string | null
          payment_account_id?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_status?: string
          reason?: string | null
          recur_count?: number | null
          recur_interval_number?: number | null
          recur_interval_type?: string | null
          ref_no?: string | null
          sales_rep_id?: string | null
          sales_rep_name_snapshot?: string | null
          spent_by?: string | null
          spent_to?: string | null
          sub_category_id?: string | null
          tax_applied?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          description?: string | null
          due_amount?: number
          expense_account_id?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean
          notes?: string | null
          owner_id?: string
          paid_amount?: number
          payment_account?: string | null
          payment_account_id?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_status?: string
          reason?: string | null
          recur_count?: number | null
          recur_interval_number?: number | null
          recur_interval_type?: string | null
          ref_no?: string | null
          sales_rep_id?: string | null
          sales_rep_name_snapshot?: string | null
          spent_by?: string | null
          spent_to?: string | null
          sub_category_id?: string | null
          tax_applied?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      inventory_branch_transfer_items: {
        Row: {
          base_quantity: number
          created_at: string
          expiry_date: string | null
          id: string
          product_name: string
          quantity: number
          sku: string | null
          source_product_id: string | null
          target_product_id: string | null
          total: number
          transfer_id: string
          unit_cost: number
          unit_name: string | null
        }
        Insert: {
          base_quantity?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_name: string
          quantity?: number
          sku?: string | null
          source_product_id?: string | null
          target_product_id?: string | null
          total?: number
          transfer_id: string
          unit_cost?: number
          unit_name?: string | null
        }
        Update: {
          base_quantity?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_name?: string
          quantity?: number
          sku?: string | null
          source_product_id?: string | null
          target_product_id?: string | null
          total?: number
          transfer_id?: string
          unit_cost?: number
          unit_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_branch_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_branch_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_branch_transfers: {
        Row: {
          cash_value: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          notes: string | null
          owner_id: string
          receiver_treasury_tx_id: string | null
          sender_treasury_tx_id: string | null
          target_name_snapshot: string | null
          target_owner_id: string
          total_cost: number
          total_items: number
          transfer_date: string
        }
        Insert: {
          cash_value?: number
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          receiver_treasury_tx_id?: string | null
          sender_treasury_tx_id?: string | null
          target_name_snapshot?: string | null
          target_owner_id: string
          total_cost?: number
          total_items?: number
          transfer_date?: string
        }
        Update: {
          cash_value?: number
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          receiver_treasury_tx_id?: string | null
          sender_treasury_tx_id?: string | null
          target_name_snapshot?: string | null
          target_owner_id?: string
          total_cost?: number
          total_items?: number
          transfer_date?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          base_quantity: number | null
          cost_at_time: number | null
          created_at: string
          description: string
          discount_amount: number
          expiry_date: string | null
          id: string
          invoice_id: string
          product_id: string | null
          product_name_snapshot: string | null
          promotional_discount_id: string | null
          quantity: number
          sold_price_at_time: number | null
          total: number
          unit_name: string | null
          unit_price: number
          warranty_end_date: string | null
        }
        Insert: {
          base_quantity?: number | null
          cost_at_time?: number | null
          created_at?: string
          description: string
          discount_amount?: number
          expiry_date?: string | null
          id?: string
          invoice_id: string
          product_id?: string | null
          product_name_snapshot?: string | null
          promotional_discount_id?: string | null
          quantity?: number
          sold_price_at_time?: number | null
          total?: number
          unit_name?: string | null
          unit_price?: number
          warranty_end_date?: string | null
        }
        Update: {
          base_quantity?: number | null
          cost_at_time?: number | null
          created_at?: string
          description?: string
          discount_amount?: number
          expiry_date?: string | null
          id?: string
          invoice_id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          promotional_discount_id?: string | null
          quantity?: number
          sold_price_at_time?: number | null
          total?: number
          unit_name?: string | null
          unit_price?: number
          warranty_end_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          delivered_to: string | null
          delivery_person: string | null
          discount: number
          due_date: string | null
          id: string
          invoice_number: string
          is_returned_from_id: string | null
          issue_date: string
          notes: string | null
          owner_id: string
          paid_amount: number
          payment_account_id: string | null
          payment_method: string | null
          payment_splits: Json | null
          payment_status: string
          public_share_token: string
          receivable_account_id: string | null
          returned_status: string
          sales_rep_id: string | null
          sales_rep_name_snapshot: string | null
          session_id: string | null
          shipping_address: string | null
          shipping_cost: number
          shipping_details: string | null
          shipping_note: string | null
          shipping_status: string
          status: string
          subtotal: number
          tax: number
          total: number
          type: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          delivered_to?: string | null
          delivery_person?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          is_returned_from_id?: string | null
          issue_date?: string
          notes?: string | null
          owner_id: string
          paid_amount?: number
          payment_account_id?: string | null
          payment_method?: string | null
          payment_splits?: Json | null
          payment_status?: string
          public_share_token?: string
          receivable_account_id?: string | null
          returned_status?: string
          sales_rep_id?: string | null
          sales_rep_name_snapshot?: string | null
          session_id?: string | null
          shipping_address?: string | null
          shipping_cost?: number
          shipping_details?: string | null
          shipping_note?: string | null
          shipping_status?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          type?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          delivered_to?: string | null
          delivery_person?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          is_returned_from_id?: string | null
          issue_date?: string
          notes?: string | null
          owner_id?: string
          paid_amount?: number
          payment_account_id?: string | null
          payment_method?: string | null
          payment_splits?: Json | null
          payment_status?: string
          public_share_token?: string
          receivable_account_id?: string | null
          returned_status?: string
          sales_rep_id?: string | null
          sales_rep_name_snapshot?: string | null
          session_id?: string | null
          shipping_address?: string | null
          shipping_cost?: number
          shipping_details?: string | null
          shipping_note?: string | null
          shipping_status?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          type?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_is_returned_from_id_fkey"
            columns: ["is_returned_from_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          document_url: string | null
          entry_date: string
          id: string
          note: string | null
          owner_id: string
          payment_method: string | null
          ref_no: string | null
          source_id: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          owner_id: string
          payment_method?: string | null
          ref_no?: string | null
          source_id?: string | null
          source_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          owner_id?: string
          payment_method?: string | null
          ref_no?: string | null
          source_id?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          metadata: Json | null
          owner_id: string
          severity: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json | null
          owner_id: string
          severity?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json | null
          owner_id?: string
          severity?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          absence_deductions: number
          basic_salary: number
          bonuses: number
          created_at: string
          deductions: number
          employee_id: string
          employee_name_snapshot: string | null
          id: string
          journal_entry_id: string | null
          late_deductions: number
          month_year: string
          net_salary: number
          notes: string | null
          owner_id: string
          paid_at: string | null
          status: string
          treasury_account_id: string | null
          treasury_transaction_id: string | null
          updated_at: string
        }
        Insert: {
          absence_deductions?: number
          basic_salary?: number
          bonuses?: number
          created_at?: string
          deductions?: number
          employee_id: string
          employee_name_snapshot?: string | null
          id?: string
          journal_entry_id?: string | null
          late_deductions?: number
          month_year: string
          net_salary?: number
          notes?: string | null
          owner_id: string
          paid_at?: string | null
          status?: string
          treasury_account_id?: string | null
          treasury_transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          absence_deductions?: number
          basic_salary?: number
          bonuses?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          employee_name_snapshot?: string | null
          id?: string
          journal_entry_id?: string | null
          late_deductions?: number
          month_year?: string
          net_salary?: number
          notes?: string | null
          owner_id?: string
          paid_at?: string | null
          status?: string
          treasury_account_id?: string | null
          treasury_transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      price_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_warehouse_stock: {
        Row: {
          id: string
          owner_id: string
          product_id: string
          stock: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          owner_id: string
          product_id: string
          stock?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          owner_id?: string
          product_id?: string
          stock?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          cost: number
          created_at: string
          expiry_date: string | null
          has_expiry: boolean
          id: string
          image_url: string | null
          is_active: boolean
          last_purchase_discount: number | null
          low_stock_threshold: number
          main_unit: string | null
          name: string
          name_en: string | null
          owner_id: string
          previous_cost: number | null
          previous_price: number | null
          price: number
          sku: string | null
          stock: number
          sub_unit_1: string | null
          sub_unit_1_ratio: number | null
          sub_unit_2: string | null
          sub_unit_2_ratio: number | null
          unit: string | null
          unit_id: string | null
          updated_at: string
          warehouse_id: string | null
          warranty_id: string | null
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          expiry_date?: string | null
          has_expiry?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_purchase_discount?: number | null
          low_stock_threshold?: number
          main_unit?: string | null
          name: string
          name_en?: string | null
          owner_id: string
          previous_cost?: number | null
          previous_price?: number | null
          price?: number
          sku?: string | null
          stock?: number
          sub_unit_1?: string | null
          sub_unit_1_ratio?: number | null
          sub_unit_2?: string | null
          sub_unit_2_ratio?: number | null
          unit?: string | null
          unit_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
          warranty_id?: string | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          expiry_date?: string | null
          has_expiry?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_purchase_discount?: number | null
          low_stock_threshold?: number
          main_unit?: string | null
          name?: string
          name_en?: string | null
          owner_id?: string
          previous_cost?: number | null
          previous_price?: number | null
          price?: number
          sku?: string | null
          stock?: number
          sub_unit_1?: string | null
          sub_unit_1_ratio?: number | null
          sub_unit_2?: string | null
          sub_unit_2_ratio?: number | null
          unit?: string | null
          unit_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
          warranty_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotional_discounts: {
        Row: {
          amount: number
          brand_id: string | null
          category_id: string | null
          created_at: string
          discount_type: string
          ends_at: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string
          priority: number
          product_ids: string[]
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          discount_type?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          priority?: number
          product_ids?: string[]
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          discount_type?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          priority?: number
          product_ids?: string[]
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          base_quantity: number | null
          created_at: string
          description: string
          discount_percent: number
          expiry_date: string | null
          id: string
          product_id: string | null
          product_name_snapshot: string | null
          purchase_id: string
          quantity: number
          sell_price: number
          total: number
          unit_name: string | null
          unit_price: number
        }
        Insert: {
          base_quantity?: number | null
          created_at?: string
          description: string
          discount_percent?: number
          expiry_date?: string | null
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          purchase_id: string
          quantity?: number
          sell_price?: number
          total?: number
          unit_name?: string | null
          unit_price?: number
        }
        Update: {
          base_quantity?: number | null
          created_at?: string
          description?: string
          discount_percent?: number
          expiry_date?: string | null
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          purchase_id?: string
          quantity?: number
          sell_price?: number
          total?: number
          unit_name?: string | null
          unit_price?: number
        }
        Relationships: []
      }
      purchase_return_items: {
        Row: {
          base_quantity: number | null
          created_at: string
          description: string
          id: string
          product_id: string | null
          purchase_return_id: string
          quantity: number
          total: number
          unit_name: string | null
          unit_price: number
        }
        Insert: {
          base_quantity?: number | null
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          purchase_return_id: string
          quantity?: number
          total?: number
          unit_name?: string | null
          unit_price?: number
        }
        Update: {
          base_quantity?: number | null
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          purchase_return_id?: string
          quantity?: number
          total?: number
          unit_name?: string | null
          unit_price?: number
        }
        Relationships: []
      }
      purchase_returns: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          owner_id: string
          purchase_id: string | null
          ref_no: string | null
          return_date: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          owner_id: string
          purchase_id?: string | null
          ref_no?: string | null
          return_date?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          owner_id?: string
          purchase_id?: string | null
          ref_no?: string | null
          return_date?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          ap_account_id: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          due_amount: number
          id: string
          inventory_account_id: string | null
          is_opening: boolean
          issue_date: string
          notes: string | null
          owner_id: string
          paid_amount: number
          pay_term_number: number | null
          pay_term_type: string | null
          payment_account: string | null
          payment_account_id: string | null
          payment_method: string | null
          payment_note: string | null
          payment_status: string
          purchase_date: string | null
          purchase_number: string
          ref_no: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          supplier_name_snapshot: string | null
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          ap_account_id?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          due_amount?: number
          id?: string
          inventory_account_id?: string | null
          is_opening?: boolean
          issue_date?: string
          notes?: string | null
          owner_id: string
          paid_amount?: number
          pay_term_number?: number | null
          pay_term_type?: string | null
          payment_account?: string | null
          payment_account_id?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_status?: string
          purchase_date?: string | null
          purchase_number: string
          ref_no?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          ap_account_id?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          due_amount?: number
          id?: string
          inventory_account_id?: string | null
          is_opening?: boolean
          issue_date?: string
          notes?: string | null
          owner_id?: string
          paid_amount?: number
          pay_term_number?: number | null
          pay_term_type?: string | null
          payment_account?: string | null
          payment_account_id?: string | null
          payment_method?: string | null
          payment_note?: string | null
          payment_status?: string
          purchase_date?: string | null
          purchase_number?: string
          ref_no?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_name_snapshot?: string | null
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_runs: {
        Row: {
          created_at: string
          generated_expense_id: string | null
          id: string
          notes: string | null
          owner_id: string
          run_date: string
          source_expense_id: string
          status: string
        }
        Insert: {
          created_at?: string
          generated_expense_id?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          run_date: string
          source_expense_id: string
          status?: string
        }
        Update: {
          created_at?: string
          generated_expense_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          run_date?: string
          source_expense_id?: string
          status?: string
        }
        Relationships: []
      }
      sales_reps: {
        Row: {
          address: string | null
          commission_percent: number
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          owner_id: string
          phone: string | null
          prefix: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          commission_percent?: number
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          owner_id: string
          phone?: string | null
          prefix?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          commission_percent?: number
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          owner_id?: string
          phone?: string | null
          prefix?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      soft_deletes: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          entity_id: string
          entity_label: string | null
          entity_type: string
          id: string
          owner_id: string
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          entity_id: string
          entity_label?: string | null
          entity_type: string
          id?: string
          owner_id: string
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          id?: string
          owner_id?: string
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
        }
        Relationships: []
      }
      standalone_return_items: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          product_id: string | null
          product_name_snapshot: string | null
          quantity: number
          standalone_return_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          quantity?: number
          standalone_return_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          quantity?: number
          standalone_return_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "standalone_return_items_standalone_return_id_fkey"
            columns: ["standalone_return_id"]
            isOneToOne: false
            referencedRelation: "standalone_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      standalone_returns: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          owner_id: string
          reason: string | null
          reference_no: string | null
          return_date: string
          return_type: string
          total_amount: number
          treasury_id: string | null
          treasury_transaction_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          owner_id: string
          reason?: string | null
          reference_no?: string | null
          return_date?: string
          return_type: string
          total_amount?: number
          treasury_id?: string | null
          treasury_transaction_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          owner_id?: string
          reason?: string | null
          reference_no?: string | null
          return_date?: string
          return_type?: string
          total_amount?: number
          treasury_id?: string | null
          treasury_transaction_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      stock_adjustment_items: {
        Row: {
          adjustment_id: string
          cost_at_time: number
          created_at: string
          expiry_date: string | null
          id: string
          is_new_batch: boolean
          original_expiry_date: string | null
          owner_id: string
          physical_qty: number
          product_id: string
          system_qty: number
          variance_qty: number | null
          variance_value: number | null
        }
        Insert: {
          adjustment_id: string
          cost_at_time?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_new_batch?: boolean
          original_expiry_date?: string | null
          owner_id: string
          physical_qty?: number
          product_id: string
          system_qty?: number
          variance_qty?: number | null
          variance_value?: number | null
        }
        Update: {
          adjustment_id?: string
          cost_at_time?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_new_batch?: boolean
          original_expiry_date?: string | null
          owner_id?: string
          physical_qty?: number
          product_id?: string
          system_qty?: number
          variance_qty?: number | null
          variance_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_filter_id: string | null
          category_filter_id: string | null
          count_date: string
          created_at: string
          created_by: string
          created_by_name_snapshot: string | null
          id: string
          notes: string | null
          owner_id: string
          ref_no: string
          status: string
          total_variance_qty: number
          total_variance_value: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brand_filter_id?: string | null
          category_filter_id?: string | null
          count_date: string
          created_at?: string
          created_by: string
          created_by_name_snapshot?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          ref_no: string
          status?: string
          total_variance_qty?: number
          total_variance_value?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brand_filter_id?: string | null
          category_filter_id?: string | null
          count_date?: string
          created_at?: string
          created_by?: string
          created_by_name_snapshot?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          ref_no?: string
          status?: string
          total_variance_qty?: number
          total_variance_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          ap_account_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          ap_account_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          ap_account_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      treasuries: {
        Row: {
          account_id: string | null
          balance: number
          created_at: string
          currency: string
          id: string
          is_closed: boolean
          name: string
          owner_id: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          is_closed?: boolean
          name: string
          owner_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          is_closed?: boolean
          name?: string
          owner_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          is_reversal: boolean
          original_transaction_id: string | null
          owner_id: string
          reference: string | null
          reversal_reason: string | null
          reversed_amount: number
          reversed_at: string | null
          reversed_by_transaction_id: string | null
          transaction_date: string
          treasury_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_reversal?: boolean
          original_transaction_id?: string | null
          owner_id: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_amount?: number
          reversed_at?: string | null
          reversed_by_transaction_id?: string | null
          transaction_date?: string
          treasury_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_reversal?: boolean
          original_transaction_id?: string | null
          owner_id?: string
          reference?: string | null
          reversal_reason?: string | null
          reversed_amount?: number
          reversed_at?: string | null
          reversed_by_transaction_id?: string | null
          transaction_date?: string
          treasury_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "treasury_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_transactions_reversed_by_transaction_id_fkey"
            columns: ["reversed_by_transaction_id"]
            isOneToOne: false
            referencedRelation: "treasury_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          allow_fractions: string
          created_at: string
          has_sub_units: boolean
          id: string
          name: string
          owner_id: string
          short_name: string
          updated_at: string
        }
        Insert: {
          allow_fractions?: string
          created_at?: string
          has_sub_units?: boolean
          id?: string
          name: string
          owner_id: string
          short_name: string
          updated_at?: string
        }
        Update: {
          allow_fractions?: string
          created_at?: string
          has_sub_units?: boolean
          id?: string
          name?: string
          owner_id?: string
          short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          values: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          values?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          values?: string[]
        }
        Relationships: []
      }
      warehouse_transfer_items: {
        Row: {
          base_quantity: number | null
          created_at: string
          description: string | null
          expiry_date: string | null
          id: string
          product_id: string
          quantity: number
          transfer_id: string
          unit_name: string | null
        }
        Insert: {
          base_quantity?: number | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          product_id: string
          quantity?: number
          transfer_id: string
          unit_name?: string | null
        }
        Update: {
          base_quantity?: number | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          product_id?: string
          quantity?: number
          transfer_id?: string
          unit_name?: string | null
        }
        Relationships: []
      }
      warehouse_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_warehouse_id: string
          id: string
          notes: string | null
          owner_id: string
          ref_no: string | null
          status: string
          to_warehouse_id: string
          transfer_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_warehouse_id: string
          id?: string
          notes?: string | null
          owner_id: string
          ref_no?: string | null
          status?: string
          to_warehouse_id: string
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          owner_id?: string
          ref_no?: string | null
          status?: string
          to_warehouse_id?: string
          transfer_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          owner_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          owner_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          owner_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      warranties: {
        Row: {
          created_at: string
          description: string | null
          duration: number
          duration_unit: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration?: number
          duration_unit?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration?: number
          duration_unit?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      year_end_closures: {
        Row: {
          created_at: string
          executed_at: string
          executed_by: string | null
          id: string
          owner_id: string
          summary: Json | null
          year: number
        }
        Insert: {
          created_at?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          owner_id: string
          summary?: Json | null
          year: number
        }
        Update: {
          created_at?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          owner_id?: string
          summary?: Json | null
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assert_document_editable: {
        Args: { _doc_id: string; _doc_type: string }
        Returns: undefined
      }
      _resolve_default_warehouse: { Args: { p_owner: string }; Returns: string }
      _resolve_or_create_default_treasury: {
        Args: { p_owner: string }
        Returns: string
      }
      _reverse_document_payment: {
        Args: { _doc_id: string; _doc_type: string }
        Returns: undefined
      }
      adjust_warehouse_stock: {
        Args: {
          _delta: number
          _owner: string
          _product: string
          _warehouse: string
        }
        Returns: undefined
      }
      apply_account_balance_delta: {
        Args: {
          _account_id: string
          _credit_delta: number
          _debit_delta: number
        }
        Returns: undefined
      }
      check_expiry_notifications: { Args: never; Returns: undefined }
      check_low_stock_notifications: { Args: never; Returns: undefined }
      create_inventory_branch_transfer: {
        Args: {
          p_cash_value: number
          p_items: Json
          p_notes: string
          p_target_owner: string
        }
        Returns: string
      }
      ensure_payroll_account: { Args: { _owner: string }; Returns: string }
      ensure_system_accounts: { Args: { _owner: string }; Returns: Json }
      get_admin_branches: {
        Args: never
        Returns: {
          display_name: string
          email: string
          owner_id: string
        }[]
      }
      get_admin_employees: {
        Args: never
        Returns: {
          email: string
          first_name: string
          id: string
          last_name: string
          name: string
        }[]
      }
      get_admin_profile: {
        Args: never
        Returns: {
          email: string
          id: string
          name: string
        }[]
      }
      get_auth_admin_id: { Args: never; Returns: string }
      get_public_invoice: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_doc_number: {
        Args: {
          _column: string
          _owner: string
          _pad?: number
          _prefix?: string
          _table: string
        }
        Returns: string
      }
      perform_branch_transfer: {
        Args: {
          p_cash_value: number
          p_items: Json
          p_notes?: string
          p_target_owner: string
        }
        Returns: string
      }
      process_recurring_expenses: { Args: never; Returns: undefined }
      process_sales_return_status: {
        Args: { p_original_id: string }
        Returns: undefined
      }
      process_standalone_return: {
        Args: {
          _items: Json
          _reason: string
          _return_type: string
          _treasury_id: string
          _warehouse_id: string
        }
        Returns: Json
      }
      recalc_product_stock: { Args: never; Returns: number }
      recompute_product_stock: {
        Args: { _product_id: string }
        Returns: number
      }
      resettle_contact_debt: {
        Args: { _contact: string; _direction: string; _owner: string }
        Returns: Json
      }
      resolve_payment_account: {
        Args: { _owner: string; _text: string }
        Returns: string
      }
      reverse_contact_payment: {
        Args: {
          _amount: number
          _payment_id: string
          _reason: string
          _target_document_id?: string
        }
        Returns: Json
      }
      reverse_invoice_amount: {
        Args: {
          _amount: number
          _doc_id: string
          _doc_table: string
          _reason: string
        }
        Returns: Json
      }
      reverse_invoice_payment: {
        Args: { _amount: number; _reason: string; _tx_id: string }
        Returns: Json
      }
      seed_pharmacy_units_for: { Args: { _owner: string }; Returns: undefined }
      set_branch_transfer_item_expiry: {
        Args: { p_expiry: string; p_item_id: string }
        Returns: undefined
      }
      settle_stock_adjustment: { Args: { _adj_id: string }; Returns: undefined }
      sync_sales_to_accounting_manual: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      sync_treasuries_from_accounts: {
        Args: { _owner: string }
        Returns: number
      }
      unsettle_stock_adjustment: {
        Args: { _adj_id: string }
        Returns: undefined
      }
      update_expense_transaction: {
        Args: { _expense_id: string; _values: Json }
        Returns: Json
      }
      update_purchase_invoice_transaction: {
        Args: {
          _header: Json
          _items: Json
          _payment?: Json
          _purchase_id: string
        }
        Returns: Json
      }
      update_sales_invoice_transaction: {
        Args: {
          _header: Json
          _invoice_id: string
          _items: Json
          _payment?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
