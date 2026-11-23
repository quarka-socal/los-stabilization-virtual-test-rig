#!/bin/sh
# v11 önhesap zinciri (pre.json'a sırayla yazar)
cd "$(dirname "$0")"
node precompute.js tests > probe/pre11_sub_tests.log 2>&1 && \
node precompute.js op > probe/pre11_sub_op.log 2>&1 && \
node precompute.js play > probe/pre11_sub_play.log 2>&1 && \
node precompute.js all ship > probe/pre11_ship.log 2>&1 && \
node patch_seeds11.js > probe/pre11_seeds.log 2>&1 && \
node vv_seeds_agg.js > probe/pre11_agg.log 2>&1 && \
echo PRE11_DONE > probe/pre11_done.flag
