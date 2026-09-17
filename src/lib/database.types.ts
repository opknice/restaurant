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
      audit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          reason: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      dining_tables: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          id: string
          table_number: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          table_number: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          table_number?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          daily_wage: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_wage: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_wage?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          client_request_id: string | null
          client_request_payload: string | null
          created_at: string
          created_by: string
          daily_wage_snapshot: number | null
          employee_id: string | null
          employee_name_snapshot: string | null
          expense_date: string
          id: string
          kind: Database["public"]["Enums"]["expense_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          client_request_id?: string | null
          client_request_payload?: string | null
          created_at?: string
          created_by: string
          daily_wage_snapshot?: number | null
          employee_id?: string | null
          employee_name_snapshot?: string | null
          expense_date: string
          id?: string
          kind: Database["public"]["Enums"]["expense_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          client_request_id?: string | null
          client_request_payload?: string | null
          created_at?: string
          created_by?: string
          daily_wage_snapshot?: number | null
          employee_id?: string | null
          employee_name_snapshot?: string | null
          expense_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["expense_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_correction_items: {
        Row: {
          correction_id: string
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price: number
        }
        Insert: {
          correction_id: string
          created_at?: string
          id?: string
          line_total: number
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price: number
        }
        Update: {
          correction_id?: string
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_correction_items_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "order_corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_correction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_corrections: {
        Row: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        Insert: {
          business_at: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_request_id: string
          created_at?: string
          created_by: string
          discount?: number
          discount_reason?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          finalize_result?: Json | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id?: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status?: Database["public"]["Enums"]["correction_status"]
          subtotal?: number
          table_id?: string | null
          total?: number
        }
        Update: {
          business_at?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_request_id?: string
          created_at?: string
          created_by?: string
          discount?: number
          discount_reason?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          finalize_result?: Json | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          reason?: string
          receipt_mode?: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id?: string | null
          revision_no?: number
          root_order_id?: string
          source_order_id?: string
          status?: Database["public"]["Enums"]["correction_status"]
          subtotal?: number
          table_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_corrections_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_corrections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_corrections_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_corrections_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_corrections_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_corrections_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_corrections_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category_name_snapshot: string
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price: number
        }
        Insert: {
          category_name_snapshot?: string
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          unit_price: number
        }
        Update: {
          category_name_snapshot?: string
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        Insert: {
          business_at?: string | null
          checkout_request_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          correction_id?: string | null
          discount?: number
          discount_applied_by?: string | null
          discount_reason?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          opened_at?: string
          opened_by: string
          order_number?: never
          receipt_mode?: Database["public"]["Enums"]["receipt_mode"]
          revision_no?: number
          root_order_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          superseded_by_order_id?: string | null
          table_id?: string | null
          total?: number
          void_reason?: string | null
        }
        Update: {
          business_at?: string | null
          checkout_request_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          correction_id?: string | null
          discount?: number
          discount_applied_by?: string | null
          discount_reason?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          opened_at?: string
          opened_by?: string
          order_number?: never
          receipt_mode?: Database["public"]["Enums"]["receipt_mode"]
          revision_no?: number
          root_order_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          superseded_by_order_id?: string | null
          table_id?: string | null
          total?: number
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_discount_applied_by_fkey"
            columns: ["discount_applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_root_order_id_fkey"
            columns: ["root_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_superseded_by_order_id_fkey"
            columns: ["superseded_by_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          change_amount: number
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at: string
          received_amount: number
          received_by: string
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          change_amount?: number
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          paid_at?: string
          received_amount: number
          received_by: string
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          change_amount?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          paid_at?: string
          received_amount?: number
          received_by?: string
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          group_name: string | null
          id: string
          is_favorite: boolean
          name: string
          price: number
          sku: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          group_name?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          price: number
          sku?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          group_name?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          price?: number
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_subcategories_product_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "product_subcategories"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_subcategories: {
        Row: {
          created_at: string
          product_id: string
          subcategory_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          subcategory_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          subcategory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_subcategories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_subcategories_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      receipts: {
        Row: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        Insert: {
          bill_revision?: number
          claim_token?: string | null
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_preview?: boolean
          is_superseded?: boolean
          last_error?: string | null
          lease_expires_at?: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed?: boolean
          print_attempts?: number
          print_claimed_at?: string | null
          print_claimed_by?: string | null
          print_number?: number
          print_requested_at?: string | null
          print_requested_by?: string | null
          print_status?: Database["public"]["Enums"]["print_status"]
          printed_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          supersedes_receipt_id?: string | null
        }
        Update: {
          bill_revision?: number
          claim_token?: string | null
          client_request_id?: string | null
          created_at?: string
          id?: string
          is_preview?: boolean
          is_superseded?: boolean
          last_error?: string | null
          lease_expires_at?: string | null
          mode?: Database["public"]["Enums"]["receipt_mode"]
          order_id?: string
          payload?: Json
          payment_confirmed?: boolean
          print_attempts?: number
          print_claimed_at?: string | null
          print_claimed_by?: string | null
          print_number?: number
          print_requested_at?: string | null
          print_requested_by?: string | null
          print_status?: Database["public"]["Enums"]["print_status"]
          printed_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          supersedes_receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_print_requested_by_fkey"
            columns: ["print_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_supersedes_receipt_id_fkey"
            columns: ["supersedes_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          id: string
          kind: Database["public"]["Enums"]["refund_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          payment_id: string
          reason: string
          refunded_at: string
          refunded_by: string
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          id?: string
          kind?: Database["public"]["Enums"]["refund_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          payment_id: string
          reason: string
          refunded_at?: string
          refunded_by: string
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          id?: string
          kind?: Database["public"]["Enums"]["refund_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          payment_id?: string
          reason?: string
          refunded_at?: string
          refunded_by?: string
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_subcategories_subcategory_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "product_subcategories"
            referencedColumns: ["subcategory_id"]
          },
        ]
      }
      store_settings: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_payment_label: string | null
          bank_reference: string | null
          payment_qr_path: string | null
          phone: string | null
          receipt_footer: string | null
          singleton: boolean
          social_contact: string | null
          store_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_payment_label?: string | null
          bank_reference?: string | null
          payment_qr_path?: string | null
          phone?: string | null
          receipt_footer?: string | null
          singleton?: boolean
          social_contact?: string | null
          store_name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_payment_label?: string | null
          bank_reference?: string | null
          payment_qr_path?: string | null
          phone?: string | null
          receipt_footer?: string | null
          singleton?: boolean
          social_contact?: string | null
          store_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_empty_order: {
        Args: {
          p_order_id: string
        }
        Returns: Database["public"]["Tables"]["orders"]["Row"]
      }
      create_product: {
        Args: {
          p_category_id: string
          p_name: string
          p_price: number
          p_group_name?: string | null
          p_subcategory_ids?: string[]
        }
        Returns: Database["public"]["Tables"]["products"]["Row"]
      }
      delete_product: {
        Args: {
          p_product_id: string
        }
        Returns: Database["public"]["Tables"]["products"]["Row"]
      }
      delete_sales_history_order: {
        Args: {
          p_order_id: string
        }
        Returns: number
      }
      update_product: {
        Args: {
          p_category_id: string
          p_name: string
          p_price: number
          p_product_id: string
          p_group_name?: string | null
          p_subcategory_ids?: string[]
        }
        Returns: Database["public"]["Tables"]["products"]["Row"]
      }
      add_order_correction_item: {
        Args: {
          p_correction_id: string
          p_product_id: string
          p_quantity?: number
        }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_order_item: {
        Args: { p_order_id: string; p_product_id: string; p_quantity?: number }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_order_correction_discount: {
        Args: {
          p_correction_id: string
          p_discount_type: Database["public"]["Enums"]["discount_type"]
          p_discount_value: number
          p_reason: string
        }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_order_discount: {
        Args: {
          p_discount_type: Database["public"]["Enums"]["discount_type"]
          p_discount_value: number
          p_order_id: string
          p_reason: string
        }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bridge_claim_next_receipt: {
        Args: { p_bridge_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bridge_complete_receipt_print: {
        Args: {
          p_claim_token: string
          p_error?: string
          p_receipt_id: string
          p_requires_review?: boolean
          p_success: boolean
        }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_order_correction: {
        Args: { p_correction_id: string }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_order_receipt_preview: {
        Args: { p_receipt_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      checkout_order: {
        Args: {
          p_client_request_id?: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_received_amount: number
          p_transfer_confirmed?: boolean
          p_transfer_reference?: string
        }
        Returns: Json
      }
      clear_order_correction_discount: {
        Args: { p_correction_id: string }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_order_discount: {
        Args: { p_order_id: string }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_employee: {
        Args: { p_daily_wage: number; p_name: string }
        Returns: {
          active: boolean
          created_at: string
          daily_wage: number
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_receipt_mode?: Database["public"]["Enums"]["receipt_mode"]
          p_table_id: string
        }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      finalize_order_correction: {
        Args: {
          p_correction_id: string
          p_new_payment_method: Database["public"]["Enums"]["payment_method"]
          p_new_received_amount: number
          p_new_transfer_confirmed?: boolean
          p_new_transfer_reference?: string
          p_refund_method: Database["public"]["Enums"]["payment_method"]
          p_refund_transfer_reference?: string
        }
        Returns: Json
      }
      get_expense_total: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      get_financial_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_order_receipt_preview: {
        Args: {
          p_order_id: string
          p_receipt_mode?: Database["public"]["Enums"]["receipt_mode"]
        }
        Returns: Json
      }
      get_sales_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      is_active_user: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_order_checkout_locked: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      list_daily_wages: {
        Args: { p_date: string }
        Returns: {
          daily_wage: number
          employee_active: boolean
          employee_id: string
          employee_name: string
          expense_id: string
          selected: boolean
          status: Database["public"]["Enums"]["expense_status"]
        }[]
      }
      list_employees: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          daily_wage: number
          id: string
          name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_expenses_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_date?: string
          p_cursor_id?: string
          p_from: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          amount: number
          created_at: string
          employee_id: string
          employee_name: string
          expense_date: string
          id: string
          kind: Database["public"]["Enums"]["expense_kind"]
          note: string
          status: Database["public"]["Enums"]["expense_status"]
        }[]
      }
      list_print_queue: {
        Args: never
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_sales_history: {
        Args: { p_from: string; p_order_number?: number; p_to: string }
        Returns: {
          closed_at: string
          discount: number
          display_order_number: string
          opened_by: string
          order_id: string
          order_number: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_id: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          refund_amount: number
          revision_no: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_name: string
          total: number
        }[]
      }
      list_sales_history_page: {
        Args: {
          p_cursor_closed_at?: string
          p_cursor_order_id?: string
          p_from: string
          p_limit?: number
          p_order_number?: number
          p_to: string
        }
        Returns: {
          closed_at: string
          discount: number
          display_order_number: string
          opened_by: string
          order_id: string
          order_number: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_id: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          refund_amount: number
          revision_no: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_name: string
          total: number
        }[]
      }
      list_sales_tables: {
        Args: never
        Returns: {
          display_name: string
          has_open_order: boolean
          id: string
          is_owned_by_current_user: boolean
          open_order_id: string
          table_number: string
        }[]
      }
      manager_cancel_receipt: {
        Args: { p_receipt_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      manager_mark_receipt_printed: {
        Args: { p_receipt_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      manager_requeue_receipt: {
        Args: { p_receipt_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_and_request_order_receipt: {
        Args: {
          p_client_request_id: string
          p_order_id: string
          p_receipt_mode: Database["public"]["Enums"]["receipt_mode"]
        }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_order_receipt: {
        Args: {
          p_order_id: string
          p_receipt_mode: Database["public"]["Enums"]["receipt_mode"]
        }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recalculate_order_correction: {
        Args: { p_correction_id: string }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recalculate_order_totals: {
        Args: { p_order_id: string }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_order: {
        Args: {
          p_method: Database["public"]["Enums"]["payment_method"]
          p_order_id: string
          p_reason: string
        }
        Returns: {
          amount: number
          id: string
          kind: Database["public"]["Enums"]["refund_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          payment_id: string
          reason: string
          refunded_at: string
          refunded_by: string
          transfer_reference: string | null
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_product_subcategories: {
        Args: { p_product_id: string; p_subcategory_ids?: string[] }
        Returns: Json
      }
      request_receipt_print: {
        Args: { p_receipt_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_receipt_reprint: {
        Args: { p_receipt_id: string }
        Returns: {
          bill_revision: number
          claim_token: string | null
          client_request_id: string | null
          created_at: string
          id: string
          is_preview: boolean
          is_superseded: boolean
          last_error: string | null
          lease_expires_at: string | null
          mode: Database["public"]["Enums"]["receipt_mode"]
          order_id: string
          payload: Json
          payment_confirmed: boolean
          print_attempts: number
          print_claimed_at: string | null
          print_claimed_by: string | null
          print_number: number
          print_requested_at: string | null
          print_requested_by: string | null
          print_status: Database["public"]["Enums"]["print_status"]
          printed_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          supersedes_receipt_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_active_user: { Args: never; Returns: string }
      require_order_access: {
        Args: { p_allow_manager?: boolean; p_order_id: string }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_employee: {
        Args: { p_daily_wage: number; p_id: string; p_name: string }
        Returns: {
          active: boolean
          created_at: string
          daily_wage: number
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_expense_and_daily_wages: {
        Args: {
          p_client_request_id?: string
          p_date: string
          p_employee_ids?: string[]
          p_general_amount?: number
          p_general_note?: string
        }
        Returns: Json
      }
      set_employee_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: {
          active: boolean
          created_at: string
          daily_wage: number
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_order_correction_item_quantity: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_order_correction_receipt_mode: {
        Args: {
          p_correction_id: string
          p_receipt_mode: Database["public"]["Enums"]["receipt_mode"]
        }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_order_item_quantity: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_order_receipt_mode: {
        Args: {
          p_order_id: string
          p_receipt_mode: Database["public"]["Enums"]["receipt_mode"]
        }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_order_correction: {
        Args: {
          p_client_request_id: string
          p_order_id: string
          p_reason: string
        }
        Returns: {
          business_at: string
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          created_at: string
          created_by: string
          discount: number
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          finalize_result: Json | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          reason: string
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          replacement_order_id: string | null
          revision_no: number
          root_order_id: string
          source_order_id: string
          status: Database["public"]["Enums"]["correction_status"]
          subtotal: number
          table_id: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "order_corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_expense: {
        Args: { p_id: string; p_reason: string }
        Returns: {
          amount: number
          client_request_id: string | null
          client_request_payload: string | null
          created_at: string
          created_by: string
          daily_wage_snapshot: number | null
          employee_id: string | null
          employee_name_snapshot: string | null
          expense_date: string
          id: string
          kind: Database["public"]["Enums"]["expense_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: {
          business_at: string | null
          checkout_request_id: string | null
          closed_at: string | null
          closed_by: string | null
          correction_id: string | null
          discount: number
          discount_applied_by: string | null
          discount_reason: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          opened_at: string
          opened_by: string
          order_number: number
          receipt_mode: Database["public"]["Enums"]["receipt_mode"]
          revision_no: number
          root_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          superseded_by_order_id: string | null
          table_id: string | null
          total: number
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "cashier" | "manager"
      correction_status: "draft" | "finalized" | "cancelled"
      discount_type: "none" | "percent" | "fixed"
      expense_kind: "general" | "wage"
      expense_status: "active" | "void"
      order_status: "open" | "paid" | "void" | "refunded"
      payment_method: "cash" | "transfer"
      print_status:
        | "pending"
        | "printed"
        | "failed"
        | "printing"
        | "review_required"
        | "cancelled"
      receipt_mode: "shop" | "field"
      refund_kind: "customer_refund" | "correction_reversal"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["cashier", "manager"],
      correction_status: ["draft", "finalized", "cancelled"],
      discount_type: ["none", "percent", "fixed"],
      expense_kind: ["general", "wage"],
      expense_status: ["active", "void"],
      order_status: ["open", "paid", "void", "refunded"],
      payment_method: ["cash", "transfer"],
      print_status: [
        "pending",
        "printed",
        "failed",
        "printing",
        "review_required",
        "cancelled",
      ],
      receipt_mode: ["shop", "field"],
      refund_kind: ["customer_refund", "correction_reversal"],
    },
  },
} as const
