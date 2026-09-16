import { CatchLocation } from '../types/models';

/**
 * 地图选点的轻量结果回传 hub（同 speciesPickerHub 模式，设计文档 11）：
 * 选中后直接回填调用方，不经过导航参数。
 */
type Resolver = (pick: CatchLocation | null) => void;

let pendingResolver: Resolver | null = null;

export const locationPickerHub = {
  /** 打开选点页前调用：返回 Promise，在选点页确认/取消时 resolve。 */
  requestPick(): Promise<CatchLocation | null> {
    return new Promise((resolve) => {
      // 若已有未完成的请求，先以取消收口，避免悬挂
      if (pendingResolver) {
        pendingResolver(null);
      }
      pendingResolver = resolve;
    });
  },

  complete(pick: CatchLocation | null): void {
    const resolver = pendingResolver;
    pendingResolver = null;
    resolver?.(pick);
  },
};
