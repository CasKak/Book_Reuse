/**
 * shared/api 公共出口
 *
 * FSD 约定：跨切片导入必须走此出口，禁止深链到具体文件。
 */
export { checkDatabaseHealth, getSupabaseClient, resetSupabaseClient } from './supabase'
export type { AppSupabaseClient, DatabaseHealth } from './supabase'
export type { Database, DatabaseSchema, TableInsert, TableRow, TableUpdate } from './database.types'
