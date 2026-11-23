#!/bin/sh
# v13.12 önhesap (§12 işletme ortamı ve proje gereksinimleri): değişen testler yalnız metin düzeyinde (T1.7 notu, T1.9'un PPV/σ Gauss
# beklentisi; T2.4 yalnız oturma gereksinimi girilince değişir) → denizaltı ve gemide T1.7 ve T1.9 yeniden; ek koşu (dalga çarpması
# dağılımı, taban döngüde B2-03 / B2-06, sürtünmesiz T2.4); V&V (G5 yeni); birleştirme. Tohum tekrarları ve işletme ayrıştırması değişmedi.
cd "$(dirname "$0")"
rm -f probe/pre1312_done.flag 2>/dev/null
node precompute.js tests T1.7,T1.9 > probe/pre1312_sub_tests.log 2>&1 && \
node precompute.js tests T1.7,T1.9 ship > probe/pre1312_ship_tests.log 2>&1 && \
node extra.js > probe/pre1312_extra.log 2>&1 && \
node vv.js > probe/pre1312_vv.log 2>&1 && \
node precompute.js vv > probe/pre1312_vvmerge.log 2>&1 && \
echo PRE1312_DONE > probe/pre1312_done.flag
