import React from 'react';
import { Image, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/Ionicons';
import { RemoteImage } from '../../components/RemoteImage';
import { FishGlyph } from '../../components/ui/FishGlyph';
import { environmentBackgrounds } from '../../constants/environmentAssets';
import { font, fs } from '../../constants/tokens';
import { ShareWork } from '../../services/shareWorkService';
import { ShareSnapshotFish } from '../../services/shareWorkService';

/**
 * 分享海报画布（战绩卡 / 水边故事，分享结果01 / 02 高保真稿）。
 * 纯函数渲染：输入 ShareWork 快照 + 目标宽度，输出与主题无关的海报视图，
 * 生成预览、最终作品、我的作品列表缩略图共用同一实现，保证所见即所得。
 */

/** 海报高宽比（参考稿竖版构图；内容预算按此校准，避免裁切） */
export const POSTER_ASPECT = 1.55;

const INK = '#1E3A49';
const INK_SOFT = 'rgba(30,58,73,0.72)';
const GOLD = '#C9A25E';
const GOLD_DEEP = '#A8823E';
const PAPER_INK = '#33424A';

interface PosterCanvasProps {
  work: ShareWork;
  width: number;
  authToken?: string | null;
}

export const PosterCanvas: React.FC<PosterCanvasProps> = ({ work, width, authToken }) => {
  const u = (n: number): number => Math.round((n / 375) * width * 100) / 100;
  if (work.templateId === 'story') {
    return <StoryPoster work={work} width={width} u={u} authToken={authToken ?? null} />;
  }
  return <ScorePoster work={work} width={width} u={u} authToken={authToken ?? null} />;
};

type Scale = (n: number) => number;

// ---------------------------------------------------------------------------
// 共用小件
// ---------------------------------------------------------------------------

/** 鱼获照片：无照片时用鱼 Glyph + 鱼名兜底，不白屏。 */
const CatchPhoto: React.FC<{
  uri: string | null;
  authToken: string | null;
  name: string;
  u: Scale;
  fontSize?: number;
}> = ({ uri, authToken, name, u, fontSize }) =>
  uri ? (
    <RemoteImage
      url={uri}
      authToken={authToken}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  ) : (
    <View style={[StyleSheet.absoluteFill, styles.photoFallback]}>
      <FishGlyph size={u(fontSize ?? fs(30))} color={GOLD} opacity={0.9} />
      <Text style={[styles.photoFallbackText, { fontSize: fs(u(10)) }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );

/** 手写体随记（衬线斜体 + 金色小笔触）。 */
const HandNote: React.FC<{ text: string; u: Scale; color?: string; align?: 'left' | 'right' }> = ({
  text,
  u,
  color = INK_SOFT,
  align = 'right',
}) => (
  <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
    <Text
      style={[
        styles.handNote,
        {
          color,
          fontSize: fs(u(12)),
          lineHeight: u(19),
          textAlign: align,
          transform: [{ rotate: '-2deg' }],
        },
      ]}
    >
      {text}
    </Text>
    <View
      style={{
        width: u(46),
        height: u(3),
        borderRadius: u(2),
        backgroundColor: 'rgba(201,162,94,0.65)',
        marginTop: u(4),
        transform: [{ rotate: '-3deg' }],
      }}
    />
  </View>
);

const BrandFooter: React.FC<{ u: Scale; ink?: string }> = ({ u, ink = INK }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[styles.brandName, { color: ink, fontSize: fs(u(17)), letterSpacing: u(6) }]}>
      渔见
    </Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(8), marginTop: u(5) }}>
      <View style={{ width: u(26), height: StyleSheet.hairlineWidth, backgroundColor: ink, opacity: 0.5 }} />
      <Text style={[styles.brandSlogan, { color: ink, fontSize: fs(u(9)), letterSpacing: u(2) }]}>
        遇见更大的水域
      </Text>
      <View style={{ width: u(26), height: StyleSheet.hairlineWidth, backgroundColor: ink, opacity: 0.5 }} />
    </View>
  </View>
);

const sizeText = (fish: ShareSnapshotFish): string => {
  const parts: string[] = [];
  if (fish.lengthCm != null) {
    parts.push(`${Number.isInteger(fish.lengthCm) ? fish.lengthCm : fish.lengthCm.toFixed(1)}cm`);
  }
  if (fish.weightKg != null) {
    parts.push(`${fish.weightKg}kg`);
  }
  return parts.join(' · ');
};

// ---------------------------------------------------------------------------
// 战绩卡（分享结果01）
// ---------------------------------------------------------------------------

const ScorePoster: React.FC<{
  work: ShareWork;
  width: number;
  u: Scale;
  authToken: string | null;
}> = ({ work, width, u, authToken }) => {
  const variant = ((work.layoutIndex % 3) + 3) % 3;
  const top = work.top;
  const hero = top[0] ?? null;
  const secondRow = top.slice(1, 3);

  return (
    <View style={[styles.poster, { width, borderRadius: u(18), overflow: 'hidden' }]}>
      {/* 环境底图 + 可读性 Scrim */}
      <Image
        source={environmentBackgrounds.day}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="scoreScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FDFEFF" stopOpacity="0.86" />
            <Stop offset="0.34" stopColor="#F4FAFC" stopOpacity="0.6" />
            <Stop offset="0.72" stopColor="#D8E9EC" stopOpacity="0.34" />
            <Stop offset="1" stopColor="#0E2833" stopOpacity="0.42" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#scoreScrim)" />
      </Svg>

      <View style={{ padding: u(20), height: width * POSTER_ASPECT }}>
        {/* 头部：标题 + 随记 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: u(8) }}>
            <Text style={[styles.scoreTitle, { color: INK, fontSize: fs(u(34)), letterSpacing: u(2) }]}>
              {work.title}
            </Text>
            <View
              style={{
                width: u(120),
                height: u(5),
                borderRadius: u(3),
                backgroundColor: 'rgba(201,162,94,0.8)',
                marginTop: u(2),
                marginBottom: u(8),
                transform: [{ rotate: '-1deg' }],
              }}
            />
            <Text style={[styles.scoreMeta, { color: INK_SOFT, fontSize: fs(u(14)) }]}>
              {work.rangeLabel}
            </Text>
            {work.location ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(3), marginTop: u(3) }}>
                <Icon name="location" size={u(12)} color={GOLD_DEEP} />
                <Text style={[styles.scoreMeta, { color: INK_SOFT, fontSize: fs(u(12)) }]}>
                  {work.location}
                </Text>
              </View>
            ) : null}
          </View>
          <HandNote text={'每一次出发，\n都是与自然的相遇。'} u={u} />
        </View>

        {variant === 2 ? <PhotoStrip work={work} u={u} authToken={authToken} marginTop={u(12)} /> : null}

        {/* 统计玻璃面板 */}
        <View
          style={[
            styles.scoreStats,
            {
              borderRadius: u(14),
              paddingVertical: u(10),
              paddingHorizontal: u(14),
              marginTop: u(12),
            },
          ]}
        >
          <StatCell u={u} value={`${work.count}`} label="尾鱼获" />
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(30,58,73,0.18)' }} />
          <StatCell u={u} value={`${work.speciesCount}`} label="种鱼" />
          <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(30,58,73,0.18)' }} />
          <View style={{ flex: 1.35 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(3) }}>
              <Icon name="trophy" size={u(12)} color={GOLD_DEEP} />
              <Text style={[styles.scoreMeta, { color: GOLD_DEEP, fontSize: fs(u(11)) }]}>最大鱼获</Text>
            </View>
            <Text
              style={[styles.scoreFishName, { color: INK, fontSize: fs(u(16)), marginTop: u(2) }]}
              numberOfLines={1}
            >
              {work.biggest?.name ?? '—'}
            </Text>
            <Text style={[styles.scoreMeta, { color: INK_SOFT, fontSize: fs(u(11)) }]}>
              {work.biggest ? sizeText(work.biggest) || '—' : '—'}
            </Text>
          </View>
        </View>

        {/* TOP 1 主鱼 */}
        {hero ? (
          <View style={{ marginTop: u(12), alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(4), marginBottom: u(6) }}>
              <Icon name="ribbon" size={u(14)} color={GOLD_DEEP} />
              <Text style={[styles.topBadgeText, { color: GOLD_DEEP, fontSize: fs(u(14)) }]}>TOP 1</Text>
            </View>
            <View
              style={{
                width: variant === 1 ? u(244) : u(228),
                height: variant === 1 ? u(108) : u(98),
                borderRadius: u(12),
                borderWidth: u(3),
                borderColor: '#FFFFFF',
                overflow: 'hidden',
                backgroundColor: '#EAF2F1',
                shadowColor: '#0E2833',
                shadowOpacity: 0.22,
                shadowRadius: u(10),
                shadowOffset: { width: 0, height: u(5) },
                elevation: 6,
              }}
            >
              <CatchPhoto uri={hero.imageUri} authToken={authToken} name={hero.name} u={u} fontSize={fs(40)} />
            </View>
            <Text style={[styles.scoreFishName, { color: INK, fontSize: fs(u(15)), marginTop: u(6) }]}>
              {hero.name}
            </Text>
            <Text style={[styles.scoreMeta, { color: INK_SOFT, fontSize: fs(u(11)), marginTop: u(1) }]}>
              {sizeText(hero) || `${hero.count} 尾`}
            </Text>
          </View>
        ) : null}

        {/* TOP 2 / TOP 3（布局 2 用照片条替代，控制竖向预算） */}
        {variant !== 2 && secondRow.length ? (
          <View style={{ flexDirection: 'row', gap: u(14), marginTop: u(10), paddingHorizontal: u(6) }}>
            {secondRow.map((fish, index) => (
              <View key={`${fish.name}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
                <View
                  style={{
                    width: '100%',
                    height: u(58),
                    borderRadius: u(10),
                    borderWidth: u(2.5),
                    borderColor: '#FFFFFF',
                    overflow: 'hidden',
                    backgroundColor: '#EAF2F1',
                    shadowColor: '#0E2833',
                    shadowOpacity: 0.16,
                    shadowRadius: u(6),
                    shadowOffset: { width: 0, height: u(3) },
                    elevation: 4,
                  }}
                >
                  <CatchPhoto uri={fish.imageUri} authToken={authToken} name={fish.name} u={u} fontSize={fs(22)} />
                </View>
                <Text style={[styles.topBadgeText, { color: INK_SOFT, fontSize: fs(u(10)), marginTop: u(4) }]}>
                  TOP {index + 2}
                </Text>
                <Text style={[styles.scoreFishName, { color: INK, fontSize: fs(u(12)), marginTop: u(1) }]} numberOfLines={1}>
                  {fish.name}
                </Text>
                <Text style={[styles.scoreMeta, { color: INK_SOFT, fontSize: fs(u(10)) }]}>
                  {sizeText(fish) || `${fish.count} 尾`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* 其他鱼获 */}
        {work.others.length ? (
          <View
            style={[
              styles.othersPanel,
              {
                borderRadius: u(12),
                paddingVertical: u(8),
                paddingHorizontal: u(12),
                marginTop: u(10),
              },
            ]}
          >
            <Text style={[styles.scoreMeta, { color: INK, fontSize: fs(u(12)), fontWeight: '700' }]}>
              其他鱼获：
            </Text>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' }}>
              {work.others.slice(0, 4).map((fish, index) => (
                <View key={`${fish.name}-${index}`} style={{ alignItems: 'center', gap: u(2) }}>
                  <View style={{ width: u(44), height: u(20), justifyContent: 'center', alignItems: 'center' }}>
                    {fish.imageUri ? (
                      <View style={{ width: u(40), height: u(20), borderRadius: u(5), overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF' }}>
                        <CatchPhoto uri={fish.imageUri} authToken={authToken} name={fish.name} u={u} fontSize={fs(12)} />
                      </View>
                    ) : (
                      <FishGlyph size={u(22)} color={GOLD_DEEP} opacity={0.85} />
                    )}
                  </View>
                  <Text style={[styles.scoreMeta, { color: INK, fontSize: fs(u(10)) }]}>
                    {fish.name} ×{fish.count}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 品牌落款 */}
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: u(2) }}>
          <BrandFooter u={u} ink="#F2F7F7" />
        </View>
      </View>
    </View>
  );
};

const StatCell: React.FC<{ u: Scale; value: string; label: string }> = ({ u, value, label }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={[styles.scoreStatValue, { color: INK, fontSize: fs(u(26)) }]}>{value}</Text>
    <Text style={[styles.scoreMeta, { color: INK_SOFT, fontSize: fs(u(11)) }]}>{label}</Text>
  </View>
);

const PhotoStrip: React.FC<{
  work: ShareWork;
  u: Scale;
  authToken: string | null;
  marginTop: number;
}> = ({ work, u, authToken, marginTop }) => (
  <View style={{ flexDirection: 'row', gap: u(8), marginTop }}>
    {[0, 1, 2].map((index) => (
      <View
        key={index}
        style={{
          flex: 1,
          height: u(64),
          borderRadius: u(9),
          borderWidth: u(2),
          borderColor: '#FFFFFF',
          overflow: 'hidden',
          backgroundColor: '#EAF2F1',
        }}
      >
        <CatchPhoto
          uri={work.photoUris[index] ?? null}
          authToken={authToken}
          name={work.top[index]?.name ?? '渔见'}
          u={u}
          fontSize={fs(18)}
        />
      </View>
    ))}
  </View>
);

// ---------------------------------------------------------------------------
// 水边故事（分享结果02）
// ---------------------------------------------------------------------------

const StoryPoster: React.FC<{
  work: ShareWork;
  width: number;
  u: Scale;
  authToken: string | null;
}> = ({ work, width, u, authToken }) => {
  const variant = ((work.layoutIndex % 3) + 3) % 3;
  const photos = [work.photoUris[0] ?? null, work.photoUris[1] ?? work.photoUris[0] ?? null];
  const biggest = work.biggest;
  const storyText =
    work.story?.trim() ||
    (work.count > 0
      ? `这一天收获了 ${work.count} 条鱼，湖水记住了每一次咬钩。`
      : '每一次出发，都有新的故事。');

  return (
    <View style={[styles.poster, { width, borderRadius: u(18), overflow: 'hidden' }]}>
      <Image
        source={environmentBackgrounds.sunset}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="storyScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FBF7EE" stopOpacity="0.82" />
            <Stop offset="0.4" stopColor="#F6EFE0" stopOpacity="0.5" />
            <Stop offset="0.78" stopColor="#E8DCC4" stopOpacity="0.36" />
            <Stop offset="1" stopColor="#2C3630" stopOpacity="0.5" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#storyScrim)" />
      </Svg>

      <View style={{ padding: u(20), height: width * POSTER_ASPECT }}>
        {/* 头部 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.storyTitle, { color: PAPER_INK, fontSize: fs(u(33)), letterSpacing: u(3) }]}>
              水边故事
            </Text>
            <View
              style={{
                width: u(132),
                height: u(5),
                borderRadius: u(3),
                backgroundColor: 'rgba(201,162,94,0.8)',
                marginTop: u(2),
                marginBottom: u(8),
                transform: [{ rotate: '-1.2deg' }],
              }}
            />
            <Text style={[styles.scoreMeta, { color: 'rgba(51,66,74,0.8)', fontSize: fs(u(12)) }]}>
              {work.rangeLabel}
              {work.location ? ` ｜ ${work.location}` : ''}
            </Text>
          </View>
          <HandNote text={'有些相遇，\n总发生在水岸之间。'} u={u} color="rgba(51,66,74,0.72)" />
        </View>

        {/* 拍立得照片区：三种布局变体 */}
        {variant === 0 ? (
          <View style={{ flexDirection: 'row', gap: u(12), marginTop: u(14), height: u(178) }}>
            <Polaroid
              u={u}
              authToken={authToken}
              uri={photos[0]}
              name={work.top[0]?.name ?? '这次的鱼'}
              rotate="-2.4deg"
              style={{ flex: 1.08 }}
            >
              <View style={[styles.storyChip, { borderRadius: u(8), paddingVertical: u(4), paddingHorizontal: u(9) }]}>
                <Text style={[styles.storyChipText, { fontSize: fs(u(12)), color: PAPER_INK }]}>
                  {work.count} 尾鱼获
                </Text>
              </View>
            </Polaroid>
            <Polaroid
              u={u}
              authToken={authToken}
              uri={photos[1]}
              name={work.top[1]?.name ?? biggest?.name ?? '水边的时光'}
              rotate="2deg"
              style={{ flex: 1 }}
            >
              <View style={[styles.storyChip, { borderRadius: u(8), paddingVertical: u(4), paddingHorizontal: u(9), alignSelf: 'flex-end' }]}>
                <Text style={[styles.storyChipText, { fontSize: fs(u(11)), color: PAPER_INK }]}>
                  {work.speciesCount} 种鱼
                </Text>
              </View>
              {biggest?.weightKg ? (
                <View style={[styles.storyChip, { borderRadius: u(8), paddingVertical: u(4), paddingHorizontal: u(9), marginTop: u(5) }]}>
                  <Text style={[styles.storyChipText, { fontSize: fs(u(11)), color: PAPER_INK }]} numberOfLines={1}>
                    最大 {biggest.name} {biggest.weightKg}kg
                  </Text>
                </View>
              ) : null}
            </Polaroid>
          </View>
        ) : variant === 1 ? (
          <View style={{ marginTop: u(14), height: u(178) }}>
            <Polaroid
              u={u}
              authToken={authToken}
              uri={photos[0]}
              name={work.top[0]?.name ?? '这次的鱼'}
              rotate="1.6deg"
              style={{ width: '76%', height: u(112), alignSelf: 'flex-start' }}
            >
              <View style={[styles.storyChip, { borderRadius: u(8), paddingVertical: u(4), paddingHorizontal: u(9) }]}>
                <Text style={[styles.storyChipText, { fontSize: fs(u(11)), color: PAPER_INK }]} numberOfLines={1}>
                  {work.count} 尾鱼获 · {work.speciesCount} 种鱼
                </Text>
              </View>
            </Polaroid>
            <View style={{ flexDirection: 'row', gap: u(10), marginTop: u(-30), paddingHorizontal: u(12) }}>
              <Polaroid
                u={u}
                authToken={authToken}
                uri={photos[1]}
                name={work.top[1]?.name ?? biggest?.name ?? '水边的时光'}
                rotate="-2deg"
                style={{ flex: 1, height: u(88) }}
              />
              <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: u(4) }}>
                {biggest?.weightKg ? (
                  <View style={[styles.storyChip, { borderRadius: u(8), paddingVertical: u(5), paddingHorizontal: u(10), alignSelf: 'flex-start' }]}>
                    <Text style={[styles.storyChipText, { fontSize: fs(u(11)), color: PAPER_INK }]} numberOfLines={1}>
                      最大鱼获 {biggest.name} {biggest.weightKg}kg
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', marginTop: u(14), height: u(178) }}>
            <Polaroid
              u={u}
              authToken={authToken}
              uri={photos[0]}
              name={work.top[0]?.name ?? '这次的鱼'}
              rotate="-1.2deg"
              style={{ width: '84%', height: u(120), flex: 0 }}
            >
              <View style={[styles.storyChip, { borderRadius: u(8), paddingVertical: u(4), paddingHorizontal: u(9) }]}>
                <Text style={[styles.storyChipText, { fontSize: fs(u(11)), color: PAPER_INK }]} numberOfLines={1}>
                  {work.count} 尾鱼获 · {work.speciesCount} 种鱼
                </Text>
              </View>
            </Polaroid>
            <View style={{ marginTop: u(-32), transform: [{ rotate: '2.2deg' }] }}>
              <View style={{ width: u(116), height: u(68), borderRadius: u(8), borderWidth: u(3), borderColor: '#FFFFFF', overflow: 'hidden', backgroundColor: '#F2EDE2' }}>
                <CatchPhoto uri={photos[1]} authToken={authToken} name={work.top[1]?.name ?? biggest?.name ?? '水边'} u={u} fontSize={fs(22)} />
              </View>
            </View>
          </View>
        )}

        {/* 这次遇见 */}
        <View
          style={[
            styles.othersPanel,
            {
              borderRadius: u(12),
              paddingVertical: u(8),
              paddingHorizontal: u(12),
              marginTop: u(12),
              flexDirection: 'row',
              alignItems: 'center',
              gap: u(10),
            },
          ]}
        >
          <Text style={[styles.storyMeetTitle, { fontSize: fs(u(14)), color: PAPER_INK }]}>
            这次遇见
          </Text>
          <View style={{ width: StyleSheet.hairlineWidth, height: u(22), backgroundColor: 'rgba(51,66,74,0.25)' }} />
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: u(8) }}>
            {work.top.concat(work.others).slice(0, 3).map((fish, index) => (
              <View key={`${fish.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: u(4) }}>
                {fish.imageUri ? (
                  <View style={{ width: u(34), height: u(20), borderRadius: u(5), overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF' }}>
                    <CatchPhoto uri={fish.imageUri} authToken={authToken} name={fish.name} u={u} fontSize={fs(12)} />
                  </View>
                ) : (
                  <FishGlyph size={u(20)} color={GOLD_DEEP} opacity={0.85} />
                )}
                <Text style={[styles.storyChipText, { fontSize: fs(u(12)), color: PAPER_INK }]}>
                  {fish.name} ×{fish.count}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 我的记录 */}
        <View
          style={[
            styles.storyNote,
            {
              borderRadius: u(12),
              padding: u(12),
              marginTop: u(10),
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(5) }}>
            <Icon name="book-outline" size={u(13)} color={PAPER_INK} />
            <Text style={[styles.storyChipText, { fontSize: fs(u(12)), color: PAPER_INK, fontWeight: '700' }]}>
              我的记录
            </Text>
          </View>
          <Text style={[styles.storyNoteText, { fontSize: fs(u(13)), lineHeight: u(21), marginTop: u(6) }]} numberOfLines={3}>
            {storyText}
          </Text>
          <Text
            style={[
              styles.handNote,
              {
                color: 'rgba(51,66,74,0.5)',
                fontSize: fs(u(11)),
                textAlign: 'right',
                marginTop: u(4),
                transform: [{ rotate: '-1.5deg' }],
              },
            ]}
          >
            在湖边，总有新的故事。
          </Text>
        </View>

        {/* 品牌落款 */}
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: u(2) }}>
          <BrandFooter u={u} ink="rgba(255,251,240,0.94)" />
        </View>
      </View>
    </View>
  );
};

/** 白边拍立得照片卡：底部可叠信息 chip。 */
const Polaroid: React.FC<{
  u: Scale;
  authToken: string | null;
  uri: string | null;
  name: string;
  rotate: `${number}deg`;
  style?: ViewStyle;
  children?: React.ReactNode;
}> = ({ u, authToken, uri, name, rotate, style, children }) => (
  <View
    style={[
      {
        flex: 1,
        borderRadius: u(10),
        borderWidth: u(3.5),
        borderColor: '#FFFFFF',
        backgroundColor: '#F2EDE2',
        overflow: 'hidden',
        transform: [{ rotate }],
        shadowColor: '#3A3226',
        shadowOpacity: 0.22,
        shadowRadius: u(8),
        shadowOffset: { width: 0, height: u(4) },
        elevation: 5,
      },
      style,
    ]}
  >
    <View style={{ width: '100%', height: '100%' }}>
      <CatchPhoto uri={uri} authToken={authToken} name={name} u={u} fontSize={fs(26)} />
    </View>
    {children ? (
      <View style={{ position: 'absolute', left: u(7), bottom: u(7), right: u(7) }}>{children}</View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  poster: {
    backgroundColor: '#E8F0EF',
  } as ViewStyle,
  scoreTitle: {
    fontFamily: font.serif,
    fontWeight: '700',
  } as TextStyle,
  storyTitle: {
    fontFamily: font.serif,
    fontWeight: '700',
  } as TextStyle,
  scoreMeta: {
    fontWeight: '500',
  } as TextStyle,
  scoreStatValue: {
    fontFamily: font.serif,
    fontWeight: '700',
  } as TextStyle,
  scoreFishName: {
    fontFamily: font.serif,
    fontWeight: '700',
  } as TextStyle,
  topBadgeText: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontWeight: '700',
    letterSpacing: 1,
  } as TextStyle,
  scoreStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#0E2833',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  } as ViewStyle,
  othersPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  } as ViewStyle,
  handNote: {
    fontFamily: font.serif,
    fontStyle: 'italic',
  } as TextStyle,
  storyChip: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  } as ViewStyle,
  storyChipText: {
    fontWeight: '600',
  } as TextStyle,
  storyMeetTitle: {
    fontFamily: font.serif,
    fontWeight: '700',
  } as TextStyle,
  storyNote: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  } as ViewStyle,
  storyNoteText: {
    color: PAPER_INK,
  } as TextStyle,
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3EDEA',
    gap: 4,
  } as ViewStyle,
  photoFallbackText: {
    color: INK_SOFT,
    fontWeight: '600',
  } as TextStyle,
  brandName: {
    fontFamily: font.serif,
    fontWeight: '700',
  } as TextStyle,
  brandSlogan: {
    fontWeight: '500',
  } as TextStyle,
});
