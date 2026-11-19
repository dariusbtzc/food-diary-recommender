
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "constraints": {
                  Row: {
                    "id": string,"person_id": string,"tag": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"person_id": string,"tag": string
                  }
                  Update: {
                    "id"?: string,"person_id"?: string,"tag"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "constraints_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"cuisine_prefs": {
                  Row: {
                    "cuisine": string,"inferred_score": number | null,"n_obs": number,"person_id": string,"stated_score": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cuisine": string,"inferred_score"?: number | null,"n_obs"?: number,"person_id": string,"stated_score"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "cuisine"?: string,"inferred_score"?: number | null,"n_obs"?: number,"person_id"?: string,"stated_score"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cuisine_prefs_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"llm_usage": {
                  Row: {
                    "day": string,"id": string,"input_tokens": number,"output_tokens": number,"owner_id": string,"purpose": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day"?: string,"id"?: string,"input_tokens": number,"output_tokens": number,"owner_id"?: string,"purpose": string
                  }
                  Update: {
                    "day"?: string,"id"?: string,"input_tokens"?: number,"output_tokens"?: number,"owner_id"?: string,"purpose"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meal_attendees": {
                  Row: {
                    "meal_id": string,"person_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "meal_id": string,"person_id": string
                  }
                  Update: {
                    "meal_id"?: string,"person_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_attendees_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meal_attendees_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"meal_items": {
                  Row: {
                    "cuisine": string | null,"dish_name": string,"embedding": string | null,"id": string,"meal_id": string,"tags": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "cuisine"?: string | null,"dish_name": string,"embedding"?: string | null,"id"?: string,"meal_id": string,"tags"?: (string)[]
                  }
                  Update: {
                    "cuisine"?: string | null,"dish_name"?: string,"embedding"?: string | null,"id"?: string,"meal_id"?: string,"tags"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_items_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    }
                  ]
                },"meals": {
                  Row: {
                    "eaten_at": string,"edited_at": string | null,"id": string,"meal_type": string | null,"owner_id": string,"parse_confidence": number | null,"parse_status": string,"photo_path": string | null,"place_id": string | null,"raw_text": string | null,"total_cost_sgd": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "eaten_at"?: string,"edited_at"?: string | null,"id"?: string,"meal_type"?: string | null,"owner_id"?: string,"parse_confidence"?: number | null,"parse_status"?: string,"photo_path"?: string | null,"place_id"?: string | null,"raw_text"?: string | null,"total_cost_sgd"?: number | null
                  }
                  Update: {
                    "eaten_at"?: string,"edited_at"?: string | null,"id"?: string,"meal_type"?: string | null,"owner_id"?: string,"parse_confidence"?: number | null,"parse_status"?: string,"photo_path"?: string | null,"place_id"?: string | null,"raw_text"?: string | null,"total_cost_sgd"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "meals_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "created_at": string,"id": string,"is_self": boolean,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_self"?: boolean,"name": string,"owner_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_self"?: boolean,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"place_tags": {
                  Row: {
                    "place_id": string,"source": string,"tag": string,"updated_at": string,"value": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "place_id": string,"source": string,"tag": string,"updated_at"?: string,"value": boolean
                  }
                  Update: {
                    "place_id"?: string,"source"?: string,"tag"?: string,"updated_at"?: string,"value"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "place_tags_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    }
                  ]
                },"places": {
                  Row: {
                    "cuisines": (string)[],"google_place_id": string | null,"id": string,"latitude": number,"longitude": number,"name": string,"osm_id": string | null,"owner_id": string,"price_level": number | null,"refreshed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cuisines"?: (string)[],"google_place_id"?: string | null,"id"?: string,"latitude": number,"longitude": number,"name": string,"osm_id"?: string | null,"owner_id"?: string,"price_level"?: number | null,"refreshed_at"?: string | null
                  }
                  Update: {
                    "cuisines"?: (string)[],"google_place_id"?: string | null,"id"?: string,"latitude"?: number,"longitude"?: number,"name"?: string,"osm_id"?: string | null,"owner_id"?: string,"price_level"?: number | null,"refreshed_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"ratings": {
                  Row: {
                    "meal_id": string,"person_id": string,"score": number,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "meal_id": string,"person_id": string,"score": number,"source": string
                  }
                  Update: {
                    "meal_id"?: string,"person_id"?: string,"score"?: number,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ratings_attendee_fkey"
      columns: ["meal_id","person_id"]
isOneToOne: true
      referencedRelation: "meal_attendees"
      referencedColumns: ["meal_id","person_id"]
    },{
      foreignKeyName: "ratings_meal_id_fkey"
      columns: ["meal_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"rec_requests": {
                  Row: {
                    "budget": string,"created_at": string,"diner_ids": (string)[],"id": string,"latitude": number,"longitude": number,"meal_type": string,"mode": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget": string,"created_at"?: string,"diner_ids": (string)[],"id"?: string,"latitude": number,"longitude": number,"meal_type": string,"mode": string,"owner_id"?: string
                  }
                  Update: {
                    "budget"?: string,"created_at"?: string,"diner_ids"?: (string)[],"id"?: string,"latitude"?: number,"longitude"?: number,"meal_type"?: string,"mode"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rec_results": {
                  Row: {
                    "chosen": boolean,"explanation": string | null,"group_score": number,"per_person_scores": NonNullable<Json>,"place_id": string,"rank": number,"rejected_reason": string | null,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chosen"?: boolean,"explanation"?: string | null,"group_score": number,"per_person_scores": NonNullable<Json>,"place_id": string,"rank": number,"rejected_reason"?: string | null,"request_id": string
                  }
                  Update: {
                    "chosen"?: boolean,"explanation"?: string | null,"group_score"?: number,"per_person_scores"?: NonNullable<Json>,"place_id"?: string,"rank"?: number,"rejected_reason"?: string | null,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rec_results_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rec_results_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "rec_requests"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_meal":
{ Args: { "p_attendee_ids": (string)[],"p_meal_type"?: string,"p_photo_path"?: string,"p_ratings"?: Json,"p_raw_text"?: string }; Returns: string
                           },
"invoke_edge_function":
{ Args: { "p_body"?: Json,"p_name": string }; Returns: number
                           },
"keep_alive":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"parse_meal_backstop":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"parse_queue_delete":
{ Args: { "p_msg_id": number }; Returns: boolean
                           },
"parse_queue_read":
{ Args: { "p_qty": number,"p_vt_seconds": number }; Returns: {
              "enqueued_at": string,"message": Json,"msg_id": number,"read_ct": number
            }[]
                           },
"parse_queue_requeue":
{ Args: { "p_msg_id": number,"p_not_before": string }; Returns: number
                           },
"save_meal_parse":
{ Args: { "p_confidence": number,"p_items": Json,"p_meal_id": string,"p_owner_id": string,"p_place_id": string,"p_status": string,"p_total_cost_sgd": number }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
