import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LengthUnit, WeightUnit } from '../utils/formatters';

/**
 * 偏好编排（设计文档 13.2 / 13.4 / 18.5 Privacy Contract）：
 * 单位与偏好、隐私默认值、个人昵称。全部落 AsyncStorage。
 */
const STORAGE_KEY = '@yujian/preferences';

export type ShareLocationLevel = 'waterbody_county' | 'city' | 'precise' | 'none';
/** 私人鱼获位置记录精度（13.2：默认可精准记录） */
export type RecordPrecision = 'precise' | 'waterbody_county' | 'none';

export interface PrivacySettings {
  /** 私人鱼获位置记录精度 */
  recordPrecision: RecordPrecision;
  /** 分享位置默认级别：水域/区县级（默认） */
  shareLocationLevel: ShareLocationLevel;
  /** 分享照片自动移除 GPS / EXIF（默认移除） */
  stripPhotoGps: boolean;
  /** 保存鱼获时手动修改地点（默认允许） */
  manualLocationEdit: boolean;
}

/** 性别（个人资料）：male 男 / female 女 / secret 保密（默认） */
export type Gender = 'male' | 'female' | 'secret';

export interface PreferencesState {
  lengthUnit: LengthUnit;
  weightUnit: WeightUnit;
  privacy: PrivacySettings;
  /** 本地昵称覆盖（个人资料） */
  nickname: string;
  /** 头像（data URL，本地保存；空串为未设置，回退首字母） */
  avatar: string;
  /** 性别（个人资料） */
  gender: Gender;
  /** 个性签名（个人资料） */
  signature: string;
}

export const DEFAULT_PREFERENCES: PreferencesState = {
  lengthUnit: 'cm',
  weightUnit: 'kg',
  privacy: {
    recordPrecision: 'precise',
    shareLocationLevel: 'waterbody_county',
    stripPhotoGps: true,
    manualLocationEdit: true,
  },
  nickname: '',
  avatar: '',
  gender: 'secret',
  signature: '',
};

interface PreferencesContextType extends PreferencesState {
  setLengthUnit: (unit: LengthUnit) => void;
  setWeightUnit: (unit: WeightUnit) => void;
  setPrivacy: (patch: Partial<PrivacySettings>) => void;
  setNickname: (nickname: string) => void;
  setAvatar: (avatar: string) => void;
  setGender: (gender: Gender) => void;
  setSignature: (signature: string) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PreferencesState>(DEFAULT_PREFERENCES);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as Partial<PreferencesState>;
        setState((previous) => ({
          ...previous,
          ...parsed,
          privacy: { ...previous.privacy, ...(parsed.privacy ?? {}) },
        }));
      } catch {
        // 读取失败用默认值
      }
    })();
  }, []);

  const persist = useCallback((next: PreferencesState) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const update = useCallback(
    (patch: Partial<PreferencesState>) => {
      setState((previous) => {
        const next = { ...previous, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo<PreferencesContextType>(
    () => ({
      ...state,
      setLengthUnit: (lengthUnit) => update({ lengthUnit }),
      setWeightUnit: (weightUnit) => update({ weightUnit }),
      setPrivacy: (patch) =>
        setState((previous) => {
          const next = { ...previous, privacy: { ...previous.privacy, ...patch } };
          persist(next);
          return next;
        }),
      setNickname: (nickname) => update({ nickname }),
      setAvatar: (avatar) => update({ avatar }),
      setGender: (gender) => update({ gender }),
      setSignature: (signature) => update({ signature }),
    }),
    [state, update],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
};

export const usePreferences = (): PreferencesContextType => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
