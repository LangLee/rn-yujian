/** 跨屏共享的轻量类型（鱼种选择结果）。 */
export interface SpeciesPickResult {
  key: string;
  name: string;
  /** 用户手输的未收录名称（V1 不直接创建正式 Species） */
  isCustom?: boolean;
}
