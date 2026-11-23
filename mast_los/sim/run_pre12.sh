#!/bin/sh
# v12 önhesap zinciri (pre.json'a sırayla yazar)
cd "$(dirname "$0")"
node precompute.js tests > probe/pre12_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre12_sub_op.log 2>&1 && \
node precompute.js play > probe/pre12_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre12_ship.log 2>&1 && \
node patch_seeds12.js > probe/pre12_seeds.log 2>&1 && \
node vv_seeds_agg.js > probe/pre12_agg.log 2>&1 && \
echo PRE12_DONE > probe/pre12_done.flag
