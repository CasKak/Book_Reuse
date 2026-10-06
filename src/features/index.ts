/**
 * 用户交互层（features）
 *
 * 每个切片对应一个用户动作，例如 auth-login、book-publish、order-create。
 *
 * FSD 约定（见 docs/ARCHITECTURE.md 第 2 节）：
 *   · 跨切片导入只能走切片根目录的 index.ts，禁止深链内部文件
 *   · 依赖方向自上而下：app → pages → widgets → features → entities → shared
 */
export { LoginForm } from './auth-login'
export { RegisterForm } from './auth-register'
export { LogoutButton } from './auth-logout'
export { ProfileForm } from './profile-edit'
export { AddressBook } from './address-book'
export { MarketSearchBar } from './book-search'
