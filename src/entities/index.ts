/**
 * 业务实体层（entities）
 *
 * 已落地切片：
 *   entities/user     用户与档案（阶段 3）
 *   entities/book     书目与品相（阶段 4）
 *   entities/listing  挂牌与图书市场查询（阶段 4）
 *
 * 后续切片：
 *   entities/order    订单
 *   entities/carbon   碳账户
 *
 * FSD 约定（见 docs/ARCHITECTURE.md 第 2 节）：
 *   · 跨切片导入只能走切片根目录的 index.ts，禁止深链内部文件
 *   · 依赖方向自上而下：app → pages → widgets → features → entities → shared
 *   · 切片之间可以互相依赖，但必须无循环（listing 依赖 book 的类型，book 不反依赖）
 */
export * from './user'
export * from './book'
export * from './listing'
