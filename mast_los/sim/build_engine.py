#!/usr/bin/env python3
"""src/*.js parçalarını tek bir IIFE motor dosyasına birleştirir (tarayıcı + Node)."""
import glob, os, sys
here = os.path.dirname(os.path.abspath(__file__))
parts = sorted(glob.glob(os.path.join(here, 'src', '[0-9][0-9]_*.js')))
body = '\n'.join(open(p, encoding='utf-8').read() for p in parts)
exports = [
    'D2R', 'R2D', 'TAU', 'URAD', 'DEGPH', 'DEGPSQH', 'RNG', 'makeRngFactory', 'fft', 'synthSeries', 'shapeLogGauss', 'shapeGauss',
    'Biquad', 'bqLP', 'bqHP', 'bqBP', 'Osc2', 'Ww', 'db', 'sq', 'logspace', 'linspace', 'sinc',
    'baseDefaults', 'dutDefaults', 'envDefaults', 'labDefaults', 'anaDefaults', 'defaultParams', 'cloneParams',
    'derive', 'loopModel', 'cabs', 'carg',
    'MECH_DEFAULT', 'MEAS_DEFAULT', 'hexLimitCheck', 'simIter', 'runSim',
    'aMean', 'aRms', 'aStd', 'aPctAbs', 'aMaxAbs', 'detrend', 'sineFit', 'welch', 'welchCSD', 'tfH1', 'bandRms', 'cumRms',
    'psdWeighting', 'allanDev', 'frameSeries', 'videoMetrics', 'applyEIS', 'delayEstimate', 'besselJ0', 'pdeStats', 'windowedWander',
]
extra_file = os.path.join(here, 'src', 'exports.txt')
if os.path.exists(extra_file):
    exports += [l.strip() for l in open(extra_file, encoding='utf-8') if l.strip() and not l.startswith('#')]
seen = []
for e in exports:
    if e not in seen:
        seen.append(e)
out = ("/* Optronik Mast LOS Jitter — sanal test düzeneği motoru (otomatik birleştirildi) */\n"
       "var LOSSIM = (function () {\n'use strict';\n" + body +
       "\nreturn {" + ', '.join(seen) + "};\n})();\n"
       "if (typeof module !== 'undefined' && module.exports) module.exports = LOSSIM;\n")
open(os.path.join(here, 'engine.js'), 'w', encoding='utf-8').write(out)
# tarayıcı: fabrika fonksiyonu (Function.toString ile Web Worker kaynağına da aktarılır)
outb = ("function LOSSIM_FACTORY() {\n'use strict';\n" + body +
        "\nreturn {" + ', '.join(seen) + "};\n}\n")
open(os.path.join(here, 'engine_browser.js'), 'w', encoding='utf-8').write(outb)
print('engine.js', len(out), 'bytes,', len(parts), 'parts,', len(seen), 'exports')
