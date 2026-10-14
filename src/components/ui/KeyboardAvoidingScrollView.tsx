import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  TextInput,
} from 'react-native';

/**
 * 表单页键盘避让 ScrollView（登录 / 注册 / 修改密码 / 编辑资料共用）。
 *
 * - iOS（部署目标 15.1+）：沿用 ScrollView 原生 automaticallyAdjustKeyboardInsets——
 *   键盘弹出补 contentInset 并把聚焦输入框滚进可视区，跟随交互式收起手势；
 * - Android：MainActivity 开启 edge-to-edge（setDecorFitsSystemWindows(false)）后
 *   manifest 的 adjustResize 不再收缩根视图，键盘会直接盖住底部字段 —— 这里
 *   手动监听 keyboardDidShow/Hide：键盘高度计入内容底部内边距，并把聚焦输入框
 *   滚到键盘上方（已可见则不滚动），保证输入框永不被键盘遮挡。
 *
 * 字段侧通过 useEnsureInputVisible() 在 onFocus 时请求滚动，
 * 覆盖「键盘已开、回车跳下一栏」这类不触发键盘事件的焦点切换。
 */

/** 可测量宿主输入节点（TextInput.State.currentlyFocusedInput() 的返回形态） */
type MeasurableInput = {
  measure?: (cb: (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void) => void;
} | null;

/** 字段聚焦 → 请求滚动进键盘上方可视区（仅 Android 键盘弹出期间生效） */
export const KeyboardScrollContext = React.createContext<
  (input: MeasurableInput) => void
>(() => {});

export const useEnsureInputVisible = () => React.useContext(KeyboardScrollContext);

export const KeyboardAvoidingScrollView: React.FC<ScrollViewProps> = ({
  onLayout,
  onScroll,
  contentContainerStyle,
  children,
  ...rest
}) => {
  const scrollRef = useRef<ScrollView>(null);
  /* ScrollView 自身页面坐标边框与当前滚动偏移 */
  const frameRef = useRef({ y: 0, h: 0 });
  const offsetRef = useRef(0);
  const kbHeightRef = useRef(0);
  const [kbPadding, setKbPadding] = useState(0);

  /** 把聚焦输入框底部滚到键盘上方（约 28dp 呼吸位）；已可见则不动 */
  const ensureVisible = useCallback((input: MeasurableInput) => {
    if (Platform.OS !== 'android' || !kbHeightRef.current || !input?.measure) return;
    try {
      input.measure((_x, _y, _w, h, _pageX, pageY) => {
        const { y: svY, h: svH } = frameRef.current;
        const bottomInContent = pageY - svY + offsetRef.current + h;
        const wanted = bottomInContent + 28 - (svH - kbHeightRef.current);
        if (wanted > offsetRef.current) {
          scrollRef.current?.scrollTo({ y: Math.ceil(Math.max(0, wanted)), animated: true });
        }
      });
    } catch {
      /* 节点已卸载等测量失败：忽略，键盘内边距仍生效 */
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onShow = (e: KeyboardEvent) => {
      kbHeightRef.current = e.endCoordinates?.height ?? 0;
      setKbPadding(kbHeightRef.current);
      requestAnimationFrame(() =>
        ensureVisible(TextInput.State.currentlyFocusedInput() as unknown as MeasurableInput),
      );
    };
    const onHide = () => {
      kbHeightRef.current = 0;
      setKbPadding(0);
    };
    const show = Keyboard.addListener('keyboardDidShow', onShow);
    const hide = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ensureVisible]);

  /* 键盘期间在调用方原有底部内边距上叠加键盘高度（最后一栏可滚到键盘上方） */
  const basePadding = StyleSheet.flatten(contentContainerStyle)?.paddingBottom;
  const basePaddingNum = typeof basePadding === 'number' ? basePadding : 0;

  return (
    <KeyboardScrollContext.Provider value={ensureVisible}>
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => {
          frameRef.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
          onLayout?.(e);
        }}
        onScroll={(e) => {
          offsetRef.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        {...rest}
        contentContainerStyle={[
          contentContainerStyle,
          kbPadding > 0 ? { paddingBottom: basePaddingNum + kbPadding } : null,
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
};
