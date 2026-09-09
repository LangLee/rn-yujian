// Navigation type definitions for the entire app
import { StackNavigationProp as NativeStackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RemoteCatch } from '../types/models';
import { SpeciesPickResult } from '../types/navigation-helpers';
import { ShareRangeKey, ShareTemplateId, ShareWork } from '../services/shareWorkService';

/** 我的鱼获 Hub 的三个分段 */
export type CatchHubTab = 'catches' | 'share' | 'growth';

/**
 * 全局导航（设计文档 02 信息架构与导航）：
 * 取消传统底部 Tab —— 首页「上统计、中渔获卡、下相机」沉浸式结构，
 * 长期入口通过统计摘要、页面内入口和右上角个人入口完成。
 */
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  /** P01 首页 */
  Home: undefined;
  /** P02 拍照识鱼（识别异常退回时携带原因） */
  Identify: { error?: string } | undefined;
  /** P03 识别处理中 */
  Recognizing: undefined;
  /** P04 识别结果（高/中/低置信度同一容器） */
  Result: undefined;
  /** 识别异常（FAILED） */
  RecognitionIssue: undefined;
  /** 鱼鉴详情 */
  Species: { key: string };
  /** 唯一鱼获详情 / 鱼获记忆页 */
  CatchDetail: {
    catchId?: string;
    /** 保存后直传的新鱼获（列表尚未同步时使用） */
    initialCatch?: RemoteCatch;
    /** 保存流程附带的可选补充信息（长度/重量/地点） */
    initialMemory?: {
      lengthCm?: number | null;
      weightKg?: number | null;
      location?: string | null;
    };
  } | undefined;
  /** 我的鱼获 Hub（P20：我的鱼获 / 鱼获分享 / 成长历程 三分段） */
  MyCatches: { tab?: CatchHubTab } | undefined;
  /** 鱼鉴首页（P08） */
  Guide: undefined;
  /** 记录日历（月/年视图） */
  Calendar: undefined;
  /** 鱼种搜索 / 选择器 */
  SpeciesPicker: { title?: string } | undefined;
  /** 生成鱼获分享（范围 / 模板 / 生成内容 / 隐私） */
  ShareCreate: {
    presetRange?: ShareRangeKey;
    presetTemplate?: ShareTemplateId;
    /** 从某条鱼获详情进入：锁定为当天范围 */
    presetCatchId?: string;
  } | undefined;
  /** 分享作品预览 / 生成 / 最终作品 */
  SharePreview: { work: ShareWork; mode?: 'create' | 'view'; from?: 'annual' };
  /** 年度成长回顾 */
  AnnualReview: { year?: number } | undefined;
  /** 我的 */
  Profile: undefined;
  /** 环境主题设置 */
  ThemeSettings: undefined;
  /** 隐私与定位 */
  PrivacySettings: undefined;
  /** 单位与偏好 */
  UnitsSettings: undefined;
  /** 账号与安全 */
  AccountSecurity: undefined;
  /** 关于渔见 */
  About: undefined;
};

// Type for navigation prop in stack screens
export type StackNavigationProp<
  Params extends RootStackParamList = RootStackParamList,
  Route extends keyof Params = keyof Params,
> = NativeStackNavigationProp<Params, Route>;

export type SpeciesScreenRouteProp = RouteProp<RootStackParamList, 'Species'>;
export type CatchDetailRouteProp = RouteProp<RootStackParamList, 'CatchDetail'>;
export type SpeciesPickerRouteProp = RouteProp<RootStackParamList, 'SpeciesPicker'>;

export type { SpeciesPickResult };
