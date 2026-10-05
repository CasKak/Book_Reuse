/**
 * Tailwind CSS 配置
 *
 * 说明：
 *   1. Element Plus 与 Tailwind 共存时的已知冲突是 preflight 会重置按钮/输入框样式。
 *      本项目通过关闭 preflight、改用自定义 base 层来规避（见 src/app/styles/index.css）。
 *   2. 品牌色统一在 theme.extend.colors.brand 中定义，与 Element Plus 的
 *      --el-color-primary 保持一致（见 src/app/styles/element-theme.css）。
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  corePlugins: {
    // 关闭 preflight，避免覆盖 Element Plus 组件的基础样式
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // 青阅循环品牌主色（深绿，取自 LOGO）
        brand: {
          50: '#f0f9f4',
          100: '#dcf2e4',
          200: '#bbe5cd',
          300: '#8dd0ae',
          400: '#58b489',
          500: '#35986c',
          600: '#257a56',
          700: '#1f7a5c', // 主色，与 LOGO 一致
          800: '#1a5c46',
          900: '#164c3b',
          950: '#0a2a20',
        },
        // 辅助色：碳账户/环保语义
        eco: {
          light: '#8dd0ae',
          DEFAULT: '#35986c',
          dark: '#1a5c46',
        },
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      screens: {
        // 与 docs/page-list.md 第 10 节断点一致
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
}
