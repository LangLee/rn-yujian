/* eslint-disable prettier/prettier */
/**
 * 渔见图标几何数据 —— 由 scripts/gen-icon-defs.js 从设计系统冻结母版生成，请勿手改。
 * 源: design/system/icon_library_v0_1/assets/ic_*_v1.svg (43/43 FROZEN)
 * 视觉合同: viewBox 0 0 24 24 · stroke 1.75 · 圆角线帽线节 · currentColor tint
 * 扩展字形(ext 段)为库内无对应语义时按同一视觉规范补充，非冻结资源。
 */

export type IconElement =
  | { t: 'p'; d: string; f?: true }
  | { t: 'c'; cx: number; cy: number; r: number; f?: true }
  | { t: 'r'; x: number; y: number; w: number; h: number; rx: number; f?: true };

export interface IconDef {
  /** 中文语义名（母版 title） */
  label: string;
  /** 来源: 冻结母版文件名 / ext=项目扩展 */
  source: string;
  elements: IconElement[];
}

export const ICON_DEFS = {
  /** 添加照片或视频 · ic_add_media_v1.svg */
  "add_media": { label: "添加照片或视频", source: "ic_add_media_v1.svg", elements: [
    { t: 'r', x: 3.1, y: 8.3, w: 17.8, h: 12, rx: 2.2 },
    { t: 'p', d: 'M5.6 17.5L9.15 13.95L11.5 16.3' },
    { t: 'p', d: 'M13.9 12.35L17.25 14.3L13.9 16.25V12.35Z' },
    { t: 'p', d: 'M17.5 3.2V7.25M15.475 5.225H19.525' },
  ] },
  /** 添加照片 · ic_add_photo_v1.svg */
  "add_photo": { label: "添加照片", source: "ic_add_photo_v1.svg", elements: [
    { t: 'r', x: 3.1, y: 8.3, w: 17.8, h: 12, rx: 2.2 },
    { t: 'p', d: 'M5.6 17.5L9.15 13.95L12.5 17.3' },
    { t: 'c', cx: 15.55, cy: 12.55, r: 1.25, f: true },
    { t: 'p', d: 'M17.5 3.2V7.25M15.475 5.225H19.525' },
  ] },
  /** 添加视频 · ic_add_video_v1.svg */
  "add_video": { label: "添加视频", source: "ic_add_video_v1.svg", elements: [
    { t: 'r', x: 3.1, y: 8.3, w: 12, h: 12, rx: 2.2 },
    { t: 'p', d: 'M15.1 12.15L19.65 9.95C20.28 9.65 20.9 10.09 20.9 10.77V17.83C20.9 18.51 20.28 18.95 19.65 18.65L15.1 16.45' },
    { t: 'p', d: 'M17.5 3.2V7.25M15.475 5.225H19.525' },
  ] },
  /** 返回 · ic_back_v1.svg */
  "back": { label: "返回", source: "ic_back_v1.svg", elements: [
    { t: 'p', d: 'M19.1 12H5M11.25 5.85L5 12L11.25 18.15' },
  ] },
  /** 相机 · ic_camera_v1.svg */
  "camera": { label: "相机", source: "ic_camera_v1.svg", elements: [
    { t: 'r', x: 3.15, y: 7.45, w: 17.7, h: 12.3, rx: 2.3 },
    { t: 'p', d: 'M8.45 7.45L9.6 5.3C9.8 4.93 10.18 4.7 10.6 4.7H13.4C13.82 4.7 14.2 4.93 14.4 5.3L15.55 7.45' },
    { t: 'c', cx: 12, cy: 13.5, r: 2.95 },
    { t: 'c', cx: 17.55, cy: 10.55, r: 0.8, f: true },
  ] },
  /** 进入 / 详情箭头 · ic_chevron_right_v1.svg */
  "chevron_right": { label: "进入 / 详情箭头", source: "ic_chevron_right_v1.svg", elements: [
    { t: 'p', d: 'M9.2 5.4L15.8 12L9.2 18.6' },
  ] },
  /** 清空输入 · ic_clear_field_v1.svg */
  "clear_field": { label: "清空输入", source: "ic_clear_field_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 12, r: 8.65 },
    { t: 'p', d: 'M8.9 8.9L15.1 15.1M15.1 8.9L8.9 15.1' },
  ] },
  /** 关闭 · ic_close_v1.svg */
  "close": { label: "关闭", source: "ic_close_v1.svg", elements: [
    { t: 'p', d: 'M5.35 5.35L18.65 18.65M18.65 5.35L5.35 18.65' },
  ] },
  /** 日期 · ic_date_v1.svg */
  "date": { label: "日期", source: "ic_date_v1.svg", elements: [
    { t: 'r', x: 3.25, y: 5.45, w: 17.5, h: 15.25, rx: 2.5 },
    { t: 'p', d: 'M7.75 3.3V7.6M16.25 3.3V7.6M3.25 10.1H20.75' },
    { t: 'p', d: 'M8.1 14.2H9.3M12.6 14.2H13.8M8.1 17.3H9.3' },
  ] },
  /** 编辑 · ic_edit_v1.svg */
  "edit": { label: "编辑", source: "ic_edit_v1.svg", elements: [
    { t: 'p', d: 'M12 5.2H6.2C4.9 5.2 3.85 6.25 3.85 7.55V17.8C3.85 19.1 4.9 20.15 6.2 20.15H16.45C17.75 20.15 18.8 19.1 18.8 17.8V12.1' },
    { t: 'p', d: 'M10.65 14.95L14.2 14.25L20 8.45C20.7 7.75 20.7 6.65 20 5.95L18.7 4.65C18 3.95 16.9 3.95 16.2 4.65L10.4 10.45L9.7 14Z' },
    { t: 'p', d: 'M15.45 5.4L19.25 9.2' },
  ] },
  /** 错误 / 失败 · ic_error_v1.svg */
  "error": { label: "错误 / 失败", source: "ic_error_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 12, r: 8.65 },
    { t: 'p', d: 'M9 9L15 15M15 9L9 15' },
  ] },
  /** 收起 · ic_expand_less_v1.svg */
  "expand_less": { label: "收起", source: "ic_expand_less_v1.svg", elements: [
    { t: 'p', d: 'M5.4 14.9L12 8.3L18.6 14.9' },
  ] },
  /** 展开 · ic_expand_more_v1.svg */
  "expand_more": { label: "展开", source: "ic_expand_more_v1.svg", elements: [
    { t: 'p', d: 'M5.4 9.1L12 15.7L18.6 9.1' },
  ] },
  /** 筛选 · ic_filter_v1.svg */
  "filter": { label: "筛选", source: "ic_filter_v1.svg", elements: [
    { t: 'p', d: 'M3.4 5.2H20.6L13.85 12.65V19.25L10.15 20.65V12.65L3.4 5.2Z' },
  ] },
  /** 鱼鉴入口 · ic_fish_guide_v1.svg */
  "fish_guide": { label: "鱼鉴入口", source: "ic_fish_guide_v1.svg", elements: [
    { t: 'p', d: 'M12 6.6C9.95 4.85 7.2 4.35 3.5 4.6V18.45C7.55 18.1 10.15 18.65 12 20.05C13.85 18.65 16.45 18.1 20.5 18.45V4.6C16.8 4.35 14.05 4.85 12 6.6Z' },
    { t: 'p', d: 'M12 6.6V20.05' },
    { t: 'p', d: 'M14.3 11.65C15.15 10.6 16.1 10.45 17.1 11.65C16.1 12.85 15.15 12.7 14.3 11.65Z' },
  ] },
  /** 翻面 · ic_flip_v1.svg */
  "flip": { label: "翻面", source: "ic_flip_v1.svg", elements: [
    { t: 'r', x: 6.25, y: 5.15, w: 11.5, h: 13.7, rx: 2 },
    { t: 'p', d: 'M11.95 5.2V18.8' },
    { t: 'p', d: 'M3.65 8.9L2.5 11.2L4.8 12.35M20.35 15.1L21.5 12.8L19.2 11.65' },
  ] },
  /** 图库 · ic_gallery_v1.svg */
  "gallery": { label: "图库", source: "ic_gallery_v1.svg", elements: [
    { t: 'p', d: 'M7.65 4.1H18.2C19.58 4.1 20.7 5.22 20.7 6.6V16.65' },
    { t: 'r', x: 3.3, y: 7.55, w: 14.75, h: 12.3, rx: 2.1 },
    { t: 'c', cx: 13.65, cy: 11.1, r: 1.05, f: true },
    { t: 'p', d: 'M5.6 17.1L9.05 13.65L11.65 16.2L13.05 14.85L15.75 17.45' },
  ] },
  /** 说明 / 疑问 · ic_help_v1.svg */
  "help": { label: "说明 / 疑问", source: "ic_help_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 12, r: 8.65 },
    { t: 'p', d: 'M9.45 9C9.75 7.55 10.85 6.9 12.25 6.9C13.85 6.9 14.95 7.9 14.95 9.3C14.95 10.5 14.3 11.2 13.1 12.05C12.25 12.65 12 13.05 12 14' },
    { t: 'c', cx: 12, cy: 17.2, r: 0.95, f: true },
  ] },
  /** 图片不可用 · ic_image_missing_v1.svg */
  "image_missing": { label: "图片不可用", source: "ic_image_missing_v1.svg", elements: [
    { t: 'r', x: 3.45, y: 4.5, w: 17.1, h: 15, rx: 2.15 },
    { t: 'c', cx: 15.85, cy: 8.8, r: 1.2 },
    { t: 'p', d: 'M5.95 16.7L9.1 13.6L11.65 16.1L13.2 14.65L15.5 17' },
    { t: 'p', d: 'M4 20.7L20.75 3.95' },
  ] },
  /** 长度 · ic_length_v1.svg */
  "length": { label: "长度", source: "ic_length_v1.svg", elements: [
    { t: 'r', x: 2.75, y: 7.25, w: 18.5, h: 9.5, rx: 1.8 },
    { t: 'p', d: 'M6.1 7.25v4.2M9.05 7.25v2.55M12 7.25v4.2M14.95 7.25v2.55M17.9 7.25v4.2' },
  ] },
  /** 地点 · ic_location_v1.svg */
  "location": { label: "地点", source: "ic_location_v1.svg", elements: [
    { t: 'p', d: 'M12 21C9.05 17.2 5.75 13.7 5.75 9.75a6.25 6.25 0 0 1 12.5 0C18.25 13.7 14.95 17.2 12 21Z' },
    { t: 'c', cx: 12, cy: 9.75, r: 2.25 },
  ] },
  /** 密码锁 · ic_lock_v1.svg */
  "lock": { label: "密码锁", source: "ic_lock_v1.svg", elements: [
    { t: 'r', x: 5.35, y: 10.7, w: 13.3, h: 10.15, rx: 2 },
    { t: 'p', d: 'M8.05 10.7V7.25C8.05 5.05 9.8 3.25 12 3.25C14.2 3.25 15.95 5.05 15.95 7.25V10.7' },
    { t: 'p', d: 'M12 14.45V17.3' },
  ] },
  /** 退出登录 · ic_logout_v1.svg */
  "logout": { label: "退出登录", source: "ic_logout_v1.svg", elements: [
    { t: 'p', d: 'M11.15 4.35H5.7C4.5 4.35 3.55 5.3 3.55 6.5V17.5C3.55 18.7 4.5 19.65 5.7 19.65H11.15' },
    { t: 'p', d: 'M11.2 12H20.45M16.7 8.25L20.45 12L16.7 15.75' },
  ] },
  /** 更多 · ic_more_v1.svg */
  "more": { label: "更多", source: "ic_more_v1.svg", elements: [
    { t: 'c', cx: 5.35, cy: 12, r: 1.1, f: true },
    { t: 'c', cx: 12, cy: 12, r: 1.1, f: true },
    { t: 'c', cx: 18.65, cy: 12, r: 1.1, f: true },
  ] },
  /** 笔记 / 感言 · ic_note_v1.svg */
  "note": { label: "笔记 / 感言", source: "ic_note_v1.svg", elements: [
    { t: 'r', x: 4.45, y: 2.7, w: 15.1, h: 18.6, rx: 2.45 },
    { t: 'p', d: 'M8.15 8.15H15.85M8.15 12H15.85M8.15 15.85H13.4' },
  ] },
  /** 个人 / 用户 · ic_person_v1.svg */
  "person": { label: "个人 / 用户", source: "ic_person_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 8.1, r: 3.65 },
    { t: 'p', d: 'M4.55 20.2V18.35C4.55 14.7 7.55 12.9 12 12.9C16.45 12.9 19.45 14.7 19.45 18.35V20.2' },
  ] },
  /** 照片 · ic_photo_v1.svg */
  "photo": { label: "照片", source: "ic_photo_v1.svg", elements: [
    { t: 'r', x: 3.1, y: 4.65, w: 17.8, h: 14.7, rx: 2.3 },
    { t: 'c', cx: 15.65, cy: 9.2, r: 1.18, f: true },
    { t: 'p', d: 'M5.65 16.45L9.4 12.6L12.2 15.5L14.05 13.72L18.35 17.05' },
  ] },
  /** 播放 · ic_play_v1.svg */
  "play": { label: "播放", source: "ic_play_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 12, r: 8.55 },
    { t: 'p', d: 'M10.15 8.55L15.4 11.3C15.93 11.59 15.93 12.41 15.4 12.7L10.15 15.45C9.58 15.75 9.1 15.4 9.1 14.77V9.23C9.1 8.6 9.58 8.25 10.15 8.55Z' },
  ] },
  /** 重试 / 刷新 · ic_retry_refresh_v1.svg */
  "retry_refresh": { label: "重试 / 刷新", source: "ic_retry_refresh_v1.svg", elements: [
    { t: 'p', d: 'M19.45 9.2C18.3 5.85 15.45 4.45 12.1 4.45C7.85 4.45 4.4 7.9 4.4 12.15C4.4 16.4 7.85 19.85 12.1 19.85C15.4 19.85 18.3 17.75 19.3 14.65' },
    { t: 'p', d: 'M19.45 4.95V9.2H15.2' },
  ] },
  /** 保存 · ic_save_v1.svg */
  "save": { label: "保存", source: "ic_save_v1.svg", elements: [
    { t: 'p', d: 'M4.4 3.9H16.65L20.1 7.35V19.15C20.1 19.65 19.65 20.1 19.15 20.1H4.85C4.35 20.1 3.9 19.65 3.9 19.15V4.4C3.9 4.15 4.15 3.9 4.4 3.9Z' },
    { t: 'p', d: 'M7.4 3.9V9.2H16.6V4M7.3 20.1V13.8H16.7V20.1' },
  ] },
  /** 搜索 · ic_search_v1.svg */
  "search": { label: "搜索", source: "ic_search_v1.svg", elements: [
    { t: 'c', cx: 10.65, cy: 10.65, r: 6.15 },
    { t: 'p', d: 'M15.25 15.25L20.5 20.5' },
  ] },
  /** 已选中 · ic_selected_check_v1.svg */
  "selected_check": { label: "已选中", source: "ic_selected_check_v1.svg", elements: [
    { t: 'r', x: 3.4, y: 3.4, w: 17.2, h: 17.2, rx: 3.1 },
    { t: 'p', d: 'M7.8 12.15L10.7 15.05L16.5 9.25' },
  ] },
  /** 分享 · ic_share_v1.svg */
  "share": { label: "分享", source: "ic_share_v1.svg", elements: [
    { t: 'p', d: 'M12 15.25V3.5M7.65 7.85L12 3.5L16.35 7.85' },
    { t: 'p', d: 'M4.45 12.1V18.25C4.45 19.35 5.35 20.25 6.45 20.25H17.55C18.65 20.25 19.55 19.35 19.55 18.25V12.1' },
  ] },
  /** 鱼种 · ic_species_v1.svg */
  "species": { label: "鱼种", source: "ic_species_v1.svg", elements: [
    { t: 'p', d: 'M5.3 12C7.65 8.9 10.75 7.25 14.4 7.7C17.25 8.05 19.15 10.15 20.4 12C19.15 13.85 17.25 15.95 14.4 16.3C10.75 16.75 7.65 15.1 5.3 12Z' },
    { t: 'p', d: 'M5.3 12L2.7 8.4V15.6L5.3 12Z' },
    { t: 'p', d: 'M14.65 7.9C13.9 10.15 13.9 13.85 14.65 16.1' },
    { t: 'c', cx: 17.45, cy: 11.2, r: 0.75, f: true },
  ] },
  /** 成功 / 完成 · ic_success_v1.svg */
  "success": { label: "成功 / 完成", source: "ic_success_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 12, r: 8.65 },
    { t: 'p', d: 'M7.7 12.1L10.65 15.05L16.7 9' },
  ] },
  /** 时间 · ic_time_v1.svg */
  "time": { label: "时间", source: "ic_time_v1.svg", elements: [
    { t: 'c', cx: 12, cy: 12, r: 8.55 },
    { t: 'p', d: 'M12 7.25V12L15.45 14.2' },
  ] },
  /** 视频 · ic_video_v1.svg */
  "video": { label: "视频", source: "ic_video_v1.svg", elements: [
    { t: 'r', x: 3.1, y: 6.35, w: 12.15, h: 11.3, rx: 2.2 },
    { t: 'p', d: 'M15.25 10.05L19.55 7.9C20.18 7.58 20.9 8.04 20.9 8.75V15.25C20.9 15.96 20.18 16.42 19.55 16.1L15.25 13.95' },
  ] },
  /** 隐藏密码 · ic_visibility_off_v1.svg */
  "visibility_off": { label: "隐藏密码", source: "ic_visibility_off_v1.svg", elements: [
    { t: 'p', d: 'M5 9.1C3.95 9.95 3.15 10.9 2.7 12C5.3 15.75 8.35 17.65 12 17.65C13.55 17.65 15.1 17.25 16.5 16.5' },
    { t: 'p', d: 'M19 14.9C20.05 14.05 20.85 13.1 21.3 12C18.7 8.25 15.65 6.35 12 6.35C10.45 6.35 8.9 6.75 7.5 7.5' },
    { t: 'p', d: 'M9.7 9.7A3.25 3.25 0 0 0 14.3 14.3M4.1 4.1L19.9 19.9' },
  ] },
  /** 显示密码 · ic_visibility_v1.svg */
  "visibility": { label: "显示密码", source: "ic_visibility_v1.svg", elements: [
    { t: 'p', d: 'M2.7 12C5.3 8.25 8.35 6.35 12 6.35S18.7 8.25 21.3 12C18.7 15.75 15.65 17.65 12 17.65S5.3 15.75 2.7 12Z' },
    { t: 'c', cx: 12, cy: 12, r: 2.55 },
  ] },
  /** 语音 · ic_voice_v1.svg */
  "voice": { label: "语音", source: "ic_voice_v1.svg", elements: [
    { t: 'r', x: 9.45, y: 3.3, w: 5.1, h: 10.1, rx: 2.55 },
    { t: 'p', d: 'M6.95 10.85V11.45C6.95 14.34 9.15 16.65 12 16.65C14.85 16.65 17.05 14.34 17.05 11.45V10.85' },
    { t: 'p', d: 'M12 16.65V20.45M9.15 20.45H14.85' },
  ] },
  /** 警告 · ic_warning_v1.svg */
  "warning": { label: "警告", source: "ic_warning_v1.svg", elements: [
    { t: 'p', d: 'M10.15 4.6C10.95 3.2 13.05 3.2 13.85 4.6L21.05 17.45C21.8 18.8 20.8 20.45 19.25 20.45H4.75C3.2 20.45 2.2 18.8 2.95 17.45L10.15 4.6Z' },
    { t: 'p', d: 'M12 9.3V13.65' },
    { t: 'c', cx: 12, cy: 16.85, r: 0.95, f: true },
  ] },
  /** 天气 · ic_weather_v1.svg */
  "weather": { label: "天气", source: "ic_weather_v1.svg", elements: [
    { t: 'p', d: 'M4.45 9.55A3.65 3.65 0 0 1 11.3 7.15' },
    { t: 'p', d: 'M7.9 2.25V3.25M2.55 5.6L3.4 6.15M12.75 3.5L12.05 4.35' },
    { t: 'p', d: 'M7.1 20H17.9C19.83 20 21.4 18.43 21.4 16.5S19.83 13 17.9 13C17.55 13 17.23 13.05 16.93 13.15C16.32 11.27 14.59 9.95 12.55 9.95C10.08 9.95 8.06 11.83 7.81 14.24C5.89 14.17 4.4 15.51 4.4 17.12C4.4 18.71 5.61 20 7.1 20Z' },
  ] },
  /** 重量 · ic_weight_v1.svg */
  "weight": { label: "重量", source: "ic_weight_v1.svg", elements: [
    { t: 'p', d: 'M9.25 8.2V6.95a2.75 2.75 0 1 1 5.5 0V8.2' },
    { t: 'p', d: 'M8.2 8.2H15.8C17.79 8.2 19.4 9.81 19.4 11.8V14.9C19.4 17.16 17.56 19 15.3 19H8.7C6.44 19 4.6 17.16 4.6 14.9V11.8C4.6 9.81 6.21 8.2 8.2 8.2Z' },
    { t: 'p', d: 'M12 11.2V14.6' },
    { t: 'p', d: 'M10.8 12.4H13.2' },
  ] },
} as const satisfies Record<string, IconDef>;
