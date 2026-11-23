#!/bin/sh
# v13.13 önhesap zinciri (§12 kararları: K1 (b) dalga çarpması genlik ölçeği Campbell beklentisine 2100 µrad — denizaltı işletmesi, oynatma,
# Sürdürme: ilk koşu işletme adımında kesildi.
# T2.4, tohum tekrarları ve ek koşular değişir; K3 (b) T1.7 gereksinimsiz BİLGİ — iki platform). Tam zincir (T0.7 tohum çalışması hariç).
# İki kulvar: A (pre.json: denizaltı testleri, işletme, oynatma, gemi; ek koşu) ve B (tohum tekrarları 1–4).
cd "$(dirname "$0")"
rm -f probe/pre1313_a.flag probe/pre1313_seeds.flag probe/pre1313_done.flag 2>/dev/null
( node vv_seeds.js 1 > probe/pre1313_seed1.log 2>&1 && node vv_seeds.js 2 > probe/pre1313_seed2.log 2>&1 && \
  node vv_seeds.js 3 > probe/pre1313_seed3.log 2>&1 && node vv_seeds.js 4 > probe/pre1313_seed4.log 2>&1 && \
  echo ok > probe/pre1313_seeds.flag ) &
# (denizaltı testleri ilk koşuda yazıldı; kalan adımlar)
node precompute.js op > probe/pre1313_sub_op.log 2>&1 && \
node precompute.js play > probe/pre1313_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre1313_ship.log 2>&1 && \
node extra.js > probe/pre1313_extra.log 2>&1 && \
echo ok > probe/pre1313_a.flag
while [ ! -f probe/pre1313_seeds.flag ] || [ ! -f probe/pre1313_a.flag ]; do sleep 20; done
node vv_seeds_agg.js > probe/pre1313_agg.log 2>&1 && \
node vv.js > probe/pre1313_vv.log 2>&1 && \
node precompute.js vv > probe/pre1313_vvmerge.log 2>&1 && \
echo PRE1313_DONE > probe/pre1313_done.flag
