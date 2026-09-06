import { SpeciesPickResult } from '../types/navigation-helpers';

/**
 * 鱼种选择器的轻量结果回传 hub（设计文档 11）。
 * 纠错场景追求快速选中：选中后直接回填调用方，不经过导航参数。
 */
type Resolver = (pick: SpeciesPickResult | null) => void;

let pendingResolver: Resolver | null = null;

export const speciesPickerHub = {
  /** 打开选择器前调用：返回 Promise，在选择器选中/取消时 resolve。 */
  requestPick(): Promise<SpeciesPickResult | null> {
    return new Promise((resolve) => {
      // 若已有未完成的请求，先以取消收口，避免悬挂
      if (pendingResolver) {
        pendingResolver(null);
      }
      pendingResolver = resolve;
    });
  },

  complete(pick: SpeciesPickResult | null): void {
    const resolver = pendingResolver;
    pendingResolver = null;
    resolver?.(pick);
  },
};
