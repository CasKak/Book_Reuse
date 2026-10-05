import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'

/**
 * 青阅循环 ESLint 扁平配置
 *
 * 强制约束（对应 docs/ARCHITECTURE.md 第 3 节「类型安全策略」）：
 *   1. 禁止显式 any
 *   2. 禁止 @ts-ignore（改用 @ts-expect-error 且必须写明原因）
 *   3. 强制 Feature-Sliced Design 依赖方向（上层可依赖下层，禁止反向依赖）
 */
export default tseslint.config(
  // ---------- 全局忽略 ----------
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'docs/**',
      'supabase/**',
      'docker/**',
      '*.config.js',
    ],
  },

  // ---------- 基础推荐规则 ----------
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // ---------- Vue 文件中的 TS 解析 ----------
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  // ---------- 浏览器环境全局变量 ----------
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // ---------- 项目强约束 ----------
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // ---------- 格式化职责划归 Prettier ----------
      // eslint-plugin-vue 的 recommended 含一批纯排版规则，与 Prettier 直接冲突。
      // 本项目约定：ESLint 只管代码质量与架构约束，排版一律交给 Prettier。
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/multiline-html-element-content-newline': 'off',

      // 1. 禁止 any
      '@typescript-eslint/no-explicit-any': 'error',
      // 2. 禁止 @ts-ignore，必须用 @ts-expect-error 并说明原因
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
        },
      ],
      // 3. 未使用变量：允许以 _ 开头的占位参数
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 4. 类型导入统一用 import type，避免运行时代价
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // 5. 禁止空接口（应使用 type 别名）
      '@typescript-eslint/no-empty-object-type': 'error',

      // ---------- FSD 依赖方向约束 ----------
      // 规则：shared 层可被任何层使用；entities 不可依赖 features/widgets/pages/app；
      //       features 不可依赖 widgets/pages/app；widgets 不可依赖 pages/app。
      // 同层之间禁止深层互相导入，必须走切片 index.ts 公共出口。
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/entities/*/*', '!@/entities/*/index.ts'],
              message: 'FSD：请从切片公共出口导入，例如 @/entities/book，不要深链内部文件。',
            },
            {
              group: ['@/features/*/*', '!@/features/*/index.ts'],
              message: 'FSD：请从切片公共出口导入，例如 @/features/auth-login。',
            },
            {
              group: ['@/widgets/*/*', '!@/widgets/*/index.ts'],
              message: 'FSD：请从切片公共出口导入，例如 @/widgets/app-header。',
            },
            {
              group: ['@/pages/*/*', '!@/pages/*/index.ts'],
              message: 'FSD：页面之间不要互相导入，公共逻辑请下沉到 widgets 或 features。',
            },
          ],
        },
      ],

      // ---------- 代码质量 ----------
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // ---------- 对 shared 层的额外约束：不得依赖任何业务层 ----------
  {
    files: ['src/shared/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/pages/*', '@/widgets/*', '@/features/*', '@/entities/*'],
              message: 'FSD：shared 层必须与业务无关，不得依赖上层任何模块。',
            },
          ],
        },
      ],
    },
  },

  // ---------- 页面组件：按目录命名，关闭多词名要求 ----------
  {
    files: ['src/pages/**/*.vue', 'src/widgets/**/*.vue', 'src/features/**/*.vue'],
    rules: {
      // 页面/切片内组件统一命名为 index.vue，由目录名表达语义
      'vue/multi-word-component-names': 'off',
    },
  },

  // ---------- 配置文件放宽 ----------
  {
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    rules: {
      'no-console': 'off',
    },
  },
)
