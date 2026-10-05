/**
 * user 实体的表单校验 Schema
 *
 * 为什么用 Zod 而不是只依赖 Element Plus 的 rules：
 *   1. Element Plus 的 rules 只做 UI 校验，无法在提交前一次性拿到完整结果
 *   2. Zod 的类型推导可与 TypeScript 类型打通，避免「校验通过但类型不符」
 *   3. 同一份 Schema 可在后续 Edge Function（Deno）中复用，保持前后端一致
 */
import { z } from 'zod'

/**
 * 密码规则
 *
 * 与 supabase/config.toml 的 minimum_password_length = 8 保持一致。
 * 要求字母 + 数字组合：太弱的口令在学生群体中极易被撞库。
 */
export const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(72, '密码最多 72 位')
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/[0-9]/, '密码需包含数字')

/** 邮箱 */
export const emailSchema = z
  .string()
  .min(1, '请输入邮箱')
  .email('邮箱格式不正确')
  .max(254, '邮箱过长')

/** 昵称 */
export const nicknameSchema = z
  .string()
  .trim()
  .min(2, '昵称至少 2 个字符')
  .max(20, '昵称最多 20 个字符')

/** 登录表单 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

/** 注册表单 */
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, '请再次输入密码'),
    nickname: nicknameSchema,
    schoolId: z.string().uuid('请选择学校'),
    majorId: z.string().uuid('请选择专业').or(z.literal('')),
    grade: z.number().int().min(1).max(8).nullable(),
    /** 是否已阅读并同意用户协议与隐私政策 —— 必须显式勾选 */
    agreed: z.literal(true, {
      error: '请先阅读并同意用户协议与隐私政策',
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

export type RegisterFormValues = z.infer<typeof registerSchema>

/** 找回密码表单 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

/** 重置密码表单（从邮件链接进入） */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

/** 个人资料表单 */
export const profileSchema = z.object({
  nickname: nicknameSchema,
  schoolId: z.string().uuid('请选择学校').or(z.literal('')),
  majorId: z.string().uuid('请选择专业').or(z.literal('')),
  grade: z.number().int().min(1).max(8).nullable(),
  enrollYear: z
    .number()
    .int()
    .min(2000, '入学年份不早于 2000 年')
    .max(2100, '入学年份不晚于 2100 年')
    .nullable(),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

/**
 * 收货地址表单
 *
 * 合规要求：精度限制到楼栋，不要求精确门牌（见 docs/security-compliance.md 1.1）。
 */
export const addressSchema = z.object({
  label: z.string().trim().max(20, '标签最多 20 个字符').or(z.literal('')),
  campusArea: z.string().trim().max(30, '校区最多 30 个字符').or(z.literal('')),
  building: z.string().trim().min(1, '请填写楼栋').max(30, '楼栋最多 30 个字符'),
  detail: z.string().trim().max(60, '补充说明最多 60 个字符').or(z.literal('')),
  isDefault: z.boolean(),
})

export type AddressFormValues = z.infer<typeof addressSchema>

/**
 * 把 Zod 错误压平为「字段名 → 首条错误信息」的映射。
 *
 * 便于把校验结果直接喂给表单组件逐字段展示。
 */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (result[key] === undefined) {
      result[key] = issue.message
    }
  }

  return result
}
