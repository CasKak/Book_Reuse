/**
 * 业务实体层（entities）
 *
 * 每个实体是一个切片，例如：
 *   entities/user/    用户与档案（阶段 3 已落地）
 *   entities/book/    书目与挂牌
 *   entities/order/   订单
 *   entities/carbon/  碳账户
 *
 * FSD 约定（见 docs/ARCHITECTURE.md 第 2 节）：
 *   · 跨切片导入只能走切片根目录的 index.ts，禁止深链内部文件
 *   · 依赖方向自上而下：app → pages → widgets → features → entities → shared
 */
export * from './user'
