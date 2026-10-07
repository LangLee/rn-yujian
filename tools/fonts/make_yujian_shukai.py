#!/usr/bin/env python3
"""Subset + embolden (outline dilation) Ma Shan Zheng into YuJianShuKai for 渔见 empty-home hero."""
import sys, os
import pyclipper
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.basePen import BasePen

SRC = "/tmp/MaShanZheng-Regular.ttf"
OUT = sys.argv[1]
OFFSET_RATIO = float(sys.argv[2]) if len(sys.argv) > 2 else 0.042
TEXT = "现在，轮到你记录第一条鱼。！？、；：…—·「」《》"

SC = 1000  # pyclipper coordinate scale for offset precision

class FlattenPen(BasePen):
    """Collect flattened polygons (list of point lists) from a glyph draw()."""
    def __init__(self, glyphSet):
        super().__init__(glyphSet)
        self.polys, self._cur = [], None
    def _moveTo(self, p):
        self._cur = [p]
    def _lineTo(self, p):
        if self._cur is not None:
            self._cur.append(p)
    def _curveToOne(self, p1, p2, p3):
        # cubic -> sample 12 segments
        p0 = self._cur[-1]
        for i in range(1, 13):
            t = i / 12
            mt = 1 - t
            x = mt*mt*mt*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t*t*t*p3[0]
            y = mt*mt*mt*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t*t*t*p3[1]
            self._cur.append((x, y))
    def _qCurveToOne(self, p1, p2):
        p0 = self._cur[-1]
        for i in range(1, 13):
            t = i / 12
            mt = 1 - t
            x = mt*mt*p0[0] + 2*mt*t*p1[0] + t*t*p2[0]
            y = mt*mt*p0[1] + 2*mt*t*p1[1] + t*t*p2[1]
            self._cur.append((x, y))
    def _closePath(self):
        if self._cur and len(self._cur) > 2:
            self.polys.append(self._cur)
        self._cur = None
    def _endPath(self):
        self._cur = None

def dilate(polys, delta_units):
    pc = pyclipper.PyclipperOffset()
    pc.AddPaths([[(round(x*SC), round(y*SC)) for (x, y) in p] for p in polys], pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
    solution = pc.Execute(delta_units * SC)
    out = []
    for path in solution:
        pts = [(x/SC, y/SC) for (x, y) in path]
        if len(pts) > 2:
            out.append(pts)
    return out

font = TTFont(SRC)
upem = font["head"].unitsPerEm
offset = round(upem * OFFSET_RATIO)

opts = subset.Options()
opts.text = TEXT
opts.name_IDs = ["*"]
opts.notdef_outline = True
opts.drop_tables += ["DSIG"]
ss = subset.Subsetter(opts)
ss.populate(text=TEXT)
ss.subset(font)

gs = font.getGlyphSet()
glyf = font["glyf"]
count = 0
for name in font.getGlyphOrder():
    pen = FlattenPen(gs)
    gs[name].draw(pen)
    if not pen.polys:
        continue
    dilated = dilate(pen.polys, offset)
    if not dilated:
        continue
    tp = TTGlyphPen(gs)
    for poly in dilated:
        tp.moveTo((round(poly[0][0]), round(poly[0][1])))
        for (x, y) in poly[1:]:
            tp.lineTo((round(x), round(y)))
        tp.closePath()
    glyf[name] = tp.glyph()
    count += 1

FAMILY = "YuJianShuKai"
name_table = font["name"]
FULL = "YuJian Shu Kai (based on Ma Shan Zheng)"
for nid, val in ((1, FAMILY), (3, f"{FAMILY}-Regular"), (4, FULL), (6, f"{FAMILY}-Regular"), (16, FAMILY), (17, "Regular")):
    name_table.setName(val, nid, 3, 1, 0x409)
    name_table.setName(val, nid, 1, 0, 0)

font.save(OUT)
print(f"saved {OUT}: {os.path.getsize(OUT)} bytes, upem={upem}, offset={offset}u, boldened={count}, kept={len(font.getGlyphOrder())}")
